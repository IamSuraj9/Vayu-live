import { useEffect, useRef } from "react"
import type { GeoProjection } from "d3-geo"
import { windAt } from "./field"

type Ramp = [number, number, number][]
type Cached = { canvas: HTMLCanvasElement; version: number; scale: number; step: number; rot: number[]; cx: number; cy: number; w: number; h: number }

const same = (a: number, b: number) => Math.abs(a - b) < 1e-9

// Rasterise the wind-speed colours for one view. Pixels just outside the rim are filled from the rim
// itself so the anti-aliased mask in compose() never shows a dark seam.
function rasterise(projection: GeoProjection, w: number, h: number, step: number, lut: Ramp, alpha: number) {
  const W = Math.ceil(w / step), H = Math.ceil(h / step)
  const canvas = document.createElement("canvas")
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext("2d")!
  const img = ctx.createImageData(W, H)
  const d = img.data
  const [cx, cy] = projection.translate(), r = projection.scale()
  const reach = r + step * 1.5
  const x0 = Math.max(0, Math.floor((cx - reach) / step)), x1 = Math.min(W, Math.ceil((cx + reach) / step))
  const y0 = Math.max(0, Math.floor((cy - reach) / step)), y1 = Math.min(H, Math.ceil((cy + reach) / step))
  for (let y = y0; y < y1; y++) {
    let py = y * step + step / 2
    for (let x = x0; x < x1; x++) {
      let px = x * step + step / 2
      const dist = Math.hypot(px - cx, py - cy)
      if (dist > reach) continue
      if (dist > r * 0.999) { const f = (r * 0.999) / dist; px = cx + (px - cx) * f; py = cy + (py - cy) * f }
      const ll = projection.invert!([px, py])
      py = y * step + step / 2
      if (!ll || Number.isNaN(ll[0])) continue
      const [u, v] = windAt(ll[0], ll[1])
      const col = lut[Math.min(lut.length - 1, Math.round(Math.hypot(u, v) * 4))]
      const o = (y * W + x) * 4
      d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = alpha
    }
  }
  ctx.putImageData(img, 0, 0)
  return canvas
}

/**
 * Wind-speed colour layer.
 * - Zoom only (same rotation and centre): the last image is scaled about the globe centre, which is exact for an
 *   orthographic projection, so the colours stay pinned to the coastlines with no re-sampling shimmer.
 * - Rotation: a quick low-resolution pass every frame, then a sharp pass once the view rests.
 * - The rim is cut with an anti-aliased circle, so it never shows stair-stepped pixels.
 */
export function useWindOverlay(
  ref: React.RefObject<HTMLCanvasElement | null>, projection: GeoProjection, size: { w: number; h: number }, dpr: number,
  on: boolean, lut: Ramp, fieldVersion = 0, alpha = 214,
) {
  const cache = useRef<Cached | null>(null)
  useEffect(() => {
    const out = ref.current!
    const W = Math.round(size.w * dpr), H = Math.round(size.h * dpr)
    if (out.width !== W || out.height !== H) { out.width = W; out.height = H }
    const ctx = out.getContext("2d")!
    if (!on) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H); cache.current = null; return }
    const [cx, cy] = projection.translate(), r = projection.scale(), rot = projection.rotate()
    const sharpStep = 2, quickStep = size.w * size.h > 900_000 ? 5 : 4

    const compose = (src: Cached) => {
      const k = r / src.scale
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.globalCompositeOperation = "source-over"
      ctx.clearRect(0, 0, size.w, size.h)
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = "high"
      ctx.save()
      ctx.translate(cx, cy); ctx.scale(k, k); ctx.translate(-cx, -cy)
      ctx.drawImage(src.canvas, 0, 0, src.canvas.width * src.step, src.canvas.height * src.step)
      ctx.restore()
      ctx.globalCompositeOperation = "destination-in"
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill()
      ctx.globalCompositeOperation = "source-over"
    }
    const render = (step: number): Cached => ({
      canvas: rasterise(projection, size.w, size.h, step, lut, alpha), version: fieldVersion, scale: r, step, rot: [...rot], cx, cy, w: size.w, h: size.h,
    })

    const c0 = cache.current
    const zoomOnly = !!c0 && c0.version === fieldVersion && c0.w === size.w && c0.h === size.h && same(c0.cx, cx) && same(c0.cy, cy) && same(c0.rot[0], rot[0]) && same(c0.rot[1], rot[1])
    // Zooming out can reveal parts of the globe the cached image never covered
    const covered = !!c0 && (r >= c0.scale || (cx - c0.scale >= 0 && cx + c0.scale <= size.w && cy - c0.scale >= 0 && cy + c0.scale <= size.h))
    if (zoomOnly && covered) compose(c0!)
    else { cache.current = render(quickStep); compose(cache.current) }

    const exact = cache.current && cache.current.step === sharpStep && same(cache.current.scale, r) && zoomOnly
    if (exact) return
    const id = window.setTimeout(() => { cache.current = render(sharpStep); compose(cache.current) }, 140)
    return () => window.clearTimeout(id)
  }, [ref, projection, size, dpr, on, lut, alpha, fieldVersion])
}

/** Scale an existing particle-trail canvas about the globe centre so trails ride along with a zoom. */
export function rescaleTrails(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, scratch: HTMLCanvasElement, cx: number, cy: number, k: number, dpr: number) {
  if (scratch.width !== canvas.width || scratch.height !== canvas.height) { scratch.width = canvas.width; scratch.height = canvas.height }
  const s = scratch.getContext("2d")!
  s.clearRect(0, 0, scratch.width, scratch.height)
  s.drawImage(canvas, 0, 0)
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.translate(cx * dpr, cy * dpr); ctx.scale(k, k); ctx.translate(-cx * dpr, -cy * dpr)
  ctx.drawImage(scratch, 0, 0)
  ctx.restore()
}
