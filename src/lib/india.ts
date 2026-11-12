// India finance and office calculations. Pure functions, no DOM.
// Rules reviewed in November 2026 against incometaxindia.gov.in, PIB and passportindia.gov.in.
// Estimates only. Not tax, legal or payroll advice.

export const RULES_AS_OF = 'November 2026';

export type FY = '2025-26' | '2026-27';
export const FY_LABEL: Record<FY, string> = {
  '2025-26': 'FY 2025-26 (assessment year 2026-27)',
  '2026-27': 'FY 2026-27 (tax year 2026-27)',
};

export const inr = (n: number, digits = 0) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: digits, minimumFractionDigits: digits }).format(
    Number.isFinite(n) ? n : 0
  );
export const num = (n: number, digits = 2) =>
  new Intl.NumberFormat('en-IN', { maximumFractionDigits: digits }).format(Number.isFinite(n) ? n : 0);

export function parseAmount(raw: string, label: string, min = 0, max = 1e13): number {
  const s = String(raw).replace(/[,\s₹]/g, '');
  if (s === '') throw Error(`${label}: enter a number.`);
  const n = Number(s);
  if (!Number.isFinite(n)) throw Error(`${label}: "${raw}" is not a number.`);
  if (n < min) throw Error(`${label}: must be at least ${num(min, 4)}.`);
  if (n > max) throw Error(`${label}: must be at most ${num(max, 4)}.`);
  return n;
}

/* ------------------------------------------------------------------ GST */

export const GST_SLABS = [0, 0.25, 1.5, 3, 5, 12, 18, 28];

export interface GstResult {
  base: number;
  tax: number;
  total: number;
  cgst: number;
  sgst: number;
  igst: number;
}
/** `inclusive` means the entered amount already contains GST. */
export function gst(amount: number, rate: number, inclusive: boolean, interState: boolean): GstResult {
  const base = inclusive ? amount / (1 + rate / 100) : amount;
  const tax = (base * rate) / 100;
  return {
    base,
    tax,
    total: base + tax,
    cgst: interState ? 0 : tax / 2,
    sgst: interState ? 0 : tax / 2,
    igst: interState ? tax : 0,
  };
}

/* ------------------------------------------------------------------ Income tax */

export type Regime = 'new' | 'old';
export type AgeBand = 'below60' | '60to79' | '80plus';

export interface TaxInput {
  fy: FY;
  regime: Regime;
  age: AgeBand;
  resident: boolean;
  salary: number; // gross salary
  otherIncome: number; // interest, rent after standard deduction, etc. taxed at slab rates
  // old regime deductions
  hraExemption: number;
  sec80C: number;
  sec80CCD1B: number;
  sec80D: number;
  homeLoanInterest: number; // self-occupied, section 24(b)
  otherDeductions: number;
  employerNps: number; // 80CCD(2), allowed in both regimes
  basicDa: number; // for the employer NPS cap
}

export interface Slab {
  from: number;
  to: number;
  rate: number;
}
export interface TaxResult {
  grossIncome: number;
  standardDeduction: number;
  deductions: number;
  taxable: number;
  slabs: { slab: Slab; taxable: number; tax: number }[];
  baseTax: number;
  rebate: number;
  taxAfterRebate: number;
  surcharge: number;
  cess: number;
  total: number;
  effectiveRate: number;
  notes: string[];
}

