/** Hex (#RRGGBB) ↔ Dirigera hue/saturation helpers for lights.set_state / list. */

const HEX_RE = /^#([0-9a-fA-F]{6})$/;

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
