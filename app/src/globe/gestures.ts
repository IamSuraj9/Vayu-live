import { useEffect, useRef } from "react"
import type { GeoProjection } from "d3-geo"
import { ZOOM_MAX, type Camera, type View } from "./camera"

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const wrapLon = (l: number) => ((l + 540) % 360) - 180

type Drag = { x: number; y: number; lon: number; lat: number; zoom: number; moved: boolean; dist?: number; storm?: string | null }

/** Drag to rotate, pinch or wheel to zoom, click to read a point or pick a storm. */
export function useGlobeGestures(
  wrap: React.RefObject<HTMLDivElement | null>,
  projRef: React.RefObject<GeoProjection>,
  projection: GeoProjection,
  camera: Camera,
  reducedMotion: boolean,
  home: View | undefined,
  onSelect: (id: string | null) => void,
  onPick: (p: { lon: number; lat: number; x: number; y: number } | null) => void,
  setInteracting: (on: boolean) => void,
) {
  const interactRef = useRef(false)
  const idle = useRef<number | undefined>(undefined)
  const begin = () => { window.clearTimeout(idle.current); if (!interactRef.current) { interactRef.current = true; setInteracting(true) } }
  const endSoon = () => {
    window.clearTimeout(idle.current)
    idle.current = window.setTimeout(() => { interactRef.current = false; setInteracting(false) }, 180)
  }
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const drag = useRef<Drag | null>(null)
  const zoomTo = (z: number) => camera.set({ ...camera.get(), zoom: clamp(z, 0.7, 14) })
  const samples = useRef<{ t: number; lon: number; lat: number }[]>([])
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null)

  useEffect(() => {
    const el = wrap.current!
    const onWheel = (e: WheelEvent) => {
      e.preventDefault(); begin()
      const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0016))
      // Trackpads send many small deltas: follow them directly. Mouse wheels send big notches: glide between them.
      if (e.ctrlKey || (e.deltaMode === 0 && Math.abs(e.deltaY) < 40) || reducedMotion) zoomTo(camera.get().zoom * factor)
      else camera.zoomBy(factor, { duration: 0.32 })
      endSoon()
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  })

  const onPointerDown = (e: React.PointerEvent) => {
    const storm = (e.target as Element).closest?.("[data-storm]")?.getAttribute("data-storm") ?? null
    wrap.current!.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    camera.stop() // catch the globe, like touching a scrolling list on iOS
    const v = camera.get()
    samples.current = []
    drag.current = { x: e.clientX, y: e.clientY, lon: v.lon, lat: v.lat, zoom: v.zoom, moved: pointers.current.size > 1, storm }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const d = drag.current
    if (!d) return
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      if (!d.dist) { d.dist = dist; d.zoom = camera.get().zoom }
      d.moved = true; begin(); zoomTo(d.zoom * (dist / d.dist))
      return
    }
    const dx = e.clientX - d.x, dy = e.clientY - d.y
    if (!d.moved && Math.hypot(dx, dy) < 4) return
    if (!d.moved) { d.moved = true }
    begin()
    const k = 180 / (Math.PI * projRef.current.scale())
    const next = { lon: wrapLon(d.lon - dx * k), lat: clamp(d.lat + dy * k, -85, 85), zoom: camera.get().zoom }
    camera.set(next)
    const now = performance.now()
    samples.current.push({ t: now, lon: d.lon - dx * k, lat: next.lat })
    while (samples.current.length > 2 && now - samples.current[0].t > 90) samples.current.shift()
  }
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    const d = drag.current
    if (pointers.current.size > 0) return
    drag.current = null
    if (d && d.moved) {
      const sm = samples.current, a = sm[0], b = sm[sm.length - 1]
      if (!reducedMotion && pointers.current.size === 0 && !d.dist && a && b && b.t - a.t > 12 && performance.now() - b.t < 100) {
        const dt = (b.t - a.t) / 1000
        camera.fling((b.lon - a.lon) / dt, (b.lat - a.lat) / dt)
      }
      endSoon(); return
    }
    if (d?.storm) { onSelect(d.storm); return }
    const rect = wrap.current!.getBoundingClientRect()
    const x = e.clientX - rect.left, y = e.clientY - rect.top
    const [cx, cy] = projection.translate()
    if ((x - cx) ** 2 + (y - cy) ** 2 > projection.scale() ** 2) { onPick(null); return }
    // Double-tap on a phone: zoom in on the spot. It is a one-finger way to zoom for people who cannot pinch. Once the
    // globe is zoomed all the way in, a double-tap flies back to the start view.
    if (e.pointerType !== "mouse") {
      const now = performance.now(), prev = lastTap.current
      if (prev && now - prev.t < 320 && Math.hypot(x - prev.x, y - prev.y) < 32) {
        lastTap.current = null
        onPick(null)
        const v = camera.get(), ll = projection.invert!([x, y])
        if (v.zoom >= ZOOM_MAX * 0.85 && home) camera.flyTo(home, { reduced: reducedMotion })
        else if (ll) camera.flyTo({ lon: ll[0], lat: ll[1], zoom: v.zoom * 2 }, { reduced: reducedMotion })
        return
      }
      lastTap.current = { t: now, x, y }
    }
    const ll = projection.invert!([x, y])
    if (ll) onPick({ lon: ll[0], lat: ll[1], x, y })
  }
  const onKeyDown = (e: React.KeyboardEvent) => {
    const v = camera.get(), stepDeg = 6 / v.zoom
    const moves: Record<string, Partial<View>> = {
      ArrowLeft: { lon: wrapLon(v.lon - stepDeg) }, ArrowRight: { lon: wrapLon(v.lon + stepDeg) },
      ArrowUp: { lat: clamp(v.lat + stepDeg, -85, 85) }, ArrowDown: { lat: clamp(v.lat - stepDeg, -85, 85) },
      "+": { zoom: clamp(v.zoom * 1.2, 0.7, 14) }, "=": { zoom: clamp(v.zoom * 1.2, 0.7, 14) }, "-": { zoom: clamp(v.zoom / 1.2, 0.7, 14) },
    }
    if (moves[e.key]) { e.preventDefault(); begin(); camera.set({ ...v, ...moves[e.key] }); endSoon() }
  }

  return { onPointerDown, onPointerMove, onPointerUp, onKeyDown }
}
