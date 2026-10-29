import gfs from "@/data/gfs.json"

type Grid = { lo1: number; la1: number; dx: number; dy: number; ni: number; nj: number }

function decode(b64: string, scale: number, offset: number) {
  const bin = atob(b64)
  const buf = new ArrayBuffer(bin.length)
  const bytes = new Uint8Array(buf)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const ints = new Int16Array(buf)
  const out = new Float32Array(ints.length)
  for (let i = 0; i < ints.length; i++) out[i] = ints[i] / scale + offset
  return out
}

const g = gfs.meta as Grid & { date: number; time: number }
const U = decode(gfs.u, 10, 0)
const V = decode(gfs.v, 10, 0)
const T = decode(gfs.t, 10, 200)
const P = decode(gfs.p, 0.1, 0) // Pa

export const FIELD_TIME = (() => {
  const d = String(g.date), t = String(g.time).padStart(4, "0")
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${t.slice(0, 2)}:${t.slice(2)}:00Z`
})()
export const FIELD_SOURCE = "GFS model, NOAA/NCEP"

function bilinear(arr: Float32Array, lon: number, lat: number) {
  const x = (((lon - g.lo1) % 360) + 360) % 360 / g.dx
  const y = Math.min(g.nj - 1.001, Math.max(0, (g.la1 - lat) / g.dy))
  const i0 = Math.floor(x), j0 = Math.floor(y)
  const i1 = (i0 + 1) % g.ni, j1 = j0 + 1
  const fx = x - i0, fy = y - j0
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
