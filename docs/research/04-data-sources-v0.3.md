# Data sources v0.3: replacing CIRA with free public feeds

Decided 29 Oct 2026. Condition from the project owner: every source must be free, public, and need no payment.

## Why CIRA was dropped
- CIRA/RAMMB's TC Real-Time pages state no terms of use. Their disclaimer covers warranty and indemnity only and says
  nothing about copying or republishing. Reading them meant scraping HTML that could change without notice.
- CIRA's numbers are JTWC's numbers. The same data is available from sources with clear terms.

## Accuracy check (29 Oct 2026)
| Comparison | Result |
|---|---|
| CIRA vs IBTrACS for Arnab, 5 shared times on 26-27 Oct | Positions identical, winds within 1 kt |
| CIRA vs NOAA tcvitals for In-fa at 00Z | Identical: 15.9 N 154.6 E, 115 kt |
| CIRA vs GDACS forecast lines for In-fa | All 7 forecast positions identical |
| GDACS timeline vs CIRA for In-fa | Same winds at every shared time (60 kt on 25 Oct 06Z, 115 kt at 29 Oct 00Z, 100 kt at +120 h) |

All of these trace back to JTWC (or NHC), so they agree with each other. They differ from regional agencies because of how
wind is averaged: JMA gave In-fa 90 kt (10-minute average) when JTWC gave 115 kt (1-minute). IMD uses a 3-minute average.

## Sources now used
| Source | Gives | Covers | Terms | Notes |
|---|---|---|---|---|
| NOAA/NCEP tcvitals (`gfs.tHHz.syndata.tcvitals.tm00` on NOMADS) | Newest position, motion, pressure, peak wind | All oceans (JTWC and NHC storms) | US government, public | Every 6 h. Listed Arnab (02B) at 06Z on 29 Oct after GDACS had stopped updating it |
| NHC `CurrentStorms.json` + ATCF b-deck and fst | Official track and forecast | Atlantic, Eastern and Central Pacific | US government, public | Authority for those basins |
| GDACS RSS + episode data + timeline export | Past track with winds, forecast track, wind radii, people affected | Worldwide | Reuse allowed with acknowledgement | The API timed out on some calls on 29 Oct; the pipeline retries and keeps the last good data |
| IBTrACS | Historical tracks | Worldwide | US government, public | Replays only (about 2 days behind) |
| GFS model via the NOMADS grib filter (`filter_gfs_0p50.pl`, f000) | 10 m wind, 2 m temperature, sea-level pressure at 0.5° | Worldwide | US government, public | `pipeline/wind.py`; every 6 h, about 3.5 h after the run |

Looked at, not used now:
- **JMA JSON** (`www.jma.go.jp/bosai/typhoon/data/...`): official western Pacific analysis and forecast with 10-minute winds.
  Free; JMA asks for credit. A good optional addition for typhoons.
- **UCAR TCGP repository**: historical decks up to 2025; no 2026 real-time forecast files found.
- **JTWC website**: blocked (HTTP 403) from the build environment.
- **IMD**: no machine-readable feed found.

## How the pipeline combines them (`pipeline/storms.py`)
1. NHC storms come first and stay authoritative for their basins. GDACS only adds the people estimate.
2. Other storms come from GDACS (track, forecast, people).
3. tcvitals adds a newer position when it has one, or creates the storm if GDACS has not listed it yet.
4. The previous run's file keeps older history and stands in, marked `stale`, for any source that fails.
5. Forecast hours are re-counted from the newest position; points already in the past are dropped; forecasts older
   than 24 h are not shown. Storms with no report for 36 h are removed; after 12 h they are marked `ended`.

The refresh runs every 3 hours in GitHub Actions (`.github/workflows/refresh-storms.yml`) and commits
`app/public/data/storms.json`.

## How the app uses the files (day 2)
- `data/storms.json` is loaded when the page opens, every 10 minutes, and when the tab comes back into view. The copy
  from the last build is built into the app and used if the file can't be loaded.
- A banner shows when the file can't be reached, or when it is more than 6 hours old (two missed pipeline runs).
- Storms with no report for 12 hours show as "Ended" (or "Not updated" when the whole file is old); after 36 hours they
  are hidden, the same rule as the pipeline. A storm whose source failed is shown as "Not updated".
- `data/wind.json` (0.5°, signed bytes, about 1.4 MB, 400 KB gzipped) replaces the built-in 1° field when present.
