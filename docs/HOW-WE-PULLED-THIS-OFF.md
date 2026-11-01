# How We Pulled This Off

The full story and the specification of **Vayu**, the storm globe (its working name was **Qellon**, until 1 Nov 2026): what
we studied, what we built, how it is hosted on Cloudflare, how GitHub and the tokens fit together, and exactly how every
part behaves.

Written 31 Oct 2026, after the Customize release (pull request 2), and updated on 1 Nov 2026 (IST) for the new name and
the new address (pull request 3). All times are in IST (UTC+5:30) unless a line says UTC. No secret values appear anywhere in this file, only their names and where they live.

**How to read it.** Part 1 is the story in plain language. Part 2 is how the pieces connect. Part 3 is the specification
(what the system must do and how it does it today). Part 4 is how to run and fix it. Part 5 is what is still open.
A glossary at the end explains the jargon.

---

## Part 1. The story

### 1.1 What we set out to build

A storm globe for everyone: every active cyclone, hurricane, typhoon and depression in the world, with its name, its
strength in plain words, its wind speed, which way it is moving and how fast, where it has been and where the agencies
say it is going, all on top of a moving wind map. It is educational, web only, free to run, and it is not a warning
service. You asked for these hard rules, and they shaped everything:

- Every data source must be free and public. No payments, no accounts, no keys for data.
- No custom domain for now (one was considered on 1 Nov and left for later, see 1.5). The name was a placeholder,
  Qellon, and became Vayu on 1 Nov.
- Black background, Geist and Geist Mono type, liquid glass look, Apple-style motion.
- Keep it simple. Do not overwhelm the user.
- Private repository, MIT licence, Suraj Kumar as owner.
- New design iterations go in new files and new links, so nothing you liked is lost.

### 1.2 How we "reverse-engineered" the earlier apps

We did **not** decompile, copy or scrape anyone's code, images or design. "Reverse-engineering" here means studying
what the existing products show and how they get their data, then building our own. It had four layers.

**Layer 1: What do the existing products show? (27 to 28 Oct)**
We opened the public pages and used your screenshots to compare them side by side (notes in
`docs/research/01-research.md` and `02-product-plan-v0.1.md`).

| Product | What we learned | What we took from it |
|---|---|---|
| Zoom Earth (storm card) | Storm name, a coloured strength badge, a 6-hourly table, a track coloured by strength, a cone, a play bar. It feels technical: unexplained type codes, hPa, "UTC+5.5", a dense table | The idea of a storm card with a timeline and colour by strength. We removed the jargon and the table |
| earth.nullschool.net | A 3D globe with animated wind particles and a click readout. No storm name, track, category or forecast | The idea of flowing wind on a globe, and a point readout. Its author published the approach as open source (MIT). We wrote our own renderer and copied no code |
| RainViewer storm tracker | Uses the full IMD (Indian) scale, shows a cone, lets you tap a point | Showed us the Indian terms and that a tap readout is expected |
| TC Viewer, TC-ATLAS | Wind radii, historical tracks, research use | The wind-radii idea (kept for later) and the point that archives are for replay, not for "now" |
| IMD (India), JMA, NHC, JTWC | The official agencies. Each averages wind over a different time (1, 3 or 10 minutes) | The rule: show the source, the averaging period and the time next to every number |

The gap we found: no single site joins "this is a storm, here is its name and what it means" with "watch the air move
around it" in plain language. That became the product.

**Layer 2: Where does their data come from? (28 to 29 Oct, the "Phase 0 data spike")**
Every storm app is a skin over a few public data feeds. We tested the feeds directly from the build environment and
saved the raw answers as test fixtures in `data/fixtures/2026-10-29/` (details in
`docs/research/03-phase0-data-spike-and-plan-v0.2.md`).

| Source | What we found |
|---|---|
| NHC (US National Hurricane Center) | Clean JSON (`CurrentStorms.json`) plus open ATCF files with official forecasts. Atlantic, Eastern and Central Pacific only |
| GDACS (EU and UN alert system) | The worldwide list with people affected, plus past track and forecast. Its API timed out on some calls, so we retry and cache |
| NRL and JTWC websites | Not usable. One was a stub, the other blocked our requests with HTTP 403 |
| CIRA / RAMMB (Colorado State) | The best data at first (every ocean, past track plus forecast table) but only as an HTML page with no stated terms |
| IBTrACS (NOAA) | The full historical archive. Right for replays, about two days behind for "now" |
| NOAA/NCEP tcvitals | The newest position of every storm worldwide, every 6 hours. A small text file on NOAA's public server |
| GFS model (NOAA) | The wind, temperature and pressure grids that drive the wind map |

**Layer 3: Can we trust it? (29 Oct, the accuracy check)**
We cross-checked sources against each other (`docs/research/04-data-sources-v0.3.md`). For Arnab and In-fa, CIRA,
IBTrACS, tcvitals and GDACS agreed to the position and to within 1 knot, because they all come from JTWC. They
differ from India's IMD and Japan's JMA only because each agency averages wind over a different time. Zoom Earth's
"very severe" at 165 km/h against IMD's 115 to 125 km/h is the same story.

The decision this produced: **CIRA was dropped.** Its terms are not stated and reading it means scraping HTML that can
change without notice. The same numbers are available from sources with clear terms (tcvitals, NHC, GDACS,
IBTrACS), so we used those. This also met your "free and public" rule.

