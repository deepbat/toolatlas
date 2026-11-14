// Browser checks for the Device & Sensor tools. Run: npm run build && npm run test:device
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const base = process.env.E2E_BASE_URL || 'http://127.0.0.1:4173/toolatlas';
let server;
if (!process.env.E2E_BASE_URL) {
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1'], { stdio: 'ignore' });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base + '/')).ok) break; } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 100));
  }
}
const browser = await chromium.launch();
await mkdir('test-artifacts/device', { recursive: true });
let n = 0;
const check = (name, ok) => { assert.ok(ok, name); n++; console.log('ok  ' + name); };

const NAMES = {
  'sound-meter': 'Sound Level Meter',
  metronome: 'Metronome',
  tuner: 'Instrument Tuner',
  'tone-generator': 'Tone Generator & Sweep',
  'text-to-speech': 'Text to Speech',
  'speech-to-text': 'Speech to Text',
  compass: 'Compass',
  'spirit-level': 'Spirit Level',
  'gps-speedometer': 'GPS Speedometer',
  'screen-ruler': 'Screen Ruler',
  'morse-code': 'Morse Code Translator',
  'qr-barcode-scanner': 'QR & Barcode Scanner',
  'screen-recorder': 'Screen Recorder',
};

try {
  const page = await browser.newPage();

  for (const [id, name] of Object.entries(NAMES)) {
    await page.goto(`${base}/tools/${id}/`);
    await page.getByRole('heading', { name, exact: true, level: 1 }).waitFor();
    check(`${id} renders its page and title`, true);
  }

  // Static prerender must carry each route's SEO shell.
  const html = await (await fetch(`${base}/tools/sound-meter/`)).text();
  check('sound-meter static HTML has canonical title', html.includes('<title>Sound Level Meter | ToolAtlas</title>'));
  check('sound-meter static HTML has schema', html.includes('WebApplication'));
  const catHtml = await (await fetch(`${base}/category/device/`)).text();
  check('device category page lists tools', catHtml.includes('Sound Level Meter') && catHtml.includes('Screen Recorder'));
  const utilitiesHtml = await (await fetch(`${base}/utilities/`)).text();
  check('utilities section lists device tools', utilitiesHtml.includes('GPS Speedometer'));

  // Morse: real conversion in the browser.
  await page.goto(`${base}/tools/morse-code/`);
  const morseOut = page.getByTestId('morse-output');
  await assertText(morseOut, '... --- ...');
  check('morse encodes the SOS example', true);
  await page.getByRole('button', { name: 'Morse to Text' }).click();
  await page.getByLabel('Morse code').fill('.... . .-.. .-.. ---');
  await assertText(morseOut, 'HELLO');
  check('morse decodes back to text', true);

  // Screen ruler: calibration changes the reported scale.
  await page.goto(`${base}/tools/screen-ruler/`);
  const scale = page.getByTestId('ruler-scale');
  const before = await scale.textContent();
  await page.getByLabel('Calibration width').fill('428');
  await page.getByRole('button', { name: 'Apply calibration' }).click();
  const after = await scale.textContent();
  check(`ruler calibration updates scale (${before} -> ${after})`, before !== after && after.includes('= 50 px'));

  // Metronome: tap tempo changes the BPM, slider clamps to the documented range.
  await page.goto(`${base}/tools/metronome/`);
  await page.getByLabel('Tempo in beats per minute').fill('999');
  check('metronome clamps slider to 300 BPM', (await page.locator('#bpm').inputValue()) === '300');

  // Speech to text: with no Web Speech API the honest support note must
  // appear; with the API but no microphone service (headless) starting
  // dictation must surface an error or a listening state, never a dead button.
  await page.goto(`${base}/tools/speech-to-text/`);
  await page.waitForTimeout(800);
  if (await page.getByText('needs the Web Speech API').count()) {
    check('speech-to-text shows its support note without the API', true);
  } else {
    await page.getByRole('button', { name: 'Start dictation' }).click();
    await page.waitForTimeout(2500);
    const main = (await page.textContent('main')) || '';
    check('speech-to-text degrades honestly (error or listening)', /Recognition error|Microphone permission|Stop dictation/.test(main));
  }

  // QR scanner: BarcodeDetector may be absent (support note) or present but
  // camera-less (permission error); both states must render honestly.
  await page.goto(`${base}/tools/qr-barcode-scanner/`);
  await page.waitForTimeout(800);
  if (await page.getByText('Barcode Detection API').count()) {
    check('qr scanner shows its support note without the API', true);
  } else {
    await page.getByRole('button', { name: 'Start camera' }).click();
    await page.waitForTimeout(2500);
    const main = (await page.textContent('main')) || '';
    check('qr scanner degrades honestly (error or viewfinder)', /Camera permission was denied|Could not start the camera|Stop camera/.test(main));
  }

  // Tone generator: play and stop without crashing (headless has audio stubs).
  await page.goto(`${base}/tools/tone-generator/`);
  await page.getByRole('button', { name: 'Play tone' }).click();
  await page.getByRole('button', { name: 'Stop' }).waitFor();
  await page.getByRole('button', { name: 'Stop' }).click();
  await page.getByRole('button', { name: 'Play tone' }).waitFor();
  check('tone generator starts and stops cleanly', true);

  // Compass and level: sensors absent in headless, must degrade gracefully.
  await page.goto(`${base}/tools/compass/`);
  await page.getByRole('button', { name: 'Enable compass' }).click();
  await page.waitForTimeout(600);
  check('compass survives a headless sensor request', await page.getByRole('heading', { name: 'Compass', exact: true, level: 1 }).isVisible());

  await page.goto(`${base}/tools/gps-speedometer/`);
  await page.getByRole('button', { name: 'Start GPS' }).click();
  await page.getByText(/permission was denied|Could not get a GPS fix/).first().waitFor({ timeout: 20000 });
  check('gps speedometer reports denial instead of hanging', true);

  await page.screenshot({ path: 'test-artifacts/device/gps-denied.png' });
  await page.goto(`${base}/tools/metronome/`);
  await page.screenshot({ path: 'test-artifacts/device/metronome.png' });
  await page.goto(`${base}/tools/screen-ruler/`);
  await page.screenshot({ path: 'test-artifacts/device/ruler.png' });
  await page.goto(`${base}/category/device/`);
  await page.screenshot({ path: 'test-artifacts/device/category.png', fullPage: true });

  await page.close();
} finally {
  await browser.close();
  server?.kill();
}
console.log(`\n${n} device browser checks passed`);

async function assertText(locator, text) {
  await locator.waitFor();
  const actual = (await locator.textContent())?.trim();
  assert.ok(actual?.includes(text), `expected "${text}" in "${actual}"`);
}
