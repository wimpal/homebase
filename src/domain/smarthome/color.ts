/** Hex (#RRGGBB) ↔ Dirigera hue/saturation + IKEA Tradfri colour presets. */

const HEX_RE = /^#([0-9a-fA-F]{6})$/;

/**
 * Official IKEA Home smart / Tradfri colour hex presets (from gateway property 5706 /
 * pytradfri COLOR_NAMES). Whites are listed for Mimir name→CT guidance; UI colour
 * swatches use chromatic only (`chromatic: true`).
 */
export const IKEA_COLOR_PRESETS = [
  { id: "blue", name: "Blue", hex: "#4A418A", chromatic: true },
  { id: "light_blue", name: "Light blue", hex: "#6C83BA", chromatic: true },
  { id: "saturated_purple", name: "Saturated purple", hex: "#8F2686", chromatic: true },
  { id: "lime", name: "Lime", hex: "#A9D62B", chromatic: true },
  { id: "light_purple", name: "Light purple", hex: "#C984BB", chromatic: true },
  { id: "yellow", name: "Yellow", hex: "#D6E44B", chromatic: true },
  { id: "saturated_pink", name: "Saturated pink", hex: "#D9337C", chromatic: true },
  { id: "dark_peach", name: "Dark peach", hex: "#DA5D41", chromatic: true },
  { id: "saturated_red", name: "Saturated red", hex: "#DC4B31", chromatic: true },
  { id: "pink", name: "Pink", hex: "#E491AF", chromatic: true },
  { id: "peach", name: "Peach", hex: "#E57345", chromatic: true },
  { id: "warm_amber", name: "Warm amber", hex: "#E78834", chromatic: true },
  { id: "light_pink", name: "Light pink", hex: "#E8BEDD", chromatic: true },
  // White / CT-ish presets (prefer color_temp_kelvin in UI; kept for name maps)
  { id: "cold_sky", name: "Cold sky", hex: "#DCF0F8", chromatic: false },
  { id: "cool_daylight", name: "Cool daylight", hex: "#EAF6FB", chromatic: false },
  { id: "candlelight", name: "Candlelight", hex: "#EBB63E", chromatic: false },
  { id: "warm_glow", name: "Warm glow", hex: "#EFD275", chromatic: false },
  { id: "warm_white", name: "Warm white", hex: "#F1E0B5", chromatic: false },
  { id: "sunrise", name: "Sunrise", hex: "#F2ECCF", chromatic: false },
  { id: "cool_white", name: "Cool white", hex: "#F5FAF6", chromatic: false },
] as const;

export type IkeaColorPresetId = (typeof IKEA_COLOR_PRESETS)[number]["id"];

export const IKEA_CHROMATIC_PRESETS = IKEA_COLOR_PRESETS.filter((p) => p.chromatic);

export function parseColorHex(hex: string): { r: number; g: number; b: number } | null {
  const match = HEX_RE.exec(hex.trim());
  if (!match) return null;
  const value = match[1];
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function normalizeHex(hex: string): string | null {
  const rgb = parseColorHex(hex);
  if (!rgb) return null;
  const toByte = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toByte(rgb.r)}${toByte(rgb.g)}${toByte(rgb.b)}`.toUpperCase();
}

export function findIkeaColorPreset(
  idOrHex: string,
): (typeof IKEA_COLOR_PRESETS)[number] | undefined {
  const raw = idOrHex.trim();
  const byId = IKEA_COLOR_PRESETS.find((p) => p.id === raw.toLowerCase().replace(/\s+/g, "_"));
  if (byId) return byId;
  const hex = normalizeHex(raw.startsWith("#") ? raw : `#${raw}`);
  if (!hex) return undefined;
  return IKEA_COLOR_PRESETS.find((p) => p.hex === hex);
}

/** Euclidean RGB distance → nearest IKEA preset (chromatic-only by default). */
export function nearestIkeaColorPreset(
  hex: string,
  options?: { chromaticOnly?: boolean },
): (typeof IKEA_COLOR_PRESETS)[number] | null {
  const rgb = parseColorHex(hex);
  if (!rgb) return null;
  const pool = options?.chromaticOnly === false ? IKEA_COLOR_PRESETS : IKEA_CHROMATIC_PRESETS;
  let best: (typeof IKEA_COLOR_PRESETS)[number] | null = null;
  let bestDist = Infinity;
  for (const preset of pool) {
    const pr = parseColorHex(preset.hex)!;
    const dist =
      (rgb.r - pr.r) ** 2 + (rgb.g - pr.g) ** 2 + (rgb.b - pr.b) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = preset;
    }
  }
  return best;
}

/** Resolve write colour: exact preset id/hex, else snap arbitrary hex to nearest chromatic. */
export function resolveIkeaColorHex(input: string): string | null {
  const exact = findIkeaColorPreset(input);
  if (exact) return exact.hex;
  const normalized = normalizeHex(input);
  if (!normalized) return null;
  return nearestIkeaColorPreset(normalized)?.hex ?? null;
}

/** Convert #RRGGBB to Dirigera colorHue (0–360) and colorSaturation (0–1). */
export function hexToHueSaturation(hex: string): { colorHue: number; colorSaturation: number } | null {
  const rgb = parseColorHex(hex);
  if (!rgb) return null;

  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let hue = 0;
  if (delta !== 0) {
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }

  const lightness = (max + min) / 2;
  const saturation =
    delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));

  return {
    colorHue: Math.round(hue * 1000) / 1000,
    colorSaturation: Math.min(1, Math.max(0, Math.round(saturation * 1000) / 1000)),
  };
}

/** Best-effort Dirigera HS → #RRGGBB (saturation 0–1, hue 0–360). */
export function hueSaturationToHex(colorHue: number, colorSaturation: number): string {
  const h = ((colorHue % 360) + 360) % 360;
  const s = Math.min(1, Math.max(0, colorSaturation));
  const v = 1;

  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;

  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  const toByte = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, "0");

  return `#${toByte(r)}${toByte(g)}${toByte(b)}`.toUpperCase();
}

/**
 * Clamp Kelvin to device range. Dirigera often reports inverted
 * colorTemperatureMin/Max (e.g. min=4000, max=2202).
 */
export function clampKelvin(
  kelvin: number,
  min?: number,
  max?: number,
): number {
  if (min == null || max == null || Number.isNaN(min) || Number.isNaN(max)) {
    return Math.round(Math.min(4000, Math.max(2200, kelvin)));
  }
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return Math.round(Math.min(hi, Math.max(lo, kelvin)));
}
