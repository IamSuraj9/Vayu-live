import { useId, useRef, useSyncExternalStore } from "react"
import { ChevronUp, Compass } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Kbd } from "@/components/ui/kbd"
import { cn } from "@/lib/utils"
import { LEVELS } from "@/lib/strength"
import { type Units, WIND_LABEL, fmtTempK, windFromMs } from "@/lib/units"
import { glass } from "@/components/panels"
import { ZOOM_MAX, ZOOM_MIN, type Camera, type View } from "@/globe/camera"
import { BAND_VALUE, colorAt, rgba, tempColor } from "@/looks/palettes"
import { type Cfg, HEAT, OPTIONS, PRESETS, presetOf } from "@/looks/presets"
import heat from "@/looks/thumbs/heat.webp"
import ink from "@/looks/thumbs/ink.webp"
import night from "@/looks/thumbs/night.webp"
import dots from "@/looks/thumbs/dots.webp"
import chart from "@/looks/thumbs/chart.webp"
import relief from "@/looks/thumbs/relief.webp"
import bands from "@/looks/thumbs/bands.webp"
import ribbons from "@/looks/thumbs/ribbons.webp"

// Small pictures of each look for the picker. The globe itself is always drawn live from today's data.
const THUMB: Record<string, string> = { heat, ink, night, dots, chart, relief, bands, ribbons }

/* ---------- zoom pill: a small globe and a large globe, like Safari's small A and large A ---------- */

function GlobeIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={size > 16 ? 1.7 : 2.2} strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9.5" /><ellipse cx="12" cy="12" rx="4" ry="9.5" /><path d="M2.5 12h19" />
    </svg>
  )
}

function PillButton({ label, shortcut, disabled, onClick, large, children }: { label: string; shortcut?: string; disabled?: boolean; onClick: () => void; large?: boolean; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* aria-disabled, not disabled, so keyboard focus is not lost when the button reaches its limit */}
        <button type="button" aria-label={label} aria-disabled={disabled || undefined} onClick={() => { if (!disabled) onClick() }}
          className={cn("grid place-items-center rounded-full text-foreground/80 outline-none transition-[background-color,opacity,transform] duration-150 hover:bg-white/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:scale-95 aria-disabled:opacity-35 aria-disabled:hover:bg-transparent",
            large ? "h-11 w-14" : "h-8 w-12")}>
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="flex items-center gap-2">{label}{shortcut && <Kbd>{shortcut}</Kbd>}</TooltipContent>
    </Tooltip>
  )
}

export function ZoomPill({ camera, home, onZoomIn, onZoomOut, onReset, large }: {
  camera: Camera; home: View; onZoomIn: () => void; onZoomOut: () => void; onReset: () => void; large?: boolean
}) {
  const v = useSyncExternalStore(camera.subscribe, camera.get)
  const atStart = Math.abs(v.zoom - home.zoom) < 0.02 && Math.abs(v.lat - home.lat) < 0.3 && Math.abs(((v.lon - home.lon + 540) % 360) - 180) < 0.3
  return (
    <div role="group" aria-label="Zoom" className={cn(glass, "lens flex items-center gap-0.5 rounded-full p-1")}>
      <PillButton label="Zoom out" shortcut="−" large={large} disabled={v.zoom <= ZOOM_MIN + 0.01} onClick={onZoomOut}><GlobeIcon size={15} /></PillButton>
      <PillButton label="Zoom in" shortcut="+" large={large} disabled={v.zoom >= ZOOM_MAX - 0.01} onClick={onZoomIn}><GlobeIcon size={23} /></PillButton>
      <span className="mx-0.5 h-5 w-px bg-white/15" aria-hidden="true" />
      <PillButton label="Back to the start view" large={large} disabled={atStart} onClick={onReset}><Compass className="size-[18px]" /></PillButton>
    </div>
  )
}

/* ---------- legend: follows the look ---------- */

const grad = (stops: string[]) => `linear-gradient(90deg, ${stops.join(",")})`

