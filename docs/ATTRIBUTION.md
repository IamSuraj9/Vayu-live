# Data sources and credits

Qellon is an educational project. It is not an official warning service. For warnings, follow your national weather agency
(IMD in India, NHC in the Americas, JMA and JTWC in the western Pacific).

| What | Source | Terms / note |
|---|---|---|
| Active storm positions, tracks, forecasts (Atlantic, Eastern and Central Pacific) | [NHC](https://www.nhc.noaa.gov/) (US National Hurricane Center) | US government data, public |
| Active storm tracks and forecasts (Western Pacific, Indian Ocean, Southern Hemisphere) | JTWC data as published by [CIRA/RAMMB TC Real-Time](https://rammb-data.cira.colostate.edu/tc_realtime/) | **Terms not stated. Permission to be requested before launch** |
| Global alerts, people in the wind zone | [GDACS](https://www.gdacs.org/) (EU copyright, syndication allowed with acknowledgement) | Source must be acknowledged |
| Past storm tracks (replays) | [IBTrACS v04r01](https://www.ncei.noaa.gov/products/international-best-track-archive) (NOAA NCEI) | Public |
| Wind, temperature, pressure grids | GFS model, NOAA/NCEP, via [NOMADS](https://nomads.ncep.noaa.gov/) | US government data, public |
| Coastlines and borders | [Natural Earth](https://www.naturalearthdata.com/) via `world-atlas` | Public domain |

## Libraries
React, Vite, Tailwind CSS, [shadcn/ui](https://ui.shadcn.com/) (Radix UI), Lucide icons, d3-geo, topojson-client, cmdk.
Typefaces: Geist and Geist Mono (SIL Open Font License).
The wind-map look is inspired by [earth.nullschool.net](https://earth.nullschool.net/) (MIT, by Cameron Beccario).
No code was copied from it; the renderer here is original.
