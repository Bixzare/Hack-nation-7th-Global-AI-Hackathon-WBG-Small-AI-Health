// End-to-end demo path in headless Chrome, against the local build AND the live GitHub Pages site:
// PIN -> sample dictation -> record -> flags -> danger-signs confirmation -> approve -> reminder queued
// -> offline reload -> missed follow-up list. Plus: approval blocked without BP until "not measured" + reason.
// Env: CHROME (path), LIVE_URL (default: Pages), NO_LIVE=1 to skip the live run, SHOTS=dir to save screenshots.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WEB = path.join(ROOT, "app/web");
const CHROME = process.env.CHROME || ["C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome"].find(p => fs.existsSync(p));
const LIVE = process.env.LIVE_URL || "https://bixzare.github.io/Hack-nation-7th-Global-AI-Hackathon-WBG-Small-AI-Health/";
const SHOTS = process.env.SHOTS;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".css": "text/css",
  ".mp3": "audio/mpeg", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json", ".png": "image/png" };

function serve() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
      if (p.endsWith("/")) p += "index.html";
      const f = path.join(WEB, p);
      if (!f.startsWith(WEB) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" });
      fs.createReadStream(f).pipe(res);
    }).listen(0, "127.0.0.1", () => resolve(srv));
  });
}

async function shot(page, name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}

async function setField(page, key, value) {
  await page.evaluate((key, value) => {
    const i = document.querySelector(`[data-field="${key}"] select, [data-field="${key}"] input`);
    i.value = value; i.dispatchEvent(new Event("change"));
  }, key, value);
}

async function confirmAll(page) {
  for (let k = 0; k < 40; k++) { const b = await page.$(".field button.confirm:not([hidden])"); if (!b) break; await b.click(); }
}

function suite(name, getUrl) {
  describe(name, { skip: !CHROME && "Chrome not found" }, () => {
    let browser, page, errors = [];
    before(async () => {
      browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
      page = await browser.newPage();
      await page.setViewport({ width: 400, height: 860, deviceScaleFactor: 1 });
      page.on("pageerror", e => errors.push(e.message));
      page.on("console", m => { if (m.type() === "error" && !/ERR_INTERNET_DISCONNECTED|ERR_CONNECTION_REFUSED/.test(m.text())) errors.push(m.text()); });
      await page.goto(getUrl(), { waitUntil: "networkidle0" });
    });
    after(async () => browser && browser.close());

    test("PIN gate opens the app", async () => {
      await shot(page, "01-pin");
      await page.type("#pinInput", "4821");
      await page.click("#btnPin");
      assert.equal(await page.$eval("#appBody", e => e.hidden), false);
    });

    test("sample dictation fills the record; speech BP is 'please check'", async () => {
      await page.click("#samplesTitle");
      const samples = await page.$$("#samples button");
      assert.ok(samples.length >= 4, "4 samples");
      await samples[0].click(); // woman 38, follow-up in 2 weeks
      await page.click("#btnFill");
      await page.waitForSelector(".field");
      await shot(page, "02-record");
      const bp = await page.$eval('[data-field="bp1_sys"]', e => ({ v: e.querySelector("input").value, check: e.classList.contains("check") }));
      assert.equal(bp.v, "162"); assert.equal(bp.check, true);
    });

    test("flags shown; danger-sign tap resolves (not deletes) the screening flag", async () => {
      await setField(page, "patient_name", "Noor (synthetic)");
      await setField(page, "phone", "+227 90 00 00 00");
      await confirmAll(page);
      await page.click("#consent");
      assert.equal(await page.$eval("#btnApprove", b => b.disabled), true, "approve locked before danger-signs tap");
      await page.click("#dangerAsked");
      const resolved = await page.$$eval("#flags .flag.resolved", l => l.length);
      assert.ok(resolved >= 1, "resolved screening flag is still visible");
      await shot(page, "03-flags");
      assert.equal(await page.$eval("#btnApprove", b => b.disabled), false);
    });

    test("approve queues the Zarma voice reminder + French SMS for the evening before", async () => {
      await page.click("#btnApprove");
      await new Promise(r => setTimeout(r, 600));
      const outbox = await page.$eval("#outbox", e => e.innerText);
      assert.match(outbox, /intro \+ \w{3} \+ clinic/);
      assert.match(outbox, /18:30/);
      assert.match(outbox, /SMS/);
      await shot(page, "04-reminder");
    });

    test("no BP: approval locked until 'not measured' + reason", async () => {
      await page.$eval("#note", e => { e.value = "Homme 50 ans, pas de plaintes, sous amlodipine, bonne observance, RDV dans 1 mois."; delete e.dataset.source; });
      await page.click("#btnFill");
      await page.waitForSelector(".field");
      await setField(page, "patient_name", "Ali (synthetic)");
      await confirmAll(page);
      await page.click("#consent"); await page.click("#dangerAsked");
      assert.equal(await page.$eval("#btnApprove", b => b.disabled), true, "locked without BP");
      await page.click("#bpNotMeasured");
      await page.select("#bpReason", "device_unavailable");
      assert.equal(await page.$eval("#btnApprove", b => b.disabled), false, "unlocked with reason");
      await page.click("#btnApprove");
    });

    test("missed follow-up list (synthetic history)", async () => {
      await page.click("#btnDemoHistory");
      await new Promise(r => setTimeout(r, 500));
      assert.match(await page.$eval("#missed", e => e.innerText), /Aïssa/);
      await shot(page, "05-missed");
    });

    test("offline reload keeps app, records and outbox", async () => {
      await page.setOfflineMode(true);
      await page.reload({ waitUntil: "domcontentloaded" });
      await new Promise(r => setTimeout(r, 800));
      assert.ok((await page.$eval("#title", e => e.textContent)).length > 0);
      await page.type("#pinInput", "4821"); await page.click("#btnPin");
      await new Promise(r => setTimeout(r, 400));
      assert.match(await page.$eval("#saved", e => e.innerText), /Noor/);
      assert.match(await page.$eval("#outbox", e => e.innerText), /18:30/);
      await shot(page, "06-offline");
      await page.setOfflineMode(false);
    });

    test("no console errors", () => assert.deepEqual(errors, []));
  });
}

let server;
before(async () => { server = await serve(); });
after(() => server?.close());
suite("e2e: local build", () => `http://127.0.0.1:${server.address().port}/`);
if (!process.env.NO_LIVE) suite("e2e: live GitHub Pages", () => LIVE);
