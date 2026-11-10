# Vayu: guide for AI coding agents

Read this before changing anything. It is read by Cursor and Codex (`AGENTS.md`) and by Claude Code (through `CLAUDE.md`).

## What this is
Vayu is a free, web-only storm globe: every active cyclone, hurricane and typhoon in plain language, on a moving wind map.
Live at https://vayu-live.pages.dev. Repo: `IamSuraj9/Vayu-live`. Owner: Suraj Kumar (a designer; explain technical choices in plain words).
It is educational and **not a warning service**. Never add wording that sounds like an official alert.

## Stack
- **App** (`app/`): React 19, TypeScript, Vite 6, Tailwind 4, shadcn/ui on Radix, `cmdk` (search), `lucide-react`, Geist fonts.
- **Globe**: `d3-geo` orthographic projection drawn on canvas (`app/src/globe/`), plus a look engine (`app/src/looks/`). No three.js.
- **Data pipeline** (`pipeline/`): Python 3.11+, standard library only for storms; `eccodes` + `numpy` for the wind field.
- **Hosting**: Cloudflare Pages (static files). A Cloudflare Worker (`trigger/worker.js`) starts the refresh every 3 hours.
- **CI/CD**: GitHub Actions. No server, no database. Everything free.

## Where things are
| Path | What |
|---|---|
| `app/src/App.tsx` | Page layout, state, desktop and phone arrangements, banner, hint, pop-up placement |
| `app/src/components/panels.tsx` | Storm list and details, dialogs (Settings, About, Scale, Glossary), search palette, replay bar |
| `app/src/components/looks.tsx` | Customize card, look buttons, zoom pill |
| `app/src/components/ui/` | shadcn components (dialog, sheet, tabs, switch, slider...) |
| `app/src/globe/` | Globe, camera, wind field loader (`field.ts`), storm markers |
| `app/src/index.css` | All visual tokens and surface styles (see Design) |
| `app/src/lib/contact.ts` | Feedback form link (Google Form) |
| `app/public/` | Static files: icons, `404.html`, `robots.txt`, `data/` |
| `pipeline/` | `storms.py`, `wind.py`, sources (NHC, GDACS, NOAA tcvitals), tests |
| `.github/workflows/` | `ci.yml` (tests), `deploy.yml` (build + publish), `refresh-storms.yml` (data, every 3 h) |
| `trigger/` | Cloudflare Worker and its tests |
| `tools/e2e/` | Browser test scripts (Playwright) |
| `docs/` | `HOW-WE-PULLED-THIS-OFF.md` (full story), `DEPLOY.md`, `TIMER.md`, `LOOKS.md`, `NAMING.md`, `ATTRIBUTION.md` |

## Commands
```bash
cd app && npm ci
npm run dev                      # http://localhost:5173
npx tsc -p tsconfig.json         # typecheck
npm run build                    # tsc + vite build into app/dist
npx vite preview --port 4173     # serve the build for browser checks

python3 -m unittest discover -s pipeline/tests -t .    # 27 pipeline tests
node --test trigger/worker.test.mjs                     # 12 Worker tests
node tools/e2e/looks.cjs   http://localhost:4173/ OUT   # Customize and looks
node tools/e2e/live.cjs    http://localhost:4173/ OUT   # data states
node tools/e2e/devices.cjs http://localhost:4173/ OUT   # screen sizes and keyboard
```
`devices.cjs` looks for a storm by name, so it times out when that storm is no longer active. That is a known test weakness, not an app bug.
Playwright and Chromium are pre-installed in the cloud environment. Do not reinstall them.

## Working agreement (important)
- **Never push to `main`.** Work on a branch, run the **Deploy site** workflow on it (Actions, `deploy.yml`, "Run workflow") to get a preview at
  `https://<branch-name-with-dashes>.vayu-live.pages.dev`, and show the owner.
- **Open a PR or merge only when the owner says so.** Merge method: squash. A PR must contain only what was asked.
- **Change only what was asked.** Do not touch motion, layout, interactions or flows during a visual change. Do not "fix" unrelated things.
  Before opening a PR, run `git diff --stat origin/main...HEAD` and check that every file is intended.
- **Do not revert things the owner already fixed elsewhere** (workflows, token setup, the Cloudflare Worker, removed banners, wording).
  Branch from the latest `main` and read the diff before pushing.