const L = 100000;
// Both FY 2025-26 and FY 2026-27 use the same slabs. Budget 2026 left them unchanged.
const NEW_SLABS: Slab[] = [
  { from: 0, to: 4 * L, rate: 0 },
  { from: 4 * L, to: 8 * L, rate: 5 },
  { from: 8 * L, to: 12 * L, rate: 10 },
  { from: 12 * L, to: 16 * L, rate: 15 },
  { from: 16 * L, to: 20 * L, rate: 20 },
  { from: 20 * L, to: 24 * L, rate: 25 },
  { from: 24 * L, to: Infinity, rate: 30 },
];
const OLD_SLABS: Record<AgeBand, Slab[]> = {
  below60: [
    { from: 0, to: 2.5 * L, rate: 0 },
    { from: 2.5 * L, to: 5 * L, rate: 5 },
    { from: 5 * L, to: 10 * L, rate: 20 },
    { from: 10 * L, to: Infinity, rate: 30 },
  ],
  '60to79': [
    { from: 0, to: 3 * L, rate: 0 },
    { from: 3 * L, to: 5 * L, rate: 5 },
    { from: 5 * L, to: 10 * L, rate: 20 },
    { from: 10 * L, to: Infinity, rate: 30 },
  ],
  '80plus': [
    { from: 0, to: 5 * L, rate: 0 },
    { from: 5 * L, to: 10 * L, rate: 20 },
    { from: 10 * L, to: Infinity, rate: 30 },
  ],
};

function slabTax(income: number, slabs: Slab[]) {
  const rows = slabs.map((slab) => {
    const taxable = Math.max(0, Math.min(income, slab.to) - slab.from);
    return { slab, taxable, tax: (taxable * slab.rate) / 100 };
  });
  return { rows, tax: rows.reduce((s, r) => s + r.tax, 0) };
}

function surchargeRate(income: number, regime: Regime): number {
  if (income > 5 * 1e7) return regime === 'new' ? 25 : 37;
  if (income > 2 * 1e7) return 25;
  if (income > 1e7) return 15;
  if (income > 50 * L) return 10;
  return 0;
}

export function incomeTax(i: TaxInput): TaxResult {
  const notes: string[] = [];
  const gross = i.salary + i.otherIncome;
  const slabs = i.regime === 'new' ? NEW_SLABS : OLD_SLABS[i.age];
  const std = i.salary > 0 ? (i.regime === 'new' ? 75000 : 50000) : 0;
  const stdDeduction = Math.min(std, i.salary);
  const npsCap = i.basicDa > 0 ? i.basicDa * (i.regime === 'new' ? 0.14 : 0.1) : i.employerNps;
  const employerNps = Math.min(i.employerNps, npsCap);
  if (employerNps < i.employerNps) notes.push('Employer NPS (80CCD(2)) was capped at 14% of basic + DA (new regime) or 10% (old regime).');

  let deductions = employerNps;
  if (i.regime === 'old') {
    const c80 = Math.min(i.sec80C, 150000);
    const nps = Math.min(i.sec80CCD1B, 50000);
    const home = Math.min(i.homeLoanInterest, 200000);
    deductions += i.hraExemption + c80 + nps + i.sec80D + home + i.otherDeductions;
    if (i.sec80C > 150000) notes.push('Section 80C is capped at ₹1,50,000.');
    if (i.sec80CCD1B > 50000) notes.push('Section 80CCD(1B) is capped at ₹50,000.');
    if (i.homeLoanInterest > 200000) notes.push('Home loan interest on a self-occupied house is capped at ₹2,00,000.');
  } else if (i.hraExemption || i.sec80C || i.sec80D || i.homeLoanInterest || i.sec80CCD1B || i.otherDeductions) {
    notes.push('The new regime ignores HRA, 80C, 80D, home loan interest and similar deductions. Only the standard deduction and employer NPS apply.');
  }
  const taxable = Math.max(0, Math.round((gross - stdDeduction - deductions) / 10) * 10);

  const { rows, tax: baseTax } = slabTax(taxable, slabs);
  let rebate = 0;
  if (i.resident) {
    if (i.regime === 'new') {
      if (taxable <= 12 * L) rebate = Math.min(baseTax, 60000);
      else {
        // marginal relief: tax may not exceed the income above ₹12 lakh
        const excess = taxable - 12 * L;
        if (baseTax > excess) {
          rebate = baseTax - excess;
          notes.push('Marginal relief applied just above ₹12 lakh.');
        }
      }
    } else if (taxable <= 5 * L) rebate = Math.min(baseTax, 12500);
  } else notes.push('The section 87A rebate is only for resident individuals.');
  const afterRebate = baseTax - rebate;

  const rate = surchargeRate(taxable, i.regime);
  let surcharge = (afterRebate * rate) / 100;
  if (rate > 0) {
    // marginal relief at each surcharge threshold
    const thresholds = [50 * L, 100 * L, 200 * L, 500 * L];
    const t = [...thresholds].reverse().find((x) => taxable > x);
    if (t) {
      const prevRate = surchargeRate(t, i.regime);
      const { tax: taxAtT } = slabTax(t, slabs);
      const limit = taxAtT + (taxAtT * prevRate) / 100 + (taxable - t);
      if (afterRebate + surcharge > limit) {
        surcharge = Math.max(0, limit - afterRebate);
        notes.push('Surcharge marginal relief applied.');
      }
    }
  }
  const cess = ((afterRebate + surcharge) * 4) / 100;
  const total = Math.round(afterRebate + surcharge + cess);
  return {
    grossIncome: gross,
    standardDeduction: stdDeduction,
    deductions,
    taxable,
    slabs: rows,
    baseTax,
    rebate,
    taxAfterRebate: afterRebate,
    surcharge,
    cess,
    total,
    effectiveRate: gross > 0 ? (total / gross) * 100 : 0,
    notes,
  };
}