**Layer 4: Why do the looks look the way they do? (29 Oct, the Style Lab)**
For the globe styles you asked to see, we did a short literature check and built eight looks (Heat, Ink, Night, Dots,
Chart, Relief, Bands, Ribbons) with one drawing engine. The sources:
streamlines read more accurately than classic barbs (Ware et al., *Bulletin of the American Meteorological Society*,
2014); weather charts draw isobars every 4 hPa with H and L marks (NOAA JetStream); a barb's staff points to where the
wind comes from (NWS Honolulu); rainbow scales mislead, so a well-designed one is used (Google's Turbo colour map,
Ware 2023). Heat is the familiar wind-speed colour map you already had.

### 1.3 The build, step by step

| When | What | Result |
|---|---|---|
| 27 Oct | Research on Cyclone Arnab and existing sites | `01-research.md` |
| 28 Oct | Product plan, feasibility ratings, phases | `02-product-plan-v0.1.md` |
| 29 Oct | Phase 0 data spike, then the accuracy check | `03-...`, `04-...`, fixtures |
| 29 Oct, day 1 | The data pipeline in Python with tests on the saved fixtures | `pipeline/` |
| 29 Oct, day 2 | The live app: reads the file, real stale and error states, About and credits, 0.5° wind | React app |
| 29 Oct, day 3 | Hosting on Cloudflare Pages, deploy workflow, screen-size and keyboard checks | `deploy.yml` |
| 29 Oct | Actions updated to v7, wording around "real data, official alerts", UI stress test, performance pass | merged to main |
| 29 Oct | The stale-data banner appeared. GitHub's own timer had skipped every scheduled run | Cloudflare timer, time budgets, freshness guard |
| 29 Oct | Style Lab: eight looks in one renderer | `claude/style-lab` (the lab itself is not merged) |
| 31 Oct | Customize release: live looks in the app, new layout, zoom pill, phone controls, spiral storm marker | pull request 2 |
| 1 Nov | The name: Qellon becomes Vayu, the site moves to `vayu-live.pages.dev`, the old address redirects | pull request 3 |

### 1.4 What went wrong, and what it taught us

We list these because they explain why some parts of the system look cautious.

1. **We said "it refreshes itself every 3 hours" before testing it.** GitHub's scheduler skipped every scheduled run.
   Lesson: never claim a schedule works until you see it fire. The fix is a Cloudflare timer (section 2.4).
2. **Fuzzing found crashes.** About 7% of runs on deliberately damaged agency responses crashed the pipeline (wrong
   shapes, broken XML headers, "nan" and "inf" numbers, a damaged previous file). Every source now runs inside a safety
   net and every point is checked before it is written. About 16,000 fuzz runs now give no crashes.
3. **The first timer Worker had no retry, no timeout and did not trim the token.** A pasted secret often ends in a
   newline. It was hardened and has 12 tests.
4. **Stray build files were committed twice** (a 1.3 MB lab build and scratch files). We rebuilt the branches clean and
   added the folders to `.gitignore`.
5. **The freshness label showed the age of the newest storm report** ("6 h ago"), which looks stale even when the
   data is fresh, because agencies publish every 6 hours and each report arrives 2 to 3 hours late. It now says
   "Checked 12 min ago", counted from the app's own last successful load.
6. **We tried to keep wind lines on screen while dragging the globe.** It turned a typhoon's spiral into long straight
   rays and looked jumpy. We reverted to fading the lines while the globe moves, which is how it worked before.
7. **A preview showed "storm data is 6 hours old".** A preview carries the storm data from when its branch was
   created, and nothing refreshes it. It was not a fault in the live site.

### 1.5 How the product got its name (1 Nov 2026)

**Where Qellon came from.** Nobody chose it as a product name. It was the repository name you typed in your first
message on 27 Oct ("a different GitHub repo named Qellon Visualizer"), and it stayed as the working name. You did not like
it, so `docs/NAMING.md` kept a list of storm-science names for after testing.

**What we did on 1 Nov.** We searched the web for each candidate and for its address on `pages.dev`. A name is free there
when it has no DNS record (we calibrated that on a made-up name and on our own site). Names from many mythologies and
from storm science were checked. These are the results that mattered:
- **Dropped because already used:** Gyre (an ocean app launched days earlier), Eyewall (three weather apps), Vortix (a
  weather radar app with hurricane tracking), Njord (sailing and ship software), Stribog, Fujin (a Chinese town that fills
  the search results with forecasts), Wayu (villages in Kenya and Ethiopia with forecast pages, the Wayuu people, a
  wind-energy company), Vayuh (see below).
- **Clear in weather but not chosen:** Kyklos (Greek for circle, the root of cyclone, but you found it strange), Coriolis,
  Hurakan (the Maya storm god, the root of "hurricane"), Rudra and Oya.
- **Chosen: Vayu**, the Vedic god of wind and the Sanskrit word for air (वायु). Short, easy to say, and it fits an Indian
  wind and storm app.

**The risk we accepted.** Vayu is crowded in weather: VayuMet, VayuDrishti, a hackathon app, an Android weather app, and
the 2019 Cyclone Vayu. Closest of all is **Vāyuh Inc.** (vayuh.ai, Oakland, California), a venture-backed company selling
AI storm and wind risk models to insurers, which sounds the same. Nothing found says it holds a trademark, but
**trademarks were not searched**. We chose to keep the name for testing and search before any wider launch.

