// Manual/local check of ON-DEVICE dictation in headless Chrome (not part of npm test: needs a ~79 MB model
// download). Serves the site locally with ?asr=ondevice (forces on-device mode, no localhost probe), uses
// Chrome's fake mic with a padded dev clip, and a persistent profile so the model downloads only once.
//   node tests/helpers/ondevice_check.mjs [url]
import puppeteer from "puppeteer-core";
import path from "node:path";
import { serve, CHROME, CHROME_ARGS, ROOT } from "./server.mjs";

const srv = process.argv[2] ? null : await serve();
const URL = process.argv[2] || `http://127.0.0.1:${srv.address().port}/?asr=ondevice`;
const wav = path.join(ROOT, "data/s0/dictation/short_01_pad.wav");
const b = await puppeteer.launch({ executablePath: CHROME, headless: true, protocolTimeout: 600000,

  args: [...CHROME_ARGS, "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${wav}`] });
const p = await b.newPage();
const logs = []; p.on("console", m => logs.push(`${m.type()}: ${m.text()}`)); p.on("pageerror", e => logs.push("pageerror: " + e.message));
await p.goto(URL, { waitUntil: "domcontentloaded" }); await new Promise(r => setTimeout(r, 1500));
await p.evaluate(() => { localStorage.setItem("htn-ui", "en"); localStorage.removeItem("htn-pin"); });
await p.reload({ waitUntil: "domcontentloaded" }); await new Promise(r => setTimeout(r, 1500));
await p.type("#pinInput", "4821"); await p.click("#btnPin");
await p.waitForSelector("#btnMic:not([hidden])", { timeout: 10000 });
console.log("mode:", await p.$eval("#speech", e => e.textContent), "| button:", await p.$eval("#btnMic", e => e.textContent));
let t = Date.now();
if (/Enable|Activer/.test(await p.$eval("#btnMic", e => e.textContent))) {
  await p.click("#btnMic");
  await p.waitForFunction(() => !/Downloading|Enable|Téléch|Activer/.test(document.getElementById("btnMic").textContent) && !document.getElementById("btnMic").disabled, { timeout: 600000 });
  console.log(`model ready in ${((Date.now() - t) / 1000).toFixed(0)} s; status: ${await p.$eval("#speech", e => e.textContent)}`);
}
t = Date.now();
await p.click("#btnMic"); await new Promise(r => setTimeout(r, 4000)); await p.click("#btnMic");
await p.waitForFunction(() => !document.getElementById("rawBox").hidden || /quiet|faible|could not/i.test(document.getElementById("speech").textContent), { timeout: 300000 });
console.log(`transcribed in ${((Date.now() - t) / 1000).toFixed(1)} s`);
console.log("raw:", await p.$eval("#rawLabel", e => e.textContent), await p.$eval("#rawText", e => e.textContent));
const fields = await p.$$eval(".field", fs => fs.map(f => [f.dataset.field, f.querySelector("select,input").value, f.classList.contains("check")]));
const derived = fields.filter(([k, v]) => v && v !== "not_mentioned" && !["patient_name", "phone", "visit_date"].includes(k));
console.log("derived fields:", derived.map(([k, v, c]) => `${k}=${v}${c ? "?" : " (NOT FLAGGED)"}`).join(" "));
console.log("all derived flagged:", derived.every(([, , c]) => c));
console.log("errors:", logs.filter(l => /error/i.test(l)).slice(0, 5));
await b.close(); srv?.close();
