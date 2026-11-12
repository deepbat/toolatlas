import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { Button, Dropzone, Input, Note, Panel, Select, Toggle } from '../../components/ui';
import { downloadBlob, formatBytes } from '../../lib/utils';
import { pdfjs, PageInfo } from './pdfjs';
import PageView from './PageView';
import SignaturePad from './SignaturePad';
import Thumbs from './Thumbs';
import { TOOL_DEFS, ToolButton, IconBtn, type ToolId } from './Toolbar';
import { Minus, Plus, Undo2, Redo2, Download } from './Toolbar';
import { Ann, AnnMap, FormFieldInfo, TextItemRect, type ShapeKind } from './model';
import { exportEditedPdf } from './exportPdf';

const MAX_BYTES = 40 * 1024 * 1024;
const MAX_PAGES = 200;

interface Match {
  page: number;
  rect: { x: number; y: number; w: number; h: number };
}

export default function PdfEditor() {
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState(0);
  const bytesRef = useRef<ArrayBuffer | null>(null);
  const pdfDocRef = useRef<any>(null);
  const viewportsRef = useRef<any[]>([]);
  const [docReady, setDocReady] = useState(0); // increments when a doc loads
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [annots, setAnnots] = useState<AnnMap>({});
  const annotsRef = useRef<AnnMap>({});
  annotsRef.current = annots;
  const historyRef = useRef<AnnMap[]>([]);
  const futureRef = useRef<AnnMap[]>([]);
  const [histVersion, setHistVersion] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [tool, setTool] = useState<ToolId>('select');
  const [color, setColor] = useState('#ffe359');
  const [textColor, setTextColor] = useState('#111111');
  const [fontSize, setFontSize] = useState(16);
  const [bold, setBold] = useState(false);
  const [strokeW, setStrokeW] = useState(2.5);
  const [shape, setShape] = useState<ShapeKind>('rect');
  const [zoom, setZoom] = useState<'fit' | number>('fit');
  const [fitScale, setFitScale] = useState(1);
  const [currentPage, setCurrentPage] = useState(0);
  const [formFields, setFormFields] = useState<FormFieldInfo[]>([]);
  const [formValues, setFormValues] = useState<Record<string, string | boolean>>({});
  const [flattenForms, setFlattenForms] = useState(true);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [matches, setMatches] = useState<Match[]>([]);
  const [matchIdx, setMatchIdx] = useState(0);
  const [findFlash, setFindFlash] = useState<(Match & { key: number }) | null>(null);
  const textCacheRef = useRef<Record<number, TextItemRect[]>>({});
  const [sigOpen, setSigOpen] = useState(false);
  const [pendingImage, setPendingImage] = useState<{ dataUrl: string; w: number; h: number; label: string } | null>(null);
  const [linkDraft, setLinkDraft] = useState<{ page: number; x: number; y: number; w: number; h: number } | null>(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageElsRef = useRef<(HTMLDivElement | null)[]>([]);
  const dragSnapRef = useRef<AnnMap | null>(null);
  const textSnapRef = useRef<AnnMap | null>(null);

  const scale = zoom === 'fit' ? fitScale : zoom;
  const loaded = pages.length > 0;

  /* ------------------------------------------------------------ history */

  const pushHistory = useCallback((snap: AnnMap) => {
    historyRef.current.push(snap);
    if (historyRef.current.length > 60) historyRef.current.shift();
    futureRef.current = [];
    setHistVersion((v) => v + 1);
  }, []);

  const applyChange = useCallback(
    (fn: (m: AnnMap) => void) => {
      pushHistory(annotsRef.current);
      const next = structuredClone(annotsRef.current);
      fn(next);
      setAnnots(next);
    },
    [pushHistory]
  );

  const undo = useCallback(() => {
    const h = historyRef.current;
    if (!h.length) return;
    futureRef.current.push(annotsRef.current);
    setAnnots(h.pop()!);
    setSelected(null);
    setHistVersion((v) => v + 1);
  }, []);

  const redo = useCallback(() => {
    const f = futureRef.current;
    if (!f.length) return;
    historyRef.current.push(annotsRef.current);
    setAnnots(f.pop()!);
    setSelected(null);
    setHistVersion((v) => v + 1);
  }, []);

  /* ------------------------------------------------------------- loading */

  const loadFile = useCallback(async (file: File) => {
    setError('');
    setNotice('');
    if (file.size > MAX_BYTES) {
      setError(`This file is ${formatBytes(file.size)}. Choose a PDF under ${formatBytes(MAX_BYTES)} to protect phone memory.`);
      return;
    }
    setBusy(true);
    try {
      const bytes = await file.arrayBuffer();
      const lib = pdfjs();
      let doc: any;
      try {
        doc = await lib.getDocument({ data: bytes.slice(0) }).promise;
      } catch {
        throw new Error('Could not open this PDF. Password-protected and damaged PDFs are not supported.');
      }
      if (doc.numPages > MAX_PAGES) throw new Error(`This PDF has ${doc.numPages} pages; the editor supports up to ${MAX_PAGES}.`);

      try {
        pdfDocRef.current?.destroy();
      } catch { /* noop */ }
      const infos: PageInfo[] = [];
      const vps: any[] = [];
      const fields: FormFieldInfo[] = [];
      const values: Record<string, string | boolean> = {};

      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const vp = page.getViewport({ scale: 1 });
        infos.push({ num: i, viewW: vp.width, viewH: vp.height });
        vps.push(vp);
        let widgets: any[] = [];
        try {
          const ans = await page.getAnnotations({ intent: 'display' });
          widgets = ans.filter((a: any) => a.subtype === 'Widget' && a.fieldName && !a.pushButton && a.fieldType !== 'Sig');
        } catch { /* no annotations */ }
        for (const w of widgets) {
          const [x1, y1] = vp.convertToViewportPoint(w.rect[0], w.rect[1]);
          const [x2, y2] = vp.convertToViewportPoint(w.rect[2], w.rect[3]);
          const rect = {
            x: Math.min(x1, x2), y: Math.min(y1, y2),
            w: Math.abs(x2 - x1), h: Math.abs(y2 - y1),
          };
          if (w.fieldType === 'Tx') {
            fields.push({ name: w.fieldName, type: 'text', page: i - 1, ...rect, options: [] });
            values[w.fieldName] = typeof w.fieldValue === 'string' ? w.fieldValue : '';
          } else if (w.fieldType === 'Btn' && w.checkBox) {
            fields.push({ name: w.fieldName, type: 'checkbox', page: i - 1, ...rect, options: [] });
            values[w.fieldName] = Boolean(w.fieldValue && w.fieldValue !== 'Off');
          } else if (w.fieldType === 'Btn' && w.radioButton) {
            const val = String(w.buttonValue ?? 'On');
            fields.push({ name: w.fieldName, type: 'radio', page: i - 1, ...rect, options: [{ value: val, label: val }] });
            if (w.fieldValue && w.fieldValue !== 'Off') values[w.fieldName] = w.fieldValue;
            else if (!(w.fieldName in values)) values[w.fieldName] = '';
          } else if (w.fieldType === 'Ch') {
            const options = (w.options ?? []).map((o: any) => ({ value: String(o.exportValue ?? o.displayValue), label: String(o.displayValue ?? o.exportValue) }));
            fields.push({ name: w.fieldName, type: 'choice', page: i - 1, ...rect, options });
            const cur = Array.isArray(w.fieldValue) ? w.fieldValue[0] : w.fieldValue;
            values[w.fieldName] = cur != null ? String(cur) : '';
          }
        }
      }

      // pdf.js reports radio widget values as indices; the real export values
      // live in the AcroForm. Map them in widget order via pdf-lib.
      if (fields.some((f) => f.type === 'radio')) {
        try {
          const { PDFDocument } = await import('pdf-lib');
          const libDoc = await PDFDocument.load(bytes.slice(0), { ignoreEncryption: true });
          const form = libDoc.getForm();
          const counters: Record<string, number> = {};
          for (const f of fields) {
            if (f.type !== 'radio') continue;
            const idx = counters[f.name] ?? 0;
            counters[f.name] = idx + 1;
            try {
              const opts = form.getRadioGroup(f.name).getOptions();
              if (opts[idx] != null) f.options = [{ value: opts[idx], label: opts[idx] }];
            } catch { /* keep index value */ }
          }
        } catch { /* pdf-lib unavailable; radios keep index values */ }
      }

      bytesRef.current = bytes;
      pdfDocRef.current = doc;
      viewportsRef.current = vps;
      textCacheRef.current = {};
      historyRef.current = [];
      futureRef.current = [];
      setPages(infos);
      setAnnots({});
      setSelected(null);
      setFormFields(fields);
      setFormValues(values);
      setFileName(file.name);
      setFileSize(file.size);
      setCurrentPage(0);
      setFindOpen(false);
      setFindQuery('');
      setMatches([]);
      setFindFlash(null);
      setDocReady((v) => v + 1);
      setNotice(
        `${doc.numPages} page${doc.numPages > 1 ? 's' : ''} loaded${fields.length ? `, ${fields.length} fillable form field${fields.length > 1 ? 's' : ''} found` : ''}.`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open this PDF.');
    } finally {
      setBusy(false);
    }
  }, []);

  /* --------------------------------------------------------- text items */

  const getTextItems = useCallback(async (pageIdx: number): Promise<TextItemRect[]> => {
    const cached = textCacheRef.current[pageIdx];
    if (cached) return cached;
    const doc = pdfDocRef.current;
    if (!doc) return [];
    const lib = pdfjs();
    const page = await doc.getPage(pageIdx + 1);
    const vp = viewportsRef.current[pageIdx];
    const tc = await page.getTextContent();
    const items: TextItemRect[] = [];
    for (const item of tc.items as any[]) {
      if (!item.str || !item.str.trim() || !item.width) continue;
      const tx = lib.Util.transform(vp.transform, item.transform);
      const fontH = Math.hypot(tx[2], tx[3]);
      if (!fontH) continue;
      const ascent = fontH * (item.ascent ?? 0.8);
      const ux = tx[0], uy = tx[1];
      const ul = Math.hypot(ux, uy) || 1;
      const dx = ux / ul, dy = uy / ul; // text direction in view space
      const nx = -dy, ny = dx; // text "up" in view space
      const o = [tx[4], tx[5]];
      const corners = [
        [o[0] - nx * ascent, o[1] - ny * ascent],
        [o[0] + dx * item.width - nx * ascent, o[1] + dy * item.width - ny * ascent],
        [o[0] + dx * item.width + nx * (fontH - ascent), o[1] + dy * item.width + ny * (fontH - ascent)],
        [o[0] + nx * (fontH - ascent), o[1] + ny * (fontH - ascent)],
      ];
      const xs = corners.map((c) => c[0]);
      const ys = corners.map((c) => c[1]);
      items.push({
        x: Math.min(...xs), y: Math.min(...ys),
        w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys),
        size: fontH, str: item.str,
      });
    }
    textCacheRef.current[pageIdx] = items;
    return items;
  }, []);

  /* ------------------------------------------------------------ find */

  useEffect(() => {
    if (!findOpen || !findQuery.trim() || !loaded) {
      setMatches([]);
      setMatchIdx(0);
      return;
    }
    let cancelled = false;
    void (async () => {
      const q = findQuery.trim().toLowerCase();
      const found: Match[] = [];
      for (let i = 0; i < pages.length; i++) {
        const items = await getTextItems(i);
        if (cancelled) return;
        for (const it of items) if (it.str.toLowerCase().includes(q)) found.push({ page: i, rect: { x: it.x, y: it.y, w: it.w, h: it.h } });
      }
      if (!cancelled) {
        setMatches(found);
        setMatchIdx(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [findOpen, findQuery, loaded, pages.length, getTextItems]);

  const jumpToMatch = useCallback(
    (idx: number) => {
      const m = matches[idx];
      if (!m) return;
      setMatchIdx(idx);
      setFindFlash({ ...m, key: Date.now() });
      pageElsRef.current[m.page]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
    [matches]
  );

  useEffect(() => {
    if (matches.length) jumpToMatch(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches]);

  /* -------------------------------------------------------- navigation */

  const jumpToPage = useCallback((i: number) => {
    pageElsRef.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setCurrentPage(i);
  }, []);

  const offsets = useMemo(() => {
    const out: number[] = [];
    let acc = 0;
    for (const p of pages) {
      out.push(acc);
      acc += p.viewH * scale + 16;
    }
    return out;
  }, [pages, scale]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const top = el.scrollTop + 60;
    let cur = 0;
    for (let i = 0; i < offsets.length; i++) if (offsets[i] <= top) cur = i;
    setCurrentPage(cur);
  }, [offsets]);

  // fit-to-width
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !loaded) return;
    const compute = () => {
      const maxW = Math.max(...pages.map((p) => p.viewW));
      setFitScale(Math.min(2, Math.max(0.3, (el.clientWidth - 20) / maxW)));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [loaded, pages]);

  /* -------------------------------------------------------- annotation ops */

  const onAddAnns = useCallback(
    (page: number, anns: Ann[], selectId?: string) => {
      applyChange((m) => {
        m[page] = [...(m[page] ?? []), ...anns];
      });
      if (selectId) setSelected(selectId);
    },
    [applyChange]
  );

  const onLiveChange = useCallback((page: number, id: string, fn: (a: Ann) => Ann) => {
    setAnnots((prev) => ({
      ...prev,
      [page]: (prev[page] ?? []).map((a) => (a.id === id ? fn(a) : a)),
    }));
  }, []);

  const onDragBegin = useCallback(() => {
    dragSnapRef.current = annotsRef.current;
  }, []);

  const onDragEnd = useCallback(() => {
    if (dragSnapRef.current && dragSnapRef.current !== annotsRef.current) pushHistory(dragSnapRef.current);
    dragSnapRef.current = null;
  }, [pushHistory]);

  const onTextFocus = useCallback(() => {
    textSnapRef.current = annotsRef.current;
  }, []);

  const onTextChange = useCallback(
    (page: number, id: string, text: string) => {
      onLiveChange(page, id, (a) => (a.kind === 'text' ? { ...a, text } : a));
    },
    [onLiveChange]
  );

  const onTextBlur = useCallback(
    (page: number, id: string) => {
      const ann = (annotsRef.current[page] ?? []).find((a) => a.id === id);
      const snap = textSnapRef.current;
      textSnapRef.current = null;
      if (ann && ann.kind === 'text' && !ann.text.trim()) {
        // empty text: drop it and rewind history to before it was added
        const base = snap ?? annotsRef.current;
        const next = structuredClone(base);
        next[page] = (next[page] ?? []).filter((a) => a.id !== id);
        setAnnots(next);
        setSelected(null);
        return;
      }
      if (snap && snap !== annotsRef.current) pushHistory(snap);
    },
    [pushHistory]
  );

  const deleteSelected = useCallback(() => {
    if (!selected) return;
    applyChange((m) => {
      for (const k of Object.keys(m)) m[Number(k)] = m[Number(k)].filter((a) => a.id !== selected);
    });
    setSelected(null);
  }, [selected, applyChange]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        e.preventDefault();
        deleteSelected();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, deleteSelected, undo, redo]);

  /* -------------------------------------------------------- place image / link */

  const pickImage = useCallback((file: File, label: string) => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 1600;
      const sc = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * sc);
      c.height = Math.round(img.naturalHeight * sc);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      const isPng = /png/i.test(file.type);
      const dataUrl = isPng ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.9);
      const w = 180;
      setPendingImage({ dataUrl, w, h: (w * c.height) / c.width, label });
      setNotice('Click on the page to place the image. Select it afterwards to move or resize.');
    };
    img.onerror = () => setError('Could not read that image. Use a PNG or JPEG.');
    img.src = URL.createObjectURL(file);
  }, []);

  const onPlaceImage = useCallback(
    (page: number, x: number, y: number) => {
      if (!pendingImage) return;
      const ann: Ann = {
        kind: 'image', id: crypto.randomUUID().slice(0, 12),
        x: x - pendingImage.w / 2, y: y - pendingImage.h / 2,
        w: pendingImage.w, h: pendingImage.h, dataUrl: pendingImage.dataUrl, label: pendingImage.label,
      };
      onAddAnns(page, [ann], ann.id);
      setPendingImage(null);
      setNotice('');
      setTool('select');
    },
    [pendingImage, onAddAnns]
  );

  const addLink = useCallback(() => {
    if (!linkDraft || !linkUrl.trim()) return;
    const ann: Ann = {
      kind: 'link', id: crypto.randomUUID().slice(0, 12),
      x: linkDraft.x, y: linkDraft.y, w: linkDraft.w, h: linkDraft.h, url: linkUrl.trim(),
    };
    onAddAnns(linkDraft.page, [ann], ann.id);
    setLinkDraft(null);
    setLinkUrl('');
  }, [linkDraft, linkUrl, onAddAnns]);

  /* ------------------------------------------------------------ export */

  const doExport = useCallback(async () => {
    if (!bytesRef.current) return;
    setBusy(true);
    setError('');
    try {
      const out = await exportEditedPdf({
        bytes: bytesRef.current,
        viewports: viewportsRef.current,
        annots: annotsRef.current,
        formValues,
        formFields,
        flattenForms,
      });
      const base = fileName.replace(/\.pdf$/i, '') || 'document';
      downloadBlob(`${base}-edited.pdf`, new Blob([out as unknown as BlobPart], { type: 'application/pdf' }));
      setNotice('Edited PDF downloaded. Open it to check the result before sharing.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed. Try removing the last change.');
    } finally {
      setBusy(false);
    }
  }, [fileName, formValues, formFields, flattenForms]);

  /* -------------------------------------------------------------- render */

  if (!loaded) {
    return (
      <div className="space-y-4">
        <Panel title="Open a PDF" description="The file is processed on your device only. Nothing is uploaded.">
          <Dropzone
            accept="application/pdf,.pdf"
            multiple={false}
            onFiles={(fs) => fs[0] && void loadFile(fs[0])}
            title="Drop a PDF or browse"
            hint={`Up to ${formatBytes(MAX_BYTES)}, ${MAX_PAGES} pages. Password-protected PDFs are not supported.`}
          />
          {busy && <p className="mt-4 font-mono text-[11px] uppercase tracking-label text-muted">Reading PDF…</p>}
          {error && (
            <p role="alert" className="mt-4 text-danger">
              {error}
            </p>
          )}
        </Panel>
        <Panel title="What this editor does">
          <ul className="list-inside list-disc space-y-1.5 text-sm leading-relaxed text-muted">
            <li>Add text, highlights, underlines, strikeouts, whiteout and redaction boxes.</li>
            <li>Draw freehand, add shapes and arrows, insert images and signatures.</li>
            <li>Fill AcroForm fields: text inputs, checkboxes, radio buttons and dropdowns.</li>
            <li>Cover and replace existing text, add clickable links, search the document.</li>
            <li>Undo and redo every change, then download the flattened PDF.</li>
          </ul>
        </Panel>
      </div>
    );
  }

  const colorTools: ToolId[] = ['highlight', 'underline', 'strike', 'pen', 'shape'];
  const selAnn = selected ? Object.values(annots).flat().find((a) => a.id === selected) : undefined;

  return (
    <div className="space-y-4" data-testid="pdf-editor">
      <div className="border border-line bg-surface">
        {/* row 1: file + navigation */}
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-2.5">
          <span className="max-w-40 truncate font-mono text-[10px] uppercase tracking-label text-muted" title={fileName}>
            {fileName}
          </span>
          <span className="text-muted/40">·</span>
          <div className="flex items-center gap-1">
            <IconBtn label="Previous page" disabled={currentPage === 0} onClick={() => jumpToPage(Math.max(0, currentPage - 1))}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </IconBtn>
            <span className="min-w-14 text-center font-mono text-[10px] uppercase tracking-label text-fg" data-testid="page-indicator">
              {currentPage + 1} / {pages.length}
            </span>
            <IconBtn label="Next page" disabled={currentPage >= pages.length - 1} onClick={() => jumpToPage(Math.min(pages.length - 1, currentPage + 1))}>
              <ChevronRight className="h-3.5 w-3.5" />
            </IconBtn>
          </div>
          <span className="text-muted/40">·</span>
          <div className="flex items-center gap-1">
            <IconBtn label="Zoom out" onClick={() => setZoom((z) => Math.max(0.4, (z === 'fit' ? scale : z) - 0.2))}>
              <Minus className="h-3.5 w-3.5" />
            </IconBtn>
            <button
              type="button"
              data-testid="zoom-reset"
              className="min-w-14 border border-line px-2 py-2 text-center font-mono text-[10px] uppercase tracking-label text-muted hover:border-accent hover:text-accent"
              onClick={() => setZoom('fit')}
              title="Fit to width"
            >
              {zoom === 'fit' ? 'Fit' : `${Math.round(scale * 100)}%`}
            </button>
            <IconBtn label="Zoom in" onClick={() => setZoom((z) => Math.min(3, (z === 'fit' ? scale : z) + 0.2))}>
              <Plus className="h-3.5 w-3.5" />
            </IconBtn>
          </div>
          <span className="text-muted/40">·</span>
          <div className="flex items-center gap-1">
            <IconBtn label="Undo (Ctrl+Z)" testId="undo" disabled={!historyRef.current.length} onClick={undo}>
              <Undo2 className="h-3.5 w-3.5" />
            </IconBtn>
            <IconBtn label="Redo (Ctrl+Y)" testId="redo" disabled={!futureRef.current.length} onClick={redo}>
              <Redo2 className="h-3.5 w-3.5" />
            </IconBtn>
            {void histVersion}
          </div>
          <div className="ml-auto">
            <Button onClick={() => void doExport()} disabled={busy} data-testid="download" className="gap-2">
              <Download className="h-3.5 w-3.5" />
              {busy ? 'Working…' : 'Download PDF'}
            </Button>
          </div>
        </div>

        {/* row 2: tools */}
        <div className="flex gap-1.5 overflow-x-auto border-b border-line p-2" role="toolbar" aria-label="Editing tools">
          {TOOL_DEFS.map((t) => (
            <ToolButton
              key={t.id}
              testId={`tool-${t.id}`}
              active={tool === t.id || (t.id === 'find' && findOpen)}
              label={t.label}
              onClick={() => {
                if (t.id === 'sign') {
                  setSigOpen(true);
                  return;
                }
                if (t.id === 'image') {
                  document.getElementById('pdf-editor-image-input')?.click();
                  return;
                }
                if (t.id === 'find') {
                  setFindOpen((v) => !v);
                  setTool('select');
                  return;
                }
                setTool(t.id);
                setSelected(null);
              }}
            >
              {t.icon}
            </ToolButton>
          ))}
          <input
            id="pdf-editor-image-input"
            data-testid="image-input"
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) pickImage(f, f.name);
              e.target.value = '';
            }}
          />
        </div>

        {/* row 3: contextual options */}
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-2 text-[11px] text-muted">
          {colorTools.includes(tool) && (
            <>
              <label className="flex items-center gap-1.5">
                Color
                <input aria-label="Tool color" type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-7 w-9 cursor-pointer border border-line bg-transparent" />
              </label>
              {(tool === 'pen' || tool === 'shape') && (
                <label className="flex items-center gap-1.5">
                  Width
                  <input aria-label="Stroke width" type="range" min={1} max={10} step={0.5} value={strokeW} onChange={(e) => setStrokeW(Number(e.target.value))} className="w-20" />
                </label>
              )}
              {tool === 'shape' && (
                <Select aria-label="Shape type" value={shape} onChange={(e) => setShape(e.target.value as ShapeKind)} className="w-28 py-1">
                  <option value="rect">Rectangle</option>
                  <option value="ellipse">Ellipse</option>
                  <option value="line">Line</option>
                  <option value="arrow">Arrow</option>
                </Select>
              )}
              <span>{tool === 'pen' ? 'Draw on the page.' : 'Drag on the page.'}</span>
            </>
          )}
          {(tool === 'text' || tool === 'edit') && (
            <>
              <label className="flex items-center gap-1.5">
                Color
                <input aria-label="Text color" type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} className="h-7 w-9 cursor-pointer border border-line bg-transparent" />
              </label>
              <label className="flex items-center gap-1.5">
                Size
                <Input aria-label="Text size" type="number" min={6} max={96} value={fontSize} onChange={(e) => setFontSize(Math.min(96, Math.max(6, Number(e.target.value) || 16)))} className="w-16 px-2 py-1" />
              </label>
              <label className="flex cursor-pointer items-center gap-1.5">
                <input type="checkbox" checked={bold} onChange={(e) => setBold(e.target.checked)} aria-label="Bold text" />
                Bold
              </label>
              <span>{tool === 'edit' ? 'Click existing text to cover and replace it.' : 'Click the page to place text.'}</span>
            </>
          )}
          {tool === 'select' && !selAnn && <span>Tap an annotation to select, drag to move. Tap a form field to fill it.</span>}
          {selAnn && (
            <>
              <span className="font-mono uppercase tracking-label">Selected: {selAnn.kind}</span>
              <Button variant="danger" size="sm" onClick={deleteSelected} data-testid="delete-ann" className="gap-1">
                <Trash2 className="h-3 w-3" /> Delete
              </Button>
            </>
          )}
          {pendingImage && <span className="text-accent">Click the page to place the image.</span>}
        </div>

        {/* find bar */}
        {findOpen && (
          <div className="flex flex-wrap items-center gap-2 border-b border-line p-2">
            <Input
              aria-label="Find text in document"
              placeholder="Find in document…"
              value={findQuery}
              onChange={(e) => setFindQuery(e.target.value)}
              className="w-48 py-1.5"
              data-testid="find-input"
            />
            <span className="font-mono text-[10px] uppercase tracking-label text-muted" data-testid="find-count">
              {findQuery.trim() ? (matches.length ? `${matchIdx + 1} of ${matches.length}` : 'No matches') : ''}
            </span>
            <IconBtn label="Previous match" testId="find-prev" disabled={!matches.length} onClick={() => jumpToMatch((matchIdx - 1 + matches.length) % matches.length)}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </IconBtn>
            <IconBtn label="Next match" testId="find-next" disabled={!matches.length} onClick={() => jumpToMatch((matchIdx + 1) % matches.length)}>
              <ChevronRight className="h-3.5 w-3.5" />
            </IconBtn>
          </div>
        )}

        {/* link draft bar */}
        {linkDraft && (
          <div className="flex flex-wrap items-center gap-2 border-b border-line bg-raised/40 p-2">
            <span className="font-mono text-[10px] uppercase tracking-label text-muted">Link area selected. URL:</span>
            <Input
              aria-label="Link URL"
              placeholder="https://example.com"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              className="w-56 py-1.5"
              data-testid="link-url"
            />
            <Button size="sm" onClick={addLink} disabled={!linkUrl.trim()} data-testid="link-add">
              Add link
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setLinkDraft(null)}>
              Cancel
            </Button>
          </div>
        )}

        {/* pages */}
        <div className="flex gap-3 p-3">
          <Thumbs pdfDoc={pdfDocRef.current} pages={pages} current={currentPage} onJump={jumpToPage} key={docReady} />
          <div ref={scrollRef} onScroll={onScroll} className="max-h-[75vh] min-w-0 flex-1 overflow-auto" data-testid="pages-scroll">
            <div className="space-y-4 pb-4">
              {pages.map((p, i) => (
                <div key={`${docReady}-${i}`} ref={(el) => void (pageElsRef.current[i] = el)}>
                  <PageView
                    pdfDoc={pdfDocRef.current}
                    pageIndex={i}
                    info={p}
                    scale={scale}
                    tool={tool}
                    color={color}
                    textColor={textColor}
                    fontSize={fontSize}
                    bold={bold}
                    strokeW={strokeW}
                    shape={shape}
                    annots={annots[i] ?? []}
                    selected={selected}
                    formFields={formFields.filter((f) => f.page === i)}
                    formValues={formValues}
                    onFormValue={(name, v) => setFormValues((prev) => ({ ...prev, [name]: v }))}
                    findFlashKey={findFlash?.page === i ? findFlash.key : 0}
                    findFlashRect={findFlash?.page === i ? findFlash.rect : null}
                    pendingImage={pendingImage}
                    onPlaceImage={onPlaceImage}
                    onAddAnns={onAddAnns}
                    onSelect={setSelected}
                    onDragBegin={onDragBegin}
                    onLiveChange={onLiveChange}
                    onDragEnd={onDragEnd}
                    onTextFocus={onTextFocus}
                    onTextChange={onTextChange}
                    onTextBlur={onTextBlur}
                    onRequestLink={(page, rect) => setLinkDraft({ page, ...rect })}
                    getTextItems={getTextItems}
                  />
                  <p className="mt-1 text-center font-mono text-[9px] uppercase tracking-label text-muted">Page {i + 1}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* footer status */}
        <div className="flex flex-wrap items-center gap-3 border-t border-line p-2.5">
          <button type="button" className="font-mono text-[10px] uppercase tracking-label text-muted hover:text-danger" onClick={() => { setPages([]); setDocReady(0); setFileName(''); }}>
            Close file
          </button>
          <span className="text-[11px] text-muted">{formatBytes(fileSize)}</span>
          {notice && (
            <span role="status" className="text-[11px] text-accent-2">
              {notice}
            </span>
          )}
          {error && (
            <span role="alert" className="text-[11px] text-danger">
              {error}
            </span>
          )}
        </div>
      </div>

      {formFields.length > 0 && (
        <Panel title="Form options">
          <Toggle
            checked={flattenForms}
            onChange={setFlattenForms}
            label="Flatten form fields on download"
            description="Flattening bakes your entries into the page so they print everywhere and can no longer be edited. Turn off to keep the form fillable."
          />
        </Panel>
      )}

      <Panel title="How this editor works">
        <div className="space-y-3 text-sm leading-relaxed text-muted">
          <p>
            Like other browser-based editors (Sejda, Smallpdf), your additions are drawn as a new layer on top of the
            original page, then flattened into the file you download. "Edit text" covers the original words with a
            white box and places your new text over it; the page is not re-typeset, so long replacements can overflow
            their original space.
          </p>
          <p>
            Whiteout and redact cover content visually. The covered text can still exist inside the file, so do not
            rely on them to remove secrets; rebuild the page from scratch for true removal. Fonts: added text uses the
            standard PDF fonts (Latin characters only). Editing a digitally signed PDF invalidates its signature.
          </p>
        </div>
      </Panel>

      {sigOpen && (
        <SignaturePad
          onDone={(dataUrl, w, h) => {
            setSigOpen(false);
            setPendingImage({ dataUrl, w, h, label: 'Signature' });
            setNotice('Click on the page to place your signature.');
          }}
          onCancel={() => setSigOpen(false)}
        />
      )}
      <Note tone="info">Everything runs on your device. The PDF never leaves your phone or computer.</Note>
    </div>
  );
}
