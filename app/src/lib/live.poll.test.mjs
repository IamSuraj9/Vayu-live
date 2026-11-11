// Poll races: a slow storms check must not raise the offline banner after a newer one
// succeeded, and a slow wind fallback must not paint the bundled grid over a live field.
// Run: npm test   (from app/)
import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { createServer } from "vite"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../..", import.meta.url))
let server
/** @type {typeof import("./live.ts")} */
let live
/** @type {typeof import("../globe/field.ts")} */
let field

before(async () => {
  server = await createServer({
    configFile: fileURLToPath(new URL("../../vite.config.ts", import.meta.url)),
    root,
    logLevel: "silent",
  })
  live = await server.ssrLoadModule("/src/lib/live.ts")
  field = await server.ssrLoadModule("/src/globe/field.ts")
})

after(async () => { await server?.close() })

function deferred() {
  /** @type {(v: any) => void} */
  let resolve
  /** @type {(e: unknown) => void} */
  let reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function storms(fetchedAt) {
  return { schema: 1, snapshot: fetchedAt, fetchedAt, sources: {}, credits: "test", storms: [] }
}

function feed(file = storms("2020-01-01T00:00:00Z")) {
  let state = { file, origin: "saved", reachable: true, loading: true, checkedAt: null }
  return { get: () => state, set: (update) => { state = update(state) } }
}

function grid(time) {
  const b64 = Buffer.from([4]).toString("base64")
  return {
    time, source: "test", grid: { lo1: 0, la1: 90, dx: 1, dy: 1, ni: 1, nj: 1 }, dtype: "int8",
    scale: { u: [1, 0], v: [1, 0], t: [1, 0], p: [1, 0] }, u: b64, v: b64, t: b64, p: b64,
  }
}

function slot() {
  const state = { time: "", level: 0, builtIn: false }
  let version = 0
  return { state, bump: (update) => { version = update(version) }, get version() { return version } }
}

async function until(flag) {
  for (let i = 0; i < 30 && !flag(); i++) await Promise.resolve()
  assert.equal(flag(), true)
}

test("a newer check makes the previous one stale while it runs and after it finishes", () => {
  const open = live.pollEpoch()
  const first = open()
  assert.equal(first(), false)
  const second = open()
  assert.equal(first(), true)
  assert.equal(second(), false)
  assert.equal(first(), true)
})

test("a single storms poll publishes the file and clears loading", async () => {
  const h = feed()
  const liveFile = storms("2026-11-11T12:00:00Z")
  const start = Date.now()
  await live.pullStorms(() => false, h.set, async () => liveFile)
  const got = h.get()
  assert.equal(got.file, liveFile)
  assert.equal(got.origin, "live")
  assert.equal(got.reachable, true)
  assert.equal(got.loading, false)
  assert.ok(got.checkedAt >= start && got.checkedAt <= Date.now())
})

test("a single poll keeps a storm with a track and drops one with none", async () => {
  const h = feed()
  const point = { t: "2026-11-11T00:00:00Z", lat: 10, lon: 140, kt: 40 }
  const kept = { id: "kept", name: "Kept", kind: "typhoon", basin: "WP", track: [point], forecast: [], source: "test", windAvg: "1-minute" }
  const file = { ...storms("2026-11-11T12:00:00Z"), storms: [kept, { ...kept, id: "empty", track: [] }, { ...kept, id: "missing", track: undefined }] }
  await live.pullStorms(() => false, h.set, async () => file)
  const got = h.get()
  assert.deepEqual(got.file.storms.map(s => s.id), ["kept"])
  assert.equal(got.file.storms[0], kept)
  assert.equal(got.file.fetchedAt, "2026-11-11T12:00:00Z")
  assert.equal(got.origin, "live")
  assert.equal(got.reachable, true)
  assert.equal(got.loading, false)
})

test("the first live file replaces the saved copy even when the saved fetchedAt is later", async () => {
  const h = feed(storms("2099-01-01T00:00:00Z"))
  const liveFile = storms("2026-11-11T12:00:00Z")
  await live.pullStorms(() => false, h.set, async () => liveFile)
  assert.equal(h.get().file, liveFile)
  assert.equal(h.get().origin, "live")
})

test("a later poll keeps the file with the newer fetchedAt", async () => {
  const h = feed()
  await live.pullStorms(() => false, h.set, async () => storms("2026-11-11T12:00:00Z"))
  const checked = h.get().checkedAt
  await live.pullStorms(() => false, h.set, async () => storms("2026-11-11T09:00:00Z"))
  assert.equal(h.get().file.fetchedAt, "2026-11-11T12:00:00Z")
  assert.equal(h.get().origin, "live")
  assert.equal(h.get().reachable, true)
  assert.ok(h.get().checkedAt >= checked)
})

test("a failed poll marks the feed unreachable and keeps the file on screen", async () => {
  const saved = storms("2020-01-01T00:00:00Z")
  const h = feed(saved)
  await live.pullStorms(() => false, h.set, async () => { throw new Error("HTTP 404") })
  assert.equal(h.get().reachable, false)
  assert.equal(h.get().loading, false)
  assert.equal(h.get().file, saved)
  assert.equal(h.get().origin, "saved")
  assert.equal(h.get().checkedAt, null)
})

test("a file with the wrong shape counts as a failure", async () => {
  const saved = storms("2020-01-01T00:00:00Z")
  const h = feed(saved)
  await live.pullStorms(() => false, h.set, async () => ({ schema: 2, storms: [] }))
  assert.equal(h.get().reachable, false)
  assert.equal(h.get().file, saved)
})

test("a slow failure after a newer success leaves the live file reachable", async () => {
  const h = feed()
  const open = live.pollEpoch()
  const slow = deferred()
  const first = live.pullStorms(open(), h.set, () => slow.promise)
  const liveFile = storms("2026-11-11T12:00:00Z")
  await live.pullStorms(open(), h.set, async () => liveFile)
  assert.equal(h.get().reachable, true)
  assert.equal(h.get().file, liveFile)
  slow.reject(new Error("timed out"))
  await first
  const got = h.get()
  assert.equal(got.reachable, true)
  assert.equal(got.loading, false)
  assert.equal(got.origin, "live")
  assert.equal(got.file, liveFile)
})

test("a slow failure while a newer check is still running does not mark the feed offline", async () => {
  const h = feed()
  const open = live.pollEpoch()
  const slowFail = deferred()
  const slowOk = deferred()
  const first = live.pullStorms(open(), h.set, () => slowFail.promise)
  const second = live.pullStorms(open(), h.set, () => slowOk.promise)
  slowFail.reject(new Error("timed out"))
  await first
  assert.equal(h.get().reachable, true)
  assert.equal(h.get().loading, true)
  assert.equal(h.get().origin, "saved")
  const liveFile = storms("2026-11-11T12:00:00Z")
  slowOk.resolve(liveFile)
  await second
  assert.equal(h.get().reachable, true)
  assert.equal(h.get().loading, false)
  assert.equal(h.get().file, liveFile)
})

test("a slow success is ignored once a newer check has started", async () => {
  const h = feed()
  const open = live.pollEpoch()
  const slow = deferred()
  const first = live.pullStorms(open(), h.set, () => slow.promise)
  const newer = deferred()
  const second = live.pullStorms(open(), h.set, () => newer.promise)
  slow.resolve(storms("2026-11-11T18:00:00Z"))
  await first
  assert.equal(h.get().origin, "saved")
  assert.equal(h.get().loading, true)
  newer.resolve(storms("2026-11-11T12:00:00Z"))
  await second
  assert.equal(h.get().file.fetchedAt, "2026-11-11T12:00:00Z")
  assert.equal(h.get().reachable, true)
  assert.equal(h.get().loading, false)
})

test("a stale malformed file does not mark the feed offline", async () => {
  const h = feed()
  const open = live.pollEpoch()
  const slow = deferred()
  const first = live.pullStorms(open(), h.set, () => slow.promise)
  const newer = deferred()
  const second = live.pullStorms(open(), h.set, () => newer.promise)
  slow.resolve({ schema: 1, storms: "nope" })
  await first
  assert.equal(h.get().reachable, true)
  assert.equal(h.get().loading, true)
  const liveFile = storms("2026-11-11T12:00:00Z")
  newer.resolve(liveFile)
  await second
  assert.equal(h.get().file, liveFile)
  assert.equal(h.get().reachable, true)
})

test("a sharp connection loads the coarse field first, then the sharp one, and does not fall back", async () => {
  const w = slot()
  const urls = []
  const loaded = []
  let built = 0
  const doc = grid("2026-11-11T12:00:00Z")
  await live.pullWind(() => false, w.state, w.bump, {
    sharp: true,
    read: async (url) => { urls.push(url); return doc },
    load: (d) => { loaded.push(d); return true },
    builtIn: async () => { built++; return true },
  })
  assert.deepEqual(urls, ["data/wind-1.json", "data/wind.json"])
  assert.equal(loaded.length, 2)
  assert.equal(w.state.time, doc.time)
  assert.equal(w.state.level, 2)
  assert.equal(w.state.builtIn, false)
  assert.equal(built, 0)
  assert.equal(w.version, 2)
})

test("the same time keeps the sharper level, and a newer time replaces it", async () => {
  const w = slot()
  w.state.time = "2026-11-11T12:00:00Z"
  w.state.level = 2
  let loads = 0
  await live.pullWind(() => false, w.state, w.bump, {
    sharp: false,
    read: async () => grid("2026-11-11T12:00:00Z"),
    load: () => { loads++; return true },
    builtIn: async () => { throw new Error("live field must not fall back") },
  })
  assert.equal(loads, 0)
  assert.equal(w.state.level, 2)

  const newer = grid("2026-11-11T18:00:00Z")
  await live.pullWind(() => false, w.state, w.bump, {
    sharp: false,
    read: async () => newer,
    load: () => { loads++; return true },
    builtIn: async () => { throw new Error("live field must not fall back") },
  })
  assert.equal(loads, 1)
  assert.equal(w.state.time, newer.time)
  assert.equal(w.state.level, 1)
  assert.equal(w.version, 1)
})

test("a coarse miss still tries the sharp file before the bundled grid", async () => {
  const w = slot()
  const urls = []
  let built = 0
  const sharp = grid("2026-11-11T12:00:00Z")
  await live.pullWind(() => false, w.state, w.bump, {
    sharp: true,
    read: async (url) => { urls.push(url); if (url.endsWith("wind-1.json")) throw new Error("coarse down"); return sharp },
    load: () => true,
    builtIn: async () => { built++; return true },
  })
  assert.deepEqual(urls, ["data/wind-1.json", "data/wind.json"])
  assert.equal(w.state.level, 2)
  assert.equal(w.state.builtIn, false)
  assert.equal(built, 0)
})

test("when no live file can be reached, the bundled grid is applied once", async () => {
  const w = slot()
  let applies = 0
  await live.pullWind(() => false, w.state, w.bump, {
    sharp: true,
    read: async () => { throw new Error("down") },
    load: () => { throw new Error("no live file") },
    builtIn: async (apply) => { applies++; return apply() },
  })
  assert.equal(applies, 1)
  assert.equal(w.state.builtIn, true)
  assert.equal(w.state.time, "")
  assert.equal(w.version, 1)
})

test("a bundled grid does not replace a live field that arrived while it was loading", async () => {
  const open = live.pollEpoch()
  const w = slot()
  const hold = deferred()
  let waiting = false
  const applied = []
  const load = (doc) => { applied.push(doc.time); return true }
  const liveDoc = grid("2026-11-11T12:00:00Z")
  const first = live.pullWind(open(), w.state, w.bump, {
    sharp: false,
    read: async () => { throw new Error("down") },
    load,
    builtIn: async (apply) => {
      waiting = true
      await hold.promise
      if (!apply()) return false
      return load(grid("2000-01-01T00:00:00Z"))
    },
  })
  await until(() => waiting)
  await live.pullWind(open(), w.state, w.bump, {
    sharp: false,
    read: async () => liveDoc,
    load,
    builtIn: async () => { throw new Error("live check must not fall back") },
  })
  assert.deepEqual(applied, [liveDoc.time])
  hold.resolve()
  await first
  assert.deepEqual(applied, [liveDoc.time])
  assert.equal(w.state.time, liveDoc.time)
  assert.equal(w.state.level, 1)
  assert.equal(w.state.builtIn, false)
})

test("an older wind fallback does nothing once a newer check is in flight", async () => {
  const open = live.pollEpoch()
  const w = slot()
  const hold = deferred()
  const liveHold = deferred()
  let waiting = false
  let saw = null
  const first = live.pullWind(open(), w.state, w.bump, {
    sharp: false,
    read: async () => { throw new Error("down") },
    load: () => true,
    builtIn: async (apply) => {
      waiting = true
      await hold.promise
      saw = apply()
      return saw
    },
  })
  await until(() => waiting)
  const second = live.pullWind(open(), w.state, w.bump, {
    sharp: false,
    read: () => liveHold.promise,
    load: () => true,
    builtIn: async () => false,
  })
  hold.resolve()
  await first
  assert.equal(saw, false)
  assert.equal(w.state.time, "")
  assert.equal(w.state.builtIn, false)
  assert.equal(w.version, 0)
  const liveDoc = grid("2026-11-11T12:00:00Z")
  liveHold.resolve(liveDoc)
  await second
  assert.equal(w.state.time, liveDoc.time)
  assert.equal(w.state.builtIn, false)
  assert.equal(w.version, 1)
})

test("a slow wind response is not applied once a newer check has started", async () => {
  const open = live.pollEpoch()
  const w = slot()
  const slow = deferred()
  const applied = []
  const first = live.pullWind(open(), w.state, w.bump, {
    sharp: false,
    read: () => slow.promise,
    load: (doc) => { applied.push(doc.time); return true },
    builtIn: async () => { throw new Error("stale check must not fall back") },
  })
  const liveDoc = grid("2026-11-11T12:00:00Z")
  await live.pullWind(open(), w.state, w.bump, {
    sharp: false,
    read: async () => liveDoc,
    load: (doc) => { applied.push("new:" + doc.time); return true },
    builtIn: async () => false,
  })
  slow.resolve(grid("2026-11-11T18:00:00Z"))
  await first
  assert.deepEqual(applied, ["new:" + liveDoc.time])
  assert.equal(w.state.time, liveDoc.time)
  assert.equal(w.state.builtIn, false)
})

test("loadBuiltIn leaves a live field in place when apply flips during the fetch", async () => {
  const liveDoc = grid("2099-01-01T00:00:00Z")
  assert.equal(field.loadWind(liveDoc), true)
  assert.equal(field.FIELD_TIME, liveDoc.time)
  let apply = true
  const pending = field.loadBuiltIn(() => apply)
  apply = false
  assert.equal(await pending, false)
  assert.equal(field.FIELD_TIME, liveDoc.time)
  assert.equal(field.FIELD_READY, true)
  assert.equal(await field.loadBuiltIn(), true)
  assert.notEqual(field.FIELD_TIME, liveDoc.time)
  assert.match(field.FIELD_TIME, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00Z$/)
  assert.equal(field.FIELD_READY, true)
})
