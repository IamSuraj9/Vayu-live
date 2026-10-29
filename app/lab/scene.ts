// One globe, drawn in layers: surface (per pixel) -> marks (still) -> trail (particles) -> live (animated + storms).
import { geoGraticule10, geoOrthographic, geoPath } from "d3-geo"
import { D2R, Proj, R2D, clamp, lerp, smooth, type View } from "./geo"
import { BAND_VALUE, bandOf, colorAt, legible, lut, rgba, tempColor, type RGB } from "./palettes"
import type { Cfg } from "./presets"
import * as DATA from "./data"
import { levelFor } from "@/lib/strength"

const graticule = geoGraticule10()
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const KT2MS = 0.514444

type Theme = { ocean: RGB; land: RGB; light?: boolean }
const THEME: Record<Cfg["earth"], Theme> = {
  void: { ocean: [0, 0, 0], land: [19, 22, 30] },
  slate: { ocean: [13, 18, 27], land: [30, 38, 51] },
  night: { ocean: [6, 11, 28], land: [11, 18, 40] },
  paper: { ocean: [237, 232, 220], land: [219, 211, 192], light: true },
  dots: { ocean: [0, 0, 0], land: [0, 0, 0] },
}

type Labels = { id: string; name: string; text: string; x: number; y: number; color: string }[]

/** Sun position for the night look: subsolar latitude and longitude from the current UTC time */
function sunPosition(date = new Date()) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0)
  const day = (date.getTime() - start) / 864e5
  const decl = 23.44 * Math.sin(((day - 81) / 365) * 2 * Math.PI)
  const hours = date.getUTCHours() + date.getUTCMinutes() / 60
  return { lat: decl * D2R, lon: -(hours - 12) * 15 } // degrees east
}

export class Scene {
  w = 0; h = 0
  view: View = { lon: 90, lat: 18, zoom: 1 }
  cfg!: Cfg
  /** centre of the globe in CSS px, and how large it is at zoom 1 */
  centre: [number, number] | null = null
  baseScale = 0.42
  onLabels: (l: Labels) => void = () => {}
  animate = true

  private ctxS: CanvasRenderingContext2D; private ctxM: CanvasRenderingContext2D
  private ctxT: CanvasRenderingContext2D; private ctxL: CanvasRenderingContext2D
  private proj!: Proj
  private key = ""; private restKey = ""
  private off = document.createElement("canvas")
  private img: ImageData | null = null
  private bandA = new Int8Array(0); private bandB = new Int8Array(0)
  private sun = sunPosition()
  // animated state
  private parts: { lon: number; lat: number; age: number; max: number }[] = []
  private flow: { path: Path2D; speed: number; phase: number }[] = []
  private shimmer: { x: number; y: number; dx: number; dy: number; s: number; ph: number }[] = []
  private markColors: string[] = []
  private markWidths: number[] = []
  private time = 0

  constructor(public els: { surface: HTMLCanvasElement; marks: HTMLCanvasElement; trail: HTMLCanvasElement; live: HTMLCanvasElement }, public dpr = 1) {
    this.ctxS = els.surface.getContext("2d")!; this.ctxM = els.marks.getContext("2d")!
    this.ctxT = els.trail.getContext("2d")!; this.ctxL = els.live.getContext("2d")!
  }

  resize(w: number, h: number) {
    this.w = w; this.h = h
    for (const c of Object.values(this.els)) { c.width = Math.round(w * this.dpr); c.height = Math.round(h * this.dpr); c.style.width = w + "px"; c.style.height = h + "px" }
    this.key = ""; this.restKey = "" // the canvases were cleared: everything has to be drawn again
  }
  setView(v: View) { this.view = v }
  setCfg(c: Cfg) { this.cfg = c; this.key = ""; this.restKey = ""; this.prepareColors(); this.parts = [] }

  private get onLight() { return !!THEME[this.cfg.earth].light }

  private prepareColors() {
    const { cfg } = this, light = this.onLight
    this.markColors = []; this.markWidths = []
    for (let b = 0; b < 8; b++) {
      const speed = b * 3.5 + 2
      if (cfg.color === "speed") {
        const base = colorAt(cfg.palette, speed * 1.1)
        const c = light ? mix(base, [16, 26, 62], b > 5 ? 0.15 : 0.5) : legible(mix(base, [255, 255, 255], 0.12), false)
        this.markColors.push(rgba(c, light ? clamp(0.7 + b * 0.04, 0.7, 0.98) : clamp(0.72 + b * 0.04, 0.72, 0.98)))
      } else this.markColors.push(light ? `rgba(20,30,70,${0.62 + b * 0.05})` : `rgba(255,255,255,${0.4 + b * 0.07})`)
      this.markWidths.push(lerp(light ? 0.8 : 0.95, light ? 2.6 : 2.6, b / 7))
    }
  }
  private plainMark(a = 0.8) { return this.onLight ? `rgba(24,36,80,${a})` : `rgba(255,255,255,${a})` }

