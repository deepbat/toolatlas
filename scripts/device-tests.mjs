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

  // Speech to text privacy gates. The site promises inputs never leave the
  // device, so dictation may only run with on-device recognition
  // (processLocally). Three states are covered here:
  // 1. No Web Speech API (headless chromium): honest support note, and the
  //    note must not talk about a 'speech service' it would never use.
  await page.goto(`${base}/tools/speech-to-text/`);
  await page.waitForTimeout(800);
  if (await page.getByText('needs the Web Speech API').count()) {
    const note = (await page.getByText('needs the Web Speech API').textContent()) || '';
    check('speech-to-text shows its support note without the API', note.includes('nothing is recorded or sent'));
    check('support note has no leftover speech-service wording', !note.includes('speech service'));
  } else {
    // API present: the dictation panel must promise on-device recognition.
    // Do not click Start here: headless chromium can crash its renderer on a
    // real start() call; start behaviour is covered by the mocks below.
    await page.getByRole('button', { name: 'Start dictation' }).waitFor();
    const main = (await page.textContent('main')) || '';
    check('dictation panel promises on-device recognition', main.includes('Recognition runs on this device'));
  }

  // 2. A browser whose only recognition path sends audio to the vendor must
  //    fail closed: gate note shown, no dictation button, start never called.
  const remotePage = await browser.newPage();
  await remotePage.addInitScript(() => {
    class RemoteOnlyRecognition {
      constructor() { window.__remoteStarts = (window.__remoteStarts || 0); }
      start() { window.__remoteStarts += 1; }
      stop() {}
    }
    window.SpeechRecognition = RemoteOnlyRecognition;
  });
  await remotePage.goto(`${base}/tools/speech-to-text/`);
  await remotePage.getByText('keeps dictation off').waitFor();
  check('speech-to-text fails closed when only remote recognition exists', true);
  check('remote-only path offers no dictation button', (await remotePage.getByRole('button', { name: 'Start dictation' }).count()) === 0);
  check('remote-only path never starts recognition', (await remotePage.evaluate(() => window.__remoteStarts || 0)) === 0);
  await remotePage.close();

  // 3. With on-device support the tool must start recognition with
  //    processLocally=true, then transcribe and stop normally.
  const localPage = await browser.newPage();
  await localPage.addInitScript(() => {
    class LocalRecognition {
      constructor() { window.__lastRecognition = this; this.processLocally = false; this.continuous = false; this.interimResults = false; this.lang = ''; this.onresult = null; this.onerror = null; this.onend = null; }
      start() {
        setTimeout(() => {
          if (this.onresult) this.onresult({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: 'hello local world' } }] });
        }, 50);
      }
      stop() { if (this.onend) this.onend(); }
    }
    LocalRecognition.prototype.processLocally = false;
    window.SpeechRecognition = LocalRecognition;
  });
  await localPage.goto(`${base}/tools/speech-to-text/`);
  await localPage.getByRole('button', { name: 'Start dictation' }).click();
  await localPage.getByTestId('transcript').waitFor();
  check('on-device recognition returns a transcript', ((await localPage.getByTestId('transcript').textContent()) || '').includes('hello local world'));
  check('recognition is started with processLocally=true', await localPage.evaluate(() => window.__lastRecognition.processLocally === true));
  await localPage.getByRole('button', { name: 'Stop dictation' }).click();
  await localPage.getByRole('button', { name: 'Start dictation' }).waitFor();
  check('on-device dictation stops cleanly', true);
  await localPage.close();

  // The privacy policy must carry the speech-to-text exception handling.
  const privacyHtml = await (await fetch(`${base}/privacy/`)).text();
  check('privacy policy covers on-device speech recognition', privacyHtml.includes('on-device speech recognition') && privacyHtml.includes('Microphone audio is never uploaded'));

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
