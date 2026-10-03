// Screenshots of each demo step (desktop two-phone view + mobile) for review and for the video.
//   node tests/helpers/shots.mjs [url] [outdir]
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";
import { serve, CHROME, ROOT } from "./server.mjs";

const server = process.argv[2] ? null : await serve();
const URL = process.argv[2] || `http://127.0.0.1:${server.address().port}/`;
const OUT = process.argv[3] || path.join(ROOT, "docs/screens");
fs.mkdirSync(OUT, { recursive: true });
const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
for (const [tag, vp] of [["desktop", { width: 1280, height: 1000 }], ["mobile", { width: 400, height: 860 }]]) {
  const p = await b.newPage();
  await p.setViewport({ ...vp, deviceScaleFactor: 1.5 });
  await p.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
  await p.goto(URL, { waitUntil: "networkidle0" });
  await p.evaluate(() => { try { localStorage.setItem("htn-ui", "en"); } catch {} });
  await p.reload({ waitUntil: "networkidle0" });
  const snap = async (n, sel) => {
    if (sel) await p.$eval(sel, e => e.scrollIntoView({ block: "start" }));
    await new Promise(r => setTimeout(r, 250));
    await p.screenshot({ path: path.join(OUT, `${tag}-${n}.png`) });
  };
  await snap("1-pin");
  await p.type("#pinInput", "4821"); await p.click("#btnPin");
  await p.click("#samplesTitle"); await (await p.$$("#samples button"))[0].click();
  await snap("2-dictation", "#steps");
  await p.click("#btnFill"); await p.waitForSelector(".field");
  await p.$eval("#samplesBox", e => (e.open = false));
  await snap("3-flags", "#flagsTitle");
  await snap("4-review", "#step2Title");
  const set = (k, v) => p.evaluate((k, v) => { const i = document.querySelector(`[data-field="${k}"] input`); i.value = v; i.dispatchEvent(new Event("change")); }, k, v);
  await set("patient_name", "Noor (synthetic)"); await set("phone", "+227 90 00 00 00");
  for (let k = 0; k < 40; k++) { const c = await p.$(".field button.confirm:not([hidden])"); if (!c) break; await c.click(); }
  await p.click("#consent"); await p.click("#dangerAsked");
  await snap("5-approve", "#step3Title");
  await p.click("#btnApprove"); await new Promise(r => setTimeout(r, 600));
  await snap("6-reminder", "#outboxTitle");
  await p.click("#btnDemoHistory"); await new Promise(r => setTimeout(r, 400));
  await snap("7-missed", "#missedTitle");
  await p.setOfflineMode(true); await p.reload({ waitUntil: "domcontentloaded" }); await new Promise(r => setTimeout(r, 800));
  await p.type("#pinInput", "4821"); await p.click("#btnPin"); await new Promise(r => setTimeout(r, 400));
  await snap("8-offline", "#outboxTitle");
  await p.close();
}
await b.close(); server?.close();
console.log("screenshots in", OUT);
