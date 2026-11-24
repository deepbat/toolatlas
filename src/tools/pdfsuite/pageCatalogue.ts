import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNull, PDFNumber, PDFObject, PDFPage, PDFPageLeaf, PDFRef, PDFStream, PDFString } from 'pdf-lib';

const N = PDFName.of;
const array = (d: PDFDict, key: string) => { const v = d.lookup(N(key)); return v instanceof PDFArray ? v : undefined; };
const text = (v: PDFObject | undefined) => v instanceof PDFString || v instanceof PDFHexString ? v.decodeText() : '';

/** Copy a document graph, mapping page references only to the selected output pages.
 * Unlike copyPages, the same copier also carries fields, destinations and attachments.
 * Omitted pages never enter the output graph through widget or destination pointers.
 */
class GraphCopy {
  private mapped = new Map<PDFObject, PDFObject>();
  constructor(private src: PDFDocument, private dst: PDFDocument, selected: Map<number, PDFRef>) {
    src.getPages().forEach((p, i) => {
      const ref = selected.get(i) ?? PDFNull;
      this.mapped.set(p.ref, ref);
      if (ref !== PDFNull) this.mapped.set(p.node, dst.context.lookup(ref)!);
      else this.mapped.set(p.node, PDFNull);
    });
  }
  copy = (v: PDFObject): PDFObject => {
    const known = this.mapped.get(v); if (known) return known;
    if (v instanceof PDFRef) {
      const ref = this.dst.context.nextRef(); this.mapped.set(v, ref);
      const original = this.src.context.lookup(v);
      if (!original) { this.dst.context.assign(ref, PDFNull); return ref; }
      this.dst.context.assign(ref, this.copy(original)); return ref;
    }
    if (v instanceof PDFStream) {
      const out = v.clone(this.dst.context); this.mapped.set(v, out);
      for (const [k, val] of v.dict.entries()) out.dict.set(k, this.copy(val));
      return out;
    }
    if (v instanceof PDFDict) {
      const out = PDFDict.withContext(this.dst.context); this.mapped.set(v, out);
      for (const [k, val] of v.entries()) out.set(k, this.copy(val));
      return out;
    }
    if (v instanceof PDFArray) {
      const out = PDFArray.withContext(this.dst.context); this.mapped.set(v, out);
      for (let i = 0; i < v.size(); i++) out.push(this.copy(v.get(i)));
      return out;
    }
    return v.clone();
  };
  fillPage(source: PDFPage, target: PDFPage) {
    for (const [k, v] of source.node.entries()) if (k !== N('Parent')) target.node.set(k, this.copy(v));
    for (const key of PDFPageLeaf.InheritableEntries) {
      const k = N(key), v = source.node.getInheritableAttribute(k);
      if (v) target.node.set(k, this.copy(v));
    }
  }
}

function nameEntries(doc: PDFDocument, root: PDFObject | undefined): [PDFObject, PDFObject][] {
  const result: [PDFObject, PDFObject][] = [], seen = new Set<PDFObject>();
  const walk = (v: PDFObject | undefined) => {
    if (!v || seen.has(v)) return; seen.add(v);
    const d = doc.context.lookup(v); if (!(d instanceof PDFDict)) return;
    const names = d.lookupMaybe(N('Names'), PDFArray);
    if (names) for (let i = 0; i + 1 < names.size(); i += 2) result.push([names.get(i), names.get(i + 1)]);
    const kids = d.lookupMaybe(N('Kids'), PDFArray);
    if (kids) for (let i = 0; i < kids.size(); i++) walk(kids.get(i));
  };
  walk(root); return result;
}

export interface PageSource { bytes: Uint8Array; pages?: number[] }

/** Preserve editable forms, links, bookmarks and attachments through page selection.
 * Colliding field and attachment names get a suffix. Repeated pages receive independent fields.
 */
