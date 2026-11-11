import { useEffect, useState } from "react"
import { Globe, type LL, type Layers, type View } from "@/globe/Globe"
import { createCamera } from "@/globe/camera"
import { PAST, endMs, startMs, stateAt } from "@/lib/storms"
import { useNow, useStormFeed, useWindField } from "@/lib/live"
import { type Units, loadUnits, saveUnits } from "@/lib/units"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AboutDialog, CommandPalette, GlossaryDialog, PointReadout, ScaleDialog, SettingsDialog } from "@/components/panels"
import { desktopLayout, phoneLayout, type FrameProps } from "@/components/frame"
import { type Cfg, effectiveCfg, loadCfg, saveCfg } from "@/looks/presets"
import { type Replay, stormState, useActiveStorms, useReplayClock, useStormMarkers } from "@/shell/model"

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

const START: View = { lon: 100, lat: 15, zoom: 1 }
const LAYERS_KEY = "vayu.layers.v2"
const HINT_KEY = "vayu.hint.v1"

function loadLayers(): Layers {
  try { const raw = localStorage.getItem(LAYERS_KEY); if (raw) return { particles: true, colors: true, paths: true, borders: true, ...JSON.parse(raw) } } catch { /* unavailable */ }
  return { particles: true, colors: true, paths: true, borders: true }
}

export default function App() {
  const [units, setUnitsState] = useState<Units>(loadUnits)
  const setUnits = (u: Units) => { setUnitsState(u); saveUnits(u) }
  const [look, setLookState] = useState<Cfg>(loadCfg)
  const setLook = (c: Cfg) => { setLookState(c); saveCfg(c) }
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const [layers, setLayersState] = useState<Layers>(loadLayers)
  const setLayers = (l: Layers) => { setLayersState(l); try { localStorage.setItem(LAYERS_KEY, JSON.stringify(l)) } catch { /* unavailable */ } }
  const feed = useStormFeed()
  const now = useNow()
  const fieldVersion = useWindField()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [replay, setReplay] = useState<Replay | null>(null)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [pick, setPick] = useState<LL | null>(null)
  const [tab, setTab] = useState("active")
  const [sheetOpen, setSheetOpen] = useState(false)
  const [cmdOpen, setCmdOpen] = useState(false)
  const [scaleOpen, setScaleOpen] = useState(false)
  const [glossOpen, setGlossOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [hint, setHint] = useState(() => { try { return !localStorage.getItem(HINT_KEY) } catch { return false } })
  const dismissHint = () => { if (!hint) return; setHint(false); try { localStorage.setItem(HINT_KEY, "1") } catch { /* unavailable */ } }
  const isMobile = useMedia("(max-width: 720px), (max-height: 480px)") // phones, including on their side
  const reduced = useMedia("(prefers-reduced-motion: reduce)")
  const [home] = useState<View>(() => ({ ...START, zoom: typeof window !== "undefined" && window.innerWidth < 720 ? 1.15 : 1 }))
  const [camera] = useState(() => createCamera(home))

  const { fileAgeH, feedFresh, offline, live, active, ALL, fresh, selected, replayStorm } = useActiveStorms(feed, now, selectedId, replay)

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
    setSelectedId(id); setSheetOpen(false); setPick(null); setCustomizeOpen(false)
    const atEnd = replay?.id === id && replay.at >= endMs(s)
    setReplay({ id, at: replay?.id === id && !atEnd ? replay.at : startMs(s) })
    setPlaying(true)
    const mid = s.track[Math.floor(s.track.length * 0.6)]
    flyTo(mid.lon, mid.lat, Math.max(camera.get().zoom, 1.9))
  }
  const select = (id: string | null) => {
    setSelectedId(id); setSheetOpen(false)
    if (id) setCustomizeOpen(false) // keep the storm details roomy: Customize folds back to its short form
    if (id) setPick(null)
    if (!id) { setReplay(null); setPlaying(false); return }
    if (replay && replay.id !== id) { setReplay(null); setPlaying(false) }
    const s = ALL.find(x => x.id === id)
    if (!s) return
    if (s.kind === "past") { startReplay(id); return }
    const st = stateAt(s)
    flyTo(st.lon, st.lat, Math.max(camera.get().zoom, isMobile ? 1.6 : 1.5))
  }

  useReplayClock(playing, replayStorm, speed, setReplay, setPlaying)

  const markers = useStormMarkers(active, live, replay, replayStorm, units.wind)
  const stormStates = active.map(s => ({ s, st: stormState(s, replay) }))
  const pastReplay = replayStorm?.kind === "past"
  const shownLook = effectiveCfg(look, layers, pastReplay)
  const frame: FrameProps = {
    active, live, now, offline, feedFresh, fileAgeH, fetchedAt: feed.file.fetchedAt, fresh, units, setUnits,
    selected, selectedId, setSelectedId, replay, setReplay, replayStorm, playing, setPlaying, speed, setSpeed,
    pick, setPick, stormStates, hint, dismissHint, isMobile, tab, setTab, sheetOpen, setSheetOpen,
    layers, setLayers, look, setLook, customizeOpen, setCustomizeOpen, shownLook, camera, home, zoomBy, flyTo,
    select, startReplay, setCmdOpen, setScaleOpen, setGlossOpen, setAboutOpen, setSettingsOpen,
  }

  return (
    <TooltipProvider delayDuration={250}>
      <main className="relative h-full w-full overflow-hidden bg-black" data-light={look.earth === "paper" || undefined} onPointerDownCapture={dismissHint}>
        <h1 className="sr-only">Vayu storm globe</h1>
        <Globe markers={markers} selectedId={selectedId} camera={camera} home={home} onSelect={id => select(id)}
          pick={pick} onPick={p => setPick(p ? { lon: p.lon, lat: p.lat } : null)} reducedMotion={reduced}
          showParticles={!pastReplay} fieldVersion={fieldVersion} dimField={pastReplay} look={look} layers={pastReplay ? { ...layers, colors: false } : layers}
          offsetY={isMobile ? Math.round(window.innerHeight * (selected ? 0.24 : window.innerHeight > 600 && !offline && feedFresh ? 0.06 : 0)) : 0}
          renderPick={isMobile ? undefined : (x, y, w, h) => {
            const { left, top } = placeReadout(x, y, w, h)
            return pick && <PointReadout key={`${pick.lon},${pick.lat}`} {...pick} units={units} storms={stormStates} onClose={() => setPick(null)}
              className="q-pop" style={{ position: "absolute", left, top, transformOrigin: `${left > x ? "0" : "100%"} ${y - top}px` }} />
          }} />

        {/* Desktop */}
        {!isMobile && desktopLayout(frame)}

        {/* Phone */}
        {isMobile && phoneLayout(frame)}

        <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} storms={active} past={PAST} units={units}
          onStorm={id => { setCmdOpen(false); select(id) }}
          onPlace={(lon, lat) => { setCmdOpen(false); select(null); setPick({ lon, lat }); flyTo(lon, lat, Math.max(camera.get().zoom, 2.2)) }} />
        <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} units={units} setUnits={setUnits} layers={layers} setLayers={setLayers}
          onScale={() => setScaleOpen(true)} onGlossary={() => setGlossOpen(true)} onAbout={() => setAboutOpen(true)} />
        <ScaleDialog units={units} open={scaleOpen} onOpenChange={setScaleOpen} />
        <GlossaryDialog open={glossOpen} onOpenChange={setGlossOpen} />
        <AboutDialog file={feed.file} live={feed.origin === "live"} reachable={feed.reachable} now={now} units={units} open={aboutOpen} onOpenChange={setAboutOpen} />
      </main>
    </TooltipProvider>
  )
}

