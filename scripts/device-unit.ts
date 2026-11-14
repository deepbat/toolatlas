import assert from "node:assert/strict";
import {
  DEFAULT_PX_PER_MM,
  cardinalFromHeading,
  clampBpm,
  clampFreq,
  dbfsFromRms,
  formatSpeed,
  haversineM,
  meterLevel,
  morseToText,
  noteFromFreq,
  pxPerMm,
  rulerTicks,
  textToMorse,
} from "../src/lib/device";
import { TOOL_MAP } from "../src/lib/catalog";
import { DEVICE_TOOLS } from "../src/lib/device-catalog";

let n = 0;
const test = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log("ok " + name);
};

test("all 13 device tools are registered with unique ids", () => {
  assert.equal(DEVICE_TOOLS.length, 13);
  assert.equal(new Set(DEVICE_TOOLS.map((t) => t.id)).size, 13);
  for (const t of DEVICE_TOOLS) {
    assert.equal(TOOL_MAP[t.id], t, t.id + " missing from TOOL_MAP");
    assert.equal(t.category, "device");
    assert.ok(t.keywords.length >= 4, t.id + " needs search keywords");
  }
});

test("morse encodes SOS and round-trips mixed text", () => {
  assert.equal(textToMorse("SOS"), "... --- ...");
  assert.equal(textToMorse("HELLO WORLD"), ".... . .-.. .-.. --- / .-- --- .-. .-.. -..");
  assert.equal(morseToText("... --- ..."), "SOS");
  assert.equal(morseToText(textToMorse("Tool Atlas 2026")), "TOOL ATLAS 2026");
});

test("morse drops unsupported characters instead of crashing", () => {
  assert.equal(textToMorse("a€b"), ".- -...");
  assert.equal(textToMorse("€€"), "");
  assert.equal(morseToText("... ..-"), "SU");
  assert.equal(morseToText("...-..-"), "$");
});

test("noteFromFreq finds A4 and cents drift", () => {
  const a4 = noteFromFreq(440);
  assert.ok(a4);
  assert.equal(a4.name, "A");
  assert.equal(a4.octave, 4);
  assert.equal(a4.cents, 0);
  const sharp = noteFromFreq(448);
  assert.ok(sharp && sharp.name === "A" && sharp.cents > 0 && sharp.cents <= 50);
  const c4 = noteFromFreq(261.63);
  assert.ok(c4 && c4.name === "C" && c4.octave === 4 && Math.abs(c4.cents) <= 1);
  assert.equal(noteFromFreq(5), null);
  assert.equal(noteFromFreq(NaN), null);
});

test("dbfs and meter level behave at silence and full scale", () => {
  assert.equal(dbfsFromRms(0), -100);
  assert.equal(dbfsFromRms(1), 0);
  assert.ok(Math.abs(dbfsFromRms(0.5) + 6.02) < 0.1);
  assert.equal(meterLevel(-100), 0);
  assert.equal(meterLevel(0), 100);
  assert.equal(meterLevel(-60), 0);
});

test("cardinal compass labels wrap correctly", () => {
  assert.equal(cardinalFromHeading(0), "N");
  assert.equal(cardinalFromHeading(90), "E");
  assert.equal(cardinalFromHeading(180), "S");
  assert.equal(cardinalFromHeading(270), "W");
  assert.equal(cardinalFromHeading(359), "N");
  assert.equal(cardinalFromHeading(-45), "NW");
  assert.equal(cardinalFromHeading(45), "NE");
});

test("speed formatting and units", () => {
  assert.equal(formatSpeed(null, "kmh"), "--");
  assert.equal(formatSpeed(10, "kmh"), "36");
  assert.equal(formatSpeed(10, "mph"), "22");
  assert.equal(formatSpeed(1, "kn"), "1.9");
  assert.equal(formatSpeed(-3, "kmh"), "--");
});

test("haversine distance is sane for a known leg", () => {
  // Delhi to Jaipur is about 240 km.
  const d = haversineM(28.6139, 77.209, 26.9124, 75.7873);
  assert.ok(d > 200_000 && d < 280_000, `got ${d}`);
  assert.equal(haversineM(10, 20, 10, 20), 0);
});

test("ruler calibration maths", () => {
  assert.ok(Math.abs(DEFAULT_PX_PER_MM - 3.7795) < 0.001);
  assert.equal(pxPerMm(428, 85.6), 5);
  assert.equal(pxPerMm(100, 0), 0);
  const ticks = rulerTicks(25);
  assert.equal(ticks.length, 26);
  assert.equal(ticks.filter((t) => t.label).length, 3);
  assert.equal(ticks[10].label, true);
});

test("tempo and frequency clamps hold the documented ranges", () => {
  assert.equal(clampBpm(0), 30);
  assert.equal(clampBpm(999), 300);
  assert.equal(clampBpm(120.4), 120);
  assert.equal(clampFreq(5), 20);
  assert.equal(clampFreq(99000), 20000);
});

console.log(`\n${n} device unit checks passed`);
