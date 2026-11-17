// On-phone "backend". Everything the old Node server did now happens here, against the
// phone's own storage, so the app never waits on the network.
//
// app.js still calls api(method, path, body) with the same paths as before; this module
// answers them. All data is one JSON document in localStorage under DB_KEY.
//
// Blinding: drink names are encrypted with a key derived from the Setup PIN (PBKDF2 ->
// AES-GCM, via the browser's built-in WebCrypto). The phone only stores the scrambled
// text, plus one encrypted "check" value used to tell whether a PIN is right. The PIN is
// never stored. Generate report decrypts the names and saves them in plain text, which is
// what lets her see them on the report.

const DB_KEY = 'sips-db';
const RATINGS = ['overall', 'energy', 'calm', 'focus', 'mood', 'taste'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const CODES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const CHECK_TEXT = 'sips-pin-check';

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ---------- storage ----------

function emptyDb() {
  return { version: 1, settings: { name: '', revealed: false }, crypto: null, drinks: [], days: {}, logs: {} };
}

function load() {
  let db;
  try {
    db = JSON.parse(localStorage.getItem(DB_KEY));
  } catch {
    db = null;
  }
  db ??= emptyDb();
  db.settings ??= { name: '', revealed: false };
  db.drinks ??= [];
  db.days ??= {};
  db.logs ??= {};
  return db;
}

function save(db) {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch {
    throw new ApiError(507, 'Couldn’t save on this phone. Is storage full or blocked?');
  }
}

// ---------- crypto ----------

const enc = new TextEncoder();
const dec = new TextDecoder();
const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

const keyCache = new Map(); // pin -> CryptoKey, for this page load only

async function deriveKey(pin, saltB64) {
  const id = `${saltB64}:${pin}`;
  if (keyCache.has(id)) return keyCache.get(id);
  const base = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: fromB64(saltB64), iterations: 150000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  keyCache.set(id, key);
  return key;
}

async function encrypt(key, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(value)));
  return { iv: toB64(iv), ct: toB64(ct) };
}

async function decrypt(key, box) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(box.iv) }, key, fromB64(box.ct));
  return JSON.parse(dec.decode(pt));
}

// Returns the key for this PIN. The first PIN ever entered becomes the PIN.
async function unlock(db, pin) {
  if (!pin || !/^\d{4,8}$/.test(pin)) throw new ApiError(401, 'Use a 4–8 digit PIN');
  if (!db.crypto) {
    const salt = toB64(crypto.getRandomValues(new Uint8Array(16)));
    const key = await deriveKey(pin, salt);
    db.crypto = { salt, check: await encrypt(key, CHECK_TEXT) };
    save(db);
    return key;
  }
  const key = await deriveKey(pin, db.crypto.salt);
  try {
    if ((await decrypt(key, db.crypto.check)) === CHECK_TEXT) return key;
  } catch { /* wrong key: AES-GCM refuses to decrypt */ }
  keyCache.delete(`${db.crypto.salt}:${pin}`);
  throw new ApiError(401, 'Wrong PIN');
}

// ---------- views ----------

function publicState(db) {
  const { revealed, name } = db.settings;
  const byId = new Map(db.drinks.map((d) => [d.id, d]));
  const schedule = {};
  for (const [date, { drinkId }] of Object.entries(db.days)) {
    const drink = byId.get(drinkId);
    if (drink) schedule[date] = { code: drink.code, name: revealed ? drink.reveal?.name ?? null : null };
  }
  return {
    name,
    revealed,
    pinSet: Boolean(db.crypto),
    drinks: db.drinks.map((d) => ({
      code: d.code,
      name: revealed ? d.reveal?.name ?? null : null,
      brand: revealed ? d.reveal?.brand ?? null : null,
    })),
    schedule,
    logs: db.logs,
  };
}

async function adminState(db, key) {
  const drinks = await Promise.all(db.drinks.map(async (d) => ({ id: d.id, code: d.code, ...(await decrypt(key, d.secret)) })));
  return { settings: db.settings, drinks, days: db.days, logs: db.logs };
}

function exportCsv(admin) {
  const byId = new Map(admin.drinks.map((d) => [d.id, d]));
  const header = ['date', 'code', 'drink', 'brand', ...RATINGS, 'time', 'side_effects', 'notes'];
  const dates = [...new Set([...Object.keys(admin.days), ...Object.keys(admin.logs)])].sort();
  const cell = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const rows = dates.map((date) => {
    const drink = byId.get(admin.days[date]?.drinkId);
    const log = admin.logs[date] ?? {};
    return [date, drink?.code, drink?.name, drink?.brand, ...RATINGS.map((k) => log[k]), log.time, log.sideEffects, log.notes]
      .map(cell)
      .join(',');
  });
  return [header.join(','), ...rows].join('\n') + '\n';
}

