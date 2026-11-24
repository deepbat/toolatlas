// Flattens editor annotations into the PDF with pdf-lib.
import {
  PDFArray,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFOperator,
  PDFRef,
  PDFString,
  StandardFonts,
  rgb,
} from 'pdf-lib';
import {
  Ann,
  AnnMap,
  FormFieldInfo,
  hexToRgb01,
  winAnsiOffenders,
} from './model';
import { encodeWithSourceFont, removeSourceTexts } from './streamEdit';

interface ExportOptions {
  bytes: ArrayBuffer;
  viewports: any[]; // pdf.js scale-1 viewports, index = 0-based page
  annots: AnnMap;
  formValues: Record<string, string | boolean>;
  formFields: FormFieldInfo[];
  flattenForms: boolean;
}

const ARROW_DEG = 150;

export async function exportEditedPdf(opts: ExportOptions): Promise<Uint8Array> {
  const { bytes, viewports, annots, formValues } = opts;
  const hasRedaction = Object.values(annots).some(list => list.some(a => a.kind === 'rect' && a.mode === 'redact'));
  const flattenForms = opts.flattenForms || hasRedaction;

  // Guard: standard fonts cannot print characters outside WinAnsi.
  const offenders = new Set<string>();
  for (const list of Object.values(annots)) {
    for (const a of list) {
      if (a.kind === 'text') for (const c of winAnsiOffenders(a.text)) offenders.add(c);
    }
  }
  if (offenders.size) {
    throw new Error(
      `The built-in PDF font cannot print: ${[...offenders].join(' ')}. Replace or remove these characters (they are usually emoji or non-Latin script).`
    );
  }

  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const fonts = {
    Helvetica: [await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold), await doc.embedFont(StandardFonts.HelveticaOblique), await doc.embedFont(StandardFonts.HelveticaBoldOblique)],
    Times: [await doc.embedFont(StandardFonts.TimesRoman), await doc.embedFont(StandardFonts.TimesRomanBold), await doc.embedFont(StandardFonts.TimesRomanItalic), await doc.embedFont(StandardFonts.TimesRomanBoldItalic)],
    Courier: [await doc.embedFont(StandardFonts.Courier), await doc.embedFont(StandardFonts.CourierBold), await doc.embedFont(StandardFonts.CourierOblique), await doc.embedFont(StandardFonts.CourierBoldOblique)],
  };
  const docPages = doc.getPages();

  for (const [key, list] of Object.entries(annots)) {
    const pageIdx = Number(key);
    const page = docPages[pageIdx];
    const vp = viewports[pageIdx];
    if (!page || !vp || !list.length) continue;

    // view space (scale 1, y-down) -> PDF space (y-up), rotation-aware
    const toPdf = (x: number, y: number): [number, number] => {
      const p = vp.convertToPdfPoint(x, y) as number[];
      return [p[0], p[1]];
    };
    const rectToPdf = (x: number, y: number, w: number, h: number) => {
      const [ax, ay] = toPdf(x, y);
      const [bx, by] = toPdf(x + w, y + h);
      return {
        x: Math.min(ax, bx),
        y: Math.min(ay, by),
        w: Math.abs(ax - bx),
        h: Math.abs(ay - by),
      };
    };

    const edits = list.flatMap(a => a.kind === 'text' && a.source?.edit ? a.source.edit : []);
    const editedStreams = edits.length ? removeSourceTexts(page, edits) : new Set<number>();
    for (const a of list) {
      if (a.kind === 'rect') {
        const r = rectToPdf(a.x, a.y, a.w, a.h);
        const [cr, cg, cb] = hexToRgb01(a.color);
        if (a.mode === 'highlight') {
          page.drawRectangle({ x: r.x, y: r.y, width: r.w, height: r.h, color: rgb(cr, cg, cb), opacity: 0.4 });
        } else if (a.mode === 'whiteout') {
          page.drawRectangle({ x: r.x, y: r.y, width: r.w, height: r.h, color: rgb(1, 1, 1), opacity: 1 });
        } else if (a.mode === 'redact') {
          page.drawRectangle({ x: r.x, y: r.y, width: r.w, height: r.h, color: rgb(0, 0, 0), opacity: 1 });
        } else {
          // underline / strike: a line through the stored line box
          const lineY = a.mode === 'underline' ? a.y + a.h - Math.max(1.5, a.h * 0.08) : a.y + a.h / 2;
          const [sx, sy] = toPdf(a.x, lineY);
          const [ex, ey] = toPdf(a.x + a.w, lineY);
          page.drawLine({
            start: { x: sx, y: sy },
            end: { x: ex, y: ey },
            thickness: Math.max(0.8, a.h * 0.06),
            color: rgb(cr, cg, cb),
            opacity: a.mode === 'underline' ? 1 : 0.95,
          });
        }
      } else if (a.kind === 'pen') {
        const parts: string[] = [];
        for (let i = 0; i < a.pts.length; i += 2) {
          const [px, py] = toPdf(a.pts[i], a.pts[i + 1]);
          parts.push(`${i === 0 ? 'M' : 'L'} ${px.toFixed(2)} ${py.toFixed(2)}`);
        }
        if (parts.length >= 2) {
          const [cr, cg, cb] = hexToRgb01(a.color);
          page.drawSvgPath(parts.join(' '), {
            borderColor: rgb(cr, cg, cb),
            borderWidth: a.width,
            borderLineCap: 1 as never, // LineCapStyle.Round
            borderOpacity: 1,
          });
        }
      } else if (a.kind === 'shape') {
        const [cr, cg, cb] = hexToRgb01(a.color);
        const col = rgb(cr, cg, cb);
        if (a.shape === 'rect') {
          const r = rectToPdf(a.x, a.y, a.w, a.h);
          page.drawRectangle({ x: r.x, y: r.y, width: r.w, height: r.h, borderColor: col, borderWidth: a.width });
        } else if (a.shape === 'ellipse') {
          const r = rectToPdf(a.x, a.y, a.w, a.h);
          page.drawEllipse({
            x: r.x + r.w / 2,
            y: r.y + r.h / 2,
            xScale: Math.max(1, r.w / 2),
            yScale: Math.max(1, r.h / 2),
            borderColor: col,
            borderWidth: a.width,
          });
        } else {
          const [ax, ay] = toPdf(a.x, a.y);
          const [bx, by] = toPdf(a.x + a.w, a.y + a.h);
          page.drawLine({ start: { x: ax, y: ay }, end: { x: bx, y: by }, thickness: a.width, color: col });
          if (a.shape === 'arrow') {
            const ang = Math.atan2(by - ay, bx - ax);
            const len = Math.max(8, a.width * 4);
            for (const d of [ARROW_DEG, -ARROW_DEG]) {
              const a2 = ang + (d * Math.PI) / 180;
              page.drawLine({
                start: { x: bx, y: by },
                end: { x: bx + len * Math.cos(a2), y: by + len * Math.sin(a2) },
                thickness: a.width,
                color: col,
              });
            }
          }
        }
      } else if (a.kind === 'text') {
        // Visual cover only when no source removal was planned, or when a
        // planned stream could not be rewritten after all.
        if (a.source && (!a.source.edit || a.source.edit.some(e => !editedStreams.has(e.obj)))) {
          const r = rectToPdf(a.source.x, a.source.y, a.source.w, a.source.h);
          const [r1, g1, b1] = hexToRgb01(a.source.background);
          page.drawRectangle({ x: r.x, y: r.y, width: r.w, height: r.h, color: rgb(r1, g1, b1) });
        }
        const font = fonts[a.fontFamily ?? 'Helvetica'][(a.bold ? 1 : 0) + (a.italic ? 2 : 0)];
        const [cr, cg, cb] = hexToRgb01(a.color);
        const src = a.source;
        const lines = a.text.split('\n');
        const unchanged = !!src && a.bold === src.bold0 && !!a.italic === src.italic0 && a.fontFamily === src.family0;
        const op = (name: string, ...args: any[]) => PDFOperator.of(name as any, args);
        const num = (n: number) => PDFNumber.of(Math.round(n * 1000) / 1000);
        lines.forEach((line, li) => {
          if (!line) return;
          const [px, py] = toPdf(a.x, a.y + a.size * 0.78 + li * a.size * 1.2);
          // 1. Reuse the original embedded font when every glyph exists in it.
          const enc = unchanged && src?.fontObj != null ? encodeWithSourceFont(doc, src.fontObj, line) : undefined;
          if (enc && src?.fontObj != null) {
            const tag = page.node.newFontDictionary('TAEdit' + src.fontObj, PDFRef.of(src.fontObj));
            page.pushOperators(
              op('q'), op('BT'),
              op('rg', num(cr), num(cg), num(cb)),
              op('Tf', tag, num(a.size)),
              op('Td', num(px), num(py)),
              op('Tj', PDFHexString.of(enc.hex)),
              op('ET'), op('Q'),
            );
            return;
          }
          // 2. Standard font, matched to the original weight and width.
          const info = src?.fontInfo;
          let useFont = font;
          let stroke = 0;
          if (unchanged && info && info.weight >= 450 && info.weight < 600 && !a.bold) {
            // Medium weights: regular outlines thickened with a thin stroke.
            stroke = Math.max(0.1, Math.min(0.5, ((info.stemV || 110) - 88) / 1000)) * a.size * 0.5;
          }
          let tz = 100;
          if (src?.str && src.w > 0 && !li) {
            const natural = useFont.widthOfTextAtSize(src.str, src.size0 ?? a.size);
            const target = src.w - 0.8;
            if (natural > 0 && target > 0 && line === src.str) tz = Math.max(85, Math.min(130, (target / natural) * 100));
          }
          const fontTag = page.node.newFontDictionary(useFont.name, useFont.ref);
          const ops = [
            op('q'), op('BT'),
            op('rg', num(cr), num(cg), num(cb)),
            op('Tf', fontTag, num(a.size)),
          ];
          if (stroke) ops.push(op('RG', num(cr), num(cg), num(cb)), op('w', num(stroke)), op('Tr', PDFNumber.of(2)));
          if (tz !== 100) ops.push(op('Tz', num(tz)));
          ops.push(op('Td', num(px), num(py)), op('Tj', PDFHexString.of(pdfEncodeWinAnsi(useFont, line))), op('ET'), op('Q'));
          page.pushOperators(...ops);
        });
      } else if (a.kind === 'image') {
        const m = /^data:image\/(png|jpe?g);base64,(.+)$/.exec(a.dataUrl);
        if (!m) continue;
        const bin = atob(m[2]);
        const bytesArr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytesArr[i] = bin.charCodeAt(i);
        const img = m[1] === 'png' ? await doc.embedPng(bytesArr) : await doc.embedJpg(bytesArr);
        const r = rectToPdf(a.x, a.y, a.w, a.h);
        page.drawImage(img, { x: r.x, y: r.y, width: r.w, height: r.h });
      } else if (a.kind === 'link') {
        const r = rectToPdf(a.x, a.y, a.w, a.h);
        let url = a.url.trim();
        if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
        if (!url) continue;
        const ref = doc.context.register(
          doc.context.obj({
            Type: 'Annot',
            Subtype: 'Link',
            Rect: [r.x, r.y, r.x + r.w, r.y + r.h],
            Border: [0, 0, 0],
            A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) },
          })
        );
        const existing = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
        if (existing) existing.push(ref);
        else page.node.set(PDFName.of('Annots'), doc.context.obj([ref]));
      }
    }
  }

  // Form values
  const entries = Object.entries(formValues);
  if (entries.length) {
    try {
      const form = doc.getForm();
      for (const [name, value] of entries) {
        try {
          form.getTextField(name).setText(String(value));
          continue;
        } catch { /* not a text field */ }
        try {
          const cb = form.getCheckBox(name);
          if (value) cb.check();
          else cb.uncheck();
          continue;
        } catch { /* not a checkbox */ }
        try {
          form.getDropdown(name).select(String(value));
          continue;
        } catch { /* not a dropdown */ }
        try {
          form.getRadioGroup(name).select(String(value));
          continue;
        } catch { /* not a radio group */ }
      }
      try {
        form.updateFieldAppearances(helv);
      } catch { /* some forms have broken appearances; values still set */ }
      if (flattenForms) {
        try {
          form.flatten({ updateFieldAppearances: false });
        } catch { /* flatten is best-effort */ }
      }
    } catch { /* no AcroForm in this document */ }
  }

  const saved = await doc.save();
  if (hasRedaction) {
    const { rasterRedactedPdf } = await import('./redactRaster');
    return rasterRedactedPdf(saved, annots);
  }
  return saved;
}

// WinAnsi bytes for a standard font's text (callers have checked offenders).
function pdfEncodeWinAnsi(font: { encodeText: (t: string) => { toString(): string } }, text: string): string {
  const hex = font.encodeText(text).toString();
  return hex.replace(/^<|>$/g, '');
}
