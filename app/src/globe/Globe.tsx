import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { geoDistance, geoGraticule10, geoOrthographic, geoPath } from "d3-geo"
import { HIGH, LOW, loadHigh } from "./world"
import { windAt } from "./field"
import { useWindOverlay, rescaleTrails } from "./overlay"
import { ZOOM_MAX, type Camera, type View } from "./camera"
import { cn } from "@/lib/utils"
import { LookLayer } from "./LookLayer"
import { type Cfg, HEAT, effectiveCfg, sameCfg } from "@/looks/presets"

export type { View } from "./camera"
export type LL = { lon: number; lat: number }
export type TrackPt = LL & { color: string }
export type Marker = LL & {
  id: string; name: string; color: string; label: string; dim?: boolean
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
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const wrapLon = (l: number) => ((l + 540) % 360) - 180

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
  const interactRef = useRef(false)
  const idle = useRef<number | undefined>(undefined)
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

  const begin = () => { window.clearTimeout(idle.current); if (!interactRef.current) { interactRef.current = true; setInteracting(true) } }
  const endSoon = () => {
    window.clearTimeout(idle.current)
    idle.current = window.setTimeout(() => { interactRef.current = false; setInteracting(false) }, 180)
  }

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

  // Animated particles that follow the wind (in lon/lat space, projected each frame)
  useEffect(() => {
    const c = partRef.current!
    c.width = size.w * dpr; c.height = size.h * dpr
    const ctx = c.getContext("2d")!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    if (!showParticles || !fieldReady) { ctx.clearRect(0, 0, size.w, size.h); return }
    const N = Math.round(clamp((size.w * size.h) / 240, 1200, 5200))
    type P = { lon: number; lat: number; age: number; max: number }
    const parts: P[] = Array.from({ length: N }, () => ({ lon: 0, lat: 0, age: 1, max: 0 }))
    const spawn = (p: P) => {
      const pr = projRef.current
      const [cx, cy] = pr.translate(), r = pr.scale()
      const x0 = Math.max(0, cx - r), x1 = Math.min(size.w, cx + r), y0 = Math.max(0, cy - r), y1 = Math.min(size.h, cy + r)
      for (let k = 0; k < 8; k++) {
        const x = x0 + Math.random() * (x1 - x0), y = y0 + Math.random() * (y1 - y0)
        if ((x - cx) ** 2 + (y - cy) ** 2 > r * r * 0.985) continue
        const ll = pr.invert!([x, y])
        if (ll) { p.lon = ll[0]; p.lat = ll[1]; p.age = 0; p.max = 30 + Math.random() * 80; return }
      }
      p.age = 0; p.max = 0
    }
    parts.forEach(p => { spawn(p); p.age = Math.floor(Math.random() * p.max) })
    let raf = 0, frames = 0, lastKey = "", lastScale = 0, lastRot = ""
    const scratch = document.createElement("canvas")
    const tick = () => {
      const pr = projRef.current
      const key = `${pr.scale()}|${pr.rotate().join(",")}|${pr.translate().join(",")}`
      const moved = key !== lastKey
      const rotKey = `${pr.rotate().join(",")}|${pr.translate().join(",")}`
      const zoomOnly = moved && rotKey === lastRot && lastScale > 0
      if (zoomOnly) rescaleTrails(c, ctx, scratch, pr.translate()[0], pr.translate()[1], pr.scale() / lastScale, dpr)
      lastKey = key; lastRot = rotKey; lastScale = pr.scale()
      const rot = pr.rotate(), center: [number, number] = [-rot[0], -rot[1]]
      const k = 0.11 / pr.scale() * (180 / Math.PI)
      if (moved && !zoomOnly) ctx.clearRect(0, 0, size.w, size.h)
      else {
        ctx.globalCompositeOperation = "destination-in"
        ctx.fillStyle = "rgba(0,0,0,0.92)"; ctx.fillRect(0, 0, size.w, size.h)
        ctx.globalCompositeOperation = "source-over"
      }
      ctx.beginPath()
      for (const p of parts) {
        if (p.age >= p.max) { spawn(p); continue }
        const a = pr([p.lon, p.lat])!
        const [u, v] = windAt(p.lon, p.lat)
        p.lat += v * k
        p.lon += (u * k) / Math.max(0.08, Math.cos((p.lat * Math.PI) / 180))
        p.age++
        if (p.lat > 88 || p.lat < -88 || geoDistance([p.lon, p.lat], center) > 1.55) { p.age = p.max; continue }
        const b = pr([p.lon, p.lat])!
        ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1])
      }
      ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = 0.85; ctx.stroke()
      frames++
      if (reducedMotion && frames > 70) return // draw a still set of streaks, then stop
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [size, dpr, reducedMotion, showParticles, fieldReady, reducedMotion && interacting])

  // Pointer: drag to rotate, pinch or wheel to zoom, click to read a point or pick a storm
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const drag = useRef<{ x: number; y: number; lon: number; lat: number; zoom: number; moved: boolean; dist?: number; storm?: string | null } | null>(null)
  const zoomTo = (z: number) => camera.set({ ...camera.get(), zoom: clamp(z, 0.7, 14) })
  const samples = useRef<{ t: number; lon: number; lat: number }[]>([])
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null)

  useEffect(() => {
    const el = wrap.current!
    const onWheel = (e: WheelEvent) => {
      e.preventDefault(); begin()
      const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0016))
      // Trackpads send many small deltas: follow them directly. Mouse wheels send big notches: glide between them.
      if (e.ctrlKey || (e.deltaMode === 0 && Math.abs(e.deltaY) < 40) || reducedMotion) zoomTo(camera.get().zoom * factor)
      else camera.zoomBy(factor, { duration: 0.32 })
      endSoon()
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  })

  const onPointerDown = (e: React.PointerEvent) => {
    const storm = (e.target as Element).closest?.("[data-storm]")?.getAttribute("data-storm") ?? null
    wrap.current!.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    camera.stop() // catch the globe, like touching a scrolling list on iOS
    const v = camera.get()
    samples.current = []
    drag.current = { x: e.clientX, y: e.clientY, lon: v.lon, lat: v.lat, zoom: v.zoom, moved: pointers.current.size > 1, storm }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const d = drag.current
    if (!d) return
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      if (!d.dist) { d.dist = dist; d.zoom = camera.get().zoom }
      d.moved = true; begin(); zoomTo(d.zoom * (dist / d.dist))
      return
    }
    const dx = e.clientX - d.x, dy = e.clientY - d.y
    if (!d.moved && Math.hypot(dx, dy) < 4) return
    if (!d.moved) { d.moved = true }
    begin()
    const k = 180 / (Math.PI * projRef.current.scale())
    const next = { lon: wrapLon(d.lon - dx * k), lat: clamp(d.lat + dy * k, -85, 85), zoom: camera.get().zoom }
    camera.set(next)
    const now = performance.now()
    samples.current.push({ t: now, lon: d.lon - dx * k, lat: next.lat })
    while (samples.current.length > 2 && now - samples.current[0].t > 90) samples.current.shift()
  }
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    const d = drag.current
    if (pointers.current.size > 0) return
    drag.current = null
    if (d && d.moved) {
      const sm = samples.current, a = sm[0], b = sm[sm.length - 1]
      if (!reducedMotion && pointers.current.size === 0 && !d.dist && a && b && b.t - a.t > 12 && performance.now() - b.t < 100) {
        const dt = (b.t - a.t) / 1000
        camera.fling((b.lon - a.lon) / dt, (b.lat - a.lat) / dt)
      }
      endSoon(); return
    }
    if (d?.storm) { onSelect(d.storm); return }
    const rect = wrap.current!.getBoundingClientRect()
    const x = e.clientX - rect.left, y = e.clientY - rect.top
    const [cx, cy] = projection.translate()
    if ((x - cx) ** 2 + (y - cy) ** 2 > projection.scale() ** 2) { onPick(null); return }
    // Double-tap on a phone: zoom in on the spot. It is a one-finger way to zoom for people who cannot pinch. Once the
    // globe is zoomed all the way in, a double-tap flies back to the start view.
    if (e.pointerType !== "mouse") {
      const now = performance.now(), prev = lastTap.current
      if (prev && now - prev.t < 320 && Math.hypot(x - prev.x, y - prev.y) < 32) {
        lastTap.current = null
        onPick(null)
        const v = camera.get(), ll = projection.invert!([x, y])
        if (v.zoom >= ZOOM_MAX * 0.85 && home) camera.flyTo(home, { reduced: reducedMotion })
        else if (ll) camera.flyTo({ lon: ll[0], lat: ll[1], zoom: v.zoom * 2 }, { reduced: reducedMotion })
        return
      }
      lastTap.current = { t: now, x, y }
    }
    const ll = projection.invert!([x, y])
    if (ll) onPick({ lon: ll[0], lat: ll[1], x, y })
  }
  const onKeyDown = (e: React.KeyboardEvent) => {
    const v = camera.get(), stepDeg = 6 / v.zoom
    const moves: Record<string, Partial<View>> = {
      ArrowLeft: { lon: wrapLon(v.lon - stepDeg) }, ArrowRight: { lon: wrapLon(v.lon + stepDeg) },
      ArrowUp: { lat: clamp(v.lat + stepDeg, -85, 85) }, ArrowDown: { lat: clamp(v.lat - stepDeg, -85, 85) },
      "+": { zoom: clamp(v.zoom * 1.2, 0.7, 14) }, "=": { zoom: clamp(v.zoom * 1.2, 0.7, 14) }, "-": { zoom: clamp(v.zoom / 1.2, 0.7, 14) },
    }
    if (moves[e.key]) { e.preventDefault(); begin(); camera.set({ ...v, ...moves[e.key] }); endSoon() }
  }

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
        {layers.paths && markers.map(m => {
          const sel = m.id === selectedId
          return (
            <g key={m.id} opacity={m.dim ? 0.4 : 1}>
              {m.ghost && m.ghost.length > 1 && (
                <path d={svgPath({ type: "LineString", coordinates: m.ghost.map(p => [p.lon, p.lat]) }) ?? ""}
                  fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={1.5} strokeDasharray="1 4" strokeLinecap="round" />
              )}
              {m.past.slice(0, -1).map((p, i) => {
                const q = m.past[i + 1]
                const d = svgPath({ type: "LineString", coordinates: [[p.lon, p.lat], [q.lon, q.lat]] })
                return d ? (
                  <g key={i}>
                    <path d={d} fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth={sel ? 5.5 : 4} strokeLinecap="round" />
                    {look.storms === "rings" && <path d={d} fill="none" stroke={p.color} strokeOpacity={0.25} strokeWidth={sel ? 8 : 6.5} strokeLinecap="round" />}
                    <path d={d} fill="none" stroke={p.color} strokeWidth={sel ? 3 : 2} strokeLinecap="round" strokeDasharray={look.storms === "eye" ? "0.1 5.5" : undefined} />
                  </g>
                ) : null
              })}
              {m.forecast.length > 0 && (
                <>
                  <path d={svgPath({ type: "LineString", coordinates: [[m.lon, m.lat], ...m.forecast.map(f => [f.lon, f.lat])] }) ?? ""}
                    fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth={sel ? 2.2 : 1.6} strokeDasharray={look.storms === "eye" ? "0.1 5.5" : "6 5"} strokeLinecap="round" />
                  {m.forecast.map((f, i) => {
                    if (!visible(f.lon, f.lat)) return null
                    const xy = projection([f.lon, f.lat])!
                    return <circle key={i} cx={xy[0]} cy={xy[1]} r={sel ? 4 : 3} fill={f.color} stroke="#05070d" strokeWidth={1.2} />
                  })}
                </>
              )}
            </g>
          )
        })}
        {pickXY && (
          <g key={`${pick!.lon},${pick!.lat}`} className="q-ring" style={{ transformOrigin: `${pickXY[0]}px ${pickXY[1]}px` }}>
            <circle cx={pickXY[0]} cy={pickXY[1]} r={10} fill="none" stroke="#000" strokeOpacity={0.5} strokeWidth={4} />
            <circle cx={pickXY[0]} cy={pickXY[1]} r={10} fill="none" stroke="#ffffff" strokeWidth={2} />
            <circle cx={pickXY[0]} cy={pickXY[1]} r={2.5} fill="#ffffff" />
          </g>
        )}
      </svg>
      {markers.map(m => {
        if (!visible(m.lon, m.lat)) return null
        const [x, y] = projection([m.lon, m.lat])!
        const sel = m.id === selectedId
        const r = 9 + Math.min(m.kt ?? 40, 160) / 11, S = Math.round(2 * r + 8) // a stronger storm draws a larger spiral
        return (
          <button
            key={m.id} type="button" data-storm={m.id}
            onClick={e => { if (e.detail === 0) onSelect(m.id) }}
            className={cn(
              "group absolute flex -translate-y-1/2 items-center gap-1.5 rounded-full py-0.5 pr-2.5 pl-0.5 text-left outline-none",
              "focus-visible:ring-2 focus-visible:ring-ring",
              m.dim && "opacity-50",
            )}
            style={{ left: x - S / 2 - 2, top: y }}
            aria-label={`${m.name} ${m.label}`}
            aria-pressed={sel}
          >
            <StormGlyph color={m.color} south={m.lat < 0} selected={sel} reducedMotion={reducedMotion} variant={look.storms} size={S} glow />
            <span className={cn(
              "rounded-full border px-2.5 py-1 text-[12px] leading-none whitespace-nowrap transition-colors",
              sel ? "liquid-chip-on border-transparent text-neutral-950" : "liquid-chip border-transparent text-white",
            )}>
              <span className="font-medium">{m.name}</span>
              <span className={cn("ml-1.5 font-mono text-[11px] tabular-nums", sel ? "text-neutral-600" : "text-white/60")}>{m.label}</span>
            </span>
          </button>
        )
      })}
      {pickXY && renderPick?.(pickXY[0], pickXY[1], size.w, size.h)}
    </div>
  )
}

