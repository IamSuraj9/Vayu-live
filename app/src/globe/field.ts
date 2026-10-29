import gfs from "@/data/gfs.json"

type Grid = { lo1: number; la1: number; dx: number; dy: number; ni: number; nj: number }
type Scale = [number, number]
/** data/wind.json, written by pipeline/wind.py */
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

// Built in: the 1° GFS field saved with the app, used until (or unless) data/wind.json loads
const m = gfs.meta as Grid & { date: number; time: number }
const builtInTime = (() => {
  const d = String(m.date), t = String(m.time).padStart(4, "0")
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${t.slice(0, 2)}:${t.slice(2)}:00Z`
})()

let g: Grid = m
let U = decode(gfs.u, "int16", [10, 0])
let V = decode(gfs.v, "int16", [10, 0])
let T = decode(gfs.t, "int16", [10, 200])
let P = decode(gfs.p, "int16", [0.1, 0]) // Pa

export let FIELD_TIME = builtInTime
export const FIELD_SOURCE = "GFS model, NOAA/NCEP"

/** Swap in a newer field. Returns false (and keeps the current one) if the file does not look right. */
export function loadWind(doc: WindFile): boolean {
  const n = doc.grid.ni * doc.grid.nj
  const next = { u: decode(doc.u, doc.dtype, doc.scale.u), v: decode(doc.v, doc.dtype, doc.scale.v), t: decode(doc.t, doc.dtype, doc.scale.t), p: decode(doc.p, doc.dtype, doc.scale.p) }
  if (!n || Object.values(next).some(a => a.length !== n)) return false
  g = doc.grid; U = next.u; V = next.v; T = next.t; P = next.p
  FIELD_TIME = doc.time
  return true
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

export function windAt(lon: number, lat: number): [number, number] {
  return [bilinear(U, lon, lat), bilinear(V, lon, lat)]
}
export function sampleAt(lon: number, lat: number) {
  const [u, v] = windAt(lon, lat)
  return { u, v, speed: Math.hypot(u, v), tempK: bilinear(T, lon, lat), hpa: bilinear(P, lon, lat) / 100,
    // meteorological convention: direction the wind blows FROM
    fromDeg: (Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360 }
}