  // ---------------------------------------------------------------- main entry per frame
  /** moving: the person is dragging or zooming, so draw the cheap version */
  update(t: number, moving: boolean) {
    this.time = t / 1000
    const proj = new Proj(this.view, this.w, this.h, Math.min(this.w, this.h) * this.baseScale, this.centre?.[0], this.centre?.[1])
    const key = `${this.view.lon.toFixed(3)}|${this.view.lat.toFixed(3)}|${this.view.zoom.toFixed(4)}|${this.w}x${this.h}|${this.centre}`
    const changed = key !== this.key
    if (changed) { this.proj = proj; this.key = key }
    if (moving) {
      if (changed) { this.drawSurface(4); this.els.marks.style.opacity = "0"; this.els.trail.style.opacity = "0"; this.restKey = "" }
    } else if (this.restKey !== this.key) {
      this.proj = proj
      this.drawSurface(this.dpr > 1 ? 1.5 : 2)
      this.drawMarks()
      this.ctxT.clearRect(0, 0, this.els.trail.width, this.els.trail.height)
      this.els.marks.style.opacity = "1"; this.els.trail.style.opacity = "1"
      this.restKey = this.key
    }
    if (!moving && this.restKey === this.key && (this.cfg.wind === "particles" || this.cfg.wind === "glow") && this.animate) this.stepParticles()
    this.drawLive()
  }

  /** For thumbnails and screenshots: draw everything once and run the particle trails forward. */
  still(frames = 60) {
    this.key = ""; this.restKey = ""
    this.animate = true
    const saved = this.time
    this.update(0, false)
    for (let i = 0; i < frames; i++) this.stepParticles()
    this.time = saved + 1.3
    this.drawLive()
  }

