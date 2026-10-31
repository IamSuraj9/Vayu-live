// Orthographic projection maths, written out by hand so the per-pixel passes stay fast.
export const D2R = Math.PI / 180
export const R2D = 180 / Math.PI

export type View = { lon: number; lat: number; zoom: number }

export class Proj {
  cx = 0; cy = 0; R = 1
  lon0 = 0; sinP0 = 0; cosP0 = 1
  // outputs of project()
  x = 0; y = 0; cosc = 0

  constructor(public view: View, public w: number, public h: number, public base: number, cx = w / 2, cy = h / 2) {
    this.R = base * view.zoom
    this.cx = cx
    this.cy = cy
    this.lon0 = view.lon
    const p0 = view.lat * D2R
    this.sinP0 = Math.sin(p0)
    this.cosP0 = Math.cos(p0)
  }

  /** Sets this.x, this.y (CSS px) and this.cosc (> 0 means on the visible side). */
  project(lon: number, lat: number): boolean {
    const p = lat * D2R, dl = (lon - this.lon0) * D2R
    const cp = Math.cos(p), sp = Math.sin(p), cdl = Math.cos(dl)
    this.cosc = this.sinP0 * sp + this.cosP0 * cp * cdl
    this.x = this.cx + this.R * cp * Math.sin(dl)
    this.y = this.cy - this.R * (this.cosP0 * sp - this.sinP0 * cp * cdl)
    return this.cosc > 0
  }

  /** Screen position back to lon (degrees, 0..360) and lat; null outside the disc. */
  invert(px: number, py: number, out: [number, number]): boolean {
    const xs = (px - this.cx) / this.R, ys = (this.cy - py) / this.R
    const r2 = xs * xs + ys * ys
    if (r2 > 1) return false
    const cosc = Math.sqrt(1 - r2)
    out[1] = Math.asin(Math.max(-1, Math.min(1, cosc * this.sinP0 + ys * this.cosP0))) * R2D
    const l = this.lon0 + Math.atan2(xs, this.cosP0 * cosc - ys * this.sinP0) * R2D
    out[0] = ((l % 360) + 360) % 360
    return true
  }
}

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }
export const wrap360 = (l: number) => ((l % 360) + 360) % 360
export const wrap180 = (l: number) => ((l + 540) % 360) - 180
