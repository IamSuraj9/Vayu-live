export type RGB = [number, number, number]
type Stops = [number, RGB][] // wind speed in m/s -> colour

export const PALETTES = {
  classic: { label: "Classic", stops: [
    [0, [24, 30, 104]], [2, [32, 46, 150]], [4, [36, 70, 180]], [6, [32, 108, 190]], [8, [34, 146, 172]],
    [10, [52, 170, 122]], [12, [92, 190, 82]], [15, [176, 200, 62]], [18, [226, 170, 52]], [22, [230, 112, 52]],
    [27, [214, 56, 92]], [33, [178, 62, 190]], [40, [222, 172, 240]], [50, [255, 255, 255]],
  ] },
  turbo: { label: "Turbo", stops: [
    [0, [38, 20, 80]], [3, [58, 78, 200]], [7, [32, 150, 240]], [11, [40, 210, 200]], [15, [90, 232, 120]],
    [19, [190, 242, 60]], [24, [250, 200, 40]], [30, [250, 120, 30]], [36, [220, 50, 40]], [45, [140, 20, 30]],
  ] },
  ember: { label: "Ember", stops: [
    [0, [10, 6, 14]], [6, [60, 10, 44]], [12, [140, 20, 44]], [18, [222, 62, 32]], [25, [250, 150, 40]], [33, [255, 222, 124]], [45, [255, 250, 236]],
  ] },
  ice: { label: "Ice", stops: [
    [0, [6, 16, 42]], [6, [14, 52, 112]], [12, [30, 112, 192]], [20, [92, 192, 238]], [30, [192, 236, 252]], [45, [255, 255, 255]],
  ] },
  ink: { label: "Ink", stops: [
    [0, [234, 229, 217]], [5, [206, 215, 225]], [10, [152, 177, 207]], [16, [92, 122, 172]], [22, [50, 72, 132]],
    [30, [28, 40, 92]], [38, [150, 42, 52]], [48, [204, 52, 42]],
  ] },
  aurora: { label: "Aurora", stops: [
    [0, [6, 24, 42]], [5, [8, 92, 102]], [10, [22, 172, 152]], [16, [92, 226, 142]], [24, [212, 250, 152]], [32, [255, 202, 236]], [45, [255, 255, 255]],
  ] },
  mono: { label: "Mono", stops: [[0, [10, 10, 12]], [45, [255, 255, 255]]] },
} satisfies Record<string, { label: string; stops: Stops }>
export type PaletteKey = keyof typeof PALETTES

const SIZE = 4 * 60 + 1 // 0.25 m/s steps up to 60 m/s
const cache = new Map<PaletteKey, Uint8ClampedArray>()
export function lut(key: PaletteKey) {
  let t = cache.get(key)
  if (t) return t
  t = new Uint8ClampedArray(SIZE * 3)
  const s = PALETTES[key].stops as Stops
  for (let i = 0; i < SIZE; i++) {
    const v = i / 4
    let a = s[0], b = s[s.length - 1]
    for (let k = 0; k < s.length - 1; k++) if (v <= s[k + 1][0]) { a = s[k]; b = s[k + 1]; break }
    const f = v <= a[0] ? 0 : v >= b[0] ? 1 : (v - a[0]) / (b[0] - a[0])
    for (let c = 0; c < 3; c++) t[i * 3 + c] = a[1][c] + (b[1][c] - a[1][c]) * f
  }
  cache.set(key, t)
  return t
}
export function colorAt(key: PaletteKey, ms: number): RGB {
  const t = lut(key), i = Math.min(SIZE - 1, Math.max(0, Math.round(ms * 4))) * 3
  return [t[i], t[i + 1], t[i + 2]]
}

/** Six speed bands that match the app's strength scale: calm, breeze, fresh, gale, storm, hurricane-force (m/s). */
export const BAND_EDGES = [0, 3, 8, 14, 21, 33]
export const BAND_VALUE = [1.5, 5.5, 11, 17.5, 27, 40]
export const bandOf = (ms: number) => ms >= 33 ? 5 : ms >= 21 ? 4 : ms >= 14 ? 3 : ms >= 8 ? 2 : ms >= 3 ? 1 : 0

const lum = (c: RGB) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255
/** Keeps a palette colour readable as a thin mark on top of the globe: lifts dark colours on dark globes, darkens light ones on paper. */
export function legible(c: RGB, onLight: boolean): RGB {
  const l = lum(c)
  if (onLight) {
    const m = Math.min(0.85, Math.max(0, (l - 0.5) * 1.8))
    return [c[0] * (1 - m) + 24 * m, c[1] * (1 - m) + 34 * m, c[2] * (1 - m) + 78 * m]
  }
  const m = Math.min(0.9, Math.max(0, (0.5 - l) * 1.7))
  return [c[0] * (1 - m) + 255 * m, c[1] * (1 - m) + 255 * m, c[2] * (1 - m) + 255 * m]
}
export const rgba = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`

export const TEMP_STOPS: [number, RGB][] = [[235, [40, 60, 140]], [255, [60, 130, 200]], [273, [200, 230, 240]], [288, [250, 220, 120]], [300, [240, 140, 60]], [312, [200, 40, 40]]]
export function tempColor(k: number): RGB {
  const s = TEMP_STOPS
  if (k <= s[0][0]) return s[0][1]
  for (let i = 0; i < s.length - 1; i++) if (k <= s[i + 1][0]) {
    const f = (k - s[i][0]) / (s[i + 1][0] - s[i][0])
    return [0, 1, 2].map(c => s[i][1][c] + (s[i + 1][1][c] - s[i][1][c]) * f) as RGB
  }
  return s[s.length - 1][1]
}
