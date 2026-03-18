const DB_NAME = "AdhyantTestRecordings";
const DB_VERSION = 1;
const META_STORE = "recordingMeta";
const BLOB_STORE = "recordingBlobs";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(BLOB_STORE)) {
        db.createObjectStore(BLOB_STORE, { keyPath: "id" });
      }
    };
  });
}

export async function saveRecording({ blob, score, totalQuestions, durationMinutes }) {
  const db = await openDb();
  const id = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const meta = {
    id,
    createdAt: new Date().toISOString(),
    score,
    totalQuestions,
    durationMinutes,
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction([META_STORE, BLOB_STORE], "readwrite");
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve(id);
    tx.objectStore(META_STORE).put(meta);
    tx.objectStore(BLOB_STORE).put({ id, blob });
  });
}

export async function listRecordings() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(META_STORE, "readonly").objectStore(META_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function getRecordingBlob(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(BLOB_STORE, "readonly").objectStore(BLOB_STORE).get(id);
    req.onsuccess = () => resolve(req.result?.blob ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteRecording(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([META_STORE, BLOB_STORE], "readwrite");
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();
    tx.objectStore(META_STORE).delete(id);
    tx.objectStore(BLOB_STORE).delete(id);
  });
}
