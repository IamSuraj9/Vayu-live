import { useEffect, useState } from "react"
import { SAVED, withoutEmptyTracks, type StormFile } from "@/lib/storms"
import { type WindFile, loadBuiltIn, loadWind } from "@/globe/field"

const STORMS_URL = "data/storms.json"
const WIND_URL = "data/wind.json"
const WIND_COARSE_URL = "data/wind-1.json"
const STORMS_EVERY = 10 * 60e3 // the pipeline runs every 3 h; checking often costs little and catches it soon after
const WIND_EVERY = 3 * 3.6e6
export const STALE_HOURS = 6 // two missed pipeline runs

/** The current time, ticking once a minute so "2 h ago" labels and banners stay right. */
export function useNow(every = 60e3) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), every)
    return () => window.clearInterval(id)
  }, [every])
  return now
}

/** Each call starts a check and makes every earlier one stale, whether the new one is still running or already done. */
export function pollEpoch() {
  let epoch = 0
  return () => { const mine = ++epoch; return () => mine !== epoch }
}

/** Re-run `check` every `every` ms and whenever the tab comes back into view.
 *  Overlapping runs are allowed; `stale` is true once a newer one has started, so a slow response is dropped. */
function usePoll(check: (stale: () => boolean) => void, every: number) {
  useEffect(() => {
    const open = pollEpoch()
    const run = () => { check(open()) }
    run()
    const id = window.setInterval(run, every)
    const onShow = () => { if (document.visibilityState === "visible") run() }
    document.addEventListener("visibilitychange", onShow)
    return () => { window.clearInterval(id); document.removeEventListener("visibilitychange", onShow) }
  }, [check, every])
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-cache" })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<T>
}

export type Feed = {
  file: StormFile
  /** "saved" until the live file has loaded once */
  origin: "live" | "saved"
  /** false when the latest attempt to load the live file failed */
  reachable: boolean
  loading: boolean
  /** When the app last got the live file (ms), or null if it never has */
  checkedAt: number | null
}

/** One read of storms.json. A stale run — a newer check has already started — leaves the feed alone on both success and failure. */
export async function pullStorms(stale: () => boolean, setFeed: (update: (f: Feed) => Feed) => void, read: () => Promise<StormFile> = () => getJson<StormFile>(STORMS_URL)) {
  try {
    const raw = await read()
    if (stale()) return
    if (raw?.schema !== 1 || !Array.isArray(raw.storms)) throw new Error("unexpected storms.json")
    const file = withoutEmptyTracks(raw)
    setFeed(f => ({ file: f.origin === "live" && f.file.fetchedAt > file.fetchedAt ? f.file : file, origin: "live", reachable: true, loading: false, checkedAt: Date.now() }))
  } catch {
    if (stale()) return
    setFeed(f => ({ ...f, reachable: false, loading: false }))
  }
}

export function useStormFeed(): Feed {
  const [feed, setFeed] = useState<Feed>({ file: SAVED, origin: "saved", reachable: true, loading: true, checkedAt: null })
  const [check] = useState(() => (stale: () => boolean) => { void pullStorms(stale, setFeed) })
  usePoll(check, STORMS_EVERY)
  return feed
}

/** True unless the connection is slow or the person asked to save data */
function wantsSharpWind() {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
  return !(c?.saveData || /2g|3g/.test(c?.effectiveType ?? ""))
}

export type WindSlot = { time: string; level: number; builtIn: boolean } // level 1: 1°, 2: 0.5°

type WindIo = {
  sharp: boolean
  read: (url: string) => Promise<WindFile>
  load: (doc: WindFile) => boolean
  builtIn: (apply: () => boolean) => Promise<boolean>
}

/** One wind poll. A stale run applies nothing. The bundled grid is only swapped in if no live field has arrived by the time it is ready. */
export async function pullWind(stale: () => boolean, slot: WindSlot, setVersion: (update: (v: number) => number) => void, io?: WindIo) {
  const read = io?.read ?? ((url: string) => getJson<WindFile>(url))
  const load = io?.load ?? loadWind
  const builtIn = io?.builtIn ?? loadBuiltIn
  const sharp = io?.sharp ?? wantsSharpWind()
  const files: [string, number][] = sharp ? [[WIND_URL, 2]] : [[WIND_COARSE_URL, 1]]
  if (slot.level === 0 && files[0][1] === 2) files.unshift([WIND_COARSE_URL, 1])
  for (const [url, lv] of files) {
    if (stale()) return
    try {
      const doc = await read(url)
      if (stale()) return
      if ((doc.time > slot.time || (doc.time === slot.time && lv > slot.level)) && load(doc)) { slot.time = doc.time; slot.level = lv; setVersion(v => v + 1) }
    } catch { if (stale()) return } // otherwise try the next file
  }
  if (stale() || slot.time || slot.builtIn) return
  const applied = await builtIn(() => !stale() && !slot.time && !slot.builtIn).catch(() => false)
  if (applied && !slot.time && !slot.builtIn) { slot.builtIn = true; setVersion(v => v + 1) }
}

/**
 * Loads the wind field published next to the page: the small 1° file first so colours appear quickly, then the sharp
 * 0.5° file (skipped on slow connections). If neither can be reached, falls back to the copy saved with the app.
 * Returns a number that changes with each new field (0 until the first one loads).
 */
export function useWindField() {
  const [version, setVersion] = useState(0)
  const [check] = useState(() => {
    const slot: WindSlot = { time: "", level: 0, builtIn: false }
    return (stale: () => boolean) => { void pullWind(stale, slot, setVersion) }
  })
  usePoll(check, WIND_EVERY)
  return version
}
