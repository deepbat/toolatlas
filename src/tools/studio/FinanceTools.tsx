import { useState, type ReactNode } from 'react';
import { useLocalStorage } from '../../lib/hooks';
import { downloadBlob, downloadText, todayISO } from '../../lib/utils';
import { detectDelimiter, parseCsv, toCsv } from '../../lib/csvtools';
import { makeXlsx, readXlsx } from '../../lib/xlsx';
import { cagr, invoiceTotals, parseInvoiceLines, ppf, summarise, textPdf, type Entry } from '../../lib/office';
import { useParams } from 'react-router-dom';
import { Button, Dropzone, DownloadButton, Field, Grid, Input, Note, Panel, Select, TextArea } from '../../components/ui';
import {
  FD_FREQ, FY_LABEL, METROS_NEW, METROS_OLD, RULES_AS_OF, TDS_PRESETS, addWorkingDays, checkGstin, checkIfsc, checkPan, epf, fd, fdSimple, gratuity, hra, incomeTax,
  inr, loan, num, parseAmount, parseHolidays, rd, rupeesInWords, salaryStructure, tds, workingDays, type AgeBand, type FY, type Regime,
} from '../../lib/india';
import { DataTable, Disclaimer, Kv } from './kit';

type Spec = { key: string; label: string; value: string; hint?: string; options?: [string, string][]; textarea?: boolean };

function Calc({ fields, run, intro }: { fields: Spec[]; run: (v: Record<string, string>) => ReactNode; intro?: ReactNode }) {
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.key, f.value])));
  let out: ReactNode = null;
  let err = '';
  try { out = run(v); } catch (e) { err = e instanceof Error ? e.message : 'Check the inputs.'; }
  return (
    <div className="space-y-4">
      <Panel title="Inputs" description={intro as string | undefined}>
        <Grid>
          {fields.map((f) => (
            <Field key={f.key} label={f.label} hint={f.hint} htmlFor={'f-' + f.key}>
              {f.options ? (
                <Select id={'f-' + f.key} value={v[f.key]} onChange={(e) => setV({ ...v, [f.key]: e.target.value })}>{f.options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
              ) : f.textarea ? (
                <TextArea id={'f-' + f.key} rows={4} value={v[f.key]} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} />
              ) : (
                <Input id={'f-' + f.key} inputMode={f.value.match(/^[\d.,]*$/) ? 'decimal' : 'text'} value={v[f.key]} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} />
              )}
            </Field>
          ))}
        </Grid>
      </Panel>
      {err ? <div role="alert" data-testid="calc-error"><Note tone="warning">{err}</Note></div> : <div data-testid="calc-result" className="space-y-4">{out}</div>}
    </div>
  );
}
const FYS: [string, string][] = (Object.keys(FY_LABEL) as FY[]).map((k) => [k, FY_LABEL[k]]);
const a = (v: Record<string, string>, k: string, label: string, min = 0, max = 1e13) => parseAmount(v[k], label, min, max);
const Src = ({ children }: { children: ReactNode }) => <p className="text-xs text-muted">Sources: {children}. Rules reviewed {RULES_AS_OF}.</p>;
const lnk = (href: string, t: string) => <a className="underline" href={href} target="_blank" rel="noopener noreferrer">{t}</a>;

