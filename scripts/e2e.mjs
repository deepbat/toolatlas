/**
 * Functional test harness for ToolAtlas.
 *
 * Drives a headless Chrome over the DevTools Protocol and asserts that the
 * interactive behaviour of the tools actually works: arithmetic, conversions,
 * encodings, persistence, routing, search and theming.
 *
 * Usage:
 *   npm run build
 *   npm run preview            # in one terminal
 *   npm run test:e2e           # in another
 *
 * Environment:
 *   E2E_BASE_URL   base URL of the running site (default http://localhost:4173/toolatlas)
 *   CHROME_PATH    path to a Chrome/Chromium binary (auto-detected on most systems)
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:4173/toolatlas';
const PORT = Number(process.env.E2E_PORT ?? 9333);

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

const CHROME = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));

if (!CHROME) {
  console.error(
    'No Chrome or Chromium binary found. Set CHROME_PATH to point at one and try again.'
  );
  process.exit(1);
}

let chrome;
let ws;
let nextId = 1;
const pending = new Map();

/* ----------------------------------------------------------- CDP plumbing */

function send(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression: `(async () => { ${expression} })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(
      `Evaluate failed: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`
    );
  }
  return result.result.value;
}

/* ------------------------------------------------------------- assertions */

let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function eq(name, actual, expected) {
  check(name, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

/* --------------------------------------------------------------- helpers */

// Sets the value of a controlled React input so React picks the change up.
const SET_INPUT = `
  function setInput(el, value) {
    const proto = el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function byText(selector, text) {
    return [...document.querySelectorAll(selector)].find(
      (el) => el.textContent.trim() === text
    );
  }
  function byPrefix(selector, prefix) {
    return [...document.querySelectorAll(selector)].find(
      (el) => el.textContent.trim().startsWith(prefix)
    );
  }
  function lower() {
    return document.body.innerText.replace(/\\s+/g, ' ').toLowerCase();
  }
  function byLabel(label) {
    return document.querySelector('[aria-label="' + label + '"]');
  }
`;

async function goto(path) {
  await send('Page.navigate', { url: `${BASE}${path}` });
  // Wait for the app shell to mount.
  for (let i = 0; i < 80; i += 1) {
    await sleep(100);
    const ready = await evaluate('return !!document.querySelector("#root > div");');
    if (ready) break;
  }
  await sleep(350);
}

/** Clears localStorage keys and reloads so the app picks up the clean state. */
async function resetStorage(keys) {
  await goto('/');
  await evaluate(
    `for (const key of ${JSON.stringify(keys)}) localStorage.removeItem(key); return true;`
  );
  await send('Page.reload', { ignoreCache: true });
  for (let i = 0; i < 80; i += 1) {
    await sleep(100);
    const ready = await evaluate('return !!document.querySelector("#root > div");');
    if (ready) break;
  }
  await sleep(250);
}

/* ------------------------------------------------------------------ tests */

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('Home page renders the hero and catalogue', async () => {
  await goto('/');
  const data = await evaluate(`
    ${SET_INPUT}
    return {
      hero: document.body.innerText.includes('Countless Useful Tools'),
      featured: document.body.innerText.includes('Featured tools'),
      popular: document.body.innerText.includes('Popular applications'),
      categories: document.body.innerText.includes('Find your category'),
      recentlyAdded: document.body.innerText.includes('Recently added'),
      toolCards: document.querySelectorAll('a[href^="/toolatlas/tools/"]').length,
      stats: document.querySelectorAll('a[href^="/toolatlas/category/"]').length,
    };
  `);
  check('hero tagline visible', data.hero);
  check('featured section visible', data.featured);
  check('popular section visible', data.popular);
  check('category navigation visible', data.categories);
  check('recently added visible', data.recentlyAdded);
  check('tool links rendered', data.toolCards > 10, `got ${data.toolCards}`);
  check('category links rendered', data.stats >= 10, `got ${data.stats}`);
});

test('Global search filters the catalogue', async () => {
  await goto('/tools');
  const data = await evaluate(`
    ${SET_INPUT}
    const input = document.querySelector('input[aria-label="Filter tools"]');
    setInput(input, 'json');
    await new Promise((r) => setTimeout(r, 300));
    return {
      count: document.querySelectorAll('a[href^="/toolatlas/tools/"]').length,
      names: [...document.querySelectorAll('a[href^="/toolatlas/tools/"] h3')].map((h) => h.textContent.trim()),
    };
  `);
  check('search narrows results', data.count > 0 && data.count < 10, `got ${data.count}`);
  check('JSON Formatter is a match', data.names.includes('JSON Formatter'), data.names.join(', '));
});

test('Search dialog opens with the keyboard shortcut', async () => {
  await goto('/');
  const data = await evaluate(`
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return { open: false };
    const input = dialog.querySelector('input');
    const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    proto.call(input, 'password');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));
    return {
      open: true,
      results: [...dialog.querySelectorAll('button')].map((b) => b.textContent).join('|'),
    };
  `);
  check('dialog opened', data.open);
  check('dialog found the password generator', (data.results ?? '').includes('Password Generator'));
});

test('Calculator performs arithmetic', async () => {
  await goto('/tools/calculator');
  const data = await evaluate(`
    ${SET_INPUT}
    for (const key of ['1', '2', '×', '3', '=']) {
      byText('button', key).click();
      await new Promise((r) => setTimeout(r, 60));
    }
    await new Promise((r) => setTimeout(r, 150));
    return {
      display: document.querySelector('p[aria-live="polite"]').textContent.trim(),
      history: document.body.innerText.includes('12 × 3 = 36'),
    };
  `);
  eq('12 × 3 = 36', data.display, '36');
  check('history records the calculation', data.history);
});

test('Calculator clears with C', async () => {
  await goto('/tools/calculator');
  const data = await evaluate(`
    ${SET_INPUT}
    byText('button', '7').click();
    await new Promise((r) => setTimeout(r, 80));
    byText('button', 'C').click();
    await new Promise((r) => setTimeout(r, 150));
    return document.querySelector('p[aria-live="polite"]').textContent.trim();
  `);
  eq('display resets to 0', data, '0');
});

test('Unit converter converts metres to feet', async () => {
  await goto('/tools/unit-converter');
  const data = await evaluate(`
    ${SET_INPUT}
    const value = document.querySelector('input[aria-label="Value to convert"]');
    setInput(value, '2');
    await new Promise((r) => setTimeout(r, 250));
    const selects = document.querySelectorAll('select');
    const from = selects[0];
    const to = selects[1];
    from.value = 'm'; from.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 150));
    to.value = 'ft'; to.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 250));
    return document.body.innerText.replace(/\\s+/g, ' ');
  `);
  check('2 m expressed in feet', data.includes('6.56168'), data.slice(0, 200));
});

test('JSON formatter formats and minifies', async () => {
  await goto('/tools/json-formatter');
  const data = await evaluate(`
    ${SET_INPUT}
    const input = document.querySelector('textarea[aria-label="JSON input"]');
    setInput(input, '{"b":2,"a":[1,2,{"c":3}]}');
    await new Promise((r) => setTimeout(r, 300));
    byText('button', 'Format').click();
    await new Promise((r) => setTimeout(r, 250));
    const formatted = document.querySelector('textarea[aria-label="Formatted JSON"]').value;
    byText('button', 'Minify').click();
    await new Promise((r) => setTimeout(r, 250));
    const minified = document.querySelector('textarea[aria-label="Formatted JSON"]').value;
    return { formatted, minified, status: document.body.innerText.includes('Valid JSON') };
  `);
  check('input is valid', data.status);
  check('formatted output is pretty-printed', data.formatted.includes('\n  "b": 2'), JSON.stringify(data.formatted));
  eq('minified output is compact', data.minified, '{"b":2,"a":[1,2,{"c":3}]}');
});

test('JSON formatter reports invalid input', async () => {
  await goto('/tools/json-formatter');
  const data = await evaluate(`
    ${SET_INPUT}
    const input = document.querySelector('textarea[aria-label="JSON input"]');
    setInput(input, '{"broken": }');
    await new Promise((r) => setTimeout(r, 300));
    return {
      invalid: document.body.innerText.includes('Invalid'),
      error: document.querySelector('.text-rose-500')?.textContent ?? '',
    };
  `);
  check('invalid JSON is flagged', data.invalid, data.error);
});

test('Percentage calculator computes a percentage of a value', async () => {
  await goto('/tools/percentage-calculator');
  const data = await evaluate(`
    ${SET_INPUT}
    const inputs = [...document.querySelectorAll('input[type="number"]')];
    setInput(inputs[0], '15');
    setInput(inputs[1], '200');
    await new Promise((r) => setTimeout(r, 300));
    return document.body.innerText.replace(/\\s+/g, ' ');
  `);
  check('15% of 200 = 30', data.includes('30'), data.slice(0, 200));
});

test('BMI calculator classifies a value', async () => {
  await goto('/tools/bmi-calculator');
  const data = await evaluate(`
    ${SET_INPUT}
    const inputs = [...document.querySelectorAll('input[type="number"]')];
    setInput(inputs[0], '180');
    setInput(inputs[1], '80');
    await new Promise((r) => setTimeout(r, 300));
    return document.body.innerText.replace(/\\s+/g, ' ');
  `);
  check('BMI of 80 kg / 180 cm is 24.7', data.includes('24.7'), data.slice(0, 260));
  check('BMI is classified as healthy', data.includes('Healthy weight'), data.slice(0, 260));
});

test('Tip calculator splits a bill', async () => {
  await goto('/tools/tip-calculator');
  const data = await evaluate(`
    ${SET_INPUT}
    const inputs = [...document.querySelectorAll('input[type="number"]')];
    setInput(inputs[0], '100');
    setInput(inputs[1], '10');
    setInput(inputs[2], '4');
    await new Promise((r) => setTimeout(r, 300));
    return document.body.innerText.replace(/\\s+/g, ' ');
  `);
  check('tip of 10 on 100 is 10', data.includes('$10.00') || data.includes('10.00'), data.slice(0, 240));
  check('per person is 27.50', data.includes('27.50'), data.slice(0, 240));
});

test('Loan EMI calculator produces a schedule', async () => {
  await goto('/tools/loan-emi-calculator');
  const data = await evaluate(`
    ${SET_INPUT}
    const inputs = [...document.querySelectorAll('input[type="number"]')];
    setInput(inputs[0], '100000');
    setInput(inputs[1], '6');
    setInput(inputs[2], '10');
    await new Promise((r) => setTimeout(r, 400));
    return document.body.innerText.replace(/\\s+/g, ' ');
  `);
  check('monthly payment is $1,110', data.includes('$1,110'), data.slice(0, 300));
  check('yearly breakdown rendered', data.includes('YEAR PRINCIPAL INTEREST BALANCE'), data.slice(0, 300));
  check('amortisation rows present', /\b1 \$7,527\b/.test(data), data.slice(0, 400));
});

test('Age calculator computes an exact age', async () => {
  await goto('/tools/age-calculator');
  const data = await evaluate(`
    ${SET_INPUT}
    const dates = [...document.querySelectorAll('input[type="date"]')];
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(dates[0], '2000-01-15');
    dates[0].dispatchEvent(new Event('input', { bubbles: true }));
    setter.call(dates[1], '2026-01-15');
    dates[1].dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));
    return document.body.innerText.replace(/\\s+/g, ' ');
  `);
  check('exact age is 26 years', data.includes('26 years, 0 months, 0 days'), data.slice(0, 300));
});

test('Date difference counts days and business days', async () => {
  await goto('/tools/date-difference');
  const data = await evaluate(`
    ${SET_INPUT}
    const dates = [...document.querySelectorAll('input[type="date"]')];
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(dates[0], '2026-01-05');
    dates[0].dispatchEvent(new Event('input', { bubbles: true }));
    setter.call(dates[1], '2026-01-19');
    dates[1].dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));
    return document.body.innerText.replace(/\\s+/g, ' ');
  `);
  check('difference is 14 days', data.includes('14 days'), data.slice(0, 300));
  check('business days computed', /business days \d+/.test(data.toLowerCase()), data.slice(0, 300));
});

test('Word counter counts words and characters', async () => {
  await goto('/tools/word-counter');
  const data = await evaluate(`
    ${SET_INPUT}
    const input = document.querySelector('textarea[aria-label="Text to analyse"]');
    setInput(input, 'The quick brown fox jumps over the lazy dog');
    await new Promise((r) => setTimeout(r, 300));
    return document.body.innerText.replace(/\\s+/g, ' ');
  `);
  check('nine words counted', /words 9/.test(data.toLowerCase()), data.slice(0, 240));
  check('43 characters counted', /characters 43/.test(data.toLowerCase()), data.slice(0, 240));
});

test('Case converter transforms text', async () => {
  await goto('/tools/case-converter');
  const data = await evaluate(`
    ${SET_INPUT}
    byPrefix('button', 'camelCase').click();
    await new Promise((r) => setTimeout(r, 250));
    const camel = document.querySelector('textarea[aria-label="Converted text"]').value;
    byPrefix('button', 'snake_case').click();
    await new Promise((r) => setTimeout(r, 250));
    const snake = document.querySelector('textarea[aria-label="Converted text"]').value;
    return { camel, snake };
  `);
  eq('camelCase output', data.camel, 'toolAtlasMakesSmallToolsFeelEffortless');
  eq('snake_case output', data.snake, 'tool_atlas_makes_small_tools_feel_effortless');
});

test('Text diff highlights added and removed lines', async () => {
  await goto('/tools/text-diff');
  const data = await evaluate(`
    ${SET_INPUT}
    const areas = [...document.querySelectorAll('textarea')];
    setInput(areas[0], 'alpha\\nbeta\\ngamma');
    setInput(areas[1], 'alpha\\nbeta changed\\ngamma');
    await new Promise((r) => setTimeout(r, 400));
    return document.body.innerText.replace(/\\s+/g, ' ');
  `);
  check('one line added', data.includes('1 added'), data.slice(0, 300));
  check('one line removed', data.includes('1 removed'), data.slice(0, 300));
});

test('Base64 encodes and decodes text', async () => {
  await goto('/tools/base64');
  const data = await evaluate(`
    ${SET_INPUT}
    const input = document.querySelector('textarea[aria-label="Input"]');
    setInput(input, 'ToolAtlas');
    await new Promise((r) => setTimeout(r, 300));
    const encoded = document.querySelector('textarea[aria-label="Output"]').value;
    byText('button', 'Base64 → Text').click();
    await new Promise((r) => setTimeout(r, 250));
    setInput(document.querySelector('textarea[aria-label="Input"]'), encoded);
    await new Promise((r) => setTimeout(r, 300));
    const decoded = document.querySelector('textarea[aria-label="Output"]').value;
    return { encoded, decoded };
  `);
  eq('base64 encoding', data.encoded, 'VG9vbEF0bGFz');
  eq('base64 decoding', data.decoded, 'ToolAtlas');
});

test('Hash generator produces SHA-256 digests', async () => {
  await goto('/tools/hash-generator');
  const data = await evaluate(`
    ${SET_INPUT}
    const input = document.querySelector('textarea[aria-label="Text to hash"]');
    setInput(input, 'toolatlas');
    await new Promise((r) => setTimeout(r, 700));
    return document.body.innerText.replace(/\\s+/g, ' ');
  `);
  check('sha256 digest rendered', /[0-9a-f]{64}/.test(data), data.slice(0, 400));
});

test('JWT decoder inspects claims', async () => {
  await goto('/tools/jwt-decoder');
  const data = await evaluate(`
    ${SET_INPUT}
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' + btoa(JSON.stringify({ sub: '42', name: 'Ada' })) + '.sig';
    const input = document.querySelector('textarea[aria-label="JWT token"]');
    setInput(input, token);
    await new Promise((r) => setTimeout(r, 400));
    return document.body.innerText.replace(/\\s+/g, ' ');
  `);
  check('header algorithm shown', data.includes('HS256'), data.slice(0, 300));
  check('subject claim shown', data.includes('Ada'), data.slice(0, 300));
});

test('Regex tester finds matches', async () => {
  await goto('/tools/regex-tester');
  const data = await evaluate(`
    ${SET_INPUT}
    await new Promise((r) => setTimeout(r, 400));
    return document.body.innerText.replace(/\\s+/g, ' ');
  `);
  check('two e-mail matches found', data.includes('2 matches'), data.slice(0, 300));
  check('matched address highlighted', data.includes('hello@toolatlas.dev'), data.slice(0, 300));
});

test('Password generator creates a strong password', async () => {
  await goto('/tools/password-generator');
  const data = await evaluate(`
    ${SET_INPUT}
    await new Promise((r) => setTimeout(r, 400));
    const before = document.querySelector('.font-mono.text-lg')?.textContent.trim() ?? '';
    byText('button', 'Generate new').click();
    await new Promise((r) => setTimeout(r, 300));
    const after = document.querySelector('.font-mono.text-lg')?.textContent.trim() ?? '';
    return { before, after, body: document.body.innerText.replace(/\\s+/g, ' ') };
  `);
  eq('password is 20 characters', data.before.length, 20);
  check('regenerating changes the password', data.before !== data.after);
  check('strength is reported', /bits/.test(data.body), data.body.slice(0, 200));
});

test('UUID generator creates identifiers', async () => {
  await goto('/tools/uuid-generator');
  const data = await evaluate(`
    ${SET_INPUT}
    await new Promise((r) => setTimeout(r, 300));
    const codes = [...document.querySelectorAll('code')].map((c) => c.textContent.trim());
    return { codes, count: codes.length };
  `);
  check('six UUIDs generated', data.count === 6, `got ${data.count}`);
  check('UUIDs use the v4 format', data.codes.every((c) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(c)), data.codes.join(','));
});

test('QR code generator renders a code', async () => {
  await goto('/tools/qr-code-generator');
  const data = await evaluate(`
    await new Promise((r) => setTimeout(r, 1200));
    const img = document.querySelector('img[alt="QR code preview"]');
    return { hasImage: !!img, src: img?.src.slice(0, 30) ?? '' };
  `);
  check('QR preview image rendered', data.hasImage);
  check('QR preview is a PNG data URL', data.src.startsWith('data:image/png'), data.src);
});

test('Colour converter converts hex to HSL', async () => {
  await goto('/tools/color-converter');
  const data = await evaluate(`
    ${SET_INPUT}
    const input = document.querySelector('input[aria-label="Hex colour"]');
    setInput(input, '#FF0000');
    await new Promise((r) => setTimeout(r, 300));
    return document.body.innerText.replace(/\\s+/g, ' ');
  `);
  check('red converts to hsl(0, 100%, 50%)', data.includes('hsl(0, 100%, 50%)'), data.slice(0, 300));
  check('red converts to cmyk(0%, 100%, 100%, 0%)', data.includes('cmyk(0%, 100%, 100%, 0%)'), data.slice(0, 300));
});

test('Colour palette generator builds a palette', async () => {
  await goto('/tools/color-palette');
  const data = await evaluate(`
    ${SET_INPUT}
    await new Promise((r) => setTimeout(r, 400));
    const swatches = [...document.querySelectorAll('button[style*="background-color"]')];
    return { count: swatches.length, css: document.body.innerText.includes('--palette-1') };
  `);
  check('five palette swatches rendered', data.count === 5, `got ${data.count}`);
  check('CSS custom properties offered', data.css);
});

test('URL parser splits a URL into parts', async () => {
  await goto('/tools/url-parser');
  const data = await evaluate(`
    ${SET_INPUT}
    const input = document.querySelector('textarea[aria-label="URL"]');
    setInput(input, 'https://example.com:8080/a/b?x=1&y=2#frag');
    await new Promise((r) => setTimeout(r, 300));
    return document.body.innerText.replace(/\\s+/g, ' ');
  `);
  check('host parsed', data.includes('example.com'), data.slice(0, 300));
  check('port parsed', data.includes('8080'), data.slice(0, 300));
  check('two query parameters listed', data.includes('Query parameters (2)'), data.slice(0, 300));
});

test('Task list stores tasks locally', async () => {
  await resetStorage(['toolatlas:tool:todo']);
  await goto('/tools/todo-list');
  const data = await evaluate(`
    ${SET_INPUT}
    const input = document.querySelector('input[aria-label="New task"]');
    setInput(input, 'Ship ToolAtlas');
    await new Promise((r) => setTimeout(r, 150));
    byText('button', 'Add task').click();
    await new Promise((r) => setTimeout(r, 400));
    const stored = JSON.parse(localStorage.getItem('toolatlas:tool:todo') || '[]');
    return {
      visible: document.body.innerText.includes('Ship ToolAtlas'),
      stored: stored.length,
      text: stored[0]?.text ?? '',
    };
  `);
  check('task appears in the list', data.visible);
  eq('task persisted to localStorage', data.stored, 1);
  eq('task text persisted', data.text, 'Ship ToolAtlas');
});

test('Quick notes save automatically', async () => {
  await resetStorage(['toolatlas:tool:notes']);
  await goto('/tools/quick-notes');
  const data = await evaluate(`
    ${SET_INPUT}
    const body = document.querySelector('textarea[aria-label="Note body"]');
    setInput(body, 'Remember the milk');
    await new Promise((r) => setTimeout(r, 400));
    const stored = JSON.parse(localStorage.getItem('toolatlas:tool:notes') || '[]');
    return { stored: stored.length, text: stored[0]?.body ?? '' };
  `);
  eq('note persisted', data.stored, 1);
  eq('note body persisted', data.text, 'Remember the milk');
});

test('Pomodoro timer counts down', async () => {
  await goto('/tools/pomodoro');
  const data = await evaluate(`
    ${SET_INPUT}
    const start = byText('button', 'Start');
    start.click();
    await new Promise((r) => setTimeout(r, 2200));
    const clock = document.querySelector('p.font-mono.text-4xl').textContent.trim();
    byText('button', 'Pause').click();
    return { clock };
  `);
  check('timer counts down from 25:00', /24:5[0-9]/.test(data.clock), data.clock);
});

test('Countdown shows days to a target date', async () => {
  await goto('/tools/countdown');
  const data = await evaluate(`
    ${SET_INPUT}
    const input = document.querySelector('input[aria-label="Target date"]') || document.querySelector('input[type="date"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, '2030-01-01');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 400));
    return document.body.innerText.replace(/\\s+/g, ' ');
  `);
  check('days counter is populated', /\d+ days/.test(data.toLowerCase()), data.slice(0, 300));
});

test('Time zone converter lists several zones', async () => {
  await goto('/tools/timezone-converter');
  const data = await evaluate(`
    ${SET_INPUT}
    await new Promise((r) => setTimeout(r, 400));
    const text = document.body.innerText;
    return {
      zones: ['UTC', 'America/New York', 'Europe/London'].filter((z) => text.includes(z)),
      body: text.replace(/\\s+/g, ' ').slice(0, 200),
    };
  `);
  check('multiple time zones listed', data.zones.length >= 2, data.zones.join(','));
});

test('Favourites can be toggled and persist', async () => {
  await resetStorage(['toolatlas:favorites']);
  await goto('/tools/calculator');
  const data = await evaluate(`
    ${SET_INPUT}
    const button = byText('button', 'Save');
    if (!button) return { error: 'Save button not found', labels: [...document.querySelectorAll('button')].map(b => b.textContent.trim()).join('|') };
    button.click();
    await new Promise((r) => setTimeout(r, 300));
    const stored = JSON.parse(localStorage.getItem('toolatlas:favorites') || '[]');
    return { stored, label: byText('button', 'Saved') ? 'Saved' : 'Save' };
  `);
  check('calculator was favourited', (data.stored ?? []).includes('calculator'), JSON.stringify(data));
  eq('header button switches to Saved', data.label, 'Saved');

  await goto('/favorites');
  const listed = await evaluate(
    `return document.body.innerText.includes('Standard Calculator');`
  );
  check('favourite appears on the favourites page', listed);
});

test('Recently used records visited tools', async () => {
  await goto('/recent');
  const data = await evaluate(`
    const rows = [...document.querySelectorAll('ol a')].map((a) => a.getAttribute('href'));
    return { rows };
  `);
  check('history contains visited tools', data.rows.length > 0, JSON.stringify(data.rows));
});

test('Theme toggle switches between light and dark', async () => {
  await goto('/');
  const data = await evaluate(`
    const before = document.documentElement.classList.contains('dark');
    document.querySelector('button[aria-label*="theme"]').click();
    await new Promise((r) => setTimeout(r, 300));
    const after = document.documentElement.classList.contains('dark');
    const stored = localStorage.getItem('toolatlas:theme');
    return { before, after, stored };
  `);
  check('theme class toggles', data.before !== data.after, JSON.stringify(data));
  check('theme stored as a bare string', data.stored === 'light' || data.stored === 'dark', JSON.stringify(data.stored));

  // The theme must survive a reload (and be applied before React boots).
  await goto('/');
  const afterReload = await evaluate(
    `return document.documentElement.classList.contains('dark');`
  );
  check('theme survives a reload', afterReload === data.after, `${afterReload} vs ${data.after}`);
});

test('Unknown tool URLs show the 404 page', async () => {
  await goto('/tools/not-a-real-tool');
  const data = await evaluate(
    `return { text: document.body.innerText.includes('This part of the atlas is uncharted') };`
  );
  check('404 page rendered', data.text);
});

test('Every catalogue tool has a working route', async () => {
  await goto('/tools');
  const ids = await evaluate(`
    const links = [...document.querySelectorAll('a[href^="/toolatlas/tools/"]')];
    const ids = [...new Set(links.map((a) => a.getAttribute('href').split('/').pop()))];
    return ids;
  `);
  const broken = [];
  for (const id of ids) {
    await goto(`/tools/${id}`);
    const ok = await evaluate(`
      const heading = document.querySelector('h1');
      const skeleton = document.body.innerText.includes('Loading tool');
      return { heading: heading?.textContent.trim() ?? '', skeleton };
    `);
    if (ok.skeleton || !ok.heading) broken.push(`${id} (${ok.heading || 'no heading'})`);
  }
  check(`all ${ids.length} catalogued tools render`, broken.length === 0, broken.join(', '));
});

/* ------------------------------------------------------------------- main */

async function main() {
  chrome = spawn(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--no-first-run',
      '--disable-extensions',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${join(tmpdir(), 'toolatlas-e2e-profile')}`,
      'about:blank',
    ],
    { stdio: 'ignore' }
  );

  // Wait for the debugging endpoint.
  let target = null;
  for (let i = 0; i < 60; i += 1) {
    await sleep(250);
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await response.json();
      target = list.find((entry) => entry.type === 'page');
      if (target) break;
    } catch {
      /* not up yet */
    }
  }
  if (!target) throw new Error('Could not reach the Chrome debugging endpoint.');

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    }
  });

  await send('Page.enable');
  await send('Runtime.enable');

  for (const { name, fn } of tests) {
    console.log(`\n> ${name}`);
    try {
      await fn();
    } catch (error) {
      failures.push(`${name} threw: ${error.message}`);
      console.log(`  ERROR ${error.message}`);
    }
  }

  console.log(`\n${'-'.repeat(60)}`);
  console.log(`passed: ${passed}   failed: ${failures.length}`);
  if (failures.length) {
    console.log('\nFailures:');
    for (const failure of failures) console.log(` - ${failure}`);
  }

  ws.close();
  chrome.kill();
  process.exit(failures.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  if (chrome) chrome.kill();
  process.exit(1);
});
