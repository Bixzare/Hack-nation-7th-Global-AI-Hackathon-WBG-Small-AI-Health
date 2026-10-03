// Headless end-to-end smoke test of the demo path (synthetic note only).
// Needs puppeteer-core + an installed Chrome:  node ml/smoke_test.mjs [url]   (default http://127.0.0.1:8080/)
// Checks: PIN gate -> fill record from a typed note -> flags -> confirm -> approve -> outbox (voice + SMS)
// -> offline reload from the service-worker cache.
import puppeteer from "puppeteer-core";

const URL = process.argv[2] || "http://127.0.0.1:8080/";
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const NOTE = "Femme de 45 ans, TA 186/112, céphalées sévères, pas de douleur thoracique, sous amlodipine, " +
  "oublie parfois son traitement, pas enceinte, RDV dans 2 semaines. (SYNTHETIC)";

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", e => errors.push(e.message));
page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
await page.goto(URL, { waitUntil: "networkidle0" });

await page.type("#pinInput", "4821");
await page.click("#btnPin");
await page.type("#note", NOTE);
await page.click("#btnFill");
await page.waitForSelector(".field");

const extracted = await page.evaluate(() => [...document.querySelectorAll(".field")].map(f =>
  `${f.querySelector("label").firstChild.textContent}=${(f.querySelector("select,input")).value}${f.classList.contains("check") ? " [check]" : ""}`));
const flags = await page.$$eval("#flags li", ls => ls.map(l => `${l.className}: ${l.textContent}`));

// health worker: type name + phone, confirm the rest, tick consent, approve
const setField = async (label, value) => page.evaluate((label, value) => {
  const f = [...document.querySelectorAll(".field")].find(x => x.querySelector("label").firstChild.textContent === label);
  const i = f.querySelector("select,input"); i.value = value; i.dispatchEvent(new Event("change"));
}, label, value);
await setField("Nom", "Noor (synthétique)");
await setField("Téléphone (rappels)", "+227 90 00 00 00");
for (let k = 0; k < 30; k++) {
  const b = await page.$(".field button:not([hidden])");
  if (!b) break;
  await b.click();
}
await page.click("#consent");
const approveDisabled = await page.$eval("#btnApprove", b => b.disabled);
await page.click("#btnApprove");
await new Promise(r => setTimeout(r, 800));
const outboxText = await page.$eval("#outbox", e => e.innerText);
const saved = await page.$eval("#saved", e => e.innerText);

// sample dictation (hosted mode): speech-sourced BP must be "please check"; mic visible if service is up
await page.click("#samplesTitle");
const sampleButtons = await page.$$("#samples button");
await sampleButtons[1].click();
await page.click("#btnFill");
await page.waitForSelector(".field");
const sample = await page.evaluate(() => ({
  bpCheck: [...document.querySelectorAll(".field")].filter(f => /TA 1/.test(f.querySelector("label").textContent)).every(f => f.classList.contains("check")),
  urgent: [...document.querySelectorAll("#flags li.urgent")].length,
  micVisible: !document.getElementById("btnMic").hidden,
}));

// offline reload: everything must come from the service-worker cache
await page.setOfflineMode(true);
await page.reload({ waitUntil: "domcontentloaded" });
await new Promise(r => setTimeout(r, 800));
const offlineTitle = await page.$eval("#title", e => e.textContent).catch(() => "FAILED");
const missingClips = (outboxText.match(/clip pas encore/g) || []).length;

console.log(JSON.stringify({ extracted, flags, approveDisabled, outboxText, saved, sample, offlineTitle, missingClips, errors }, null, 1));
await browser.close();
