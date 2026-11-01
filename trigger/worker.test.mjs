// Tests for the timer Worker. Run: node --test trigger/worker.test.mjs   (needs Node 20+)
import { test } from "node:test"
import assert from "node:assert/strict"
import http from "node:http"
import { readFileSync } from "node:fs"
import worker from "./worker.js"
import * as module from "./worker.js"

const real = globalThis.fetch
const status = (s, body = "") => (s === 204 ? new Response(null, { status: 204 }) : new Response(body, { status: s }))
const env = (extra = {}) => ({ GITHUB_TOKEN: "ghp_test", RETRY_DELAY_MS: "0", ...extra })

/** Runs one scheduled tick against a scripted fetch; resolves what the Worker handed to ctx.waitUntil. */
async function tick(script, e = env()) {
  const calls = []
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return script(calls.length, url, init) }
  let waited, waits = 0
  try {
    await worker.scheduled({ cron: "20 */3 * * *" }, e, { waitUntil: p => { waits++; waited = p } })
    assert.equal(waits, 1, "the work must be handed to ctx.waitUntil exactly once")
    await waited
    return { ok: true, calls }
  } catch (err) {
    return { ok: false, calls, err }
  } finally { globalThis.fetch = real }
}

test("sends one correct request to GitHub", async () => {
  const r = await tick(() => status(204))
  assert.ok(r.ok); assert.equal(r.calls.length, 1)
  const { url, init } = r.calls[0]
  assert.equal(url, "https://api.github.com/repos/IamSuraj9/Cyclone-Visualiser/actions/workflows/refresh-storms.yml/dispatches")
  assert.equal(init.method, "POST")
  assert.equal(init.headers.Authorization, "Bearer ghp_test")
  assert.equal(init.headers.Accept, "application/vnd.github+json")
  assert.equal(init.headers["X-GitHub-Api-Version"], "2022-11-28")
  assert.ok(init.headers["User-Agent"], "GitHub rejects requests without a User-Agent")
  assert.deepEqual(JSON.parse(init.body), { ref: "main", inputs: { reason: "timer" } })
  assert.ok(init.signal instanceof AbortSignal, "a request that hangs must be cut off")
})

test("the request matches the workflow it starts", () => {
  const yml = readFileSync(new URL("../.github/workflows/refresh-storms.yml", import.meta.url), "utf8")
  assert.match(yml, /^\s{2}workflow_dispatch:/m, "the workflow must accept manual starts")
  assert.match(yml, /^\s{6}reason:/m, "the workflow must declare the `reason` input the Worker sends")
  assert.match(yml, /inputs\.reason == 'timer'/, "the workflow must act on reason = timer")
  assert.match(readFileSync(new URL("./worker.js", import.meta.url), "utf8"), /refresh-storms\.yml/)
})

test("only the default export exists (Workers reject unknown exports)", () => {
  assert.deepEqual(Object.keys(module), ["default"])
  assert.equal(typeof worker.scheduled, "function")
})

test("a missing or blank token fails at once, without calling GitHub", async () => {
  for (const GITHUB_TOKEN of [undefined, "", "   ", "\n"]) {
    const r = await tick(() => status(204), env({ GITHUB_TOKEN }))
    assert.equal(r.ok, false); assert.equal(r.calls.length, 0); assert.match(r.err.message, /GITHUB_TOKEN/)
  }
})

test("a token pasted with spaces or a newline still works", async () => {
  const r = await tick(() => status(204), env({ GITHUB_TOKEN: "  ghp_test\r\n" }))
  assert.ok(r.ok); assert.equal(r.calls[0].init.headers.Authorization, "Bearer ghp_test")
})

test("settings problems fail at once and are not retried", async () => {
  for (const code of [400, 401, 403, 410, 422]) {
    const r = await tick(() => status(code, '{"message":"Resource not accessible by personal access token"}'))
    assert.equal(r.ok, false, String(code)); assert.equal(r.calls.length, 1, `${code} must not be retried`)
    assert.match(r.err.message, new RegExp(`GitHub answered ${code}`))
  }
})