/* ------------------------------------------------------------------ TDS */

export interface TdsPreset {
  id: string;
  section: string; // Income-tax Act 1961 numbering
  newRef: string; // Income-tax Act 2025 reference
  label: string;
  rate: number;
  threshold: number;
  thresholdNote: string;
}
export const TDS_PRESETS: TdsPreset[] = [
  { id: '194C-i', section: '194C', newRef: '393(1) Sl.6(i)', label: 'Contractor, individual or HUF', rate: 1, threshold: 100000, thresholdNote: '₹30,000 per bill or ₹1,00,000 a year' },
  { id: '194C-o', section: '194C', newRef: '393(1) Sl.6(i)', label: 'Contractor, other than individual or HUF', rate: 2, threshold: 100000, thresholdNote: '₹30,000 per bill or ₹1,00,000 a year' },
  { id: '194J-p', section: '194J', newRef: '393(1) Sl.6(iii)', label: 'Professional fees, director remuneration', rate: 10, threshold: 50000, thresholdNote: '₹50,000 a year' },
  { id: '194J-t', section: '194J', newRef: '393(1) Sl.6(iii)', label: 'Technical services, call centre, film royalty', rate: 2, threshold: 50000, thresholdNote: '₹50,000 a year' },
  { id: '194H', section: '194H', newRef: '393(1) Sl.1(ii)', label: 'Commission or brokerage', rate: 2, threshold: 20000, thresholdNote: '₹20,000 a year' },
  { id: '194I-b', section: '194I', newRef: '393(1) Sl.2(ii)', label: 'Rent, land, building or furniture', rate: 10, threshold: 600000, thresholdNote: '₹50,000 a month (₹6,00,000 a year)' },
  { id: '194I-p', section: '194I', newRef: '393(1) Sl.2(ii)', label: 'Rent, plant and machinery', rate: 2, threshold: 600000, thresholdNote: '₹50,000 a month (₹6,00,000 a year)' },
  { id: '194IB', section: '194IB', newRef: '393(1) Sl.2(i)', label: 'Rent paid by individual or HUF not under audit', rate: 2, threshold: 50000, thresholdNote: 'Over ₹50,000 a month' },
  { id: '194A-b', section: '194A', newRef: '393(1) Sl.5(ii)', label: 'Bank or post office interest, others', rate: 10, threshold: 50000, thresholdNote: '₹50,000 a year' },
  { id: '194A-s', section: '194A', newRef: '393(1) Sl.5(ii)', label: 'Bank or post office interest, senior citizen', rate: 10, threshold: 100000, thresholdNote: '₹1,00,000 a year' },
  { id: '194A-o', section: '194A', newRef: '393(1) Sl.5(iii)', label: 'Interest other than on securities', rate: 10, threshold: 10000, thresholdNote: '₹10,000 a year' },
  { id: '194Q', section: '194Q', newRef: '393(1) Sl.8(ii)', label: 'Purchase of goods (on the excess)', rate: 0.1, threshold: 5000000, thresholdNote: '₹50 lakh a year, tax only on the excess' },
  { id: '194O', section: '194O', newRef: '393(1) Sl.8(v)', label: 'E-commerce operator payments to sellers', rate: 0.1, threshold: 500000, thresholdNote: '₹5,00,000 for individual or HUF sellers' },
  { id: '194M', section: '194M', newRef: '393', label: 'Contract or professional fees by individual or HUF not under audit', rate: 2, threshold: 5000000, thresholdNote: '₹50 lakh a year' },
  { id: '194R', section: '194R', newRef: '393(1) Sl.8(iv)', label: 'Business benefit or perquisite', rate: 10, threshold: 20000, thresholdNote: '₹20,000 a year' },
  { id: '194B', section: '194B', newRef: '393(3) Sl.1', label: 'Lottery, game and puzzle winnings', rate: 30, threshold: 10000, thresholdNote: '₹10,000 per transaction' },
  { id: '194S', section: '194S', newRef: '393(1) Sl.8(vi)', label: 'Transfer of virtual digital assets', rate: 1, threshold: 10000, thresholdNote: '₹10,000 (₹50,000 for specified persons)' },
  { id: '194', section: '194', newRef: '393(1) Sl.7', label: 'Dividend', rate: 10, threshold: 10000, thresholdNote: '₹10,000 a year' },
];

