import { useId, useState } from "react"
import {
  ArrowUpRight, BookOpen, ChevronDown, Compass, FlaskConical, Gauge, History, Layers as LayersIcon, MapPin, Minus, Navigation,
  Pause, Play, Plus, Search, Settings2, Thermometer, Wind, X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Slider } from "@/components/ui/slider"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Kbd } from "@/components/ui/kbd"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { LEVELS, headline, levelFor } from "@/lib/strength"
import {
  type Units, defaultUnits, fmtAgo, fmtDist, fmtPress, fmtSpeedKmh, fmtTempK, fmtTime, fmtWindKt, fmtWindMs, windFromKt, windFromMs, WIND_LABEL,
} from "@/lib/units"
import { bearing, compass, compassShort, distanceKm, fmtLatLon, windWords } from "@/lib/geo"
import { type Storm, type State, trend, whereNow, startMs, endMs } from "@/lib/storms"
import { CITIES } from "@/data/cities"
import { StormGlyph, RAMP_CSS, type Layers } from "@/globe/Globe"
import { FIELD_SOURCE, FIELD_TIME, sampleAt } from "@/globe/field"

export type MockState = "normal" | "empty" | "stale" | "down"

/* ---------- shared bits ---------- */

export function LevelDot({ kt, className }: { kt: number; className?: string }) {
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", className)} style={{ background: levelFor(kt).color }} aria-hidden="true" />
}

export function StrengthBadge({ kt, basin, invest }: { kt: number; basin: string; invest?: boolean }) {
  return (
    <Badge variant="outline" className="gap-1.5 rounded-full border-white/12 bg-white/5 px-2.5 py-0.5 font-medium">
      <LevelDot kt={kt} />{invest ? "Being watched" : headline(kt, basin)}
    </Badge>
  )
}

function StrengthBars({ kt }: { kt: number }) {
  const idx = LEVELS.indexOf(levelFor(kt))
  return (
    <span className="flex items-end gap-[2px]" aria-hidden="true">
      {LEVELS.map((l, i) => (
        <span key={l.key} className="w-[3px] rounded-full" style={{ height: 4 + i * 2, background: i <= idx ? levelFor(kt).color : "oklch(1 0 0 / 14%)" }} />
      ))}
    </span>
  )
}

export function ToolButton({ label, shortcut, children, className, ...rest }: React.ComponentProps<typeof Button> & { label: string; shortcut?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label} className={cn("size-8 rounded-full text-foreground/80 hover:bg-white/10 hover:text-foreground", className)} {...rest}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="flex items-center gap-2">{label}{shortcut && <Kbd>{shortcut}</Kbd>}</TooltipContent>
    </Tooltip>
  )
}

export const glass = "glass rounded-[26px] text-card-foreground"

/* ---------- sidebar ---------- */

export function SearchTrigger({ onOpen, compact }: { onOpen: () => void; compact?: boolean }) {
  if (compact) return <ToolButton label="Search" onClick={onOpen}><Search /></ToolButton>
  return (
    <button type="button" onClick={onOpen}
      className="glass-well flex h-9 w-full items-center gap-2 rounded-full px-3.5 text-[13px] text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
      <Search className="size-4" aria-hidden="true" />
      <span className="flex-1 text-left">Search storms and places</span>
      <Kbd>⌘K</Kbd>
    </button>
  )
}

function StormRow({ s, units, selected, onClick }: { s: Storm; units: Units; selected: boolean; onClick: () => void }) {
  const last = s.track[s.track.length - 1]
  const invest = s.kind === "disturbance"
  return (
    <button type="button" onClick={onClick} aria-pressed={selected}
      className={cn("flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors outline-none hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-ring",
        selected && "liquid-thumb")}>
      <span className="glass-well flex size-9 shrink-0 items-center justify-center rounded-xl">
        <StormGlyph color={levelFor(last.kt).color} size={24} south={last.lat < 0} reducedMotion />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{s.name}</span>
        <span className="block truncate text-[12.5px] text-muted-foreground">{invest ? "Being watched" : headline(last.kt, s.basin)} · {s.basin}</span>
      </span>
      <span className="flex flex-col items-end gap-1">
        <span className="font-mono text-[12.5px] tabular-nums">{fmtWindKt(last.kt, units.wind)}</span>
        <StrengthBars kt={last.kt} />
      </span>
    </button>
  )
}

