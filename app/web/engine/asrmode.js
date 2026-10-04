// Which speech path to use. Pure function so it can be unit-tested.
//   "service"  : local Whisper service (health-centre install; page served from localhost and service answers)
//   "ondevice" : Whisper in the browser (Transformers.js), e.g. on the hosted site, desktop or phone
//   "none"     : no microphone / no Web Worker / no Web Audio -> typing and sample dictations only
// The hosted page never probes localhost (that would trigger Chrome's local-network permission prompt).
export function selectAsrMode({ hosted, serviceUp, hasMic, hasWorker, hasAudio, ondeviceEnabled }) {
  if (!hasMic) return "none";
  if (!hosted && serviceUp) return "service";
  if (ondeviceEnabled && hasWorker && hasAudio) return "ondevice";
  return "none";
}

export const isHostedLocation = hostname => !["localhost", "127.0.0.1", "[::1]"].includes(hostname);

// On-device mode has no word confidence: every field derived from speech is "please check".
export function flagAllSpeechFields(rec, schema) {
  for (const [name, spec] of Object.entries(schema.fields)) {
    const f = rec[name];
    if (!f || spec.admin) continue;
    if (f.value != null && f.value !== "" && f.value !== "not_mentioned") { f.check = true; f.reason ??= "on_device_speech"; }
  }
  return rec;
}
