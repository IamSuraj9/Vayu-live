import { useEffect, type RefObject } from "react"
import { geoDistance, type GeoProjection } from "d3-geo"
import { windAt } from "./field"
import { rescaleTrails } from "./overlay"

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

/** Animated particles that follow the wind (in lon/lat space, projected each frame). */
export function useWindParticles(
  partRef: RefObject<HTMLCanvasElement | null>,
  projRef: RefObject<GeoProjection>,
  size: { w: number; h: number },
  dpr: number,
  showParticles: boolean,
  fieldReady: boolean,
  reducedMotion: boolean,
  interacting: boolean,
) {
  useEffect(() => {
    const c = partRef.current!
    c.width = size.w * dpr; c.height = size.h * dpr
    const ctx = c.getContext("2d")!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    if (!showParticles || !fieldReady) { ctx.clearRect(0, 0, size.w, size.h); return }
    const N = Math.round(clamp((size.w * size.h) / 240, 1200, 5200))
    type P = { lon: number; lat: number; age: number; max: number }
    const parts: P[] = Array.from({ length: N }, () => ({ lon: 0, lat: 0, age: 1, max: 0 }))
    const spawn = (p: P) => {
      const pr = projRef.current
      const [cx, cy] = pr.translate(), r = pr.scale()
      const x0 = Math.max(0, cx - r), x1 = Math.min(size.w, cx + r), y0 = Math.max(0, cy - r), y1 = Math.min(size.h, cy + r)
      for (let k = 0; k < 8; k++) {
        const x = x0 + Math.random() * (x1 - x0), y = y0 + Math.random() * (y1 - y0)
        if ((x - cx) ** 2 + (y - cy) ** 2 > r * r * 0.985) continue
        const ll = pr.invert!([x, y])
        if (ll) { p.lon = ll[0]; p.lat = ll[1]; p.age = 0; p.max = 30 + Math.random() * 80; return }
      }
      p.age = 0; p.max = 0
    }
    parts.forEach(p => { spawn(p); p.age = Math.floor(Math.random() * p.max) })
    let raf = 0, frames = 0, lastKey = "", lastScale = 0, lastRot = ""
    const scratch = document.createElement("canvas")
    const tick = () => {
      const pr = projRef.current
      const key = `${pr.scale()}|${pr.rotate().join(",")}|${pr.translate().join(",")}`
      const moved = key !== lastKey
      const rotKey = `${pr.rotate().join(",")}|${pr.translate().join(",")}`
      const zoomOnly = moved && rotKey === lastRot && lastScale > 0
      if (zoomOnly) rescaleTrails(c, ctx, scratch, pr.translate()[0], pr.translate()[1], pr.scale() / lastScale, dpr)
      lastKey = key; lastRot = rotKey; lastScale = pr.scale()
      const rot = pr.rotate(), center: [number, number] = [-rot[0], -rot[1]]
      const k = 0.11 / pr.scale() * (180 / Math.PI)
      if (moved && !zoomOnly) ctx.clearRect(0, 0, size.w, size.h)
      else {
        ctx.globalCompositeOperation = "destination-in"
        ctx.fillStyle = "rgba(0,0,0,0.92)"; ctx.fillRect(0, 0, size.w, size.h)
        ctx.globalCompositeOperation = "source-over"
      }
      ctx.beginPath()
      for (const p of parts) {
        if (p.age >= p.max) { spawn(p); continue }
        const a = pr([p.lon, p.lat])!
        const [u, v] = windAt(p.lon, p.lat)
        p.lat += v * k
        p.lon += (u * k) / Math.max(0.08, Math.cos((p.lat * Math.PI) / 180))
        p.age++
        if (p.lat > 88 || p.lat < -88 || geoDistance([p.lon, p.lat], center) > 1.55) { p.age = p.max; continue }
        const b = pr([p.lon, p.lat])!
        ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1])
      }
      ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = 0.85; ctx.stroke()
      frames++
      if (reducedMotion && frames > 70) return // draw a still set of streaks, then stop
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [size, dpr, reducedMotion, showParticles, fieldReady, reducedMotion && interacting])
}