/** Where the point readout goes on desktop: beside the click, but never under a card.
 *  Tries right, left, below and above the point, takes the first spot that overlaps no panel,
 *  and otherwise the spot with the least overlap. */
function placeReadout(x: number, y: number, w: number, h: number) {
  const W = 284, H = 300, gap = 20, m = 12
  const root = document.querySelector("main")?.getBoundingClientRect()
  const ox = root?.left ?? 0, oy = root?.top ?? 0
  const rects = [...document.querySelectorAll('aside[aria-label="Storms"], section[aria-label="Storm details"], section[aria-label="Customize the globe"], [data-avoid]')]
    .map(e => e.getBoundingClientRect()).filter(r => r.width > 0 && r.height > 0)
    .map(r => ({ l: r.left - ox - 8, t: r.top - oy - 8, r: r.right - ox + 8, b: r.bottom - oy + 8 }))
  // Every position on a coarse grid that fits on screen, scored by how much it covers a panel
  // (heavily) and how far it is from the click (lightly). Tidy spots beside the click win.
  const overlap = (left: number, top: number) => rects.reduce((sum, r) => {
    const ix = Math.min(left + W, r.r) - Math.max(left, r.l), iy = Math.min(top + H, r.b) - Math.max(top, r.t)
    return sum + (ix > 0 && iy > 0 ? ix * iy : 0)
  }, 0)
  const near = (left: number, top: number) => {
    const dx = x < left ? left - x : x > left + W ? x - left - W : 0, dy = y < top ? top - y : y > top + H ? y - top - H : 0
    const onClick = dx === 0 && dy === 0 // never cover the point that was clicked
    return Math.hypot(dx - gap, dy) + (onClick ? 5000 : 0)
  }
  let best = { left: m, top: m }, bestScore = Infinity
  for (let left = m; left <= w - W - m; left += 16) for (let top = m; top <= h - H - m; top += 16) {
    const score = overlap(left, top) * 10 + near(left, top)
    if (score < bestScore) { bestScore = score; best = { left, top } }
  }
  return best
}
