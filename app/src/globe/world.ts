import low from "world-atlas/countries-110m.json"
import { feature, mesh } from "topojson-client"
import { geoContains } from "d3-geo"

// Two levels of detail: the light 1:110m map ships with the app and is drawn while the globe moves;
// the 1:50m map is fetched in the background and drawn once the globe is still and large on screen.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function build(topo: any) {
  return {
    land: feature(topo, topo.objects.land),
    coastline: mesh(topo, topo.objects.land),
    borders: mesh(topo, topo.objects.countries, (a: unknown, b: unknown) => a !== b),
  }
}
export type WorldLines = ReturnType<typeof build>

export const LOW = build(low)
export let HIGH: WorldLines | null = null
let pending: Promise<WorldLines> | null = null
export function loadHigh() {
  pending ??= import("world-atlas/countries-50m.json").then(m => (HIGH = build(m.default)))
  return pending
}

export function isOverLand(lon: number, lat: number) {
  return geoContains((HIGH ?? LOW).land, [lon, lat])
}
