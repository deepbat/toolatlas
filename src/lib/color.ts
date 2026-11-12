export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface HSL {
  h: number;
  s: number;
  l: number;
}

export function normalizeHex(input: string): string | null {
  const value = input.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(value)) {
    return `#${value[0]}${value[0]}${value[1]}${value[1]}${value[2]}${value[2]}`.toLowerCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(value)) return `#${value.toLowerCase()}`;
  return null;
}

export function hexToRgb(hex: string): RGB | null {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  };
}

export function rgbToHex({ r, g, b }: RGB): string {
  const clampChannel = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
  return `#${[r, g, b]
    .map((channel) => clampChannel(channel).toString(16).padStart(2, '0'))
    .join('')}`;
}

export function rgbToHsl({ r, g, b }: RGB): HSL {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const l = (max + min) / 2;

  let h = 0;
  let s = 0;

  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case red:
        h = ((green - blue) / delta) % 6;
        break;
      case green:
        h = (blue - red) / delta + 2;
        break;
      default:
        h = (red - green) / delta + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }

  return { h, s: s * 100, l: l * 100 };
}

export function hslToRgb({ h, s, l }: HSL): RGB {
  const hue = ((h % 360) + 360) % 360;
  const saturation = Math.max(0, Math.min(100, s)) / 100;
  const lightness = Math.max(0, Math.min(100, l)) / 100;

  const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lightness - c / 2;

  let tuple: [number, number, number] = [0, 0, 0];
  if (hue < 60) tuple = [c, x, 0];
  else if (hue < 120) tuple = [x, c, 0];
  else if (hue < 180) tuple = [0, c, x];
  else if (hue < 240) tuple = [0, x, c];
  else if (hue < 300) tuple = [x, 0, c];
  else tuple = [c, 0, x];

  return {
    r: Math.round((tuple[0] + m) * 255),
    g: Math.round((tuple[1] + m) * 255),
    b: Math.round((tuple[2] + m) * 255),
  };
}

export function rgbToHsv({ r, g, b }: RGB): { h: number; s: number; v: number } {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === red) h = 60 * (((green - blue) / delta) % 6);
    else if (max === green) h = 60 * ((blue - red) / delta + 2);
    else h = 60 * ((red - green) / delta + 4);
  }
  if (h < 0) h += 360;

  return { h, s: max === 0 ? 0 : (delta / max) * 100, v: max * 100 };
}

export function rgbToCmyk({ r, g, b }: RGB): { c: number; m: number; y: number; k: number } {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const k = 1 - Math.max(red, green, blue);
  if (k === 1) return { c: 0, m: 0, y: 0, k: 100 };
  return {
    c: ((1 - red - k) / (1 - k)) * 100,
    m: ((1 - green - k) / (1 - k)) * 100,
    y: ((1 - blue - k) / (1 - k)) * 100,
    k: k * 100,
  };
}

export function readableTextColor(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#111111';
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance > 0.6 ? '#111111' : '#ffffff';
}
