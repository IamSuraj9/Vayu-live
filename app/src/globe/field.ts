type Grid = { lo1: number; la1: number; dx: number; dy: number; ni: number; nj: number }
type Scale = [number, number]
/** data/wind.json and data/wind-1.json, written by pipeline/wind.py */
export type WindFile = { time: string; source: string; grid: Grid; dtype: "int8" | "int16"; scale: Record<"u" | "v" | "t" | "p", Scale>; u: string; v: string; t: string; p: string }

function decode(b64: string, dtype: "int8" | "int16", [scale, offset]: Scale) {
  const bin = atob(b64)
  const buf = new ArrayBuffer(bin.length)
  const bytes = new Uint8Array(buf)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const ints = dtype === "int8" ? new Int8Array(buf) : new Int16Array(buf)
  const out = new Float32Array(ints.length)
  for (let i = 0; i < ints.length; i++) out[i] = ints[i] / scale + offset
  return out
}

// Empty until a wind file loads; until then the globe shows land without wind
let g: Grid = { lo1: 0, la1: 90, dx: 1, dy: 1, ni: 1, nj: 2 }
let U = new Float32Array(2), V = new Float32Array(2), T = new Float32Array(2), P = new Float32Array(2)

export let FIELD_TIME = ""
export const FIELD_SOURCE = "GFS model, NOAA/NCEP"
export let FIELD_READY = false

/** Swap in a field. Returns false (and keeps the current one) if the file does not look right. */
export function loadWind(doc: WindFile): boolean {
  const n = doc.grid.ni * doc.grid.nj
  const next = { u: decode(doc.u, doc.dtype, doc.scale.u), v: decode(doc.v, doc.dtype, doc.scale.v), t: decode(doc.t, doc.dtype, doc.scale.t), p: decode(doc.p, doc.dtype, doc.scale.p) }
  if (!n || Object.values(next).some(a => a.length !== n)) return false
  g = doc.grid; U = next.u; V = next.v; T = next.t; P = next.p
  FIELD_TIME = doc.time
  FIELD_READY = true
  return true
}

/** Last resort when no wind file can be reached: the 1° field saved with the app (fetched only when needed).
 *  `apply` is read after the file is in hand, so a live field that loaded during the fetch is left in place. */
export async function loadBuiltIn(apply: () => boolean = () => true) {
  const { default: gfs } = await import("@/data/gfs.json")
  if (!apply()) return false
  const m = gfs.meta as Grid & { date: number; time: number }
  const d = String(m.date), t = String(m.time).padStart(4, "0")
  return loadWind({
    time: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${t.slice(0, 2)}:${t.slice(2)}:00Z`, source: FIELD_SOURCE,
    grid: m, dtype: "int16", scale: { u: [10, 0], v: [10, 0], t: [10, 200], p: [0.1, 0] }, u: gfs.u, v: gfs.v, t: gfs.t, p: gfs.p,
  })
}

function bilinear(arr: Float32Array, lon: number, lat: number) {
  const x = (((lon - g.lo1) % 360) + 360) % 360 / g.dx
  const y = Math.min(g.nj - 1.001, Math.max(0, (g.la1 - lat) / g.dy))
  const i0 = Math.floor(x) % g.ni, j0 = Math.floor(y)
  const i1 = (i0 + 1) % g.ni, j1 = j0 + 1
  const fx = x - Math.floor(x), fy = y - j0
  const a = arr[j0 * g.ni + i0], b = arr[j0 * g.ni + i1], c = arr[j1 * g.ni + i0], d = arr[j1 * g.ni + i1]
  return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy
}

/** The current field on a 1° grid (360 x 181, lon 0..359, north row first): u and v in m/s, t in K, p in hPa. Null until a field has loaded. */
export function oneDegree() {
  if (!FIELD_READY) return null
  const n = 360 * 181, u = new Float32Array(n), v = new Float32Array(n), t = new Float32Array(n), p = new Float32Array(n)
  for (let j = 0; j < 181; j++) for (let i = 0; i < 360; i++) {
    const k = j * 360 + i, lat = 90 - j
    u[k] = bilinear(U, i, lat); v[k] = bilinear(V, i, lat); t[k] = bilinear(T, i, lat); p[k] = bilinear(P, i, lat) / 100
  }
  return { u, v, t, p }
}

export function windAt(lon: number, lat: number): [number, number] {
  return [bilinear(U, lon, lat), bilinear(V, lon, lat)]
}
/** Wind, temperature and pressure at a point, or null while no wind data has loaded */
export function sampleAt(lon: number, lat: number) {
  if (!FIELD_READY) return null
  const [u, v] = windAt(lon, lat)
  return { u, v, speed: Math.hypot(u, v), tempK: bilinear(T, lon, lat), hpa: bilinear(P, lon, lat) / 100,
    // meteorological convention: direction the wind blows FROM
    fromDeg: (Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360 }
}
