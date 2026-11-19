import { useMemo, useState } from 'react';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { Button, Field, Grid, Input, Note, Panel, Toggle } from '../../components/ui';
import { downloadBlob, todayISO } from '../../lib/utils';


const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];


function twoDigitWords(n: number): string {
  if (n < 20) return ONES[n];
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`;
}


function indianRupeesInWords(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return '';
  const whole = Math.floor(amount);
  const paise = Math.round((amount - whole) * 100);
  const parts: string[] = [];


  const crore = Math.floor(whole / 10000000);
  const lakh = Math.floor((whole % 10000000) / 100000);
  const thousand = Math.floor((whole % 100000) / 1000);
  const hundred = Math.floor((whole % 1000) / 100);
  const rem = whole % 100;


  if (crore) parts.push(`${indianRupeesInWords(crore).replace(/ Only$/, '')} Crore`);
  if (lakh) parts.push(`${twoDigitWords(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigitWords(thousand)} Thousand`);
  if (hundred) parts.push(`${ONES[hundred]} Hundred`);
  if (rem) parts.push(twoDigitWords(rem));


  let text = parts.join(' ').trim();
  if (paise > 0) {
    text += ` and ${twoDigitWords(paise)} Paise`;
  }
  return text ? `${text} Only` : '';
}


const MM_TO_PT = 72 / 25.4;
// Standard CTS-2010 Indian cheque size: 202 mm × 92 mm
const CHEQUE_W_MM = 202;
const CHEQUE_H_MM = 92;


export default function ChequeOverlay() {
  const [payee, setPayee] = useState('Acme Office Supplies Pvt. Ltd.');
  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState('24500');
  const [acPayee, setAcPayee] = useState(true);
  const [offsetX, setOffsetX] = useState('0');
  const [offsetY, setOffsetY] = useState('0');


  const numericAmount = Math.max(0, Number(amount) || 0);
  const words = useMemo(() => indianRupeesInWords(numericAmount), [numericAmount]);


  const formattedDigits = useMemo(() => {
    const [yyyy, mm, dd] = date.split('-');
    if (!yyyy || !mm || !dd) return '';
    return `${dd}${mm}${yyyy}`;
  }, [date]);


  const formattedAmount = useMemo(() => {
    if (!numericAmount) return '';
    return `${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(numericAmount)}/-`;
  }, [numericAmount]);


  const exportPdf = async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([CHEQUE_W_MM * MM_TO_PT, CHEQUE_H_MM * MM_TO_PT]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);


    const dx = Number(offsetX) || 0;
    const dy = Number(offsetY) || 0;
    const xPt = (mm: number) => (mm + dx) * MM_TO_PT;
    const yPt = (mmFromTop: number) => (CHEQUE_H_MM - (mmFromTop + dy)) * MM_TO_PT;


    if (acPayee) {
      page.drawLine({
        start: { x: xPt(8), y: yPt(14) },
        end: { x: xPt(32), y: yPt(6) },
        thickness: 0.9,
        color: rgb(0.1, 0.1, 0.1),
      });
      page.drawLine({
        start: { x: xPt(8), y: yPt(19) },
        end: { x: xPt(32), y: yPt(11) },
        thickness: 0.9,
        color: rgb(0.1, 0.1, 0.1),
      });
      page.drawText('A/C PAYEE ONLY', {
        x: xPt(9),
        y: yPt(16),
        size: 7,
        font: bold,
        color: rgb(0.1, 0.1, 0.1),
      });
    }


    // Date digits spaced across CTS-2010 8-box grid (top right, ~154mm to 194mm)
    formattedDigits.split('').forEach((digit, idx) => {
      page.drawText(digit, {
        x: xPt(156 + idx * 5.05),
        y: yPt(13.5),
        size: 11,
        font: bold,
        color: rgb(0.05, 0.05, 0.05),
      });
    });


    // Payee line
    page.drawText(`** ${payee.trim()} **`, {
      x: xPt(20),
      y: yPt(26),
      size: 11,
      font: bold,
      color: rgb(0.05, 0.05, 0.05),
    });


    // Amount in words (wrap cleanly onto 2 lines if long)
    const line1 = words.length > 52 ? words.slice(0, words.lastIndexOf(' ', 52)) : words;
    const line2 = words.length > 52 ? words.slice(line1.length).trim() : '';


    page.drawText(line1, {
      x: xPt(28),
      y: yPt(36.5),
      size: 10,
      font,
      color: rgb(0.05, 0.05, 0.05),
    });
    if (line2) {
      page.drawText(line2, {
        x: xPt(14),
        y: yPt(45.5),
        size: 10,
        font,
        color: rgb(0.05, 0.05, 0.05),
      });
    }


    // Amount in figures box
    page.drawText(`** ${formattedAmount}`, {
      x: xPt(158),
      y: yPt(43.5),
      size: 11.5,
      font: bold,
      color: rgb(0.05, 0.05, 0.05),
    });


    const bytes = await pdf.save();
    downloadBlob('cts2010-cheque-print.pdf', new Blob([bytes as BlobPart], { type: 'application/pdf' }));
  };


  return (
    <div className="space-y-4">
      <Note tone="warning">
        Always test-print on a plain cut A4 paper first and hold it against a real cheque leaf before feeding an actual cheque into your printer. Print at 100% scale (no fit-to-page).
      </Note>


      <Panel title="Cheque details (CTS-2010 · 202 × 92 mm)">
        <Grid cols={2}>
          <Field label="Payee name">
            <Input value={payee} onChange={(e) => setPayee(e.target.value)} maxLength={70} />
          </Field>
          <Field label="Cheque date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Amount (INR)">
            <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <div className="flex items-end pb-1">
            <Toggle checked={acPayee} onChange={setAcPayee} label="Mark A/C Payee Only" />
          </div>
        </Grid>


        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Horizontal printer nudge (mm)" hint="Negative = left, positive = right">
            <Input type="number" step="0.5" value={offsetX} onChange={(e) => setOffsetX(e.target.value)} />
          </Field>
          <Field label="Vertical printer nudge (mm)" hint="Negative = up, positive = down">
            <Input type="number" step="0.5" value={offsetY} onChange={(e) => setOffsetY(e.target.value)} />
          </Field>
        </div>


        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => void exportPdf()} disabled={!payee.trim() || numericAmount <= 0}>
            Download 1:1 Cheque PDF
          </Button>
          <span className="font-mono text-xs text-muted">Words: {words || '—'}</span>
        </div>
      </Panel>


      <Panel title="Alignment preview">
        <div
          className="relative mx-auto w-full max-w-2xl border border-line bg-[#f8f6ef] text-[#141619] font-mono shadow-soft"
          style={{ aspectRatio: '202 / 92' }}
        >
          {acPayee && (
            <div className="absolute left-[4%] top-[8%] border-y border-black px-1.5 py-0.5 text-[9px] font-bold tracking-wider -rotate-12">
              A/C PAYEE ONLY
            </div>
          )}
          <div className="absolute right-[4%] top-[10%] flex gap-[3px] text-xs font-bold tracking-widest">
            {formattedDigits.split('').map((d, i) => (
              <span key={i} className="inline-flex h-5 w-4 items-center justify-center border border-black/30">
                {d}
              </span>
            ))}
          </div>
          <div className="absolute left-[10%] top-[26%] text-xs font-semibold">
            ** {payee || 'Payee Name'} **
          </div>
          <div className="absolute left-[14%] top-[38%] right-[28%] text-[11px] leading-5">
            {words || 'Rupees in words'}
          </div>
          <div className="absolute right-[4%] top-[44%] border border-black/30 px-2 py-1 text-xs font-bold">
            ** {formattedAmount || '0.00/-'}
          </div>
        </div>
      </Panel>
    </div>
  );
}
