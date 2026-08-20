// 存储：IndexedDB 存碎片与 Blob；localStorage 存设置（含自定义氛围词）
import { buildBackup, parseBackup } from './backup.js';

const DB_NAME = 'fragment-scavenger';
const DB_VERSION = 1;
const STORE = 'fragments';
const SETTINGS_KEY = 'fragment-scavenger:settings:v1';

const DEFAULT_SETTINGS = {
  sound: true,      // 点击音效
  music: true,      // 幻灯片钢琴曲
  workerUrl: '',    // Cloudflare Worker 地址（留空 = 纯手动模式）
  customMoods: [],  // 自定义氛围词
};

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('no-indexeddb'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function withStore(mode, fn) {
  const db = await openDB();
  const tx = db.transaction(STORE, mode);
  const result = await fn(tx.objectStore(STORE));
  await tDone(tx);
  return result;
}

export async function getAllFragments() {
  try {
    return await withStore('readonly', (s) => reqToPromise(s.getAll()));
  } catch {
    return [];
  }
}

export async function putFragment(f) {
  return withStore('readwrite', (s) => reqToPromise(s.put(f)));
}

export async function deleteFragment(id) {
  return withStore('readwrite', (s) => reqToPromise(s.delete(id)));
}

export async function clearAllFragments() {
  return withStore('readwrite', (s) => reqToPromise(s.clear()));
}

// ---------- 设置 ----------
export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

// ---------- 备份 ----------
export async function exportBackup() {
  const fragments = await getAllFragments();
  const settings = loadSettings();
  return buildBackup({ fragments, customMoods: settings.customMoods });
}

export async function importBackup(json, mode = 'merge') {
  const { fragments, customMoods } = await parseBackup(json);
  if (mode === 'overwrite') {
    await clearAllFragments();
    for (const f of fragments) await putFragment(f);
  } else {
    const existing = await getAllFragments();
    const ids = new Set(existing.map((f) => f.id));
    for (const f of fragments) {
      if (!ids.has(f.id)) {
        await putFragment(f);
        ids.add(f.id);
      }
    }
  }
  const settings = loadSettings();
  const merged = new Set([...(settings.customMoods || []), ...customMoods]);
  settings.customMoods = [...merged];
  saveSettings(settings);
  return { imported: fragments.length, mode };
}

export function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `f-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