export function StormTabs({ storms, past, units, selectedId, onSelect, onReplay, tab, setTab }: {
  storms: Storm[]; past: Storm[]; units: Units; selectedId: string | null
  onSelect: (id: string) => void; onReplay: (id: string) => void; tab: string; setTab: (t: string) => void
}) {
  return (
    <Tabs value={tab} onValueChange={setTab} className="min-h-0 gap-0">
      <TabsList className="relative mx-3 mt-1 grid h-9 w-auto grid-cols-2 rounded-full p-[3px]">
        <span aria-hidden="true" className="tab-thumb liquid-thumb pointer-events-none absolute inset-y-[3px] left-[3px] w-[calc(50%-3px)] rounded-full"
          style={{ transform: tab === "past" ? "translateX(100%)" : "translateX(0)" }} />
        <TabsTrigger value="active" className="relative z-10 rounded-full text-[13px]">
          Active <span className="ml-1 rounded-full bg-white/10 px-1.5 font-mono text-[10.5px] tabular-nums">{storms.length}</span>
        </TabsTrigger>
        <TabsTrigger value="past" className="relative z-10 rounded-full text-[13px]">Past storms</TabsTrigger>
      </TabsList>
      <TabsContent value="active" className="mt-2 px-1.5 pb-1.5">
        {storms.length === 0 ? (
          <div className="mx-1.5 mb-1.5 flex flex-col items-center gap-2 rounded-xl border border-dashed border-white/12 px-4 py-6 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-white/[0.06]"><Wind className="size-5 text-muted-foreground" aria-hidden="true" /></span>
            <p className="font-medium">No storms right now</p>
            <p className="text-[13px] leading-relaxed text-muted-foreground">No cyclones, hurricanes, typhoons or depressions are active. The globe still shows today's winds.</p>
            <Button size="sm" variant="secondary" className="mt-1 rounded-full" onClick={() => setTab("past")}><History />Replay a past storm</Button>
          </div>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {storms.map(s => <li key={s.id}><StormRow s={s} units={units} selected={s.id === selectedId} onClick={() => onSelect(s.id)} /></li>)}
          </ul>
        )}
      </TabsContent>
      <TabsContent value="past" className="mt-2 px-1.5 pb-1.5">
        <ul className="flex flex-col gap-0.5">
          {past.map(s => {
            const peak = s.track.reduce((m, p) => (p.kt > m.kt ? p : m), s.track[0])
            return (
              <li key={s.id}>
                <button type="button" onClick={() => onReplay(s.id)}
                  className={cn("flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left outline-none hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-ring", s.id === selectedId && "liquid-thumb")}>
                  <span className="glass-well flex size-9 shrink-0 flex-col items-center justify-center rounded-xl font-mono text-[10px] leading-tight text-muted-foreground tabular-nums">
                    {s.year}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{s.name}</span>
                    <span className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground"><LevelDot kt={peak.kt} />Peak {headline(peak.kt, s.basin).toLowerCase()}, {fmtWindKt(peak.kt, units.wind)}</span>
                  </span>
                  <Play className="size-4 text-muted-foreground" aria-hidden="true" />
                </button>
              </li>
            )
          })}
        </ul>
        <p className="px-2.5 pt-2 pb-1 text-[12px] text-muted-foreground">Tracks from the IBTrACS archive. More storms can be added later.</p>
      </TabsContent>
    </Tabs>
  )
}

export function Freshness({ newest, nowIso, units, mock }: { newest: string | null; nowIso: string; units: Units; mock: MockState }) {
  const bad = mock === "stale" || mock === "down"
  return (
    <div className="flex items-center gap-2.5 text-[12px] text-muted-foreground">
      <span className="relative flex size-2">
        {!bad && <span className="qellon-ping absolute inline-flex size-full rounded-full bg-live" />}
        <span className={cn("relative inline-flex size-2 rounded-full", bad ? "bg-warn" : "bg-live")} />
      </span>
      {newest ? <span>Storm data {fmtTime(newest, units.time)} · <span className={cn(bad && "text-warn")}>{fmtAgo(newest, nowIso)}</span></span> : <span>Watching every ocean</span>}
    </div>
  )
}

/* ---------- storm detail panel ---------- */

function StrengthMeter({ kt, units }: { kt: number; units: Units }) {
  const lv = levelFor(kt)
  const idx = LEVELS.indexOf(lv)
  const within = Math.min(1, (kt - lv.min) / Math.max(1, Math.min(lv.max, 160) - lv.min + 1))
  const pos = ((idx + within) / LEVELS.length) * 100
  return (
    <div>
      <div className="flex items-baseline justify-between text-[12.5px]">
        <span className="text-muted-foreground">Strength</span>
        <span className="font-medium">{lv.label}</span>
      </div>
      <div className="relative mt-2">
        <div className="flex gap-1">
          {LEVELS.map((l, i) => <span key={l.key} className="h-1.5 flex-1 rounded-full" style={{ background: l.color, opacity: i === idx ? 1 : i < idx ? 0.55 : 0.18 }} />)}
        </div>
        <span className="meter-glide pointer-events-none absolute inset-x-0 -top-[5px] h-4" style={{ transform: `translateX(${pos}%)` }} aria-hidden="true">
          <span className="absolute left-0 h-4 w-1 -translate-x-1/2 rounded-full bg-white shadow-[0_0_0_2px_oklch(0.17_0.005_270)]" />
        </span>
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground"><span>Depression</span><span>Super ({fmtWindKt(130, units.wind)}+)</span></div>
    </div>
  )
}