**The address.** `vayu.pages.dev` is held by an unrelated spam page. We chose `vayu-live.pages.dev` over `vayu-globe` and
`vayu-atlas`. A custom domain was considered (the owner found `wayu.site` expensive at GoDaddy, and it would not have
matched the name `Vayu`), and the owner's rule of free hosting won for now. We also decided not to put `vayuh` in any
address, so the site never looks like Vāyuh Inc.

**What changed in the product (pull request 3).** The wordmark, page title, hidden heading, one sentence in the storm
panel, the README, the package name and the internal CSS names say Vayu. The saved-settings keys keep their `qellon.*`
names on purpose. The deploy workflow now publishes to the `vayu-live` project by default, and a last step publishes a
permanent redirect on the old `storm-globe` project. A browser keeps saved settings per address, so testers start from
the defaults once on the new address.

**Not built:** a Devanagari wordmark ("Vayu · वायु") was mocked up in three layouts and left for you to decide.

---

## Part 2. How the pieces connect

### 2.1 The whole system on one page

```
  Public data (free)                    GitHub (private repo)                      Cloudflare (free plan)
  ------------------                    ---------------------                      ----------------------
  NOAA tcvitals  \                                                              +--------------------+
  NHC            |   every 3 h   +---------------------------+                  | Worker             |
  GDACS          +-------------> | Refresh storm data        | <--- starts ---- | storm-refresh-timer|
  (retries,      |               | (GitHub Action, Python)   |   (HTTP request  | cron 20 */3 * * *  |
   time budgets) /               | writes storms.json,       |    with a token) | UTC                |
                                 | commits to main           |                  +--------------------+
  GFS model (NOAA) --- at -----> +-------------+-------------+
  every deploy                                 | when it finishes
                                               v
                                 +---------------------------+   wrangler       +--------------------+
                                 | Deploy site (GitHub       | ---------------> | Pages project      |
                                 | Action): builds wind.json,| (API token       | vayu-live          |
                                 | builds the React app      |  + account ID)   | (free plan)        |
                                 +---------------------------+                  | .pages.dev         |
                                               ^                                +---------+----------+
        push to main / manual run on a branch  |                                          |
        (a branch gets a preview address)      |                                          v
                                                                              Visitors' browsers:
                                                                              static files only,
                                                                              polling storms.json
                                                                              every 10 minutes
```

The key design choice: **there is no server of ours.** The data job writes plain JSON files, the site is static
files on Cloudflare, and the browser does all the drawing. That is why it is free, fast and hard to break.

### 2.2 The data pipeline (Python, `pipeline/`)

Runs inside GitHub Actions. Uses only Python's standard library, except the wind step, which needs `eccodes` and
`numpy` to read GRIB (weather-model) files.

1. **Fetch** from three storm sources, each with a time budget (NHC 40 s, GDACS 80 s, tcvitals 50 s). A source that is
   slow or broken fails on its own and the previous run's data stands in, marked `stale`.
2. **Combine** by authority: NHC first for its basins, then GDACS, then tcvitals for the newest position.
3. **Check** every point (finite numbers, plausible position and wind) and remove anything that is not.
4. **Write** `app/public/data/storms.json` safely (write to a temporary file, then replace it) and refuse NaN.
5. **Commit** with the message `data: refresh storms <time>`. The deploy then runs.

A separate step, `pipeline/wind.py`, downloads the newest GFS run through NOAA's filter service (only four fields:
10 m wind, 2 m temperature, sea-level pressure) and writes `wind.json` (0.5°) and `wind-1.json` (1°). These are built
at deploy time and are not committed, because they are 1.4 MB and 340 KB.

### 2.3 Hosting on Cloudflare Pages

Cloudflare Pages serves the built website from its worldwide network. We use **direct upload**: GitHub Actions builds
the site and pushes the finished files with Cloudflare's command line tool, `wrangler`. Cloudflare never reads our code
and does no building.

How it works:
1. **One-time setup (you did this):** a free Cloudflare account, an API token with the single permission Account,
   Cloudflare Pages, Edit, and your account ID. The Pages project `vayu-live` (first `storm-globe`, until 1 Nov) is created
   automatically by the first deploy.
