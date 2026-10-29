export type WindUnit = "kmh" | "mph" | "kt" | "ms"
export type TempUnit = "c" | "f"
export type PressUnit = "hpa" | "inhg"
export type DistUnit = "km" | "mi" | "nmi"
export type TimeMode = "local" | "utc"
export type Units = { wind: WindUnit; temp: TempUnit; press: PressUnit; dist: DistUnit; time: TimeMode }

export const WIND_LABEL: Record<WindUnit, string> = { kmh: "km/h", mph: "mph", kt: "kt", ms: "m/s" }
export const DIST_LABEL: Record<DistUnit, string> = { km: "km", mi: "mi", nmi: "nmi" }

export function defaultUnits(): Units {
  const us = typeof navigator !== "undefined" && /^en-US/i.test(navigator.language)
  return us
    ? { wind: "mph", temp: "f", press: "inhg", dist: "mi", time: "local" }
    : { wind: "kmh", temp: "c", press: "hpa", dist: "km", time: "local" }
}

const KEY = "qellon.units.v1"
export function loadUnits(): Units {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...defaultUnits(), ...JSON.parse(raw) }
  } catch { /* storage unavailable */ }
  return defaultUnits()
}
export function saveUnits(u: Units) {
  try { localStorage.setItem(KEY, JSON.stringify(u)) } catch { /* storage unavailable */ }
}

export function windFromKt(kt: number, u: WindUnit): number {
  const ms = kt * 0.514444
  return windFromMs(ms, u)
}
export function windFromMs(ms: number, u: WindUnit): number {
  switch (u) {
    case "kmh": return ms * 3.6
    case "mph": return ms * 2.236936
    case "kt": return ms / 0.514444
    case "ms": return ms
  }
}
export function fmtWindKt(kt: number, u: WindUnit) {
  return `${Math.round(windFromKt(kt, u))} ${WIND_LABEL[u]}`
}
export function fmtWindMs(ms: number, u: WindUnit) {
  const v = windFromMs(ms, u)
  return `${u === "ms" ? v.toFixed(1) : Math.round(v)} ${WIND_LABEL[u]}`
}
export function fmtTempK(k: number, u: TempUnit) {
  const c = k - 273.15
  return u === "c" ? `${Math.round(c)} °C` : `${Math.round(c * 9 / 5 + 32)} °F`
}
export function fmtPress(hpa: number, u: PressUnit) {
  return u === "hpa" ? `${Math.round(hpa)} hPa` : `${(hpa * 0.02953).toFixed(2)} inHg`
}
export function distFromKm(km: number, u: DistUnit) {
  return u === "km" ? km : u === "mi" ? km * 0.621371 : km * 0.539957
}
export function fmtDist(km: number, u: DistUnit) {
  const v = distFromKm(km, u)
  return `${v < 10 ? v.toFixed(1) : Math.round(v).toLocaleString()} ${DIST_LABEL[u]}`
}
export function fmtSpeedKmh(kmh: number, u: WindUnit) {
  return fmtWindMs(kmh / 3.6, u)
}

const fmtCache = new Map<string, Intl.DateTimeFormat>()
function dtf(mode: TimeMode, opts: Intl.DateTimeFormatOptions) {
  const k = mode + JSON.stringify(opts)
  let f = fmtCache.get(k)
  if (!f) {
    f = new Intl.DateTimeFormat(undefined, { ...opts, timeZone: mode === "utc" ? "UTC" : undefined })
    fmtCache.set(k, f)
  }
  return f
}
export function fmtTime(iso: string | number, mode: TimeMode, withZone = true) {
  const d = new Date(iso)
  const s = dtf(mode, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(d)
  return withZone ? `${s} ${zoneLabel(mode, d)}` : s
}
export function zoneLabel(mode: TimeMode, d = new Date()) {
  if (mode === "utc") return "UTC"
  const part = dtf("local", { timeZoneName: "short" }).formatToParts(d).find(p => p.type === "timeZoneName")
  return part?.value ?? "local"
}
export function fmtAgo(fromIso: string, nowIso: string) {
  const h = (new Date(nowIso).getTime() - new Date(fromIso).getTime()) / 3.6e6
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min ago`
  if (h < 48) return `${Math.round(h)} h ago`
  return `${Math.round(h / 24)} days ago`
}
