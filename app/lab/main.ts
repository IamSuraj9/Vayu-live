import "./style.css"
import { Scene } from "./scene"
import { OPTIONS, PRESETS, type Cfg, type Preset } from "./presets"
import { BAND_EDGES, BAND_VALUE, PALETTES, colorAt, rgba, tempColor } from "./palettes"
import * as DATA from "./data"
import { clamp, wrap180 } from "./geo"

const $ = <T extends HTMLElement>(s: string) => document.querySelector(s) as T
const stage = $("#stage"), labelsEl = $("#labels")
const reduced = matchMedia("(prefers-reduced-motion: reduce)")
const phone = () => matchMedia("(max-width: 860px)").matches

// ---------------------------------------------------------------- main scene
const mk = (cls: string) => { const c = document.createElement("canvas"); c.className = `layer ${cls}`; stage.insertBefore(c, labelsEl); return c }
const scene = new Scene({ surface: mk("surface"), marks: mk("marks"), trail: mk("trail"), live: mk("live") }, Math.min(2, window.devicePixelRatio || 1))

const KEY = "qellon-look"
const DEFAULT = PRESETS[0] // Heat: first-time visitors always start here
const keys = Object.keys(DEFAULT.cfg) as (keyof Cfg)[]
function remembered(): Cfg | null {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) || "null")
    return c && keys.every(k => OPTIONS.find(o => o.key === k)!.items.some(i => i[0] === c[k])) ? c as Cfg : null
  } catch { return null }
}
let cfg: Cfg = { ...DEFAULT.cfg }
let view = { lon: 105, lat: 16, zoom: 1 }
let lastMove = 0
let stillStamp = ""

let lastSize = ""
function layout() {
  const w = stage.clientWidth, h = stage.clientHeight
  const size = `${w}x${h}|${$("#panel").className}`
  if (size === lastSize) return
  lastSize = size
  scene.resize(w, h)
  let aw = w, ah = h, cx = w / 2, cy = h / 2
  if (phone()) {
    const panel = $("#panel").classList.contains("collapsed") ? 96 : Math.min(h * 0.46, 400)
    ah = h - 118 - 24 - panel - 78; cy = 96 + ah / 2
    aw = w
  } else {
    aw = w - 372 - 48; ah = h - 136 - 40 - 40; cx = aw / 2 + 8; cy = 40 + ah / 2 + 10
  }
  scene.centre = [cx, cy]
  const target = Math.min(aw, ah) * (phone() ? 0.47 : 0.48)
  scene.baseScale = target / Math.min(w, h)
  stillStamp = ""
}
new ResizeObserver(layout).observe(stage)

// ---------------------------------------------------------------- camera: drag, fling, pinch, wheel, fly-to
const pointers = new Map<number, { x: number; y: number }>()
let vel = { x: 0, y: 0 }, lastT = 0, pinchD = 0, tween: { from: typeof view; to: typeof view; t0: number; dur: number } | null = null
const R = () => scene.baseScale * Math.min(scene.w, scene.h) * view.zoom
const touch = () => { lastMove = performance.now() }

stage.addEventListener("pointerdown", e => {
  stage.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  tween = null; vel = { x: 0, y: 0 }; lastT = performance.now(); stage.classList.add("drag")
  if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinchD = Math.hypot(a.x - b.x, a.y - b.y) }
})
stage.addEventListener("pointermove", e => {
  const p = pointers.get(e.pointerId); if (!p) return
  const dx = e.clientX - p.x, dy = e.clientY - p.y
  p.x = e.clientX; p.y = e.clientY
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y)
    if (pinchD) view = { ...view, zoom: clamp(view.zoom * d / pinchD, 0.75, 9) }
    pinchD = d; touch(); return
  }
  const r = R(), now = performance.now(), dt = Math.max(1, now - lastT); lastT = now
  view = { ...view, lon: wrap180(view.lon - (dx / r) * 57.2958), lat: clamp(view.lat + (dy / r) * 57.2958, -85, 85) }
  vel = { x: 0.8 * vel.x + 0.2 * (-dx / r * 57.2958 / dt), y: 0.8 * vel.y + 0.2 * (dy / r * 57.2958 / dt) }
  touch()
})
const up = (e: PointerEvent) => {
  pointers.delete(e.pointerId); pinchD = 0
  if (!pointers.size) { stage.classList.remove("drag"); if (performance.now() - lastT > 90) vel = { x: 0, y: 0 } }
}
stage.addEventListener("pointerup", up); stage.addEventListener("pointercancel", up)
stage.addEventListener("wheel", e => {
  e.preventDefault()
  view = { ...view, zoom: clamp(view.zoom * Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0016)), 0.75, 9) }; touch()
}, { passive: false })