/** Two thin arms that wind outward from a white eye, turning slowly (counter-clockwise north of the equator, clockwise south) */
function spiralArm(r: number, spin: number, k: number) {
  let d = ""
  for (let i = 0; i <= 28; i++) {
    const th = (i / 28) * Math.PI * 1.9, rho = (0.18 + 0.82 * (i / 28)) * r
    const a = k * Math.PI - spin * th
    d += `${i ? "L" : "M"}${(Math.cos(a) * rho).toFixed(2)} ${(Math.sin(a) * rho).toFixed(2)}`
  }
  return d
}

export function StormGlyph({ color, south, selected, reducedMotion, size = 30, variant = "spiral", glow }: { color: string; south?: boolean; selected?: boolean; reducedMotion?: boolean; size?: number; variant?: Cfg["storms"]; glow?: boolean }) {
  const r = (size - 8) / 2, spin = south ? 1 : -1
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      {glow && <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-1/2 rounded-full" style={{ width: r * 3.4, height: r * 3.4, transform: "translate(-50%,-50%)", background: `radial-gradient(circle, color-mix(in srgb, ${color} 38%, transparent), transparent 70%)` }} />}
      {selected && <span className="absolute -inset-0.5 rounded-full ring-2 ring-white/90" />}
      {variant === "rings" ? (
        <svg viewBox="-13 -13 26 26" width={size} height={size} aria-hidden="true" style={{ overflow: "visible" }}>
          {[0, 1, 2].map(i => (
            <circle key={i} r={11} fill="none" stroke={color} strokeWidth={1.6} className={reducedMotion ? undefined : "qellon-ring"}
              style={reducedMotion ? { opacity: 0.7 - i * 0.2, transform: `scale(${0.45 + i * 0.28})` } : { animationDelay: `${i * -0.9}s` }} />
          ))}
          <circle r={4.2} fill={color} stroke="#05070d" strokeWidth={1.4} />
        </svg>
      ) : variant === "eye" ? (
        <svg viewBox="-13 -13 26 26" width={size} height={size} aria-hidden="true">
          <circle r={7.4} fill="#000" fillOpacity={0.45} stroke="#000" strokeOpacity={0.6} strokeWidth={4.4} />
          <circle r={7.4} fill={color} fillOpacity={0.25} stroke={color} strokeWidth={2.2} />
          <path d="M0 -9.4V-12.6M0 9.4V12.6M-9.4 0H-12.6M9.4 0H12.6" stroke="#fff" strokeWidth={1.6} strokeLinecap="round" />
          <circle r={2.6} fill="#fff" stroke="#05070d" strokeWidth={1} />
        </svg>
      ) : (
        <svg viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} width={size} height={size} aria-hidden="true" style={{ overflow: "visible" }}>
          <g className={reducedMotion ? undefined : south ? "qellon-whirl-cw" : "qellon-whirl-ccw"}>
            {[0, 1].map(k => <path key={k} d={spiralArm(r, spin, k)} fill="none" stroke={color} strokeOpacity={0.95} strokeWidth={2.2} strokeLinecap="round" />)}
          </g>
          <circle r={2.6} fill="#fff" stroke="rgba(0,0,0,0.45)" strokeWidth={0.8} />
        </svg>
      )}
    </span>
  )
}
