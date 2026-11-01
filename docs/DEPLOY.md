# Publishing the site (Cloudflare Pages, free plan)

The workflow `.github/workflows/deploy.yml` builds the app, adds a fresh wind field and publishes it. It runs:
- after every storm refresh (every 3 hours),
- on every push to `main`,
- when you press **Run workflow** on the Actions tab.

It needs two secrets from Cloudflare. Until they are added, it builds the site and stops before publishing (the run
still shows green).

## One-time setup (about 10 minutes)
1. **Create a free Cloudflare account** at https://dash.cloudflare.com/sign-up. No card is needed for Pages.
2. **Copy your Account ID.** In the dashboard, open **Workers & Pages**. The Account ID is shown on the right side
   (or in the account menu: *Copy account ID*). It is a 32-character code.
3. **Create an API token.** Profile icon (top right) → **My Profile** → **API Tokens** → **Create Token** →
   **Create Custom Token** → *Get started*.
   - Token name: `github-deploy`
   - Permissions: **Account** · **Cloudflare Pages** · **Edit**
   - Account Resources: **Include** · your account
   - **Continue to summary** → **Create Token**, then copy the token. It is shown only once.
4. **Add both to GitHub.** Repository → **Settings** → **Secrets and variables** → **Actions** → **New repository
   secret**, twice:
   - `CLOUDFLARE_API_TOKEN`: the token from step 3
   - `CLOUDFLARE_ACCOUNT_ID`: the ID from step 2
5. **Publish.** **Actions** tab → **Deploy site** → **Run workflow** (branch `main`). The first run creates the
   Pages project. The address is at the end of the *Publish to Cloudflare Pages* step, usually
   `https://vayu-live.pages.dev` (Cloudflare adds a few letters if that name is taken).

## Preview a change before it goes live
Actions tab → **Deploy site** → **Run workflow** → pick the branch instead of `main`. The copy is published at
`https://<branch-name>.vayu-live.pages.dev` (slashes become dashes, for example `claude-perf-pass`) and the live site is
not touched. Merging the branch into `main` then publishes it for real.

## The address, and the old one
The site name comes from the repository variable `CF_PAGES_PROJECT`. If it is not set, the default is `vayu-live`
(since 1 Nov 2026, IST). The first address, `storm-globe.pages.dev`, is the project `LEGACY_PROJECT` in the workflow.
Whenever the workflow runs on a push or a manual run, its last step publishes a redirect on that old project:
- from `main`, every old link goes to the same path on `https://vayu-live.pages.dev`;
- from another branch, `https://<branch>.storm-globe.pages.dev` goes to `https://<branch>.vayu-live.pages.dev`.

Keep the old project for a few weeks, then delete it in Cloudflare (**Workers & Pages** → `storm-globe` → **Settings** →
**Delete**) and remove the last step of the workflow.

**Saved settings do not move.** A browser keeps units, layers and the chosen look per address, so testers start with the
defaults once on the new address.

To change the name again, add the repository variable `CF_PAGES_PROJECT` (**Settings** → **Secrets and variables** →
**Actions** → **Variables**) and run the workflow. If you use a different address, also add `SITE_URL` (for example
`https://new-name.pages.dev`).

## What is published
| File | Size | Updated |
|---|---|---|
| `index.html` (the whole app in one file) | about 2 MB, 700 KB compressed | every deploy |
| `data/storms.json` | about 12 KB | every 3 hours |
| `data/wind.json` (0.5° GFS wind, temperature, pressure) | about 1.4 MB, 400 KB compressed | every deploy, from the newest GFS run |

If the GFS download fails, the workflow reuses the wind file already on the site. If that fails too, the app uses
the 1° field built into it.

This stays inside the free plan (limits checked 29 Oct 2026): about 250 publishes a month against 500 builds a month
(that limit is for Cloudflare's own Git builds; these are uploads from GitHub, so even counted they fit), 3 files
against 20,000, and 2 MB against 25 MiB per file.