- **Ask before executing when in doubt**, and before anything outward-facing or hard to undo (publishing, deleting, changing visibility).
- **Times are IST** (Asia/Kolkata) in anything shown to the owner.
- **Free hosting only.** No paid services, no custom domain.
- **No secrets** in code, docs, commits or chat. No personal email addresses in code: feedback goes through the Google Form link in `contact.ts`.
- Never skip, disable or delete a failing test to get green.

## Data and deploys
- `app/public/data/storms.json` is written by the bot (commits named `data: refresh storms ...`, every 3 hours). Never edit it by hand.
- `app/public/data/wind.json` is built at deploy time from NOAA GFS (NOMADS grib filter) and is gitignored. If NOAA fails, the deploy reuses the live
  site's wind files; failing that, the app uses the built-in snapshot `app/src/data/gfs.json`.
- The timer is a **Cloudflare Worker whose code the owner pastes into Cloudflare by hand**. Changing `trigger/worker.js` in the repo does not
  change what runs. Its `REPO` constant must be `IamSuraj9/Vayu-live`. Setup: `docs/TIMER.md`.
- Pages project is `vayu-live` (variable `CF_PAGES_PROJECT` can override). The old `storm-globe` project redirects to it and is due to be removed.
- Storm freshness: the app shows a banner when data is old, and storms with no new report show "Ended" or "Not updated".

## Design: flat, matte, dark
All surface styling lives in `app/src/index.css`. Keep it flat. No gradients, inner glows, glossy edges or lens distortion.
- **Panels** (`.glass`, dialogs, sheets, popovers): dark base ~88% opacity, light blur, one hairline, one soft shadow. The dark base is what keeps text readable over every map look.
- **Tiles and chips** (`.glass-well`): faint lighter fill, no inner shadow.
- **Selected state** everywhere (`.liquid-thumb`, toggle items, selected storm row, selected globe label, primary buttons): solid near-white with dark text.
  Text inside a selected white row must stay readable (dark), and dark wells inside it keep light text.
- Class names still say "liquid" for historical reasons (`liquid-thumb`, `liquid-chip`). The look is no longer liquid glass.
- Type: Geist for text, Geist Mono for small uppercase labels. Muted greys come from `--muted-foreground`.
- One accent blue, used only for focus rings and links.
- The product name is **Vayu** (never the old placeholder name). Product copy is plain language, no hype.

## Accessibility rules (this project has been audited; keep it clean)
- WCAG 2.2 AA. Text contrast at least 4.5:1 (3:1 for large text), checked against **all eight looks**, desktop and phone. Do not lower text opacity to "dim" things; dim only graphics.
- Touch targets: at least 24 px always, 44 px on phones where possible. Grow small controls with an invisible `before:` pseudo-element, never so far that two targets overlap.
- Accessible names start with the visible text (label in name). Every dialog, popover and slider thumb has a name. No skipped heading levels.
- Keyboard focus must always be visible. Never remove an outline. The Customize card shows one ring around the whole card.
- Close buttons are 48 px with a quiet hover fill. In dialogs and sheets the **title is a fixed header** (padding right 64 px for the button) and only the content scrolls beneath it.
- Scrollers that can overflow use the `scroll-stable` class (reserves scrollbar space so nothing reflows) and keep 12 px padding inside rounded frames.
- Respect `prefers-reduced-motion`. Do not add endless animations.
- After UI changes, check at least: desktop 1440x900 and 1280x720, phone 390x844, a storm open, Customize open, and run axe (WCAG 2.2 AA).

## Layout gotchas learned the hard way
- Padding added so shadows are not clipped must be no larger than the scroller's own padding, or it creates sideways or vertical overflow and scrollbars appear.
- `overflow: hidden` ancestors clip shadows; give the shadow room instead of removing the clip when an animation needs it.
- A segmented control's track height must be at least its buttons' height, or the selected pill overflows.
- The weather pop-up on desktop picks its position by measuring every panel (`placeReadout` in `App.tsx`). New floating panels need the `data-avoid` attribute so the pop-up stays clear of them.

## Roadmap status
The UX audit "Now" lane is merged. Still open ("Next"): keep Replay path and Official alerts visible on short screens and fold Customize while a storm is open;
search ranking and region names (searching "Odisha" returns the wrong place); keyboard order, Escape closing the storm panel, focus into the panel;
storm links (`#storm=id`), Back closing the panel and a copy-link button; plain-language acronyms and icon labels; phone performance
(split the large script, defer the 50 m map and the wind file, add a "Loading wind" status). "Later": five-person usability test, screen-reader pass,
Safari and Firefox checks, Odia and Hindi, optional "use my location". Trademark search for "Vayu" is still open (see `docs/NAMING.md`).