function ForecastChart({ storm, nowKt, units }: { storm: Storm; nowKt: number; units: Units }) {
  const pts = [{ h: 0, kt: nowKt }, ...storm.forecast.filter(f => f.h > 0)]
  const W = 340, H = 92, pad = { l: 4, r: 4, t: 18, b: 20 }
  const maxH = pts[pts.length - 1].h || 1
  const maxKt = Math.max(...pts.map(p => p.kt)) + 10, minKt = Math.max(0, Math.min(...pts.map(p => p.kt)) - 25)
  const x = (h: number) => pad.l + (h / maxH) * (W - pad.l - pad.r)
  const y = (kt: number) => pad.t + (1 - (kt - minKt) / (maxKt - minKt)) * (H - pad.t - pad.b)
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(p.h).toFixed(1)},${y(p.kt).toFixed(1)}`).join(" ")
  const area = `${line} L${x(maxH).toFixed(1)},${H - pad.b} L${x(0).toFixed(1)},${H - pad.b} Z`
  const gid = useId().replace(/:/g, "")
  const days = Array.from({ length: Math.floor(maxH / 24) + 1 }, (_, d) => d * 24)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img"
      aria-label={`Forecast wind: ${pts.map(p => `${p.h ? `+${p.h} h` : "now"} ${fmtWindKt(p.kt, units.wind)}`).join(", ")}`}>
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.7 0.15 255)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="oklch(0.7 0.15 255)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {days.map(d => (
        <g key={d}>
          <line x1={x(d)} x2={x(d)} y1={pad.t - 6} y2={H - pad.b} stroke="oklch(1 0 0 / 7%)" />
          <text x={x(d)} y={H - 5} fill="oklch(0.69 0.012 270)" fontSize="10" textAnchor={d === 0 ? "start" : d === maxH ? "end" : "middle"} fontFamily="var(--font-data)">
            {d === 0 ? "Now" : `${d / 24}d`}
          </text>
        </g>
      ))}
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke="oklch(0.7 0.15 255)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => <circle key={i} cx={x(p.h)} cy={y(p.kt)} r={i === 0 ? 4 : 3} fill={levelFor(p.kt).color} stroke="oklch(0.17 0.005 270)" strokeWidth="1.5" />)}
      <text x={x(pts[0].h) + 6} y={y(pts[0].kt) - 7} fill="oklch(0.97 0 0)" fontSize="10.5" fontFamily="var(--font-data)">{fmtWindKt(pts[0].kt, units.wind)}</text>
      <text x={x(maxH) - 2} y={y(pts[pts.length - 1].kt) - 7} fill="oklch(0.85 0 0)" fontSize="10.5" textAnchor="end" fontFamily="var(--font-data)">{fmtWindKt(pts[pts.length - 1].kt, units.wind)}</text>
    </svg>
  )
}

export function StormPanel({ storm, state, units, nowIso, replaying, onClose, onReplay }: {
  storm: Storm; state: State; units: Units; nowIso: string; replaying: boolean; onClose: () => void; onReplay: () => void
}) {
  const [open, setOpen] = useState(false)
  const where = whereNow(state.lat, state.lon)
  const tr = trend(storm, state.t)
  const isPast = storm.kind === "past"
  const invest = storm.kind === "disturbance"
  const last = storm.track[storm.track.length - 1]
  const status = invest
    ? `Over ${where.onLand ? "land" : "the sea"}, ${fmtDist(where.km, units.dist)} ${where.dir} of ${where.city}. Forecasters are watching whether it grows into a depression.`
    : `${tr === "strengthening" ? "Strengthening" : tr === "weakening" ? "Weakening" : "Holding steady"} over ${where.onLand ? "land" : "the sea"}, ${fmtDist(where.km, units.dist)} ${where.dir} of ${where.city}, ${where.country}.`
  const hasFc = !replaying && storm.forecast.some(f => f.h > 0)
  const rows = [...storm.track].reverse().filter(p => new Date(p.t).getTime() <= state.t + 1)
  return (
    <div className="flex shrink-0 flex-col">
      <div className="flex items-start gap-3 p-4 pb-0">
        <span className="glass-well flex size-11 shrink-0 items-center justify-center rounded-2xl">
          <StormGlyph color={levelFor(state.kt).color} size={30} south={state.lat < 0} reducedMotion />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[22px] leading-tight font-semibold tracking-tight">{storm.name}{isPast && <span className="font-normal text-muted-foreground"> {storm.year}</span>}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <StrengthBadge kt={state.kt} basin={storm.basin} invest={invest} />
            <span className="text-[12.5px] text-muted-foreground">{storm.basin}</span>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="-mt-1 -mr-1.5 size-8 rounded-full" onClick={onClose} aria-label="Close storm details"><X /></Button>
      </div>

      <p className="px-4 pt-3 text-[14px] leading-relaxed text-foreground/85">
        {replaying && <span className="mr-1.5 rounded-md bg-brand/20 px-1.5 py-0.5 font-mono text-[11.5px] text-brand">{fmtTime(state.t, units.time)}</span>}
        {status}
      </p>

      <div className="grid grid-cols-2 gap-2 px-4 pt-4">
        <div className="glass-well rounded-xl p-3">
          <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground"><Wind className="size-3.5" aria-hidden="true" />Wind speed</p>
          <p className="mt-1.5 flex items-baseline gap-1 text-[30px] leading-none font-semibold tracking-tight tabular-nums">
            {Math.round(windFromKt(state.kt, units.wind))}<span className="text-[13px] font-normal text-muted-foreground">{WIND_LABEL[units.wind]}</span>
          </p>
          <p className="mt-1.5 text-[12px] text-muted-foreground">Steady wind at the centre</p>
        </div>
        <div className="glass-well rounded-xl p-3">
          <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground"><Navigation className="size-3.5" aria-hidden="true" />Moving</p>
          {state.moveKmh != null && state.moveDeg != null ? (
            <>
              <p className="mt-1.5 flex items-baseline gap-1.5 text-[30px] leading-none font-semibold tracking-tight tabular-nums">
                {compassShort(state.moveDeg)}
                <span className="text-[13px] font-normal text-muted-foreground">{fmtSpeedKmh(state.moveKmh, units.wind)}</span>
              </p>
              <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <Navigation className="size-3 text-brand" style={{ transform: `rotate(${state.moveDeg - 45}deg)` }} aria-hidden="true" />Heading {compass(state.moveDeg)}
              </p>
            </>
          ) : <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground">Not known yet. Only one position so far.</p>}
        </div>
      </div>

      <div className="px-4 pt-4"><StrengthMeter kt={state.kt} units={units} /></div>

      <div className="px-4 pt-5">
        <div className="flex items-baseline justify-between">
          <h3 className="text-[13px] font-medium">{hasFc ? "Forecast, next days" : "Path"}</h3>
          <span className="flex items-center gap-3 text-[11.5px] text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full bg-white/80" />Past</span>
            {!isPast && <span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-white/80" />Forecast</span>}
          </span>
        </div>
        {hasFc ? (
          <>
            <div className="glass-well mt-2 rounded-xl px-2 pt-1"><ForecastChart storm={storm} nowKt={state.kt} units={units} /></div>
            <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
              Published by {storm.source.startsWith("NHC") ? "NHC" : "JTWC"} at {fmtTime(storm.forecastIssued!, units.time)}. Qellon shows it as issued and does not make its own forecasts.
            </p>
          </>
        ) : (
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
            {replaying || isPast ? "The replay follows where the storm actually went." : invest ? "Forecasts usually start once it becomes a depression." : last.kt < 34 ? "No forecast issued. The storm is fading." : "No forecast from this source."}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2 px-4 pt-4">
        {storm.track.length > 1 && (
          <Button onClick={onReplay} className="h-9 rounded-full px-4" variant={replaying ? "secondary" : "default"}>
            {replaying ? <History /> : <Play />}{replaying ? "Replaying" : "Replay path"}
          </Button>
        )}
        {storm.official && (
          <Button variant="outline" asChild className="h-9 rounded-full border-white/12 bg-transparent px-4 hover:bg-white/[0.06]">
            <a href={storm.official[1]} target="_blank" rel="noreferrer">Official warnings<ArrowUpRight /></a>
          </Button>
        )}
      </div>

      <Collapsible open={open} onOpenChange={setOpen} className="mx-4 mt-4 rounded-xl border border-white/8">
        <CollapsibleTrigger asChild>
          <button type="button" className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-[13px] font-medium outline-none hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-ring">
            More details<ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden="true" />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="px-3 pb-3">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[12.5px]">
            <dt className="text-muted-foreground">Position</dt><dd className="font-mono tabular-nums">{fmtLatLon(state.lat, state.lon)}</dd>
            <dt className="text-muted-foreground">Pressure</dt><dd>{state.hpa ? fmtPress(state.hpa, units.press) : "Not in this source"}</dd>
            {storm.people && storm.people.count > 0 && (<>
              <dt className="text-muted-foreground">People affected</dt>
              <dd>{(storm.people.count / 1e6).toFixed(1)} million in winds of {fmtWindKt(64, units.wind)} or more <span className="text-muted-foreground">(GDACS estimate)</span></dd>
            </>)}
            <dt className="text-muted-foreground">Wind measure</dt><dd>1-minute average. India's IMD uses 3 minutes, so its figures read lower.</dd>
            <dt className="text-muted-foreground">Tracked since</dt><dd>{fmtTime(startMs(storm), units.time)}</dd>
          </dl>
          <div className="mt-3 max-h-52 overflow-auto rounded-lg border border-white/8">
            <Table className="text-[12px]">
              <TableHeader className="sticky top-0 bg-popover">
                <TableRow className="border-white/8 hover:bg-transparent">
                  <TableHead className="h-8">Time</TableHead><TableHead className="h-8">Strength</TableHead><TableHead className="h-8 text-right">Wind</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(p => (
                  <TableRow key={p.t} className="border-white/6">
                    <TableCell className="py-1.5 font-mono tabular-nums">{fmtTime(p.t, units.time, false)}</TableCell>
                    <TableCell className="py-1.5"><span className="flex items-center gap-1.5"><LevelDot kt={p.kt} />{levelFor(p.kt).label}</span></TableCell>
                    <TableCell className="py-1.5 text-right font-mono tabular-nums">{fmtWindKt(p.kt, units.wind)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <p className="px-4 pt-3 pb-4 text-[11.5px] leading-relaxed text-muted-foreground">
        {isPast ? "Historical track. " : `Updated ${fmtAgo(last.t, nowIso)}. `}Source:{" "}
        {storm.sourceUrl ? <a className="underline decoration-white/25 underline-offset-2 hover:text-foreground" href={storm.sourceUrl} target="_blank" rel="noreferrer">{storm.source}</a> : storm.source}.
        {!isPast && " Not an official warning."}
      </p>
    </div>
  )
}

/* ---------- point readout ---------- */

export function PointReadout({ lon, lat, units, storms, onClose, className, style }: {
  lon: number; lat: number; units: Units; storms: { s: Storm; st: State }[]; onClose: () => void; className?: string; style?: React.CSSProperties
}) {
  const w = sampleAt(lon, lat)
  const where = whereNow(lat, lon)
  let nearest: { name: string; km: number; dir: string } | null = null
  for (const { s, st } of storms) {
    const km = distanceKm(lat, lon, st.lat, st.lon)
    if (!nearest || km < nearest.km) nearest = { name: s.name, km, dir: compass(bearing(lat, lon, st.lat, st.lon)) }
  }
  const tile = "glass-well rounded-lg px-2.5 py-2"
  return (
    <div className={cn(glass, "w-[284px] max-w-[calc(100vw-32px)] rounded-[22px] p-3")} style={style} role="dialog" aria-label="Weather at this point"
      onPointerDown={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()}>
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.07]"><MapPin className="size-3.5" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{where.km < 25 ? where.city : `${fmtDist(where.km, units.dist)} ${where.dir} of ${where.city}`}</p>
          <p className="text-[12px] text-muted-foreground">{where.country}{where.onLand ? "" : " · over the sea"}</p>
        </div>
        <Button variant="ghost" size="icon" className="-mt-0.5 -mr-1 size-7 rounded-full" onClick={onClose} aria-label="Close point readout"><X /></Button>
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-1.5 text-[12px]">
        <div className={cn(tile, "col-span-2")}>
          <p className="flex items-center gap-1.5 text-muted-foreground"><Wind className="size-3.5" aria-hidden="true" />Wind</p>
          <p className="mt-0.5 text-[15px] font-medium"><span className="tabular-nums">{fmtWindMs(w.speed, units.wind)}</span> <span className="font-normal text-muted-foreground">from the {compass(w.fromDeg)}</span></p>
          <p className="text-muted-foreground first-letter:uppercase">{windWords(w.speed * 3.6)}</p>
        </div>
        <div className={tile}>
          <p className="flex items-center gap-1.5 text-muted-foreground"><Thermometer className="size-3.5" aria-hidden="true" />Temperature</p>
          <p className="mt-0.5 text-[15px] font-medium tabular-nums">{fmtTempK(w.tempK, units.temp)}</p>
        </div>
        <div className={tile}>
          <p className="flex items-center gap-1.5 text-muted-foreground"><Gauge className="size-3.5" aria-hidden="true" />Pressure</p>
          <p className="mt-0.5 text-[15px] font-medium tabular-nums">{fmtPress(w.hpa, units.press)}</p>
        </div>
      </div>
      {nearest && <p className="mt-2 text-[12.5px]"><span className="text-muted-foreground">Nearest storm:</span> {nearest.name}, {fmtDist(nearest.km, units.dist)} {nearest.dir}</p>}
      <p className="mt-1.5 font-mono text-[10.5px] text-muted-foreground">{fmtLatLon(lat, lon)} · {FIELD_SOURCE.replace(", NOAA/NCEP", "")} {fmtTime(FIELD_TIME, units.time, false)}</p>
    </div>
  )
}

/* ---------- toolbar popovers and dialogs ---------- */

function UnitRow<T extends string>({ id, label, value, options, onChange }: { id: string; label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span id={id} className="text-[13px] text-muted-foreground">{label}</span>
      <ToggleGroup type="single" value={value} aria-labelledby={id} onValueChange={v => v && onChange(v as T)}
        className="glass-well rounded-full p-[3px]">
        {options.map(([v, l]) => (
          <ToggleGroupItem key={v} value={v} className="h-7 min-w-10 rounded-full px-2.5 text-[12px]">{l}</ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}

export function UnitsPopover({ units, setUnits }: { units: Units; setUnits: (u: Units) => void }) {
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 rounded-full px-3 font-mono text-[12px] text-foreground/85 hover:bg-white/10" aria-label="Change units">
              {WIND_LABEL[units.wind]}<span className="text-muted-foreground">·</span>{units.temp === "c" ? "°C" : "°F"}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">Units</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" sideOffset={10} className="w-[340px] rounded-[24px] p-4">
        <div className="flex flex-col gap-3">
          <div><p className="font-medium">Units</p><p className="text-[12.5px] text-muted-foreground">Saved on this device.</p></div>
          <UnitRow id="u-wind" label="Wind" value={units.wind} onChange={wind => setUnits({ ...units, wind })} options={[["kmh", "km/h"], ["mph", "mph"], ["kt", "kt"], ["ms", "m/s"]]} />
          <UnitRow id="u-temp" label="Temperature" value={units.temp} onChange={temp => setUnits({ ...units, temp })} options={[["c", "°C"], ["f", "°F"]]} />
          <UnitRow id="u-press" label="Pressure" value={units.press} onChange={press => setUnits({ ...units, press })} options={[["hpa", "hPa"], ["inhg", "inHg"]]} />
          <UnitRow id="u-dist" label="Distance" value={units.dist} onChange={dist => setUnits({ ...units, dist })} options={[["km", "km"], ["mi", "mi"], ["nmi", "nmi"]]} />
          <UnitRow id="u-time" label="Time" value={units.time} onChange={time => setUnits({ ...units, time })} options={[["local", "Local"], ["utc", "UTC"]]} />
          <Separator className="bg-white/8" />
          <Button variant="ghost" size="sm" className="self-end rounded-full" onClick={() => setUnits(defaultUnits())}>Reset to my region</Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function LayersPopover({ layers, setLayers }: { layers: Layers; setLayers: (l: Layers) => void }) {
  const rows: [keyof Layers, string, string][] = [
    ["particles", "Moving wind", "Animated streaks that follow the wind"],
    ["colors", "Wind colours", "Shade the globe by wind speed"],
    ["paths", "Storm paths", "Past and forecast tracks"],
    ["borders", "Borders and grid", "Country lines and latitude grid"],
  ]
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Map layers" className="size-8 rounded-full text-foreground/80 hover:bg-white/10"><LayersIcon /></Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">Map layers</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" sideOffset={10} className="w-[300px] rounded-[24px] p-2">
        <p className="px-2 pt-1.5 pb-2 font-medium">Map layers</p>
        {rows.map(([k, label, hint]) => (
          <label key={k} htmlFor={`layer-${k}`} className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 hover:bg-white/[0.05]">
            <span className="min-w-0 flex-1"><span className="block text-[13.5px]">{label}</span><span className="block text-[12px] text-muted-foreground">{hint}</span></span>
            <Switch id={`layer-${k}`} checked={layers[k]} onCheckedChange={v => setLayers({ ...layers, [k]: v })} />
          </label>
        ))}
      </PopoverContent>
    </Popover>
  )
}

export function ScaleDialog({ units, open, onOpenChange }: { units: Units; open: boolean; onOpenChange: (o: boolean) => void }) {
  const range = (a: number, b: number) => b >= 999 ? `${Math.round(windFromKt(a, units.wind))}+ ${WIND_LABEL[units.wind]}` : `${Math.round(windFromKt(a, units.wind))}–${Math.round(windFromKt(b + 0.99, units.wind))} ${WIND_LABEL[units.wind]}`
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-[28px] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl tracking-tight">How strong is it?</DialogTitle>
          <DialogDescription>One scale for every ocean, based on the steady wind at the centre. Draft wording for review.</DialogDescription>
        </DialogHeader>
        <ol className="flex flex-col gap-1.5">
          {LEVELS.map(l => (
            <li key={l.key} className="glass-well flex gap-3 rounded-xl px-3 py-2.5">
              <span className="mt-1 size-3 shrink-0 rounded-full" style={{ background: l.color }} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline justify-between gap-x-3"><span className="font-medium">{l.label}</span><span className="font-mono text-[12px] text-muted-foreground tabular-nums">{range(l.min, l.max)}</span></p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{l.meaning}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="text-[12.5px] leading-relaxed text-muted-foreground">
          The same storm has different names by ocean: <span className="text-foreground">cyclone</span> in the Indian Ocean and South Pacific, <span className="text-foreground">typhoon</span> in the north-west Pacific,
          <span className="text-foreground"> hurricane</span> in the Atlantic and north-east Pacific. Winds are 1-minute averages (JTWC, NHC). India's IMD uses 3-minute averages, so its figures are lower.
        </p>
      </DialogContent>
    </Dialog>
  )
}

const TERMS: [string, string][] = [
  ["Depression", "A low-pressure area with organised rain clouds and winds turning around a centre. The first stage of a tropical storm."],
  ["Deep depression", "A depression that has strengthened but is not yet a storm. Often brings very heavy rain."],
  ["Cyclone, hurricane, typhoon", "The same thing in different oceans: a tropical storm with very strong winds spiralling around a calm centre."],
  ["Eye", "The calm, often clear centre of a strong storm. The strongest winds are in the ring of cloud around it."],
  ["Landfall", "When the centre of the storm crosses the coast."],
  ["Forecast path", "Where a weather agency expects the centre to go. Real storms often drift from it, so treat it as a guide."],
  ["Remnant low", "What is left after a storm weakens, usually over land. It can still bring heavy rain and floods."],
  ["Invest", "Short for investigation. A cloud cluster forecasters are watching because it might develop."],
  ["Sustained wind and gusts", "Sustained wind is the steady speed averaged over a minute or more. Gusts are short bursts that can be 30–50% stronger."],
  ["Storm surge", "Sea water pushed onto the coast by the storm's winds. Often the most dangerous part of a landfall."],
]
export function GlossaryDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-[28px] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl tracking-tight">What the words mean</DialogTitle>
          <DialogDescription>Plain explanations of the terms on the map.</DialogDescription>
        </DialogHeader>
        <dl className="flex flex-col divide-y divide-white/6">
          {TERMS.map(([t, d]) => (
            <div key={t} className="py-2.5 first:pt-0"><dt className="font-medium">{t}</dt><dd className="mt-0.5 text-[13.5px] leading-relaxed text-muted-foreground">{d}</dd></div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  )
}

export function PreviewMenu({ mock, setMock }: { mock: MockState; setMock: (m: MockState) => void }) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Preview other states" className="size-8 rounded-full text-brand hover:bg-white/10 hover:text-brand"><FlaskConical /></Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">Preview states (mock-up only)</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" sideOffset={10} className="w-60 rounded-[20px]">
        <DropdownMenuLabel>Preview a state</DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-white/8" />
        <DropdownMenuRadioGroup value={mock} onValueChange={v => setMock(v as MockState)}>
          <DropdownMenuRadioItem value="normal">Normal (real snapshot)</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="empty">No active storms</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="stale">Storm data is old</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="down">Data source unavailable</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function Toolbar({ children }: { children: React.ReactNode }) {
  return <div className={cn(glass, "lens flex items-center gap-0.5 rounded-full p-1")}>{children}</div>
}

export { BookOpen, Gauge, Settings2 }

/* ---------- command palette ---------- */

export function CommandPalette({ open, onOpenChange, storms, past, units, onStorm, onPlace }: {
  open: boolean; onOpenChange: (o: boolean) => void; storms: Storm[]; past: Storm[]; units: Units
  onStorm: (id: string) => void; onPlace: (lon: number, lat: number) => void
}) {
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Search" description="Find a storm or jump to a place"
      className="no-motion rounded-[26px]">
      <CommandInput placeholder="Search storms, past storms or places…" />
      <CommandList className="max-h-[360px]">
        <CommandEmpty>Nothing matches. Try a city or a storm name.</CommandEmpty>
        {storms.length > 0 && (
          <CommandGroup heading="Active storms">
            {storms.map(s => {
              const last = s.track[s.track.length - 1]
              return (
                <CommandItem key={s.id} value={`${s.name} ${s.basin} active`} onSelect={() => onStorm(s.id)}>
                  <LevelDot kt={last.kt} /><span className="flex-1">{s.name}</span>
                  <span className="text-[12px] text-muted-foreground">{s.kind === "disturbance" ? "Being watched" : headline(last.kt, s.basin)}</span>
                  <span className="w-[72px] text-right font-mono text-[12px] tabular-nums">{fmtWindKt(last.kt, units.wind)}</span>
                </CommandItem>
              )
            })}
          </CommandGroup>
        )}
        <CommandGroup heading="Past storms">
          {past.map(s => (
            <CommandItem key={s.id} value={`${s.name} ${s.year} past replay`} onSelect={() => onStorm(s.id)}>
              <History /><span className="flex-1">{s.name}</span><span className="font-mono text-[12px] text-muted-foreground">{s.year} · replay</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Places">
          {CITIES.map(([name, country, lat, lon]) => (
            <CommandItem key={`${name}-${country}`} value={`${name} ${country}`} onSelect={() => onPlace(lon, lat)}>
              <MapPin /><span className="flex-1">{name}</span><span className="text-[12px] text-muted-foreground">{country}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}

/* ---------- replay bar, map controls, legend ---------- */

export function ReplayBar({ storm, at, playing, speed, units, onToggle, onSeek, onSpeed, onClose }: {
  storm: Storm; at: number; playing: boolean; speed: number; units: Units
  onToggle: () => void; onSeek: (t: number) => void; onSpeed: (s: number) => void; onClose: () => void
}) {
  const t0 = startMs(storm), t1 = endMs(storm)
  const hours = Math.round((t1 - t0) / 3.6e6)
  const cur = Math.round((at - t0) / 3.6e6)
  const isPast = storm.kind === "past"
  return (
    <div className={cn(glass, "lens flex w-full items-center gap-3 rounded-full py-1.5 pr-2 pl-1.5")} aria-label={`Replay of ${storm.name}`}>
      <Button size="icon" className="size-10 shrink-0 rounded-full" onClick={onToggle} aria-label={playing ? "Pause replay" : "Play replay"}>
        {playing ? <Pause className="fill-current" /> : <Play className="fill-current" />}
      </Button>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2 text-[12px]">
          <span className="truncate"><span className="font-medium">{storm.name}</span>
            <span className="text-muted-foreground">{isPast ? " · wind map hidden, it shows today" : " · replay"}</span></span>
          <span className="shrink-0 font-mono text-muted-foreground tabular-nums">{fmtTime(at, units.time, false)}</span>
        </div>
        <Slider className="mt-2" min={0} max={hours} step={1} value={[cur]} onValueChange={([v]) => onSeek(t0 + v * 3.6e6)} aria-label="Replay time" />
      </div>
      <ToggleGroup type="single" value={String(speed)} onValueChange={v => v && onSpeed(Number(v))} aria-label="Replay speed"
        className="glass-well hidden rounded-full p-[3px] sm:flex">
        {[1, 2, 4].map(s => <ToggleGroupItem key={s} value={String(s)} className="h-7 min-w-9 rounded-full px-2 font-mono text-[11.5px]">{s}×</ToggleGroupItem>)}
      </ToggleGroup>
      <Button variant="ghost" size="icon" className="size-8 shrink-0 rounded-full" onClick={onClose} aria-label="Stop replay"><X /></Button>
    </div>
  )
}

export function MapControls({ onZoomIn, onZoomOut, onReset }: { onZoomIn: () => void; onZoomOut: () => void; onReset: () => void }) {
  return (
    <div className={cn(glass, "lens flex flex-col items-center gap-0.5 rounded-full p-1")}>
      <ToolButton label="Zoom in" shortcut="+" onClick={onZoomIn}><Plus /></ToolButton>
      <ToolButton label="Zoom out" shortcut="−" onClick={onZoomOut}><Minus /></ToolButton>
      <Separator className="my-0.5 w-5 bg-white/10" />
      <ToolButton label="Back to the start view" onClick={onReset}><Compass /></ToolButton>
    </div>
  )
}

export function Legend({ units, onScale }: { units: Units; onScale: () => void }) {
  const ticks = [0, 10, 20, 30, 40]
  return (
    <div className={cn(glass, "flex w-[248px] flex-col gap-3 rounded-[22px] px-3.5 py-3")}>
      <div>
        <p className="flex items-baseline justify-between text-[12px]"><span className="text-muted-foreground">Wind speed</span><span className="font-mono text-[11px] text-muted-foreground">{WIND_LABEL[units.wind]}</span></p>
        <div className="mt-2 h-1.5 rounded-full" style={{ background: RAMP_CSS }} aria-hidden="true" />
        <div className="mt-1.5 flex justify-between font-mono text-[10.5px] text-muted-foreground tabular-nums">
          {ticks.map(t => <span key={t}>{Math.round(windFromMs(t, units.wind))}{t === 40 ? "+" : ""}</span>)}
        </div>
      </div>
      <button type="button" onClick={onScale} className="group flex flex-col gap-1.5 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="flex items-baseline justify-between text-[12px]"><span className="text-muted-foreground">Storm strength</span><span className="text-[11.5px] text-foreground/80 group-hover:underline">How it works</span></span>
        <span className="flex gap-1" aria-hidden="true">{LEVELS.map(l => <span key={l.key} className="h-1.5 flex-1 rounded-full" style={{ background: l.color }} />)}</span>
      </button>
    </div>
  )
}
