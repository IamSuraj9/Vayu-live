import type { GeoPath, GeoProjection } from "d3-geo"
import type { Cfg } from "@/looks/presets"
import { cn } from "@/lib/utils"
import type { Marker } from "./Globe"

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
            <circle key={i} r={11} fill="none" stroke={color} strokeWidth={1.6} className={reducedMotion ? undefined : "vayu-ring"}
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
          <g className={reducedMotion ? undefined : south ? "vayu-whirl-cw" : "vayu-whirl-ccw"}>
            {[0, 1].map(k => <path key={k} d={spiralArm(r, spin, k)} fill="none" stroke={color} strokeOpacity={0.95} strokeWidth={2.2} strokeLinecap="round" />)}
          </g>
          <circle r={2.6} fill="#fff" stroke="rgba(0,0,0,0.45)" strokeWidth={0.8} />
        </svg>
      )}
    </span>
  )
}

export function stormTracks(
  showPaths: boolean,
  markers: Marker[],
  selectedId: string | null,
  svgPath: GeoPath,
  look: Cfg,
  visible: (lon: number, lat: number) => boolean,
  projection: GeoProjection,
) {
  if (!showPaths) return null
  return markers.map(m => {
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
  })
}

export function stormMarkers(
  markers: Marker[],
  selectedId: string | null,
  visible: (lon: number, lat: number) => boolean,
  projection: GeoProjection,
  size: { w: number; h: number },
  look: Cfg,
  reducedMotion: boolean,
  onSelect: (id: string | null) => void,
) {
  return markers.map(m => {
    if (!visible(m.lon, m.lat)) return null
    const [x, y] = projection([m.lon, m.lat])!
    const sel = m.id === selectedId
    const r = 9 + Math.min(m.kt ?? 40, 160) / 11, S = Math.round(2 * r + 8) // a stronger storm draws a larger spiral
    const labelW = Math.round((m.name.length + m.label.length) * 7 + 40) // close enough to decide which side has room
    const flip = x + S / 2 + labelW > size.w - 8 && x - S / 2 - labelW > 8 // label goes left when it would run off the right edge
    return (
      <button
        key={m.id} type="button" data-storm={m.id}
        onClick={e => { if (e.detail === 0) onSelect(m.id) }}
        className={cn(
          "group absolute flex -translate-y-1/2 items-center gap-1.5 rounded-full py-0.5 text-left outline-none before:absolute before:-inset-y-1 before:inset-x-0 before:content-['']",
          flip ? "flex-row-reverse pr-0.5 pl-2.5" : "pr-2.5 pl-0.5",
          "focus-visible:ring-2 focus-visible:ring-ring",
        )}
        style={flip ? { right: size.w - (x + S / 2 + 2), top: y } : { left: x - S / 2 - 2, top: y }}
        aria-label={`${m.name} ${m.label}${m.hint ? `, ${m.hint}` : ""}`}
        aria-pressed={sel}
      >
        <span className={cn("flex", m.dim && "opacity-50")}><StormGlyph color={m.color} south={m.lat < 0} selected={sel} reducedMotion={reducedMotion} variant={look.storms} size={S} glow /></span>
        <span className={cn(
          "rounded-full border px-2.5 py-1 text-[12px] leading-none whitespace-nowrap transition-colors",
          sel ? "liquid-chip-on border-transparent text-neutral-950" : "liquid-chip border-transparent text-white",
        )}>
          <span className="font-medium">{m.name}</span>{" "}
          <span className={cn("ml-1.5 font-mono text-[11px] tabular-nums", sel ? "text-neutral-700" : "text-white/70")}>{m.label}</span>
        </span>
      </button>
    )
  })
}
