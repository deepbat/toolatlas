/**
 * Pure helpers for the Device & Sensor tools. Kept free of DOM and React so
 * the unit tests (scripts/device-unit.ts) can exercise the maths directly.
 */

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/* ---- Sound meter -------------------------------------------------------- */

/** dBFS from an RMS amplitude in 0..1. Silence is -100 dBFS. */
export function dbfsFromRms(rms: number): number {
  if (!Number.isFinite(rms) || rms <= 0) return -100;
  return Math.max(-100, 20 * Math.log10(rms));
}

/** Map a dBFS reading to a 0..100 display level (floor -60 dB). */
export function meterLevel(dbfs: number): number {
  return clamp(((dbfs + 60) / 60) * 100, 0, 100);
}

/* ---- Music -------------------------------------------------------------- */

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

export interface NoteReading {
  name: string;
  octave: number;
  /** Signed distance from the nearest equal-tempered note. */
  cents: number;
  /** Frequency of that nearest note. */
  target: number;
}

/** Nearest equal-tempered note for a frequency (A4 = 440 Hz). */
export function noteFromFreq(freq: number): NoteReading | null {
  if (!Number.isFinite(freq) || freq < 20 || freq > 5000) return null;
  const midi = 69 + 12 * Math.log2(freq / 440);
  const nearest = Math.round(midi);
  const cents = Math.round((midi - nearest) * 100);
  const name = NOTE_NAMES[((nearest % 12) + 12) % 12];
  const octave = Math.floor(nearest / 12) - 1;
  const target = 440 * Math.pow(2, (nearest - 69) / 12);
  return { name, octave, cents, target };
}

/** Autocorrelation pitch estimate for a mono time-domain buffer. */
export function detectPitch(buf: Float32Array, sampleRate: number): number | null {
  const SIZE = buf.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.01) return null;
  let start = 0;
  let end = SIZE - 1;
  const edge = 0.2;
  for (let i = 0; i < SIZE / 2; i++) if (Math.abs(buf[i]) < edge) { start = i; break; }
  for (let i = 1; i < SIZE / 2; i++) if (Math.abs(buf[SIZE - i]) < edge) { end = SIZE - i; break; }
  const range = end - start;
  if (range < 32) return null;
  const correlations = new Array<number>(range).fill(0);
  for (let lag = 0; lag < range; lag++) {
    for (let i = 0; i < range - lag; i++) correlations[lag] += buf[start + i] * buf[start + i + lag];
  }
  let d = 0;
  while (d < range - 1 && correlations[d] > correlations[d + 1]) d++;
  let maxPos = -1;
  let maxVal = -1;
  for (let i = d; i < range; i++) {
    if (correlations[i] > maxVal) { maxVal = correlations[i]; maxPos = i; }
  }
  if (maxPos <= 0) return null;
  const x0 = correlations[maxPos - 1] ?? 0;
  const x1 = correlations[maxPos];
  const x2 = correlations[maxPos + 1] ?? 0;
  const a = (x0 + x2 - 2 * x1) / 2;
  const shift = a ? (x2 - x0) / (4 * a) : 0;
  const freq = sampleRate / (maxPos + shift);
  if (!Number.isFinite(freq) || freq < 40 || freq > 2000) return null;
  return freq;
}

/** Clamp a metronome tempo to the supported range. */
export const clampBpm = (bpm: number) => clamp(Math.round(bpm), 30, 300);

/** Clamp a tone generator frequency to 20 Hz - 20 kHz. */
export const clampFreq = (freq: number) => clamp(freq, 20, 20000);

/* ---- Morse code --------------------------------------------------------- */

export const MORSE: Record<string, string> = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....',
  I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.',
  Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-',
  Y: '-.--', Z: '--..',
  '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-',
  '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.',
  '.': '.-.-.-', ',': '--..--', '?': '..--..', '!': '-.-.--', '/': '-..-.',
  '@': '.--.-.', '-': '-....-', '(': '-.--.', ')': '-.--.-', '&': '.-...',
  ':': '---...', ';': '-.-.-.', '=': '-...-', '+': '.-.-.', '"': '.-..-.',
  "'": '.----.', _: '..--.-', '$': '...-..-',
};

const MORSE_REVERSE: Record<string, string> = Object.fromEntries(
  Object.entries(MORSE).map(([char, code]) => [code, char]),
);

/** Letters separated by spaces, words by " / ". Unsupported characters are dropped. */
export function textToMorse(text: string): string {
  return text
    .toUpperCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) =>
      [...word]
        .map((char) => MORSE[char])
        .filter(Boolean)
        .join(' '),
    )
    .filter(Boolean)
    .join(' / ');
}

export function morseToText(code: string): string {
  return code
    .trim()
    .split(/\s*\/\s+|\s+\/\s*/)
    .map((word) =>
      word
        .split(/\s+/)
        .map((symbol) => MORSE_REVERSE[symbol] ?? '')
        .join(''),
    )
    .filter(Boolean)
    .join(' ');
}

/* ---- Compass ------------------------------------------------------------ */

const CARDINALS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

/** 16-point cardinal label for a heading in degrees (0 = north). */
export function cardinalFromHeading(deg: number): string {
  const norm = ((deg % 360) + 360) % 360;
  return CARDINALS[Math.round(norm / 22.5) % 16];
}

/* ---- Screen ruler ------------------------------------------------------- */

/** CSS pixels per millimetre for a measured on-screen width in pixels. */
export const pxPerMm = (widthPx: number, realMm: number): number =>
  realMm > 0 ? widthPx / realMm : 0;

/** Default CSS pixel density: 96 px per inch. */
export const DEFAULT_PX_PER_MM = 96 / 25.4;

/** Ruler tick positions in mm for a length, with a label every 10 mm. */
export function rulerTicks(lengthMm: number): { mm: number; label: boolean }[] {
  const ticks: { mm: number; label: boolean }[] = [];
  for (let mm = 0; mm <= Math.floor(lengthMm); mm++) ticks.push({ mm, label: mm % 10 === 0 });
  return ticks;
}

/* ---- GPS speed ---------------------------------------------------------- */

export type SpeedUnit = 'kmh' | 'mph' | 'kn';

export function formatSpeed(mps: number | null, unit: SpeedUnit): string {
  if (mps == null || !Number.isFinite(mps) || mps < 0) return '--';
  const value = unit === 'kmh' ? mps * 3.6 : unit === 'mph' ? mps * 2.23694 : mps * 1.94384;
  return value < 10 ? value.toFixed(1) : String(Math.round(value));
}

export const SPEED_UNIT_LABEL: Record<SpeedUnit, string> = { kmh: 'km/h', mph: 'mph', kn: 'knots' };

/** Haversine distance in metres between two coordinates. */
export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/* ---- Speech to text ----------------------------------------------------- */

export type SpeechSupport = 'no-api' | 'remote-only' | 'on-device';

/**
 * Classify what the browser's speech recognition can do. Only 'on-device'
 * (the `processLocally` switch, Chrome/Edge 139+ on desktop and Firefox
 * 160+) keeps the site's promise that audio never leaves the device;
 * 'remote-only' browsers may send voice audio to the browser maker's
 * speech service, so the tool fails closed there.
 */
export function speechSupport(
  Ctor: (new (...args: never[]) => unknown) | null | undefined,
): SpeechSupport {
  if (!Ctor) return 'no-api';
  return 'processLocally' in Ctor.prototype ? 'on-device' : 'remote-only';
}
