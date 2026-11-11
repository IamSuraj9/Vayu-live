// Unknown saved unit codes must not reach the wind switch, or the speed readout is NaN.
// Run: node --experimental-strip-types --test src/lib/units.test.ts   (from app/)
import assert from "node:assert/strict"
import { test } from "node:test"
import { defaultUnits, fmtWindMs, loadUnits, windFromMs, type Units } from "./units.ts"

const KEY = "vayu.units.v1"
const store = new Map<string, string>()

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v) },
    removeItem: (k: string) => { store.delete(k) },
    clear: () => { store.clear() },
  },
})

function save(value: unknown) {
  store.set(KEY, JSON.stringify(value))
}

test("an unknown saved value keeps that field's default", () => {
  const base = defaultUnits()
  const temp: Units["temp"] = base.temp === "c" ? "f" : "c"
  save({ wind: "beaufort", temp, press: "bar", dist: "nmi", time: "solar" })
  const units = loadUnits()
  assert.equal(units.wind, base.wind)
  assert.equal(units.temp, temp)
  assert.equal(units.press, base.press)
  assert.equal(units.dist, "nmi")
  assert.equal(units.time, base.time)
  assert.equal(Object.keys(units).length, 5)
  const speed = windFromMs(10, units.wind)
  assert.equal(Number.isFinite(speed), true)
  assert.equal(fmtWindMs(10, units.wind).includes("NaN"), false)
})

test("a valid saved choice still replaces the default", () => {
  const base = defaultUnits()
  const saved: Units = {
    wind: base.wind === "kt" ? "ms" : "kt",
    temp: base.temp === "c" ? "f" : "c",
    press: base.press === "hpa" ? "inhg" : "hpa",
    dist: "nmi",
    time: "utc",
  }
  save(saved)
  assert.deepEqual(loadUnits(), saved)
  assert.equal(Number.isFinite(windFromMs(10, saved.wind)), true)
})

test("a partial save keeps defaults for the fields it leaves out", () => {
  const base = defaultUnits()
  save({ wind: "mph" })
  assert.deepEqual(loadUnits(), { ...base, wind: "mph" })
})

test("missing or damaged storage keeps the defaults", () => {
  store.delete(KEY)
  assert.deepEqual(loadUnits(), defaultUnits())
  store.set(KEY, "{")
  assert.deepEqual(loadUnits(), defaultUnits())
  save(null)
  assert.deepEqual(loadUnits(), defaultUnits())
})
