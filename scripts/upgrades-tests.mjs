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
      .fill("shrink pdf");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /Compress PDF|PDF Compressor/ })
      .first()
      .waitFor();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    assert.ok(page.url().includes("/tools/pdf-"));
    await page.keyboard.press("Control+k");
    await page.getByRole("textbox", { name: "Search query" }).fill("signture");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /Signature Pad/ })
      .waitFor();
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").count(), 0);
  });
  await test("pin/recent strip, six-item history, unpin and clear", async () => {
    await go("signature-maker");
    await page.getByRole("button", { name: "Pin tool", exact: true }).click();
    for (const id of [
      "list-cleaner",
      "split-bill",
      "fuel-cost",
      "bulk-renamer",
      "id-photo-maker",
      "remove-exif",
      "invoice-generator",
    ])
      await go(id);
    await go("");
    const strip = page.getByRole("region", { name: "Pinned and recent tools" });
    assert.ok(await strip.isVisible());
    assert.equal(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem("toolatlas:recents")).length,
      ),
      6,
    );
    await strip
      .getByRole("button", { name: "Unpin Signature Pad & Transparent PNG" })
      .click();
    await strip
      .getByRole("button", { name: "Clear history", exact: true })
      .click();
    assert.equal(await strip.count(), 0);
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
  await test("homepage file routing auto-loads image and clears IndexedDB entry", async () => {
    await go("");
    await page
      .getByLabel("Choose a file to find tools")
      .setInputFiles({ name: "scan.png", mimeType: "image/png", buffer: png });
    await page
      .getByRole("region", { name: "Find tools for a file" })
      .getByRole("button", { name: "Signature Pad & Transparent PNG" })
      .click();
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
  await test("TXT file routing into cleaner, cleanup counts and CSV safe export", async () => {
    await go("");
    await page
      .getByLabel("Choose a file to find tools")
      .setInputFiles({
        name: "list.txt",
        mimeType: "text/plain",
        buffer: Buffer.from(" apple \nAPPLE\n\nbanana\n=1+1"),
      });
    await page
      .getByRole("region", { name: "Find tools for a file" })
      .getByRole("button", { name: "List Cleaner & Deduplicator" })
      .click();
    await page.getByLabel("List input").waitFor();
    await page.waitForFunction(() =>
      document.querySelector("textarea")?.value.includes("=1+1"),
    );
    assert.ok(
      (await page.getByTestId("cleaned-list").innerText()).includes("banana"),
    );
    assert.ok(
      (await page.getByRole("status").last().innerText()).includes(
        "Duplicates removed: 1",
      ),
    );
    const bytes = await download(
      page.getByRole("button", { name: "Download CSV" }),
    );
    assert.ok(bytes.toString().includes("'="));
  });
  await test("JSON routing auto-loads text input", async () => {
    await go("");
    await page
      .getByLabel("Choose a file to find tools")
      .setInputFiles({
        name: "example.json",
        mimeType: "application/json",
        buffer: Buffer.from('{"handoffCheck":123}'),
      });
    await page
      .getByRole("region", { name: "Find tools for a file" })
      .getByRole("button", { name: "JSON Formatter" })
      .click();
    await page.waitForFunction(() =>
      document.querySelector("textarea")?.value.includes("handoffCheck"),
    );
  });
  await test("invoice per-line tax, quotation, logo and generated real A4 PDF", async () => {
    await go("invoice-generator");
    await page
      .getByLabel("Your business", { exact: true })
      .fill("Batra Studio\nLudhiana, Punjab");
    await page
      .getByLabel("Bill to", { exact: true })
      .fill("Example Client\nNew Delhi");
    await page.getByLabel("Tax (%)", { exact: true }).fill("18");
    await page.getByLabel("Document type").selectOption("Quotation");
    await page
      .getByLabel("Logo (PNG / JPG)")
      .setInputFiles({ name: "logo.jpg", mimeType: "image/jpeg", buffer: jpg });
    assert.ok(
      (
        await page.getByRole("region", { name: "Invoice preview" }).innerText()
      ).includes("1,180.00"),
    );
    invoice = await download(
      page.getByRole("button", { name: "Download A4 PDF", exact: true }),
    );
    await writeFile("test-artifacts/upgrades/invoice.pdf", invoice);
    const doc = await PDFDocument.load(invoice);
    assert.equal(doc.getPageCount(), 1);
    assert.ok(Math.abs(doc.getPage(0).getWidth() - 595.28) < 0.1);
    assert.ok(Math.abs(doc.getPage(0).getHeight() - 841.89) < 0.1);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({
      path: "test-artifacts/upgrades/invoice-desktop.png",
      fullPage: true,
    });
    await page.getByLabel("Auto-save sender details in this browser").check();
    await page.reload();
    await page.getByLabel("Your business", { exact: true }).waitFor();
    assert.ok(
      (
        await page.getByLabel("Your business", { exact: true }).inputValue()
      ).includes("Batra Studio"),
    );
    await page.getByLabel("Auto-save sender details in this browser").uncheck();
    assert.equal(
      await page.evaluate(() =>
        localStorage.getItem("toolatlas:invoice-sender"),
      ),
      null,
    );
  });
  await test("invoice multi-page pagination, tax and currency validation", async () => {
    await go("invoice-generator");
    for (let i = 0; i < 25; i++) {
      if (i > 0)
        await page
          .getByRole("button", { name: "Add item", exact: true })
          .click();
      await page
        .getByLabel(`name ${i + 1}`, { exact: true })
        .fill(
          "Design and production service " +
            i +
            " with a longer wrapped description.",
        );
    }
    const bytes = await download(
      page.getByRole("button", { name: "Download A4 PDF", exact: true }),
    );
    assert.ok((await PDFDocument.load(bytes)).getPageCount() >= 2);
    await writeFile("test-artifacts/upgrades/invoice-multi.pdf", bytes);
    await page.getByLabel("Tax (%)", { exact: true }).fill("101");
    assert.ok(
      await page
        .getByRole("button", { name: "Download A4 PDF", exact: true })
        .isDisabled(),
    );
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
  await test("ID photo exact US preset, A4/4x6 PDF size and guide-free export", async () => {
    await go("id-photo-maker");
    await page
      .getByLabel("Upload portrait")
      .setInputFiles({
        name: "portrait.jpg",
        mimeType: "image/jpeg",
        buffer: jpg,
      });
    await page.getByTestId("id-photo-canvas").waitFor();
    await page.getByLabel("Photo preset").selectOption("us");
    await page.getByText("600 × 600 pixels", { exact: false }).waitFor();
    const bytes = await download(
      page.getByRole("button", { name: "Download sheet PDF" }),
    );
    const doc = await PDFDocument.load(bytes);
    assert.ok(Math.abs(doc.getPage(0).getWidth() - 288) < 0.1);
    assert.ok(Math.abs(doc.getPage(0).getHeight() - 432) < 0.1);
    await writeFile("test-artifacts/upgrades/id-sheet.pdf", bytes);
    await page.getByLabel("Print paper").selectOption("a4");
    const a4 = await download(
      page.getByRole("button", { name: "Download sheet PDF" }),
    );
    assert.ok(
      Math.abs((await PDFDocument.load(a4)).getPage(0).getWidth() - 595.2756) <
        0.1,
    );
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
  await test("split bill participants and exact settlements", async () => {
    await go("split-bill");
    const text = await page.getByTestId("split-summary").innerText();
    assert.ok(text.includes("1800.00") && text.includes("1 payment(s)"));
    await page.getByLabel("Amount 2", { exact: true }).fill("1200");
    assert.ok(
      (await page.getByTestId("split-summary").innerText()).includes("2400.00"),
    );
    const checks = page.locator("fieldset").first().getByRole("checkbox");
    await checks.nth(2).uncheck();
    assert.ok(
      (await page.getByTestId("split-summary").innerText()).includes("2400.00"),
    );
  });
  await test("fuel roundtrip, units, driver split and saved vehicle", async () => {
    await go("fuel-cost");
    await page.getByLabel("Trip type").selectOption("round");
    assert.ok(
      (await page.getByTestId("utility-result").innerText()).includes("40.00"),
    );
    await page.getByLabel("Exclude driver from split").check();
    assert.ok(
      (await page.getByTestId("utility-result").innerText()).includes(
        "2,000.00",
      ),
    );
    await page.getByLabel("Units", { exact: true }).selectOption("ev");
    await page.getByLabel("Energy use (kWh/100 km)").fill("20");
    assert.ok(
      (await page.getByTestId("utility-result").innerText()).includes("120.00"),
    );
    await page.getByLabel("Save vehicle name").fill("Family EV");
    await page
      .getByRole("button", { name: "Save Vehicle", exact: true })
      .click();
    await page.reload();
    await page.getByLabel("Saved vehicle preset").selectOption("0");
    assert.equal(
      await page.getByLabel("Units", { exact: true }).inputValue(),
      "ev",
    );
    assert.equal(
      await page.getByLabel("Energy use (kWh/100 km)").inputValue(),
      "20",
    );
  });
  await test("URL state is opt-in and restores calculator input", async () => {
    await go("fuel-cost");
    assert.equal(new URL(page.url()).hash, "");
    await page.getByLabel("Trip distance (km)", { exact: true }).fill("123");
    assert.equal(new URL(page.url()).hash, "");
    await page
      .getByLabel(
        "Keep inputs in shareable URL (visible to anyone with the link)",
      )
      .check();
    await page.waitForFunction(() => location.hash.startsWith("#state="));
    await page.getByLabel("Trip distance (km)", { exact: true }).fill("456");
    await page.reload();
    await page.getByLabel("Trip distance (km)", { exact: true }).waitFor();
    await page.waitForFunction(
      () =>
        document.querySelector('input[aria-label="Trip distance (km)"]')
          ?.value === "456",
    );
    await page
      .getByLabel(
        "Keep inputs in shareable URL (visible to anyone with the link)",
      )
      .uncheck();
    assert.equal(new URL(page.url()).hash, "");
  });
  await test("personal home/category visibility, new tools and light/dark phone layouts", async () => {
    for (const width of [360, 393, 1280]) {
      await page.setViewportSize({ width, height: width === 1280 ? 900 : 852 });
      await go("signature-maker");
      if (
        await page
          .getByRole("button", { name: "Pin tool", exact: true })
          .count()
      )
        await page
          .getByRole("button", { name: "Pin tool", exact: true })
          .click();
      await go("");
      await page.evaluate(() => document.fonts.ready);
      const bottom = await page
        .locator("[data-directory-category]")
        .last()
        .evaluate((e) => e.getBoundingClientRect().bottom);
      assert.ok(
        bottom < (width === 1280 ? 900 : 852),
        width + ": categories bottom " + bottom,
      );
      assert.ok(
        await page
          .getByRole("region", { name: "Find tools for a file" })
          .isVisible(),
      );
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({
        path: `test-artifacts/upgrades/home-${width}.png`,
      });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      await page
        .getByRole("button", { name: "Search tools", exact: true })
        .first()
        .click();
      await page
        .getByRole("textbox", { name: "Search query" })
        .fill("signature");
      await page
        .getByRole("dialog")
        .evaluate((e) => Promise.all(e.getAnimations().map((a) => a.finished)));
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({
        path: `test-artifacts/upgrades/search-${width}.png`,
      });
      await page.keyboard.press("Escape");
      for (const id of [
        "invoice-generator",
        "signature-maker",
        "bulk-renamer",
        "id-photo-maker",
        "remove-exif",
        "list-cleaner",
        "split-bill",
        "fuel-cost",
      ]) {
        await go(id);
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
          width + " " + id + " overflow",
        );
      }
      await page.getByRole("button", { name: /Switch to light theme/ }).click();
      await go("");
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({
        path: `test-artifacts/upgrades/home-light-${width}.png`,
      });
      await page.getByRole("button", { name: /Switch to dark theme/ }).click();
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
    await p.goto(BASE + "/tools/invoice-generator/");
    await p.getByRole("button", { name: "Pin tool", exact: true }).click();
    await p.getByRole("button", { name: "Pinned", exact: true }).waitFor();
    await p.getByLabel("Auto-save sender details in this browser").check();
    assert.ok(
      await p
        .getByRole("button", { name: "Download A4 PDF", exact: true })
        .isEnabled(),
    );
    await c.close();
  });
  await test("complete-release offline caching supports new tools and exports", async () => {
    await go("");
    await page.evaluate(async () => await navigator.serviceWorker.ready);
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await ctx.setOffline(true);
    await go("signature-maker");
    assert.ok(await page.getByTestId("signature-canvas").isVisible());
    await go("invoice-generator");
    const bytes = await download(
      page.getByRole("button", { name: "Download A4 PDF", exact: true }),
    );
    assert.equal((await PDFDocument.load(bytes)).getPageCount(), 1);
    await go("split-bill");
    assert.ok(
      (await page.getByTestId("split-summary").innerText()).includes("1800.00"),
    );
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
