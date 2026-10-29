# Qellon Visualizer: Cyclone Visualization Research (v0.1)

Date of research: 2026-10-27. Status: first pass. Items marked UNVERIFIED were not confirmed from a fetched page.

## 1. Context: Cyclone Arnab (as of 27 Oct 2026)

Source: The Week, citing IMD (https://www.theweek.in/news/india/2026/10/27/cyclone-arnab-six-odisha-districts-on-alert-as-storm-brings-heavy-rainfall-till-october-30.html)

- IMD calls it a **very severe cyclonic storm**. At 05:30 IST it was ~260 km SE of Visakhapatnam, moving ~22 km/h.
- Track: west-northwest, then northwest. Landfall expected between **Bapatla and Visakhapatnam (near Yanam, Andhra Pradesh)** by the forenoon of 28 Oct.
- Winds: IMD forecast 115-125 km/h sustained, gusts to 140 km/h (the article is internally inconsistent on the headline number).
- **Odisha is on the storm's flank, not at the landfall point.** Odisha impact is mostly heavy rain: orange alert for 6 districts (Puri, Gajapati, Ganjam, Rayagada, Koraput, Malkangiri), yellow alert for 16 more.

Important for the product: users in Odisha will want a *rain/impact* view, not only a track line.

## 2. Existing websites: what they show

| Site | Track / forecast path | Cone | Wind speed / category | Wind radii | Time animation | N. Indian Ocean (IMD terms) | Notes |
|---|---|---|---|---|---|---|---|
| **Zoom Earth** (zoom.earth/storms/arnab-2026) | Yes, JTWC track + model guidance (ICON, GFS) | Not mentioned | Yes: speed, pressure, movement, wave height | Not mentioned | Yes: satellite loop (3-24 h), timeline | Shows "Cyclonic Storm"; history table uses unlabelled codes | Best for the "watch it move" feel. Live page, data timestamp 03:00 UTC 27 Oct |
| **RainViewer storm tracker** (rainviewer.com/storm-tracker/india/odisha.html) | Current position, past path, forecast path | Yes | Yes: tap a point for speed, category, direction | No | Radar layer; timeline not described | **Yes: full IMD scale, Depression through Super Cyclonic Storm (222+ km/h)** | Closest match to the IMD terminology. Odisha page listed no active storm at 02:33 UTC (storm is near Andhra) and layers showed server errors when fetched |
| **TC Viewer** (tcviewer.org) | Best track, colored by Saffir-Simpson | n/a (historical) | Yes | **Yes: 34/50/64 kt radii + Rmax** | No slider mentioned | Uses US agency data (JTWC for N. Indian Ocean, UNVERIFIED), US category colors, not IMD | Historical, not live. Good reference for the wind-radii visual |
| **TC-ATLAS** (tcatlas.org) | Tracks in archive | n/a | Intensity in archive | Structure/radar analyses | IR season replays | N. Indian Ocean coverage not confirmed | Research site, "not for operational use" |
| **earth.nullschool.net** | No cyclone tracks | n/a | Global wind field | n/a | Yes: step through time, animation toggle | n/a | Best-in-class for wind flow, SST, waves, temperature layers (GFS, OSTIA, WAVEWATCH III). Open source (github.com/cambecc/earth). Not a cyclone tracker |
| **Windy** | Not confirmed this session | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | Needs direct check |
| **IMD RSMC New Delhi** (rsmcnewdelhi.imd.gov.in) | Official track forecast | UNVERIFIED | Official | UNVERIFIED | UNVERIFIED | **Authoritative source of the terms**: Four Stage Warning, Warning Graphics Legend, TC Names pages exist | Site returned 503 when fetched; needs a retry |
| **Open source: tropical_cyclones_app** (github.com/jdmantillaq/tropical_cyclones_app) | IBTrACS tracks, color by intensity | No | Wind, pressure on hover | No | Filtering only | Global IBTrACS | Reusable as a code reference. Licence not checked |

### Answer to the core question
Yes, sites exist that show a real cyclone moving with speed and category. No single site found so far combines **all** of: animated step-by-step movement + IMD-style category bands + wind radii + temperature/SST + rain impact in one view. Zoom Earth is strongest on animation, RainViewer on IMD terminology and cone, TC Viewer on wind radii, earth.nullschool on wind/SST/temperature layers. This is the gap the Qellon Visualizer could fill.

## 3. Terminology: IMD classification (3-minute sustained wind, knots)

Source: IMD terminology document (could not fetch the PDF; values via secondary search results, boundaries differ by 1 kt between sources, to be verified against rsmcnewdelhi.imd.gov.in/images/pdf/terminology.pdf).

| Category | Wind (kt) |
|---|---|
| Low pressure area | < 17 |
| Depression | 17-27 |
| **Deep Depression** | 28-33 |
| Cyclonic Storm | 34-47 |
| Severe Cyclonic Storm | 48-63 |
| Very Severe Cyclonic Storm | 64-89 |
| Extremely Severe Cyclonic Storm | 90-119 |
| Super Cyclonic Storm | >= 120 (RainViewer: 222 km/h+) |

Note: "Deep depression zone" is not an IMD term as far as I found. "Deep Depression" is a *category*. The UI should probably show it as a stage on an intensity ladder, plus a separate "cyclone warning zone / cone / wind radii" for areas. Please confirm what you meant.

Other terms to explain visually (not all verified against IMD): landfall, eye, eyewall, radius of maximum wind, storm surge, cone of uncertainty, watch/warning color codes (green/yellow/orange/red), the "four stage warning" (IMD page exists).

## 4. Important data-quality finding: sources disagree on Arnab

- **The Week / IMD:** very severe cyclonic storm, 115-125 km/h sustained, gusts to 140 km/h, ~260 km SE of Visakhapatnam.
- **Zoom Earth:** labelled "Cyclonic Storm", wind 165 km/h (max 185), 968 hPa, 824 km SSW of Kolkata. Its page also has history entries dated after its own "last modified" stamp, so some data looks mixed or stale.
- **RainViewer Odisha page:** no active storm near Odisha.

A likely cause (my inference, not verified) is different agencies and averaging periods: JTWC uses 1-minute winds, IMD uses 3-minute winds, and 1-minute values are higher. Different update times also matter. **Design requirement: always show source agency, averaging period, and timestamp next to every number.**

## 5. Data sources for building it

- **IMD RSMC New Delhi:** official bulletins and track forecasts. No official API/KML/shapefile found in this pass.
- **imdtrack** (Python, imdtrack.readthedocs.io): third-party parser of IMD best-track data. Historical only.
- **IBTrACS** (NOAA NCEI): historical tracks incl. N. Indian Ocean file (IBTrACS.NI). Good for backtesting demos with past Odisha cyclones (Fani 2019, Amphan 2020, Yaas 2021, Dana 2024).
- **JTWC / ATCF** (ftp.nhc.noaa.gov/atcf and JTWC): A-deck forecasts, B-deck best track; format varies between variants, parse defensively.
- **Weather layers:** GFS (wind, temperature, rain), OISST/OSTIA (sea surface temperature), WAVEWATCH III (waves), Open-Meteo and others as easy APIs (UNVERIFIED, not researched yet).
- **Satellite:** INSAT-3D/3DR via MOSDAC (not researched yet; registration likely).

## 6. Open questions and next steps

1. Retry fetching rsmcnewdelhi.imd.gov.in and the terminology PDF (503 earlier) to lock down the exact category table and warning colors.
2. Check Windy directly, plus nullschool's cyclone support, IMD "mausam" cyclone page, and the Odisha SDMA/OSDMA site.
3. Research the free-data path: IMD bulletin scraping vs JTWC ATCF vs IBTrACS; license terms.
4. Decide product shape: live tracker vs historical replay vs both. Historical replay of Dana/Fani is the safest first prototype because it needs no live feed.
5. Define the "impact" views for Odisha: district rain warnings, wind radii, storm surge, temperature drop.