export interface TdsResult {
  applies: boolean;
  tds: number;
  effectiveRate: number;
  net: number;
  note: string;
}
/** `aggregate` is the total paid in the year including this payment. */
export function tds(payment: number, aggregate: number, rate: number, threshold: number, hasPan: boolean, onExcessOnly = false): TdsResult {
  const applies = aggregate > threshold;
  if (!applies) return { applies, tds: 0, effectiveRate: 0, net: payment, note: 'Below the threshold, so no TDS is deducted on this payment.' };
  const effective = hasPan ? rate : Math.max(rate, 20);
  const base = onExcessOnly ? Math.max(0, Math.min(payment, aggregate - threshold)) : payment;
  const amount = Math.round((base * effective) / 100);
  return {
    applies,
    tds: amount,
    effectiveRate: effective,
    net: payment - amount,
    note: hasPan ? 'Rate applied as entered.' : 'No PAN: the higher of the rate or 20% applies (5% for 194Q and 194O).',
  };
}

/* ------------------------------------------------------------------ EPF */

export interface EpfInput {
  basicDa: number; // monthly
  currentBalance: number;
  age: number;
  retireAge: number;
  raisePct: number;
  interest: number; // % a year
  employeePct: number;
  wageCeiling: boolean; // contribute on max ₹15,000 wage for the employer pension split
}
export interface EpfResult {
  years: number;
  employeeTotal: number;
  employerTotal: number;
  interestTotal: number;
  corpus: number;
  monthlyEmployee: number;
  monthlyEpf: number;
  monthlyEps: number;
  rows: { year: number; age: number; contribution: number; interest: number; balance: number }[];
}
export function epf(i: EpfInput): EpfResult {
  const years = i.retireAge - i.age;
  if (years <= 0) throw Error('Retirement age must be above your current age.');
  let basic = i.basicDa;
  let bal = i.currentBalance;
  let emp = 0;
  let er = 0;
  let intr = 0;
  const rows: EpfResult['rows'] = [];
  const epsWage = Math.min(basic, 15000);
  for (let y = 1; y <= years; y++) {
    const eps = Math.min(basic, 15000) * 0.0833;
    const mEmployee = (basic * i.employeePct) / 100;
    const mEmployer = (basic * 12) / 100 - (i.wageCeiling ? eps : 0);
    let yearIntr = 0;
    let running = bal;
    for (let m = 0; m < 12; m++) {
      running += mEmployee + mEmployer;
      yearIntr += (running * i.interest) / 1200;
      // interest is credited at year end; it accrues monthly on the running balance
    }
    const contrib = (mEmployee + mEmployer) * 12;
    bal = bal + contrib + yearIntr;
    emp += mEmployee * 12;
    er += mEmployer * 12;
    intr += yearIntr;
    rows.push({ year: y, age: i.age + y, contribution: contrib, interest: yearIntr, balance: bal });
    basic *= 1 + i.raisePct / 100;
  }
  const eps0 = (Math.min(i.basicDa, 15000) * 0.0833);
  void epsWage;
  return {
    years,
    employeeTotal: emp,
    employerTotal: er,
    interestTotal: intr,
    corpus: bal,
    monthlyEmployee: (i.basicDa * i.employeePct) / 100,
    monthlyEpf: (i.basicDa * 12) / 100 - (i.wageCeiling ? eps0 : 0),
    monthlyEps: i.wageCeiling ? eps0 : 0,
    rows,
  };
}