export function LookLegend({ cfg, units, onScale, compact }: { cfg: Cfg; units: Units; onScale: () => void; compact?: boolean }) {
  const ms = [0, 10, 20, 30, 40]
  const ticks = (vals: string[]) => (
    <div className="mt-1.5 flex justify-between font-mono text-[10.5px] text-muted-foreground tabular-nums">{vals.map(t => <span key={t}>{t}</span>)}</div>
  )
  const head = (title: string, unit?: string) => (
    <p className="flex items-baseline justify-between text-[12px]"><span className="text-muted-foreground">{title}</span>{unit && <span className="font-mono text-[11px] text-muted-foreground">{unit}</span>}</p>
  )
  const speedColoured = cfg.fill === "wind" || (cfg.fill === "none" && cfg.color === "speed" && cfg.wind !== "none")
  let wind: React.ReactNode = null
  if (cfg.fill === "bands") {
    const names = ["Calm", "Breeze", "Fresh", "Gale", "Storm", "Hurricane"]
    wind = (
      <div>
        {head("Wind speed", WIND_LABEL[units.wind])}
        <div className="mt-2 grid grid-cols-6 gap-0.5" aria-hidden="true">
          {BAND_VALUE.map((v, i) => <span key={i} className={cn("h-1.5", i === 0 && "rounded-l-full", i === 5 && "rounded-r-full")} style={{ background: rgba(colorAt(cfg.palette, v)) }} />)}
        </div>
        <div className="mt-1.5 grid grid-cols-6 text-center text-[9px] leading-tight text-muted-foreground" aria-hidden="true">{names.map(n => <span key={n}>{compact ? n.slice(0, 4) : n}</span>)}</div>
        <p className="sr-only">Six bands from calm to hurricane-force</p>
      </div>
    )
  } else if (speedColoured) {
    const stops = Array.from({ length: 13 }, (_, i) => `${rgba(colorAt(cfg.palette, (i / 12) * 40))} ${(i / 12) * 100}%`)
    wind = (
      <div>
        {head("Wind speed", WIND_LABEL[units.wind])}
        <div className="mt-2 h-1.5 rounded-full" style={{ background: grad(stops) }} aria-hidden="true" />
        {ticks(ms.map(t => `${Math.round(windFromMs(t, units.wind))}${t === 40 ? "+" : ""}`))}
      </div>
    )
  } else if (cfg.fill === "zones") {
    wind = (
      <div>
        {head("Air pressure", "hPa")}
        <div className="mt-2 h-1.5 rounded-full" style={{ background: grad(["#d646ce", "#7060ff", "rgba(255,255,255,0.1)", "rgba(255,255,255,0.1)", "#ffb852"]) }} aria-hidden="true" />
        {ticks(["Low 990", "1013", "High 1030"])}
      </div>
    )
  } else if (cfg.fill === "relief") {
    wind = (
      <div>
        {head("Pressure as landscape")}
        <div className="mt-2 h-1.5 rounded-full" style={{ background: grad(["#202a3c", "#52627f", "#9fb2d2"]) }} aria-hidden="true" />
        {ticks(["Low: a dip", "High: a rise"])}
      </div>
    )
  } else if (cfg.fill === "temp") {
    const k = [235, 255, 273, 288, 300, 312]
    wind = (
      <div>
        {head("Surface temperature")}
        <div className="mt-2 h-1.5 rounded-full" style={{ background: grad(k.map((t, i) => `${rgba(tempColor(t))} ${(i / 5) * 100}%`)) }} aria-hidden="true" />
        {ticks([235, 273, 288, 312].map(t => fmtTempK(t, units.temp)))}
      </div>
    )
  }
  return (
    <div className={cn(glass, "flex flex-col gap-3 rounded-[22px] px-3.5 py-3", compact ? "w-[164px]" : "w-[300px]")}>
      {wind}
      {!compact && (
        <button type="button" onClick={onScale} className="group flex flex-col gap-1.5 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="flex items-baseline justify-between text-[12px]"><span className="text-muted-foreground">Storm strength</span><span className="text-[11.5px] text-foreground/80 group-hover:underline">How it works</span></span>
          <span className="flex gap-1" aria-hidden="true">{LEVELS.map(l => <span key={l.key} className="h-1.5 flex-1 rounded-full" style={{ background: l.color }} />)}</span>
        </button>
      )}
    </div>
  )
}

/* ---------- Customize ---------- */

function LookButton({ id, name, tag, selected, onPick, compact }: { id: string; name: string; tag: string; selected: boolean; onPick: () => void; compact?: boolean }) {
  return (
    <button type="button" aria-pressed={selected} onClick={onPick} 
      className="group min-w-0 rounded-[18px] text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-black">
      <span className={cn("relative block overflow-hidden rounded-[18px] border border-white/12 bg-[radial-gradient(circle_at_50%_40%,#11151f,#05060a)] transition-[border-color,transform,box-shadow] duration-300 ease-out motion-reduce:transition-none group-hover:-translate-y-0.5 group-hover:border-white/35 group-active:scale-[0.97]",
        compact ? "aspect-[1.25]" : "aspect-[1.12]", selected && "border-white shadow-[0_0_0_1px_#fff]")}>
        <img src={THUMB[id]} alt="" width={224} height={224} loading="lazy" decoding="async" className="absolute inset-0 size-full scale-[1.04] object-cover" />
      </span>
      <span className="mt-1.5 block text-[13px] font-semibold tracking-tight">{name}</span>
      <span className="line-clamp-2 block text-[11.5px] leading-snug text-muted-foreground">{tag}</span>
    </button>
  )
}

