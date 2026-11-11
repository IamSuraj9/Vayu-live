import type { Dispatch, SetStateAction } from "react"
import { AlertTriangle, BookOpen, CloudOff, Gauge, Info, List, MousePointerClick, X } from "lucide-react"
import type { Layers, LL } from "@/globe/Globe"
import type { Camera, View } from "@/globe/camera"
import { FEEDBACK_URL } from "@/lib/contact"
import type { Liveness, State, Storm } from "@/lib/storms"
import { PAST, endMs, startMs } from "@/lib/storms"
import type { Units } from "@/lib/units"
import { fmtTime } from "@/lib/units"
import { cn } from "@/lib/utils"
import type { Cfg } from "@/looks/presets"
import { stormState, type Replay } from "@/shell/model"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import {
  CREDIT_SHORT, Freshness, LayersPopover, PhoneActions, PointReadout, ReplayBar, SearchTrigger, StormPanel, StormTabs, ToolButton, Toolbar, UnitsPopover, glass,
} from "@/components/panels"
import { CustomizeCard, LookLegend, ZoomPill } from "@/components/looks"

export type FrameProps = {
  active: Storm[]
  live: (s: Storm) => Liveness
  now: number
  offline: boolean
  feedFresh: boolean
  fileAgeH: number
  fetchedAt: string
  fresh: { lead: string; ago: string | null }
  units: Units
  setUnits: (u: Units) => void
  selected: Storm | null
  selectedId: string | null
  setSelectedId: (id: string | null) => void
  replay: Replay | null
  setReplay: Dispatch<SetStateAction<Replay | null>>
  replayStorm: Storm | null
  playing: boolean
  setPlaying: Dispatch<SetStateAction<boolean>>
  speed: number
  setSpeed: (s: number) => void
  pick: LL | null
  setPick: (p: LL | null) => void
  stormStates: { s: Storm; st: State }[]
  hint: boolean
  dismissHint: () => void
  isMobile: boolean
  tab: string
  setTab: (t: string) => void
  sheetOpen: boolean
  setSheetOpen: (open: boolean) => void
  layers: Layers
  setLayers: (l: Layers) => void
  look: Cfg
  setLook: (c: Cfg) => void
  customizeOpen: boolean
  setCustomizeOpen: (open: boolean) => void
  shownLook: Cfg
  camera: Camera
  home: View
  zoomBy: (f: number) => void
  flyTo: (lon: number, lat: number, zoom?: number) => void
  select: (id: string | null) => void
  startReplay: (id: string) => void
  setCmdOpen: (open: boolean) => void
  setScaleOpen: (open: boolean) => void
  setGlossOpen: (open: boolean) => void
  setAboutOpen: (open: boolean) => void
  setSettingsOpen: (open: boolean) => void
}

function statusBanner(offline: boolean, activeCount: number, savedAt: string, fileAgeH: number, feedFresh: boolean) {
  return offline ? (
    <Alert className={cn(glass, "rounded-[22px]")}>
      <CloudOff className="text-destructive" />
      <AlertTitle>Can't reach the storm data</AlertTitle>
      <AlertDescription>{activeCount ? `Showing the last saved data, from ${savedAt}. ` : ""}Trying again every 10 minutes.</AlertDescription>
    </Alert>
  ) : !feedFresh ? (
    <Alert className={cn(glass, "rounded-[22px]")}>
      <AlertTriangle className="text-warn" />
      <AlertTitle>Storm data is {fileAgeH < 48 ? `${Math.round(fileAgeH)} hours` : `${Math.round(fileAgeH / 24)} days`} old</AlertTitle>
      <AlertDescription>It has not updated since {savedAt}. Storms may have moved, so check your national weather agency.</AlertDescription>
    </Alert>
  ) : null
}

function replayBar(p: FrameProps) {
  const { replayStorm, replay, playing, speed, units, setSpeed, setPlaying, setReplay, selected, setSelectedId } = p
  return replayStorm && replay ? (
    <ReplayBar storm={replayStorm} at={replay.at} playing={playing} speed={speed} units={units} onSpeed={setSpeed}
      onToggle={() => { if (!playing && replay.at >= endMs(replayStorm)) setReplay({ ...replay, at: startMs(replayStorm) }); setPlaying(next => !next) }}
      onSeek={t => { setPlaying(false); setReplay({ ...replay, at: t }) }}
      onClose={() => { setReplay(null); setPlaying(false); if (selected?.kind === "past") setSelectedId(null) }} />
  ) : null
}

