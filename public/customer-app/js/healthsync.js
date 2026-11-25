// ============================================================
// Health records → the customer's account (Aviso de Privacidad v3 §7)
//
// The app's screens keep writing to localStorage as before; this module
// mirrors those records into Supabase (patient_health_records +
// patient_emergency_info) so they survive a phone change and the doctor
// sees them as "Registrado por el paciente, no verificado".
//   · Runs ONLY after the customer accepted the current aviso (v3): the
//     server enforces it too (RLS can_write_my_health).
//   · First run uploads what was stored only on the phone before v3.
//   · Upsert by (kind, client_id) — idempotent, safe to repeat.
//   · On a new device, missing local records are restored from the account.
//   · Deletions propagate only for records this device itself uploaded.
//   · Mood and stress are NOT uploaded (not part of v3): device-only.
//   · Logout clears the local copies (clearHealthLocal).
// Never mixed with Monedas Apolo (which only learns "goal met").
// ============================================================

// localStorage key → kind, and how to read items out of it
const SOURCES = [
  { key: 'vaccineRecords', kind: 'vaccine', type: 'array' },
  { key: 'vaccines', kind: 'vaccine', type: 'array' },
  { key: 'apollo_vitals_log', kind: 'vital', type: 'array' },
  { key: 'apolo:vitals', kind: 'vital', type: 'array', idOf: (i) => i.at },
  { key: 'apolo:weights', kind: 'vital', type: 'array', idOf: (i) => i.date },
  { key: 'bodyMeasurements', kind: 'vital', type: 'object' },
  { key: 'healthMetrics', kind: 'vital', type: 'object' },
  { key: 'userExams', kind: 'lab', type: 'array' },
  { key: 'medicineSchedules', kind: 'medicine', type: 'array' },
  { key: 'medicineReminders', kind: 'medicine', type: 'array' },
  { key: 'prescriptionMedicines', kind: 'medicine', type: 'array' },
  { key: 'apolo:meds', kind: 'medicine', type: 'array' },
  { key: 'apolo:doses', kind: 'medicine', type: 'map' },
  { key: 'healthGoals', kind: 'goal', type: 'array' },
  { key: 'goalHistory', kind: 'goal', type: 'array' },
  { key: 'foodLog', kind: 'food', type: 'array' },
  { key: 'meals', kind: 'food', type: 'array' },
  { key: 'apolo:steps', kind: 'steps', type: 'map' },
  { key: 'apolo:sleep', kind: 'sleep', type: 'map' },
];
const EMERGENCY_INFO_KEY = 'emergencyInfo';
const EMERGENCY_CONTACTS_KEY = 'emergencyContacts';
const SYNCED_IDS_KEY = 'apolo:synced_ids';
// Device-only (not in v3) — cleared at logout but never uploaded
const DEVICE_ONLY_KEYS = ['apolo:mood', 'apolo:stress', 'apolo:breath', 'apolo:goalDays'];

const TRACKED = new Set([...SOURCES.map((s) => s.key), EMERGENCY_INFO_KEY, EMERGENCY_CONTACTS_KEY]);

let sb = null;
let customer = null; // { id, org_id }
let active = false;
let syncing = false;
let dirty = false;
let timer = null;

const readRaw = (key) => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch (e) { return null; } };
const writeRaw = (key, val) => { try { origSetItem.call(localStorage, key, JSON.stringify(val)); } catch (e) { /* full / blocked */ } };
const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };

function itemsOf(src, raw) {
  if (raw == null) return [];
  if (src.type === 'array') {
    if (!Array.isArray(raw)) return [];
    return raw.filter((i) => i && typeof i === 'object').map((item) => {
      const id = (src.idOf && src.idOf(item)) ?? item.id ?? item.date ?? item.at ?? item.createdAt ?? hash(JSON.stringify(item));
      return { clientId: `${src.key}:${id}`, recordedAt: pickDate(item), data: { source: src.key, item } };
    });
  }
  if (src.type === 'map') {
    if (typeof raw !== 'object' || Array.isArray(raw)) return [];
    return Object.keys(raw).map((k) => ({ clientId: `${src.key}:${k}`, recordedAt: /^\d{4}-\d{2}-\d{2}$/.test(k) ? `${k}T12:00:00-06:00` : null, data: { source: src.key, key: k, value: raw[k] } }));
  }
  if (src.type === 'object') {
    if (typeof raw !== 'object' || Array.isArray(raw)) return [];
    return [{ clientId: `${src.key}:object`, recordedAt: null, data: { source: src.key, item: raw } }];
  }
  return [];
}
function pickDate(item) {
  const v = item.at || item.date || item.takenAt || item.createdAt || item.timestamp || item.recordedAt || null;
  if (!v) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T12:00:00-06:00` : v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// Restore records missing on this device (new phone) from the account.
// Records this device uploaded before and no longer has were deleted here:
// they are NOT restored (the push step deletes them from the account).
function restoreLocal(rows, deletedHere) {
  const bySource = {};
  rows.forEach((r) => { const src = r.data && r.data.source; if (src) (bySource[src] = bySource[src] || []).push(r); });
  SOURCES.forEach((src) => {
    const remote = bySource[src.key];
    if (!remote || !remote.length) return;
    const raw = readRaw(src.key);
    const localIds = new Set(itemsOf(src, raw).map((i) => i.clientId));
    const missing = remote.filter((r) => !localIds.has(r.client_id) && !deletedHere.has(`${r.kind}|${r.client_id}`));
    if (!missing.length) return;
    if (src.type === 'array') {
      const arr = Array.isArray(raw) ? raw.slice() : [];
      missing.forEach((r) => r.data.item && arr.push(r.data.item));
      writeRaw(src.key, arr);
    } else if (src.type === 'map') {
      const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } : {};
      missing.forEach((r) => { if (r.data.key != null) obj[r.data.key] = r.data.value; });
      writeRaw(src.key, obj);
    } else if (src.type === 'object' && raw == null && missing[0].data.item) {
      writeRaw(src.key, missing[0].data.item);
    }
  });
}

async function syncNow() {
  if (!active || !sb || !customer) return;
  if (syncing) { dirty = true; return; }
  syncing = true;
  try {
    // 1. pull (restore what this device doesn't have)
    const { data: remote, error: pullErr } = await sb.from('patient_health_records')
      .select('kind, client_id, data').eq('customer_id', customer.id).limit(5000);
    if (pullErr) throw pullErr;
    const prevSynced = new Set(readRaw(SYNCED_IDS_KEY) || []);
    restoreLocal(remote || [], prevSynced);
    const { data: em } = await sb.from('patient_emergency_info').select('info, contacts').eq('customer_id', customer.id).maybeSingle();
    if (em) {
      if (readRaw(EMERGENCY_INFO_KEY) == null && em.info && Object.keys(em.info).length) writeRaw(EMERGENCY_INFO_KEY, em.info);
      if (readRaw(EMERGENCY_CONTACTS_KEY) == null && Array.isArray(em.contacts) && em.contacts.length) writeRaw(EMERGENCY_CONTACTS_KEY, em.contacts);
    }

    // 2. push everything local (upsert)
    const rows = [];
    SOURCES.forEach((src) => itemsOf(src, readRaw(src.key)).forEach((i) => rows.push({
      org_id: customer.org_id, customer_id: customer.id, kind: src.kind, client_id: i.clientId.slice(0, 200),
      recorded_at: i.recordedAt, data: i.data, updated_at: new Date().toISOString(),
    })));
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await sb.from('patient_health_records').upsert(rows.slice(i, i + 200), { onConflict: 'customer_id,kind,client_id' });
      if (error) throw error;
    }
    const info = readRaw(EMERGENCY_INFO_KEY);
    const contacts = readRaw(EMERGENCY_CONTACTS_KEY);
    if ((info && typeof info === 'object') || Array.isArray(contacts)) {
      const { error } = await sb.from('patient_emergency_info').upsert({
        customer_id: customer.id, org_id: customer.org_id,
        info: info && typeof info === 'object' ? info : {}, contacts: Array.isArray(contacts) ? contacts : [], updated_at: new Date().toISOString(),
      }, { onConflict: 'customer_id' });
      if (error) throw error;
    }

    // 3. deletions: only records THIS device uploaded before and no longer has
    const prev = new Set(readRaw(SYNCED_IDS_KEY) || []);
    const nowIds = new Set(rows.map((r) => `${r.kind}|${r.client_id}`));
    const gone = [...prev].filter((k) => !nowIds.has(k));
    for (const k of gone.slice(0, 200)) {
      const [kind, ...rest] = k.split('|');
      await sb.from('patient_health_records').delete().eq('customer_id', customer.id).eq('kind', kind).eq('client_id', rest.join('|'));
    }
    writeRaw(SYNCED_IDS_KEY, [...nowIds]);
    try { origSetItem.call(localStorage, 'apolo:synced_at', new Date().toISOString()); } catch (e) { /* ignore */ }
  } catch (e) {
    console.warn('[healthsync] sync failed (will retry):', e.message || e);
  } finally {
    syncing = false;
    if (dirty) { dirty = false; schedule(); }
  }
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(syncNow, 2500);
}

// Watch writes to tracked keys from any screen (old or new).
const origSetItem = Storage.prototype.setItem;
const origRemoveItem = Storage.prototype.removeItem;
let patched = false;
function patchStorage() {
  if (patched) return;
  patched = true;
  Storage.prototype.setItem = function (k, v) { origSetItem.call(this, k, v); if (this === localStorage && active && TRACKED.has(k)) schedule(); };
  Storage.prototype.removeItem = function (k) { origRemoveItem.call(this, k); if (this === localStorage && active && TRACKED.has(k)) schedule(); };
}

// Start syncing for this customer — call only once the consent gate
// passed; it re-checks the aviso server-side and stays idle otherwise.
export async function startHealthSync(client) {
  sb = client || sb;
  if (!sb || active) return;
  try {
    const { data: cur } = await sb.rpc('my_consent_currency');
    if (!cur || cur.privacidad !== true) return;
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    const { data: c } = await sb.from('customers').select('id, org_id').eq('profile_id', user.id).maybeSingle();
    if (!c) return;
    customer = c;
    active = true;
    patchStorage();
    await syncNow();
  } catch (e) {
    console.warn('[healthsync] not started:', e.message || e);
  }
}

// Logout: stop and delete the local copies (aviso v3 §7) incl. device-only.
export function clearHealthLocal() {
  active = false;
  customer = null;
  clearTimeout(timer);
  try {
    [...TRACKED, SYNCED_IDS_KEY, 'apolo:synced_at', ...DEVICE_ONLY_KEYS].forEach((k) => origRemoveItem.call(localStorage, k));
  } catch (e) { /* ignore */ }
}
