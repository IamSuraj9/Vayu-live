import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { geoDistance, geoGraticule10, geoOrthographic, geoPath } from "d3-geo"
import { HIGH, LOW, loadHigh } from "./world"
import { useWindOverlay } from "./overlay"
import { type Camera, type View } from "./camera"
import { LookLayer } from "./LookLayer"
import { type Cfg, HEAT, effectiveCfg, sameCfg } from "@/looks/presets"
import { useWindParticles } from "./particles"
import { useGlobeGestures } from "./gestures"
import { stormMarkers, stormTracks } from "./marker-layer"

export { StormGlyph } from "./marker-layer"

export type { View } from "./camera"
export type LL = { lon: number; lat: number }
export type TrackPt = LL & { color: string }
export type Marker = LL & {
  id: string; name: string; color: string; label: string; dim?: boolean
  /** extra words for screen readers, after the visible name and wind */
  hint?: string
  /** sustained wind in knots: the marker grows with it */
  kt?: number
  past: TrackPt[]; ghost?: LL[]; forecast: TrackPt[]
}

type Props = {
  markers: Marker[]; selectedId: string | null; camera: Camera
  onSelect: (id: string | null) => void; pick: LL | null; onPick: (p: (LL & { x: number; y: number }) | null) => void
  reducedMotion: boolean; showParticles: boolean; dimField?: boolean; offsetY?: number; fieldVersion?: number
  /** where a double-tap on a phone returns to once the globe is zoomed all the way in */
  home?: View
  look?: Cfg; layers?: Layers; renderPick?: (x: number, y: number, w: number, h: number) => React.ReactNode
}
export type Layers = { particles: boolean; colors: boolean; paths: boolean; borders: boolean }
const ALL_ON: Layers = { particles: true, colors: true, paths: true, borders: true }

// Wind-speed colour ramp (m/s), close in spirit to earth.nullschool's surface-wind overlay
const STOPS: [number, [number, number, number]][] = [
  [0, [24, 30, 104]], [2, [32, 46, 150]], [4, [36, 70, 180]], [6, [32, 108, 190]], [8, [34, 146, 172]],
  [10, [52, 170, 122]], [12, [92, 190, 82]], [15, [176, 200, 62]], [18, [226, 170, 52]], [22, [230, 112, 52]],
  [27, [214, 56, 92]], [33, [178, 62, 190]], [40, [222, 172, 240]], [50, [255, 255, 255]],
]
export function rampColor(ms: number): [number, number, number] {
  if (ms <= 0) return STOPS[0][1]
  for (let i = 0; i < STOPS.length - 1; i++) {
    const [a, ca] = STOPS[i], [b, cb] = STOPS[i + 1]
    if (ms <= b) {
      const f = (ms - a) / (b - a)
      return [ca[0] + (cb[0] - ca[0]) * f, ca[1] + (cb[1] - ca[1]) * f, ca[2] + (cb[2] - ca[2]) * f]
    }
  }
  return STOPS[STOPS.length - 1][1]
}
export const RAMP_CSS = `linear-gradient(90deg, ${STOPS.filter(s => s[0] <= 40).map(([v, c]) => `rgb(${c.map(Math.round).join(",")}) ${(v / 40) * 100}%`).join(", ")})`
const LUT = Array.from({ length: 241 }, (_, i) => rampColor(i / 4))

const graticule = geoGraticule10()

