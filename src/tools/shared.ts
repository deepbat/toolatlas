export function num(value: string, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function shortNumber(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(value);
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export function readAsDataURL(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function readAsArrayBuffer(file: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}
