# Qellon Visualizer

A storm globe for everyone: every active cyclone, hurricane, typhoon and depression, with its name, plain-language strength,
wind speed, direction, past path and forecast path, on a moving wind map. Educational project, web only.

> **Status (29 Oct 2026): design done; live storm pipeline built (day 1). The app still shows a built-in snapshot;
> switching it to the live file is next.** It is not a warning service.
>
> The project name is a placeholder and will change.

![Storm panel](docs/screenshots/d2-infa.jpg)

## What the prototype does
- Globe with animated wind streaks and wind-speed colours (orthographic projection, canvas)
- Active storms with strength in words, wind speed, moving speed and direction, past and forecast path
- Click anywhere for local wind, temperature and pressure; unit switch (km/h, mph, kt, m/s; C/F; hPa/inHg; km/mi/nmi; local/UTC)
- Search (Ctrl/Cmd+K), layer toggles, phone layout
- Replay of past storms: Fani 2019, Amphan 2020, Dana 2024, Phailin 2013 (IBTrACS)
- Liquid-glass interface, Geist type, shadcn/ui, spring-based motion

## Run it
```bash
cd app
npm ci
npm run dev        # http://localhost:5173
npm run build      # one self-contained file in app/dist/index.html
```
Needs Node 20+.

## Repository layout
| Path | What |
|---|---|
| `app/` | The web app (React 19, Vite, Tailwind 4, shadcn/ui). Version 3 of the mock-up |
| `pipeline/` | Storm data pipeline (Python 3.11+, standard library only) and its tests |
| `app/public/data/storms.json` | Live storm file written by the pipeline, refreshed every 3 hours |
| `.github/workflows/` | `refresh-storms.yml` (every 3 hours) and `ci.yml` (tests and app build on every push) |
| `docs/research/` | Research, product plan, and the Phase 0 data spike with the v0.2 plan |
| `docs/ATTRIBUTION.md` | Data sources, licences and credits |
| `data/fixtures/2026-10-29/` | Responses saved from NHC, GDACS, NOAA tcvitals, GFS and IBTrACS, for tests and offline work |
| `tools/` | Scripts for replay tracks, the GFS wind grid and browser tests |

## Storm data pipeline
```bash
python3 -m pipeline.storms --out app/public/data/storms.json          # live: NHC, GDACS, NOAA tcvitals
python3 -m unittest discover -s pipeline/tests -t .                     # tests on saved responses
# offline, from the saved responses (this is how app/src/data/storms.json was made):
python3 -m pipeline.storms --out app/src/data/storms.json --previous /dev/null \
  --fixtures data/fixtures/2026-10-29 --now 2026-10-29T08:30:00Z
```
Sources and how they are combined: `docs/research/04-data-sources-v0.3.md`.

## Rebuilding the other data files from the fixtures
```bash
python3 tools/build_past.py   data/fixtures/2026-10-29/ibtracs/NI.header-and-4-storms.csv app/src/data/pastStorms.json
# GFS wind grid (needs: pip install eccodes numpy)
python3 tools/decode_gfs.py   data/fixtures/2026-10-29/gfs/gfs_2026102900.grb2 app/src/data/gfs.json
```

## Next
1. ~~Live storm pipeline with fallback and tests~~ (done)
2. App reads the live file; real stale and error states; remove mock-up controls
3. Wind grid refresh 4 times a day, finer grid
4. About page with credits, cross-browser checks, hosting on Cloudflare Pages

## Licence
Code: MIT, see `LICENSE`. Data keeps its sources' terms, see `docs/ATTRIBUTION.md`.

## Not an official warning
Qellon shows data as published by weather agencies and does not make its own forecasts. Follow your national agency for warnings.