2. **Storing the credentials:** the token and the ID are saved as two GitHub repository secrets
   (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`). GitHub hides them in logs.
3. **Each deploy** (`.github/workflows/deploy.yml`): check out the code, build the wind files from the newest GFS run
   (if that download fails, reuse the wind files already on the live site, and if that fails too the app uses a
   built-in 1° field), run `npm ci` and `npm run build`, then `wrangler pages deploy app/dist`.
4. **Production vs preview:** the branch name decides. Deploying `main` replaces the live site at
   `https://vayu-live.pages.dev`. Deploying any other branch publishes a copy at
   `https://<branch-with-dashes>.vayu-live.pages.dev` and leaves the live site alone. This is how every preview in
   this project worked, for example `claude-rename-vayu.vayu-live.pages.dev` (before 1 Nov the same previews lived under
   `storm-globe`).
5. **Caching rules** (`app/public/_headers`): `/data/*` is `no-cache`, so a browser always asks "is there a newer
   copy?" (a cheap check). `/assets/*` has content-hashed file names, so it is cached for a year as `immutable`.
   `X-Content-Type-Options: nosniff` and a strict referrer policy apply everywhere.
6. **Free-plan fit** (limits checked 29 Oct 2026): about 250 publishes a month, 3 data files against a 20,000 file
   limit, and a largest file of about 2 MB against 25 MiB.
7. **Address:** `.pages.dev` only, no paid domain. A plain name is usually taken, a name with a suffix is free.
   The project name is the repository variable `CF_PAGES_PROJECT`, and if it is not set the workflow uses `vayu-live`.
8. **The old address.** `storm-globe.pages.dev` was the first address testers received. The last step of `deploy.yml`
   publishes a file with one rule (`/* https://vayu-live.pages.dev/:splat 301`) on that old project, so every old link
   goes to the same path on the new address. It runs on pushes and manual runs, not after refreshes, and a failure there
   never fails the real deploy. From a branch it redirects to the same branch preview of the new project, which is how
   we tested it before the merge, and then again from `main` after the merge. Keep the old project for a few weeks,
   then delete it and remove that step.

### 2.4 The Cloudflare timer (why a second Cloudflare piece exists)

GitHub's built-in timer is "best effort". On 29 Oct it fired zero times, and the site showed "Storm data is 6 hours
old". So a tiny **Cloudflare Worker** (`trigger/worker.js`, named `storm-refresh-timer`) is the dependable trigger:

- A **Cron Trigger** (`20 */3 * * *`, in UTC) wakes it every 3 hours. In IST that is 05:50, 08:50, 11:50, 14:50,
  17:50, 20:50, 23:50 and 02:50.
- It sends one HTTPS request to GitHub's API asking to start the "Refresh storm data" workflow, with
  `{"ref":"main","inputs":{"reason":"timer"}}`.
- If GitHub is busy it retries up to 3 times (on 5xx, 429, rate limits, network errors and a 15 second timeout). It fails
  at once on settings problems (bad token, wrong repository) so the logs show the real reason.
- GitHub's own schedule (`17 */3 * * *`) stays on as a backup. A run that starts when the data is under 100 minutes old
  stops after a few seconds, so having two triggers costs almost nothing.
- The Worker has **no data and no logic** beyond that request. The refresh itself still runs in GitHub Actions. We
  checked that this approach fits the free Workers limits (10 ms of processor time per run, 100,000 requests a day).
  A Worker that fetched the data itself is possible later but would need a test against the 10 ms limit.

### 2.5 GitHub, tokens and secrets: who holds what

There are **four different credentials** and they are easy to mix up. Each has one job.

| # | Credential | Lives where | Who uses it | What it can do | How to rotate or revoke |
|---|---|---|---|---|---|
| 1 | **Claude's GitHub access** (the GitHub app connection of this coding session) | Managed by the session, scoped to the repository `IamSuraj9/Vayu-live` (`Qellon-Visualizer` until 1 Nov 2026) | Claude, to read code, push branches named `claude/...`, open and merge pull requests, start workflows | Only that repository. Claude never sees a token value | Disconnect GitHub in your Claude settings, or uninstall the Claude GitHub app on GitHub |
| 2 | **`GITHUB_TOKEN`** (automatic, made fresh for each Actions run) | Created by GitHub inside each run, never stored | The workflows. `refresh-storms.yml` has `contents: write` so it can commit the data file. `deploy.yml` has `contents: read` | One repository, only while that run lasts | Nothing to rotate. Permissions are set in the workflow file |
| 3 | **`CLOUDFLARE_API_TOKEN`** plus **`CLOUDFLARE_ACCOUNT_ID`** | Repository secrets: GitHub, Settings, Secrets and variables, Actions | `deploy.yml`, through wrangler | Edit Cloudflare Pages in your account, nothing else (no DNS, no billing, no Workers) | Cloudflare, My Profile, API Tokens, roll or delete. Then update the secret |
| 4 | **Fine-grained personal access token** `storm-refresh-timer`, saved as the Worker secret **`GITHUB_TOKEN`** (same name as #2, different thing) | A secret on the Cloudflare Worker | The Worker, to start the refresh | **Actions: read and write on this one repository only.** It cannot read code or change files. Expires after one year (created around 29 Oct 2026, so set a reminder for the autumn of 2027) | GitHub, Settings, Developer settings, Personal access tokens. Make a new one and replace the Worker secret |

Rules we followed:
- **Least privilege.** Each token does one job on one resource.
- **Never paste a token into chat.** You shared screenshots of the Cloudflare permission pages so we could check the
  scopes by sight (they show permissions, not the secret). The token text itself was typed only into Cloudflare's and
  GitHub's secret boxes.
- **Secrets are write-only.** After saving, neither GitHub nor Cloudflare shows the value again.
- **Missing secrets fail gently.** Without the Cloudflare secrets the deploy builds and checks the site, then stops
  before publishing and still shows green.
- **If a token leaks:** revoke it at its source first, then create a new one. A leaked token #4 could start refreshes
  but nothing worse. A leaked #3 could change the Pages site, so revoke it quickly.

### 2.6 How changes reach the live site (the workflow we used)

1. Claude works on a branch named `claude/<topic>` created from `main`. Nothing goes straight to `main`.
2. To look at a change, run **Deploy site** on that branch. It publishes a preview address (section 2.3).
3. When you say "merge", Claude opens a pull request. The **Checks** workflow runs three jobs: the pipeline tests, the
   timer tests, and the app build. When all three pass, the pull request is squash-merged.
4. A push to `main` starts **Deploy site**, which publishes the live site within a few minutes.
5. Every 3 hours the timer starts **Refresh storm data**, which commits new data to `main`, which starts a deploy.

Free-plan budget: private repositories get about 2,000 Actions minutes a month. A refresh that finds fresh data costs
about 10 to 20 seconds. A real refresh plus a deploy costs about 2 to 4 minutes, 8 times a day.

---

## Part 3. Specification

### 3.1 Scope

**In scope:** web only; live storm list worldwide; storm detail; a point-anywhere readout; unit switch; animated wind
and colour layers; eight looks with a Customize card; replay of past storms; search; About and sources; phone and
desktop layouts; offline and stale-data states.

**Out of scope for now:** satellite loops, radar, district-level warnings, alerts, accounts, mobile app, any server of
our own, any paid service, a custom domain.

### 3.2 Principles

1. **Not a warning service.** Show the source, the time and a link to the official agency. Never make our own forecast.
2. **Plain language first.** One strength scale in words. Local terms (hurricane, typhoon, cyclone) where they apply.
3. **Show the source next to the number.** Each storm carries its agency and its wind averaging period.
4. **Never mix agencies silently.** Winds are stored in knots with their own averaging time and converted only for display.
5. **Degrade gracefully.** Every layer has a fallback and every failure has a visible state.
6. **Free to run.** Static files, free tiers only.
7. **Accessible.** Keyboard use, screen readers, reduced motion and phone-size targets are requirements.

### 3.3 Data specification

**`storms.json`** (written by the pipeline, about 5 KB now):

| Field | Meaning |
|---|---|
| `schema` | Always `1`. The app refuses any other value |
| `snapshot` | The model-cycle time the newest positions belong to |
| `fetchedAt` | When the pipeline ran. The app's stale-data banner uses this |
| `sources` | One entry per source: `ok`, counts, errors, and for tcvitals the cycle and URL. Shown in About |
| `credits` | The credit line |
| `storms[]` | The storms (below) |

Each storm: `id`, `name` (display), `rawName`, `kind` (e.g. typhoon, disturbance), `basin`, `status`
(`active` or `ended`), `stale` (a source failed, older data stands in), `updated`, `track[]` (`t`, `lat`, `lon`, `kt`,
`hpa`), `forecast[]` (`h` hours from the newest position, `lat`, `lon`, `kt`), `forecastIssued`, `forecastBase`, `source`,
`sourceUrl`, `authority` (JTWC, NHC...), `official[]` (links to the national agencies), `windAvg` (for example
`1-minute`), `people` (estimate from GDACS, labelled as a model estimate), `codes` (agency codes).

**Pipeline rules:**
- NHC storms stay authoritative for their basins. GDACS only adds the people estimate to them.
- tcvitals adds a newer position, or creates a storm GDACS has not listed yet. The same name within 1,500 km is the same storm.
- Forecast hours are re-counted from the newest position. Points already in the past are dropped. A forecast older than
  24 hours is not shown.
- A storm with no report for 12 hours is `ended`. With no report for 36 hours it is removed.
- Sanity: finite numbers only, plausible position and wind; a bad point is dropped, not the storm.

**`wind.json` and `wind-1.json`** (built at deploy time from GFS analysis f000):
- Four fields on a regular grid, north row first: `u` and `v` (10 m wind, m/s), `t` (2 m temperature, K), `p`
  (sea-level pressure, Pa).
- Stored as signed bytes in base64 to keep the file small: `value = byte / scale + offset`. Scales: u and v 2
  (0.5 m/s steps), t 1 with offset 260, p 0.01 with offset 100000 (1 hPa steps).
- 0.5° is about 1.4 MB (400 KB compressed), 1° is about 340 KB. The 1° file loads first so colours appear quickly, the
  sharp file follows (skipped on slow connections or when Data Saver is on).
- The app keeps a built-in 1° field (`gfs.json`, loaded only if both files fail).

**Other data in the app:** `pastStorms.json` (Fani 2019, Amphan 2020, Dana 2024, Phailin 2013 from IBTrACS, built by
`tools/build_past.py`), `cities.ts` (places for the readout), and the world map from Natural Earth through the
`world-atlas` package (coarse map shipped, detailed 1:50m fetched when needed).

### 3.4 Strength scale

One scale from 1-minute sustained wind in knots. The wording is a proposal for review, not an official standard.

| Level | Knots | Colour | Plain meaning |
|---|---|---|---|
| Depression | 0 to 27 | `#7fa6c8` | An organised area of low pressure. Showers and gusty winds |
| Deep depression | 28 to 33 | `#4fc1b6` | A stronger low that can grow into a storm. Heavy rain is likely |
| Storm | 34 to 63 | `#f1cf4a` | Damaging gusts, heavy rain, rough seas. Storms get a name here |
| Severe | 64 to 95 | `#f28b30` | Hurricane-force winds near the centre. Roofs, trees and power lines at risk |
| Extreme | 96 to 129 | `#e9475a` | Very destructive winds and a dangerous storm surge on the coast |
| Super | 130 and up | `#d36be0` | The strongest storms on Earth. Catastrophic damage near the centre |

The headline word depends on the basin: typhoon (Western Pacific), hurricane (Atlantic, Eastern and Central Pacific),
cyclone (everywhere else), for example "Extreme typhoon". The IMD scale (3-minute winds) is not applied to 1-minute
numbers, because that would overstate strength.

### 3.5 Units

Wind: km/h, mph, kt, m/s (from knots: x1.852, x1.15078, x1, x0.514444). Temperature: °C, °F. Pressure: hPa, inHg.
Distance: km, mi, nmi. Time: local or UTC. Defaults follow the browser language (US English gets mph, °F, inHg, mi).
Choices are saved on the device (`qellon.units.v*`). Layers are saved as `qellon.layers.v2`, the look as `qellon.look.v1`.
On a computer the units sit in the toolbar. On a phone they sit in Settings, behind the three-dot button.

### 3.6 App architecture

- **Stack:** React 19, Vite 6, Tailwind 4, shadcn/ui (Radix), Lucide icons, d3-geo (map maths), topojson-client,
  cmdk (search). Node 22 for builds. The build gives normal hashed files (`npm run build`); `npm run build:single` makes
  one self-contained file for previews.
- **Files:** `App.tsx` (state and layout), `globe/Globe.tsx` (drawing and gestures), `globe/camera.ts` (motion),
  `globe/field.ts` (wind field), `globe/overlay.ts` (colour layer), `globe/LookLayer.tsx` and `looks/` (the engine),
  `components/panels.tsx` and `components/looks.tsx` (interface), `lib/` (storms, units, strength, live polling).
- **Live data** (`lib/live.ts`): load `storms.json` on open, every 10 minutes and whenever the tab becomes visible;
  `wind.json` every 3 hours. If a load fails the last copy stays. The copy built into the app is used until the first
  load succeeds.
- **States:** a banner appears when the file cannot be reached ("Can't reach the storm data") or when `fetchedAt` is
  more than 6 hours old (two missed runs). A storm with no report for 12 hours shows as Ended, or Not updated when the
  whole file is old, and is hidden after 36 hours.
- **Freshness label:** "Checked just now" or "Checked 12 min ago" from the app's last successful load. Offline it
  reads "Saved copy, 5 h ago". About shows the file's build time.
- **Camera** (`camera.ts`): longitude, latitude and zoom kept outside React so motion never re-renders the panels. Moves
  use a critically damped spring (no bounce) with a 0.5 to 0.95 s settle. It keeps its speed when retargeted. A fling
  after a drag decays over about 0.42 s. Zoom is 0.7 to 14.
- **Gestures** (`Globe.tsx`): drag to turn, wheel or pinch to zoom, click or tap for the point readout, arrow keys to
  turn, + and − to zoom. On touch and pen, a double-tap zooms in 2x on the spot, and once fully zoomed in the next
  double-tap returns to the start view.

### 3.7 Drawing specification

**Heat (the default)** is drawn by the app's own layers: a wind-speed colour layer (rasterised per view, scaled on zoom
so it does not shimmer), a map canvas (coastlines, borders, grid), and animated wind particles. The particle count is
the screen area divided by 240, limited to 1,200 to 5,200. While the globe moves, the light map is used and the
particle trails are cleared and rebuilt after it stops.

**The other seven looks and any custom mix** are drawn by the look engine (`looks/engine/`), loaded only when needed:
- **Surface:** every pixel is worked out on the processor from the wind, pressure and temperature fields. A coarse
  version is drawn while the globe moves and a sharp one when it is still.
- **Marks:** streamlines, arrows, barbs, pressure lines (every 4 hPa) with H and L markers, flow dashes, shimmer.
- **Particles:** the same idea as Heat, with glow.
- **Not drawn by the engine:** storms. The app draws tracks and markers on top in every look so they stay clickable and
  follow replays.
- The engine reads the same live wind file as Heat (re-sampled to a 1° grid) and rebuilds its shapes when a new field
  arrives. While it loads (about 25 KB plus the 750 KB detailed map), Heat stays on screen.

**Look configuration** has eight fields: earth (void, slate, night, paper, dots), colour fill (none, wind, bands,
lows and highs, relief, temperature), palette (classic, turbo, ember, ice, ink, aurora, mono), wind (none, particles,
glow, streamlines, flow, arrows, barbs, shimmer), wind colour (plain, by speed), pressure lines (off, isobars,
isobars plus H and L), map lines (none, coast, borders, grid), storm marks (spiral, rings, eye).

| Look | One-line description |
|---|---|
| Heat | Wind speed as colour with white streaks |
| Ink | A paper globe with ink streamlines, vermilion where it blows hard |
| Night | A lit sphere with day and night sides, glowing particles. The shading follows the sun and the city lights are a sample, for the look only |
| Dots | Continents as dots, the wind as short strokes |
| Chart | A forecaster's map: slate globe, isobars, H and L, barbs |
| Relief | Pressure drawn as terrain |
| Bands | Six flat wind-speed bands with arrows |
| Ribbons | No fill, long luminous curves of wind |

Rules: Heat is the first-time default; only an exact Heat configuration uses the app's own renderer; any layer change
makes a "Custom mix" and shows a "Back to Heat" button; the Layers menu (moving wind, wind colours, storm paths, borders
and grid) still applies on top of any look (`effectiveCfg` in `looks/presets.ts`); a past-storm replay hides colours and
wind marks in every look.

**Storm marker:** two thin spiral arms around a white eye that turns slowly (counter-clockwise north of the equator,
clockwise south). A stronger storm draws a larger spiral (`radius = 9 + knots / 11`). Rings and Eye variants exist.
The marker colour is the strength colour.

### 3.8 Layout specification

**Computer (wider than 720 px and taller than 480 px):**
- Left: the storm panel, 336 px wide (wordmark, search, Active and Past tabs, list, freshness line, credit line).
  Below it, the wind legend, 300 px wide, which follows the look and always carries the six-colour storm strength bar.
- Top right: the zoom pill (small globe = zoom out, large globe = zoom in, compass = start view) and the toolbar
  (Layers, Units, Strength scale, Glossary, About).
- Right column, 360 px wide: storm details when a storm is open, with the Customize card below it. Customize shows
  three looks at first and opens upward to all eight, a description and every layer control. It folds when a storm is
  opened.
- Below 1280 px wide, the first-visit tip and the replay bar sit above the cards instead of between them.

**Phone (up to 720 px wide, or 480 px tall):**
- Top row: the wind legend (compact) on the left, Search and a three-dot button on the right. The three-dot button
  opens Settings: units, map layers, and links to the strength scale, glossary and sources.
- No zoom buttons. Pinch, drag, or double-tap.
- Bottom: the Customize card (a header bar that opens upward) above the storms bar ("2 storms, Checked just now"),
  which opens the storm list as a sheet. An open storm replaces the bar with its details.

**Visual language:** black page; liquid glass (frosted, lightly refracting) panels; Geist and Geist Mono; one blue
accent for focus and live state; the glass gets a darker base on the light Ink look so text stays readable.

### 3.9 Accessibility specification

- Keyboard: every control is reachable; arrow keys turn the globe; + and − zoom; Ctrl/Cmd+K or / opens search; Escape
  closes dialogs and folds Customize.
- Dialogs and sheets open with focus on the panel (not on the Close button); the focus ring shows for keyboard use only.
- Touch targets: 44 px on phones. Buttons at a limit (zoom, reset) use `aria-disabled` so keyboard focus is not lost.
- Customize uses native toggle groups with arrow keys, `aria-pressed` look buttons, a status line for screen readers, and
  hides folded content from assistive technology.
- Reduced motion: the engine draws still frames, the card does not animate, markers do not spin.
- The automated scan (axe, WCAG 2 A and AA, 2.1 AA, 2.2 AA) reports no violations on desktop or phone. We have not
  tested with a real screen reader.
- Known trade-off: on phones, zoom has no buttons. Double-tap is the one-finger alternative to pinching.

### 3.10 Performance facts (measured here, not on real phones)

| What | Number |
|---|---|
| Main app script | about 600 KB (205 KB compressed) |
| Look engine script | about 24 KB, plus the detailed map 757 KB (233 KB compressed) fetched on first use |
| Built-in wind field (fallback only) | about 695 KB, loaded only if both wind files fail |
| `wind.json` / `wind-1.json` / `storms.json` | 1.4 MB / 340 KB / about 5 KB |
| Desktop drag | 60 frames per second in every look in the test browser (it caps at 60) |
| Phone with the CPU slowed 4x | Heat about 20 and Ink about 30 frames per second while dragging; Night, Chart and Bands between 6 and 10; Ribbons between 9 and 30 |

The slowdown test is pessimistic (the test browser draws without a graphics chip), but it shows the limit of drawing
on the processor. The path to a steady 60 and a chance at 120 is moving the surface and the wind lines to the graphics
chip with WebGL, about 2 to 3 days of work. We chose to wait for tester feedback first.

### 3.11 Testing specification

| Check | Where | When |
|---|---|---|
| 27 pipeline tests in total: storm tests on saved agency responses, including damaged ones (wrong shapes, broken XML, nan and inf, a damaged previous file), plus 5 wind tests that are skipped without `eccodes` | `pipeline/tests/` | every push and every refresh |
| 12 timer Worker tests (request shape, retries, bad tokens, 200 simultaneous ticks, a real round trip) | `trigger/worker.test.mjs` | every push |
| App type check and production build | the Checks workflow | every push and pull request |
| Browser checks of the looks, the card, saving, the zoom pill, Settings, and axe | `tools/e2e/looks.cjs` | by hand before releases |
| Frame rate and long tasks for every look | `tools/e2e/looks-perf.cjs` | by hand |
| Live data states, screen sizes, keyboard, stress and motion | `tools/e2e/live.cjs`, `devices.cjs`, `stress.cjs`, `motion.cjs` | by hand |

Not covered by automatic CI: the browser checks. They need a built site and a browser, so we run them ourselves.

### 3.12 Licences and credits

Code is MIT (Suraj Kumar). Data keeps its sources' terms (`docs/ATTRIBUTION.md`): NOAA and NHC data are US government
public data; GDACS may be reused with acknowledgement; IBTrACS is public; Natural Earth is public domain. The wind-map
look is inspired by earth.nullschool.net (MIT, by Cameron Beccario); no code was copied from it. Typefaces are Geist
and Geist Mono (SIL Open Font License). The in-app credit line reads "Real data: NOAA, NHC, GDACS" with a link to
"Sources and official alerts".

---

## Part 4. Running and fixing it

### 4.1 Everyday tasks

| I want to... | Do this |
|---|---|
| See a change before it goes live | GitHub, Actions, **Deploy site**, Run workflow, pick the branch. Open `https://<branch-with-dashes>.vayu-live.pages.dev` |
| Refresh the data now | Actions, **Refresh storm data**, Run workflow (it always refreshes) |
| Publish the live site again | Actions, **Deploy site**, Run workflow on `main` |
| Run the app on my computer | `cd app`, `npm ci`, `npm run dev` (needs Node 20 or newer) |
| Run the data pipeline | `python3 -m pipeline.storms --out app/public/data/storms.json` |
| Run the data tests | `python3 -m unittest discover -s pipeline/tests -t .` |

### 4.2 When something breaks

| Symptom | Likely cause | Fix |
|---|---|---|
| "Storm data is N hours old" on the live site | The timer, the refresh, or the deploy stopped | Check the Worker's logs and its cron, then the Actions tab. If the token expired (401 or 403), make a new GitHub token and replace the Worker secret. A manual **Refresh storm data** run is the quick patch |
| The same banner on a preview only | Previews keep the data from when the branch was made | Merge `main` into the branch and redeploy, or just look at the live site |
| Deploy is green but nothing is published | The two Cloudflare secrets are missing, so it skipped publishing | Add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` |
| The wind map is old or flat | The GFS download failed and the site's previous file was reused, or neither was available | Check the "Build the wind field" step. The app falls back to a built-in 1° field |
| One storm is "Not updated" | Its source failed on the last run | Normal. The previous data stands in until the source answers again |
| The timer stopped | The GitHub token (credential 4) expired after a year | Create a new token with Actions read and write on this repository, update the Worker secret |

### 4.3 Calendar items

- **About one year after the token was made (late Oct 2027):** the timer's GitHub token expires. Set a reminder a few weeks before.
- **Every few months:** look at the Actions usage and the Cloudflare free-plan limits.
- **A few weeks after 1 Nov:** once the testers have moved, delete the old `storm-globe` project in Cloudflare and remove
  the last step of `deploy.yml`.
- **Before any wider launch:** search the trademark registers for "Vayu" and "Vayuh", and decide on a custom domain.

### 4.4a Renaming the repository (done on 1 Nov 2026, IST)

1. GitHub, repository **Settings**, **General**, **Repository name**, then **Rename**. Old links and `git` remotes redirect.
   Fine-grained tokens follow the repository, so the timer's token keeps working.
2. Change `REPO` in `trigger/worker.js` and paste the whole file into the Cloudflare Worker `storm-refresh-timer`
   (Edit code, Deploy). Cloudflare runs its own copy, so merging a pull request does not update it. Do this before the next
   timer tick, because the old name only redirects and a redirected POST can silently turn into a GET.
3. In the coding session, attach the repository again under its new name (its access is by name).
4. Check that the next timer tick starts a **Refresh storm data** run by `workflow_dispatch`.

### 4.4 Renaming checklist (what we did on 1 Nov, and what to repeat)

1. In the app: the wordmark, hidden heading, page title, `package.json`, and any sentence that uses the name. Leave the
   saved-settings keys (`qellon.units.v*`, `qellon.layers.v*`, `qellon.look.v1`, `qellon.hint.v1`) as they are, or every
   tester loses their saved choices (they reset anyway when the address changes).
2. Choose the address and check it is free: a name with no DNS record on `pages.dev` is free.
3. Set the repository variable `CF_PAGES_PROJECT`, or change the default in `deploy.yml`, then run **Deploy site** on a
   branch first and check the preview.
4. The old address redirects through the last step of `deploy.yml` (`LEGACY_PROJECT`). Update that name if the address
   changes again.
5. Tell the testers the final link. Details and the full record are in `docs/NAMING.md`.

---

## Part 5. What is still open

1. **Trademark search** for "Vayu" and "Vayuh" (Indian and US registers) before any wider launch. Vāyuh Inc., a US storm-risk
   company, sounds the same. Hurakan and Rudra are the clean fallbacks if the name has to change.
2. **Smoothness on phones.** Decide on the WebGL rewrite (2 to 3 days) after tester feedback. A smaller step, drawing at
   lower resolution while moving, is half a day.
3. **Previews go stale** after about 6 hours. The deploy could pull the newest storm data when it builds a preview.
4. **Landscape phones** use the phone layout, which is cramped.
5. **Phone zoom** has no buttons (a deliberate choice). Double-tap is the safeguard.
6. **Real screen reader testing** has not been done.
7. **Optional data:** JMA's official typhoon feed (free, credit asked) could improve the Western Pacific.
8. **A Worker that fetches the data itself** (so GitHub Actions is not needed for refreshes) is possible but needs a
   test against the free plan's 10 ms limit.
9. **Branch cleanup** on GitHub: delete the finished branches. The Style Lab branch `claude/style-lab` is unmerged and
   is kept for reference.
10. **Not checked:** trademarks, and social handles for Vayu.
11. **Old address:** delete the `storm-globe` project and the redirect step after a few weeks.
12. **Custom domain** (left for later) and the **Devanagari wordmark** (mocked up, not built).

---

## Glossary

- **Action / workflow:** a job that GitHub runs for you from a file in `.github/workflows/`.
- **API token:** a password-like string that lets a program act on your behalf with limited powers.
- **ATCF:** the standard text format agencies use for storm tracks and forecasts.
- **Branch:** a separate line of changes. `main` is the live one.
- **Cron:** a schedule written as five fields, for example `20 */3 * * *` (minute 20, every 3 hours).
- **CI:** automatic checks that run on every change.
- **Fixture:** a saved real response used for tests, so tests do not depend on the internet.
- **GFS:** NOAA's global weather model; the source of the wind, temperature and pressure grids.
- **GRIB:** the compact file format weather models use.
- **IBTrACS:** NOAA's archive of past storm tracks.
- **JTWC:** the US Joint Typhoon Warning Center. Its numbers use 1-minute winds.
- **Pages:** Cloudflare's service for hosting static websites.
- **Pull request:** a request to merge a branch into `main`, with checks.
- **Secret:** a stored value that is hidden in logs and cannot be read back.
- **Static site:** a site made only of files, with no program running on a server.
- **tcvitals:** NOAA's short list of the newest position of every tracked storm.
- **Worker:** a small program that runs on Cloudflare's network.
- **wrangler:** Cloudflare's command line tool for publishing.
