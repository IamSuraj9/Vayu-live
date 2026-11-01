# Qellon Visualizer: Product Plan v0.1 (plan first, feasibility second)

> Written under the working name Qellon. The product is now called Vayu and the repository is `Vayu-live`. This note is kept as written.

Written 2026-10-28. Follows cyclone-visualizer-research.md in the same folder. Items marked UNVERIFIED have not been confirmed from a fetched page.

## 1. Concept

A storm globe for everyone: every active cyclone, hurricane, typhoon and depression in the world, shown with its name, plain-language strength, wind speed, direction and forecast path, on a moving wind map. Zoom Earth's storm card + nullschool's flowing wind globe, rewritten for a non-meteorologist.

## 2. What the two screenshots teach us

Zoom Earth (storm card):
- Storm name header, strength badge in one of a few colors, a 6-hourly table (date, time, type, wind km/h, pressure hPa), forecast rows marked "Forecast", a track line colored by strength, a grey cone of uncertainty, a play bar with a time picker, a layer list (Satellite, Radar, Precipitation, Wind, Temperature, Humidity, Pressure). Credits: EUMETSAT, Meteosat-IODC, JTWC.
- Why it feels technical: type codes (B, SC, VC, EC, R) with no legend on the card, pressure in hPa, times in "UTC+5.5", a dense table, no explanation of what any of it means.
- Correction to my earlier note: the page does show a forecast cone (I reported none from the text fetch). Its on-map label says "Very Severe Cyclonic Storm" while the card title says "Cyclonic Storm Arnab", so even one site mixes terms.

earth.nullschool (wind globe):
- 3D globe, animated wind particles, click readout ("16.96 N, 83.50 E, Wind 20 deg @ 106 km/h"). Arnab is visible as a spiral, but there is no name, track, category or forecast. Beautiful, but you must already know what you are looking for.

Takeaway: nobody joins "it is a storm, here is its name and what it means" with "watch the air move around it".

## 3. Experience (what a general user sees)

1. **Home = globe.** Dark globe with flowing wind (toggleable). Each active storm is a pulsing marker with its name and a plain-language strength label and wind speed.
2. **Storm rail.** "Active now" list sorted by strength. Card: name, region ("Bay of Bengal"), strength in words, wind in km/h (units switchable), "heading NW, landfall near Visakhapatnam in ~14 h".
3. **Storm detail.** Past track + forecast track colored by strength, cone, timeline scrubber with play, simplified table, "what this means" text, a strength ladder (Depression -> Deep Depression -> Cyclone/Storm -> Severe -> Very Severe -> Extreme -> Super) with the storm's position on it.
4. **Layers synced to time.** Wind flow, temperature, rain, pressure, sea surface temperature (explained as "the storm's fuel").
5. **Names that make sense.** Show the local term (hurricane in the Atlantic, typhoon in the NW Pacific, cyclone in the Indian Ocean) plus one global 5-level strength scale, so "Arnab" and "Hurricane X" are comparable.
6. **Replay any past storm.** Fani, Amphan, Dana, Arnab, Katrina... also keeps the app demo-able when nothing is active.
7. **Trust strip on every number.** Source agency, wind averaging period (1-min vs 3-min vs 10-min), timestamp, and "not an official warning, see IMD/NHC/JTWC".

## 4. Feasibility (first read)

Legend: GREEN = confident, AMBER = doable but needs verification or real work, RED = avoid in MVP.

