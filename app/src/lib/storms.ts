import data from "@/data/storms.json"
import past from "@/data/pastStorms.json"
import { bearing, distanceKm, nearestCity, compass } from "@/lib/geo"
import { isOverLand } from "@/globe/world"

export type Pt = { t: string; lat: number; lon: number; kt: number; hpa?: number | null }
export type Fc = { h: number; lat: number; lon: number; kt: number }
export type Storm = {
  id: string; name: string; kind: string; basin: string; track: Pt[]; forecast: Fc[]; forecastIssued?: string | null
  source: string; sourceUrl?: string; sourceLabel?: string; official?: string[]; windAvg: string
  people?: { count: number; alert: string; modified: string } | null; year?: number
}

export const SNAPSHOT = data.snapshot
export const NOW = data.fetchedAt
export const ACTIVE: Storm[] = data.storms as Storm[]
export const PAST: Storm[] = (past.storms as (Omit<Storm, "kind" | "forecast" | "source" | "windAvg"> & { year: number })[]).map(s => ({
  ...s, kind: "past", forecast: [], source: "IBTrACS (NOAA NCEI), JTWC winds", windAvg: "1-minute",
  sourceUrl: "https://www.ncei.noaa.gov/products/international-best-track-archive",
}))

export type State = { t: number; lat: number; lon: number; kt: number; hpa?: number | null; moveKmh: number | null; moveDeg: number | null }

const ms = (iso: string) => new Date(iso).getTime()
export const startMs = (s: Storm) => ms(s.track[0].t)
export const endMs = (s: Storm) => ms(s.track[s.track.length - 1].t)

export function stateAt(s: Storm, at?: number): State {
  const tr = s.track
  const t = at ?? endMs(s)
  let i = tr.length - 1
  for (let k = 0; k < tr.length - 1; k++) if (ms(tr[k + 1].t) >= t) { i = k; break }
  const a = tr[Math.min(i, tr.length - 1)], b = tr[Math.min(i + 1, tr.length - 1)]
  const span = ms(b.t) - ms(a.t)
  const f = span > 0 ? Math.min(1, Math.max(0, (t - ms(a.t)) / span)) : 0
  const lat = a.lat + (b.lat - a.lat) * f, lon = a.lon + (b.lon - a.lon) * f
  const kt = a.kt + (b.kt - a.kt) * f
  // movement from the segment around this time (the last 6 h at the newest point)
  const p = span > 0 ? a : tr[tr.length - 2], q = span > 0 ? b : tr[tr.length - 1]
  let moveKmh: number | null = null, moveDeg: number | null = null
  if (p && q && p !== q) {
    const hrs = (ms(q.t) - ms(p.t)) / 3.6e6
    moveKmh = distanceKm(p.lat, p.lon, q.lat, q.lon) / hrs
    moveDeg = bearing(p.lat, p.lon, q.lat, q.lon)
  }
  return { t, lat, lon, kt, hpa: f < 0.5 ? a.hpa : b.hpa, moveKmh, moveDeg }
}

export function trend(s: Storm, at?: number): "strengthening" | "weakening" | "steady" {
  const now = stateAt(s, at)
  const before = stateAt(s, now.t - 24 * 3.6e6)
  if (now.t - 24 * 3.6e6 < startMs(s)) return "steady"
  const d = now.kt - before.kt
  return d >= 10 ? "strengthening" : d <= -10 ? "weakening" : "steady"
}

export function whereNow(lat: number, lon: number) {
  const c = nearestCity(lat, lon)
  const onLand = isOverLand(lon, lat)
  return { onLand, city: c.name, country: c.country, km: c.km, dir: compass(c.bearingFromCity) }
}
