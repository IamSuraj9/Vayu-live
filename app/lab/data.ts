// Everything the looks are drawn from: today's wind, pressure and temperature, the storms, and the map.
import wind from "./data/wind-1.json"
import stormFile from "./data/storms.json"
import { feature, mesh } from "topojson-client"
import { geoEquirectangular, geoPath } from "d3-geo"
import topo50 from "world-atlas/countries-50m.json"
import topo110 from "world-atlas/countries-110m.json"
import { wrap360 } from "./geo"

export const FIELD_TIME = wind.time as string
export const STORMS_FETCHED = stormFile.fetchedAt as string
export const NI = wind.grid.ni, NJ = wind.grid.nj // 360 x 181, 1 degree, north row first, lon 0..359
const LA1 = wind.grid.la1

function dec(b64: string, [scale, offset]: number[]) {
  const bin = atob(b64), out = new Float32Array(bin.length)
  for (let i = 0; i < bin.length; i++) { let b = bin.charCodeAt(i); if (b > 127) b -= 256; out[i] = b / scale + offset }
  return out
}
export const U = dec(wind.u, wind.scale.u), V = dec(wind.v, wind.scale.v)
export const TEMP = dec(wind.t, wind.scale.t) // K
const HPA_RAW = dec(wind.p, wind.scale.p).map(p => p / 100) // sea-level pressure, hPa, stored in 1 hPa steps
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
export const HPA = blur(HPA_RAW, 2, 2)
export const SPD = new Float32Array(NI * NJ)
for (let i = 0; i < SPD.length; i++) SPD[i] = Math.hypot(U[i], V[i])

// Pressure slope per degree (east, north), used for the relief look
export const GE = new Float32Array(NI * NJ), GN = new Float32Array(NI * NJ)
for (let j = 0; j < NJ; j++) for (let i = 0; i < NI; i++) {
  const e = HPA[j * NI + ((i + 1) % NI)], w = HPA[j * NI + ((i + NI - 1) % NI)]
  const n = HPA[Math.max(0, j - 1) * NI + i], s = HPA[Math.min(NJ - 1, j + 1) * NI + i]
  GE[j * NI + i] = (e - w) / 2
  GN[j * NI + i] = (n - s) / 2
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lines(topo: any) {
  return {
    land: feature(topo, topo.objects.land),
    coast: mesh(topo, topo.objects.land),
    borders: mesh(topo, topo.objects.countries, (a: unknown, b: unknown) => a !== b),
  }
}
export const MAP_FINE = lines(topo50)
export const MAP_LIGHT = lines(topo110)

// Land/sea mask on an equirectangular raster: lets every look ask "is this point land?" in constant time
export const MW = 2048, MH = 1024
export const MASK = (() => {
  const c = document.createElement("canvas"); c.width = MW; c.height = MH
  const ctx = c.getContext("2d")!
  const proj = geoEquirectangular().scale(MW / (2 * Math.PI)).translate([MW / 2, MH / 2])
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, MW, MH)
  ctx.fillStyle = "#fff"; ctx.beginPath(); geoPath(proj, ctx)(MAP_FINE.land); ctx.fill()
  const px = ctx.getImageData(0, 0, MW, MH).data, out = new Uint8Array(MW * MH)
  for (let i = 0; i < out.length; i++) out[i] = px[i * 4]
  return out
})()
export function landAt(lon: number, lat: number) {
  const l = ((lon + 180) % 360 + 360) % 360
  const x = Math.min(MW - 1, (l / 360 * MW) | 0), y = Math.min(MH - 1, Math.max(0, ((90 - lat) / 180 * MH) | 0))
  return MASK[y * MW + x] > 127
}
/** lon in 0..360 -> raster uses -180..180 */
export const landAt360 = (lon: number, lat: number) => landAt(lon > 180 ? lon - 360 : lon, lat)

// Evenly spread points over the sphere (for the dot-matrix globe)
export const DOTS = (() => {
  const N = 20000, land: number[] = [], sea: number[] = [], ga = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < N; i++) {
    const lat = Math.asin(1 - 2 * (i + 0.5) / N) * 180 / Math.PI
    const lon = ((i * ga * 180 / Math.PI + 180) % 360 + 360) % 360 - 180
    ;(landAt(lon, lat) ? land : sea).push(lon, lat)
  }
  return { land: new Float32Array(land), sea: new Float32Array(sea), spacing: Math.sqrt(4 * Math.PI / N) } // spacing in radians
})()

// ---------- pressure lines (marching squares on the 1 degree grid) ----------
export const ISO_LEVELS: number[] = []
for (let p = 940; p <= 1060; p += 4) ISO_LEVELS.push(p)
export type Seg = Float32Array // lon1, lat1, lon2, lat2, ...
export const ISOBARS: { level: number; major: boolean; seg: Seg }[] = (() => {
  const out: { level: number; major: boolean; seg: Seg }[] = []
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
  return out
})()

