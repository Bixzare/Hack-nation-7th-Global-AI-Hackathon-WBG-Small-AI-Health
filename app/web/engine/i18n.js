// Loads the active profile and its locale packs. The engine never contains language strings.
async function getJSON(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}

export async function loadProfile() {
  const { profile } = await getJSON("config.json");
  const p = await getJSON(`profiles/${profile}.json`);
  const [worker, fallback, voice] = await Promise.all([
    getJSON(`locales/${p.worker_locale}.json`),
    getJSON(`locales/${p.fallback_locale}.json`),
    getJSON(`locales/${p.patient_voice_locale}.json`),
  ]);
  const sms = p.sms_locale === p.worker_locale ? worker : await getJSON(`locales/${p.sms_locale}.json`);
  return { name: profile, ...p, packs: { worker, fallback, voice, sms } };
}

// t(pack, key, params): looks up the key in the pack, falls back to `en`, then to the key itself.
export function makeT(pack, fallback) {
  return (key, params = {}) => {
    const s = pack[key] ?? fallback[key] ?? key;
    return s.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? `{${k}}`);
  };
}
