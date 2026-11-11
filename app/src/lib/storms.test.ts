// Run: npx tsx --test src/lib/storms.test.ts   (from app/)
import assert from "node:assert/strict"
import { test } from "node:test"
import { endMs, hasTrack, liveness, startMs, stateAt, withoutEmptyTracks, type Storm, type StormFile } from "./storms"

const point = (t: string, kt: number, lat = 10, lon = 140) => ({ t, lat, lon, kt })

function storm(id: string, track: Storm["track"] | undefined): Storm {
  const s = {
    id, name: id, kind: "typhoon", basin: "WP", forecast: [], source: "test", windAvg: "1-minute",
    track: track ?? [],
  } as Storm
  if (track === undefined) delete (s as { track?: Storm["track"] }).track
  return s
}

function file(storms: Storm[]): StormFile {
  return { schema: 1, snapshot: "2026-10-29T00:00:00Z", fetchedAt: "2026-10-29T08:00:00Z", sources: {}, credits: "", storms }
}

const kept = storm("kept", [point("2026-10-29T00:00:00Z", 40), point("2026-10-29T06:00:00Z", 60, 12, 142)])
const later = storm("later", [point("2026-10-29T00:00:00Z", 90, 20, 150)])

test("a missing or empty track is left out and the other storms stay", () => {
  const empty = storm("empty", [])
  const missing = storm("missing", undefined)
  const nulled = storm("nulled", [])
  nulled.track = null as unknown as Storm["track"]
  const raw = file([kept, empty, missing, nulled, null as unknown as Storm, later])
  const next = withoutEmptyTracks(raw)
  assert.deepEqual(next.storms.map(s => s.id), ["kept", "later"])
  assert.equal(next.storms[0], kept)
  assert.equal(next.storms[1], later)
  assert.equal(next.schema, raw.schema)
  assert.equal(next.fetchedAt, raw.fetchedAt)
  assert.notEqual(next, raw)
})

test("a file of valid storms is returned unchanged", () => {
  const raw = file([kept, later])
  assert.equal(withoutEmptyTracks(raw), raw)
  assert.equal(hasTrack(kept), true)
  assert.equal(hasTrack(storm("empty", [])), false)
  assert.equal(hasTrack(storm("missing", undefined)), false)
})

test("reading a trackless storm does not throw", () => {
  for (const s of [storm("empty", []), storm("missing", undefined)]) {
    assert.doesNotThrow(() => { startMs(s); endMs(s); stateAt(s); liveness(s, Date.parse("2026-10-29T08:00:00Z"), true) })
    assert.ok(Number.isNaN(startMs(s)))
    assert.ok(Number.isNaN(endMs(s)))
  }
})

test("a valid track still reports the same times and position", () => {
  assert.equal(startMs(kept), Date.parse("2026-10-29T00:00:00Z"))
  assert.equal(endMs(kept), Date.parse("2026-10-29T06:00:00Z"))
  const end = stateAt(kept)
  assert.equal(end.lat, 12)
  assert.equal(end.lon, 142)
  assert.equal(end.kt, 60)
  const mid = stateAt(kept, Date.parse("2026-10-29T03:00:00Z"))
  assert.equal(mid.lat, 11)
  assert.equal(mid.lon, 141)
  assert.equal(mid.kt, 50)
  const only = stateAt(later)
  assert.equal(only.lat, 20)
  assert.equal(only.lon, 150)
  assert.equal(only.kt, 90)
  const now = Date.parse("2026-10-29T08:00:00Z")
  assert.equal(liveness({ ...later, updated: "2026-10-29T06:00:00Z" }, now, true), "active")
  assert.equal(liveness({ ...later, updated: "2026-10-27T00:00:00Z" }, now, true), "gone")
})

test("the storm list can sort after a trackless record is removed", () => {
  const next = withoutEmptyTracks(file([later, storm("empty", []), kept]))
  const sorted = [...next.storms].sort((a, b) => b.track[b.track.length - 1].kt - a.track[a.track.length - 1].kt)
  assert.deepEqual(sorted.map(s => s.id), ["later", "kept"])
})
