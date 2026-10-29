# Qellon Visualizer

A storm globe for everyone: every active cyclone, hurricane, typhoon and depression, with its name, plain-language strength,
wind speed, direction, past path and forecast path, on a moving wind map. Educational project, web only.

> **Status (29 Oct 2026): design and UI prototype done, live data pipeline not built yet.**
> The app in `app/` runs on a frozen snapshot of real data from 29 Oct 2026 (storms from NHC, CIRA/JTWC and GDACS;
> wind from GFS). It is not a warning service.

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
| `docs/research/` | Research, product plan, and the Phase 0 data spike with the v0.2 plan |
| `docs/ATTRIBUTION.md` | Data sources, licences and credits |
| `data/fixtures/2026-10-29/` | Raw responses saved from NHC, CIRA, GDACS, GFS and IBTrACS, for tests and offline work |
| `tools/` | Scripts that turn fixtures into the app's data files (see below) |

## Rebuilding the app's data from the fixtures
```bash
python3 tools/build_storms.py data/fixtures/2026-10-29 app/src/data/storms.json
python3 tools/build_past.py   data/fixtures/2026-10-29/ibtracs/NI.header-and-4-storms.csv app/src/data/pastStorms.json
# GFS wind grid (needs: pip install eccodes numpy)
python3 tools/decode_gfs.py   data/fixtures/2026-10-29/gfs/gfs_2026102900.grb2 app/src/data/gfs.json
```

## Next (see `docs/research/03-phase0-data-spike-and-plan-v0.2.md`)
1. Live ingest for NHC, CIRA and GDACS with last-good-data fallback and tests
2. Scheduled refresh (storms every 3 h, wind 4 times a day, finer grid)
3. App reads live files; real stale and error states; remove mock-up controls
4. Disclaimer, attribution page, cross-browser checks, hosting

## Not an official warning
Qellon shows data as published by weather agencies and does not make its own forecasts. Follow your national agency for warnings.
