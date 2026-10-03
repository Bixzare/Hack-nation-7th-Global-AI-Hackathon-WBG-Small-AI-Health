// Real browser-microphone path: Chrome fake mic plays a WAV -> MediaRecorder (webm/opus) -> POST to the
// local speech service -> raw transcript shown -> record auto-filled. Uses gold DEV clips only.
// Skipped unless the speech service answers on 127.0.0.1:8765 and the dev phrases exist (data/ is gitignored).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { serve, CHROME, ROOT } from "../helpers/server.mjs";

const DIR = path.join(ROOT, "data/s0/dictation");
let up = false;
try { up = (await fetch("http://127.0.0.1:8765/health")).ok; } catch {}
const have = fs.existsSync(path.join(DIR, "short_01.wav"));

async function dictate(wav, seconds) {
  const server = await serve(8080 + Math.floor(Math.random() * 900)); // localhost page => mic button enabled
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: [
    "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${wav}`] });
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "networkidle0" });
    await page.type("#pinInput", "4821"); await page.click("#btnPin");
    await page.waitForSelector("#btnMic:not([hidden])", { timeout: 5000 });
    await page.click("#btnMic");
    await new Promise(r => setTimeout(r, seconds * 1000));
    await page.click("#btnMic");
    await page.waitForFunction(() => !document.getElementById("rawBox").hidden, { timeout: 60000 });
    const raw = await page.$eval("#rawText", e => e.textContent);
    const filled = await page.$$eval(".field", f => f.length);
    const get = k => page.$eval(`[data-field="${k}"]`, e => e.querySelector("select,input").value).catch(() => null);
    return { raw, filled, sex: await get("sex"), age: await get("age") };
  } finally { await browser.close(); server.close(); }
}

describe("browser microphone -> local Whisper -> record", { skip: (!up && "speech service not running") || (!have && "dev phrases not built") || (!CHROME && "no Chrome") }, () => {
  test("'Femme, 38 ans' (dev clip 1, first 2.5 s)", async () => {
    const r = await dictate(path.join(DIR, "short_01.wav"), 3);
    assert.ok(r.raw.length > 3, `raw transcript: ${r.raw}`);
    assert.equal(r.sex, "F"); assert.equal(r.age, "38");
  });
  test("'Homme, 36 ans' (dev clip 14, first 2.5 s)", async () => {
    const r = await dictate(path.join(DIR, "short_14.wav"), 3);
    assert.equal(r.sex, "M", `raw: ${r.raw}`); assert.equal(r.age, "36");
  });
  test("silence produces no text and no record", async () => {
    const r = await dictate(path.join(DIR, "silence.wav"), 3);
    assert.equal(r.filled, 0, `raw on silence: ${r.raw}`);
  });
});
