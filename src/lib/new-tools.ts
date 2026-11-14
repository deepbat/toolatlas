export type CleanOptions = {
  trim: boolean;
  empty: boolean;
  dedupe: boolean;
  insensitive: boolean;
  sort: string;
  emails: boolean;
  delimiter: string;
};
export function cleanList(text: string, o: CleanOptions) {
  if (text.length > 1e6) throw Error("Use text under 1 million characters.");
  const original = text.split(/\r?\n/);
  let lines = o.emails
    ? text.match(
        /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?)+/gi,
      ) || []
    : original;
  lines = lines
    .map((s) => (o.trim ? s.trim() : s))
    .filter((s) => !o.empty || s.trim());
  let duplicates = 0;
  const seen = new Set<string>();
  if (o.dedupe)
    lines = lines.filter((s) => {
      const key = o.insensitive ? s.toLocaleLowerCase() : s;
      if (seen.has(key)) {
        duplicates++;
        return false;
      }
      seen.add(key);
      return true;
    });
  if (o.sort !== "none")
    lines.sort((a, b) => (o.sort === "desc" ? -1 : 1) * a.localeCompare(b));
  const delimiter =
    o.delimiter === "comma" ? "," : o.delimiter === "semicolon" ? ";" : "\n";
  return {
    lines,
    output: lines.join(delimiter),
    original: original.length,
    duplicates,
  };
}
export type RenameRule = {
  kind: "replace" | "prefix" | "suffix" | "case" | "number";
  a: string;
  b: string;
};
export function renamedFiles(names: string[], rules: RenameRule[]) {
  const used = new Set<string>();
  return names.map((name, i) => {
    const flat = name.split(/[\\/]/).pop() || "file";
    const dot = flat.lastIndexOf(".");
    let base = dot > 0 ? flat.slice(0, dot) : flat,
      ext = dot > 0 ? flat.slice(dot) : "";
    for (const r of rules) {
      if (r.kind === "replace" && r.a) base = base.split(r.a).join(r.b);
      if (r.kind === "prefix") base = r.a + base;
      if (r.kind === "suffix") base += r.a;
      if (r.kind === "case") {
        if (r.a === "lowercase") {
          base = base.toLowerCase();
          ext = ext.toLowerCase();
        } else
          base = base
            .normalize("NFKC")
            .replace(/([a-z])([A-Z])/g, "$1 $2")
            .toLowerCase()
            .replace(/[^\p{L}\p{N}]+/gu, r.a === "kebab-case" ? "-" : "_")
            .replace(/^[-_]+|[-_]+$/g, "");
      }
      if (r.kind === "number")
        base =
          String(i + Math.max(0, parseInt(r.a) || 1)).padStart(
            Math.min(8, Math.max(1, parseInt(r.b) || 3)),
            "0",
          ) +
          "-" +
          base;
    }
    base =
      base
        .replace(/[\x00-\x1f\\/:*?"<>|]/g, "_")
        .replace(/[. ]+$/, "")
        .slice(0, 160) || "file";
    ext = ext.replace(/[\x00-\x1f\\/:*?"<>|]/g, "_").slice(0, 20);
    let out = base + ext;
    for (let j = 2; used.has(out.toLocaleLowerCase()); j++)
      out = base + "-" + j + ext;
    used.add(out.toLocaleLowerCase());
    return out;
  });
}
export type Expense = {
  label: string;
  amount: string;
  paidBy: number;
  members: number[];
};
export function settle(count: number, expenses: Expense[]) {
  if (count < 2 || count > 12) throw Error("Use 2 to 12 participants.");
  const balances = Array(count).fill(0) as number[];
  let total = 0;
  for (const e of expenses) {
    const amount = Math.round(Number(e.amount) * 100);
    if (
      !e.amount.trim() ||
      !Number.isSafeInteger(amount) ||
      amount < 0 ||
      amount > 1e11
    )
      throw Error("Enter a valid non-negative expense under 1 billion.");
    const members = [...new Set(e.members)].sort((a, b) => a - b);
    if (
      !members.length ||
      members.some((i) => !Number.isInteger(i) || i < 0 || i >= count) ||
      e.paidBy < 0 ||
      e.paidBy >= count
    )
      throw Error("Every expense needs a payer and at least one participant.");
    total += amount;
    balances[e.paidBy] += amount;
    members.forEach(
      (m, i) =>
        (balances[m] -=
          Math.floor(amount / members.length) +
          (i < amount % members.length ? 1 : 0)),
    );
  }
  // Exact minimum transfer count for <=12 people, preserving integer cents. Pair one debtor
  // with each candidate creditor; eliminating either account at each step explores all settlements.
  const initial = balances.map((v, i) => ({ v, i })).filter((x) => x.v);
  const memo = new Map<
    string,
    { from: number; to: number; amount: number }[]
  >();
  let explored = 0;
  const solve = (
    v: number[],
  ): { from: number; to: number; amount: number }[] => {
    const key = v.join(",");
    const cached = memo.get(key);
    if (cached) return cached;
    const d = v.findIndex((x) => x < 0);
    if (d < 0) return [];
    let best: { from: number; to: number; amount: number }[] | undefined;
    const seen = new Set<number>();
    for (let c = 0; c < v.length; c++) {
      if (v[c] <= 0 || seen.has(v[c])) continue;
      seen.add(v[c]);
      const a = Math.min(-v[d], v[c]),
        next = [...v];
      next[d] += a;
      next[c] -= a;
      const path = [
        { from: initial[d].i, to: initial[c].i, amount: a },
        ...solve(next),
      ];
      if (!best || path.length < best.length) best = path;
      if (v[c] === -v[d]) break;
    }
    memo.set(key, best || []);
    explored++;
    return best || [];
  };
  const transactions = solve(initial.map((x) => x.v));
  return { balances, total, transactions, explored };
}
export type FuelInput = {
  distance: number;
  efficiency: number;
  price: number;
  people: number;
  round: boolean;
  unit: string;
  tolls: number;
  parking: number;
  exclude: boolean;
};
export function fuel(v: FuelInput) {
  for (const n of [v.distance, v.price, v.tolls, v.parking])
    if (!Number.isFinite(n) || n < 0 || n > 1e9)
      throw Error("Distance and costs must be finite, non-negative numbers.");
  if (!Number.isFinite(v.efficiency) || v.efficiency <= 0 || v.efficiency > 1e6)
    throw Error("Efficiency must be greater than zero.");
  if (!Number.isInteger(v.people) || v.people < 1 || v.people > 1000)
    throw Error("People sharing must be a whole number from 1 to 1000.");
  const payers = v.people - (v.exclude ? 1 : 0);
  if (payers < 1)
    throw Error(
      "At least one passenger must share the cost after excluding the driver.",
    );
  const distance = v.distance * (v.round ? 2 : 1);
  const used =
    v.unit === "l100" || v.unit === "ev"
      ? (distance * v.efficiency) / 100
      : distance / v.efficiency;
  const energy = used * v.price,
    total = energy + v.tolls + v.parking;
  return { distance, used, energy, total, payers, each: total / payers };
}
export const NEW_TOOL_DATA = [
  {
    id: "signature-maker",
    name: "Signature Pad & Transparent PNG",
    description:
      "Draw or clean a scanned signature, remove paper and auto-crop a transparent PNG.",
    category: "image",
    icon: "PenLine",
    keywords: ["signature", "sign", "transparent", "autograph", "paper", "png"],
  },
  {
    id: "bulk-renamer",
    name: "Bulk File Renamer",
    description:
      "Stack filename rules, preview every change and export renamed files in a ZIP.",
    category: "file",
    icon: "Files",
    keywords: ["rename", "bulk", "batch", "zip", "prefix", "suffix", "number"],
  },
  {
    id: "list-cleaner",
    name: "List Cleaner & Deduplicator",
    description:
      "Trim, sort and deduplicate lists, extract email addresses and export TXT or CSV.",
    category: "text",
    icon: "List",
    keywords: ["email", "mailing list", "duplicate", "dedupe", "clean", "csv"],
  },
  {
    id: "pvc-card-maker",
    name: "PVC Card Maker (Aadhaar, PAN, Ayushman)",
    description:
      "Turn an ID card PDF or photo into print-ready CR80 PVC cards: auto-detect and crop, 300 DPI, A4 sheets of 2, 4 or 10 cards.",
    category: "pdf",
    icon: "FileText",
    keywords: ["pvc card", "aadhaar", "pan card", "ayushman", "voter id", "driving licence", "cr80", "id card print", "card cropper", "300 dpi"],
  },
  {
    id: "id-photo-maker",
    name: "Passport & ID Photo Sheet Maker",
    description:
      "Crop a portrait and tile exact-size photos on a 4×6 inch or A4 print sheet.",
    category: "image",
    icon: "Image",
    keywords: ["passport", "id photo", "35x45", "2x2", "print sheet"],
  },
  {
    id: "remove-exif",
    name: "Photo EXIF & Metadata Stripper",
    description:
      "Inspect and remove hidden photo metadata in batches. JPEG/PNG support lossless stripping.",
    category: "image",
    icon: "ShieldCheck",
    keywords: ["exif", "gps", "metadata", "location", "strip", "privacy"],
  },
  {
    id: "split-bill",
    name: "Group Expense & Split Bill Settler",
    description:
      "Split unequal group expenses and find the fewest payments needed to settle.",
    category: "finance",
    icon: "Users",
    keywords: ["group", "expense", "trip", "settlement", "split bill", "debt"],
  },
];