// ---------- validation ----------

const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function validateLog(body) {
  const log = {};
  for (const key of RATINGS) {
    const v = body[key];
    if (v == null || v === '') log[key] = null;
    else if (Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 5) log[key] = Number(v);
    else throw new ApiError(400, `${key} must be 1-5`);
  }
  if (log.overall == null) throw new ApiError(400, 'Pick an overall rating');
  log.time = TIME_RE.test(body.time ?? '') ? body.time : null;
  log.sideEffects = text(body.sideEffects, 1000);
  log.notes = text(body.notes, 4000);
  log.updatedAt = new Date().toISOString();
  return log;
}

function requireDate(date) {
  if (!DATE_RE.test(date) || Number.isNaN(Date.parse(date))) throw new ApiError(400, 'Bad date');
  return date;
}

// ---------- routes ----------

export async function localApi(method, path, body = {}, pin = '') {
  const parts = path.split('/').filter(Boolean).slice(1); // drop "api"
  const db = load();

  if (method === 'GET' && parts[0] === 'state') return publicState(db);

  if (parts[0] === 'logs' && parts.length === 2) {
    const date = requireDate(parts[1]);
    if (method === 'PUT') {
      if (Date.parse(date) > Date.now() + 2 * 86400000) throw new ApiError(400, 'That day hasn’t happened yet');
      db.logs[date] = validateLog(body);
      save(db);
      return publicState(db);
    }
    if (method === 'DELETE') {
      delete db.logs[date];
      save(db);
      return publicState(db);
    }
  }

  if (parts[0] !== 'admin') throw new ApiError(404, 'Not found');

  const key = await unlock(db, pin);
  const [, resource, id] = parts;
  const done = () => {
    save(db);
    return adminState(db, key);
  };

  if (method === 'GET' && resource === 'state') return adminState(db, key);
  if (method === 'GET' && resource === 'export.csv') return exportCsv(await adminState(db, key));
  if (method === 'GET' && resource === 'backup') return JSON.stringify(db, null, 2);

  if (method === 'POST' && resource === 'restore') {
    let incoming;
    try {
      incoming = JSON.parse(body.json);
    } catch {
      throw new ApiError(400, 'That file isn’t a backup');
    }
    if (!incoming || !Array.isArray(incoming.drinks) || typeof incoming.logs !== 'object') {
      throw new ApiError(400, 'That file isn’t a backup');
    }
    localStorage.setItem(DB_KEY, JSON.stringify(incoming));
    keyCache.clear();
    return { restored: true };
  }

  if (resource === 'drinks') {
    if (method === 'POST' && !id) {
      const name = text(body.name, 120);
      if (!name) throw new ApiError(400, 'Name is required');
      const used = new Set(db.drinks.map((d) => d.code));
      const code = CODES.find((c) => !used.has(c));
      if (!code) throw new ApiError(400, 'Out of letters (26 drinks max)');
      const secret = await encrypt(key, { name, brand: text(body.brand, 120), notes: text(body.notes, 1000) });
      const drink = { id: crypto.randomUUID(), code, secret };
      if (db.settings.revealed) drink.reveal = { name, brand: text(body.brand, 120) };
      db.drinks.push(drink);
      return done();
    }
    const drink = db.drinks.find((d) => d.id === id);
    if (!drink) throw new ApiError(404, 'No such drink');
    if (method === 'DELETE') {
      if (Object.values(db.days).some((d) => d.drinkId === id)) {
        throw new ApiError(409, 'That drink is assigned to a day. Clear those days first.');
      }
      db.drinks = db.drinks.filter((d) => d.id !== id);
      return done();
    }
  }

  if (resource === 'days' && id) {
    const date = requireDate(id);
    if (method === 'PUT' && !body.drinkId) {
      delete db.days[date];
      return done();
    }
    if (method === 'PUT') {
      if (!db.drinks.some((d) => d.id === body.drinkId)) throw new ApiError(400, 'Pick a drink');
      db.days[date] = { drinkId: body.drinkId };
      return done();
    }
    if (method === 'DELETE') {
      delete db.days[date];
      return done();
    }
  }

  if (resource === 'settings' && method === 'PATCH') {
    if (body.name !== undefined) db.settings.name = text(body.name, 60);
    if (body.revealed === true) {
      // Generate report: store the names in plain text so the report can show them.
      for (const d of db.drinks) {
        const { name, brand } = await decrypt(key, d.secret);
        d.reveal = { name, brand };
      }
      db.settings.revealed = true;
    } else if (body.revealed === false) {
      for (const d of db.drinks) delete d.reveal;
      db.settings.revealed = false;
    }
    return done();
  }

  throw new ApiError(404, 'Not found');
}
