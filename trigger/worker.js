// Cloudflare Worker: wakes the storm refresh on GitHub every 3 hours.
// GitHub's own timer is best-effort and has skipped runs, so this one is the dependable trigger.
// It only sends one request to GitHub. The refresh itself still runs in GitHub Actions.
//
// Setup (see docs/TIMER.md): paste this file into a new Worker, add the secret GITHUB_TOKEN,
// and add a Cron Trigger "20 */3 * * *".
//
// A hiccup on GitHub's side (5xx, rate limit, network error, no answer in 15 s) is retried up to 3 times.
// A settings problem (bad token, wrong repository) is not retried: it fails at once so the Worker's logs show it.
//
// The repository is being renamed. GitHub answers 404 for a name that does not exist, so the new name is tried first and
// the old one only if that says 404. Either order of "paste this Worker" and "rename the repository" therefore works,
// and no redirect is involved (a redirected POST can silently turn into a GET). Drop the old name once the rename is done.

const REPOS = ["IamSuraj9/Cyclone-Visualiser", "IamSuraj9/Qellon-Visualizer"]
const WORKFLOW = "refresh-storms.yml"
const ATTEMPTS = 3
const WAIT_MS = 15000

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(wake(env))
  },
}

async function wake(env) {
  // A token pasted into a form often carries a space or a newline at the end
  const token = String(env.GITHUB_TOKEN ?? "").trim()
  if (!token) throw new Error("The secret GITHUB_TOKEN is not set on this Worker")
  const urlFor = repo => `https://api.github.com/repos/${repo}/actions/workflows/${WORKFLOW}/dispatches`
  const pause = Number(env.RETRY_DELAY_MS ?? 2000) // only the tests change this

  for (let attempt = 1; ; attempt++) {
    let error, retry
    try {
      let res
      for (const repo of REPOS) {
        res = await fetch(urlFor(repo), {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "storm-refresh-timer",
          },
          body: JSON.stringify({ ref: "main", inputs: { reason: "timer" } }),
          signal: AbortSignal.timeout(WAIT_MS),
        })
        if (res.status !== 404 || repo === REPOS[REPOS.length - 1]) break
        await res.arrayBuffer().catch(() => {}) // this name does not exist (yet, or any more): try the next one
      }
      if (res.status === 204) return // GitHub answers 204 (no content) when the run has been queued
      const text = (await res.text()).slice(0, 300)
      error = new Error(`GitHub answered ${res.status}: ${text}`)
      retry = res.status >= 500 || res.status === 429 || (res.status === 403 && /rate limit/i.test(text))
    } catch (e) {
      error = new Error(`Could not reach GitHub: ${e?.message ?? e}`)
      retry = true
    }
    if (!retry || attempt >= ATTEMPTS) throw error
    await new Promise(resolve => setTimeout(resolve, pause * attempt))
  }
}
