import { useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { Field, Grid, Input, Note, Panel, Select, TextArea } from '../../components/ui';
import {
  FD_FREQ, FY_LABEL, METROS_NEW, METROS_OLD, RULES_AS_OF, TDS_PRESETS, addWorkingDays, checkGstin, checkIfsc, checkPan, epf, fd, fdSimple, gratuity, hra, incomeTax,
  inr, loan, num, parseAmount, parseHolidays, rd, rupeesInWords, tds, workingDays, type AgeBand, type FY, type Regime,
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

const PARTS: Record<string, () => JSX.Element> = {
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