/* ------------------------------------------------------------------ Gratuity */

export interface GratuityResult {
  completedYears: number;
  gratuity: number;
  capped: boolean;
  formula: string;
}
export function gratuity(basicDa: number, years: number, months: number, covered: boolean, cap = 2000000): GratuityResult {
  // service of more than 6 months in the last year rounds up to the next year
  const completed = months > 6 ? years + 1 : years;
  const days = covered ? 26 : 30;
  const raw = (basicDa * 15 * completed) / days;
  return {
    completedYears: completed,
    gratuity: Math.min(raw, cap),
    capped: raw > cap,
    formula: `${num(basicDa)} × 15 ÷ ${days} × ${completed}`,
  };
}

/* ------------------------------------------------------------------ HRA */

export const METROS_NEW = ['Delhi', 'Mumbai', 'Kolkata', 'Chennai', 'Bengaluru', 'Hyderabad', 'Pune', 'Ahmedabad'];
export const METROS_OLD = ['Delhi', 'Mumbai', 'Kolkata', 'Chennai'];
export function hra(basicDa: number, hraReceived: number, rentPaid: number, metro: boolean) {
  const a = hraReceived;
  const b = Math.max(0, rentPaid - basicDa * 0.1);
  const c = basicDa * (metro ? 0.5 : 0.4);
  const exempt = Math.max(0, Math.min(a, b, c));
  return { a, b, c, exempt, taxable: Math.max(0, hraReceived - exempt) };
}

/* ------------------------------------------------------------------ FD and RD */

export interface FdResult {
  maturity: number;
  interest: number;
  rows: { year: number; balance: number; interest: number }[];
}
const PERIODS: Record<string, number> = { Monthly: 12, Quarterly: 4, 'Half-yearly': 2, Yearly: 1 };
export const FD_FREQ = Object.keys(PERIODS);
export function fd(principal: number, ratePct: number, years: number, freq: string): FdResult {
  const n = PERIODS[freq] ?? 4;
  const r = ratePct / 100;
  const at = (t: number) => principal * Math.pow(1 + r / n, n * t);
  const rows: FdResult['rows'] = [];
  for (let y = 1; y <= Math.ceil(years); y++) {
    const t = Math.min(y, years);
    rows.push({ year: y, balance: at(t), interest: at(t) - principal });
  }
  return { maturity: at(years), interest: at(years) - principal, rows };
}
export function fdSimple(principal: number, ratePct: number, years: number) {
  const interest = (principal * ratePct * years) / 100;
  return { maturity: principal + interest, interest };
}
export function rd(monthly: number, ratePct: number, months: number) {
  // Each instalment compounds quarterly for its remaining time, the method most Indian banks use.
  const r = ratePct / 100;
  let maturity = 0;
  for (let k = 1; k <= months; k++) maturity += monthly * Math.pow(1 + r / 4, (4 * (months - k + 1)) / 12);
  const deposited = monthly * months;
  return { maturity, deposited, interest: maturity - deposited };
}

/* ------------------------------------------------------------------ Loan schedule */