  // ---------------------------------------------------------------- surface
  private drawSurface(step: number) {
    const { w, h, proj, cfg } = this, ctx = this.ctxS, dpr = this.dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    const { cx, cy, R } = proj
    if (cfg.earth === "night") this.atmosphere(ctx)
    const W = Math.ceil(w / step), H = Math.ceil(h / step)
    if (!this.img || this.img.width !== W || this.img.height !== H) {
      this.img = new ImageData(W, H); this.off.width = W; this.off.height = H
      this.bandA = new Int8Array(W); this.bandB = new Int8Array(W)
    }
    const d = this.img.data; d.fill(0)
    const th = THEME[cfg.earth]
    const relief = cfg.fill === "relief"
    const ocean: RGB = relief ? (cfg.earth === "paper" ? [200, 196, 188] : [66, 80, 104]) : th.ocean
    const land: RGB = relief ? (cfg.earth === "paper" ? [186, 180, 168] : [88, 101, 126]) : th.land
    const L = lut(cfg.palette)
    const night = cfg.earth === "night"
    const sinS = Math.sin(this.sun.lat), cosS = Math.cos(this.sun.lat)
    const { sinP0, cosP0, lon0 } = proj
    const fill = cfg.fill
    const alpha = fill === "wind" ? (cfg.earth === "paper" ? 0.5 : 0.84) : fill === "bands" ? 0.9 : fill === "temp" ? 0.72 : 0
    let bandPrev = this.bandA, bandCur = this.bandB
    bandPrev.fill(-1)
    for (let y = 0; y < H; y++) {
      const py = (y + 0.5) * step
      let ys = (cy - py) / R
      bandCur.fill(-1)
      for (let x = 0; x < W; x++) {
        const px = (x + 0.5) * step
        let xs = (px - cx) / R
        let r2 = xs * xs + ys * ys
        if (r2 > 1.05) continue
        if (r2 > 0.9985) { const k = Math.sqrt(0.9985 / r2); xs *= k; ys *= k; r2 = 0.9985 }
        const cosc = Math.sqrt(1 - r2)
        const lat = Math.asin(clamp(cosc * sinP0 + ys * cosP0, -1, 1))
        const lonDeg = lon0 + Math.atan2(xs, cosP0 * cosc - ys * sinP0) * R2D
        const latDeg = lat * R2D
        const lonW = ((lonDeg % 360) + 360) % 360
        const lx = Math.min(DATA.MW - 1, ((((lonW + 180) % 360) / 360) * DATA.MW) | 0)
        const ly = Math.min(DATA.MH - 1, Math.max(0, (((90 - latDeg) / 180) * DATA.MH) | 0))
        const isLand = DATA.MASK[ly * DATA.MW + lx] > 127
        let r: number, g: number, b: number
        if (night) {
          const dotS = Math.sin(lat) * sinS + Math.cos(lat) * cosS * Math.cos((lonDeg - this.sun.lon) * D2R)
          const day = smooth(-0.1, 0.3, dotS)
          const c = isLand ? mix([11, 18, 40], [36, 70, 102], day) : mix([6, 11, 28], [20, 56, 118], day)
          // a faint warm band right at the terminator
          const tw = Math.exp(-((dotS - 0.04) ** 2) / 0.02) * 0.07
          r = c[0] + 255 * tw * 0.5; g = c[1] + 120 * tw * 0.5; b = c[2] + 60 * tw * 0.4
        } else {
          const c = isLand ? land : ocean
          r = c[0]; g = c[1]; b = c[2]
        }
        if (alpha > 0 || fill === "zones" || relief) {
          if (fill === "wind" || fill === "bands") {
            const spd = DATA.bil(DATA.SPD, lonW, latDeg)
            let col: [number, number, number]
            let a = alpha
            if (fill === "bands") {
              const band = bandOf(spd)
              bandCur[x] = band
              const i = Math.round(BAND_VALUE[band] * 4) * 3
              col = [L[i], L[i + 1], L[i + 2]]
              const edge = (x > 0 && bandCur[x - 1] !== band) || (y > 0 && bandPrev[x] !== band && bandPrev[x] >= 0)
              if (edge) col = [col[0] * 0.5, col[1] * 0.5, col[2] * 0.5]
            } else {
              const i = Math.min(240, (spd * 4 + 0.5) | 0) * 3
              col = [L[i], L[i + 1], L[i + 2]]
            }
            r += (col[0] - r) * a; g += (col[1] - g) * a; b += (col[2] - b) * a
          } else if (fill === "temp") {
            const col = tempColor(DATA.bil(DATA.TEMP, lonW, latDeg))
            r += (col[0] - r) * alpha; g += (col[1] - g) * alpha; b += (col[2] - b) * alpha
          } else if (fill === "zones") {
            const p = DATA.bil(DATA.HPA, lonW, latDeg)
            const low = clamp((1010 - p) / 26, 0, 1), high = clamp((p - 1021) / 16, 0, 1)
            if (low > 0) { const c = mix([112, 96, 255], [214, 70, 206], low * low), a = Math.min(0.72, low * 0.8); r += (c[0] - r) * a; g += (c[1] - g) * a; b += (c[2] - b) * a }
            else if (high > 0) { const c: RGB = [255, 196, 110], a = high * 0.24; r += (c[0] - r) * a; g += (c[1] - g) * a; b += (c[2] - b) * a }
          } else if (relief) {
            const p = DATA.bil(DATA.HPA, lonW, latDeg)
            const ge = DATA.bil(DATA.GE, lonW, latDeg), gn = DATA.bil(DATA.GN, lonW, latDeg)
            // surface normal from the pressure slope; light from the north-west
            const nx = -ge * 0.55, ny = -gn * 0.55, nl = Math.sqrt(nx * nx + ny * ny + 1)
            const shade = (nx * -0.5 + ny * 0.6 + 0.62) / nl - 0.62
            const k = clamp(1 + shade * 2.2 + ((p - 1013) / 30) * 0.45, 0.45, 1.6)
            r *= k; g *= k * 1.02; b *= k * 1.06
          }
        }
        // limb shading gives the sphere volume
        if (cfg.earth === "slate") { const k = 1 - 0.32 * r2 ** 3; r *= k; g *= k; b *= k }
        else if (cfg.earth === "paper") { const k = 1 - 0.2 * r2 ** 2; r *= k; g *= k; b *= k }
        else if (night) { const k = r2 ** 4 * 0.5; r += 70 * k; g += 130 * k; b += 255 * k }
        const o = (y * W + x) * 4
        d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255
      }
      const tmp = bandPrev; bandPrev = bandCur; bandCur = tmp
    }
    this.off.getContext("2d")!.putImageData(this.img, 0, 0)
    ctx.save()
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip()
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high"
    ctx.drawImage(this.off, 0, 0, W * step, H * step)
    ctx.restore()

    if (cfg.earth === "dots") this.dots(ctx)
    this.mapLines(ctx, step <= 2)
    if (night) this.lights(ctx)
    // rim
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2)
    ctx.strokeStyle = cfg.earth === "paper" ? "rgba(255,255,255,0.22)" : night ? "rgba(120,170,255,0.35)" : "rgba(255,255,255,0.14)"
    ctx.lineWidth = 1; ctx.stroke()
  }

  private atmosphere(ctx: CanvasRenderingContext2D) {
    const { cx, cy, R } = this.proj
    const g = ctx.createRadialGradient(cx, cy, R * 0.985, cx, cy, R * 1.16)
    g.addColorStop(0, "rgba(96,156,255,0.55)"); g.addColorStop(0.3, "rgba(60,112,255,0.2)"); g.addColorStop(1, "rgba(40,80,255,0)")
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 1.16, 0, Math.PI * 2); ctx.fill()
  }

  private lights(ctx: CanvasRenderingContext2D) {
    const { proj } = this, sinS = Math.sin(this.sun.lat), cosS = Math.cos(this.sun.lat)
    ctx.save(); ctx.globalCompositeOperation = "lighter"
    const k = clamp(proj.R / 330, 0.5, 2.4)
    for (const [lat, lon] of DATA.LIGHTS) {
      if (!proj.project(lon, lat) || proj.cosc < 0.08) continue
      const dotS = Math.sin(lat * D2R) * sinS + Math.cos(lat * D2R) * cosS * Math.cos((lon - this.sun.lon) * D2R)
      const dark = 1 - smooth(-0.08, 0.18, dotS)
      if (dark < 0.04) continue
      const a = dark * clamp(proj.cosc * 1.6, 0, 1)
      ctx.fillStyle = `rgba(255,190,110,${0.1 * a})`; ctx.beginPath(); ctx.arc(proj.x, proj.y, 7 * k, 0, 7); ctx.fill()
      ctx.fillStyle = `rgba(255,214,150,${0.9 * a})`; ctx.beginPath(); ctx.arc(proj.x, proj.y, 1.3 * k, 0, 7); ctx.fill()
    }
    ctx.restore()
  }

  private dots(ctx: CanvasRenderingContext2D) {
    const { proj } = this, sp = DATA.DOTS.spacing * proj.R
    const sLand = clamp(sp * 0.56, 1.1, 6), sSea = clamp(sp * 0.2, 0.7, 2)
    ctx.fillStyle = "rgba(255,255,255,0.055)"
    const sea = DATA.DOTS.sea
    for (let i = 0; i < sea.length; i += 2) if (proj.project(sea[i], sea[i + 1]) && proj.cosc > 0.16) { const s = sSea * proj.cosc; ctx.fillRect(proj.x - s / 2, proj.y - s / 2, s, s) }
    const land = DATA.DOTS.land
    for (let i = 0; i < land.length; i += 2) {
      if (!proj.project(land[i], land[i + 1]) || proj.cosc < 0.04) continue
      const s = sLand * Math.pow(proj.cosc, 0.45)
      ctx.fillStyle = `rgba(255,255,255,${0.2 + 0.7 * Math.pow(proj.cosc, 0.7)})`
      ctx.beginPath(); ctx.arc(proj.x, proj.y, s / 2, 0, 7); ctx.fill()
    }
  }

  private mapLines(ctx: CanvasRenderingContext2D, fine: boolean) {
    const { cfg, proj } = this
    if (cfg.map === "none" && cfg.earth !== "void" && cfg.earth !== "slate") return
    if (cfg.map === "none") return
    const world = fine && proj.R > 300 ? DATA.MAP_FINE : DATA.MAP_LIGHT
    const gp = geoOrthographic().rotate([-this.view.lon, -this.view.lat]).translate([proj.cx, proj.cy]).scale(proj.R).clipAngle(90).precision(0.45)
    const path = geoPath(gp, ctx)
    const paper = cfg.earth === "paper", night = cfg.earth === "night"
    if (cfg.map === "grid") { ctx.beginPath(); path(graticule); ctx.strokeStyle = paper ? "rgba(120,110,90,0.22)" : night ? "rgba(120,170,255,0.12)" : "rgba(255,255,255,0.09)"; ctx.lineWidth = 0.6; ctx.stroke() }
    if (cfg.map === "borders" || cfg.map === "grid") { ctx.beginPath(); path(world.borders); ctx.strokeStyle = paper ? "rgba(110,100,80,0.45)" : night ? "rgba(140,180,255,0.16)" : "rgba(255,255,255,0.17)"; ctx.lineWidth = 0.6; ctx.stroke() }
    ctx.beginPath(); path(world.coast)
    ctx.strokeStyle = paper ? "rgba(36,32,26,0.85)" : night ? "rgba(150,190,255,0.5)" : cfg.earth === "dots" ? "rgba(255,255,255,0.2)" : cfg.earth === "slate" ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.7)"
    ctx.lineWidth = paper ? 0.9 : 0.85; ctx.stroke()
  }

  // ---------------------------------------------------------------- marks (drawn once per view)
  private drawMarks() {
    const ctx = this.ctxM, { w, h, dpr, cfg } = this
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    ctx.save(); ctx.beginPath(); ctx.arc(this.proj.cx, this.proj.cy, this.proj.R, 0, Math.PI * 2); ctx.clip()
    if (cfg.isobars !== "off") this.isobars(ctx)
    if (cfg.wind === "lines") this.streamlines(ctx)
    else if (cfg.wind === "arrows") this.arrows(ctx)
    else if (cfg.wind === "barbs") this.barbs(ctx)
    ctx.restore()
    if (cfg.isobars === "hl") this.centres(ctx)
    this.flow = []; this.shimmer = []
    if (cfg.wind === "flow") this.prepareFlow()
    else if (cfg.wind === "shimmer") this.prepareShimmer()
  }

  private isobars(ctx: CanvasRenderingContext2D) {
    const { proj } = this, light = this.onLight
    const col = light
      ? { lo: "rgba(96,60,190,", mid: "rgba(150,64,44,", hi: "rgba(176,110,20," }
      : { lo: "rgba(176,160,255,", mid: "rgba(255,255,255,", hi: "rgba(255,206,120," }
    const groups: Path2D[] = Array.from({ length: 6 }, () => new Path2D())
    for (const iso of DATA.ISOBARS) {
      const g = (iso.level < 1004 ? 0 : iso.level > 1024 ? 4 : 2) + (iso.major ? 1 : 0)
      const path = groups[g], s = iso.seg
      for (let i = 0; i < s.length; i += 4) {
        if (!proj.project(s[i], s[i + 1])) continue
        const x1 = proj.x, y1 = proj.y
        if (!proj.project(s[i + 2], s[i + 3])) continue
        path.moveTo(x1, y1); path.lineTo(proj.x, proj.y)
      }
    }
    const style = (c: string, major: boolean) => (major ? `${c}${light ? 0.9 : 0.8})` : `${c}${light ? 0.45 : 0.32})`)
    const cols = [col.lo, col.lo, col.mid, col.mid, col.hi, col.hi]
    groups.forEach((p, i) => { ctx.strokeStyle = style(cols[i], i % 2 === 1); ctx.lineWidth = i % 2 ? 1.35 : 0.8; ctx.lineJoin = "round"; ctx.stroke(p) })
  }

  private centres(ctx: CanvasRenderingContext2D) {
    const { proj } = this, light = this.onLight
    ctx.save()
    ctx.textAlign = "center"; ctx.textBaseline = "middle"
    for (const c of DATA.CENTRES) {
      if (!proj.project(c.lon, c.lat) || proj.cosc < 0.18) continue
      const low = c.kind === "L"
      const ink = low ? (light ? "#5b3fd1" : "#b9b0ff") : (light ? "#a8650a" : "#ffd089")
      const k = clamp(proj.cosc, 0.6, 1)
      ctx.beginPath(); ctx.arc(proj.x, proj.y, 14 * k, 0, 7)
      ctx.fillStyle = light ? "rgba(255,252,244,0.92)" : "rgba(8,10,18,0.72)"; ctx.fill()
      ctx.strokeStyle = ink; ctx.lineWidth = 1.4; ctx.stroke()
      ctx.fillStyle = ink; ctx.font = `700 ${14 * k}px Geist, system-ui, sans-serif`; ctx.fillText(c.kind, proj.x, proj.y + 0.5)
      ctx.font = `500 ${10 * k}px "Geist Mono", ui-monospace, monospace`; ctx.fillStyle = light ? "#3a3a3a" : "rgba(255,255,255,0.8)"
      ctx.fillText(String(Math.round(c.p)), proj.x, proj.y + 25 * k)
    }
    ctx.restore()
  }

  private streamlines(ctx: CanvasRenderingContext2D) {
    const { proj } = this
    const buckets: Path2D[] = Array.from({ length: 8 }, () => new Path2D())
    const scale = clamp(proj.R / 420, 0.7, 1.6)
    for (const ln of DATA.STREAMLINES) {
      const b = Math.min(7, Math.floor(ln.speed / 3.5)), path = buckets[b], p = ln.pts
      let pen = false
      for (let i = 0; i < p.length; i += 2) {
        if (!proj.project(p[i], p[i + 1]) || proj.cosc < 0.03) { pen = false; continue }
        if (pen) path.lineTo(proj.x, proj.y); else { path.moveTo(proj.x, proj.y); pen = true }
      }
    }
    ctx.lineCap = "round"; ctx.lineJoin = "round"
    // coloured curves on a dark globe get a soft glow underneath, so slow, dark colours stay visible
    if (this.cfg.color === "speed" && !this.onLight) buckets.forEach((p, b) => { ctx.strokeStyle = this.markColors[b].replace(/[\d.]+\)$/, "0.1)"); ctx.lineWidth = (3.6 + b * 0.5) * scale; ctx.stroke(p) })
    buckets.forEach((p, b) => { ctx.strokeStyle = this.markColors[b]; ctx.lineWidth = this.markWidths[b] * scale; ctx.stroke(p) })
  }

  /** Evenly spread screen points over the disc, as staggered rows */
  private screenGrid(spacing: number, fn: (x: number, y: number, lon: number, lat: number, row: number) => void) {
    const { proj } = this, out: [number, number] = [0, 0]
    const rowH = spacing * 0.866
    let row = 0
    for (let y = proj.cy - proj.R; y <= proj.cy + proj.R; y += rowH, row++) {
      for (let x = proj.cx - proj.R + (row % 2) * spacing * 0.5; x <= proj.cx + proj.R; x += spacing) {
        if (!proj.invert(x, y, out)) continue
        if ((x - proj.cx) ** 2 + (y - proj.cy) ** 2 > (proj.R * 0.965) ** 2) continue
        fn(x, y, out[0], out[1], row)
      }
    }
  }

  /** Screen direction (unit vector) of the wind at a point */
  private screenDir(x: number, y: number, lon: number, lat: number, u: number, v: number): [number, number] | null {
    const sp = Math.hypot(u, v)
    if (sp < 0.2) return null
    const cl = Math.max(0.2, Math.cos(lat * D2R)), e = 0.6
    if (!this.proj.project(lon + (u / sp) * e / cl, lat + (v / sp) * e)) return null
    const dx = this.proj.x - x, dy = this.proj.y - y, n = Math.hypot(dx, dy)
    return n < 1e-6 ? null : [dx / n, dy / n]
  }

  private arrows(ctx: CanvasRenderingContext2D) {
    const sp = clamp(this.proj.R / 11, 30, 44)
    ctx.lineCap = "round"; ctx.lineJoin = "round"
    this.screenGrid(sp, (x, y, lon, lat) => {
      const [u, v] = DATA.windAt(lon, lat), spd = Math.hypot(u, v)
      const dir = this.screenDir(x, y, lon, lat, u, v)
      if (!dir) return
      const len = 5 + 18 * clamp(spd / 22, 0, 1), [dx, dy] = dir
      const x0 = x - dx * len / 2, y0 = y - dy * len / 2, x1 = x + dx * len / 2, y1 = y + dy * len / 2
      const b = Math.min(7, Math.floor(spd / 3.5))
      ctx.strokeStyle = this.markColors[b]; ctx.lineWidth = 1 + b * 0.12
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1)
      const hl = 3.6 + len * 0.16, a = 0.5
      ctx.moveTo(x1 - hl * (dx * Math.cos(a) - dy * Math.sin(a)), y1 - hl * (dy * Math.cos(a) + dx * Math.sin(a)))
      ctx.lineTo(x1, y1)
      ctx.lineTo(x1 - hl * (dx * Math.cos(a) + dy * Math.sin(a)), y1 - hl * (dy * Math.cos(a) - dx * Math.sin(a)))
      ctx.stroke()
    })
  }

  private barbs(ctx: CanvasRenderingContext2D) {
    const sp = clamp(this.proj.R / 9, 38, 54)
    ctx.lineCap = "round"; ctx.lineJoin = "round"
    this.screenGrid(sp, (x, y, lon, lat) => {
      const [u, v] = DATA.windAt(lon, lat), kt = Math.hypot(u, v) / KT2MS
      const b = Math.min(7, Math.floor(Math.hypot(u, v) / 3.5))
      ctx.strokeStyle = this.markColors[b]; ctx.fillStyle = this.markColors[b]; ctx.lineWidth = 1.15
      if (kt < 3) { ctx.beginPath(); ctx.arc(x, y, 2.6, 0, 7); ctx.stroke(); return }
      const dir = this.screenDir(x, y, lon, lat, u, v)
      if (!dir) return
      // the staff points to where the wind comes FROM; feathers sit on the end of the staff
      const fx = -dir[0], fy = -dir[1], L = 25, ex = x + fx * L, ey = y + fy * L
      const side = lat >= 0 ? 1 : -1, nx = fy * side, ny = -fx * side
      let n = Math.round(kt / 5) * 5
      const flags = Math.floor(n / 50); n -= flags * 50
      const full = Math.floor(n / 10), half = n % 10 >= 5 ? 1 : 0
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke()
      let p = 0
      for (let i = 0; i < flags; i++) {
        ctx.beginPath(); ctx.moveTo(ex - fx * p, ey - fy * p)
        ctx.lineTo(ex - fx * p + nx * 10, ey - fy * p + ny * 10)
        ctx.lineTo(ex - fx * (p + 5), ey - fy * (p + 5)); ctx.closePath(); ctx.fill(); p += 6.5
      }
      if (flags === 0 && full === 0 && half === 1) p += 3.4
      ctx.beginPath()
      for (let i = 0; i < full; i++) { ctx.moveTo(ex - fx * p, ey - fy * p); ctx.lineTo(ex - fx * p + nx * 9 + fx * 2.5, ey - fy * p + ny * 9 + fy * 2.5); p += 3.4 }
      if (half) { ctx.moveTo(ex - fx * p, ey - fy * p); ctx.lineTo(ex - fx * p + nx * 4.5 + fx * 1.2, ey - fy * p + ny * 4.5 + fy * 1.2) }
      ctx.stroke()
    })
  }

  private prepareFlow() {
    const { proj } = this
    for (const ln of DATA.STREAMLINES) {
      const p = ln.pts
      let path = new Path2D(), pen = false, count = 0
      const flush = () => { if (count > 3) this.flow.push({ path, speed: ln.speed, phase: Math.random() * 40 }); path = new Path2D(); count = 0 }
      for (let i = 0; i < p.length; i += 2) {
        if (!proj.project(p[i], p[i + 1]) || proj.cosc < 0.03) { if (pen) flush(); pen = false; continue }
        if (pen) path.lineTo(proj.x, proj.y); else { path.moveTo(proj.x, proj.y); pen = true }
        count++
      }
      if (pen) flush()
    }
  }

  private prepareShimmer() {
    const sp = clamp(this.proj.R / 30, 11, 15)
    this.screenGrid(sp, (x, y, lon, lat) => {
      const [u, v] = DATA.windAt(lon, lat), spd = Math.hypot(u, v)
      const dir = this.screenDir(x, y, lon, lat, u, v)
      if (dir) this.shimmer.push({ x, y, dx: dir[0], dy: dir[1], s: spd, ph: Math.random() * 6.28 })
    })
  }

  // ---------------------------------------------------------------- particles
  private spawn(p: { lon: number; lat: number; age: number; max: number }) {
    const { proj } = this, out: [number, number] = [0, 0]
    for (let k = 0; k < 8; k++) {
      const x = proj.cx + (Math.random() * 2 - 1) * proj.R, y = proj.cy + (Math.random() * 2 - 1) * proj.R
      if ((x - proj.cx) ** 2 + (y - proj.cy) ** 2 > proj.R * proj.R * 0.98) continue
      if (proj.invert(x, y, out)) { p.lon = out[0]; p.lat = out[1]; p.age = 0; p.max = 30 + Math.random() * 80; return }
    }
    p.age = 0; p.max = 0
  }

  private stepParticles() {
    const ctx = this.ctxT, { w, h, dpr, proj, cfg } = this
    const glow = cfg.wind === "glow"
    const N = Math.round(clamp((w * h) / 250, 700, 5000)) * (glow ? 0.8 : 1)
    if (this.parts.length !== Math.round(N)) {
      this.parts = Array.from({ length: Math.round(N) }, () => ({ lon: 0, lat: 0, age: 1, max: 0 }))
      this.parts.forEach(p => { this.spawn(p); p.age = Math.floor(Math.random() * p.max) })
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.globalCompositeOperation = "destination-in"; ctx.fillStyle = `rgba(0,0,0,${glow ? 0.93 : 0.92})`; ctx.fillRect(0, 0, w, h)
    ctx.globalCompositeOperation = glow ? "lighter" : "source-over"
    const k = 0.11 / proj.R * R2D
    const buckets: Path2D[] = glow || cfg.color === "speed" ? Array.from({ length: 8 }, () => new Path2D()) : [new Path2D()]
    const byBucket = buckets.length > 1
    for (const p of this.parts) {
      if (p.age >= p.max) { this.spawn(p); continue }
      if (!proj.project(p.lon, p.lat)) { p.age = p.max; continue }
      const ax = proj.x, ay = proj.y
      const [u, v] = DATA.windAt(p.lon, p.lat)
      p.lat += v * k; p.lon += (u * k) / Math.max(0.08, Math.cos(p.lat * D2R)); p.age++
      if (p.lat > 88 || p.lat < -88 || !proj.project(p.lon, p.lat) || proj.cosc < 0.02) { p.age = p.max; continue }
      if ((proj.x - ax) ** 2 + (proj.y - ay) ** 2 < 0.2) continue // too slow to show as a streak, it would only be a dot
      const path = buckets[byBucket ? Math.min(7, Math.floor(Math.hypot(u, v) / 3.5)) : 0]
      path.moveTo(ax, ay); path.lineTo(proj.x, proj.y)
    }
    ctx.lineCap = "round"
    if (!byBucket) { ctx.strokeStyle = this.plainMark(0.8); ctx.lineWidth = 0.85; ctx.stroke(buckets[0]) }
    else buckets.forEach((p, b) => {
      if (glow) {
        ctx.strokeStyle = this.markColors[b].replace(/[\d.]+\)$/, "0.14)"); ctx.lineWidth = 3.4; ctx.stroke(p)
        ctx.strokeStyle = this.markColors[b]; ctx.lineWidth = 1.05 + b * 0.05; ctx.stroke(p)
      } else { ctx.strokeStyle = this.markColors[b]; ctx.lineWidth = 0.95; ctx.stroke(p) }
    })
    ctx.globalCompositeOperation = "source-over"
  }

  // ---------------------------------------------------------------- live layer: flow, shimmer, storms
  private drawLive() {
    const ctx = this.ctxL, { w, h, dpr, proj, cfg } = this, t = this.time
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    const rest = this.restKey === this.key
    ctx.save(); ctx.beginPath(); ctx.arc(proj.cx, proj.cy, proj.R, 0, Math.PI * 2); ctx.clip()
    if (rest && cfg.wind === "flow") {
      ctx.lineCap = "round"
      const light = this.onLight
      for (const f of this.flow) {
        const b = Math.min(7, Math.floor(f.speed / 3.5))
        ctx.strokeStyle = this.markColors[b] || (light ? "#222" : "#fff")
        ctx.lineWidth = 0.9 + b * 0.2
        const dash = 4 + b * 1.6, gap = 12 + (7 - b) * 2.4
        ctx.setLineDash([dash, gap])
        ctx.lineDashOffset = -(t * (10 + f.speed * 3.2) + f.phase)
        ctx.stroke(f.path)
      }
      ctx.setLineDash([])
    } else if (rest && cfg.wind === "shimmer") {
      ctx.lineCap = "round"
      for (const s of this.shimmer) {
        const b = Math.min(7, Math.floor(s.s / 3.5))
        const ph = 0.5 + 0.5 * Math.sin(t * (1.4 + s.s * 0.05) + s.ph)
        const len = (2.2 + clamp(s.s / 22, 0, 1) * 10) * (0.45 + ph * 0.75)
        ctx.strokeStyle = this.markColors[b]; ctx.globalAlpha = 0.35 + ph * 0.65; ctx.lineWidth = 1.1 + b * 0.1
        ctx.beginPath(); ctx.moveTo(s.x - s.dx * len * 0.5, s.y - s.dy * len * 0.5); ctx.lineTo(s.x + s.dx * len * 0.5, s.y + s.dy * len * 0.5); ctx.stroke()
      }
      ctx.globalAlpha = 1
    }
    ctx.restore()
    this.storms(ctx)
  }

  private storms(ctx: CanvasRenderingContext2D) {
    const { proj, cfg } = this, t = this.time, labels: Labels = []
    const light = this.onLight
    for (const s of DATA.STORMS) {
      const tr = s.track, last = tr[tr.length - 1]
      const colorOf = (kt: number) => hex(levelFor(kt).color)
      // ---- track
      ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round"
      const seg = (a: { lon: number; lat: number }, b: { lon: number; lat: number }, width: number, color: string) => {
        if (!proj.project(a.lon, a.lat)) return
        const ax = proj.x, ay = proj.y
        if (!proj.project(b.lon, b.lat)) return
        ctx.strokeStyle = color; ctx.lineWidth = width
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(proj.x, proj.y); ctx.stroke()
      }
      for (let i = 1; i < tr.length; i++) {
        const c = colorOf(tr[i].kt)
        if (cfg.storms === "rings") { seg(tr[i - 1], tr[i], 1.6 + tr[i].kt / 36, rgba(c, 0.16)); seg(tr[i - 1], tr[i], 1 + tr[i].kt / 90, rgba(c, 0.85)) }
        else seg(tr[i - 1], tr[i], 1.6, rgba(c, 0.95))
      }
      if (cfg.storms === "eye") for (const p of tr) if (proj.project(p.lon, p.lat)) { ctx.fillStyle = rgba(colorOf(p.kt), 0.95); ctx.beginPath(); ctx.arc(proj.x, proj.y, 1.8, 0, 7); ctx.fill() }
      // forecast
      const fc = s.forecast.filter(f => f.h > 0)
      if (fc.length) {
        ctx.setLineDash(cfg.storms === "eye" ? [1, 5] : [5, 5])
        const ink = light ? "rgba(30,30,30,0.8)" : "rgba(255,255,255,0.85)"
        let prev: { lon: number; lat: number } = last
        for (const f of fc) { seg(prev, f, 1.4, ink); prev = f }
        ctx.setLineDash([])
        for (const f of fc) if (f.h % 24 === 0 && proj.project(f.lon, f.lat)) {
          ctx.fillStyle = light ? "#fff" : "#000"; ctx.strokeStyle = ink; ctx.lineWidth = 1.2
          ctx.beginPath(); ctx.arc(proj.x, proj.y, 2.8, 0, 7); ctx.fill(); ctx.stroke()
        }
      }
      ctx.restore()
      // ---- marker
      if (!proj.project(last.lon, last.lat) || proj.cosc < 0.05) continue
      const x = proj.x, y = proj.y, c = colorOf(last.kt), r = 9 + last.kt / 11
      ctx.save(); ctx.translate(x, y)
      const north = last.lat >= 0, spin = (north ? -1 : 1)
      if (cfg.storms === "spiral") {
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.7); g.addColorStop(0, rgba(c, 0.38)); g.addColorStop(1, rgba(c, 0))
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * 1.7, 0, 7); ctx.fill()
        ctx.lineCap = "round"; ctx.lineWidth = 2.2
        for (let k = 0; k < 2; k++) {
          ctx.beginPath()
          for (let i = 0; i <= 28; i++) {
            const th = (i / 28) * Math.PI * 1.9, rho = (0.18 + 0.82 * (i / 28)) * r
            const a = t * 1.4 * spin + k * Math.PI - spin * th
            const px = Math.cos(a) * rho, py = Math.sin(a) * rho
            i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)
          }
          ctx.strokeStyle = rgba(c, 0.95); ctx.stroke()
        }
        ctx.fillStyle = light ? "#1a1a1a" : "#fff"; ctx.beginPath(); ctx.arc(0, 0, 2.6, 0, 7); ctx.fill()
      } else if (cfg.storms === "rings") {
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2); g.addColorStop(0, rgba(c, 0.42)); g.addColorStop(1, rgba(c, 0))
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * 2, 0, 7); ctx.fill()
        for (let i = 0; i < 3; i++) {
          const ph = (t * 0.45 + i / 3) % 1
          ctx.strokeStyle = rgba(c, (1 - ph) * 0.9); ctx.lineWidth = 1.6 * (1 - ph) + 0.5
          ctx.beginPath(); ctx.arc(0, 0, r * (0.3 + 1.5 * ph), 0, 7); ctx.stroke()
        }
        ctx.fillStyle = rgba(c, 1); ctx.beginPath(); ctx.arc(0, 0, 3.4, 0, 7); ctx.fill()
        ctx.strokeStyle = light ? "#1a1a1a" : "#fff"; ctx.lineWidth = 1.2; ctx.stroke()
      } else {
        ctx.fillStyle = rgba(c, 0.22); ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill()
        ctx.strokeStyle = rgba(c, 1); ctx.lineWidth = 2; ctx.stroke()
        const tick = light ? "#1a1a1a" : "#fff"
        ctx.strokeStyle = tick; ctx.lineWidth = 1.2
        ctx.beginPath()
        for (let k = 0; k < 4; k++) { const a = (k * Math.PI) / 2; ctx.moveTo(Math.cos(a) * (r + 3), Math.sin(a) * (r + 3)); ctx.lineTo(Math.cos(a) * (r + 8), Math.sin(a) * (r + 8)) }
        ctx.stroke()
        ctx.fillStyle = tick; ctx.beginPath(); ctx.arc(0, 0, 2.8, 0, 7); ctx.fill()
      }
      ctx.restore()
      labels.push({ id: s.id, name: s.name, text: `${Math.round(last.kt * 1.852)} km/h`, x: x + r + 6, y, color: `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` })
    }
    this.onLabels(labels)
  }
}
