// PIN gate: an access gate in the UI, NOT encryption. Only a salted SHA-256 hash is stored.
const KEY = "htn-pin";

async function hash(pin, salt) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + ":" + pin));
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, "0")).join("");
}

function read() {
  try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
}

export const hasPin = () => !!read();

export async function setPin(pin) {
  const salt = crypto.getRandomValues(new Uint32Array(2)).join("-");
  try { localStorage.setItem(KEY, JSON.stringify({ salt, hash: await hash(pin, salt) })); } catch {}
}

export async function checkPin(pin) {
  const s = read();
  return !!s && s.hash === (await hash(pin, s.salt));
}