// First visit only: say what can be tapped. Any tap or click anywhere dismisses it for good.
function visitHint(p: FrameProps) {
  const { hint, selected, pick, replay, isMobile, dismissHint } = p
  return hint && !selected && !pick && !replay ? (
    <div className={cn(glass, "flex items-center gap-2 rounded-[22px] py-1.5 pr-1.5 pl-3.5 text-[13px] leading-snug text-foreground/90")}>
      <MousePointerClick className="size-4 shrink-0 text-brand" aria-hidden="true" />
      <p>{isMobile ? "Tap" : "Click"} a storm to see its path, or anywhere on the globe for local weather</p>
      <Button variant="ghost" size="icon" className="size-12 shrink-0 rounded-full" aria-label="Dismiss tip" onClick={dismissHint}><X /></Button>
    </div>
  ) : null
}

function stormPanel(p: FrameProps) {
  const { selected, live, units, now, replay, select, startReplay } = p
  return selected ? (
    <StormPanel storm={selected} state={stormState(selected, replay)} live={live(selected)} units={units} now={now} replaying={replay?.id === selected.id}
      onClose={() => select(null)} onReplay={() => startReplay(selected.id)} />
  ) : null
}

function stormTabs(p: FrameProps) {
  const { active, live, now, offline, units, selectedId, tab, setTab, select, startReplay } = p
  return (
    <StormTabs storms={active} live={live} now={now} unknown={offline && !active.length} past={PAST} units={units} selectedId={selectedId} tab={tab} setTab={setTab}
      onSelect={id => select(id)} onReplay={id => startReplay(id)} />
  )
}

function customizeCard(p: FrameProps, className?: string) {
  return <CustomizeCard cfg={p.look} onChange={p.setLook} open={p.customizeOpen} onOpenChange={p.setCustomizeOpen} compact={p.isMobile} className={className} />
}

export function desktopLayout(p: FrameProps) {
  const { fresh, offline, feedFresh, fileAgeH, fetchedAt, units, active, selected, camera, home, isMobile, zoomBy, flyTo, layers, setLayers, setUnits, shownLook } = p
  const { setCmdOpen, setScaleOpen, setGlossOpen, setAboutOpen } = p
  const savedAt = fmtTime(fetchedAt, units.time)
  const banner = statusBanner(offline, active.length, savedAt, fileAgeH, feedFresh)
  const bannerKey = offline ? "offline" : "stale"
  const panelEl = stormPanel(p)
  const tabs = stormTabs(p)
  const bar = replayBar(p)
  const hintEl = visitHint(p)
  const zoomPill = <ZoomPill camera={camera} home={home} large={isMobile} onZoomIn={() => zoomBy(1.5)} onZoomOut={() => zoomBy(1 / 1.5)} onReset={() => flyTo(home.lon, home.lat, home.zoom)} />
  const toolbar = (
    <Toolbar>
      <LayersPopover layers={layers} setLayers={setLayers} />
      <UnitsPopover units={units} setUnits={setUnits} />
      <ToolButton label="Storm strength scale" onClick={() => setScaleOpen(true)}><Gauge /></ToolButton>
      <ToolButton label="What the words mean" onClick={() => setGlossOpen(true)}><BookOpen /></ToolButton>
      <ToolButton label="About and sources" onClick={() => setAboutOpen(true)}><Info /></ToolButton>
    </Toolbar>
  )
  return (
    <>
      <aside className={cn(glass, "absolute top-4 left-[max(16px,env(safe-area-inset-left,0px))] flex max-h-[calc(100%-248px)] w-[336px] flex-col")} aria-label="Storms">
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <Wordmark />
        </div>
        <div className="px-3 pb-3"><SearchTrigger onOpen={() => setCmdOpen(true)} /></div>
        <div className="min-h-0 flex-1 overflow-y-auto">{tabs}</div>
        <div className="flex flex-col gap-1.5 border-t border-white/8 px-4 py-3">
          <Freshness {...fresh} bad={offline || !feedFresh} />
          <CreditLine onAbout={() => setAboutOpen(true)} />
        </div>
      </aside>
      <div data-avoid className="absolute top-4 right-[max(16px,env(safe-area-inset-right,0px))] flex items-center gap-3">{zoomPill}{toolbar}</div>
      {banner && <div data-avoid key={bannerKey} className="absolute top-[68px] right-[392px] left-[368px] xl:top-4 xl:right-auto xl:left-1/2 xl:w-[min(520px,calc(100%-1000px))] xl:min-w-[320px] xl:-translate-x-1/2"><div className="q-pop origin-top">{banner}</div></div>}
      {/* Right column: storm details (when a storm is open) above Customize */}
      <div className="pointer-events-none absolute top-[68px] right-[max(16px,env(safe-area-inset-right,0px))] bottom-4 flex w-[360px] flex-col justify-end gap-3 [&>*]:pointer-events-auto">
        {panelEl && (
          <section key={selected!.id} className={cn(glass, "q-enter flex min-h-[160px] shrink origin-bottom-right flex-col overflow-hidden")} aria-label="Storm details">
            <div className="min-h-0 flex-1 overflow-y-auto">{panelEl}</div>
          </section>
        )}
        {customizeCard(p, "max-h-[70%] shrink-0")}
      </div>
      <div data-avoid className="absolute bottom-4 left-[max(16px,env(safe-area-inset-left,0px))]"><LookLegend cfg={shownLook} units={units} onScale={() => setScaleOpen(true)} /></div>
      {bar && <div className="q-rise absolute bottom-[324px] left-4 right-4 mx-auto max-w-[620px] xl:bottom-4 xl:left-[368px] xl:right-[392px]">{bar}</div>}
      {hintEl && <div className="q-rise absolute bottom-4 left-[368px] right-[392px] flex justify-center">{hintEl}</div>}
    </>
  )
}