/** Highs and lows: the strongest extremes, spaced apart */
export const CENTRES: { lon: number; lat: number; p: number; kind: "H" | "L" }[] = (() => {
  const found: { lon: number; lat: number; p: number; kind: "H" | "L" }[] = []
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
  const kept: typeof found = []
  for (const f of found) {
    if (kept.every(k => Math.hypot((((k.lon - f.lon + 540) % 360) - 180) * Math.cos(f.lat * Math.PI / 180), k.lat - f.lat) > 16)) kept.push(f)
  }
  return kept
})()

// ---------- streamlines: long smooth curves that follow the wind ----------
export type Line = { pts: Float32Array; speed: number } // lon, lat pairs; mean speed in m/s
export const STREAMLINES: Line[] = (() => {
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
  return out
})()

// ---------- storms ----------
export type Pt = { t: string; lat: number; lon: number; kt: number }
export type Fc = { h: number; lat: number; lon: number; kt: number }
export type Storm = { id: string; name: string; basin: string; kind: string; track: Pt[]; forecast: Fc[] }
export const STORMS = stormFile.storms as unknown as Storm[]

// ---------- a sample of large world cities, for the night-side lights (illustrative, not a data layer) ----------
export const LIGHTS: [number, number][] = [
  [28.6, 77.2], [19.1, 72.9], [22.6, 88.4], [13.1, 80.3], [12.97, 77.6], [17.4, 78.5], [23.0, 72.6], [18.5, 73.9], [26.9, 75.8], [26.8, 80.9], [20.3, 85.8], [31.5, 74.3], [24.9, 67.0], [23.8, 90.4],
  [35.7, 139.7], [34.7, 135.5], [35.2, 136.9], [37.6, 127.0], [35.2, 129.1], [39.9, 116.4], [31.2, 121.5], [23.1, 113.3], [22.5, 114.1], [30.6, 104.1], [29.6, 106.5], [30.6, 114.3], [34.3, 108.9], [22.3, 114.2], [25.0, 121.6], [38.0, 114.5], [36.7, 117.0], [32.1, 118.8], [30.3, 120.2],
  [14.6, 121.0], [10.8, 106.7], [21.0, 105.8], [13.8, 100.5], [3.1, 101.7], [1.35, 103.8], [-6.2, 106.8], [-7.3, 112.7], [16.8, 96.2], [11.6, 104.9],
  [35.7, 51.4], [33.3, 44.4], [41.0, 29.0], [39.9, 32.9], [24.7, 46.7], [21.5, 39.2], [25.3, 55.3], [31.8, 35.2], [30.0, 31.2], [31.2, 29.9], [24.1, 32.9], [36.8, 10.2], [33.6, -7.6], [36.7, 3.1],
  [6.5, 3.4], [9.1, 7.5], [5.6, -0.2], [14.7, -17.4], [9.0, 38.7], [-1.3, 36.8], [-6.8, 39.3], [0.3, 32.6], [-4.3, 15.3], [-26.2, 28.0], [-33.9, 18.4], [-29.9, 31.0], [-25.9, 32.6], [-18.9, 47.5], [15.6, 32.5], [12.6, -8.0],
  [51.5, -0.1], [48.9, 2.35], [52.5, 13.4], [40.4, -3.7], [41.4, 2.2], [41.9, 12.5], [45.5, 9.2], [50.1, 14.4], [48.2, 16.4], [59.3, 18.1], [55.7, 12.6], [52.4, 4.9], [50.8, 4.4], [53.3, -6.3], [38.7, -9.1], [37.98, 23.7], [47.5, 19.0], [44.4, 26.1], [50.4, 30.5], [59.9, 30.3], [55.8, 37.6], [56.8, 60.6], [55.0, 82.9],
  [40.7, -74.0], [34.1, -118.2], [41.9, -87.6], [29.8, -95.4], [32.8, -96.8], [33.7, -84.4], [25.8, -80.2], [47.6, -122.3], [37.8, -122.4], [39.7, -105.0], [33.4, -112.1], [38.9, -77.0], [42.4, -71.1], [43.7, -79.4], [45.5, -73.6], [49.3, -123.1], [19.4, -99.1], [20.7, -103.3], [25.7, -100.3], [9.0, -79.5], [23.1, -82.4],
  [4.7, -74.1], [-12.0, -77.0], [-33.4, -70.7], [-34.6, -58.4], [-23.5, -46.6], [-22.9, -43.2], [-15.8, -47.9], [-3.1, -60.0], [10.5, -66.9], [-0.2, -78.5], [-12.9, -38.5], [-8.1, -34.9], [-25.3, -57.6], [-34.9, -56.2],
  [-33.9, 151.2], [-37.8, 145.0], [-27.5, 153.0], [-31.95, 115.9], [-34.9, 138.6], [-36.85, 174.8], [-41.3, 174.8], [64.1, -21.9], [61.2, -149.9], [21.3, -157.9],
]
