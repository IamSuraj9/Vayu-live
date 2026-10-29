export type Level = { key: string; label: string; min: number; max: number; color: string; meaning: string }

// Draft plain-language scale on 1-minute sustained wind (knots). Wording is a proposal for review.
export const LEVELS: Level[] = [
  { key: "dep", label: "Depression", min: 0, max: 27, color: "#7fa6c8", meaning: "An organised area of low pressure. Showers and gusty winds." },
  { key: "deep", label: "Deep depression", min: 28, max: 33, color: "#4fc1b6", meaning: "A stronger low that can grow into a storm. Heavy rain is likely." },
  { key: "storm", label: "Storm", min: 34, max: 63, color: "#f1cf4a", meaning: "Damaging gusts, heavy rain and rough seas. Storms get a name at this stage." },
  { key: "severe", label: "Severe", min: 64, max: 95, color: "#f28b30", meaning: "Hurricane-force winds near the centre. Roofs, trees and power lines are at risk." },
  { key: "extreme", label: "Extreme", min: 96, max: 129, color: "#e9475a", meaning: "Very destructive winds, and a dangerous storm surge on the coast." },
  { key: "super", label: "Super", min: 130, max: 999, color: "#d36be0", meaning: "The strongest storms on Earth. Catastrophic damage near the centre." },
]

export function levelFor(kt: number): Level {
  return LEVELS.find(l => kt >= l.min && kt <= l.max) ?? LEVELS[0]
}

export function basinWord(basin: string): "cyclone" | "typhoon" | "hurricane" {
  if (/Pacific/.test(basin) && /West/.test(basin)) return "typhoon"
  if (/Eastern Pacific|Atlantic|Central Pacific/.test(basin)) return "hurricane"
  return "cyclone"
}

export function headline(kt: number, basin: string): string {
  const lv = levelFor(kt)
  const word = basinWord(basin)
  if (lv.key === "dep" || lv.key === "deep") return lv.label
  if (lv.key === "storm") return word === "cyclone" ? "Cyclonic storm" : "Tropical storm"
  return `${lv.label} ${word}`
}
