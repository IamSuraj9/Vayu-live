import world from "world-atlas/countries-50m.json"
import { feature, mesh } from "topojson-client"
import { geoContains } from "d3-geo"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const topo = world as any
export const land = feature(topo, topo.objects.land)
export const coastline = mesh(topo, topo.objects.land)
export const borders = mesh(topo, topo.objects.countries, (a: unknown, b: unknown) => a !== b)
export function isOverLand(lon: number, lat: number) {
  return geoContains(land, [lon, lat])
}