/* Income tax */
function IncomeTax() {
  return (
    <Calc
      fields={[
        { key: 'fy', label: 'Financial year', value: '2026-27', options: FYS },
        { key: 'regime', label: 'Tax regime', value: 'new', options: [['new', 'New regime (default)'], ['old', 'Old regime']] },
        { key: 'age', label: 'Age', value: 'below60', options: [['below60', 'Below 60'], ['60to79', '60 to 79'], ['80plus', '80 or above']] },
        { key: 'salary', label: 'Gross salary (per year)', value: '1500000' },
        { key: 'other', label: 'Other income (per year)', value: '0', hint: 'Interest, rent after standard deduction and so on.' },
        { key: 'basic', label: 'Basic + DA (per year)', value: '600000', hint: 'Used for the employer NPS limit.' },
        { key: 'enps', label: 'Employer NPS 80CCD(2)', value: '0' },
        { key: 'hra', label: 'HRA exemption (old regime)', value: '0', hint: 'Use the HRA calculator.' },
        { key: 'c80', label: '80C investments (old regime)', value: '0' },
        { key: 'nps', label: '80CCD(1B) NPS (old regime)', value: '0' },
        { key: 'd80', label: '80D health insurance (old regime)', value: '0' },
        { key: 'home', label: 'Home loan interest 24(b) (old regime)', value: '0' },
        { key: 'oth', label: 'Other old-regime deductions', value: '0' },
      ]}
      run={(v) => {
        const input = {
          fy: v.fy as FY, regime: v.regime as Regime, age: v.age as AgeBand, resident: true,
          salary: a(v, 'salary', 'Salary'), otherIncome: a(v, 'other', 'Other income'), hraExemption: a(v, 'hra', 'HRA exemption'), sec80C: a(v, 'c80', '80C'),
          sec80CCD1B: a(v, 'nps', '80CCD(1B)'), sec80D: a(v, 'd80', '80D'), homeLoanInterest: a(v, 'home', 'Home loan interest'), otherDeductions: a(v, 'oth', 'Other deductions'),
          employerNps: a(v, 'enps', 'Employer NPS'), basicDa: a(v, 'basic', 'Basic + DA'),
        };
        const r = incomeTax(input);
        const other = incomeTax({ ...input, regime: input.regime === 'new' ? 'old' : 'new' });
        return (
          <>
            <Panel title={`Tax for ${FY_LABEL[input.fy]}, ${input.regime === 'new' ? 'new' : 'old'} regime`}>
              <Kv strong={9} rows={[
                ['Gross income', inr(r.grossIncome)], ['Standard deduction', inr(r.standardDeduction)], ['Other deductions', inr(r.deductions)], ['Taxable income', inr(r.taxable)],
                ['Tax on slabs', inr(r.baseTax)], ['Rebate u/s 87A', inr(r.rebate)], ['Surcharge', inr(r.surcharge)], ['Health and education cess 4%', inr(r.cess)], ['Effective rate', num(r.effectiveRate, 2) + '%'], ['Total tax', inr(r.total)],
              ]} />
              <div className="mt-4"><DataTable caption="Tax by slab" head={['Slab', 'Rate', 'Taxable', 'Tax']} rows={r.slabs.map((s) => [`${inr(s.slab.from)} to ${s.slab.to === Infinity ? 'above' : inr(s.slab.to)}`, num(s.slab.rate * 100, 0) + '%', inr(s.taxable), inr(s.tax)])} /></div>
              {r.notes.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">{r.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
            </Panel>
            <Note>Same inputs under the {input.regime === 'new' ? 'old' : 'new'} regime: <strong data-testid="other-regime">{inr(other.total)}</strong>. {other.total < r.total ? 'That is lower.' : other.total > r.total ? 'That is higher.' : 'That is the same.'}</Note>
            <Disclaimer fy={FY_LABEL[input.fy]}>Residents only. Capital gains, special-rate income, AMT and employer perquisites are not modelled.</Disclaimer>
            <Src>{lnk('https://www.incometaxindia.gov.in/w/threshold-limits-under-income-tax-act', 'Income Tax Department, threshold limits')}; Budget 2026 left the slabs unchanged for both years</Src>
          </>
        );
      }}
    />
  );
}

/* TDS */
function Tds() {
  return (
    <Calc
      fields={[
        { key: 'preset', label: 'Payment type', value: TDS_PRESETS[0].id, options: TDS_PRESETS.map((p) => [p.id, `${p.section} · ${p.label}`]) },
        { key: 'amount', label: 'This payment (₹)', value: '75000' },
        { key: 'agg', label: 'Total paid this year including this payment (₹)', value: '75000' },
        { key: 'pan', label: 'Payee has a PAN', value: 'yes', options: [['yes', 'Yes'], ['no', 'No (higher rate applies)']] },
      ]}
      run={(v) => {
        const p = TDS_PRESETS.find((x) => x.id === v.preset)!;
        const amt = a(v, 'amount', 'Payment'), agg = a(v, 'agg', 'Yearly total', amt);
        const r = tds(amt, agg, p.rate, p.threshold, v.pan === 'yes', p.id === '194Q');
        return (
          <>
            <Panel title={`Section ${p.section} (Income-tax Act 2025: ${p.newRef})`}>
              <Kv strong={1} rows={[['TDS applies', r.applies ? 'Yes' : 'No'], ['TDS to deduct', inr(r.tds, 2)], ['Rate applied', num(r.effectiveRate, 2) + '%'], ['Net to payee', inr(r.net, 2)], ['Threshold', p.thresholdNote]]} />
              <p className="mt-3 text-sm text-muted">{r.note}</p>
            </Panel>
            <Disclaimer fy="FY 2026-27">Rates are the common ones. Lower deduction certificates, treaty rates and specific exemptions are not applied.</Disclaimer>
            <Src>{lnk('https://tdsguru.in/tds-rate-chart-fy-2026-27.html', 'TDS rate chart FY 2026-27 (third party)')} and {lnk('https://taxhandout.com/tds-rate-chart-for-tax-year-2026-27/', 'tax handout chart')}, checked against the CBDT section mapping. Confirm with the Income Tax Department</Src>
          </>
        );
      }}
    />
  );
}

/* EPF */
function Epf() {
  return (
    <Calc
      fields={[
        { key: 'basic', label: 'Basic + DA (per month)', value: '30000' },
        { key: 'bal', label: 'Current EPF balance', value: '0' },
        { key: 'age', label: 'Your age', value: '28' },
        { key: 'ret', label: 'Retirement age', value: '58' },
        { key: 'raise', label: 'Yearly salary rise (%)', value: '6' },
        { key: 'int', label: 'Interest rate (% a year)', value: '8.25', hint: '8.25% was declared for 2025-26. Future rates will change.' },
        { key: 'emp', label: 'Your contribution (% of basic)', value: '12' },
        { key: 'ceil', label: 'Employer pension on the ₹15,000 wage ceiling', value: 'yes', options: [['yes', 'Yes'], ['no', 'No, on full basic']] },
      ]}
      run={(v) => {
        const r = epf({ basicDa: a(v, 'basic', 'Basic'), currentBalance: a(v, 'bal', 'Balance'), age: a(v, 'age', 'Age', 15, 80), retireAge: a(v, 'ret', 'Retirement age', 16, 80), raisePct: a(v, 'raise', 'Salary rise', 0, 50), interest: a(v, 'int', 'Interest', 0, 20), employeePct: a(v, 'emp', 'Contribution', 0, 100), wageCeiling: v.ceil === 'yes' });
        return (
          <>
            <Panel title="Projected EPF corpus">
              <Kv strong={0} rows={[['Corpus at retirement', inr(r.corpus)], ['Your contributions', inr(r.employeeTotal)], ['Employer contributions to EPF', inr(r.employerTotal)], ['Interest earned', inr(r.interestTotal)], ['Monthly: your share today', inr(r.monthlyEmployee)], ['Monthly: employer to EPF', inr(r.monthlyEpf)], ['Monthly: employer to EPS pension', inr(r.monthlyEps)]]} />
              <div className="mt-4"><DataTable caption="Year by year" head={['Year', 'Age', 'Contribution', 'Interest', 'Balance']} rows={r.rows.map((x) => [x.year, x.age, inr(x.contribution), inr(x.interest), inr(x.balance)])} /></div>
            </Panel>
            <Disclaimer>A projection with a flat rate. Real EPF interest is declared each year and credited on monthly running balances.</Disclaimer>
            <Src>{lnk('https://www.pib.gov.in/PressReleasePage.aspx?PRID=2234502&lang=1&reg=3', 'PIB: EPF rate 8.25% for 2025-26')}</Src>
          </>
        );
      }}
    />
  );
}

/* Gratuity */
function Gratuity() {
  return (
    <Calc
      fields={[
        { key: 'pay', label: 'Last drawn basic + DA (per month)', value: '50000' },
        { key: 'y', label: 'Years of service', value: '10' },
        { key: 'm', label: 'Extra months', value: '7', hint: 'Six months or more rounds up to a year.' },
        { key: 'cov', label: 'Covered by the Payment of Gratuity Act', value: 'yes', options: [['yes', 'Yes (15 / 26 formula)'], ['no', 'No (15 / 30 formula)']] },
      ]}
      run={(v) => {
        const r = gratuity(a(v, 'pay', 'Salary'), a(v, 'y', 'Years', 0, 60), a(v, 'm', 'Months', 0, 11), v.cov === 'yes');
        return (
          <>
            <Panel title="Gratuity estimate">
              <Kv strong={0} rows={[['Gratuity', inr(r.gratuity)], ['Years counted', String(r.completedYears)], ['Formula', r.formula], ['Tax-exempt limit (₹20,00,000)', r.capped ? 'Limit reached' : 'Within limit']]} />
            </Panel>
            <Note>The Labour Codes came into force on 21 November 2025. Fixed-term employees become eligible after 1 year of service. Employers may still follow their own rules, so check your appointment letter.</Note>
            <Disclaimer>Exemption depends on your employer type and other gratuity received earlier.</Disclaimer>
            <Src>{lnk('https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251122702601.pdf', 'PIB note on Labour Codes')}; {lnk('https://www.incometaxindia.gov.in/w/threshold-limits-under-income-tax-act', 'exemption limit on the Income Tax Department page')}</Src>
          </>
        );
      }}
    />
  );
}

/* HRA */
function Hra() {
  return (
    <Calc
      fields={[
        { key: 'fy', label: 'Financial year', value: '2026-27', options: FYS },
        { key: 'basic', label: 'Basic + DA (per year)', value: '600000' },
        { key: 'hra', label: 'HRA received (per year)', value: '240000' },
        { key: 'rent', label: 'Rent paid (per year)', value: '300000' },
        { key: 'city', label: 'City of residence', value: 'Delhi', options: [...METROS_NEW.map((c) => [c, c] as [string, string]), ['other', 'Another city']] },
      ]}
      run={(v) => {
        const metros = v.fy === '2026-27' ? METROS_NEW : METROS_OLD;
        const metro = metros.includes(v.city);
        const r = hra(a(v, 'basic', 'Basic'), a(v, 'hra', 'HRA'), a(v, 'rent', 'Rent'), metro);
        return (
          <>
            <Panel title={`HRA exemption, ${FY_LABEL[v.fy as FY]}`}>
              <Kv strong={3} rows={[['Actual HRA received', inr(r.a)], ['Rent minus 10% of basic', inr(r.b)], [`${metro ? '50%' : '40%'} of basic`, inr(r.c)], ['Exempt HRA (least of the three)', inr(r.exempt)], ['Taxable HRA', inr(r.taxable)]]} />
              <p className="mt-3 text-sm text-muted">{v.city} is treated as {metro ? 'a 50% city' : 'a 40% city'} for {FY_LABEL[v.fy as FY]}. {v.fy === '2026-27' ? 'From FY 2026-27 the 50% list is Delhi, Mumbai, Kolkata, Chennai, Bengaluru, Hyderabad, Pune and Ahmedabad.' : 'Before FY 2026-27 the 50% list was Delhi, Mumbai, Kolkata and Chennai.'}</p>
            </Panel>
            <Disclaimer fy={FY_LABEL[v.fy as FY]}>HRA exemption is available only in the old regime. Rent above ₹1,00,000 a year needs the landlord PAN.</Disclaimer>
            <Src>Income-tax Rules 2026, notified 20 March 2026, as summarised by {lnk('https://www.ey.com/content/dam/ey-unified-site/ey-com/en-in/technical/alerts-hub/documents/2026/04/key-changes-under-the-income-tax-rules-2026.pdf', 'EY')}. Confirm on the Income Tax Department site</Src>
          </>
        );
      }}
    />
  );
}

/* FD and RD */
function FdRd() {
  return (
    <Calc
      fields={[
        { key: 'kind', label: 'Calculate', value: 'fd', options: [['fd', 'Fixed deposit (compounding)'], ['fds', 'Fixed deposit (simple interest)'], ['rd', 'Recurring deposit']] },
        { key: 'amt', label: 'Amount (₹): lump sum for FD, monthly instalment for RD', value: '100000' },
        { key: 'rate', label: 'Interest rate (% a year)', value: '7' },
        { key: 'yrs', label: 'Period (years)', value: '5' },
        { key: 'freq', label: 'Compounding (FD only)', value: 'Quarterly', options: FD_FREQ.map((f) => [f, f]) },
      ]}
      run={(v) => {
        const amt = a(v, 'amt', 'Amount', 1), rate = a(v, 'rate', 'Rate', 0, 30), yrs = a(v, 'yrs', 'Period', 0.25, 40);
        if (v.kind === 'rd') {
          const r = rd(amt, rate, Math.round(yrs * 12));
          return <Panel title="Recurring deposit"><Kv strong={0} rows={[['Maturity value', inr(r.maturity)], ['Total deposited', inr(r.deposited)], ['Interest', inr(r.interest)]]} /><p className="mt-3 text-sm text-muted">Quarterly compounding on each instalment, the method most banks use. Your bank may differ by a few rupees.</p></Panel>;
        }
        if (v.kind === 'fds') {
          const r = fdSimple(amt, rate, yrs);
          return <Panel title="Fixed deposit, simple interest"><Kv strong={0} rows={[['Maturity value', inr(r.maturity)], ['Interest', inr(r.interest)]]} /></Panel>;
        }
        const r = fd(amt, rate, yrs, v.freq);
        return (
          <Panel title="Fixed deposit">
            <Kv strong={0} rows={[['Maturity value', inr(r.maturity)], ['Interest', inr(r.interest)]]} />
            <div className="mt-4"><DataTable caption="Year by year" head={['Year', 'Interest', 'Balance']} rows={r.rows.map((x) => [x.year, inr(x.interest), inr(x.balance)])} /></div>
            <p className="mt-3 text-sm text-muted">Interest is taxable. Banks deduct TDS under section 194A above their threshold.</p>
          </Panel>
        );
      }}
    />
  );
}

/* Loan schedule */
function Loan() {
  return (
    <Calc
      fields={[
        { key: 'p', label: 'Loan amount (₹)', value: '2500000' },
        { key: 'r', label: 'Interest rate (% a year)', value: '8.5' },
        { key: 'y', label: 'Term (years)', value: '20' },
        { key: 'x', label: 'Extra payment every month (₹)', value: '0', hint: 'A regular prepayment shortens the loan.' },
      ]}
      run={(v) => {
        const base = loan(a(v, 'p', 'Loan', 1), a(v, 'r', 'Rate', 0, 40), Math.round(a(v, 'y', 'Term', 0.25, 40) * 12));
        const r = loan(a(v, 'p', 'Loan', 1), a(v, 'r', 'Rate', 0, 40), Math.round(a(v, 'y', 'Term', 0.25, 40) * 12), a(v, 'x', 'Extra payment'));
        return (
          <Panel title="Repayment plan">
            <Kv strong={0} rows={[['Monthly EMI', inr(base.emi)], ['Total interest', inr(r.totalInterest)], ['Total paid', inr(r.totalPaid)], ['Months to repay', String(r.months)], ...(r.months < base.months ? ([['Interest saved', inr(base.totalInterest - r.totalInterest)], ['Months saved', String(base.months - r.months)]] as [string, string][]) : [])]} />
            <div className="mt-4 max-h-96 overflow-y-auto"><DataTable caption="Month by month" head={['Month', 'EMI', 'Interest', 'Principal', 'Balance']} rows={r.rows.map((x) => [x.month, inr(x.emi), inr(x.interest), inr(x.principal), inr(x.balance)])} /></div>
          </Panel>
        );
      }}
    />
  );
}

/* Working days */
function WorkingDays() {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <Calc
      fields={[
        { key: 'mode', label: 'Calculate', value: 'between', options: [['between', 'Working days between two dates'], ['add', 'Date after N working days']] },
        { key: 'from', label: 'Start date', value: today },
        { key: 'to', label: 'End date (between mode)', value: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10) },
        { key: 'n', label: 'Working days to add (add mode)', value: '10' },
        { key: 'we', label: 'Weekly off', value: 'sun', options: [['sun', 'Sunday only'], ['satsun', 'Saturday and Sunday'], ['none', 'No weekly off']] },
        { key: 'hol', label: 'Holidays (one date per line, YYYY-MM-DD)', value: '', textarea: true },
      ]}
      run={(v) => {
        const we = v.we === 'sun' ? [0] : v.we === 'satsun' ? [0, 6] : [];
        const hol = parseHolidays(v.hol);
        if (v.mode === 'add') {
          const d = addWorkingDays(v.from, a(v, 'n', 'Days', 0, 20000), we, hol);
          return <Panel title="Result"><Kv strong={0} rows={[['Date', d]]} /></Panel>;
        }
        const r = workingDays(v.from, v.to, we, hol);
        return <Panel title="Result"><Kv strong={0} rows={[['Working days', String(r.working)], ['Calendar days', String(r.total)], ['Weekly off days', String(r.weekendDays)], ['Holidays on working days', String(r.holidayDays)]]} /><p className="mt-3 text-sm text-muted">Both dates are counted. Add your state and company holidays above, since they differ.</p></Panel>;
      }}
    />
  );
}

