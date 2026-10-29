import type { PaletteKey } from "./palettes"

export type Earth = "void" | "slate" | "night" | "paper" | "dots"
export type Fill = "none" | "wind" | "bands" | "zones" | "relief" | "temp"
export type WindMark = "none" | "particles" | "glow" | "lines" | "flow" | "arrows" | "barbs" | "shimmer"
export type Cfg = {
  earth: Earth; fill: Fill; palette: PaletteKey; wind: WindMark; color: "plain" | "speed"
  isobars: "off" | "lines" | "hl"; map: "none" | "coast" | "borders" | "grid"; storms: "spiral" | "rings" | "eye"
}

export const OPTIONS: { key: keyof Cfg; label: string; items: [string, string][] }[] = [
  { key: "earth", label: "Earth", items: [["void", "Void"], ["slate", "Slate"], ["night", "Night"], ["paper", "Paper"], ["dots", "Dots"]] },
  { key: "fill", label: "Colour fill", items: [["none", "None"], ["wind", "Wind"], ["bands", "Bands"], ["zones", "Lows & highs"], ["relief", "Relief"], ["temp", "Temperature"]] },
  { key: "palette", label: "Palette", items: [["classic", "Classic"], ["turbo", "Turbo"], ["ember", "Ember"], ["ice", "Ice"], ["ink", "Ink"], ["aurora", "Aurora"], ["mono", "Mono"]] },
  { key: "wind", label: "Wind", items: [["none", "None"], ["particles", "Particles"], ["glow", "Glow"], ["lines", "Streamlines"], ["flow", "Flow"], ["arrows", "Arrows"], ["barbs", "Barbs"], ["shimmer", "Shimmer"]] },
  { key: "color", label: "Wind colour", items: [["plain", "Plain"], ["speed", "By speed"]] },
  { key: "isobars", label: "Pressure lines", items: [["off", "Off"], ["lines", "Isobars"], ["hl", "Isobars + H/L"]] },
  { key: "map", label: "Map lines", items: [["none", "None"], ["coast", "Coast"], ["borders", "Borders"], ["grid", "Grid"]] },
  { key: "storms", label: "Storm marks", items: [["spiral", "Spiral"], ["rings", "Rings"], ["eye", "Eye"]] },
]

export type Preset = {
  id: string; name: string; tagline: string; cfg: Cfg
  look: string; bestFor: string; watch: string
}

export const PRESETS: Preset[] = [
  {
    id: "heat", name: "Heat", tagline: "What we have today",
    cfg: { earth: "void", fill: "wind", palette: "classic", wind: "particles", color: "plain", isobars: "off", map: "borders", storms: "spiral" },
    look: "The familiar wind-map look: every pixel coloured by wind speed, white streaks moving on top.",
    bestFor: "Instantly feels like a weather product. Shows the whole planet's wind at once.",
    watch: "The colours compete with the storm markers. Every ocean is tinted, so a calm day and a cyclone day look alike at a glance.",
  },
  {
    id: "ink", name: "Ink", tagline: "Printed atlas on black",
    cfg: { earth: "paper", fill: "wind", palette: "ink", wind: "lines", color: "speed", isobars: "off", map: "coast", storms: "eye" },
    look: "A warm paper globe floating in the dark. Wind is drawn as fine ink streamlines that thicken and turn vermilion where it blows hard.",
    bestFor: "Calm, editorial and very readable. Direction of the wind is obvious from the curves, and storms stand out in red.",
    watch: "A bright globe on a black page is a strong contrast and can glare at night. Wind speed reads from line weight, so it is subtler than colour.",
  },
  {
    id: "night", name: "Night", tagline: "Cinematic",
    cfg: { earth: "night", fill: "none", palette: "aurora", wind: "glow", color: "speed", isobars: "off", map: "coast", storms: "rings" },
    look: "A lit sphere with a real day and night side, a blue atmosphere, city lights, and wind as glowing particles that change colour with speed.",
    bestFor: "The most atmospheric. Makes the planet feel alive and gives the storms a stage. Good for the first screen and for sharing.",
    watch: "The day and night shading is decorative here and could be mistaken for a forecast layer. City lights are a sample of large cities, not a data layer.",
  },
  {
    id: "dots", name: "Dots", tagline: "Data art",
    cfg: { earth: "dots", fill: "none", palette: "ember", wind: "shimmer", color: "speed", isobars: "off", map: "none", storms: "eye" },
    look: "The continents are made of dots, the oceans are empty, and the wind is a field of short strokes that shimmer and lengthen as it strengthens.",
    bestFor: "Graphic and modern. Light on the eyes and the GPU. The ember colours make strong wind glow like heat.",
    watch: "Fine coastlines disappear, which makes small islands harder to place. Direction reads less clearly than with lines.",
  },
  {
    id: "chart", name: "Chart", tagline: "Forecaster's map",
    cfg: { earth: "slate", fill: "zones", palette: "ice", wind: "barbs", color: "plain", isobars: "hl", map: "grid", storms: "spiral" },
    look: "A slate globe with isobars every 4 hPa, big H and L markers, lows tinted violet and highs amber, and wind barbs.",
    bestFor: "The most informative about depressions: you can see where pressure is low and where the wind is tightest around it. Matches what meteorologists use.",
    watch: "Barbs and isobars need explaining for a general audience. It is the densest of the eight.",
  },
  {
    id: "relief", name: "Relief", tagline: "Pressure as landscape",
    cfg: { earth: "slate", fill: "relief", palette: "ice", wind: "flow", color: "plain", isobars: "off", map: "coast", storms: "rings" },
    look: "Air pressure drawn as terrain: low pressure sinks into soft valleys and high pressure rises. Wind flows over it as moving dashes.",
    bestFor: "A natural way to show what a depression is: a dip in the atmosphere that air spirals into. Beautiful, and needs no legend.",
    watch: "Subtle. The relief shows large systems well and tiny cyclones weakly, and it does not show wind strength by itself.",
  },
  {
    id: "bands", name: "Bands", tagline: "Six clear steps",
    cfg: { earth: "void", fill: "bands", palette: "turbo", wind: "arrows", color: "plain", isobars: "off", map: "borders", storms: "spiral" },
    look: "Wind is grouped into six flat bands (calm, breeze, fresh, gale, storm, hurricane-force) with crisp edges, and arrows show direction.",
    bestFor: "The easiest to read and to explain. The six bands line up with the app's strength scale, so the legend is short.",
    watch: "Hard edges look blocky, and a small change in wind can flip a whole region's colour.",
  },
  {
    id: "ribbons", name: "Ribbons", tagline: "Luminous flow",
    cfg: { earth: "void", fill: "none", palette: "turbo", wind: "lines", color: "speed", isobars: "off", map: "coast", storms: "rings" },
    look: "No fill at all. Long, smooth curves of light follow the wind and are coloured by speed, with the coastlines as the only map.",
    bestFor: "Elegant and quiet, and the clearest picture of how air flows. Leaves room for storms and labels.",
    watch: "Without fill, slow regions look empty, which can read as missing data. Static curves show direction but not motion.",
  },
]