export async function assemblePages(inputs: PageSource[]): Promise<Uint8Array> {
  const out = await PDFDocument.create(), fields = PDFArray.withContext(out.context);
  const names = new Map<string, [PDFObject, PDFObject][]>(), fieldNames = new Set<string>();
  const outlineItems: PDFDict[] = [], formResources = out.context.obj({});
  let inputIndex = 0;
  let first = true;
  for (const input of inputs) {
    const src = await PDFDocument.load(input.bytes, { updateMetadata: false });
    await src.flush();
    const pages = src.getPages(), order = input.pages ?? src.getPageIndices();
    if (!order.length || order.some(i => !Number.isInteger(i) || i < 0 || i >= pages.length)) throw Error('Choose valid pages for every input PDF.');
    const form = src.catalog.lookupMaybe(N('AcroForm'), PDFDict);
    if (form?.has(N('XFA'))) throw Error('XFA forms cannot be safely rearranged here. Use a PDF with standard AcroForm fields.');
    const targets = order.map(() => out.addPage()), counts = new Map<number, number>();
    const layers: Map<number, PDFRef>[] = [];
    order.forEach((i, n) => { const layer = counts.get(i) ?? 0; counts.set(i, layer + 1); (layers[layer] ??= new Map()).set(i, targets[n].ref); });
    const destinationNames = new Map<string, string>();
    const remapDestination = (d: PDFDict, key: string) => {
      const value = d.get(N(key)), name = value instanceof PDFName ? value.decodeText() : text(value);
      if (!name) return true;
      const renamed = destinationNames.get(name);
      if (renamed) d.set(N(key), PDFHexString.fromText(renamed));
      return !!renamed;
    };
    const remapLinks = (d: PDFDict) => {
      let valid = remapDestination(d, 'Dest');
      const action = d.lookupMaybe(N('A'), PDFDict);
      if (action?.get(N('S')) === N('GoTo')) valid = remapDestination(action, 'D') && valid;
      return valid;
    };
    for (let layer = 0; layer < layers.length; layer++) {
      const selected = layers[layer], destinations = new Map([...layers[0], ...selected]), copier = new GraphCopy(src, out, destinations);
      order.forEach((i, n) => { if (selected.get(i) === targets[n].ref) copier.fillPage(pages[i], targets[n]); });
      // Copy only fields whose widgets occur on selected pages. A field spanning
      // several selected pages remains one field; duplicated pages get new fields.
      const selectedWidgets = new Set<PDFObject>();
      for (const i of selected.keys()) {
        const annots = pages[i].node.Annots();
        if (annots) for (let j = 0; j < annots.size(); j++) {
          selectedWidgets.add(annots.get(j)); selectedWidgets.add(src.context.lookup(annots.get(j))!);
        }
      }
      const fieldStack = new Set<PDFObject>();
      const pruneField = (ref: PDFObject): PDFObject | null => {
        if (fieldStack.has(ref)) throw Error('The form field tree is cyclic. Repair this PDF before rearranging it.');
        fieldStack.add(ref);
        const d = src.context.lookup(ref); if (!(d instanceof PDFDict)) return null;
        const kids = d.lookupMaybe(N('Kids'), PDFArray);
        const kept: PDFObject[] = [];
        if (kids) for (let i = 0; i < kids.size(); i++) { const k = pruneField(kids.get(i)); if (k) kept.push(k); }
        fieldStack.delete(ref);
        if (!kept.length && !selectedWidgets.has(ref) && !selectedWidgets.has(d)) return null;
        const copied = copier.copy(ref), c = out.context.lookup(copied);
        if (!(c instanceof PDFDict)) return null;
        if (kids) c.set(N('Kids'), out.context.obj(kept));
        return copied;
      };
      const firstField = fields.size();
      const roots = form?.lookupMaybe(N('Fields'), PDFArray);
      if (roots) for (let i = 0; i < roots.size(); i++) {
        const ref = pruneField(roots.get(i)); if (!ref) continue;
        const d = out.context.lookup(ref, PDFDict), base = text(d.get(N('T'))) || 'field'; let name = base, suffix = 2;
        while (fieldNames.has(name)) name = `${base} (${suffix++})`;
        fieldNames.add(name); d.set(N('T'), PDFHexString.fromText(name)); fields.push(ref);
      }
      // AcroForm resources are document-wide. Prefix donor resource keys and
      // update default-appearance tokens to avoid font collisions on later edits.
      const resourceNames = new Map<string, string>();
      const sourceDR = form?.lookupMaybe(N('DR'), PDFDict);
      if (sourceDR) for (const [category, resources] of sourceDR.entries()) {
        const dict = src.context.lookup(resources); if (!(dict instanceof PDFDict)) continue;
        let dest = formResources.lookupMaybe(category, PDFDict);
        if (!dest) { dest = out.context.obj({}); formResources.set(category, dest); }
        for (const [key, value] of dict.entries()) {
          const label = `D${inputIndex}_${key.decodeText()}`;
          resourceNames.set(key.toString(), N(label).toString()); dest.set(N(label), copier.copy(value));
        }
      }
      const rewriteDA = (v: PDFObject | undefined) => {
        const value = text(v); return PDFString.of(value.replace(/\/[^\s()[\]<>%/]+/g, token => resourceNames.get(token) ?? token));
      };
      const rewriteField = (d: PDFDict, root: boolean) => {
        const da = d.get(N('DA')) ?? (root ? form?.get(N('DA')) : undefined);
        if (da) d.set(N('DA'), rewriteDA(da));
        const kids = d.lookupMaybe(N('Kids'), PDFArray);
        if (kids) for (let i = 0; i < kids.size(); i++) { const child = kids.lookup(i); if (child instanceof PDFDict) rewriteField(child, false); }
      };
      for (let i = firstField; i < fields.size(); i++) rewriteField(fields.lookup(i, PDFDict), true);
      const remapPageLinks = () => {
        for (const ref of selected.values()) {
          const annots = out.context.lookup(ref, PDFDict).lookupMaybe(N('Annots'), PDFArray);
          if (annots) for (let i = annots.size() - 1; i >= 0; i--) { const a = annots.lookup(i); if (a instanceof PDFDict && !remapLinks(a)) annots.remove(i); }
        }
      };
      if (layer) { remapPageLinks(); continue; }
      const sourceNames = src.catalog.lookupMaybe(N('Names'), PDFDict);
      const nameTrees = sourceNames ? sourceNames.entries() : [];
      const legacyDests = src.catalog.lookupMaybe(N('Dests'), PDFDict);
      if (legacyDests) nameTrees.push([N('Dests'), src.context.obj({ Names: legacyDests.entries().flatMap(([k, v]) => [PDFString.of(k.decodeText()), v]) })]);
      for (const [kind, root] of nameTrees) {
        if (kind === N('JavaScript')) continue;
        const key = kind.decodeText(), existing = names.get(key) ?? [], used = new Set(existing.map(([k]) => text(k)));
        for (const [k, v] of nameEntries(src, root)) {
          let label = text(k), suffix = 2; const base = label;
          while (used.has(label)) label = `${base} (${suffix++})`;
          const copied = copier.copy(v), target = out.context.lookup(copied);
          const dest = target instanceof PDFArray ? target : target instanceof PDFDict ? array(target, 'D') : undefined;
          if (key === 'Dests' && dest?.get(0) === PDFNull) continue;
          used.add(label); if (key === 'Dests') destinationNames.set(base, label); existing.push([PDFHexString.fromText(label), copied]);
        }
        names.set(key, existing);
      }
      const root = src.catalog.lookupMaybe(N('Outlines'), PDFDict), seen = new Set<PDFObject>();
      const walkOutline = (ref: PDFObject | undefined): PDFDict[] => {
        const result: PDFDict[] = [];
        while (ref && !seen.has(ref)) {
          seen.add(ref); const d = src.context.lookup(ref); if (!(d instanceof PDFDict)) break;
          const c = out.context.lookup(copier.copy(ref), PDFDict);
          const children = walkOutline(d.get(N('First')));
          for (const k of ['Parent', 'Prev', 'Next', 'First', 'Last', 'Count']) c.delete(N(k));
          const dest = array(c, 'Dest'), action = c.lookupMaybe(N('A'), PDFDict), actionDest = action ? array(action, 'D') : undefined;
          const missing = (dest && dest.get(0) === PDFNull) || (actionDest && actionDest.get(0) === PDFNull) || !remapLinks(c);
          if (!missing || children.length) {
            if (missing) { c.delete(N('Dest')); c.delete(N('A')); }
            linkOutlines(c, children); result.push(c);
          }
          ref = d.get(N('Next'));
        }
        return result;
      };
      const donorOutlines = walkOutline(root?.get(N('First')));
      remapPageLinks();
      outlineItems.push(...donorOutlines);
    }
    inputIndex++;
    if (first) {
      for (const [get, set] of [[src.getTitle.bind(src), out.setTitle.bind(out)], [src.getAuthor.bind(src), out.setAuthor.bind(out)], [src.getSubject.bind(src), out.setSubject.bind(out)]] as const) { const value = get(); if (value) set(value); }
      first = false;
    }
  }
  function linkOutlines(parent: PDFDict, children: PDFDict[]) {
    if (!children.length) return;
    const refs = children.map(c => out.context.getObjectRef(c) ?? out.context.register(c));
    parent.set(N('First'), refs[0]); parent.set(N('Last'), refs[refs.length - 1]); parent.set(N('Count'), PDFNumber.of(children.length));
    const parentRef = out.context.getObjectRef(parent) ?? out.context.register(parent);
    children.forEach((c, i) => { c.set(N('Parent'), parentRef); if (i) c.set(N('Prev'), refs[i - 1]); if (i + 1 < refs.length) c.set(N('Next'), refs[i + 1]); });
  }
  if (!out.getPageCount()) throw Error('No pages selected.');
  // Links targeting a removed page have no valid destination. Remove those
  // annotations instead of leaving broken pointers to a hidden page object.
  for (const page of out.getPages()) {
    const annots = page.node.Annots(); if (!annots) continue;
    for (let i = annots.size() - 1; i >= 0; i--) {
      const d = annots.lookup(i); if (!(d instanceof PDFDict)) continue;
      const dest = array(d, 'Dest'), action = d.lookupMaybe(N('A'), PDFDict), actionDest = action ? array(action, 'D') : undefined;
      if (dest?.get(0) === PDFNull || actionDest?.get(0) === PDFNull) annots.remove(i);
    }
  }
  if (fields.size()) out.catalog.set(N('AcroForm'), out.context.obj({ Fields: fields, DR: formResources }));
  if (outlineItems.length) { const root = out.context.obj({ Type: 'Outlines' }); linkOutlines(root, outlineItems); out.catalog.set(N('Outlines'), out.context.getObjectRef(root)!); }
  if (names.size) {
    const root = out.context.obj({});
    for (const [kind, entries] of names) { entries.sort((a, b) => text(a[0]) < text(b[0]) ? -1 : text(a[0]) > text(b[0]) ? 1 : 0); root.set(N(kind), out.context.obj({ Names: entries.flat() })); }
    out.catalog.set(N('Names'), root);
  }
  // pdf-lib serializes every indirect object, including objects traversed before
  // pruning a field or bookmark. Sweep unreachable objects so excluded pages and
  // their field values cannot remain recoverable as orphaned PDF objects.
  const reachable = new Set<PDFObject>();
  const visit = (v: PDFObject | undefined) => {
    if (!v || reachable.has(v)) return; reachable.add(v);
    if (v instanceof PDFRef) visit(out.context.lookup(v));
    else if (v instanceof PDFStream) visit(v.dict);
    else if (v instanceof PDFDict) for (const [, child] of v.entries()) visit(child);
    else if (v instanceof PDFArray) for (let i = 0; i < v.size(); i++) visit(v.get(i));
  };
  visit(out.catalog); visit(out.context.trailerInfo.Info);
  for (const [ref, object] of out.context.enumerateIndirectObjects()) if (!reachable.has(ref) && !reachable.has(object)) out.context.delete(ref);
  return out.save({ updateFieldAppearances: false });
}
