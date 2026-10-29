// Camera for the globe, kept outside React state so per-frame motion never re-renders the panels.
// Moves use a critically damped spring (Apple's "duration + bounce: 0"): it keeps its current velocity when
// retargeted, so a second click mid-flight bends the path instead of restarting it. Flings decay like iOS scrolling.

export type View = { lon: number; lat: number; zoom: number }

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const wrapLon = (l: number) => ((l + 540) % 360) - 180
export const ZOOM_MIN = 0.7, ZOOM_MAX = 14

export function createCamera(initial: View) {
  let view = initial
  const listeners = new Set<() => void>()
  let raf = 0, last = 0
  let mode: "spring" | "fling" | null = null
  // spring state: zoom handled in log space so zooming feels even at every scale
  let vel = { lon: 0, lat: 0, z: 0 }
  let target = { lon: 0, lat: 0, z: 0 }
  let omega = 10

  const emit = () => listeners.forEach(l => l())
  const write = (v: View) => { view = v; emit() }
  const halt = () => { cancelAnimationFrame(raf); raf = 0; mode = null }

  const frame = (t: number) => {
    const dt = Math.min(0.05, (t - last) / 1000 || 1 / 60)
    last = t
    let { lon, lat } = view
    let z = Math.log(view.zoom)
    if (mode === "spring") {
      // integrate in small steps for stability
      const steps = Math.ceil(dt / (1 / 240))
      const h = dt / steps
      const k = omega * omega, c = 2 * omega
      for (let i = 0; i < steps; i++) {
        vel.lon += (-k * (lon - target.lon) - c * vel.lon) * h
        vel.lat += (-k * (lat - target.lat) - c * vel.lat) * h
        vel.z += (-k * (z - target.z) - c * vel.z) * h
        lon += vel.lon * h; lat += vel.lat * h; z += vel.z * h
      }
      const settled = Math.abs(lon - target.lon) < 0.01 && Math.abs(lat - target.lat) < 0.01 && Math.abs(z - target.z) < 0.0005 &&
        Math.abs(vel.lon) < 0.05 && Math.abs(vel.lat) < 0.05 && Math.abs(vel.z) < 0.005
      if (settled) { lon = target.lon; lat = target.lat; z = target.z; vel = { lon: 0, lat: 0, z: 0 }; mode = null }
    } else if (mode === "fling") {
      const decay = Math.exp(-dt / 0.42)
      vel.lon *= decay; vel.lat *= decay
      lon += vel.lon * dt; lat += vel.lat * dt
      if (lat > 85 || lat < -85) { lat = clamp(lat, -85, 85); vel.lat = 0 }
      if (Math.hypot(vel.lon, vel.lat) < 1.5) { vel = { lon: 0, lat: 0, z: 0 }; mode = null }
    }
    write({ lon: wrapLon(lon), lat: clamp(lat, -85, 85), zoom: clamp(Math.exp(z), ZOOM_MIN, ZOOM_MAX) })
    // keep the spring target in the same longitude frame after wrapping
    if (mode === "spring") target.lon += wrapLon(lon) - lon
    raf = mode ? requestAnimationFrame(frame) : 0
  }
  const run = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame) } }

  return {
    get: () => view,
    subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } },
    isMoving: () => raf !== 0,
    /** Direct manipulation (drag, pinch, keys): follows the input exactly and cancels any motion. */
    set(v: View) { halt(); vel = { lon: 0, lat: 0, z: 0 }; write({ lon: wrapLon(v.lon), lat: clamp(v.lat, -85, 85), zoom: clamp(v.zoom, ZOOM_MIN, ZOOM_MAX) }) },
    /** Spring to a view. `duration` is the perceived settle time in seconds; bounce is always 0. */
    flyTo(to: Partial<View>, opts: { duration?: number; reduced?: boolean } = {}) {
      const from = view
      const dest = { lon: to.lon ?? from.lon, lat: clamp(to.lat ?? from.lat, -85, 85), zoom: clamp(to.zoom ?? (mode === "spring" ? Math.exp(target.z) : from.zoom), ZOOM_MIN, ZOOM_MAX) }
      if (opts.reduced) { this.set(dest); return }
      let dLon = dest.lon - from.lon
      if (dLon > 180) dLon -= 360
      if (dLon < -180) dLon += 360
      const travel = Math.hypot(dLon, dest.lat - from.lat)
      const duration = opts.duration ?? clamp(0.5 + travel / 360 + Math.abs(Math.log(dest.zoom / from.zoom)) * 0.06, 0.5, 0.95)
      omega = (2 * Math.PI) / duration
      target = { lon: from.lon + dLon, lat: dest.lat, z: Math.log(dest.zoom) }
      if (mode !== "spring") vel = mode === "fling" ? { ...vel, z: 0 } : { lon: 0, lat: 0, z: 0 }
      mode = "spring"
      run()
    },
    /** Multiply the zoom, relative to wherever a zoom already in flight is heading. */
    zoomBy(factor: number, opts: { duration?: number; reduced?: boolean } = {}) {
      const base = mode === "spring" ? Math.exp(target.z) : view.zoom
      this.flyTo({ lon: mode === "spring" ? target.lon : view.lon, lat: mode === "spring" ? target.lat : view.lat, zoom: base * factor }, { duration: opts.duration ?? 0.42, reduced: opts.reduced })
    },
    /** Let the globe coast after a drag (degrees per second). */
    fling(vLon: number, vLat: number) {
      if (Math.hypot(vLon, vLat) < 8) return
      halt(); vel = { lon: vLon, lat: vLat, z: 0 }; mode = "fling"; run()
    },
    stop: () => { halt(); vel = { lon: 0, lat: 0, z: 0 } },
  }
}
export type Camera = ReturnType<typeof createCamera>
