# Qellon Visualizer: Phase 0 data spike results and Plan v0.2

Run on 2026-10-29 around 06:05-06:10 UTC, from the cloud session, using live requests. Raw responses are saved as test fixtures in `data/fixtures/2026-10-29/` (folders: cira, nhc, gdacs, gfs, ibtracs).

## 1. Product scope (decided in conversation)

- Plain-language storm globe for a general audience: any cyclone, hurricane, typhoon or depression worldwide.
- Per storm, show only: name, strength in words, wind speed, moving speed/direction, past path (solid), forecast path (dashed), last-updated + source. Everything else under "More details".
- Forecast path is the **agency's published forecast**, credited. Fallback if none exists: a simple projection, clearly labelled "simple projection, not official".
- Point-anywhere readout (nearest place, wind in words, temperature, pressure, distance to storm) and a unit switch (km/h, mph, kt, m/s; C/F; hPa/inHg; km/mi; local time/UTC).
- Animated wind layer (GFS model output, labelled as model data).

## 2. Spike results: the three sources you asked for (plus the ones that turned up)

| Source | Result | Rating |
|---|---|---|
| **NHC** (US National Hurricane Center) | Works. `https://www.nhc.noaa.gov/CurrentStorms.json` returned clean JSON for the one active storm, Vance (Eastern Pacific): lat/lon, wind (kt), pressure, movement direction/speed, advisory times, and links to forecast and graphics. ATCF files are open: forecast file `atcf/fst/ep222026.fst` (official forecast at hours 0, 3, 12, 24, 36 with position, wind, wind radii) and best track `atcf/btk/bep222026.dat` (6-hourly history). Fresh: 03:00Z advisory, files written 02:30Z. **Covers only the Atlantic, Eastern Pacific and Central Pacific.** | GREEN for those basins |
| **GDACS** (EU/UN disaster alert system) | Partly works. RSS feed `xml/rss.xml` returned 283 items; it lists every active cyclone with name, country, alert level, population affected (Arnab: "4.008 million") and a position. Per-event GeoJSON works (`api/Events/geteventdata?eventtype=TC&eventid=1001345`) and names the source as **JTWC**. But the API is flaky: first call returned "timeout expired... pool", and several calls failed with no response. It gives **one point per event, not a track or forecast** (the geometry endpoint timed out, untested). Some fields are inconsistent (Arnab text says "102 km/h", numeric value 222 km/h). Fresh: modified 29 Oct 05:37. | AMBER: good for the global list and "people affected" |
| **NRL** (US Naval Research Lab) | Not usable as a feed. The ATCF page is a stub (last updated 2017), `TC.html` redirects to an imagery web app (`science.nrlmry.navy.mil/geoips/tcweb/`) with no data links. JTWC's own site (`metoc.navy.mil`) returned **403 Request blocked** from this environment. | RED |
| **CIRA / RAMMB TC Real-Time** (Colorado State, NOAA-funded) | **Best find.** `https://rammb-data.cira.colostate.edu/tc_realtime/` lists every active storm in every basin, including the Indian Ocean: IO022026 Arnab, WP302026 IN-FA, EP222026 Vance, IO912026 Invest. Each storm page has a **track history table** (6-hourly: time, lat, lon, wind in kt) and a **forecast track table** (hours 0-120: lat, lon, wind). Example: typhoon IN-FA forecast issued 2026-10-29 00:00 with 8 forecast points out to 120 h. Also has IR satellite, microwave, surface wind analysis and ocean heat content image links. Cons: it is an **HTML page, no JSON/API**, 6-hourly updates (latest point 00:00 UTC, about 6 h old at fetch), licence terms not stated. Arnab's forecast table is empty now because the storm has dissipated. | GREEN/AMBER: scrape with care and ask permission |
| **IBTrACS** (NOAA historical archive) | Works. North Indian Ocean CSV (28 MB, modified 27 Oct 09:03 UTC) contains Fani 2019, Amphan 2020, Dana 2024, Arnab 2026 (9 rows). About 2 days old, so good for replay, **not** for "now". | GREEN for replay |
| UCAR RAL guidance repository | `hurricanes.ral.ucar.edu/repository/` reachable (HTTP 200). They say they monitor all basins including the North Indian Ocean. Not explored. | Candidate fallback |

### Cross-check on Arnab (all agree, which is reassuring)
- CIRA track history: peak **120 kt on 27 Oct 12:00 UTC**, then 100 kt (18:00), 70 kt (28 Oct 00:00), 55 kt (06:00, near 16.4 N 81.8 E), down to 30 kt at 19.0 N 82.1 E on 29 Oct 00:00 UTC.
- GDACS: max wind **222 km/h** (= 120 kt), source JTWC.
- Zoom Earth (your screenshots): extremely severe, 220 km/h, 940 hPa on 27 Oct.
- All of these are JTWC-style 1-minute winds. IMD's own numbers are lower (3-minute averages, 115-125 km/h forecast). Labels must say which.