function fly(to: Partial<typeof view>) {
  const t = { ...view, ...to }
  tween = { from: { ...view }, to: { ...t, lon: view.lon + wrap180(t.lon - view.lon) }, t0: performance.now(), dur: reduced.matches ? 1 : 950 }
}
const zoomBy = (f: number) => fly({ zoom: clamp(view.zoom * f, 0.75, 9) })
$("#zin").onclick = () => zoomBy(1.6); $("#zout").onclick = () => zoomBy(1 / 1.6)

const fl = $("#fly")
fl.insertAdjacentHTML("beforeend", "<span>Fly to</span>")
for (const s of DATA.STORMS) {
  const b = document.createElement("button"); b.type = "button"; b.textContent = s.name
  b.onclick = () => { const p = s.track[s.track.length - 1]; fly({ lon: p.lon, lat: clamp(p.lat, -60, 60), zoom: 2.3 }) }
  fl.appendChild(b)
}
const w = document.createElement("button"); w.type = "button"; w.textContent = "World"; w.onclick = () => fly({ lon: 105, lat: 16, zoom: 1 }); fl.appendChild(w)

// ---------------------------------------------------------------- storm labels
const chips = new Map<string, HTMLElement>()
scene.onLabels = list => {
  const seen = new Set<string>()
  for (const l of list) {
    seen.add(l.id)
    let el = chips.get(l.id)
    if (!el) { el = document.createElement("div"); el.className = "chip"; el.innerHTML = `<i></i><b></b><span></span>`; labelsEl.appendChild(el); chips.set(l.id, el) }
    ;(el.children[0] as HTMLElement).style.background = l.color
    el.children[1].textContent = l.name; el.children[2].textContent = l.text
    el.style.transform = `translate(${Math.round(l.x)}px, ${Math.round(l.y - 11)}px)`
  }
  for (const [id, el] of chips) if (!seen.has(id)) el.style.transform = "translate(-200px,-200px)"
}

// ---------------------------------------------------------------- panel: notes, mix controls, legend
const same = (a: Cfg, b: Cfg) => (Object.keys(a) as (keyof Cfg)[]).every(k => a[k] === b[k])
const current = () => PRESETS.find(p => same(p.cfg, cfg)) || null
const optLabel = (key: keyof Cfg, v: string) => OPTIONS.find(o => o.key === key)!.items.find(i => i[0] === v)![1]

const mix = $("#mix-controls")
for (const o of OPTIONS) {
  const row = document.createElement("div"); row.className = "row"
  row.innerHTML = `<span class="lab" id="lab-${o.key}">${o.label}</span>`
  const seg = document.createElement("div"); seg.className = "seg"; seg.setAttribute("role", "radiogroup"); seg.setAttribute("aria-labelledby", `lab-${o.key}`)
  for (const [val, text] of o.items) {
    const b = document.createElement("button"); b.type = "button"; b.setAttribute("role", "radio"); b.dataset.key = o.key; b.dataset.val = val; b.textContent = text
    b.onclick = () => { cfg = { ...cfg, [o.key]: val } as Cfg; applyCfg(); }
    seg.appendChild(b)
  }
  row.appendChild(seg); mix.appendChild(row)
}

