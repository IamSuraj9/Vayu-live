// What the looks are drawn from: the live wind, pressure and temperature field (re-sampled to a 1° grid), the map,
// and shapes worked out from them (pressure lines, highs and lows, streamlines). The shapes are built the first time
// a look asks for them, and again whenever a new field arrives.
import { geoEquirectangular, geoPath } from "d3-geo"
import { LOW, loadHigh, type WorldLines } from "@/globe/world"
import { oneDegree } from "@/globe/field"
import { wrap360 } from "./geo"

export { LIGHTS } from "./lights"

export const NI = 360, NJ = 181 // 1 degree, north row first, lon 0..359
const LA1 = 90
const N = NI * NJ

// Live bindings: importers see the new arrays after setField()
export let U = new Float32Array(N), V = new Float32Array(N)
export let TEMP = new Float32Array(N) // K
export let HPA = new Float32Array(N) // sea-level pressure, hPa
export let SPD = new Float32Array(N)
export let GE = new Float32Array(N), GN = new Float32Array(N) // pressure slope per degree (east, north), for the relief look
export let fieldVersion = 0

/** Box blur twice (about a Gaussian), so the 1 hPa steps do not show as terraces or jagged isobars */
function blur(src: Float32Array, r: number, passes: number) {
  let a = src, b = new Float32Array(src.length)
  for (let k = 0; k < passes; k++) {
    for (let j = 0; j < NJ; j++) for (let i = 0; i < NI; i++) { let s = 0; for (let d = -r; d <= r; d++) s += a[j * NI + ((i + d + NI) % NI)]; b[j * NI + i] = s / (2 * r + 1) }
    const c = new Float32Array(src.length)
    for (let j = 0; j < NJ; j++) for (let i = 0; i < NI; i++) { let s = 0; for (let d = -r; d <= r; d++) s += b[Math.min(NJ - 1, Math.max(0, j + d)) * NI + i]; c[j * NI + i] = s / (2 * r + 1) }
    a = c
  }
  return a
}

type Iso = { level: number; major: boolean; seg: Seg }
type CentreT = { lon: number; lat: number; p: number; kind: "H" | "L" }
let iso: Iso[] | null = null, cen: CentreT[] | null = null, str: Line[] | null = null

/** Take the app's current wind field. Returns false while no field has loaded. */
export function setField(): boolean {
  const f = oneDegree()
  if (!f) return false
  U = f.u; V = f.v; TEMP = f.t
  HPA = blur(f.p, 2, 2)
  SPD = new Float32Array(N)
  for (let i = 0; i < N; i++) SPD[i] = Math.hypot(U[i], V[i])
  GE = new Float32Array(N); GN = new Float32Array(N)
  for (let j = 0; j < NJ; j++) for (let i = 0; i < NI; i++) {
    const e = HPA[j * NI + ((i + 1) % NI)], w = HPA[j * NI + ((i + NI - 1) % NI)]
    const n = HPA[Math.max(0, j - 1) * NI + i], s = HPA[Math.min(NJ - 1, j + 1) * NI + i]
    GE[j * NI + i] = (e - w) / 2
    GN[j * NI + i] = (n - s) / 2
  }
  iso = null; cen = null; str = null
  fieldVersion++
  return true
}

/** Bilinear sample of a field at lon (any) and lat. */
export function bil(arr: Float32Array, lon: number, lat: number) {
  const x = wrap360(lon), y = Math.min(NJ - 1.001, Math.max(0, LA1 - lat))
  const i0 = x | 0, j0 = y | 0, i1 = (i0 + 1) % NI
  const fx = x - i0, fy = y - j0
  const a = arr[j0 * NI + i0], b = arr[j0 * NI + i1], c = arr[(j0 + 1) * NI + i0], d = arr[(j0 + 1) * NI + i1]
  return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy
}
export const windAt = (lon: number, lat: number): [number, number] => [bil(U, lon, lat), bil(V, lon, lat)]

// ---------- map ----------
export const MAP_LIGHT: WorldLines = LOW
let FINE: WorldLines | null = null
export const mapFine = (): WorldLines => FINE ?? LOW

