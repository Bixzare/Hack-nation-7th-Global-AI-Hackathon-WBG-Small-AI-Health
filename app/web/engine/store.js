// IndexedDB: records and outbox stay in this browser, on this device. Nothing is sent to a server.
const DB_NAME = "htn-recorder";
let dbp = null;

function open() {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore("records", { keyPath: "id", autoIncrement: true });
      db.createObjectStore("outbox", { keyPath: "id", autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
  });
}

export const add = (store, obj) => tx(store, "readwrite", s => s.add(obj));
export const put = (store, obj) => tx(store, "readwrite", s => s.put(obj));
export const all = store => tx(store, "readonly", s => s.getAll());
