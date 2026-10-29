# Data sources and credits

This is an educational project. It is not an official warning service. For warnings, follow your national weather agency
(IMD in India, NHC in the Americas, JMA in the western Pacific, and the other agencies linked on each storm).

Every source below is free, public, and needs no account or key. "Credit" means a visible line naming the source.

| What | Source | Terms |
|---|---|---|
| Newest position, pressure and wind of every storm (all oceans) | [NOAA/NCEP tcvitals](https://nomads.ncep.noaa.gov/) | US government data, public |
| Official tracks and forecasts for the Atlantic, Eastern and Central Pacific | [US National Hurricane Center](https://www.nhc.noaa.gov/) | US government data, public |
| Past track, forecast track and people affected, worldwide (JTWC data for most oceans) | [GDACS](https://www.gdacs.org/) (European Commission Joint Research Centre, UN OCHA) | Reuse allowed when the source is acknowledged |
| Past storm tracks for replays | [IBTrACS v04r01](https://www.ncei.noaa.gov/products/international-best-track-archive) (NOAA NCEI) | US government data, public |
| Wind, temperature and pressure grids | GFS model, NOAA/NCEP, via [NOMADS](https://nomads.ncep.noaa.gov/) | US government data, public |
| Coastlines and borders | [Natural Earth](https://www.naturalearthdata.com/) via `world-atlas` | Public domain |

Credit line shown in the app:
> Storm data: NOAA/NCEP tcvitals, US National Hurricane Center, GDACS (European Commission JRC, UN OCHA). Wind map: GFS model, NOAA. Replays: NOAA IBTrACS.

CIRA/RAMMB (Colorado State University) was used during research only. It is no longer a source: its terms are not
stated, and the sources above give the same JTWC numbers with clear terms. See `docs/research/04-data-sources-v0.3.md`.

## Libraries
React, Vite, Tailwind CSS, [shadcn/ui](https://ui.shadcn.com/) (Radix UI), Lucide icons, d3-geo, topojson-client, cmdk.
Typefaces: Geist and Geist Mono (SIL Open Font License).
The wind-map look is inspired by [earth.nullschool.net](https://earth.nullschool.net/) (MIT, by Cameron Beccario).
No code was copied from it; the renderer here is original.