export interface LoanRow {
  month: number;
  emi: number;
  interest: number;
  principal: number;
  balance: number;
  extra: number;
}
export function loan(principal: number, ratePct: number, months: number, extraMonthly = 0) {
  const r = ratePct / 1200;
  const emi = r === 0 ? principal / months : (principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
  const rows: LoanRow[] = [];
  let bal = principal;
  let totalInterest = 0;
  for (let m = 1; m <= months && bal > 0.005; m++) {
    const interest = bal * r;
    let princ = Math.min(bal, emi - interest + extraMonthly);
    if (princ < 0) princ = 0;
    const pay = interest + princ;
    bal -= princ;
    totalInterest += interest;
    rows.push({ month: m, emi: pay, interest, principal: princ, balance: Math.max(0, bal), extra: extraMonthly });
  }
  return { emi, rows, totalInterest, months: rows.length, totalPaid: principal + totalInterest };
}

/* ------------------------------------------------------------------ Salary structure */

export interface SalaryInput {
  ctc: number; // annual
  basicPct: number;
  hraPct: number; // of basic
  pfOnCeiling: boolean;
  gratuityInCtc: boolean;
  professionalTax: number; // monthly
  regime: Regime;
  fy: FY;
}
export function salaryStructure(i: SalaryInput) {
  const basic = (i.ctc * i.basicPct) / 100;
  const hraA = (basic * i.hraPct) / 100;
  const pfBase = i.pfOnCeiling ? Math.min(basic, 15000 * 12) : basic;
  const employerPf = pfBase * 0.12;
  const employeePf = pfBase * 0.12;
  const gratuityA = i.gratuityInCtc ? (basic * 15) / 26 / 12 : 0;
  const special = i.ctc - basic - hraA - employerPf - gratuityA;
  if (special < 0) throw Error('Basic, HRA, PF and gratuity add up to more than CTC. Lower the basic or HRA percentage.');
  const gross = basic + hraA + special;
  const tax = incomeTax({
    fy: i.fy,
    regime: i.regime,
    age: 'below60',
    resident: true,
    salary: gross,
    otherIncome: 0,
    hraExemption: 0,
    sec80C: Math.min(employeePf, 150000),
    sec80CCD1B: 0,
    sec80D: 0,
    homeLoanInterest: 0,
    otherDeductions: 0,
    employerNps: 0,
    basicDa: basic,
  });
  const annualDeductions = employeePf + i.professionalTax * 12 + tax.total;
  return {
    basic,
    hra: hraA,
    special,
    gross,
    employerPf,
    employeePf,
    gratuity: gratuityA,
    tax: tax.total,
    takeHomeAnnual: gross - annualDeductions,
    takeHomeMonthly: (gross - annualDeductions) / 12,
    grossMonthly: gross / 12,
  };
}

/* ------------------------------------------------------------------ Dates */

export function parseISODate(s: string, label: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw Error(`${label}: choose a valid date.`);
  const d = new Date(s + 'T00:00:00Z');
  if (Number.isNaN(+d)) throw Error(`${label}: choose a valid date.`);
  return d;
}
export const iso = (d: Date) => d.toISOString().slice(0, 10);

/** weekend: array of weekday numbers (0=Sun). holidays: ISO date strings. */
export function workingDays(from: string, to: string, weekend: number[], holidays: string[]) {
  const a = parseISODate(from, 'Start date');
  const b = parseISODate(to, 'End date');
  if (b < a) throw Error('End date is before the start date.');
  if ((+b - +a) / 864e5 > 36600) throw Error('Choose a range of up to 100 years.');
  const hol = new Set(holidays);
  let working = 0;
  let weekendDays = 0;
  let holidayDays = 0;
  let total = 0;
  for (let d = new Date(a); d <= b; d.setUTCDate(d.getUTCDate() + 1)) {
    total++;
    if (weekend.includes(d.getUTCDay())) weekendDays++;
    else if (hol.has(iso(d))) holidayDays++;
    else working++;
  }
  return { total, working, weekendDays, holidayDays };
}
export function addWorkingDays(from: string, n: number, weekend: number[], holidays: string[]) {
  const d = parseISODate(from, 'Start date');
  const hol = new Set(holidays);
  const step = n < 0 ? -1 : 1;
  let left = Math.abs(n);
  if (left > 100000) throw Error('Use up to 100000 working days.');
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + step);
    if (!weekend.includes(d.getUTCDay()) && !hol.has(iso(d))) left--;
  }
  return iso(d);
}
export function parseHolidays(text: string): string[] {
  return text
    .split(/[\s,;]+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => {
      parseISODate(x, `Holiday "${x}"`);
      return x;
    });
}