// Land/sea mask on an equirectangular raster: lets every look ask "is this point land?" in constant time
export const MW = 2048, MH = 1024
export let MASK = new Uint8Array(MW * MH)
/** Loads the detailed map and builds the land mask. Call once before drawing. */
export async function init() {
  if (FINE) return
  const fine = await loadHigh()
  const c = document.createElement("canvas"); c.width = MW; c.height = MH
  const ctx = c.getContext("2d", { willReadFrequently: true })!
  const proj = geoEquirectangular().scale(MW / (2 * Math.PI)).translate([MW / 2, MH / 2])
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, MW, MH)
  ctx.fillStyle = "#fff"; ctx.beginPath(); geoPath(proj, ctx)(fine.land); ctx.fill()
  const px = ctx.getImageData(0, 0, MW, MH).data, out = new Uint8Array(MW * MH)
  for (let i = 0; i < out.length; i++) out[i] = px[i * 4]
  MASK = out
  FINE = fine
}
function landAt(lon: number, lat: number) {
  const l = ((lon + 180) % 360 + 360) % 360
  const x = Math.min(MW - 1, (l / 360 * MW) | 0), y = Math.min(MH - 1, Math.max(0, ((90 - lat) / 180 * MH) | 0))
  return MASK[y * MW + x] > 127
}

// Evenly spread points over the sphere (for the dot-matrix globe), built the first time the Dots look needs them
let dotsCache: { land: Float32Array; sea: Float32Array; spacing: number } | null = null
export function dots() {
  if (dotsCache) return dotsCache
  const n = 20000, land: number[] = [], sea: number[] = [], ga = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < n; i++) {
    const lat = Math.asin(1 - 2 * (i + 0.5) / n) * 180 / Math.PI
    const lon = ((i * ga * 180 / Math.PI + 180) % 360 + 360) % 360 - 180
    ;(landAt(lon, lat) ? land : sea).push(lon, lat)
  }
  return (dotsCache = { land: new Float32Array(land), sea: new Float32Array(sea), spacing: Math.sqrt(4 * Math.PI / n) }) // spacing in radians
}

// ---------- pressure lines (marching squares on the 1 degree grid) ----------
export type Seg = Float32Array // lon1, lat1, lon2, lat2, ...
const ISO_LEVELS: number[] = []
for (let p = 940; p <= 1060; p += 4) ISO_LEVELS.push(p)
export function isobars(): Iso[] {
  if (iso) return iso
  const out: Iso[] = []
  const at = (i: number, j: number) => HPA[j * NI + (i % NI)]
  for (const t of ISO_LEVELS) {
    const s: number[] = []
    for (let j = 4; j < NJ - 5; j++) { // skip the polar rows, where the sea-level pressure is not meaningful
      const lat0 = LA1 - j, lat1 = lat0 - 1
      for (let i = 0; i < NI; i++) {
        const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1)
        const idx = (a > t ? 8 : 0) | (b > t ? 4 : 0) | (c > t ? 2 : 0) | (d > t ? 1 : 0)
        if (idx === 0 || idx === 15) continue
        const lon0 = i, lon1 = i + 1
        const top = () => [lon0 + (t - a) / (b - a), lat0], right = () => [lon1, lat0 - (t - b) / (c - b)]
        const bottom = () => [lon0 + (t - d) / (c - d), lat1], left = () => [lon0, lat0 - (t - a) / (d - a)]
        const push = (p: number[], q: number[]) => s.push(p[0], p[1], q[0], q[1])
        const centre = (a + b + c + d) / 4 > t
        switch (idx) {
          case 1: case 14: push(left(), bottom()); break
          case 2: case 13: push(bottom(), right()); break
          case 3: case 12: push(left(), right()); break
          case 4: case 11: push(top(), right()); break
          case 6: case 9: push(top(), bottom()); break
          case 7: case 8: push(top(), left()); break
          case 5: if (centre) { push(top(), left()); push(bottom(), right()) } else { push(top(), right()); push(left(), bottom()) } break
          case 10: if (centre) { push(top(), right()); push(left(), bottom()) } else { push(top(), left()); push(bottom(), right()) } break
        }
      }
    }
    if (s.length) out.push({ level: t, major: t % 20 === 0, seg: new Float32Array(s) })
  }
  return (iso = out)
}