/* Number to words */
function Words() {
  return (
    <Calc
      fields={[{ key: 'n', label: 'Amount (₹)', value: '123456.50', hint: 'Up to 99,99,99,99,999.99' }]}
      run={(v) => {
        const n = a(v, 'n', 'Amount', 0, 999999999999.99);
        return <Panel title="In words"><p className="text-lg" data-testid="words">{rupeesInWords(n)}</p><p className="mt-2 text-sm text-muted">{inr(n, 2)}. Useful for cheques and invoices. Check spellings before you print.</p></Panel>;
      }}
    />
  );
}

/* GSTIN, PAN, IFSC */
function Validators() {
  return (
    <Calc
      fields={[
        { key: 'g', label: 'GSTIN', value: '27AAPFU0939F1ZV' },
        { key: 'p', label: 'PAN', value: 'ABCPE1234F' },
        { key: 'i', label: 'IFSC', value: 'SBIN0001234' },
      ]}
      run={(v) => {
        const g = checkGstin(v.g), p = checkPan(v.p), i = checkIfsc(v.i);
        return (
          <>
            <Panel title="GSTIN"><Kv rows={[['Format and check character', g.valid ? 'Valid' : 'Not valid'], ['State', g.state || 'n/a'], ['PAN inside', g.pan]]} />{g.problems.map((x) => <p key={x} className="mt-2 text-sm text-danger">{x}</p>)}</Panel>
            <Panel title="PAN"><Kv rows={[['Format', p.valid ? 'Valid' : 'Not valid'], ['Holder type', p.type || 'n/a']]} />{p.problem && <p className="mt-2 text-sm text-danger">{p.problem}</p>}</Panel>
            <Panel title="IFSC"><Kv rows={[['Format', i.valid ? 'Valid' : 'Not valid'], ['Bank code', i.bank], ['Branch code', i.branch]]} /></Panel>
            <Note>This checks the structure and the GSTIN check character offline. It cannot tell whether a number is registered or active. Use the official GST portal or Income Tax portal for that.</Note>
          </>
        );
      }}
    />
  );
}