/* ------------------------------------------------------------------ Number to words (Indian) */

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
function below1000(n: number): string {
  let s = '';
  if (n >= 100) {
    s += ONES[Math.floor(n / 100)] + ' Hundred';
    n %= 100;
    if (n) s += ' ';
  }
  if (n >= 20) s += TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
  else if (n > 0) s += ONES[n];
  return s;
}
export function rupeesInWords(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0) throw Error('Enter a non-negative amount.');
  if (amount >= 1e15) throw Error('Amount is too large to convert.');
  const rupees = Math.floor(Math.round(amount * 100) / 100);
  const paise = Math.round((amount - rupees) * 100) % 100;
  const parts: string[] = [];
  let n = rupees;
  const crore = Math.floor(n / 1e7);
  n %= 1e7;
  const lakh = Math.floor(n / 1e5);
  n %= 1e5;
  const thousand = Math.floor(n / 1e3);
  n %= 1e3;
  if (crore) parts.push((crore >= 100 ? rupeesInWords(crore).replace(' Rupees Only', '') : below1000(crore)) + ' Crore');
  if (lakh) parts.push(below1000(lakh) + ' Lakh');
  if (thousand) parts.push(below1000(thousand) + ' Thousand');
  if (n) parts.push(below1000(n));
  let words = parts.join(' ') || 'Zero';
  words += ' Rupees';
  if (paise) words += ' and ' + below1000(paise) + ' Paise';
  return words + ' Only';
}

/* ------------------------------------------------------------------ ID format checks */

const GST_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export function gstinCheckChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = GST_CHARS.indexOf(first14[i]);
    const p = v * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return GST_CHARS[(36 - (sum % 36)) % 36];
}
export const GST_STATE_CODES: Record<string, string> = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat', '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman and Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh', '97': 'Other Territory', '99': 'Centre Jurisdiction',
};
export function checkGstin(raw: string) {
  const g = raw.trim().toUpperCase();
  const problems: string[] = [];
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g)) problems.push('Format should be 2 digits, 5 letters, 4 digits, 1 letter, 1 letter or digit, Z, 1 check character.');
  else {
    if (!GST_STATE_CODES[g.slice(0, 2)]) problems.push('Unknown state code ' + g.slice(0, 2) + '.');
    if (gstinCheckChar(g.slice(0, 14)) !== g[14]) problems.push('The check character does not match, so the number has a typing error or is not genuine.');
  }
  return { gstin: g, valid: problems.length === 0, state: GST_STATE_CODES[g.slice(0, 2)] ?? '', pan: g.slice(2, 12), problems };
}
const PAN_TYPES: Record<string, string> = { P: 'Individual', C: 'Company', H: 'Hindu undivided family', F: 'Firm or LLP', A: 'Association of persons', T: 'Trust', B: 'Body of individuals', L: 'Local authority', J: 'Artificial juridical person', G: 'Government' };
export function checkPan(raw: string) {
  const p = raw.trim().toUpperCase();
  if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(p)) return { pan: p, valid: false, type: '', problem: 'A PAN has 5 letters, 4 digits and 1 letter, for example ABCDE1234F.' };
  const type = PAN_TYPES[p[3]];
  if (!type) return { pan: p, valid: false, type: '', problem: `The fourth character "${p[3]}" is not a valid holder type.` };
  return { pan: p, valid: true, type, problem: '' };
}
export function checkIfsc(raw: string) {
  const c = raw.trim().toUpperCase();
  return { ifsc: c, valid: /^[A-Z]{4}0[A-Z0-9]{6}$/.test(c), bank: c.slice(0, 4), branch: c.slice(5) };
}
