import { CITIES } from "@/data/cities"

const R = 6371
const rad = (d: number) => (d * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI

export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}
export function bearing(lat1: number, lon1: number, lat2: number, lon2: number) {
  const y = Math.sin(rad(lon2 - lon1)) * Math.cos(rad(lat2))
  const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lon2 - lon1))
  return (deg(Math.atan2(y, x)) + 360) % 360
}
const DIRS = ["north", "north-north-east", "north-east", "east-north-east", "east", "east-south-east", "south-east", "south-south-east",
  "south", "south-south-west", "south-west", "west-south-west", "west", "west-north-west", "north-west", "north-north-west"]
const SHORT = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
export function compass(b: number) { return DIRS[Math.round(b / 22.5) % 16] }
export function compassShort(b: number) { return SHORT[Math.round(b / 22.5) % 16] }

export function nearestCity(lat: number, lon: number) {
  let best = CITIES[0], bestD = Infinity
  for (const c of CITIES) {
    const d = distanceKm(lat, lon, c[2], c[3])
    if (d < bestD) { bestD = d; best = c }
  }
  return { name: best[0], country: best[1], km: bestD, bearingFromCity: bearing(best[2], best[3], lat, lon) }
}

export function fmtLatLon(lat: number, lon: number) {
  const ns = lat >= 0 ? "N" : "S", ew = lon >= 0 ? "E" : "W"
  const L = ((lon + 540) % 360) - 180
  return `${Math.abs(lat).toFixed(2)}° ${ns}, ${Math.abs(L).toFixed(2)}° ${ew}`
}

// Beaufort-style words for a general audience, thresholds in km/h
const BEAUFORT: [number, string][] = [[1, "calm"], [6, "light air"], [12, "light breeze"], [20, "gentle breeze"], [29, "moderate breeze"],
  [39, "fresh breeze"], [50, "strong breeze"], [62, "near gale"], [75, "gale"], [89, "strong gale"], [103, "storm-force"], [118, "violent storm"]]
export function windWords(kmh: number) {
  for (const [lim, w] of BEAUFORT) if (kmh < lim) return w
  return "hurricane-force"
}
