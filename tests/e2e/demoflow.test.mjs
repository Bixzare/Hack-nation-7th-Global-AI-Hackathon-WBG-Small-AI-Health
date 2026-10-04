// The on-camera demo flow, exactly as clicked (local build AND live site):
// sample 1 -> Fill record -> OK on each "please check" -> ticks -> Approve -> toast -> Noor's phone -> reset.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import { serve, CHROME, CHROME_ARGS } from "../helpers/server.mjs";

const LIVE = process.env.LIVE_URL || "https://bixzare.github.io/Hack-nation-7th-Global-AI-Hackathon-WBG-Small-AI-Health/";
const WD = { 0: "Sunday", 1: "Monday", 2: "Tuesday", 3: "Wednesday", 4: "Thursday", 5: "Friday", 6: "Saturday" };

function suite(name, getUrl, viewport) {
  describe(name, { skip: !CHROME && "Chrome not found" }, () => {
    let browser, page;
    const errors = [];
    const sample = async i => {
      await page.$eval("#samplesBox", e => (e.open = true));
      await page.waitForFunction(() => document.querySelectorAll("#samples button").length >= 4);
      await page.evaluate(i => document.querySelectorAll("#samples button")[i].click(), i);
      await page.click("#btnFill"); await page.waitForSelector(".field");
    };
    const okAll = async () => { for (let k = 0; k < 40; k++) { const b = await page.$(".field button.confirm:not([hidden])"); if (!b) break; await b.click(); } };
    const ticks = async () => { for (const id of ["#consent", "#dangerAsked"]) if (!(await page.$eval(id, e => e.checked))) await page.click(id); };

    before(async () => {
      browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: CHROME_ARGS });
      page = await browser.newPage();
      await page.setViewport(viewport);
      page.on("pageerror", e => errors.push(e.message));
      await page.goto(getUrl(), { waitUntil: "networkidle0" });
      await page.evaluate(() => { try { localStorage.setItem("htn-ui", "en"); } catch {} });
      await page.reload({ waitUntil: "networkidle0" });
      await page.type("#pinInput", "4821"); await page.click("#btnPin");
    });
    after(async () => browser && browser.close());

    test("sample 1, nothing typed: Approve -> toast with weekday 18:30 -> Noor's phone shows the reminder -> form resets", async () => {
      await sample(0);
      assert.equal(await page.$eval('[data-field="patient_name"] input', e => e.value), "Noor — synthetic", "demo patient auto-filled");
      assert.ok(await page.$eval('[data-field="phone"] input', e => e.value), "demo phone auto-filled");
      await okAll(); await ticks();
      await page.click("#btnApprove");
      await page.waitForSelector("#toast:not([hidden])", { timeout: 5000 });
      const visit = new Date(); visit.setDate(visit.getDate() + 14);
      const toastText = await page.$eval("#toast", e => e.textContent);
      assert.match(toastText, new RegExp(`Visit saved · Reminder queued for ${WD[visit.getDay()]} 18:30`));
      const noor = await page.$eval("#noorInbox", e => e.innerText);
      assert.match(noor, /Voice message \(Zarma\)/); assert.match(noor, /Rappel : RDV/);
      assert.ok(await page.$("#noorInbox button"), "▶ Play");
      assert.match(await page.$eval("#noorSim", e => e.textContent), /Simulated delivery — evening before visit/);
      await new Promise(r => setTimeout(r, 3400));
      assert.equal(await page.$eval("#toast", e => e.hidden), true, "toast gone after ~3 s");
      assert.equal(await page.$eval("#recordBox", e => e.hidden), true, "form reset");
      assert.equal(await page.$eval("#note", e => e.value), "");
      assert.equal(await page.$eval("#consent", e => e.checked), false);
      assert.equal(await page.$eval("#pinGate", e => e.hidden), true, "PIN session stays unlocked");
      assert.match(await page.$eval("#noorInbox", e => e.innerText), /Rappel : RDV/, "Noor's phone keeps the last reminder");
    });

    test("referral sample: toast explains why there is no reminder; 'New visit' resets at once", async () => {
      await sample(1); await okAll(); await ticks();
      await page.click("#btnApprove");
      await page.waitForSelector("#toast:not([hidden])", { timeout: 5000 });
      assert.match(await page.$eval("#toast", e => e.textContent), /Saved · no reminder: patient referred today/);
      await page.click("#toast button");
      assert.equal(await page.$eval("#toast", e => e.hidden), true);
      assert.match(await page.$eval("#noorInbox", e => e.innerText), /Rappel : RDV/, "still shows the last reminder (sample 1)");
    });

    test("typed note without a phone: toast says 'no phone number'", async () => {
      await page.$eval("#note", e => { e.value = "Femme 50 ans, tension 150 sur 95, pas de plaintes, revoir dans un mois."; delete e.dataset.source; });
      await page.click("#btnFill"); await page.waitForSelector(".field");
      await page.evaluate(() => { const i = document.querySelector('[data-field="patient_name"] input'); i.value = "Typed (synthetic)"; i.dispatchEvent(new Event("change")); });
      await okAll(); await ticks();
      await page.click("#btnApprove");
      await page.waitForSelector("#toast:not([hidden])", { timeout: 5000 });
      assert.match(await page.$eval("#toast", e => e.textContent), /no reminder: no phone number/);
    });

    test("no page errors", () => assert.deepEqual(errors, []));
  });
}

let server;
before(async () => { server = await serve(); });
after(() => server?.close());
suite("demo flow: local, mobile", () => `http://127.0.0.1:${server.address().port}/`, { width: 400, height: 860 });
suite("demo flow: local, desktop", () => `http://127.0.0.1:${server.address().port}/`, { width: 1280, height: 900 });
if (!process.env.NO_LIVE) {
  suite("demo flow: LIVE, mobile", () => LIVE, { width: 400, height: 860 });
  suite("demo flow: LIVE, desktop", () => LIVE, { width: 1280, height: 900 });
}
