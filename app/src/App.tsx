import { useEffect, useMemo, useRef, useState } from "react"
import { AlertTriangle, BookOpen, CloudOff, Gauge, Info, List } from "lucide-react"
import { Globe, type LL, type Layers, type Marker, type View } from "@/globe/Globe"
import { createCamera } from "@/globe/camera"
import { PAST, type Storm, endMs, liveness, startMs, stateAt } from "@/lib/storms"
import { STALE_HOURS, useNow, useStormFeed, useWindField } from "@/lib/live"
import { levelFor } from "@/lib/strength"
import { type Units, fmtTime, fmtWindKt, loadUnits, saveUnits } from "@/lib/units"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { TooltipProvider } from "@/components/ui/tooltip"
import {
  AboutDialog, CREDIT_SHORT, CommandPalette, Freshness, GlossaryDialog, LayersPopover, Legend, MapControls, PointReadout, ReplayBar,
  ScaleDialog, SearchTrigger, StormPanel, StormTabs, ToolButton, Toolbar, UnitsPopover, glass,
} from "@/components/panels"
import { cn } from "@/lib/utils"

function useMedia(q: string) {
  const [m, setM] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches)
  useEffect(() => {
    const mq = window.matchMedia(q)
    const on = () => setM(mq.matches)
    mq.addEventListener("change", on)
    return () => mq.removeEventListener("change", on)
  }, [q])
  return m
}

const HOUR = 3.6e6
const START: View = { lon: 100, lat: 15, zoom: 1 }
const LAYERS_KEY = "qellon.layers.v2"

function loadLayers(): Layers {
  try { const raw = localStorage.getItem(LAYERS_KEY); if (raw) return { particles: true, colors: true, paths: true, borders: true, ...JSON.parse(raw) } } catch { /* unavailable */ }
  return { particles: true, colors: true, paths: true, borders: true }
}