function applyCfg(fromHash = false) {
  scene.setCfg(cfg); stillStamp = ""
  mix.querySelectorAll<HTMLButtonElement>("button").forEach(b => b.setAttribute("aria-checked", String(cfg[b.dataset.key as keyof Cfg] === b.dataset.val)))
  const p = current()
  $("#d-eyebrow").textContent = p ? "Customize · Look" : "Customize · Your mix"
  $<HTMLButtonElement>("#reset").hidden = p === DEFAULT
  try { localStorage.setItem(KEY, JSON.stringify(cfg)) } catch { /* private window */ }
  $("#d-name").textContent = p ? p.name : "Custom mix"
  $("#d-tag").textContent = p ? p.tagline : "Built from your choices"
  const notes = $("#notes")
  notes.innerHTML = p
    ? `<div><dt>The look</dt><dd>${p.look}</dd></div><div><dt>Reads best for</dt><dd>${p.bestFor}</dd></div>`
    : `<div><dt>The look</dt><dd>${optLabel("earth", cfg.earth)} planet, ${cfg.fill === "none" ? "no colour fill" : optLabel("fill", cfg.fill).toLowerCase() + " fill"}, ${optLabel("wind", cfg.wind).toLowerCase()} for wind, ${optLabel("isobars", cfg.isobars).toLowerCase()} for pressure.</dd></div><div><dt>Tip</dt><dd class="watch">Pick a look in the strip below, or keep changing layers. Some combinations clash on purpose so you can see why.</dd></div>`
  document.querySelectorAll<HTMLButtonElement>("#strip button").forEach((b, i) => b.setAttribute("aria-pressed", String(PRESETS[i] === p)))
  if (!fromHash) { try { history.replaceState(null, "", p ? `#${p.id}` : location.pathname) } catch { /* the viewer may block it */ } }
  legend()
}

const kmh = (ms: number) => Math.round(ms * 3.6)
function legend() {
  const el = $("#legend")
  const grad = (stops: string[]) => `linear-gradient(90deg, ${stops.join(",")})`
  let html = ""
  if (cfg.fill === "bands") {
    const sw = BAND_VALUE.map(v => `<i style="background:${rgba(colorAt(cfg.palette, v))}"></i>`).join("")
    const names = [["Calm", "Calm"], ["Breeze", "Breeze"], ["Fresh", "Fresh"], ["Gale", "Gale"], ["Storm", "Storm"], ["Hurricane", "Hurr."]].map(([f, sh]) => `<span><b class="f">${f}</b><b class="s">${sh}</b></span>`).join("")
    html = `<div class="t"><span>Wind speed</span><span>km/h</span></div><div class="sw">${sw}</div><div class="names">${names}</div><div class="tick" style="margin-top:4px"><span>${BAND_EDGES.slice(1).map(kmh).join(" · ")}</span></div>`
  } else if (cfg.fill === "wind" || (cfg.fill === "none" && cfg.color === "speed" && cfg.wind !== "none")) {
    const st = Array.from({ length: 13 }, (_, i) => rgba(colorAt(cfg.palette, i * 3.33), 1) + ` ${(i / 12) * 100}%`)
    html = `<div class="t"><span>Wind speed</span><span>km/h</span></div><div class="bar" style="background:${grad(st)}"></div><div class="tick"><span>0</span><span>36</span><span>72</span><span>108</span><span>144+</span></div>`
  } else if (cfg.fill === "zones") {
    html = `<div class="t"><span>Air pressure</span><span>hPa</span></div><div class="bar" style="background:${grad(["#d646ce", "#7060ff", "rgba(255,255,255,0.06)", "rgba(255,255,255,0.06)", "#ffb852"])}"></div><div class="tick"><span>Low 990</span><span>1013</span><span>High 1030</span></div>`
  } else if (cfg.fill === "relief") {
    html = `<div class="t"><span>Pressure as landscape</span></div><div class="bar" style="background:${grad(["#202a3c", "#52627f", "#9fb2d2"])}"></div><div class="tick"><span>Low: a dip</span><span>High: a rise</span></div>`
  } else if (cfg.fill === "temp") {
    const st = [235, 255, 273, 288, 300, 312].map((k, i) => rgba(tempColor(k), 1) + ` ${(i / 5) * 100}%`)
    html = `<div class="t"><span>Surface temperature</span><span>°C</span></div><div class="bar" style="background:${grad(st)}"></div><div class="tick"><span>−38</span><span>0</span><span>15</span><span>39</span></div>`
  }
  el.hidden = !html; el.innerHTML = html
}

