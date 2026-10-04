// Shared test helpers: static server for app/web and Chrome discovery.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const WEB = path.join(ROOT, "app/web");
// In CI (GitHub Actions sets CI=true) Chrome is installed by the workflow and passed in CHROME.
// Ubuntu 24.04 runners restrict unprivileged user namespaces, so Chrome's sandbox must be disabled there.
export const CHROME_ARGS = process.env.CI ? ["--no-sandbox", "--disable-dev-shm-usage"] : [];
export const IN_CI = !!process.env.CI;
export const CHROME = process.env.CHROME || ["C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome"].find(p => fs.existsSync(p));
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".css": "text/css",
  ".mp3": "audio/mpeg", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json", ".png": "image/png" };

export function serve(port = 0) {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
      if (p.endsWith("/")) p += "index.html";
      const f = path.join(WEB, p);
      if (!f.startsWith(WEB) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" });
      fs.createReadStream(f).pipe(res);
    }).listen(port, "127.0.0.1", () => resolve(srv));
  });
}

