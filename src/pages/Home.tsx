import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowUpRight, Search, ShieldCheck, Upload } from 'lucide-react';
import { TOOL_MAP } from '../lib/catalog';
import { matchingTools, storeTransfer } from '../lib/platform';
import type { ToolMeta } from '../lib/types';


interface Drawer {
  id: string;
  num: string;
  title: string;
  subtitle: string;
  ids: string[];
}


const DRAWERS: Drawer[] = [
  {
    id: 'portal',
    num: '01',
    title: 'Portal & Print',
    subtitle: 'Exact KB limits, PVC cards, clean phone scans, passport sheets and real PDF editing.',
    ids: [
      'pvc-card-maker',
      'doc-flatten-print',
      'image-target-size',
      'passport-photo',
      'signature-maker',
      'pdf-editor',
      'pdf-compare',
      'pdf-form-filler',
      'pdf-background',
    ],
  },
  {
    id: 'privacy',
    num: '02',
    title: 'Privacy Shield & Local Files',
    subtitle: 'True PDF redaction, ID masking, face pixelation, EXIF scrubbing and batch file prep.',
    ids: [
      'pdf-redaction-verify',
      'id-masker',
      'photo-pixelator',
      'remove-exif',
      'bulk-renamer',
      'list-cleaner',
      'csv-excel-tools',
    ],
  },
  {
    id: 'india',
    num: '03',
    title: 'India Desk',
    subtitle: 'State-wise Bigha/Kanal, CTS-2010 cheque alignment, exam age limits, UPI QR and tax checks.',
    ids: [
      'land-area-india',
      'cheque-overlay',
      'exam-age-eligibility',
      'upi-qr',
      'income-tax-india',
      'gst-pan-validator',
      'number-to-words-inr',
    ],
  },
  {
    id: 'studio',
    num: '04',
    title: 'Clever Studio',
    subtitle: 'Distinctive, out-of-the-box utilities you will not find on generic tool sites.',
    ids: [
      'wifi-poster',
      'screenshot-mockup',
      'subscription-burn',
      'photo-colouring-page',
      'colour-blind-simulator',
      'split-bill',
      'screen-ruler',
    ],
  },
];


