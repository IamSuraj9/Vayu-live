import { useEffect, useMemo, type Dispatch, type SetStateAction } from "react"
import type { Marker } from "@/globe/Globe"
import { STALE_HOURS, type Feed } from "@/lib/live"
import { headline, levelFor } from "@/lib/strength"
import { PAST, type Liveness, type Storm, endMs, hasTrack, liveness, stateAt } from "@/lib/storms"
import { type Units, fmtAgo, fmtChecked, fmtWindKt } from "@/lib/units"

const HOUR = 3.6e6

export type Replay = { id: string; at: number }

export function stormState(s: Storm, replay: Replay | null) {
  return stateAt(s, replay && replay.id === s.id ? replay.at : undefined)
}

export function useActiveStorms(feed: Feed, now: number, selectedId: string | null, replay: Replay | null) {
  // Storm file age: the pipeline runs every 3 h, so more than STALE_HOURS means it has missed runs
  const fileAgeH = (now - new Date(feed.file.fetchedAt).getTime()) / HOUR
  const feedFresh = fileAgeH <= STALE_HOURS
  const offline = !feed.loading && (!feed.reachable || feed.origin === "saved")
  const tracked = useMemo(() => feed.file.storms.filter(hasTrack), [feed.file])
  const live = useMemo(() => {
    const m = new Map(tracked.map(s => [s.id, liveness(s, now, feedFresh)]))
    return (s: Storm) => m.get(s.id) ?? "active"
  }, [tracked, now, feedFresh])
  const active = useMemo(() => tracked.filter(s => live(s) !== "gone").sort((a, b) =>
    Number(live(a) === "ended") - Number(live(b) === "ended") || b.track[b.track.length - 1].kt - a.track[a.track.length - 1].kt), [tracked, live])
  const ALL = useMemo(() => [...active, ...PAST], [active])
  // The freshness label says when we last checked, not how old the newest report is (agencies publish every 6 h)
  const fresh = !active.length ? { lead: "", ago: null }
    : feed.checkedAt !== null ? { lead: "Checked", ago: fmtChecked(feed.checkedAt, now) }
    : { lead: "Saved copy,", ago: fmtAgo(feed.file.fetchedAt, now) }
  const selected = ALL.find(s => s.id === selectedId) ?? null
  const replayStorm = replay ? ALL.find(s => s.id === replay.id) ?? null : null
  return { fileAgeH, feedFresh, offline, live, active, ALL, fresh, selected, replayStorm }
}

export function useReplayClock(
  playing: boolean,
  replayStorm: Storm | null,
  speed: number,
  setReplay: Dispatch<SetStateAction<Replay | null>>,
  setPlaying: Dispatch<SetStateAction<boolean>>,
) {
  useEffect(() => {
    if (!playing || !replayStorm) return
    let raf = 0, last = performance.now()
    const tick = (t: number) => {
      const dt = Math.min(64, t - last); last = t
      let ended = false
      setReplay(r => {
        if (!r) return r
        const next = r.at + dt * (HOUR / 80) * speed
        if (next >= endMs(replayStorm)) { ended = true; return { ...r, at: endMs(replayStorm) } }
        return { ...r, at: next }
      })
      if (ended) { setPlaying(false); return }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, replayStorm, speed])
}

export function useStormMarkers(active: Storm[], live: (s: Storm) => Liveness, replay: Replay | null, replayStorm: Storm | null, wind: Units["wind"]): Marker[] {
  return useMemo(() => {
    const list = [...active]
    if (replayStorm && !list.some(s => s.id === replayStorm.id)) list.push(replayStorm)
    return list.map(s => {
      const st = stormState(s, replay)
      const replayingThis = replay?.id === s.id
      const upto = s.track.filter(p => new Date(p.t).getTime() <= st.t)
      return {
        id: s.id, name: s.name, hint: `${s.kind === "disturbance" ? "being watched" : headline(st.kt, s.basin).toLowerCase()}, ${s.basin}`, lon: st.lon, lat: st.lat, color: levelFor(st.kt).color, kt: st.kt,
        label: s.kind === "disturbance" ? `${fmtWindKt(st.kt, wind)} · watch` : fmtWindKt(st.kt, wind),
        past: [...upto.map(p => ({ lon: p.lon, lat: p.lat, color: levelFor(p.kt).color })), { lon: st.lon, lat: st.lat, color: levelFor(st.kt).color }],
        ghost: replayingThis ? [{ lon: st.lon, lat: st.lat }, ...s.track.filter(p => new Date(p.t).getTime() > st.t).map(p => ({ lon: p.lon, lat: p.lat }))] : undefined,
        forecast: replayingThis || live(s) === "ended" ? [] : s.forecast.filter(f => f.h > 0).map(f => ({ lon: f.lon, lat: f.lat, color: levelFor(f.kt).color })),
        dim: (!!replay && !replayingThis) || (!replayingThis && live(s) !== "active"),
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, live, replay, replayStorm, wind])
}
