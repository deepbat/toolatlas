import { useEffect, useState } from "react";
import {
  Button,
  CopyButton,
  Field,
  Grid,
  Input,
  Panel,
  Select,
  TextArea,
  Toggle,
} from "../../components/ui";
import { downloadBlob, todayISO } from "../../lib/utils";
import { bitmap, canvas } from "../new/helpers";
import {
  invoicePDF,
  invoiceTotals,
  rowAmounts,
  type InvoiceRow,
} from "../new/invoice-pdf";
function readSender() {
  try {
    return localStorage.getItem("toolatlas:invoice-sender") || "Your business";
  } catch {
    return "Your business";
  }
}
export default function Invoice() {
  const [seller, setSeller] = useState(readSender),
    [saveSender, setSaveSender] = useState(() => {
      try {
        return !!localStorage.getItem("toolatlas:invoice-sender");
      } catch {
        return false;
      }
    }),
    [buyer, setBuyer] = useState("Client name"),
    [number, setNumber] = useState("INV-001"),
    [date, setDate] = useState(todayISO()),
    [currency, setCurrency] = useState("INR"),
    [notes, setNotes] = useState("Thank you for your business."),
    [type, setType] = useState("Invoice"),
    [logo, setLogo] = useState(""),
    [rows, setRows] = useState<InvoiceRow[]>([
      { name: "Service or product", quantity: "1", price: "1000", tax: "0" },
    ]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    try {
      if (saveSender) localStorage.setItem("toolatlas:invoice-sender", seller);
      else localStorage.removeItem("toolatlas:invoice-sender");
    } catch {
      /* optional storage */
    }
  }, [seller, saveSender]);
  const valid = !!(
    rows.length &&
    rows.every(
      (x) =>
        x.name.trim() &&
        x.name.length <= 400 &&
        x.quantity.trim() &&
        x.price.trim() &&
        x.tax.trim() &&
        Number(x.quantity) > 0 &&
        Number(x.quantity) <= 1e6 &&
        Number(x.price) >= 0 &&
        Number(x.price) <= 1e9 &&
        Number(x.tax) >= 0 &&
        Number(x.tax) <= 100 &&
        Number.isSafeInteger(rowAmounts(x).total),
    ) &&
    seller.trim() &&
    buyer.trim() &&
    number.trim() &&
    /^\d{4}-\d{2}-\d{2}$/.test(date)
  );
  const totals = invoiceTotals(rows),
    money = (v: number) =>
      currency +
      " " +
      (Number.isFinite(v) ? v / 100 : 0).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
  const change = (i: number, k: keyof InvoiceRow, value: string) =>
    setRows(rows.map((r, j) => (i === j ? { ...r, [k]: value } : r)));
  const pdf = async () => {
    if (!valid) return;
    setBusy(true);
    setError("");
    try {
      const b = await invoicePDF({
        type,
        seller,
        buyer,
        number,
        date,
        currency,
        notes,
        rows,
        logo,
      });
      downloadBlob(number.replace(/[^\p{L}\p{N}_-]/gu, "_") + ".pdf", b);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <div className="no-print">
          <Panel
            title="Invoice & quotation details"
            description="Preview updates live. Files are generated on this device."
          >
            <Grid>
              <Field label="Document type">
                <Select value={type} onChange={(e) => setType(e.target.value)}>
                  <option>Invoice</option>
                  <option>Quotation</option>
                </Select>
              </Field>
              <Field label="Logo (PNG / JPG)">
                <Input
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    try {
                      setError("");
                      const b = await bitmap(f),
                        c = canvas(
                          Math.round(Math.min(1, 400 / b.width) * b.width),
                          Math.round(Math.min(1, 400 / b.width) * b.height),
                        );
                      if (c.height > 1200) {
                        b.close();
                        throw Error(
                          "Choose a logo with a less extreme aspect ratio.",
                        );
                      }
                      c.getContext("2d")!.drawImage(b, 0, 0, c.width, c.height);
                      b.close();
                      setLogo(c.toDataURL("image/png"));
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                />
                {logo && (
                  <button
                    className="text-xs text-accent underline"
                    onClick={() => setLogo("")}
                  >
                    Remove logo
                  </button>
                )}
              </Field>
              <Field label="Your business">
                <TextArea
                  aria-label="Your business"
                  maxLength={1200}
                  value={seller}
                  onChange={(e) => setSeller(e.target.value)}
                />
              </Field>
              <Field label="Bill to">
                <TextArea
                  aria-label="Bill to"
                  maxLength={1200}
                  value={buyer}
                  onChange={(e) => setBuyer(e.target.value)}
                />
              </Field>
              <Field label="Invoice number">
                <Input
                  aria-label="Invoice number"
                  maxLength={60}
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                />
              </Field>
              <Field label="Invoice date">
                <Input
                  aria-label="Invoice date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </Field>
              <Field label="Currency">
                <Select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                >
                  {["INR", "USD", "EUR", "GBP", "CAD", "AUD"].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              </Field>
            </Grid>
            <div className="my-4">
              <Toggle
                label="Auto-save sender details in this browser"
                checked={saveSender}
                onChange={setSaveSender}
              />
              <p className="mt-2 text-xs text-muted">
                Only the sender text is saved when enabled. Turn off to erase
                it. Client, logo, line items and notes are not stored.
              </p>
            </div>
            <div className="space-y-4">
              {rows.map((r, i) => (
                <div
                  key={i}
                  className="grid gap-2 border-t border-line pt-4 sm:grid-cols-2"
                >
                  {(["name", "quantity", "price", "tax"] as const).map((k) => (
                    <Field
                      key={k}
                      label={
                        k === "name"
                          ? "Description"
                          : k === "quantity"
                            ? "Quantity"
                            : k === "price"
                              ? "Unit price"
                              : "Tax (%)"
                      }
                    >
                      <Input
                        aria-label={
                          k === "tax" && i === 0 ? "Tax (%)" : `${k} ${i + 1}`
                        }
                        maxLength={k === "name" ? 400 : undefined}
                        type={k === "name" ? "text" : "number"}
                        step="any"
                        value={r[k]}
                        onChange={(e) => change(i, k, e.target.value)}
                      />
                    </Field>
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={rows.length === 1}
                    onClick={() => setRows(rows.filter((_, j) => i !== j))}
                  >
                    Remove item {i + 1}
                  </Button>
                </div>
              ))}
            </div>
            <Button
              className="my-4"
              variant="secondary"
              disabled={rows.length >= 50}
              onClick={() =>
                setRows([
                  ...rows,
                  { name: "", quantity: "1", price: "0", tax: "0" },
                ])
              }
            >
              Add item
            </Button>
            <Field label="Notes">
              <TextArea
                aria-label="Notes"
                maxLength={3000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>
          </Panel>
        </div>
        <section
          className="invoice-paper min-w-0 border border-line bg-white p-5 text-slate-900 sm:p-8"
          aria-label="Invoice preview"
        >
          <div className="flex flex-wrap justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold">{type.toUpperCase()}</h2>
              <p className="mt-2 break-all text-sm">
                {number} · {date}
              </p>
            </div>
            {logo && (
              <img
                src={logo}
                alt="Business logo"
                className="max-h-16 max-w-36 object-contain"
              />
            )}
          </div>
          <div className="my-6 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase text-slate-500">From</p>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm">
                {seller}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase text-slate-500">
                {type === "Invoice" ? "Bill to" : "Prepared for"}
              </p>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm">
                {buyer}
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-300">
                  <th className="py-3">Item</th>
                  <th>Qty</th>
                  <th>Rate</th>
                  <th>Tax</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-slate-200">
                    <td className="max-w-40 break-words py-4 pr-2">{r.name}</td>
                    <td className="pr-2">{r.quantity}</td>
                    <td className="pr-2">
                      {money(Math.round(Number(r.price) * 100))}
                    </td>
                    <td className="pr-2">{r.tax}%</td>
                    <td className="text-right">{money(rowAmounts(r).total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="ml-auto mt-6 space-y-2 text-right text-sm">
            <p>Subtotal: {money(totals.net)}</p>
            <p>Tax: {money(totals.tax)}</p>
            <p className="border-t border-slate-300 pt-3 text-lg font-bold">
              Total: {money(totals.total)}
            </p>
          </div>
          <p className="mt-8 whitespace-pre-wrap break-words text-sm">
            {notes}
          </p>
        </section>
      </div>
      <div className="no-print space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button disabled={!valid || busy} onClick={() => void pdf()}>
            {busy ? "Generating PDF…" : "Download A4 PDF"}
          </Button>
          <Button
            variant="secondary"
            disabled={!valid}
            onClick={() => window.print()}
          >
            Print / save as PDF
          </Button>
          <CopyButton
            value={`${type} ${number}\n${seller}\nClient: ${buyer}\nTotal: ${money(totals.total)}`}
            label="Copy totals"
          />
        </div>
        {!valid && (
          <p role="alert" className="text-danger">
            Enter business, client, number, date, descriptions, positive
            quantities, non-negative prices and tax from 0 to 100. Maximum 50
            items; descriptions 400 characters.
          </p>
        )}
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
        <p className="text-xs text-muted">
          A simple template, not a jurisdiction-specific tax invoice or
          accounting system. Include legally required details yourself. Tax is
          rounded per item to the nearest currency cent. The downloadable A4 PDF
          uses 200 ppi rendered pages for consistent multilingual text; text in
          it is not selectable. Print at 100% for A4. No currency conversion is
          performed.
        </p>
      </div>
    </div>
  );
}