/* Salary structure */
function Salary() {
  return (
    <Calc
      intro="Split a CTC into basic, HRA and special allowance and see the monthly take-home. Employer costs follow the PF and gratuity choices you make."
      fields={[
        { key: 'fy', label: 'Financial year', value: '2026-27', options: FYS },
        { key: 'regime', label: 'Tax regime', value: 'new', options: [['new', 'New regime'], ['old', 'Old regime']] },
        { key: 'ctc', label: 'Annual CTC', value: '1200000' },
        { key: 'basic', label: 'Basic as % of CTC', value: '40' },
        { key: 'hra', label: 'HRA as % of basic', value: '50' },
        { key: 'pf', label: 'PF base', value: 'ceiling', options: [['ceiling', 'Capped at ₹15,000 a month'], ['full', 'Full basic']] },
        { key: 'grat', label: 'Gratuity inside CTC', value: 'yes', options: [['yes', 'Yes'], ['no', 'No']] },
        { key: 'pt', label: 'Professional tax per month', value: '200' },
      ]}
      run={(v) => {
        const r = salaryStructure({ fy: v.fy as FY, regime: v.regime as Regime, ctc: a(v, 'ctc', 'CTC', 1), basicPct: a(v, 'basic', 'Basic %', 1, 100), hraPct: a(v, 'hra', 'HRA %', 0, 100), pfOnCeiling: v.pf === 'ceiling', gratuityInCtc: v.grat === 'yes', professionalTax: a(v, 'pt', 'Professional tax', 0, 5000) });
        return (
          <>
            <Panel title={`Salary breakup, ${FY_LABEL[v.fy as FY]}`}>
              <DataTable caption="Salary breakup" head={['Part', 'Monthly', 'Yearly']} rows={[
                ['Basic', inr(r.basic / 12), inr(r.basic)], ['HRA', inr(r.hra / 12), inr(r.hra)], ['Special allowance', inr(r.special / 12), inr(r.special)], ['Gross salary', inr(r.gross / 12), inr(r.gross)],
                ['Employee PF', inr(r.employeePf / 12), inr(r.employeePf)], ['Employer PF (in CTC)', inr(r.employerPf / 12), inr(r.employerPf)], ['Gratuity (in CTC)', inr(r.gratuity / 12), inr(r.gratuity)], ['Income tax estimate', inr(r.tax / 12), inr(r.tax)],
              ]} />
              <div className="mt-4"><Kv strong={0} rows={[['Estimated take-home per month', inr(r.takeHomeMonthly)], ['Estimated take-home per year', inr(r.takeHomeAnnual)]]} /></div>
            </Panel>
            <Note>HRA exemption and other deductions are not applied to the tax estimate here. Use the income tax calculator with your own deductions for a closer figure.</Note>
            <Disclaimer fy={FY_LABEL[v.fy as FY]}>Employers split CTC in different ways.</Disclaimer>
          </>
        );
      }}
    />
  );
}

