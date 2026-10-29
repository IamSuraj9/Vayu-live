import { useEffect, useState } from "react"
import { SAVED, type StormFile } from "@/lib/storms"
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

/** Re-run `check` every `every` ms and whenever the tab comes back into view. */
function usePoll(check: () => void, every: number) {
  useEffect(() => {
    check()
    const id = window.setInterval(check, every)
    const onShow = () => { if (document.visibilityState === "visible") check() }
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
}

export function useStormFeed(): Feed {
  const [feed, setFeed] = useState<Feed>({ file: SAVED, origin: "saved", reachable: true, loading: true })
  const [check] = useState(() => async () => {
    try {
      const file = await getJson<StormFile>(STORMS_URL)
      if (file.schema !== 1 || !Array.isArray(file.storms)) throw new Error("unexpected storms.json")
      setFeed(f => ({ file: f.origin === "live" && f.file.fetchedAt > file.fetchedAt ? f.file : file, origin: "live", reachable: true, loading: false }))
    } catch {
      setFeed(f => ({ ...f, reachable: false, loading: false }))
    }
  })
  usePoll(check, STORMS_EVERY)
  return feed
}

/** True unless the connection is slow or the person asked to save data */
function wantsSharpWind() {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
  return !(c?.saveData || /2g|3g/.test(c?.effectiveType ?? ""))
}

/**
 * Loads the wind field published next to the page: the small 1° file first so colours appear quickly, then the sharp
 * 0.5° file (skipped on slow connections). If neither can be reached, falls back to the copy saved with the app.
 * Returns a number that changes with each new field (0 until the first one loads).
 */
export function useWindField() {
  const [version, setVersion] = useState(0)
  const [check] = useState(() => {
    let time = "", level = 0, builtIn = false // level 1: 1°, 2: 0.5°
    return async () => {
      const files: [string, number][] = wantsSharpWind() ? [[WIND_URL, 2]] : [[WIND_COARSE_URL, 1]]
      if (level === 0 && files[0][1] === 2) files.unshift([WIND_COARSE_URL, 1])
      for (const [url, lv] of files) {
        try {
          const doc = await getJson<WindFile>(url)
          if ((doc.time > time || (doc.time === time && lv > level)) && loadWind(doc)) { time = doc.time; level = lv; setVersion(v => v + 1) }
        } catch { /* try the next file */ }
      }
      if (!time && !builtIn && (await loadBuiltIn().catch(() => false))) { builtIn = true; setVersion(v => v + 1) }
    }
  })
  usePoll(check, WIND_EVERY)
  return version
}