### New storm to watch
CIRA lists **IO912026 (Invest)**, 7.9 N 97.0 E, 25 kt, in the Andaman Sea. A possible next Indian-Ocean test case.

## 3. What the spike means for the design

1. **A worldwide current-conditions-plus-forecast feed is feasible, from free public sources:** NHC directly (Atlantic and Eastern/Central Pacific) + CIRA RAMMB (Western Pacific, Indian Ocean, Southern Hemisphere, which is JTWC data) + GDACS for global alerts and population impact + IBTrACS for history.
2. **The Indian Ocean depends on one scraped, unofficial page** (CIRA). That is the single biggest risk. Mitigate with: asking RAMMB for permission, caching, a parser test that fails loudly if the page layout changes, and UCAR/ATCF as a researched backup.
3. **Data is 6-hourly, so it is "latest advisory", not "live".** The UI must show "updated X hours ago".
4. **Do not mix agencies silently.** Store each number with agency and averaging period; display wind in knots internally, convert for display.
5. **Strength labels are a design decision.** JTWC/NHC 1-minute winds placed on IMD's 3-minute category table would overstate strength (Zoom Earth shows "very severe" at 165 km/h where IMD forecast 115-125 km/h). Plan: universal plain-language scale from the 1-minute data, with the local official term shown when the agency provides it.
6. **The "people affected" number from GDACS is a strong plain-language hook** ("4.0 million people in the wind zone"), but it is a model estimate: label it.

## 4. Data model (proposal)

```
Storm   { id, name, basin, source, agency_class, lat, lon, wind_kt, wind_avg: "1min",
          pressure_hpa?, move_dir?, move_kt?, updated_at, status: active|remnant|ended }
Track   [ { t, lat, lon, wind_kt, pressure? } ]            // observed/analysed past
Forecast[ { hours, lat, lon, wind_kt, issued_at, source } ]  // agency forecast, optional
Impact  { people_in_wind_zone?, source }                     // from GDACS, optional
```
Ingest writes one `storms.json` + one file per storm; frontend reads static JSON.

## 5. Action plan

**Step 0: finish Phase 0 (1 day)**
- Create the empty private repo `Qellon-Visualizer` and move the notes and fixtures into it.
- Ask RAMMB (contact page) whether automated reads of the TC Real-Time pages are acceptable, and read NOAA/NHC/GDACS reuse terms; keep an attribution list.
- Quick test of UCAR repository as backup; test GDACS `getgeometry` again with retries.
- Exit: written go/no-go on the Indian-Ocean source.

**Step 1: data layer (3-4 days)**
- Parsers: NHC (JSON + ATCF), CIRA (HTML tables), GDACS (RSS + GeoJSON), IBTrACS (CSV for replay).
- Normalizer into the schema above, with unit tests using the saved fixtures (Vance, Arnab, IN-FA, the Invest).
- Scheduled job (every 3 h) writing static JSON; failure alarms if a source returns nothing or its layout changes.
- Exit: one command prints today's active storms worldwide with name, wind, position, forecast.

**Step 2: design (parallel with Step 1, about 3-4 days)**
- Mock-ups: globe home, storm card (the five fields), "More details", point readout, units popover, mobile layout.
- Plain-language scale and glossary wording, strength colors with accessible contrast.
- Exit: you approve the look before heavy UI work.

**Step 3: prototype UI (1-1.5 weeks)**
- Globe/map, storm markers, storm list, card, past + dashed forecast path, last-updated and source line, unit switch, local-time default.
- Replay mode for Fani, Amphan, Dana, Arnab (IBTrACS + saved CIRA data).
- Exit: usable on desktop and phone with real data.

**Step 4: wind layer and point readout (1 week)**
- GFS wind pipeline (NOMADS to JSON, 4x/day), particle animation (borrow MIT-licensed cambecc/earth approach with attribution), click readout with nearest place and plain-language wind.
- Exit: wind loops smoothly, labelled "GFS model, time".

**Step 5: harden and launch (1 week)**
- Disclaimers and official-agency links, attribution page, accessibility pass, performance, error states ("data unavailable, last good data X h ago"), hosting on static hosting with the scheduled job, monitoring.
- Decide on optional later features: temperature/sea-temperature layers, satellite loop, India/Odisha warnings, alerts.

Rough total to a usable beta: 4-5 weeks of focused work (my estimate, not measured).

## 6. Risks and open decisions

- Indian Ocean data rests on one scraped page: ask permission, build a backup.
- JTWC direct access was blocked (403) from this environment; may not be blocked elsewhere (unverified).
- GDACS API is unreliable; use RSS and cache.
- Safety: never present this as a warning service; show source, time, and link to the official agency on every storm.
- Decisions needed: (1) web only or mobile app too; (2) personal/educational vs commercial; (3) universal strength scale wording; (4) repo creation (the session could not create it).