/* PPF */
function Ppf() {
  return (
    <Calc
      intro="Public Provident Fund growth with yearly compounding. The interest rate is set by the government every quarter, so enter the current rate."
      fields={[
        { key: 'dep', label: 'Yearly deposit', value: '150000', hint: '₹500 to ₹1,50,000' },
        { key: 'rate', label: 'Interest rate % a year', value: '7.1', hint: 'Check the current rate on the India Post or Ministry of Finance site.' },
        { key: 'years', label: 'Years', value: '15', hint: '15 to 50, in blocks of 5 after year 15' },
        { key: 'when', label: 'Deposit made', value: 'early', options: [['early', 'By the 5th of April each year'], ['late', 'At the end of each year']] },
      ]}
      run={(v) => {
        const r = ppf(a(v, 'dep', 'Yearly deposit', 0, 1e7), a(v, 'rate', 'Rate', 0, 20), a(v, 'years', 'Years', 1, 50), v.when === 'early');
        return (
          <>
            <Panel title="PPF maturity">
              <Kv strong={0} rows={[['Maturity value', inr(r.maturity)], ['Total deposited', inr(r.invested)], ['Interest earned', inr(r.interest)]]} />
              <div className="mt-4"><DataTable caption="Year by year" head={['Year', 'Deposit', 'Interest', 'Balance']} rows={r.rows.map((x) => [String(x.year), inr(x.deposit), inr(x.interest), inr(x.balance)])} /></div>
            </Panel>
            <Note>Real PPF interest is worked out monthly on the lowest balance between the 5th and month end, then credited once a year. This table is a close estimate. PPF interest is tax free under current rules.</Note>
            <Disclaimer>Rates change each quarter.</Disclaimer>
          </>
        );
      }}
    />
  );
}

/* CAGR */
function Cagr() {
  return (
    <Calc
      fields={[
        { key: 's', label: 'Starting value', value: '100000' },
        { key: 'e', label: 'Ending value', value: '250000' },
        { key: 'y', label: 'Years', value: '5', hint: 'Decimals are fine, for example 3.5' },
      ]}
      run={(v) => {
        const r = cagr(a(v, 's', 'Starting value', 0.01), a(v, 'e', 'Ending value'), a(v, 'y', 'Years', 0.01, 100));
        return <Panel title="Growth"><Kv strong={0} rows={[['CAGR', num(r.rate, 2) + '% a year'], ['Total change', num(r.absolute, 2) + '%']]} /><p className="mt-3 text-sm text-muted">CAGR is a smoothed yearly rate. It ignores the ups and downs in between and any money added or taken out. For regular investments use XIRR in a spreadsheet.</p></Panel>;
      }}
    />
  );
}

