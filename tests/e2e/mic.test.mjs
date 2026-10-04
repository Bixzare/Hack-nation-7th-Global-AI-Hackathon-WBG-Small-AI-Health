// Real browser-microphone path: Chrome fake mic plays a WAV -> MediaRecorder (webm/opus) -> POST to the
// local speech service -> raw transcript shown -> record auto-filled. Uses gold DEV clips only.
// Clips are padded with silence (*_pad.wav): Chrome's fake mic LOOPS the file, and an unpadded 2.5 s clip
// can be cut mid-word at the loop point (seen once as "38" -> "28"); a real microphone does not loop.
// LOCAL-ONLY: needs the local Whisper speech service, the gold dev audio (data/ is gitignored) and a
// microphone path. Always skipped in CI; also skipped locally unless the service answers on 127.0.0.1:8765.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { serve, CHROME, CHROME_ARGS, ROOT, IN_CI } from "../helpers/server.mjs";

const DIR = path.join(ROOT, "data/s0/dictation");
let up = false;
if (!IN_CI) try { up = (await fetch("http://127.0.0.1:8765/health", { signal: AbortSignal.timeout(1500) })).ok; } catch {}
const have = fs.existsSync(path.join(DIR, "short_01_pad.wav")); // built by speech/dictation_experiments.py + padding (see docs/log.md)

async function dictate(wav, seconds, expectQuiet = false) {
  const server = await serve(8080 + Math.floor(Math.random() * 900)); // localhost page => mic button enabled
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: [...CHROME_ARGS,
    "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${wav}`] });
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "networkidle0" });
    await page.type("#pinInput", "4821"); await page.click("#btnPin");
    await page.waitForSelector("#btnMic:not([hidden])", { timeout: 5000 });
    await page.click("#btnMic");
    await new Promise(r => setTimeout(r, seconds * 1000));
    await page.click("#btnMic");
    if (expectQuiet) {
      await new Promise(r => setTimeout(r, 800));
      return { raw: "", filled: await page.$$eval(".field", f => f.length), speech: await page.$eval("#speech", e => e.textContent) };
    }
    await page.waitForFunction(() => !document.getElementById("rawBox").hidden || /quiet|faible/i.test(document.getElementById("speech").textContent), { timeout: 60000 });
    const raw = await page.$eval("#rawText", e => e.textContent);
    const filled = await page.$$eval(".field", f => f.length);
    const get = k => page.$eval(`[data-field="${k}"]`, e => e.querySelector("select,input").value).catch(() => null);
    return { raw, filled, sex: await get("sex"), age: await get("age"), speech: await page.$eval("#speech", e => e.textContent) };
  } finally { await browser.close(); server.close(); }
}

describe("browser microphone -> local Whisper -> record (local-only)", { skip: (IN_CI && "local-only: needs the speech service, gold audio and a microphone path") || (!up && "speech service not running") || (!have && "dev phrases not built") || (!CHROME && "no Chrome") }, () => {
  test("'Femme, 38 ans' (dev clip 1, first 2.5 s)", async () => {
    const r = await dictate(path.join(DIR, "short_01_pad.wav"), 4);
    assert.ok(r.raw.length > 3, `raw transcript: ${r.raw}`);
    assert.equal(r.sex, "F"); assert.equal(r.age, "38");
  });
  test("'Homme, 36 ans' (dev clip 14, first 2.5 s)", async () => {
    const r = await dictate(path.join(DIR, "short_14_pad.wav"), 4);
    assert.equal(r.sex, "M", `raw: ${r.raw}`); assert.equal(r.age, "36");
  });
  test("phone far away (-30 dB): still 'Homme, 36' (browser gain + server loudness normalisation)", async () => {
    const r = await dictate(path.join(DIR, "far_14_pad.wav"), 4);
    assert.equal(r.sex, "M", `raw: ${r.raw}`); assert.equal(r.age, "36");
  });
  test("near-silent recording (-80 dB): 'too quiet' message, nothing sent, no record", async () => {
    const r = await dictate(path.join(DIR, "veryquiet_14_pad.wav"), 4, true);
    assert.equal(r.filled, 0); assert.match(r.speech, /quiet|faible/i);
  });
  test("silence produces no text and no record", async () => {
    const r = await dictate(path.join(DIR, "silence_pad.wav"), 4);
    assert.equal(r.filled, 0, `raw on silence: ${r.raw}`);
  });
});
