import assert from "node:assert/strict";
import { cleanList, renamedFiles, settle, fuel } from "../src/lib/new-tools";
import { rowAmounts, invoiceTotals } from "../src/tools/new/invoice-pdf";
import { INPUTS, matchingTools, fileKind } from "../src/lib/platform";
import { TOOL_MAP, relatedTools } from "../src/lib/catalog";
let n = 0;
const test = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log("ok " + name);
};
const opts = {
  trim: true,
  empty: true,
  dedupe: true,
  insensitive: true,
  sort: "asc",
  emails: false,
  delimiter: "newline",
};
test("list cleaner trims, deduplicates, removes empty and sorts", () => {
  const r = cleanList(" pear\nApple\n PEAR\n\nbanana ", opts);
  assert.deepEqual(r.lines, ["Apple", "banana", "pear"]);
  assert.equal(r.duplicates, 1);
  assert.equal(r.original, 5);
});
test("case-sensitive list mode and delimiters", () => {
  const r = cleanList("a\nA\na", {
    ...opts,
    insensitive: false,
    sort: "none",
    delimiter: "semicolon",
  });
  assert.equal(r.output, "a;A");
  assert.equal(r.duplicates, 1);
});
test("email extraction and empty results", () => {
  assert.equal(
    cleanList("Deepak <foo@example.com>, FOO@example.com\nbar@example.org", {
      ...opts,
      emails: true,
      delimiter: "comma",
    }).output,
    "bar@example.org,foo@example.com",
  );
  assert.equal(
    cleanList("No email here", { ...opts, emails: true }).lines.length,
    0,
  );
});
test("renamer stacks rules and preserves extensions", () => {
  assert.deepEqual(
    renamedFiles(
      ["Dir/My Photo.JPG", "My Photo.JPG"],
      [
        { kind: "case", a: "kebab-case", b: "" },
        { kind: "prefix", a: "trip-", b: "" },
        { kind: "number", a: "1", b: "3" },
      ],
    ),
    ["001-trip-my-photo.JPG", "002-trip-my-photo.JPG"],
  );
});
test("renamer prevents collisions, unsafe paths and invalid names", () => {
  assert.deepEqual(renamedFiles(["a.txt", "A.txt"], []), ["a.txt", "A-2.txt"]);
  const r = renamedFiles(
    ["../../a.txt"],
    [{ kind: "prefix", a: "../", b: "" }],
  );
  assert.ok(!r[0].includes("/"));
  assert.ok(!r[0].includes("\\"));
});
test("per-row invoice tax and totals rounded in cents", () => {
  assert.deepEqual(
    rowAmounts({ name: "x", quantity: "2", price: "12.34", tax: "18" }),
    { net: 2468, tax: 444, total: 2912 },
  );
  assert.deepEqual(
    invoiceTotals([
      { name: "a", quantity: "1", price: "100", tax: "5" },
      { name: "b", quantity: "2", price: "50", tax: "18" },
    ]),
    { net: 20000, tax: 2300, total: 22300 },
  );
});
test("fuel four units and round trip", () => {
  const v = {
    distance: 300,
    efficiency: 15,
    price: 100,
    people: 3,
    round: false,
    unit: "kml",
    tolls: 200,
    parking: 100,
    exclude: false,
  };
  assert.equal(fuel(v).used, 20);
  assert.equal(fuel({ ...v, round: true }).used, 40);
  assert.equal(fuel({ ...v, unit: "l100", efficiency: 6 }).used, 18);
  assert.equal(fuel({ ...v, unit: "ev", efficiency: 20 }).used, 60);
  assert.equal(fuel({ ...v, unit: "mpg", efficiency: 30 }).used, 10);
  assert.equal(fuel({ ...v, exclude: true }).each, 1150);
  assert.throws(() => fuel({ ...v, people: 1, exclude: true }));
  assert.throws(() => fuel({ ...v, efficiency: 0 }));
});
test("settlement sample balances and rounding", () => {
  const s = settle(3, [
    { label: "one", amount: "10", paidBy: 0, members: [0, 1, 2] },
  ]);
  assert.equal(s.total, 1000);
  assert.deepEqual(s.balances, [666, -333, -333]);
  assert.equal(s.transactions.length, 2);
});
test("settlement validates participants and zero expense", () => {
  assert.throws(() =>
    settle(2, [{ label: "x", amount: "1", paidBy: 0, members: [] }]),
  );
  assert.throws(() =>
    settle(2, [{ label: "x", amount: "-1", paidBy: 0, members: [1] }]),
  );
  assert.equal(settle(2, []).transactions.length, 0);
});
function optimalPartition(vals: number[]) {
  const N = vals.length,
    dp = Array(1 << N).fill(-100);
  dp[0] = 0;
  for (let mask = 1; mask < 1 << N; mask++) {
    let sum = 0;
    for (let i = 0; i < N; i++) if (mask & (1 << i)) sum += vals[i];
    if (sum !== 0) continue;
    dp[mask] = 1;
    for (let sub = (mask - 1) & mask; sub; sub = (sub - 1) & mask)
      dp[mask] = Math.max(dp[mask], dp[sub] + dp[mask ^ sub]);
  }
  return N - dp[(1 << N) - 1];
}
test("minimum settlement verified against independent zero-sum partition solver", () => {
  let seed = 23;
  for (let run = 0; run < 80; run++) {
    const N = 2 + (run % 7);
    const expenses = Array.from({ length: 8 }, (_, j) => {
      seed = (seed * 16807) % 2147483647;
      return {
        label: "e",
        amount: String((seed % 700) / 100),
        paidBy: seed % N,
        members: Array.from({ length: N }, (_, i) => i).filter(
          (i) => (i + j) % 3 !== 0 || N === 2,
        ),
      };
    });
    const s = settle(N, expenses),
      b = [...s.balances];
    for (const t of s.transactions) {
      assert.ok(t.amount > 0 && t.from !== t.to);
      b[t.from] += t.amount;
      b[t.to] -= t.amount;
    }
    assert.ok(b.every((v) => v === 0));
    assert.equal(
      s.transactions.length,
      optimalPartition(s.balances.filter((v) => v !== 0)),
    );
  }
});
test("every handoff target exists in catalog", () => {
  for (const group of Object.values(INPUTS))
    for (const id of group) assert.ok(TOOL_MAP[id], id);
});
test("file routing recognizes MIME and extension", () => {
  assert.equal(fileKind({ name: "x.PDF", type: "" }), "pdf");
  assert.equal(fileKind({ name: "x.json", type: "application/json" }), "json");
  assert.ok(
    matchingTools({ name: "sound.mp3", type: "" }).some(
      (t) => t.id === "audio-convert",
    ),
  );
  assert.equal(fileKind({ name: "x.exe", type: "" }), null);
});
test("related suggestions follow workflows", () => {
  assert.ok(
    relatedTools(TOOL_MAP["pdf-merge"]).some((t) => t.id === "pdf-compress"),
  );
  assert.ok(
    relatedTools(TOOL_MAP["signature-maker"]).some(
      (t) => t.id === "pdf-editor",
    ),
  );
});
console.log(`${n} upgrade unit checks passed`);
