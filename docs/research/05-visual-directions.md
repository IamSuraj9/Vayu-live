# Visual directions for the globe (29 Oct 2026)

Scope: only how the planet, the wind, the pressure zones and the map look. The data, interactions and layout stay as they are.
All of it can be tried live in the **Globe Style Lab** (`app/lab/`, build with `npm run build:lab`). It draws today's real
GFS wind, pressure and temperature and the three active storms in eight looks, and lets you mix every layer.

## What the research says
| Finding | Source | What we did with it |
|---|---|---|
| Streamlines with arrowheads and curved barbs are read more accurately than classic straight barbs, for both direction and speed | Ware et al., *Improving the Display of Wind Patterns and Ocean Currents*, BAMS 2014 | Streamlines and flowing dashes are offered as the primary wind marks; straight barbs are kept only in the forecaster look |
| Weather charts draw isobars every 4 hPa from 1000 and mark highs and lows with H and L | NOAA JetStream | Isobars every 4 hPa, thicker every 20, with H and L markers |
| A wind barb's staff points to where the wind comes from; a long feather is 10 kt, a flag is 50 kt | NWS Honolulu | Barbs follow the convention, including the calm circle |
| Rainbow scales mislead because equal steps do not look equal, but a well-designed one can still work | Google Turbo post; Ware 2023 | Seven palettes, most of them single-hue ramps; the classic and Turbo rainbows are kept for comparison |

## Four layers, mixed independently
1. **Earth**: Void (black), Slate, Night (lit sphere, atmosphere, day and night side, city lights), Paper, Dots.
2. **Colour fill**: none, wind (smooth), wind (six bands), lows and highs, relief (pressure as terrain), temperature.
3. **Wind marks**: particles, glow, streamlines, flow (moving dashes), arrows, barbs, shimmer.
4. **Pressure and storm marks**: isobars with H and L, and storm marks as spiral, rings or eye.

## The eight directions
| Direction | Look | Reads best for | Watch out |
|---|---|---|---|
| **Heat** (today) | Every pixel coloured by wind speed, white streaks | Instantly a weather product | Competes with storm markers; every ocean is tinted |
| **Ink** | Warm paper globe, ink streamlines that thicken and turn vermilion | Calm, editorial; direction is obvious | A bright globe on black can glare |
| **Night** | Lit sphere with real day and night, blue atmosphere, glowing wind | Most atmospheric; storms get a stage | Day and night shading is decorative and could read as a forecast layer |
| **Dots** | Continents of dots, shimmering dashes for wind | Graphic, light on the GPU | Small islands and direction are harder to read |
| **Chart** | Isobars, H and L, violet lows, amber highs, barbs | Best for depressions; matches meteorology | Needs explaining; the densest |
| **Relief** | Pressure as terrain, wind flowing over it | A natural picture of a depression, no legend needed | Subtle; weak for small cyclones |
| **Bands** | Six flat wind bands with arrows | Easiest to read and explain | Blocky; a small change flips a region's colour |
| **Ribbons** | No fill, luminous curves coloured by speed | Elegant; clearest picture of flow | Slow regions look empty |

## Recommendation
Do not pick one look; layer them, because the app already has a Layers popover:
- **Default:** a Night-style globe (dark sphere with a thin atmosphere, faint coastlines) with glowing wind in a restrained
  palette (Aurora or Ice). It keeps the page black, makes the storm markers the brightest thing on screen, and is cheap to draw.
- **Layer "Wind strength":** Bands, because its six steps line up with the app's strength scale and give a short legend.
- **Layer "Pressure":** Chart's lows and highs (violet tint, L and H markers), without barbs. This is the direct answer to
  "show me where the depressions are". Isobars as a second step for people who want them.
- **Theme switch (optional):** Ink as a light theme for daytime use.
- Keep the current Heat look available as a "Colour" option, since people know it.

## Cost and risks for the real app
- No new data needed: wind, pressure and temperature are already in `data/wind.json`; H and L positions are found in the browser.
- Drawing cost is about the same as today's heat map for the per-pixel looks (Heat, Bands, Relief, Chart); Night's glow
  roughly 1.5 times; Dots redraws about 20,000 points per view, so it is hidden while the globe moves.
- City lights in the lab are a hand-made sample of large cities. A real version would use Natural Earth populated places (public domain).
- Colour is never the only signal in Bands (arrows) or Ribbons (line weight); keep that rule for colour-blind users.
- The pressure grid is stored in 1 hPa steps, so it is smoothed before drawing isobars and relief.
- A side finding: in the current app, very slow particles show as isolated white dots. The lab skips them; the app can too.