export function phoneLayout(p: FrameProps) {
  const { fresh, offline, feedFresh, fileAgeH, fetchedAt, units, active, selected, pick, setPick, stormStates, shownLook, sheetOpen, setSheetOpen } = p
  const { setCmdOpen, setScaleOpen, setAboutOpen, setSettingsOpen } = p
  const savedAt = fmtTime(fetchedAt, units.time)
  const banner = statusBanner(offline, active.length, savedAt, fileAgeH, feedFresh)
  const panelEl = stormPanel(p)
  const tabs = stormTabs(p)
  const bar = replayBar(p)
  const hintEl = visitHint(p)
  return (
    <>
      {/* One row: the legend on the left, Search and the three-dot button on the right */}
      <header className="ui-gutter pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-2 pt-3 [&>*]:pointer-events-auto">
        <LookLegend cfg={shownLook} units={units} onScale={() => setScaleOpen(true)} compact />
        <PhoneActions onSearch={() => setCmdOpen(true)} onMore={() => setSettingsOpen(true)} />
      </header>
      {banner && <div className="ui-gutter absolute inset-x-0 top-[100px]">{banner}</div>}
      {pick && (
        <div className="ui-gutter absolute inset-x-0 top-[100px] flex justify-center">
          <PointReadout {...pick} units={units} storms={stormStates} onClose={() => setPick(null)} className="w-full max-w-[360px]" />
        </div>
      )}
      <div className="ui-gutter absolute inset-x-0 bottom-0 flex flex-col gap-2 pb-3">
        {bar && <div className="q-rise">{bar}</div>}
        {hintEl && !panelEl && <div className="q-rise">{hintEl}</div>}
        {!panelEl && !bar && customizeCard(p, "max-h-[min(64vh,560px)]")}
        {panelEl ? (
          <section key={selected!.id} className={cn(glass, "q-rise flex max-h-[52vh] flex-col overflow-hidden")} aria-label="Storm details">
            <div className="min-h-0 flex-1 overflow-y-auto">{panelEl}</div>
          </section>
        ) : (
          <button type="button" onClick={() => setSheetOpen(true)}
            className={cn(glass, "lens flex h-12 items-center justify-between rounded-full px-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring")}>
            <span className="flex items-center gap-2 font-medium whitespace-nowrap"><List className="size-4" aria-hidden="true" />{active.length ? `${active.length} ${active.length === 1 ? "storm" : "storms"}` : "No active storms"}</span>
            <Freshness {...fresh} bad={offline || !feedFresh} />
          </button>
        )}
      </div>
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="max-h-[78vh] gap-0 overflow-hidden rounded-t-[30px] px-0 pt-3 pb-0">
          <SheetHeader className="min-h-12 shrink-0 px-4 pt-3 pr-16 pb-2 text-left">
            <SheetTitle className="text-lg tracking-tight">Storms</SheetTitle>
            <SheetDescription>Tap a storm to see it on the globe.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto pb-3">
          {tabs}
          <div className="px-4 pt-2"><CreditLine onAbout={() => { setSheetOpen(false); setAboutOpen(true) }} /></div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

function CreditLine({ onAbout }: { onAbout: () => void }) {
  return (
    <p className="text-[11.5px] text-muted-foreground">
      {CREDIT_SHORT} ·{" "}
      <button type="button" onClick={onAbout} className="-my-3 rounded py-3 underline decoration-white/25 underline-offset-2 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">Sources and official alerts</button>
      {FEEDBACK_URL && <> · <a href={FEEDBACK_URL} target="_blank" rel="noreferrer" className="-my-3 inline-block rounded py-3 underline decoration-white/25 underline-offset-2 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">Send feedback</a></>}
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
      <span className={cn("text-[17px] leading-none font-semibold tracking-tight", compact && "sr-only")}>Vayu</span>
    </span>
  )
}