/** Highs and lows: the strongest extremes, spaced apart */
export function centres(): CentreT[] {
  if (cen) return cen
  const found: CentreT[] = []
  const win = 7
  for (let j = 14; j < NJ - 14; j++) for (let i = 0; i < NI; i++) {
    const p = HPA[j * NI + i]
    if (p > 1008 && p < 1022) continue
    let min = true, max = true
    for (let dj = -win; dj <= win && (min || max); dj++) for (let di = -win; di <= win; di++) {
      const q = HPA[(j + dj) * NI + ((i + di + NI) % NI)]
      if (q < p) min = false
      if (q > p) max = false
    }
    if (min && p <= 1008) found.push({ lon: i, lat: LA1 - j, p, kind: "L" })
    else if (max && p >= 1022) found.push({ lon: i, lat: LA1 - j, p, kind: "H" })
  }
  found.sort((a, b) => Math.abs(b.p - 1013) - Math.abs(a.p - 1013))
  const kept: CentreT[] = []
  for (const f of found) {
    if (kept.every(k => Math.hypot((((k.lon - f.lon + 540) % 360) - 180) * Math.cos(f.lat * Math.PI / 180), k.lat - f.lat) > 16)) kept.push(f)
  }
  return (cen = kept)
}

// ---------- streamlines: long smooth curves that follow the wind ----------
export type Line = { pts: Float32Array; speed: number } // lon, lat pairs; mean speed in m/s
export function streamlines(): Line[] {
  if (str) return str
  const cell = 1.7, cols = Math.ceil(360 / cell), occ = new Int32Array(cols * Math.ceil(180 / cell))
  const key = (lon: number, lat: number) => Math.floor((90 - lat) / cell) * cols + Math.floor(wrap360(lon) / cell)
  let seed = 7
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
  const seeds: [number, number][] = []
  for (let lat = -80; lat <= 80; lat += cell) for (let lon = 0; lon < 360; lon += cell / Math.max(0.2, Math.cos(lat * Math.PI / 180))) seeds.push([lon + rnd() * cell, lat + rnd() * cell])
  for (let i = seeds.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [seeds[i], seeds[j]] = [seeds[j], seeds[i]] }
  const ds = 0.7, out: Line[] = []
  let id = 0
  const trace = (lon: number, lat: number, dir: number, maxSteps: number) => {
    const pts: number[] = []
    for (let s = 0; s < maxSteps; s++) {
      const [u, v] = windAt(lon, lat), sp = Math.hypot(u, v)
      if (sp < 0.7 || Math.abs(lat) > 82) break
      const cl = Math.max(0.15, Math.cos(lat * Math.PI / 180))
      const lon2 = lon + dir * (u / sp) * ds * 0.5 / cl, lat2 = lat + dir * (v / sp) * ds * 0.5
      const [u2, v2] = windAt(lon2, lat2), sp2 = Math.hypot(u2, v2)
      if (sp2 < 0.7) break
      lon += dir * (u2 / sp2) * ds / cl; lat += dir * (v2 / sp2) * ds
      const k = key(lon, lat)
      if (occ[k] !== 0 && occ[k] !== id) break // another curve is already here
      occ[k] = id
      pts.push(lon, lat)
    }
    return pts
  }
  for (const [lon, lat] of seeds) {
    if (occ[key(lon, lat)]) continue
    id++
    occ[key(lon, lat)] = id
    const f = trace(lon, lat, 1, 140), b = trace(lon, lat, -1, 140)
    const n = f.length / 2 + b.length / 2
    if (n < 14) continue
    const pts = new Float32Array((n + 1) * 2)
    let o = 0
    for (let i = b.length - 2; i >= 0; i -= 2) { pts[o++] = b[i]; pts[o++] = b[i + 1] }
    pts[o++] = lon; pts[o++] = lat
    for (let i = 0; i < f.length; i += 2) { pts[o++] = f[i]; pts[o++] = f[i + 1] }
    let sum = 0; for (let i = 0; i < pts.length; i += 2) sum += bil(SPD, pts[i], pts[i + 1])
    out.push({ pts, speed: sum / (pts.length / 2) })
  }
  return (str = out)
}
