# Looks and Customize

The globe can be drawn in eight looks. Heat is what everyone sees first. The **Customize** card (bottom right on a
computer, above the storms bar on a phone) switches looks and fine-tunes every layer.

## What a visitor sees

- First visit: Heat. Later visits: the last look they chose, saved on the device (`qellon.look.v1`).
- The card shows three looks (Heat, Ink, Night). "More looks and layers" or the arrow opens all eight, a short
  description, and the layer controls (earth, colour fill, palette, wind, wind colour, pressure lines, map lines,
  storm marks). Changing one layer turns the look into a "Custom mix"; "Back to Heat" returns.
- The legend (bottom left) follows the look: wind speed, six bands, pressure, relief or temperature.
- On a computer, the zoom pill (top, left of the toolbar) has a small globe (zoom out), a large globe (zoom in) and a
  compass that returns to the start view. Every button stays focusable at its limit (`aria-disabled`).
- On a phone there are no zoom buttons: pinch to zoom, drag to turn, or double-tap to zoom in on that spot (one finger;
  once fully zoomed in, a double-tap flies back to the start view). The top right holds Search and a three-dot button
  that opens Settings (units, map layers, and links to the strength scale, glossary and sources).
- The storm marker is two thin spiral arms around a white eye, turning slowly (counter-clockwise north of the
  equator, clockwise south). A stronger storm draws a larger spiral (`r = 9 + knots / 11`).
- On a computer the Layers menu still works on top of any look: Moving wind, Wind colours and Borders and grid map onto the look's
  layers (`effectiveCfg` in `looks/presets.ts`); Storm paths hides the tracks.

## How it is built

| Part | Where |
| --- | --- |
| Look list, layer options, saving, Layers-menu mapping | `app/src/looks/presets.ts` |
| Colour palettes | `app/src/looks/palettes.ts` |
| Drawing engine (surface, wind marks, pressure lines) | `app/src/looks/engine/` (loaded on demand) |
| Engine layer inside the globe | `app/src/globe/LookLayer.tsx`, used by `Globe.tsx` |
| Customize card, zoom pill, legend | `app/src/components/looks.tsx` |
| Picker thumbnails | `app/src/looks/thumbs/*.webp` (small pictures; the globe itself is always live) |

- **Heat** is drawn by the app's own layers in `Globe.tsx`, exactly as before. Any other combination is drawn by the
  engine. The engine (about 25 KB plus the detailed 1:50m map, 750 KB) is only fetched when someone picks another look.
- The engine reads the same live wind file as Heat. `oneDegree()` in `globe/field.ts` re-samples it to the 1° grid the
  engine uses; pressure lines, highs and lows and streamlines are built the first time a look needs them and again
  whenever a new field arrives.
- **Storms are not drawn by the engine.** `Globe.tsx` draws tracks and markers on top in every look, so they stay
  clickable and follow replays. The "Storm marks" option changes the marker (spiral, rings, eye) and the track style.
- Past-storm replays hide the colours and wind marks in every look, as they did before.
- On the light Ink look, `main[data-light]` darkens the glass so its text stays readable.

## While the globe moves

While someone drags or zooms, the wind lines briefly fade out and come back once the globe is still (Heat: the faded
trails cannot follow a turning globe, so they are cleared; other looks: the marks and trails layers are hidden and a
quick coarse surface is drawn). This was tried the other way round (lines kept on screen as short streaks) and turned
a typhoon's spiral into long straight rays and looked jumpy, so it was reverted.

Dialogs and sheets open with focus on the panel, not on the Close button, so no ring shows after a tap; the ring shows
only for keyboard focus (`focus-visible`).

## Checks

- `node tools/e2e/looks.cjs URL OUT_DIR [AXE_PATH]` opens every look on desktop and phone, checks the engine draws,
  saving, the zoom pill, the storm panel next to Customize, and runs axe.
- `node tools/e2e/looks-perf.cjs URL` measures long tasks and frame rate per look (also with the CPU slowed 4x).
