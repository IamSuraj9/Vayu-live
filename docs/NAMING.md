# Naming

**Decision (1 Nov 2026, IST): the product is called Vayu.** Vayu is the Vedic god of wind and the Sanskrit word for
air. The earlier working name, Qellon, came from the first repository name the owner typed, not from the science of storms.

## What was renamed, and what was left on purpose
- **Renamed:** the wordmark and hidden page heading, the page title, the "Vayu shows it as issued" sentence in the
  storm panel, `README.md`, the `app/package.json` name, and the internal CSS ids and classes (`vayu-lens`,
  `vayu-ping`, `vayu-spin-*`, `vayu-whirl-*`, `vayu-ring`).
- **Left alone:** the saved-settings keys `qellon.units.v1`, `qellon.layers.v2`, `qellon.look.v1` and
  `qellon.hint.v1`. Renaming them would reset every tester's units, layers and chosen look. They are never shown.
- **Not renamed yet:** the GitHub repository (`Qellon-Visualizer`), the Cloudflare project and address
  (`storm-globe.pages.dev`), the User-Agent link in `pipeline/fetch.py`, the timer's repository name in
  `trigger/worker.js`, and the three research notes in `docs/research/`, which are history written under the old name.
  The steps for the address and the repository are below.

## Why Vayu (web search on 1 Nov 2026, IST; trademarks and social handles are **not** checked)
- Easy to say (VAH-yoo), short, and the meaning fits an Indian-made wind and storm app.
- **Crowded in weather, with no big product:** VayuMet (a weather site), VayuDrishti (air quality), a hackathon app
  called "Vayu" for disaster alerts, and an Android weather app under the package `com.vayu.weather`. Cyclone Vayu
  (June 2019, near Gujarat) is a named storm, so a search for "Vayu cyclone" returns news about it.
- `vayu.pages.dev` is **taken**. A suffixed address is needed, for example `vayu-live.pages.dev` (not yet confirmed free).

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

## Next steps: address and repository (about 10 minutes, ask Claude to do it)
1. **Repository (optional):** rename it under Settings on GitHub. Old links redirect. Then update `REPO` in
   `trigger/worker.js` and its test, the User-Agent link in `pipeline/fetch.py`, and the repository name in
   `docs/TIMER.md`. The timer's token is limited to this repository, so check that it still works after the rename.
2. **Site address:** add the repository variable `CF_PAGES_PROJECT` (Settings, Secrets and variables, Actions,
   Variables) with the new project name, for example `vayu-live`, and run **Deploy site**. Cloudflare creates the new
   project. See `docs/DEPLOY.md`.
3. **Keep old links alive:** the testers' links point at the current address, `storm-globe.pages.dev`. After the new
   site is up, publish a small "We have moved" page at the old address that redirects to the new one, and keep it for a
   few weeks. Delete the old project only after that.
4. Tell the testers the final link.
