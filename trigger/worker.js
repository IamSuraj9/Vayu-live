// Cloudflare Worker: wakes the storm refresh on GitHub every 3 hours.
// GitHub's own timer is best-effort and has skipped runs, so this one is the dependable trigger.
// It only sends one request to GitHub. The refresh itself still runs in GitHub Actions.
//
// Setup (see docs/TIMER.md): paste this file into a new Worker, add the secret GITHUB_TOKEN,
// and add a Cron Trigger "20 */3 * * *".

const REPO = "IamSuraj9/Qellon-Visualizer"
const WORKFLOW = "refresh-storms.yml"

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(wake(env))
  },
}

async function wake(env) {
  if (!env.GITHUB_TOKEN) throw new Error("The secret GITHUB_TOKEN is not set on this Worker")
  const res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "storm-refresh-timer",
    },
    body: JSON.stringify({ ref: "main", inputs: { reason: "timer" } }),
  })
  // GitHub answers 204 (no content) when the run has been queued
  if (res.status !== 204) throw new Error(`GitHub answered ${res.status}: ${(await res.text()).slice(0, 300)}`)
}
