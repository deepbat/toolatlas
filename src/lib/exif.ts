// Read-only EXIF / PNG text-chunk reader. Never executes or renders file content.
export interface MetaTag {
  group: string;
  name: string;
  value: string;
  sensitive?: boolean;
}
export interface MetaResult {
  kind: 'jpeg' | 'png' | 'webp' | 'other';
  tags: MetaTag[];
  gps?: { lat: number; lon: number };
}
const TAGS: Record<number, [string, string, boolean?]> = {
  0x010f: ['Make', 'Camera'], 0x0110: ['Model', 'Camera'], 0x0112: ['Orientation', 'Image'], 0x0131: ['Software', 'Image'],
  0x0132: ['DateTime', 'Image'], 0x013b: ['Artist', 'Owner', true], 0x8298: ['Copyright', 'Owner'], 0x010e: ['ImageDescription', 'Image'],
  0x829a: ['ExposureTime', 'Exposure'], 0x829d: ['FNumber', 'Exposure'], 0x8827: ['ISO', 'Exposure'], 0x9003: ['DateTimeOriginal', 'Exposure'],
  0x920a: ['FocalLength', 'Exposure'], 0xa433: ['LensMake', 'Camera'], 0xa434: ['LensModel', 'Camera'], 0xa002: ['PixelXDimension', 'Image'], 0xa003: ['PixelYDimension', 'Image'],
  0xa430: ['CameraOwnerName', 'Owner', true], 0xa431: ['BodySerialNumber', 'Camera', true],
};
const GPS_TAGS: Record<number, string> = { 1: 'GPSLatitudeRef', 2: 'GPSLatitude', 3: 'GPSLongitudeRef', 4: 'GPSLongitude', 5: 'GPSAltitudeRef', 6: 'GPSAltitude', 29: 'GPSDate' };
const SIZES = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8];

function readTiff(dv: DataView, base: number, tags: MetaTag[]) {
  const little = dv.getUint16(base, false) === 0x4949;
  const u16 = (o: number) => dv.getUint16(o, little);
  const u32 = (o: number) => dv.getUint32(o, little);
  if (u16(base + 2) !== 42) return;
  const value = (type: number, count: number, off: number): string | number[] | string[] => {
    const size = SIZES[type] * count;
    const at = size > 4 ? base + u32(off) : off;
    if (at < 0 || at + size > dv.byteLength) return '';
    if (type === 2) {
      let s = '';
      for (let i = 0; i < count; i++) {
        const c = dv.getUint8(at + i);
        if (c === 0) break;
        s += String.fromCharCode(c);
      }
      return s.trim();
    }
    const out: number[] = [];
    for (let i = 0; i < Math.min(count, 8); i++) {
      const p = at + i * SIZES[type];
      if (type === 3) out.push(u16(p));
      else if (type === 4) out.push(u32(p));
      else if (type === 5) out.push(u32(p) / (u32(p + 4) || 1));
      else if (type === 1 || type === 7) out.push(dv.getUint8(p));
      else if (type === 9) out.push(dv.getInt32(p, little));
      else if (type === 10) out.push(dv.getInt32(p, little) / (dv.getInt32(p + 4, little) || 1));
    }
    return out;
  };
  const ifd = (offset: number, kind: 'main' | 'gps', depth = 0) => {
    if (depth > 3 || base + offset + 2 > dv.byteLength) return;
    const n = Math.min(u16(base + offset), 200);
    const gps: Record<string, string | number[] | string[]> = {};
    for (let i = 0; i < n; i++) {
      const e = base + offset + 2 + i * 12;
      if (e + 12 > dv.byteLength) break;
      const tag = u16(e), type = u16(e + 2), count = u32(e + 4);
      if (type < 1 || type > 12 || count > 100000) continue;
      if (kind === 'main' && (tag === 0x8769 || tag === 0x8825)) {
        ifd(u32(e + 8), tag === 0x8825 ? 'gps' : 'main', depth + 1);
        continue;
      }
      const v = value(type, count, e + 8);
      if (kind === 'gps') {
        const name = GPS_TAGS[tag];
        if (name) gps[name] = v;
      } else if (TAGS[tag]) {
        const [name, group, sensitive] = TAGS[tag];
        const first = Array.isArray(v) ? Number(v[0]) : NaN;
        const shown = Array.isArray(v) ? (tag === 0x829a && first > 0 && first < 1 ? `1/${Math.round(1 / first)} s` : v.join(', ')) : String(v);
        if (shown) tags.push({ group, name, value: shown, sensitive });
      }
    }
    if (kind === 'gps' && gps.GPSLatitude && gps.GPSLongitude) {
      const dms = (a: unknown) => { const x = a as number[]; return x[0] + (x[1] || 0) / 60 + (x[2] || 0) / 3600; };
      let lat = dms(gps.GPSLatitude), lon = dms(gps.GPSLongitude);
      if (String(gps.GPSLatitudeRef).startsWith('S')) lat = -lat;
      if (String(gps.GPSLongitudeRef).startsWith('W')) lon = -lon;
      tags.push({ group: 'Location', name: 'GPS position', value: `${lat.toFixed(6)}, ${lon.toFixed(6)}`, sensitive: true });
    }
  };
  ifd(u32(base + 4), 'main');
}

