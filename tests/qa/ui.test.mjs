// QA: the whole app top to bottom in headless Chrome, against the local build AND the live site.
// Every demo phrase typed into the UI, plus the interactions a demo (or a judge) will try.
// Env: CHROME, LIVE_URL, NO_LIVE=1 (skip live), as in tests/e2e.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { serve, CHROME, CHROME_ARGS, ROOT } from "../helpers/server.mjs";

const LIVE = process.env.LIVE_URL || "https://bixzare.github.io/Hack-nation-7th-Global-AI-Hackathon-WBG-Small-AI-Health/";
const EN = JSON.parse(fs.readFileSync(path.join(ROOT, "app/web/locales/en.json"), "utf8"));
const FR = JSON.parse(fs.readFileSync(path.join(ROOT, "app/web/locales/fr.json"), "utf8"));
const { phrases } = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/qa/demo_phrases.json"), "utf8"));
const byId = Object.fromEntries(phrases.map(p => [p.id, p]));
const WD = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const flagText = code => EN["flag." + code];

function suite(name, getUrl) {
  describe(name, { skip: !CHROME && "Chrome not found" }, () => {
    let browser, page;
    const errors = [];
    const fill = async text => {
      await page.$eval("#note", (e, v) => { e.value = v; delete e.dataset.source; }, text);
      await page.click("#btnFill");
      await page.waitForSelector(".field");
    };
    const val = k => page.$eval(`[data-field="${k}"]`, e => e.querySelector("select,input").value);
    const isCheck = k => page.$eval(`[data-field="${k}"]`, e => e.classList.contains("check"));
    const setField = (k, v) => page.evaluate((k, v) => { const i = document.querySelector(`[data-field="${k}"] select, [data-field="${k}"] input`); i.value = v; i.dispatchEvent(new Event("change")); }, k, v);
    const flags = () => page.$$eval("#flags .flag", ls => ls.map(l => ({ level: [...l.classList].find(c => c !== "flag"), text: l.querySelector(".txt")?.textContent })));
    const confirmAll = async () => { for (let k = 0; k < 40; k++) { const b = await page.$(".field button.confirm:not([hidden])"); if (!b) break; await b.click(); } };
    const outboxCount = () => page.$$eval("#outbox .msg", m => m.length);
    const tick = async id => { if (!(await page.$eval(id, e => e.checked))) await page.click(id); };
    const approveReady = () => page.$eval("#btnApprove", b => !b.disabled);

    before(async () => {
      browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: CHROME_ARGS });
      page = await browser.newPage();
      await page.setViewport({ width: 400, height: 860 });
      page.on("pageerror", e => errors.push(e.message));
      page.on("console", m => { if (m.type() === "error" && !/ERR_INTERNET_DISCONNECTED|ERR_CONNECTION_REFUSED|Failed to load resource/.test(m.text())) errors.push(m.text()); });
      await page.goto(getUrl(), { waitUntil: "networkidle0" });
      await page.evaluate(() => { try { localStorage.setItem("htn-ui", "en"); } catch {} });
      await page.reload({ waitUntil: "networkidle0" });
    });
    after(async () => browser && browser.close());

    test("PIN: short PIN refused, PIN set, wrong PIN refused after lock, right PIN unlocks", async () => {
      await page.type("#pinInput", "12"); await page.click("#btnPin");
      assert.equal(await page.$eval("#appBody", e => e.hidden), true);
      await page.$eval("#pinInput", e => (e.value = "")); await page.type("#pinInput", "4821"); await page.click("#btnPin");
      assert.equal(await page.$eval("#appBody", e => e.hidden), false);
      await page.click("#btnLock");
      assert.equal(await page.$eval("#appBody", e => e.hidden), true, "lock hides the records");
      await page.type("#pinInput", "0000"); await page.click("#btnPin");
      assert.equal(await page.$eval("#pinMsg", e => e.textContent), EN["pin.wrong"]);
      await page.$eval("#pinInput", e => (e.value = "")); await page.type("#pinInput", "4821"); await page.click("#btnPin");
      assert.equal(await page.$eval("#appBody", e => e.hidden), false);
    });

    for (const ph of phrases.filter(p => !p.todo)) {
      test(`phrase ${ph.id} through the UI: values, "please check", flag cards`, async () => {
        await fill(ph.text);
        for (const [k, v] of Object.entries(ph.expect)) assert.equal(await val(k), v == null ? "" : String(v), k);
        for (const k of ph.check || []) assert.equal(await isCheck(k), true, `${k} please check`);
        const shown = await flags();
        for (const c of ph.flags || []) assert.ok(shown.some(f => f.text === flagText(c)), `flag card ${c}`);
        for (const c of ph.noflags || []) assert.ok(!shown.some(f => f.text === flagText(c)), `no flag card ${c}`);
        if (ph.noGap) assert.deepEqual(shown.map(f => f.level), ["info"], "only the neutral NO GAP FOUND card");
        if ((ph.flags || []).some(c => c.startsWith("urgent"))) assert.ok(shown.some(f => f.level === "urgent"));
      });
    }

    test("on-device speech: missed danger symptom -> 'ask about danger signs' shown, approval blocked until ticked", async () => {
      await page.$eval("#note", e => { e.value = "Homme 58 ans, tension 172 sur 104, revoir dans deux semaines."; e.dataset.source = "speech-ondevice"; });
      await page.click("#btnFill"); await page.waitForSelector(".field");
      assert.equal(await isCheck("bp1_sys"), true); assert.equal(await isCheck("follow_up"), true, "every on-device speech field is please check");
      assert.equal(await val("headache"), "not_mentioned");
      assert.ok((await flags()).some(f => f.text === flagText("ask_danger_symptoms")), "screening prompt shown");
      await setField("patient_name", "QA on-device (synthetic)");
      await confirmAll(); await tick("#consent");
      assert.equal(await approveReady(), false, "blocked until the danger-signs confirmation is ticked");
      await tick("#dangerAsked");
      assert.equal(await approveReady(), true);
      for (const id of ["#consent", "#dangerAsked"]) await page.click(id); // leave the form as the next test expects
    });

    test("edit a value: flags recompute (controlled patient -> 185/100 + headache = URGENT)", async () => {
      await fill(byId["04-controlled"].text);
      assert.ok(!(await flags()).some(f => f.level === "urgent"));
      await setField("bp1_sys", "185"); await setField("bp1_dia", "100"); await setField("headache", "present");
      assert.ok((await flags()).some(f => f.text === flagText("urgent_bp_with_symptoms")));
    });

    test("approval gates: consent + danger-signs tick + confirmed fields required", async () => {
      await fill(byId["02-noor"].text);
      await setField("patient_name", "QA Noor (synthetic)"); await setField("phone", "+227 91 11 11 11");
      assert.equal(await approveReady(), false, "fields still to check");
      await confirmAll();
      assert.equal(await approveReady(), false, "consent missing");
      await tick("#consent");
      assert.equal(await approveReady(), false, "danger-signs tick missing");
      await tick("#dangerAsked");
      assert.ok((await flags()).some(f => f.level === "resolved"), "danger-sign flag resolved, still visible");
      assert.equal(await approveReady(), true);
    });

    test("language switch mid-review keeps what was entered", async () => {
      await page.evaluate(() => [...document.querySelectorAll("#lang button")].find(b => b.textContent === "FR").click());
      assert.equal(await page.$eval("#tagline", e => e.textContent), FR["app.tagline"]);
      assert.equal(await page.$eval("#title", e => e.textContent), "Movois");
      assert.equal(await val("patient_name"), "QA Noor (synthetic)");
      assert.equal(await val("bp1_sys"), "162");
      await page.evaluate(() => [...document.querySelectorAll("#lang button")].find(b => b.textContent === "EN").click());
      assert.equal(await val("phone"), "+227 91 11 11 11");
      assert.equal(await approveReady(), true, "ticks survive the switch");
    });

    test("approve -> reminders for the right day: visit = today + 2 weeks, sent 18:30 the evening before", async () => {
      const before = await outboxCount();
      await page.click("#btnApprove");
      await page.waitForFunction(n => document.querySelectorAll("#outbox .msg").length >= n + 2, { timeout: 15000 }, before);
      const visit = new Date(); visit.setHours(12, 0, 0, 0); visit.setDate(visit.getDate() + 14);
      const send = new Date(visit); send.setDate(send.getDate() - 1);
      const wd = WD[visit.getDay()];
      const box = await page.$eval("#outbox", e => e.innerText);
      assert.match(box, new RegExp(`intro \\+ ${wd} \\+ clinic`), "Zarma clip for the visit weekday");
      assert.match(box, new RegExp(FR["weekday." + wd]), "French SMS names the visit weekday");
      assert.match(box, /18:30/);
      const sendAt = await page.evaluate(async () => {
        const db = await new Promise(r => { const q = indexedDB.open("htn-recorder"); q.onsuccess = () => r(q.result); });
        return new Promise(r => { const q = db.transaction("outbox").objectStore("outbox").getAll(); q.onsuccess = () => r(q.result.at(-1)); });
      });
      assert.equal(sendAt.visit_date, ymd(visit)); assert.equal(sendAt.send_at, `${ymd(send)}T18:30`);
      const noor = await page.$eval("#noorInbox", e => e.innerText);
      assert.match(noor, new RegExp(FR["weekday." + wd]), "Noor's phone shows the SMS");
      assert.ok(await page.$("#noorInbox button"), "Noor's phone has a play button for the voice clip");
      assert.equal(await page.$eval("#steps .done:last-child", e => !!e).catch(() => false), true, "step 4 done");
    });

    test("referred patient: approved, but no reminder queued", async () => {
      const before = await outboxCount();
      await fill(byId["03-urgent"].text);
      await setField("patient_name", "QA referral (synthetic)"); await setField("phone", "+227 92 22 22 22");
      await confirmAll(); await tick("#consent"); await tick("#dangerAsked");
      assert.equal(await approveReady(), true);
      await page.click("#btnApprove"); await new Promise(r => setTimeout(r, 600));
      assert.equal(await outboxCount(), before);
    });

    test("no phone number: approved, but no reminder queued", async () => {
      const before = await outboxCount();
      await fill(byId["04-controlled"].text);
      await setField("patient_name", "QA no phone (synthetic)");
      await confirmAll(); await tick("#consent"); await tick("#dangerAsked");
      await page.click("#btnApprove"); await new Promise(r => setTimeout(r, 600));
      assert.equal(await outboxCount(), before);
    });

    test("BP not measured: 'other' needs a reason text; then approval allowed", async () => {
      await fill(byId["07-no-bp"].text);
      await setField("patient_name", "QA no BP (synthetic)");
      await confirmAll(); await tick("#consent"); await tick("#dangerAsked");
      assert.equal(await approveReady(), false, "no BP, no reason");
      await tick("#bpNotMeasured"); await page.select("#bpReason", "other");
      assert.equal(await approveReady(), false, "'other' without text");
      await page.type("#bpReasonOther", "cuff broken");
      assert.equal(await approveReady(), true);
      await page.click("#btnApprove");
    });

    test("empty note: nothing pre-filled, cannot approve", async () => {
      await fill("");
      assert.equal(await val("sex"), "unknown");
      await tick("#consent"); await tick("#dangerAsked");
      assert.equal(await approveReady(), false);
    });

    test("all 4 sample dictations fill without errors; the urgent one shows URGENT", async () => {
      await page.$eval("#samplesBox", e => (e.open = true));
      const n = await page.$$eval("#samples button", b => b.length);
      assert.equal(n, 4);
      for (let i = 0; i < n; i++) {
        await page.evaluate(i => document.querySelectorAll("#samples button")[i].click(), i); // no stale handles
        assert.equal(await page.$eval("#rawBox", e => e.hidden), false, "raw transcript shown");
        await page.click("#btnFill"); await page.waitForSelector(".field");
        assert.equal(await isCheck("bp1_sys"), true, "speech BP always please check");
        if (i === 1) assert.ok((await flags()).some(f => f.level === "urgent"));
      }
    });

    test("offline: evening send keeps reminders queued; back online: sent", async () => {
      await page.setOfflineMode(true);
      await page.evaluate(() => window.dispatchEvent(new Event("offline")));
      await page.click("#btnSend"); await new Promise(r => setTimeout(r, 400));
      assert.match(await page.$eval("#outbox", e => e.innerText), new RegExp(EN["outbox.offline"].slice(0, 20)));
      assert.doesNotMatch(await page.$eval("#outbox", e => e.innerText), new RegExp(EN["outbox.sent"].replace(/[()]/g, ".")));
      await page.setOfflineMode(false);
      await page.evaluate(() => window.dispatchEvent(new Event("online")));
      await page.click("#btnSend"); await new Promise(r => setTimeout(r, 600));
      assert.match(await page.$eval("#outbox", e => e.innerText), new RegExp(EN["outbox.sent"].replace(/[()]/g, ".")));
    });

    test("shared household phone: a relative's visit on Aïssa's phone does not hide her missed follow-up", async () => {
      await page.click("#btnDemoHistory"); await new Promise(r => setTimeout(r, 400));
      await fill(byId["04-controlled"].text);
      await setField("patient_name", "Relative of Aïssa (synthetic)"); await setField("phone", "+227 90 00 00 01");
      await confirmAll(); await tick("#consent"); await tick("#dangerAsked");
      await page.click("#btnApprove"); await new Promise(r => setTimeout(r, 600));
      assert.match(await page.$eval("#missed", e => e.innerText), /Aïssa/);
    });

    test("reload (online and offline): records, outbox and missed list persist", async () => {
      for (const offline of [false, true]) {
        await page.setOfflineMode(offline);
        await page.reload({ waitUntil: "domcontentloaded" }); await new Promise(r => setTimeout(r, 800));
        await page.type("#pinInput", "4821"); await page.click("#btnPin"); await new Promise(r => setTimeout(r, 500));
        const saved = await page.$eval("#saved", e => e.innerText);
        assert.match(saved, /QA Noor/); assert.match(saved, /QA no BP/);
        assert.match(await page.$eval("#missed", e => e.innerText), /Aïssa/);
        assert.ok((await outboxCount()) >= 2);
      }
      await page.setOfflineMode(false);
    });

    test("layout: no horizontal scroll at 360 px; desktop shows the two-device view", async () => {
      await page.setViewport({ width: 360, height: 780 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "no horizontal scroll at 360px");
      await page.setViewport({ width: 1280, height: 900 });
      const side = await page.evaluate(() => { const a = document.querySelector(".device.nurse").getBoundingClientRect(), b = document.querySelector(".device.basic").getBoundingClientRect(); return b.left > a.right - 1; });
      assert.ok(side, "Noor's phone is to the right of the nurse's phone");
      await page.setViewport({ width: 400, height: 860 });
    });

    test("demo labels stay visible: synthetic banner, precomputed-transcript label, airplane hint", async () => {
      assert.match(await page.$eval("#banner", e => e.textContent), /synthetic/i);
      assert.match(await page.$eval("#banner", e => e.textContent), /Movois/);
      assert.equal(await page.title(), "Movois: Speak the visit. Reach the patient.");
      assert.match(await page.$eval("#offlineHint", e => e.textContent), /airplane/i);
      assert.match(await page.$eval("#samples", e => e.textContent), /precomputed offline/i);
    });

    test("no console errors during the whole session", () => assert.deepEqual(errors, []));
  });
}

let server;
before(async () => { server = await serve(); });
after(() => server?.close());
suite("QA UI: local build", () => `http://127.0.0.1:${server.address().port}/`);
if (!process.env.NO_LIVE) suite("QA UI: live GitHub Pages", () => LIVE);