// ---------------------------------------------------------------- strip of thumbnails (live, rendered one after another)
const strip = $("#strip")
const thumbs: HTMLCanvasElement[] = []
PRESETS.forEach(p => {
  const b = document.createElement("button"); b.type = "button"; b.setAttribute("aria-pressed", "false")
  b.innerHTML = `<div class="th"><canvas width="336" height="336" aria-hidden="true"></canvas></div><b>${p.name}</b><small>${p.tagline}</small>`
  b.onclick = () => select(p)
  strip.appendChild(b); thumbs.push(b.querySelector("canvas")!)
})
function renderThumb(i: number) {
  const S = 520, mkc = () => document.createElement("canvas")
  const sc = new Scene({ surface: mkc(), marks: mkc(), trail: mkc(), live: mkc() }, 1)
  sc.resize(S, S); sc.baseScale = 0.46; sc.setView({ lon: 100, lat: 17, zoom: 1 }); sc.setCfg(PRESETS[i].cfg)
  sc.still(70)
  const ctx = thumbs[i].getContext("2d")!
  ctx.clearRect(0, 0, 336, 336)
  for (const c of [sc.els.surface, sc.els.marks, sc.els.trail, sc.els.live]) ctx.drawImage(c, 0, 0, 336, 336)
}
let ti = 0
const nextThumb = () => { if (ti < PRESETS.length) { renderThumb(ti++); setTimeout(nextThumb, 30) } }

function select(p: Preset) { cfg = { ...p.cfg }; applyCfg() }

// ---------------------------------------------------------------- panel fold on phones
const panel = $("#panel"), fold = $("#fold")
$("#fold").setAttribute("aria-label", "Show or hide Customize")
fold.onclick = () => { const c = panel.classList.toggle("collapsed"); fold.setAttribute("aria-expanded", String(!c)); layout() }
if (phone()) { panel.classList.add("collapsed"); fold.setAttribute("aria-expanded", "false") }
$("#research").addEventListener("toggle", () => {})

const t0 = Date.UTC(2026, 9, 29)
const fmt = (iso: string) => new Date(iso).toUTCString().replace(" GMT", " UTC").replace(/^\w+, /, "").replace(/:\d\d UTC/, " UTC")
$("#snapshot").textContent = `Snapshot, not live. Wind, pressure and temperature: GFS model run ${fmt(DATA.FIELD_TIME)}. Storms: NOAA, NHC and GDACS, ${fmt(DATA.STORMS_FETCHED)}. City lights on the Night look are a sample of large cities, for the look only.`
void t0

// ---------------------------------------------------------------- start
$("#reset").onclick = () => select(DEFAULT)
const hash = location.hash.slice(1)
const start = PRESETS.find(p => p.id === hash)
const saved = remembered()
if (start) cfg = { ...start.cfg }
else if (saved) cfg = saved
layout()
scene.setView(view)
applyCfg(true)
document.fonts?.ready.then(() => { stillStamp = ""; scene.setCfg(cfg) })
setTimeout(nextThumb, 60)
addEventListener("hashchange", () => { const p = PRESETS.find(q => q.id === location.hash.slice(1)); if (p && !same(p.cfg, cfg)) { cfg = { ...p.cfg }; applyCfg(true) } })

let prev = performance.now()
function loop(now: number) {
  const dt = now - prev; prev = now
  if (tween) {
    const k = clamp((now - tween.t0) / tween.dur, 0, 1), e = k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2
    view = { lon: wrap180(tween.from.lon + (tween.to.lon - tween.from.lon) * e), lat: tween.from.lat + (tween.to.lat - tween.from.lat) * e, zoom: tween.from.zoom * Math.pow(tween.to.zoom / tween.from.zoom, e) }
    touch(); if (k >= 1) tween = null
  } else if (!pointers.size && (Math.abs(vel.x) > 0.0004 || Math.abs(vel.y) > 0.0004)) {
    view = { ...view, lon: wrap180(view.lon + vel.x * dt), lat: clamp(view.lat + vel.y * dt, -85, 85) }
    const f = Math.exp(-dt / 420); vel = { x: vel.x * f, y: vel.y * f }; touch()
  }
  scene.setView(view)
  const moving = now - lastMove < 170
  if (reduced.matches) {
    // no motion: draw one still frame whenever the view or the look changes
    const stamp = `${view.lon.toFixed(2)}${view.lat.toFixed(2)}${view.zoom.toFixed(3)}${JSON.stringify(cfg)}`
    if (!moving && stamp !== stillStamp) { scene.still(60); stillStamp = stamp } else if (moving) scene.update(now, true)
  } else scene.update(now, moving)
  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)

// handy for automated checks
;(window as unknown as { __lab: unknown }).__lab = { scene, select, PRESETS, setView: (v: typeof view) => { view = v; touch() } }
