// On-device dictation in AIRPLANE MODE: download the model once online, then go offline, reload, and dictate.
//   node tests/helpers/ondevice_offline_check.mjs <url>
import puppeteer, { KnownDevices } from "puppeteer-core";
import path from "node:path";
import { CHROME, CHROME_ARGS, ROOT } from "./server.mjs";
const URL = process.argv[2];
const wav = path.join(ROOT, "data/s0/dictation/short_14_pad.wav");
const b = await puppeteer.launch({ executablePath: CHROME, headless: true, protocolTimeout: 600000,
  args: [...CHROME_ARGS, "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${wav}`] });
const p = await b.newPage();
if (process.env.MOBILE) await p.emulate(KnownDevices["Pixel 5"]); // mobile viewport, touch, user agent
const unlock = async () => { await p.type("#pinInput", "4821"); await p.click("#btnPin"); await p.waitForSelector("#btnMic:not([hidden])", { timeout: 15000 }); };
await p.goto(URL, { waitUntil: "domcontentloaded" }); await new Promise(r => setTimeout(r, 2000));
await p.evaluate(() => localStorage.setItem("htn-ui", "en"));
await unlock();
await p.click("#btnMic"); // one-time download
await p.waitForFunction(() => /Dictate/.test(document.getElementById("btnMic").textContent) && !document.getElementById("btnMic").disabled, { timeout: 600000 });
await p.click("#btnMic"); await new Promise(r => setTimeout(r, 4000)); await p.click("#btnMic"); // warm the wasm runtime into the SW cache
await p.waitForFunction(() => !document.getElementById("rawBox").hidden, { timeout: 300000 });
console.log("online:", await p.$eval("#rawText", e => e.textContent));
await p.setOfflineMode(true);
await p.reload({ waitUntil: "domcontentloaded" }); await new Promise(r => setTimeout(r, 2500));
await unlock();
console.log("offline button:", await p.$eval("#btnMic", e => e.textContent));
const t = Date.now();
await p.click("#btnMic"); await new Promise(r => setTimeout(r, 4000)); await p.click("#btnMic");
await p.waitForFunction(() => !document.getElementById("rawBox").hidden || /could not|n'a pas/i.test(document.getElementById("speech").textContent), { timeout: 300000 });
console.log(`OFFLINE (${((Date.now() - t) / 1000).toFixed(0)} s):`, await p.$eval("#rawText", e => e.textContent).catch(() => "-"), "|", await p.$eval("#speech", e => e.textContent));
console.log("fields:", await p.$$eval(".field", fs => fs.filter(f => ["sex", "age"].includes(f.dataset.field)).map(f => `${f.dataset.field}=${f.querySelector("select,input").value}${f.classList.contains("check") ? "?" : ""}`).join(" ")));
await b.close();
