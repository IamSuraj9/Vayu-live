import { useEffect, useRef, useState } from "react"
import type { Camera } from "./camera"
import type { Cfg } from "@/looks/presets"

type Engine = typeof import("@/looks/engine")
type Scene = InstanceType<Engine["Scene"]>

type Props = {
  cfg: Cfg; camera: Camera; size: { w: number; h: number }; dpr: number
  /** radius of the globe at zoom 1, in CSS px, and how far the globe is lifted off the middle */
  base: number; oy: number
  fieldVersion: number; reducedMotion: boolean
  /** called once the first frame is on screen */
  onReady: () => void
}

/**
 * Draws every look except Heat: the globe surface, wind marks and pressure lines, with the Style Lab's drawing engine.
 * The engine (about 1 MB with the detailed map) is fetched the first time someone picks another look.
 * Storms are not drawn here; the Globe draws them on top so they stay clickable.
 */
export function LookLayer({ cfg, camera, size, dpr, base, oy, fieldVersion, reducedMotion, onReady }: Props) {
  const surface = useRef<HTMLCanvasElement>(null), marks = useRef<HTMLCanvasElement>(null)
  const trail = useRef<HTMLCanvasElement>(null), live = useRef<HTMLCanvasElement>(null)
  const [engine, setEngine] = useState<Engine | null>(null)
  const scene = useRef<Scene | null>(null)
  // The loop reads the newest props from here, so it never has to restart
  const latest = useRef({ cfg, size, base, oy, reducedMotion, fieldVersion, onReady })
  latest.current = { cfg, size, base, oy, reducedMotion, fieldVersion, onReady }

  useEffect(() => {
    let gone = false
    import("@/looks/engine").then(async m => { if (await m.prepare() && !gone) setEngine(m) }).catch(() => {})
    return () => { gone = true }
  }, [])

  // A new wind field: take it, and draw everything from it again
  const taken = useRef(fieldVersion)
  useEffect(() => {
    if (!engine || taken.current === fieldVersion) return
    taken.current = fieldVersion
    if (engine.refreshField()) scene.current?.invalidate()
  }, [engine, fieldVersion])

  useEffect(() => {
    if (!engine) return
    const s = new engine.Scene({ surface: surface.current!, marks: marks.current!, trail: trail.current!, live: live.current! }, dpr)
    scene.current = s
    s.setCfg(latest.current.cfg)
    let raf = 0, sig = "", lastMove = 0, stillStamp = "", cfgSeen = latest.current.cfg, sized = "", first = true
    const loop = (now: number) => {
      const { cfg: c, size: z, base: b, oy: y, reducedMotion: reduced, fieldVersion: fv } = latest.current
      if (c !== cfgSeen) { cfgSeen = c; s.setCfg(c); stillStamp = "" }
      if (sized !== `${z.w}x${z.h}`) { sized = `${z.w}x${z.h}`; s.resize(z.w, z.h) }
      const v = camera.get()
      s.centre = [z.w / 2, z.h / 2 - y]; s.baseScale = b / Math.min(z.w, z.h)
      s.setView(v)
      const next = `${v.lon}|${v.lat}|${v.zoom}|${y}|${z.w}|${z.h}`
      if (next !== sig) { sig = next; lastMove = now }
      const moving = now - lastMove < 170
      if (reduced) {
        // no motion: draw one still frame whenever the view or the look changes
        const stamp = `${sig}|${JSON.stringify(c)}|${fv}`
        if (!moving && stamp !== stillStamp) { s.still(60); stillStamp = stamp } else if (moving) s.update(now, true)
      } else s.update(now, moving)
      if (first) { first = false; latest.current.onReady() }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => { cancelAnimationFrame(raf); scene.current = null }
  }, [engine, camera, dpr])

  const cls = "pointer-events-none absolute top-0 left-0"
  return (
    <div aria-hidden="true">
      <canvas ref={surface} className={cls} />
      <canvas ref={marks} className={`${cls} transition-opacity duration-200`} />
      <canvas ref={trail} className={`${cls} transition-opacity duration-200`} />
      <canvas ref={live} className={cls} />
    </div>
  )
}