export function parseExif(buf: ArrayBuffer): MetaResult & { gps?: undefined } {
  const dv = new DataView(buf);
  const tags: MetaTag[] = [];
  if (dv.byteLength > 4 && dv.getUint16(0) === 0xffd8) {
    let p = 2;
    while (p + 4 < dv.byteLength) {
      if (dv.getUint8(p) !== 0xff) break;
      const marker = dv.getUint8(p + 1);
      if (marker === 0xda || marker === 0xd9) break;
      const len = dv.getUint16(p + 2);
      if (marker === 0xe1 && len > 8 && dv.getUint32(p + 4) === 0x45786966) {
        try { readTiff(new DataView(buf, p + 10, Math.min(len - 8, dv.byteLength - p - 10)), 0, tags); } catch { /* damaged EXIF is ignored */ }
      } else if (marker === 0xe1 && new TextDecoder().decode(new Uint8Array(buf, p + 4, Math.min(28, len))).startsWith('http://ns.adobe.com/xap')) {
        tags.push({ group: 'Embedded', name: 'XMP packet', value: `${len} bytes`, sensitive: true });
      } else if (marker === 0xed) tags.push({ group: 'Embedded', name: 'Photoshop/IPTC block', value: `${len} bytes` });
      else if (marker === 0xe2) tags.push({ group: 'Embedded', name: 'ICC colour profile', value: `${len} bytes` });
      p += 2 + len;
    }
    return { kind: 'jpeg', tags };
  }
  if (dv.byteLength > 8 && dv.getUint32(0) === 0x89504e47) {
    let p = 8;
    const dec = new TextDecoder('latin1');
    while (p + 12 <= dv.byteLength) {
      const len = dv.getUint32(p);
      const type = dec.decode(new Uint8Array(buf, p + 4, 4));
      if (type === 'tEXt' || type === 'iTXt' || type === 'zTXt') {
        const body = new Uint8Array(buf, p + 8, Math.min(len, 4096));
        const z = body.indexOf(0);
        tags.push({ group: 'PNG text', name: dec.decode(body.subarray(0, z)) || type, value: type === 'tEXt' ? dec.decode(body.subarray(z + 1)).slice(0, 500) : '(compressed or international text)' });
      } else if (type === 'eXIf') {
        try { readTiff(new DataView(buf, p + 8, len), 0, tags); } catch { /* ignore */ }
      } else if (type === 'IEND') break;
      p += 12 + len;
    }
    return { kind: 'png', tags };
  }
  if (dv.byteLength > 12 && dv.getUint32(0) === 0x52494646 && dv.getUint32(8) === 0x57454250) {
    let p = 12;
    while (p + 8 <= dv.byteLength) {
      const type = String.fromCharCode(dv.getUint8(p), dv.getUint8(p + 1), dv.getUint8(p + 2), dv.getUint8(p + 3));
      const len = dv.getUint32(p + 4, true);
      if (type === 'EXIF') {
        let o = p + 8;
        if (dv.getUint32(o) === 0x45786966) o += 6;
        try { readTiff(new DataView(buf, o, Math.min(len, dv.byteLength - o)), 0, tags); } catch { /* ignore */ }
      } else if (type === 'XMP ') tags.push({ group: 'Embedded', name: 'XMP packet', value: `${len} bytes`, sensitive: true });
      p += 8 + len + (len & 1);
    }
    return { kind: 'webp', tags };
  }
  return { kind: 'other', tags };
}

/** Removes metadata segments from a JPEG without re-encoding. Returns null when it cannot do so safely. */
export function stripJpeg(buf: ArrayBuffer): { bytes: Uint8Array; removed: number } | null {
  const u = new Uint8Array(buf);
  if (u[0] !== 0xff || u[1] !== 0xd8) return null;
  const parts: Uint8Array[] = [u.subarray(0, 2)];
  let p = 2;
  let removed = 0;
  const dv = new DataView(buf);
  while (p + 4 <= u.length) {
    if (u[p] !== 0xff) return null;
    const marker = u[p + 1];
    if (marker === 0xda) {
      parts.push(u.subarray(p));
      break;
    }
    if (marker >= 0xd0 && marker <= 0xd7) { parts.push(u.subarray(p, p + 2)); p += 2; continue; }
    const len = dv.getUint16(p + 2);
    const end = p + 2 + len;
    if (end > u.length) return null;
    // APP1 (EXIF, XMP), APP13 (IPTC) and COM (comments) are metadata. APP0, APP2 (colour profile) and others stay.
    if (marker === 0xe1 || marker === 0xed || marker === 0xfe) removed += end - p;
    else parts.push(u.subarray(p, end));
    p = end;
  }
  const out = new Uint8Array(parts.reduce((s, x) => s + x.length, 0));
  let o = 0;
  for (const x of parts) { out.set(x, o); o += x.length; }
  return { bytes: out, removed };
}
/** Drops text, time and EXIF chunks from a PNG without re-encoding. */
export function stripPng(buf: ArrayBuffer): { bytes: Uint8Array; removed: number } | null {
  const u = new Uint8Array(buf);
  const dv = new DataView(buf);
  if (dv.getUint32(0) !== 0x89504e47) return null;
  const parts: Uint8Array[] = [u.subarray(0, 8)];
  let p = 8, removed = 0;
  while (p + 12 <= u.length) {
    const len = dv.getUint32(p);
    const type = String.fromCharCode(u[p + 4], u[p + 5], u[p + 6], u[p + 7]);
    const end = p + 12 + len;
    if (end > u.length) return null;
    if (['tEXt', 'iTXt', 'zTXt', 'eXIf', 'tIME'].includes(type)) removed += end - p;
    else parts.push(u.subarray(p, end));
    p = end;
    if (type === 'IEND') break;
  }
  const out = new Uint8Array(parts.reduce((s, x) => s + x.length, 0));
  let o = 0;
  for (const x of parts) { out.set(x, o); o += x.length; }
  return { bytes: out, removed };
}
