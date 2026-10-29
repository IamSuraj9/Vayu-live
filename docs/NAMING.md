# Naming

**Status (29 Oct 2026):** the working name is **Qellon**, kept for the first round of user testing. The owner does not
like it. The name will be changed after testing, so this file holds the options and the exact steps.

## Candidates
Every name comes from the words and science of storms.

| Name | Where it comes from | Notes |
|---|---|---|
| **Kyklos** | Greek for "circle, coil". The word *cyclone* comes from it | Short, unusual, fits every ocean. Pronunciation may vary (KY-klos). First choice |
| **Coriolis** | The force from Earth's spin that makes every storm rotate | Well known in weather, easy to say, a bit long. Second choice |
| **Taifu** | Japanese 台風, "great wind", the word *typhoon* | Easy to say. Only points at typhoons, while the app covers every ocean |
| **Typhon** | Greek monster who fathered the storm winds | Dramatic. Many products already use it |
| **Aeolus** | Greek keeper of the winds | Mythic. Sounds more "wind" than "storm" |
| **Gyre** | A large spiral of wind or water | Very short. Very common word |

## Before choosing
- Search the web and Instagram, X and YouTube for the name. Trademarks and handles are **not checked**.
- Say it aloud and look at it as the wordmark in the sidebar.
- Addresses on `.pages.dev` (checked 29 Oct 2026): the plain names (`kyklos`, `taifu`, `coriolis`, `typhon`, `aeolus`,
  `gyre`, `tufan`, `eyewall`) are **taken** by other people. A name with a suffix is free, for example
  `kyklos-live.pages.dev`. A clean address needs a paid domain, which is not wanted for now.

## How to rename (about 10 minutes, ask Claude to do it)
1. **In the app:** wordmark and hidden page heading in `app/src/App.tsx`; page title and meta in `app/index.html`;
   `app/package.json` name; the "Qellon" wording in `app/src/components/panels.tsx` (About dialog, banners).
2. **Internal names** (not visible, optional): CSS ids and classes `qellon-lens`, `qellon-ping`, `qellon-spin-*` in
   `app/src/index.css`, `Globe.tsx` and `panels.tsx`. Leave the saved-settings keys `qellon.units.v*` and
   `qellon.layers.v*` as they are, because renaming them resets every tester's saved units and layers.
3. **Docs:** `README.md` and the three files in `docs/research/`.
4. **Data fetching:** the User-Agent in `pipeline/fetch.py` links to the repository, so update it if the repository is
   renamed.
5. **Repository (optional):** rename it under Settings on GitHub. Old links redirect.
6. **Site address:** add the repository variable `CF_PAGES_PROJECT` (Settings, Secrets and variables, Actions,
   Variables) with the new project name, for example `kyklos-live`, and run **Deploy site**. Cloudflare creates the new
   project. See `docs/DEPLOY.md`.
7. **Keep old links alive:** the testers' links point at the current address, `storm-globe.pages.dev`. After the new
   site is up, publish a small "We have moved" page at the old address that redirects to the new one, and keep it for a
   few weeks. Delete the old project only after that.
8. Tell the testers the final link.