/* Rent receipt */
function RentReceipt() {
  const [v, setV] = useState({ tenant: '', landlord: '', pan: '', address: '', rent: '15000', from: '2026-04', months: '12' });
  const [err, setErr] = useState('');
  const set = (k: string, val: string) => setV({ ...v, [k]: val });
  const build = () => {
    const rent = parseAmount(v.rent, 'Monthly rent', 1);
    const n = parseAmount(v.months, 'Months', 1, 24);
    if (!v.tenant.trim() || !v.landlord.trim() || !v.address.trim()) throw Error('Fill in the tenant, landlord and property address.');
    if (!/^\d{4}-\d{2}$/.test(v.from)) throw Error('Choose the first month.');
    if (rent * 12 > 100000 && !checkPan(v.pan).valid) throw Error('Rent above ₹1,00,000 a year needs a valid landlord PAN on the receipt.');
    const [y, m] = v.from.split('-').map(Number);
    return Array.from({ length: n }, (_, i) => {
      const d = new Date(y, m - 1 + i, 1);
      const label = d.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
      return [
        '# Rent receipt', '', `Month: ${label}`, `Amount: ${inr(rent)} (${rupeesInWords(rent)})`, '',
        `Received from ${v.tenant.trim()} towards rent of the property at:`, v.address.trim(), '', `Landlord: ${v.landlord.trim()}`, v.pan.trim() ? `Landlord PAN: ${v.pan.trim().toUpperCase()}` : '', '', 'Signature of landlord: ______________________',
      ];
    });
  };
  const go = async () => {
    try { setErr(''); const pages = build(); downloadBlob('rent-receipts.pdf', new Blob([(await textPdf(pages, 'Rent receipts')) as BlobPart], { type: 'application/pdf' })); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not make the receipts.'); }
  };
  return (
    <div className="space-y-4">
      <Panel title="Receipt details" description="One receipt per month, one page each. Nothing leaves your device.">
        <Grid>
          <Field label="Tenant name" htmlFor="rr-t"><Input id="rr-t" value={v.tenant} onChange={(e) => set('tenant', e.target.value)} /></Field>
          <Field label="Landlord name" htmlFor="rr-l"><Input id="rr-l" value={v.landlord} onChange={(e) => set('landlord', e.target.value)} /></Field>
          <Field label="Landlord PAN" hint="Needed when rent is above ₹1,00,000 a year" htmlFor="rr-p"><Input id="rr-p" value={v.pan} onChange={(e) => set('pan', e.target.value)} /></Field>
          <Field label="Monthly rent (₹)" htmlFor="rr-r"><Input id="rr-r" inputMode="decimal" value={v.rent} onChange={(e) => set('rent', e.target.value)} /></Field>
          <Field label="First month" htmlFor="rr-f"><Input id="rr-f" type="month" value={v.from} onChange={(e) => set('from', e.target.value)} /></Field>
          <Field label="Number of months" htmlFor="rr-m"><Input id="rr-m" inputMode="numeric" value={v.months} onChange={(e) => set('months', e.target.value)} /></Field>
        </Grid>
        <div className="mt-3"><Field label="Property address" htmlFor="rr-a"><TextArea id="rr-a" rows={2} value={v.address} onChange={(e) => set('address', e.target.value)} /></Field></div>
        <div className="mt-4"><Button type="button" onClick={go}>Make PDF</Button></div>
      </Panel>
      {err && <div role="alert" data-testid="calc-error"><Note tone="warning">{err}</Note></div>}
      <Note>Keep a revenue stamp rule in mind: some states ask for one on cash receipts above a limit. Receipts support an HRA claim but do not replace a rent agreement or bank proof.</Note>
    </div>
  );
}

/* GST invoice */
function GstInvoice() {
  const [v, setV] = useState({ seller: 'Your business name', sgstin: '', buyer: 'Customer name', bgstin: '', no: 'INV-001', date: todayISO(), inter: 'no', items: 'Consulting service | 998313 | 1 | 25000 | 18\nUSB cable | 8544 | 3 | 250 | 18' });
  const [err, setErr] = useState('');
  const set = (k: string, val: string) => setV({ ...v, [k]: val });
  let t: ReturnType<typeof invoiceTotals> | null = null;
  let msg = '';
  try {
    if (v.sgstin && !checkGstin(v.sgstin).valid) throw Error('Seller GSTIN is not valid. Leave it empty if you are not registered.');
    if (v.bgstin && !checkGstin(v.bgstin).valid) throw Error('Buyer GSTIN is not valid. Leave it empty for a customer without one.');
    t = invoiceTotals(parseInvoiceLines(v.items), v.inter === 'yes');
  } catch (e) { msg = e instanceof Error ? e.message : 'Check the invoice.'; }
  const pdf = async () => {
    if (!t) return;
    try {
      setErr('');
      const lines = ['# Tax invoice', '', `Invoice no: ${v.no}    Date: ${v.date}`, '', `Seller: ${v.seller}`, v.sgstin ? `GSTIN: ${v.sgstin.toUpperCase()}` : 'GSTIN: not registered', '', `Buyer: ${v.buyer}`, v.bgstin ? `GSTIN: ${v.bgstin.toUpperCase()}` : '', `Supply: ${v.inter === 'yes' ? 'Inter-state (IGST)' : 'Within the state (CGST + SGST)'}`, '', '# Items'];
      t.lines.forEach((l, i) => lines.push(`${i + 1}. ${l.desc} (HSN ${l.hsn || '-'}) ${l.qty} x ${num(l.price, 2)} @ ${l.rate}% = taxable ${num(l.taxable, 2)}, tax ${num(l.tax, 2)}`));
      lines.push('', `Taxable value: ${num(t.taxable, 2)}`);
      if (v.inter === 'yes') lines.push(`IGST: ${num(t.igst, 2)}`); else lines.push(`CGST: ${num(t.cgst, 2)}`, `SGST: ${num(t.sgst, 2)}`);
      lines.push(`Round off: ${num(t.roundOff, 2)}`, `# Total: Rs. ${num(t.total, 2)}`, rupeesInWords(t.total));
      downloadBlob(`invoice-${v.no.replace(/[^\w-]/g, '_')}.pdf`, new Blob([(await textPdf([lines], 'Tax invoice')) as BlobPart], { type: 'application/pdf' }));
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not make the PDF.'); }
  };
  return (
    <div className="space-y-4">
      <Panel title="Invoice details" description="Items go one per line as: description | HSN or SAC | quantity | price | GST rate.">
        <Grid>
          <Field label="Seller" htmlFor="gi-s"><Input id="gi-s" value={v.seller} onChange={(e) => set('seller', e.target.value)} /></Field>
          <Field label="Seller GSTIN" htmlFor="gi-sg"><Input id="gi-sg" value={v.sgstin} onChange={(e) => set('sgstin', e.target.value)} /></Field>
          <Field label="Buyer" htmlFor="gi-b"><Input id="gi-b" value={v.buyer} onChange={(e) => set('buyer', e.target.value)} /></Field>
          <Field label="Buyer GSTIN" htmlFor="gi-bg"><Input id="gi-bg" value={v.bgstin} onChange={(e) => set('bgstin', e.target.value)} /></Field>
          <Field label="Invoice number" htmlFor="gi-n"><Input id="gi-n" value={v.no} onChange={(e) => set('no', e.target.value)} /></Field>
          <Field label="Date" htmlFor="gi-d"><Input id="gi-d" type="date" value={v.date} onChange={(e) => set('date', e.target.value)} /></Field>
          <Field label="Supply" htmlFor="gi-i"><Select id="gi-i" value={v.inter} onChange={(e) => set('inter', e.target.value)}><option value="no">Within the state: CGST + SGST</option><option value="yes">Between states: IGST</option></Select></Field>
        </Grid>
        <div className="mt-3"><Field label="Items" htmlFor="gi-it"><TextArea id="gi-it" rows={4} value={v.items} onChange={(e) => set('items', e.target.value)} /></Field></div>
      </Panel>
      {msg ? <div role="alert" data-testid="calc-error"><Note tone="warning">{msg}</Note></div> : t && (
        <div data-testid="calc-result" className="space-y-4">
          <Panel title="Totals">
            <DataTable caption="Invoice lines" head={['Item', 'Taxable', 'GST']} rows={t.lines.map((l) => [l.desc, inr(l.taxable, 2), `${inr(l.tax, 2)} (${l.rate}%)`])} />
            <div className="mt-4"><Kv strong={5} rows={[['Taxable value', inr(t.taxable, 2)], ...(v.inter === 'yes' ? [['IGST', inr(t.igst, 2)] as [string, string]] : [['CGST', inr(t.cgst, 2)] as [string, string], ['SGST', inr(t.sgst, 2)] as [string, string]]), ['Round off', inr(t.roundOff, 2)], ['In words', rupeesInWords(t.total)], ['Invoice total', inr(t.total, 2)]]} /></div>
            <div className="mt-4"><Button type="button" onClick={pdf}>Download PDF</Button></div>
          </Panel>
          {err && <Note tone="warning">{err}</Note>}
        </div>
      )}
      <Disclaimer>Check the HSN or SAC code, rate and place of supply for your own sale. A registered seller must follow the invoice rules in the GST law, which include more fields than this simple page.</Disclaimer>
    </div>
  );
}

/* Expense and petty cash */
const CATS = ['Travel', 'Food', 'Office', 'Supplies', 'Bills', 'Staff', 'Other'];
function Expenses() {
  const [entries, setEntries] = useLocalStorage<Entry[]>('toolatlas:expenses', []);
  const [opening, setOpening] = useLocalStorage<string>('toolatlas:expenses-opening', '0');
  const [f, setF] = useState({ date: todayISO(), kind: 'out', category: 'Other', note: '', amount: '' });
  const [err, setErr] = useState('');
  const add = () => {
    try {
      const amount = parseAmount(f.amount, 'Amount', 0.01, 1e9);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date)) throw Error('Choose a date.');
      setEntries([...entries, { id: crypto.randomUUID(), date: f.date, kind: f.kind as 'in' | 'out', category: f.category, note: f.note.slice(0, 120), amount }].sort((x, y) => x.date.localeCompare(y.date)));
      setF({ ...f, note: '', amount: '' }); setErr('');
    } catch (e) { setErr(e instanceof Error ? e.message : 'Check the entry.'); }
  };
  let op = 0;
  try { op = parseAmount(opening, 'Opening balance', -1e9, 1e9); } catch { op = 0; }
  const s = summarise(entries, op);
  const csv = () => downloadText('expenses.csv', toCsv([['Date', 'Type', 'Category', 'Note', 'Amount'], ...entries.map((e) => [e.date, e.kind === 'in' ? 'Cash in' : 'Spent', e.category, e.note, String(e.amount)])], true));
  return (
    <div className="space-y-4">
      <Panel title="Add an entry" description="Saved only in this browser. Use it as a petty cash book by setting an opening balance and adding top-ups as cash in.">
        <Grid>
          <Field label="Date" htmlFor="ex-d"><Input id="ex-d" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label="Type" htmlFor="ex-k"><Select id="ex-k" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="out">Spent</option><option value="in">Cash in</option></Select></Field>
          <Field label="Category" htmlFor="ex-c"><Select id="ex-c" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATS.map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Field label="Amount (₹)" htmlFor="ex-a"><Input id="ex-a" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
          <Field label="Note" htmlFor="ex-n"><Input id="ex-n" maxLength={120} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
          <Field label="Opening balance (₹)" htmlFor="ex-o"><Input id="ex-o" inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} /></Field>
        </Grid>
        <div className="mt-4 flex flex-wrap gap-2"><Button type="button" onClick={add}>Add entry</Button><DownloadButton label="Download CSV" onClick={csv} /><Button type="button" variant="secondary" onClick={() => { if (confirm('Delete all entries from this browser?')) setEntries([]); }}>Clear all</Button></div>
      </Panel>
      {err && <div role="alert" data-testid="calc-error"><Note tone="warning">{err}</Note></div>}
      <Panel title="Summary"><div data-testid="calc-result"><Kv strong={3} rows={[['Opening balance', inr(op, 2)], ['Cash in', inr(s.inflow, 2)], ['Spent', inr(s.outflow, 2)], ['Balance', inr(s.balance, 2)]]} /></div>
        {s.byCat.length > 0 && <div className="mt-4"><DataTable caption="Spend by category" head={['Category', 'Spent']} rows={s.byCat.map(([c, n]) => [c, inr(n, 2)])} /></div>}
      </Panel>
      {entries.length > 0 && (
        <Panel title="Entries"><DataTable caption="All entries" head={['Date', 'Category', 'Note', 'Amount', '']} rows={entries.map((e) => [e.date, e.category, e.note || '-', (e.kind === 'in' ? '+' : '-') + inr(e.amount, 2), <button key={e.id} type="button" className="underline" aria-label={`Delete entry ${e.date} ${e.category}`} onClick={() => setEntries(entries.filter((x) => x.id !== e.id))}>Delete</button>])} /></Panel>
      )}
    </div>
  );
}

