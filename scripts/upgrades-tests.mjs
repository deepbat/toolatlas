import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import assert from "node:assert/strict";
const BASE = process.env.E2E_BASE_URL || "http://127.0.0.1:4173/toolatlas";
let server;
if (!process.env.E2E_BASE_URL) {
  server = spawn(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1"],
    { stdio: "ignore" },
  );
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(BASE + "/")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
}
const browser = await chromium.launch(),
  ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    acceptDownloads: true,
  }),
  page = await ctx.newPage();
page.setDefaultTimeout(15000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
let count = 0;
const failures = [];
await mkdir("test-artifacts/upgrades", { recursive: true });
const test = async (name, fn) => {
  try {
    await fn();
    count++;
    console.log("PASS " + name);
  } catch (e) {
    failures.push(name + ": " + e.message);
    console.error("FAIL " + name + ": " + e.message);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({
      path: "test-artifacts/upgrades/fail-" + failures.length + ".png",
      fullPage: true,
    });
  }
};
const go = async (id) => {
  await page.goto(BASE + (id ? "/tools/" + id + "/" : "/"));
  await page.locator("h1").first().waitFor();
  await page
    .locator('[aria-label="Loading tool"]')
    .waitFor({ state: "hidden" });
};
const download = async (button) => {
  const pending = page.waitForEvent("download");
  await button.click();
  const file = await pending;
  return readFile(await file.path());
};
let png, jpg, signature, invoice;
try {
  await go("");
  png = Buffer.from(
    await page.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = 640;
      c.height = 480;
      const g = c.getContext("2d");
      g.fillStyle = "#fff";
      g.fillRect(0, 0, 640, 480);
      g.strokeStyle = "#123456";
      g.lineWidth = 7;
      g.beginPath();
      g.moveTo(100, 240);
      g.bezierCurveTo(120, 100, 300, 400, 500, 160);
      g.stroke();
      return c.toDataURL().split(",")[1];
    }),
    "base64",
  );
  jpg = Buffer.from(
    await page.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = 400;
      c.height = 400;
      const g = c.getContext("2d");
      g.fillStyle = "#ec9160";
      g.fillRect(0, 0, 400, 400);
      return c.toDataURL("image/jpeg").split(",")[1];
    }),
    "base64",
  );
  await test("search covers catalog, aliases, arrow + Enter, Escape and focus return", async () => {
    await page
      .getByRole("button", { name: "Search tools", exact: true })
      .first()
      .click();
    await page
      .getByRole("textbox", { name: "Search query" })
      .fill("redact pdf");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /True PDF Redactor/ })
      .first()
      .waitFor();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    assert.ok(page.url().includes("/tools/pdf-redaction-verify"));
    await page.keyboard.press("Control+k");
    await page.getByRole("textbox", { name: "Search query" }).fill("signture");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /Signature Pad/ })
      .waitFor();
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").count(), 0);
  });
  await test("homepage workbench routes a dropped image into a matching tool", async () => {
    await go("");
    await page.locator("input[type=file]").first().setInputFiles({ name: "scan.png", mimeType: "image/png", buffer: png });
    await page.getByText("Ready for scan.png").waitFor();
    await page.getByRole("button", { name: /Signature Pad/ }).click();
    await page.getByLabel(/Paper threshold/).waitFor();
    await page.getByText("Loaded scan.png.", { exact: false }).waitFor();
    assert.ok(!page.url().includes("handoff="));
    assert.equal(
      await page.evaluate(
        async () =>
          new Promise((ok) => {
            const q = indexedDB.open("toolatlas-handoffs", 1);
            q.onsuccess = () => {
              const d = q.result,
                r = d.transaction("files").objectStore("files").count();
              r.onsuccess = () => {
                ok(r.result);
                d.close();
              };
            };
          }),
      ),
      0,
    );
  });
  await test("signature draw exports real alpha PNG, auto-cropped", async () => {
    await go("signature-maker");
    const box = await page.getByTestId("signature-canvas").boundingBox();
    await page.mouse.move(box.x + 60, box.y + 80);
    await page.mouse.down();
    await page.mouse.move(box.x + 160, box.y + 140, { steps: 12 });
    await page.mouse.move(box.x + 290, box.y + 90, { steps: 12 });
    await page.mouse.up();
    signature = await download(
      page.getByRole("button", {
        name: "Download Transparent PNG",
        exact: true,
      }),
    );
    assert.equal(signature.subarray(1, 4).toString(), "PNG");
    await writeFile("test-artifacts/upgrades/signature.png", signature);
    const data = await page
      .getByRole("img", { name: "Cropped signature result" })
      .evaluate(async (im) => {
        await im.decode();
        const c = document.createElement("canvas");
        c.width = im.naturalWidth;
        c.height = im.naturalHeight;
        const g = c.getContext("2d");
        g.drawImage(im, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height).data;
        return {
          w: c.width,
          h: c.height,
          alpha: d[3],
          ink: Array.from(d).some((a, i) => i % 4 === 3 && a > 0),
        };
      });
    assert.ok(data.w < 900 && data.h < 300 && data.alpha === 0 && data.ink);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({
      path: "test-artifacts/upgrades/signature-desktop.png",
      fullPage: true,
    });
  });
  await test("uploaded signature threshold removes paper, preserves ink", async () => {
    await go("signature-maker");
    await page
      .locator("[data-workspace] input[type=file]")
      .setInputFiles({ name: "scan.png", mimeType: "image/png", buffer: png });
    await page.getByLabel(/Paper threshold/).waitFor();
    const bytes = await download(
      page.getByRole("button", { name: "Download Transparent PNG" }),
    );
    assert.ok(bytes.length > 100);
    const d = await page.getByTestId("signature-canvas").evaluate((c) => {
      const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      return {
        corner: d[3],
        hasInk: Array.from(d).some((v, i) => i % 4 === 3 && v > 128),
      };
    });
    assert.equal(d.corner, 0);
    assert.ok(d.hasInk);
  });
  await test("cross-tool output handoff to metadata tool", async () => {
    await download(
      page.getByRole("button", { name: "Download Transparent PNG" }),
    );
    await page.getByLabel("Send output to").selectOption("remove-exif");
    await page
      .getByRole("button", { name: "Send output to…", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Inspect & remove metadata", exact: true })
      .waitFor();
    await page
      .getByText("Loaded signature-transparent.png.", { exact: false })
      .waitFor();
    assert.ok(
      await page
        .getByRole("button", { name: "Inspect & remove metadata" })
        .isEnabled(),
    );
  });
  await test("TXT file drop reports no matching local tool after catalogue trim", async () => {
    await go("");
    await page.locator("input[type=file]").first().setInputFiles({
      name: "list.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(" apple \nAPPLE\n\nbanana\n"),
    });
    await page.getByText("Ready for list.txt").waitFor();
    await page
      .getByText("No local tool matches this file type yet.", { exact: false })
      .waitFor();
  });
  await test("bulk rename ZIP has renamed files and unchanged bytes", async () => {
    await go("bulk-renamer");
    await page.getByLabel("Choose files or ZIP").setInputFiles([
      { name: "one.txt", mimeType: "text/plain", buffer: Buffer.from("first") },
      {
        name: "two.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("second"),
      },
    ]);
    await page.getByText("renamed-one.txt", { exact: true }).waitFor();
    const bytes = await download(
      page.getByRole("button", { name: "Download renamed ZIP" }),
    );
    await writeFile("test-artifacts/upgrades/renamed.zip", bytes);
    assert.equal(bytes.readUInt32LE(0), 0x04034b50);
    assert.ok(
      bytes.includes(Buffer.from("renamed-one.txt")) &&
        bytes.includes(Buffer.from("first")),
    );
    await page
      .getByLabel("Choose files or ZIP")
      .setInputFiles({
        name: "renamed.zip",
        mimeType: "application/zip",
        buffer: bytes,
      });
    await page.getByText("renamed-renamed-one.txt", { exact: true }).waitFor();
  });
  await test("metadata reader sees and strips real EXIF, ZIP preserves clean files", async () => {
    await go("remove-exif");
    const exif = Buffer.from(
      "45786966000049492a000800000001000f010200060000001a0000000000000043616e6f6e00",
      "hex",
    );
    const head = Buffer.alloc(4);
    head.writeUInt16BE(0xffe1);
    head.writeUInt16BE(exif.length + 2, 2);
    const tagged = Buffer.concat([
      jpg.subarray(0, 2),
      head,
      exif,
      jpg.subarray(2),
    ]);
    await page
      .getByLabel("Choose photos")
      .setInputFiles({
        name: "camera.jpg",
        mimeType: "image/jpeg",
        buffer: tagged,
      });
    await page
      .getByLabel("Lossless JPEG stripping (may change displayed rotation)")
      .check();
    await page
      .getByRole("button", { name: "Inspect & remove metadata" })
      .click();
    await page.getByText("Canon", { exact: true }).waitFor();
    const clean = await download(
      page.getByRole("button", { name: "Download clean photo", exact: true }),
    );
    assert.ok(!clean.includes(Buffer.from("Canon")));
    assert.deepEqual(clean, jpg);
    const zip = await download(
      page.getByRole("button", { name: "Download all ZIP" }),
    );
    assert.equal(zip.readUInt32LE(0), 0x04034b50);
  });
  await test("curated homepage, new tools and light/dark phone layouts", async () => {
    for (const width of [360, 393, 1280]) {
      await page.setViewportSize({ width, height: width === 1280 ? 900 : 852 });
      await go("");
      await page.evaluate(() => document.fonts.ready);
      await page.getByText("Drop a PDF, photo, or CSV here").waitFor();
      for (const d of ["Portal & Print", "Privacy Shield & Local Files", "India Desk", "Clever Studio"])
        await page.getByRole("heading", { name: d, exact: true }).waitFor();
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        width + " home overflow",
      );
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: `test-artifacts/upgrades/home-${width}.png` });
      for (const id of ["signature-maker", "bulk-renamer", "remove-exif", "image-ocr", "file-converter", "doc-flatten-print", "pdf-redaction-verify", "cheque-overlay", "screenshot-mockup", "subscription-burn", "wifi-poster"]) {
        await go(id);
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
          width + " " + id + " overflow",
        );
      }
      const toLight = page.getByRole("button", { name: /Switch to light theme/ });
      if (await toLight.count()) await toLight.click();
      await go("");
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: `test-artifacts/upgrades/home-light-${width}.png` });
      const toDark = page.getByRole("button", { name: /Switch to dark theme/ });
      if (await toDark.count()) await toDark.click();
    }
  });
  await test("blocked localStorage does not break tools or personal controls", async () => {
    const c = await browser.newContext();
    await c.addInitScript(() => {
      Storage.prototype.getItem = () => {
        throw Error("denied");
      };
      Storage.prototype.setItem = () => {
        throw Error("denied");
      };
      Storage.prototype.removeItem = () => {
        throw Error("denied");
      };
    });
    const p = await c.newPage();
    await p.goto(BASE + "/tools/signature-maker/");
    await p.getByRole("button", { name: "Pin tool", exact: true }).click();
    await p.getByRole("button", { name: "Pinned", exact: true }).waitFor();
    assert.ok(await p.getByTestId("signature-canvas").isVisible());
    await c.close();
  });
  await test("complete-release offline caching supports curated tools", async () => {
    await go("");
    await page.evaluate(async () => await navigator.serviceWorker.ready);
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await ctx.setOffline(true);
    await go("signature-maker");
    assert.ok(await page.getByTestId("signature-canvas").isVisible());
    await go("wifi-poster");
    assert.ok(await page.getByRole("button", { name: /Download|Generate|Print/ }).first().isVisible());
    await ctx.setOffline(false);
  });
  assert.deepEqual(errors, [], "uncaught browser errors");
} finally {
  await browser.close();
  server?.kill();
  await writeFile(
    "test-artifacts/upgrades/report.json",
    JSON.stringify({ count, failures, errors }, null, 2),
  );
  console.log(JSON.stringify({ count, failures, errors }, null, 2));
}
if (failures.length) process.exitCode = 1;

