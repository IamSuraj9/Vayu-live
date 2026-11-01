# Naming

**Decision (1 Nov 2026, IST): the product is called Vayu.** Vayu is the Vedic god of wind and the Sanskrit word for
air. The earlier working name, Qellon, came from the first repository name the owner typed, not from the science of storms.

## What was renamed, and what was left on purpose
- **Renamed:** the wordmark and hidden page heading, the page title, the "Vayu shows it as issued" sentence in the
  storm panel, `README.md`, the `app/package.json` name, and the internal CSS ids and classes (`vayu-lens`,
  `vayu-ping`, `vayu-spin-*`, `vayu-whirl-*`, `vayu-ring`).
- **Saved-settings keys:** renamed too, from `qellon.*` to `vayu.units.v1`, `vayu.layers.v2`, `vayu.look.v1` and
  `vayu.hint.v1`. It costs nothing, because a browser keeps these per address and the move to `vayu-live.pages.dev` already
  starts every tester from the defaults. Do not rename them again later without a reason: that resets saved choices.
- **Site address:** `vayu-live.pages.dev` (chosen 1 Nov 2026, IST). `storm-globe.pages.dev` redirects to it once this is
  merged, see `docs/DEPLOY.md`. A custom domain was considered and left for later: the free `pages.dev` address is enough
  for testing, and the owner found `wayu.site` expensive at GoDaddy (it also would not have matched the name).
- **Repository:** renamed from `Qellon-Visualizer` to `Vayu-live` by the owner on 1 Nov 2026 (IST). The timer Worker
  (`trigger/worker.js`) and the User-Agent link in `pipeline/fetch.py` use the new name; the Worker must be pasted into
  Cloudflare by hand, see `docs/TIMER.md`.
- **Not renamed:** the three research notes in `docs/research/`, which are history written under the old name.

## Why Vayu (web search on 1 Nov 2026, IST; trademarks and social handles are **not** checked)
- Easy to say (VAH-yoo), short, and the meaning fits an Indian-made wind and storm app.
- **Crowded in weather, with no big product:** VayuMet (a weather site), VayuDrishti (air quality), a hackathon app
  called "Vayu" for disaster alerts, and an Android weather app under the package `com.vayu.weather`. Cyclone Vayu
  (June 2019, near Gujarat) is a named storm, so a search for "Vayu cyclone" returns news about it.
- **Closest clash:** Vāyuh Inc. (vayuh.ai, Oakland, California) sells AI storm and wind risk models to insurers and
  sounds the same. Nothing found says it holds a trademark, but trademarks were not searched (see Next steps).
- `vayu.pages.dev` is **taken** by an unrelated spam page, so the address is `vayu-live.pages.dev`.

## Other candidates that were considered
Every name comes from the words and science of storms. Searched on 29 Oct and 1 Nov 2026.

| Name | Where it comes from | Notes |
|---|---|---|
| **Hurakan** | Maya storm god, origin of the word *hurricane* | Easy to say. No weather product found. Second choice |
| **Rudra** | Vedic storm god, "the howler" | Strong roots, very common name, so crowded in search |
| **Oya** | Yoruba goddess of storms and winds | Very short, hard to find in search |
| **Kyklos** | Greek for "circle, coil", the root of *cyclone* | Clear in weather. Owner found it a bit strange |
| **Coriolis** | The force from Earth's spin that makes storms rotate | Easy to say. Generic, so hard to be found |
| **Taifu**, **Typhon**, **Aeolus** | Japanese "great wind"; Greek monster; Greek keeper of winds | Not chosen |
| Gyre, Eyewall | | **Taken** by weather or ocean apps |
| Vortix, Njord, Stribog, Fujin | | **Taken** or confusing (a weather radar app, a sailing app, a weather-station program, a town in China) |

## Still to do
- Search Instagram, X and YouTube for the name, and check trademarks. Only the web has been searched.
- Addresses on `.pages.dev` (checked 29 Oct 2026): the plain names (`kyklos`, `taifu`, `coriolis`, `typhon`, `aeolus`,
  `gyre`, `tufan`, `eyewall`) are **taken** by other people, and so is `vayu` (checked 1 Nov 2026). A name with a suffix
  was free on 29 Oct, for example `kyklos-live.pages.dev`. A clean address needs a paid domain, which is not wanted for now.
  `vayu-live` and `vayu-globe` were free on 1 Nov 2026.

## Next steps
1. **Timer:** paste the updated `trigger/worker.js` into the Cloudflare Worker, then check the next tick (`docs/TIMER.md`).
2. **After the testers have moved** (a few weeks): delete the old `storm-globe` project in Cloudflare and remove the
   redirect step from `.github/workflows/deploy.yml`.
3. **Before a wider launch:** search the trademark registers for "Vayu" and "Vayuh" (Vāyuh Inc., a US storm-risk
   company, sounds the same), and consider a custom domain once the name is final.
4. Tell the testers the final link, and that their saved units and look reset once because the address changed.