export default function HomePage() {
  const nav = useNavigate();
  const [droppedFile, setDroppedFile] = useState<File | null>(null);
  const [matches, setMatches] = useState<ToolMeta[]>([]);
  const [query, setQuery] = useState('');
  const [dragActive, setDragActive] = useState(false);


  const handleFile = (file: File | undefined) => {
    if (!file) return;
    setDroppedFile(file);
    setMatches(matchingTools(file));
  };


  const openWithFile = async (toolId: string) => {
    if (!droppedFile) {
      nav(`/tools/${toolId}/`);
      return;
    }
    const token = await storeTransfer(toolId, droppedFile);
    nav(`/tools/${toolId}/?handoff=${token}`);
  };


  const normalizedQuery = query.trim().toLowerCase();


  return (
    <div className="container-page pt-10 pb-24 space-y-14">
      {/* Telemetry + Hero */}
      <section className="space-y-6">
        <div className="inline-flex items-center gap-2.5 border border-line bg-surface px-3 py-1.5 font-mono text-[10px] uppercase tracking-label text-muted">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse-dot" />
          <ShieldCheck className="h-3.5 w-3.5 text-accent" />
          <span>On-device workbench · 30 curated tools · 0 bytes uploaded</span>
        </div>


        <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-end">
          <div className="space-y-4">
            <h1 className="font-display text-4xl font-semibold tracking-tight text-fg sm:text-5xl">
              Rare, private tools for real-world jobs.
            </h1>
            <p className="max-w-xl text-base leading-relaxed text-muted">
              No clutter, no sign-ups, no cloud uploads. Drop a file on the workbench to surface only the tools that fit it, or open one of four focused drawers below.
            </p>
          </div>


          {/* Drop-First Workbench */}
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              handleFile(e.dataTransfer.files?.[0]);
            }}
            className={[
              'group flex cursor-pointer flex-col items-center justify-center border border-dashed px-6 py-8 text-center transition',
              dragActive
                ? 'border-accent bg-accent/10'
                : 'border-line bg-surface/80 hover:border-accent',
            ].join(' ')}
          >
            <Upload className="h-5 w-5 text-accent transition group-hover:-translate-y-0.5" />
            <span className="mt-3 font-display text-base font-semibold text-fg">
              {droppedFile ? droppedFile.name : 'Drop a PDF, photo, or CSV here'}
            </span>
            <span className="mt-1 font-mono text-[10px] uppercase tracking-label text-muted">
              {droppedFile
                ? 'Select a matching local tool below'
                : 'Instant local routing · stays on your device'}
            </span>
            <input
              type="file"
              className="sr-only"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </label>
        </div>


        {droppedFile && (
          <div className="border border-accent/50 bg-accent/5 p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-label text-accent">
                Ready for {droppedFile.name}
              </p>
              <button
                type="button"
                onClick={() => {
                  setDroppedFile(null);
                  setMatches([]);
                }}
                className="font-mono text-[10px] uppercase tracking-label text-muted hover:text-fg"
              >
                Clear file
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {matches.length > 0 ? (
                matches.map((tool) => (
                  <button
                    key={tool.id}
                    type="button"
                    onClick={() => void openWithFile(tool.id)}
                    className="inline-flex items-center gap-1.5 border border-line bg-surface px-3.5 py-2 text-sm font-medium text-fg transition hover:border-accent hover:text-accent"
                  >
                    {tool.name}
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </button>
                ))
              ) : (
                <p className="text-sm text-muted">
                  No local tool matches this file type yet. Choose a tool directly below.
                </p>
              )}
            </div>
          </div>
        )}
      </section>


      {/* Instant Filter */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-y border-line py-4">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by job (e.g. bigha, cheque, redact, wifi, pvc)…"
            aria-label="Filter curated tools"
            className="w-full border border-line bg-surface py-2.5 pl-10 pr-4 text-sm text-fg outline-none focus:border-accent"
          />
        </div>
        <div className="flex flex-wrap gap-3 font-mono text-[10px] uppercase tracking-label text-muted">
          {DRAWERS.map((d) => (
            <a key={d.id} href={`#drawer-${d.id}`} className="hover:text-accent">
              {d.num} {d.title}
            </a>
          ))}
        </div>
      </div>


      {/* Four Curated Drawers */}
      <div className="space-y-14">
        {DRAWERS.map((drawer) => {
          const items = drawer.ids
            .map((id) => TOOL_MAP[id])
            .filter(Boolean)
            .filter(
              (t) =>
                !normalizedQuery ||
                `${t.name} ${t.description} ${t.keywords.join(' ')}`
                  .toLowerCase()
                  .includes(normalizedQuery)
            );


          if (!items.length) return null;


          return (
            <section key={drawer.id} id={`drawer-${drawer.id}`} className="space-y-5 scroll-mt-20">
              <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line pb-3">
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-xs font-semibold text-accent">{drawer.num}</span>
                  <h2 className="font-display text-2xl font-semibold tracking-tight text-fg">
                    {drawer.title}
                  </h2>
                </div>
                <p className="text-sm text-muted">{drawer.subtitle}</p>
              </div>


              <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((tool) => (
                  <Link
                    key={tool.id}
                    to={`/tools/${tool.id}/`}
                    className="group flex flex-col justify-between border border-line bg-surface/85 p-5 transition hover:-translate-y-0.5 hover:border-accent hover:shadow-lift"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-display text-base font-semibold tracking-tight text-fg group-hover:text-accent">
                          {tool.name}
                        </h3>
                        <ArrowUpRight className="h-4 w-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-accent" />
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-muted">{tool.description}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