/* CSV and Excel utilities */
function CsvExcel() {
  const [rows, setRows] = useState<string[][]>([]);
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const [col, setCol] = useState('0');
  const load = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    try {
      setErr('');
      if (file.size > 25 * 1024 * 1024) throw Error('This file is over 25 MB. Split it first so the browser does not run out of memory.');
      const isX = /\.xlsx$/i.test(file.name);
      const data = isX ? await readXlsx(await file.arrayBuffer()) : parseCsv(await file.text(), detectDelimiter(await file.text()));
      if (data.length === 0) throw Error('The file has no rows.');
      setRows(data); setName(file.name.replace(/\.[^.]+$/, '')); setCol('0');
    } catch (e) { setRows([]); setErr(e instanceof Error ? e.message : 'Could not read this file. Use a .csv or .xlsx file.'); }
  };
  const head = rows[0] ?? [];
  const apply = (fn: (r: string[][]) => string[][]) => setRows(fn(rows));
  const ci = Math.min(Number(col) || 0, Math.max(head.length - 1, 0));
  return (
    <div className="space-y-4">
      <Panel title="Open a file" description="Reads .csv and .xlsx in your browser. The first row is treated as the header.">
        <Dropzone accept=".csv,.xlsx,text/csv" multiple={false} onFiles={load} title="Drop a CSV or Excel file" />
      </Panel>
      {err && <div role="alert" data-testid="calc-error"><Note tone="warning">{err}</Note></div>}
      {rows.length > 0 && (
        <>
          <Panel title="Clean up">
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Column" htmlFor="cx-c"><Select id="cx-c" value={String(ci)} onChange={(e) => setCol(e.target.value)}>{head.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}</Select></Field>
              <Button type="button" variant="secondary" onClick={() => apply((r) => [r[0], ...r.slice(1).sort((x, y) => (x[ci] ?? '').localeCompare(y[ci] ?? '', 'en', { numeric: true }))])}>Sort A to Z</Button>
              <Button type="button" variant="secondary" onClick={() => apply((r) => [r[0], ...r.slice(1).sort((x, y) => (y[ci] ?? '').localeCompare(x[ci] ?? '', 'en', { numeric: true }))])}>Sort Z to A</Button>
              <Button type="button" variant="secondary" onClick={() => apply((r) => { const seen = new Set<string>(); return r.filter((x, i) => { if (i === 0) return true; const k = JSON.stringify(x); if (seen.has(k)) return false; seen.add(k); return true; }); })}>Remove duplicate rows</Button>
              <Button type="button" variant="secondary" onClick={() => apply((r) => r.filter((x, i) => i === 0 || x.some((c) => c.trim() !== '')))}>Remove empty rows</Button>
              <Button type="button" variant="secondary" onClick={() => apply((r) => r.map((x) => x.map((c) => c.trim())))}>Trim spaces</Button>
            </div>
          </Panel>
          <Panel title={`Preview, ${rows.length - 1} data rows, ${head.length} columns`}>
            <div data-testid="calc-result"><DataTable caption="First 20 rows" head={head.map((h, i) => h || `Column ${i + 1}`)} rows={rows.slice(1, 21).map((r) => head.map((_, i) => r[i] ?? ''))} /></div>
            <div className="mt-4 flex flex-wrap gap-2">
              <DownloadButton label="Download CSV" onClick={() => downloadText(`${name || 'data'}.csv`, toCsv(rows, true))} />
              <DownloadButton label="Download XLSX" onClick={async () => downloadBlob(`${name || 'data'}.xlsx`, new Blob([(await makeXlsx(rows)) as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))} />
            </div>
          </Panel>
          <Note>Cells that start with =, + or @ get a leading apostrophe on export so a spreadsheet does not run them as formulas.</Note>
        </>
      )}
    </div>
  );
}

const PARTS: Record<string, () => JSX.Element> = {
  'salary-structure': Salary,
  'ppf-calculator': Ppf,
  'cagr-calculator': Cagr,
  'rent-receipt': RentReceipt,
  'gst-invoice': GstInvoice,
  'expense-tracker': Expenses,
  'csv-excel-tools': CsvExcel,
  'income-tax-india': IncomeTax,
  'tds-calculator': Tds,
  'epf-calculator': Epf,
  'gratuity-calculator': Gratuity,
  'hra-calculator': Hra,
  'fd-rd-calculator': FdRd,
  'loan-schedule': Loan,
  'working-days': WorkingDays,
  'number-to-words-inr': Words,
  'gst-pan-validator': Validators,
};
export default function FinanceTools() {
  const { toolId } = useParams();
  const Part = PARTS[toolId ?? ''];
  return Part ? <Part /> : <Note tone="warning">This tool was not found.</Note>;
}
