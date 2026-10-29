# The refresh timer (Cloudflare Worker)

**Why:** the storm data is refreshed by a GitHub job every 3 hours. GitHub's own timer is best-effort and skipped every
run on 29 Oct 2026 (the site showed "Storm data is 6 hours old"). A Cloudflare timer is the dependable trigger.
It sends one request to GitHub every 3 hours; the refresh itself still runs in GitHub Actions. GitHub's own timer stays
on as a backup, and a run that starts when the data is under 100 minutes old stops at once, so having both costs almost nothing.

Free: no card needed. Workers free plan allows 5 timers and 100,000 requests a day; this uses one timer and 8 requests a day.

## One-time setup (about 10 minutes)

### 1. A GitHub token that can only start workflows on this repository
1. GitHub, top right: your picture, **Settings**. Bottom of the left menu: **Developer settings**.
2. **Personal access tokens**, **Fine-grained tokens**, **Generate new token**.
3. Name: `storm-refresh-timer`. Expiration: the longest allowed (1 year). Put the date in your calendar.
4. Resource owner: `IamSuraj9`. Repository access: **Only select repositories**, then `Qellon-Visualizer`.
5. Permissions, **Repository permissions**, **Actions: Read and write**. Leave everything else as it is.
6. **Generate token**, then copy it. It is shown once. Do not paste it into chat.

### 2. The Worker on Cloudflare
1. dash.cloudflare.com, **Workers & Pages**, **Create**, **Create Worker** (or "Start with Hello World").
2. Name it `storm-refresh-timer`, **Deploy**, then **Edit code**.
3. Select all the sample code, delete it, paste the whole of `trigger/worker.js`, then **Deploy**.
4. Open the Worker, **Settings**, **Variables and Secrets**, **Add**. Type **Secret**, name `GITHUB_TOKEN`, value: the token from step 1. **Deploy**.
5. **Settings**, **Trigger Events** (or **Triggers**), **Cron Triggers**, **Add**.
   First enter `*/5 * * * *` (every 5 minutes) so we can check it works.

### 3. Check it, then set the real schedule
Within 5 minutes the Actions tab on GitHub shows a **Refresh storm data** run started by `workflow_dispatch`.
It should finish in about 20 seconds with "Fresh enough, nothing to do" if the data is under 100 minutes old.
Tell Claude, who can check it too. Then change the cron to **`20 */3 * * *`** (every 3 hours, at 20 past).

## Tests
`node --test trigger/` runs 12 checks on the Worker (request shape, retries, bad tokens, 200 simultaneous ticks, a real HTTP round-trip).
They run on every push. It was also run once in Cloudflare's own runtime (`wrangler dev --test-scheduled`).

## If it stops working
- **GitHub token expired or wrong:** the Worker's **Logs** show `GitHub answered 401` or `403`. Make a new token (step 1) and replace the secret.
- **No runs at all:** open the Worker, **Triggers**, and check the cron is listed.
- The backup GitHub schedule may still run, and the app shows "Storm data is N hours old" after 6 hours without a refresh.
- The token can only start workflows on this one repository. It cannot read code or change files. To revoke it, delete it under GitHub Developer settings.