export default function App() {
  const [units, setUnitsState] = useState<Units>(loadUnits)
  const setUnits = (u: Units) => { setUnitsState(u); saveUnits(u) }
  const [layers, setLayersState] = useState<Layers>(loadLayers)
  const setLayers = (l: Layers) => { setLayersState(l); try { localStorage.setItem(LAYERS_KEY, JSON.stringify(l)) } catch { /* unavailable */ } }
  const feed = useStormFeed()
  const now = useNow()
  const fieldVersion = useWindField()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [replay, setReplay] = useState<{ id: string; at: number } | null>(null)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [pick, setPick] = useState<LL | null>(null)
  const [tab, setTab] = useState("active")
  const [sheetOpen, setSheetOpen] = useState(false)
  const [cmdOpen, setCmdOpen] = useState(false)
  const [scaleOpen, setScaleOpen] = useState(false)
  const [glossOpen, setGlossOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const isMobile = useMedia("(max-width: 720px)")
  const reduced = useMedia("(prefers-reduced-motion: reduce)")
  const [camera] = useState(() => createCamera({ ...START, zoom: typeof window !== "undefined" && window.innerWidth < 720 ? 1.15 : 1 }))

  // Storm file age: the pipeline runs every 3 h, so more than STALE_HOURS means it has missed runs
  const fileAgeH = (now - new Date(feed.file.fetchedAt).getTime()) / HOUR
  const feedFresh = fileAgeH <= STALE_HOURS
  const offline = !feed.loading && (!feed.reachable || feed.origin === "saved")
  const live = useMemo(() => {
    const m = new Map(feed.file.storms.map(s => [s.id, liveness(s, now, feedFresh)]))
    return (s: Storm) => m.get(s.id) ?? "active"
  }, [feed.file, now, feedFresh])
  const active = useMemo(() => feed.file.storms.filter(s => live(s) !== "gone").sort((a, b) =>
    Number(live(a) === "ended") - Number(live(b) === "ended") || b.track[b.track.length - 1].kt - a.track[a.track.length - 1].kt), [feed.file, live])
  const ALL = useMemo(() => [...active, ...PAST], [active])
  const newest = active.length ? active.reduce((m, s) => (s.track[s.track.length - 1].t > m ? s.track[s.track.length - 1].t : m), "") : null
  const selected = ALL.find(s => s.id === selectedId) ?? null
  const replayStorm = replay ? ALL.find(s => s.id === replay.id) ?? null : null

  // Keyboard: Cmd/Ctrl+K or "/" opens search
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest?.("input, textarea, [contenteditable]")
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) { e.preventDefault(); setCmdOpen(o => !o) }
    }
    window.addEventListener("keydown", on)
    return () => window.removeEventListener("keydown", on)
  }, [])

  const flyTo = (lon: number, lat: number, zoom?: number) => camera.flyTo({ lon, lat, zoom }, { reduced })
  const zoomBy = (f: number) => camera.zoomBy(f, { reduced })

  const startReplay = (id: string) => {
    const s = ALL.find(x => x.id === id)
    if (!s) return
    setSelectedId(id); setSheetOpen(false); setPick(null)
    const atEnd = replay?.id === id && replay.at >= endMs(s)
    setReplay({ id, at: replay?.id === id && !atEnd ? replay.at : startMs(s) })
    setPlaying(true)
    const mid = s.track[Math.floor(s.track.length * 0.6)]
    flyTo(mid.lon, mid.lat, Math.max(camera.get().zoom, 1.9))
  }
  const select = (id: string | null) => {
    setSelectedId(id); setSheetOpen(false)
    if (id) setPick(null)
    if (!id) { setReplay(null); setPlaying(false); return }
    if (replay && replay.id !== id) { setReplay(null); setPlaying(false) }
    const s = ALL.find(x => x.id === id)
    if (!s) return
    if (s.kind === "past") { startReplay(id); return }
    const st = stateAt(s)
    flyTo(st.lon, st.lat, Math.max(camera.get().zoom, isMobile ? 1.6 : 1.5))
  }

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

  const stateOf = (s: Storm) => stateAt(s, replay && replay.id === s.id ? replay.at : undefined)

  const markers: Marker[] = useMemo(() => {
    const list = [...active]
    if (replayStorm && !list.some(s => s.id === replayStorm.id)) list.push(replayStorm)
    return list.map(s => {
      const st = stateOf(s)
      const replayingThis = replay?.id === s.id
      const upto = s.track.filter(p => new Date(p.t).getTime() <= st.t)
      return {
        id: s.id, name: s.name, lon: st.lon, lat: st.lat, color: levelFor(st.kt).color,
        label: s.kind === "disturbance" ? `${fmtWindKt(st.kt, units.wind)} · watch` : fmtWindKt(st.kt, units.wind),
        past: [...upto.map(p => ({ lon: p.lon, lat: p.lat, color: levelFor(p.kt).color })), { lon: st.lon, lat: st.lat, color: levelFor(st.kt).color }],
        ghost: replayingThis ? [{ lon: st.lon, lat: st.lat }, ...s.track.filter(p => new Date(p.t).getTime() > st.t).map(p => ({ lon: p.lon, lat: p.lat }))] : undefined,
        forecast: replayingThis || live(s) === "ended" ? [] : s.forecast.filter(f => f.h > 0).map(f => ({ lon: f.lon, lat: f.lat, color: levelFor(f.kt).color })),
        dim: (!!replay && !replayingThis) || (!replayingThis && live(s) !== "active"),
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, live, replay, replayStorm, units.wind])

  const stormStates = active.map(s => ({ s, st: stateOf(s) }))
  const pastReplay = replayStorm?.kind === "past"

  const panelEl = selected ? (
    <StormPanel storm={selected} state={stateOf(selected)} live={live(selected)} units={units} now={now} replaying={replay?.id === selected.id}
      onClose={() => select(null)} onReplay={() => startReplay(selected.id)} />
  ) : null
  const tabs = (
    <StormTabs storms={active} live={live} now={now} unknown={offline && !active.length} past={PAST} units={units} selectedId={selectedId} tab={tab} setTab={setTab}
      onSelect={id => select(id)} onReplay={id => startReplay(id)} />
  )
  const savedAt = fmtTime(feed.file.fetchedAt, units.time)
  const banner = offline ? (
    <Alert className={cn(glass, "rounded-[22px]")}>
      <CloudOff className="text-destructive" />
      <AlertTitle>Can't reach the storm data</AlertTitle>
      <AlertDescription>{active.length ? `Showing the last saved data, from ${savedAt}. ` : ""}Trying again every 10 minutes.</AlertDescription>
    </Alert>
  ) : !feedFresh ? (
    <Alert className={cn(glass, "rounded-[22px]")}>
      <AlertTriangle className="text-warn" />
      <AlertTitle>Storm data is {fileAgeH < 48 ? `${Math.round(fileAgeH)} hours` : `${Math.round(fileAgeH / 24)} days`} old</AlertTitle>
      <AlertDescription>It has not updated since {savedAt}. Storms may have moved, so check your national weather agency.</AlertDescription>
    </Alert>
  ) : null
  const bannerKey = offline ? "offline" : "stale"
  const replayBar = replayStorm && replay ? (
    <ReplayBar storm={replayStorm} at={replay.at} playing={playing} speed={speed} units={units} onSpeed={setSpeed}
      onToggle={() => { if (!playing && replay.at >= endMs(replayStorm)) setReplay({ ...replay, at: startMs(replayStorm) }); setPlaying(p => !p) }}
      onSeek={t => { setPlaying(false); setReplay({ ...replay, at: t }) }}
      onClose={() => { setReplay(null); setPlaying(false); if (selected?.kind === "past") setSelectedId(null) }} />
  ) : null
  const toolbar = (
    <Toolbar>
      {isMobile && <ToolButtonSearch onOpen={() => setCmdOpen(true)} />}
      <LayersPopover layers={layers} setLayers={setLayers} />
      <UnitsPopover units={units} setUnits={setUnits} />
      <ToolButton label="Storm strength scale" onClick={() => setScaleOpen(true)}><Gauge /></ToolButton>
      <ToolButton label="What the words mean" onClick={() => setGlossOpen(true)}><BookOpen /></ToolButton>
      <ToolButton label="About and sources" onClick={() => setAboutOpen(true)}><Info /></ToolButton>
    </Toolbar>
  )

  return (
    <TooltipProvider delayDuration={250}>
      <main className="relative h-full w-full overflow-hidden bg-black">
        <h1 className="sr-only">Qellon storm globe</h1>
        <Globe markers={markers} selectedId={selectedId} camera={camera} onSelect={id => select(id)}
          pick={pick} onPick={p => setPick(p ? { lon: p.lon, lat: p.lat } : null)} reducedMotion={reduced}
          showParticles={!pastReplay} fieldVersion={fieldVersion} dimField={pastReplay} layers={pastReplay ? { ...layers, colors: false } : layers}
          offsetY={isMobile && selected ? Math.round(window.innerHeight * 0.24) : 0}
          renderPick={isMobile ? undefined : (x, y, w, h) => {
            const W = 284, left = x + 20 + W > w - 16 ? x - 20 - W : x + 20
            const top = Math.min(Math.max(72, y - 40), h - 250)
            return pick && <PointReadout key={`${pick.lon},${pick.lat}`} {...pick} units={units} storms={stormStates} onClose={() => setPick(null)}
              className="q-pop" style={{ position: "absolute", left, top, transformOrigin: `${left > x ? "0" : "100%"} ${y - top}px` }} />
          }} />

        {/* Desktop */}
        {!isMobile && (
          <>
            <aside className={cn(glass, "absolute top-4 left-[max(16px,env(safe-area-inset-left,0px))] flex max-h-[calc(100%-32px)] w-[336px] flex-col")} aria-label="Storms">
              <div className="flex items-center justify-between px-4 pt-4 pb-3">
                <Wordmark />
              </div>
              <div className="px-3 pb-3"><SearchTrigger onOpen={() => setCmdOpen(true)} /></div>
              <div className="min-h-0 flex-1 overflow-y-auto">{tabs}</div>
              <div className="flex flex-col gap-1.5 border-t border-white/8 px-4 py-3">
                <Freshness newest={newest} now={now} units={units} bad={offline || !feedFresh} />
                <CreditLine onAbout={() => setAboutOpen(true)} />
              </div>
            </aside>
            <div className="absolute top-4 right-[max(16px,env(safe-area-inset-right,0px))]">{toolbar}</div>
            {banner && <div key={bannerKey} className="absolute top-4 left-1/2 w-[min(520px,calc(100%-800px))] min-w-[360px] -translate-x-1/2"><div className="q-pop origin-top">{banner}</div></div>}
            {panelEl && (
              <section key={selected!.id} className={cn(glass, "q-enter absolute top-[68px] right-[max(16px,env(safe-area-inset-right,0px))] w-[384px] origin-top-right flex-col overflow-hidden")}
                style={{ maxHeight: "calc(100% - 68px - 16px)", display: "flex" }} aria-label="Storm details">
                <div className="min-h-0 flex-1 overflow-y-auto">{panelEl}</div>
              </section>
            )}
            <div className={cn("absolute bottom-4 flex flex-col items-end gap-3", panelEl ? "right-[416px]" : "right-[max(16px,env(safe-area-inset-right,0px))]")}>
              <MapControls onZoomIn={() => zoomBy(1.5)} onZoomOut={() => zoomBy(1 / 1.5)} onReset={() => flyTo(START.lon, START.lat, START.zoom)} />
              {!panelEl && <Legend units={units} onScale={() => setScaleOpen(true)} />}
            </div>
            {replayBar && <div className="q-rise absolute bottom-4 left-[368px] right-[472px] mx-auto max-w-[620px]">{replayBar}</div>}
          </>
        )}

        {/* Phone */}
        {isMobile && (
          <>
            <header className="ui-gutter pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-2 pt-3">
              <div className={cn(glass, "lens pointer-events-auto rounded-full p-1.5")}><Wordmark compact /></div>
              <div className="pointer-events-auto">{toolbar}</div>
            </header>
            {banner && <div className="ui-gutter absolute inset-x-0 top-[64px]">{banner}</div>}
            {pick && (
              <div className="ui-gutter absolute inset-x-0 top-[64px] flex justify-center">
                <PointReadout {...pick} units={units} storms={stormStates} onClose={() => setPick(null)} className="w-full max-w-[360px]" />
              </div>
            )}
            <div className="ui-gutter absolute inset-x-0 bottom-0 flex flex-col gap-2 pb-3">
              {replayBar && <div className="q-rise">{replayBar}</div>}
              {panelEl ? (
                <section key={selected!.id} className={cn(glass, "q-rise flex max-h-[52vh] flex-col overflow-hidden")} aria-label="Storm details">
                  <div className="min-h-0 flex-1 overflow-y-auto">{panelEl}</div>
                </section>
              ) : (
                <button type="button" onClick={() => setSheetOpen(true)}
                  className={cn(glass, "lens flex h-12 items-center justify-between rounded-full px-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring")}>
                  <span className="flex items-center gap-2 font-medium whitespace-nowrap"><List className="size-4" aria-hidden="true" />{active.length ? `${active.length} ${active.length === 1 ? "storm" : "storms"}` : "No active storms"}</span>
                  <Freshness newest={newest} now={now} units={units} bad={offline || !feedFresh} compact />
                </button>
              )}
            </div>
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetContent side="bottom" className="max-h-[78vh] gap-0 overflow-hidden rounded-t-[30px] p-0">
                <div className="min-h-0 flex-1 overflow-y-auto pb-3">
                <SheetHeader className="px-4 pt-5 pb-2">
                  <SheetTitle className="text-lg tracking-tight">Storms</SheetTitle>
                  <SheetDescription>Tap a storm to see it on the globe.</SheetDescription>
                </SheetHeader>
                {tabs}
                <div className="px-4 pt-2"><CreditLine onAbout={() => { setSheetOpen(false); setAboutOpen(true) }} /></div>
                </div>
              </SheetContent>
            </Sheet>
          </>
        )}

        <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} storms={active} past={PAST} units={units}
          onStorm={id => { setCmdOpen(false); select(id) }}
          onPlace={(lon, lat) => { setCmdOpen(false); select(null); setPick({ lon, lat }); flyTo(lon, lat, Math.max(camera.get().zoom, 2.2)) }} />
        <ScaleDialog units={units} open={scaleOpen} onOpenChange={setScaleOpen} />
        <GlossaryDialog open={glossOpen} onOpenChange={setGlossOpen} />
        <AboutDialog file={feed.file} live={feed.origin === "live"} reachable={feed.reachable} now={now} units={units} open={aboutOpen} onOpenChange={setAboutOpen} />
      </main>
    </TooltipProvider>
  )
}

function ToolButtonSearch({ onOpen }: { onOpen: () => void }) {
  return <SearchTrigger compact onOpen={onOpen} />
}

function CreditLine({ onAbout }: { onAbout: () => void }) {
  return (
    <p className="text-[11.5px] text-muted-foreground">
      {CREDIT_SHORT} · Not an official warning ·{" "}
      <button type="button" onClick={onAbout} className="rounded underline decoration-white/25 underline-offset-2 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">About</button>
    </p>
  )
}

function Wordmark({ compact }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <span className="flex size-7 items-center justify-center rounded-lg bg-white text-neutral-950">
        <svg viewBox="-13 -13 26 26" width="18" height="18" aria-hidden="true">
          <path d="M0,-4 C 5,-10 10.5,-5.5 10.2,0.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          <path d="M0,4 C -5,10 -10.5,5.5 -10.2,-0.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          <circle r="3.6" fill="currentColor" />
        </svg>
      </span>
      <span className={cn("text-[17px] leading-none font-semibold tracking-tight", compact && "sr-only")}>Qellon</span>
    </span>
  )
}
