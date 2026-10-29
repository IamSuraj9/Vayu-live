import { useEffect, useState } from "react"
import { SAVED, type StormFile } from "@/lib/storms"
import { type WindFile, loadWind } from "@/globe/field"

const STORMS_URL = "data/storms.json"
const WIND_URL = "data/wind.json"
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

/** Loads the 0.5° wind field when it is published next to the page. Returns a number that changes with each new field. */
export function useWindField() {
  const [version, setVersion] = useState(0)
  const [check] = useState(() => {
    let time = ""
    return async () => {
      try {
        const doc = await getJson<WindFile>(WIND_URL)
        if (doc.time !== time && loadWind(doc)) { time = doc.time; setVersion(v => v + 1) }
      } catch { /* keep the built-in field */ }
    }
  })
  usePoll(check, WIND_EVERY)
  return version
}