export function Globe({ markers, selectedId, camera, onSelect, pick, onPick, reducedMotion, showParticles: showP, dimField = false, offsetY = 0, fieldVersion = 0, home, look = HEAT.cfg, layers = ALL_ON, renderPick }: Props) {
  // Heat is drawn by the layers below (fast, and what ships today). Every other look is drawn by the look engine, loaded on demand.
  const wantsEngine = !sameCfg(look, HEAT.cfg) && fieldVersion > 0
  const [engineReady, setEngineReady] = useState(false)
  useEffect(() => { if (!wantsEngine) setEngineReady(false) }, [wantsEngine])
  const legacyOn = !(wantsEngine && engineReady)
  const showParticles = showP && layers.particles && legacyOn
  const wrap = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const mapRef = useRef<HTMLCanvasElement>(null)
  const partRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ w: 900, h: 700 })
  const [interacting, setInteracting] = useState(false)
  const view = useSyncExternalStore(camera.subscribe, camera.get)
  const viewRef = useRef(view); viewRef.current = view
  // Ease the globe up/down when the phone card opens instead of jumping (critically damped, ~0.45 s)
  const [oy, setOy] = useState(offsetY)
  useEffect(() => {
    if (reducedMotion) { setOy(offsetY); return }
    let raf = 0, last = performance.now(), y = oy, v = 0
    const w = (2 * Math.PI) / 0.45
    const tick = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000); last = t
      v += (-w * w * (y - offsetY) - 2 * w * v) * dt; y += v * dt
      if (Math.abs(y - offsetY) < 0.3 && Math.abs(v) < 2) { setOy(offsetY); return }
      setOy(y); raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offsetY, reducedMotion])
  const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1)

  const base = Math.min(size.w, size.h) * (size.w < 720 ? 0.47 : 0.44)
  const projection = useMemo(
    () => geoOrthographic().rotate([-view.lon, -view.lat]).translate([size.w / 2, size.h / 2 - oy]).scale(base * view.zoom).clipAngle(90).precision(0.3),
    [view, size, base, oy],
  )
  const projRef = useRef(projection); projRef.current = projection
  const svgPath = useMemo(() => geoPath(projection), [projection])
  const radius = base * view.zoom
  const fieldReady = fieldVersion > 0

  // "Moving" lasts until the view has been still for 160 ms. While moving, the light map is drawn.
  const [moving, setMoving] = useState(false)
  const settle = useRef<number | undefined>(undefined)
  const firstView = useRef(true)
  useEffect(() => {
    if (firstView.current) { firstView.current = false; return }
    setMoving(true)
    window.clearTimeout(settle.current)
    settle.current = window.setTimeout(() => setMoving(false), 160)
  }, [view, oy])
  useEffect(() => () => window.clearTimeout(settle.current), [])

  // Fetch the detailed map only once the globe is big enough on screen for the extra detail to show
  const wantHigh = radius > 350
  const [highReady, setHighReady] = useState(!!HIGH)
  useEffect(() => { if (wantHigh && !highReady) loadHigh().then(() => setHighReady(true), () => {}) }, [wantHigh, highReady])
  const lines = !moving && wantHigh && highReady && HIGH ? HIGH : LOW

  const visible = (lon: number, lat: number) => geoDistance([lon, lat], [view.lon, view.lat]) < Math.PI / 2 - 0.015

  useEffect(() => {
    const el = wrap.current!
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.max(1, e.contentRect.width), h: Math.max(1, e.contentRect.height) }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Coastlines, borders and graticule
  useEffect(() => {
    const c = mapRef.current!
    c.width = size.w * dpr; c.height = size.h * dpr
    const ctx = c.getContext("2d")!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size.w, size.h)
    if (!legacyOn) return
    const p = geoPath(projection, ctx)
    if (!layers.colors) { ctx.beginPath(); p({ type: "Sphere" }); ctx.fillStyle = "#0d0f14"; ctx.fill() }
    if (layers.borders) {
      ctx.beginPath(); p(graticule); ctx.strokeStyle = "rgba(255,255,255,0.06)"; ctx.lineWidth = 0.6; ctx.stroke()
      ctx.beginPath(); p(lines.borders); ctx.strokeStyle = "rgba(255,255,255,0.17)"; ctx.lineWidth = 0.6; ctx.stroke()
    }
    ctx.beginPath(); p(lines.coastline); ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.lineWidth = 0.85; ctx.stroke()
    ctx.beginPath(); p({ type: "Sphere" }); ctx.strokeStyle = "rgba(255,255,255,0.14)"; ctx.lineWidth = 1; ctx.stroke()
  }, [projection, size, dpr, layers.colors, layers.borders, lines, legacyOn])

  useWindOverlay(overlayRef, projection, size, dpr, layers.colors && fieldReady && legacyOn, LUT, fieldVersion)

  useWindParticles(partRef, projRef, size, dpr, showParticles, fieldReady, reducedMotion, interacting)
  const { onPointerDown, onPointerMove, onPointerUp, onKeyDown } = useGlobeGestures(
    wrap, projRef, projection, camera, reducedMotion, home, onSelect, onPick, setInteracting,
  )

  const pickXY = pick && visible(pick.lon, pick.lat) ? projection([pick.lon, pick.lat]) : null

  return (
    <div
      ref={wrap}
      className="absolute inset-0 touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset"
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown} tabIndex={0}
      aria-label="Globe. Drag to turn, scroll or pinch to zoom, click a point to read the weather there. Arrow keys also turn the globe."
      role="application"
      style={{ cursor: interacting ? "grabbing" : "grab" }}
    >
      {wantsEngine && (
        <LookLayer cfg={effectiveCfg(look, layers, dimField)} camera={camera} size={size} dpr={dpr} base={base} oy={oy}
          fieldVersion={fieldVersion} reducedMotion={reducedMotion} onReady={() => setEngineReady(true)} />
      )}
      <canvas ref={overlayRef} className="absolute inset-0 h-full w-full transition-opacity duration-500" style={{ opacity: !fieldReady ? 0 : dimField ? 0.28 : 1 }} />
      <canvas ref={mapRef} className="absolute inset-0 h-full w-full" />
      <canvas ref={partRef} className="absolute inset-0 h-full w-full" />
      <svg className="pointer-events-none absolute inset-0" width={size.w} height={size.h} aria-hidden="true">
        {stormTracks(layers.paths, markers, selectedId, svgPath, look, visible, projection)}
        {pickXY && (
          <g key={`${pick!.lon},${pick!.lat}`} className="q-ring" style={{ transformOrigin: `${pickXY[0]}px ${pickXY[1]}px` }}>
            <circle cx={pickXY[0]} cy={pickXY[1]} r={10} fill="none" stroke="#000" strokeOpacity={0.5} strokeWidth={4} />
            <circle cx={pickXY[0]} cy={pickXY[1]} r={10} fill="none" stroke="#ffffff" strokeWidth={2} />
            <circle cx={pickXY[0]} cy={pickXY[1]} r={2.5} fill="#ffffff" />
          </g>
        )}
      </svg>
      {stormMarkers(markers, selectedId, visible, projection, size, look, reducedMotion, onSelect)}
      {pickXY && renderPick?.(pickXY[0], pickXY[1], size.w, size.h)}
    </div>
  )
}