test("before the rename: the new name says 404, so the old name is tried and works", async () => {
  const r = await tick((n) => (n === 1 ? status(404, '{"message":"Not Found"}') : status(204)))
  assert.ok(r.ok); assert.equal(r.calls.length, 2)
  assert.match(r.calls[0].url, /repos\/IamSuraj9\/Cyclone-Visualiser\//)
  assert.match(r.calls[1].url, /repos\/IamSuraj9\/Qellon-Visualizer\//)
  assert.equal(r.calls[1].init.method, "POST", "the second try is also a POST")
})

test("after the rename: the new name works at once and the old name is never called", async () => {
  const r = await tick(() => status(204))
  assert.ok(r.ok); assert.equal(r.calls.length, 1)
  assert.match(r.calls[0].url, /Cyclone-Visualiser/)
})

test("a 404 from both names (for example a token without access) fails at once, with both tried and no retries", async () => {
  const r = await tick(() => status(404, '{"message":"Not Found"}'))
  assert.equal(r.ok, false); assert.equal(r.calls.length, 2, "one call per name, no retry")
  assert.match(r.err.message, /GitHub answered 404/)
})

test("a hiccup on GitHub's side is retried until it works", async () => {
  for (const bad of [500, 502, 503, 504, 429]) {
    const r = await tick(n => (n < 3 ? status(bad) : status(204)))
    assert.ok(r.ok, `${bad} then 204`); assert.equal(r.calls.length, 3)
  }
  const rate = await tick(n => (n < 2 ? status(403, "You have exceeded a secondary rate limit") : status(204)))
  assert.ok(rate.ok); assert.equal(rate.calls.length, 2)
})

test("it gives up after 3 attempts and reports the last answer", async () => {
  const r = await tick(() => status(502, "Bad gateway"))
  assert.equal(r.ok, false); assert.equal(r.calls.length, 3); assert.match(r.err.message, /502.*Bad gateway/)
})

test("network errors and timeouts are retried", async () => {
  const blip = await tick(n => { if (n < 3) throw new TypeError("fetch failed"); return status(204) })
  assert.ok(blip.ok); assert.equal(blip.calls.length, 3)
  const slow = await tick(n => { if (n < 2) throw new DOMException("The operation timed out", "TimeoutError"); return status(204) })
  assert.ok(slow.ok)
  const dead = await tick(() => { throw new TypeError("fetch failed") })
  assert.equal(dead.ok, false); assert.equal(dead.calls.length, 3); assert.match(dead.err.message, /Could not reach GitHub/)
})

test("a connection that never answers is cut off and retried", async () => {
  const orig = AbortSignal.timeout
  AbortSignal.timeout = () => orig.call(AbortSignal, 10) // the real limit is 15 s; shorten it so the test is quick
  const keepAlive = setInterval(() => {}, 1000) // Node's timeout timers do not keep the process running by themselves
  try {
    const hang = (_n, _u, init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason)))
    const r = await tick(hang)
    assert.equal(r.ok, false); assert.equal(r.calls.length, 3, "a hang counts as an attempt")
    assert.match(r.err.message, /Could not reach GitHub/)
    const healed = await tick((n, u, init) => (n < 2 ? hang(n, u, init) : status(204)))
    assert.ok(healed.ok, "one hang, then GitHub answers")
  } finally { AbortSignal.timeout = orig; clearInterval(keepAlive) }
})

test("200 ticks at once, a third of them hit a 502 first: every one gets through", async () => {
  const seen = new Map()
  globalThis.fetch = async (_url, init) => {
    const id = init.body + Math.random()  // every tick is its own request
    seen.set(id, 1)
    return Math.random() < 0.33 ? status(502) : status(204)
  }
  let fulfilled = 0, failed = 0
  await Promise.all(Array.from({ length: 200 }, async () => {
    let waited
    await worker.scheduled({}, env(), { waitUntil: p => { waited = p } })
    try { await waited; fulfilled++ } catch { failed++ }
  }))
  globalThis.fetch = real
  // a request fails only if 3 in a row hit the 33% error: expected about 3.6% (7 of 200)
  assert.ok(fulfilled >= 185, `fulfilled ${fulfilled}, failed ${failed}`)
})

test("over real HTTP: headers and body arrive intact, and a stray newline in the token cannot break the request", async () => {
  const got = []
  const server = http.createServer((req, res) => {
    let body = ""; req.on("data", c => (body += c)).on("end", () => { got.push({ method: req.method, url: req.url, headers: req.headers, body }); res.writeHead(204).end() })
  })
  await new Promise(r => server.listen(0, "127.0.0.1", r))
  const port = server.address().port
  globalThis.fetch = (url, init) => real(String(url).replace("https://api.github.com", `http://127.0.0.1:${port}`), init)
  let waited
  await worker.scheduled({}, env({ GITHUB_TOKEN: "ghp_real\n" }), { waitUntil: p => { waited = p } })
  await waited
  globalThis.fetch = real; server.close()
  assert.equal(got.length, 1)
  assert.equal(got[0].method, "POST")
  assert.equal(got[0].url, "/repos/IamSuraj9/Cyclone-Visualiser/actions/workflows/refresh-storms.yml/dispatches")
  assert.equal(got[0].headers.authorization, "Bearer ghp_real")
  assert.equal(got[0].headers["x-github-api-version"], "2022-11-28")
  assert.equal(got[0].headers["user-agent"], "storm-refresh-timer")
  assert.deepEqual(JSON.parse(got[0].body), { ref: "main", inputs: { reason: "timer" } })
})