export function CustomizeCard({ cfg, onChange, open, onOpenChange, compact, className }: {
  cfg: Cfg; onChange: (c: Cfg) => void; open: boolean; onOpenChange: (o: boolean) => void; compact?: boolean; className?: string
}) {
  const preset = presetOf(cfg)
  const bodyId = useId()
  const toggle = useRef<HTMLButtonElement>(null)
  const first = PRESETS.slice(0, 3), rest = PRESETS.slice(3)
  const pick = (p: (typeof PRESETS)[number]) => onChange({ ...p.cfg })
  const look = (p: (typeof PRESETS)[number]) => <LookButton key={p.id} id={p.id} name={p.name} tag={p.tagline} selected={preset?.id === p.id} onPick={() => pick(p)} compact={compact} />
  return (
    <section aria-label="Customize the globe" className={cn(glass, "flex max-h-full flex-col overflow-hidden rounded-[26px] has-[>button[aria-expanded]:focus-visible]:outline-2 has-[>button[aria-expanded]:focus-visible]:outline-offset-2 has-[>button[aria-expanded]:focus-visible]:outline-ring", className)}
      onKeyDown={e => { if (e.key === "Escape" && open) { e.stopPropagation(); onOpenChange(false); toggle.current?.focus() } }}>
      <button ref={toggle} type="button" aria-expanded={open} aria-controls={bodyId}  onClick={() => onOpenChange(!open)}
        className="flex w-full shrink-0 items-center gap-3 rounded-[26px] px-5 pt-4 pb-1 text-left outline-none">
        <span className="min-w-0 flex-1">
          <span className="sr-only">Customize the globe. Current look: </span>
          <span className="block font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase" aria-hidden="true">Customize · {preset ? "Look" : "Your mix"}</span>
          <span className="mt-0.5 block text-[22px] leading-tight font-semibold tracking-tight">{preset ? preset.name : "Custom mix"}</span>
          <span className="block text-[13px] text-muted-foreground">{preset ? preset.tagline : "Built from your choices"}</span>
        </span>
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white/8" aria-hidden="true">
          <ChevronUp className={cn("size-[18px] transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none", open && "rotate-180")} />
        </span>
      </button>
      {/* announced when the look changes, for screen readers */}
      <p className="sr-only" role="status">{preset ? `${preset.name} look selected` : "Custom mix"}</p>
      <div id={bodyId} hidden={compact && !open} className="min-h-0 overflow-y-auto overscroll-contain px-3.5 pt-2 pb-3.5">
        <div role="group" aria-label="Looks" className="grid grid-cols-3 gap-2">{first.map(look)}</div>
        {!open && (
          <button type="button" onClick={() => onOpenChange(true)}
            className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-full border border-white/12 bg-white/6 text-[13px] text-foreground/90 outline-none transition-colors hover:bg-white/12 focus-visible:ring-2 focus-visible:ring-ring">
            More looks and layers<ChevronUp className="size-4" aria-hidden="true" />
          </button>
        )}
        <div className={cn("grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
          <div className="-m-4 min-h-0 overflow-hidden p-4">
            <div inert={!open} className={cn("transition-opacity duration-300 motion-reduce:transition-none", open ? "opacity-100 delay-100" : "opacity-0")}>
              <div role="group" aria-label="More looks" className="mt-2 grid grid-cols-3 gap-2">{rest.map(look)}</div>
              {preset && (
                <p className="mt-4 border-t border-white/12 pt-3.5 text-[13.5px] leading-snug text-foreground/85 text-pretty">
                  <span className="mb-0.5 block font-mono text-[11px] tracking-[0.06em] text-muted-foreground uppercase">The look</span>
                  {preset.look}
                </p>
              )}
              <div className="mt-4 border-t border-white/12 pt-3.5">
                <h3 className="mb-3 text-[13px] font-semibold">Fine-tune every layer</h3>
                {OPTIONS.map(o => (
                  <div key={o.key} className="mb-3 flex flex-col gap-1.5">
                    <span id={`${bodyId}-${o.key}`} className="font-mono text-[11px] tracking-[0.06em] text-muted-foreground uppercase">{o.label}</span>
                    <ToggleGroup type="single" value={cfg[o.key]} aria-labelledby={`${bodyId}-${o.key}`} spacing={1}
                      onValueChange={v => v && onChange({ ...cfg, [o.key]: v })} className="w-full flex-wrap">
                      {o.items.map(([v, l]) => (
                        <ToggleGroupItem key={v} value={v} className={cn("rounded-full bg-white/6 px-3 text-[12.5px] text-foreground/85", compact ? "h-11" : "h-8")}>{l}</ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                  </div>
                ))}
                {preset?.id !== HEAT.id && (
                  <button type="button" onClick={() => pick(HEAT)}
                    className="mt-1 h-11 rounded-full border border-white/12 bg-white/6 px-4 text-[13px] outline-none transition-colors hover:bg-white/12 focus-visible:ring-2 focus-visible:ring-ring">
                    Back to Heat
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