| Feature | Rating | What I found |
|---|---|---|
| Global list of active storms with name, position, wind | AMBER | **GDACS** has a free, no-auth REST API plus RSS/GeoJSON for tropical cyclones; EU copyright, syndication allowed with acknowledgement. I have not confirmed it includes forecast positions (check its Swagger docs). **IBTrACS** has an "active" subset (storms in the last 7 days) and daily updates, but it is provisional best-track, no forecasts. Both are third-party aggregations, not the official warning |
| Official forecast tracks | AMBER | NHC publishes ATCF files and GIS data for Atlantic and Eastern/Central Pacific. For the Indian Ocean, **no official IMD API/KML found**, and I found no clean JTWC machine-readable feed (derived products exist via UCAR/ATCF). Needs a dedicated spike |
| Forecast cone | AMBER | Can be drawn from forecast positions with published error radii (NHC's radii are Atlantic-specific); outside NHC I would label it "approximate" |
| Wind radii (R34/50/64) | AMBER | Present in ATCF data when available; patchy for some basins |
| Animated wind (nullschool look) | GREEN | **cambecc/earth is MIT-licensed**: GFS wind from NOAA NOMADS as GRIB2 -> JSON with grib2json, drawn on canvas. We can borrow the approach/code with attribution. GFS updates 4x/day, so the wind field is a model forecast, not an observation |
| Temperature, humidity, rain, pressure layers | GREEN/AMBER | Come from the same GFS output; each extra variable adds a pipeline step |
| Sea surface temperature | AMBER | nullschool uses OISST/OSTIA/RTGSST, daily, different pipeline and format |
| Quick wind data via API instead of GRIB | AMBER | **Open-Meteo** is free for non-commercial use under CC BY 4.0, paid for commercial use (published rate limits not verified on their terms page). Not ideal for a full global grid |
| Satellite imagery loop (Zoom Earth) | RED for MVP | Tile/licence/bandwidth heavy; satellite operators (EUMETSAT, Himawari, INSAT) have their own terms. Candidate later: NASA GIBS (UNVERIFIED) |
| Live radar | RED | Commercial APIs; skip |
| Impact: nearest cities, landfall ETA | GREEN | Pure geometry on track + a city list |
| District-level rain warnings (Odisha style) | RED globally / AMBER for India | Official per-country products with no single global feed |
| Replay of past storms | GREEN | IBTrACS has the full historical archive including the North Indian Ocean |

Bottom line: the globe, wind animation, storm cards, replay, plain-language scale and ETAs are achievable. A global **live official forecast** feed is the main risk, and the Indian Ocean is the hardest basin for it. Satellite and radar are out of scope for v1.

## 5. Architecture (proposal)

- **Ingest job** (scheduled, every 1-3 h for storms, 4x/day for wind): fetch GDACS / IBTrACS / NHC, normalize into one schema (Storm, TrackPoint, ForecastPoint, source, averaging period, timestamp), write static JSON. Separate job converts GFS GRIB to compact wind JSON/tiles.
- **Frontend only reads static JSON** (cheap, fast, no live backend). Globe + particle layer on canvas/WebGL; storm UI in plain HTML/CSS.
- **Stack choice is open:** a MapLibre GL globe plus a custom particle layer versus porting cambecc/earth (d3 + canvas). Decide after the spike.

## 6. Phases

- **Phase 0, data spike (1-2 days):** verify GDACS Swagger (do forecasts exist?), IBTrACS active file, NHC ATCF. Output: one script printing today's global active storms. **Go/no-go gate.** Also snapshot Arnab data now, since feeds drop storms soon after they dissipate, so we keep a real test fixture.
- **Phase 1, MVP:** globe, active-storm markers and cards, track + forecast line, timeline playback, plain-language strength scale, GFS wind particles, 3 replayable historical storms, trust strip.
- **Phase 2:** cone, wind radii, SST/temperature/rain layers, nearest-city ETAs, glossary/learn mode.
- **Phase 3:** India/Odisha-specific warnings, alerts, satellite loop, share cards, mobile polish.

## 7. Risks and rules

- **Safety:** wrong storm data during a disaster hurts people. Always show source and timestamp, and link to the official agency. Never call it a warning service.
- **Do not clone Zoom Earth.** Proprietary UI, assets and imagery. We borrow ideas (card, timeline, colors by strength) and build our own.
- **Attribution and licences:** nullschool code is MIT (keep notice), GDACS needs source acknowledgement, Open-Meteo is CC BY 4.0 and non-commercial only unless paid, NOAA/NHC data to be checked.
- **Mixed definitions:** 1-min, 3-min and 10-min winds differ; show each agency's own value, do not silently convert.
- **Naming scale:** mapping IMD, NHC and typhoon categories onto one 5-level scale is a design decision, not a fact; document the mapping.

## 8. Decisions needed from the user

1. Web only for v1, or mobile app too?
2. Personal/educational project or something that may earn money? (changes data licences)
3. Is Phase 0 (data spike) the right first step, or do you want a design mock-up first?
4. Create the empty private `Qellon-Visualizer` repo so work can live there. The session could not create it.
