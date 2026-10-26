/**
 * IndexedDB wrapper for canvas state persistence.
 * Replaces localStorage for large canvas states that exceed the 5MB quota.
 * Canva uses IndexedDB with periodic snapshot compaction.
 */

const DB_NAME = 'selfizee-editor';
const DB_VERSION = 1;
const STORE_NAME = 'canvas-states';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    // If another tab holds the DB open at a lower version, onblocked fires
    // and without a handler the promise would hang forever.
    req.onblocked = () => reject(new Error('IndexedDB blocked by another tab'));
  });
}

export async function saveCanvasState(key: string, state: string): Promise<void> {
  let db: IDBDatabase | null = null;
  try {
    db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(state, key);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      // Quota-exceeded errors fire onabort, not onerror
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    });
  } catch {
    // Fallback to localStorage for small states
    try { localStorage.setItem(key, state); } catch { /* quota exceeded */ }
  } finally {
    // Always close the DB handle to avoid leaking connections
    try { db?.close(); } catch { /* ignore */ }
  }
}

export async function loadCanvasState(key: string): Promise<string | null> {
  let db: IDBDatabase | null = null;
  try {
    db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    const result = await new Promise<string | null>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    if (result) return result;
  } catch { /* fallback */ } finally {
    try { db?.close(); } catch { /* ignore */ }
  }
  // Fallback: try localStorage
  try { return localStorage.getItem(key); } catch { return null; }
}

export async function deleteCanvasState(key: string): Promise<void> {
  let db: IDBDatabase | null = null;
  try {
    db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);
    // Await transaction completion before closing the DB — otherwise some
    // browsers may close the connection before the delete commits.
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    });
  } catch { /* ignore */ } finally {
    try { db?.close(); } catch { /* ignore */ }
  }
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}
