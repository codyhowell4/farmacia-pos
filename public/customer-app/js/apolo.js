// ============================================================
// App Apolo — Inicio, Monedas Apolo, Ahorro, Chequeo, Respirar
// (2026-11-25, approved mockup "App Apolo · Ideas para uso diario")
//
// Monedas Apolo are coins, NOT pesos: never cash, only spent on the
// rewards ladder at the register. Every earning rule is enforced in
// Supabase (coins_* RPCs). Privacy (aviso §7): health values — steps,
// weight, medicines, glucose, pressure, mood, sleep — stay in this
// device's localStorage; the server only learns that a goal was met.
// ============================================================

const NAVY = '#1E2A8A';
const NAVY_DARK = '#141B5E';
const GREEN = '#2F7D55';      // accessible green text on white
const GREEN_BRAND = '#46AC78';
const INK = '#141B3A';
const MUTED = '#4A5578';
const BORDER = '#E3E8F2';
const COIN_BG = '#FDF3DC';
const COIN_INK = '#7A5200';
const CONSENT_VERSION = 'monedas-v1';

let ctx = {
  getAuthUser: () => null,
  getProfile: () => null,
  showToast: (m) => console.log(m),
  goPage: (p) => window.goPage && window.goPage(p),
  getMain: () => document.getElementById('main-content'),
};

export function registerApolo(c) {
  ctx = { ...ctx, ...c };
}

// ── Utilities ─────────────────────────────────────────────────
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const fmtInt = (n) => Number(n || 0).toLocaleString('es-MX');
const fmtMXN = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(n || 0));
const coinsLabel = (n) => `${fmtInt(n)} ${Math.abs(Number(n)) === 1 ? 'Moneda' : 'Monedas'}`;

// Local date in the clinic timezone, YYYY-MM-DD.
export function mxToday(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  } catch (e) {
    return d.toISOString().slice(0, 10);
  }
}
function mxMinutesNow() {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
    const g = (t) => parseInt((parts.find((p) => p.type === t) || {}).value || '0', 10);
    return g('hour') * 60 + g('minute');
  } catch (e) {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  }
}
const toMin = (hhmm) => { const [h, m] = String(hhmm || '0:0').split(':').map((x) => parseInt(x, 10) || 0); return h * 60 + m; };
const fmtTime = (hhmm) => {
  const m = toMin(hhmm); const h = Math.floor(m / 60); const mm = String(m % 60).padStart(2, '0');
  return `${((h + 11) % 12) + 1}:${mm} ${h < 12 ? 'am' : 'pm'}`;
};
function isoWeek(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d - firstThu) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-${String(week).padStart(2, '0')}`;
}

// ── Local (device-only) health data ───────────────────────────
const LS = {
  get(key, def) { try { const v = localStorage.getItem('apolo:' + key); return v ? JSON.parse(v) : def; } catch (e) { return def; } },
  set(key, val) { try { localStorage.setItem('apolo:' + key, JSON.stringify(val)); } catch (e) { /* storage full / blocked */ } },
};

export const ApoloLocal = {
  stepsFor(date = mxToday()) { return Number((LS.get('steps', {}))[date] || 0); },
  setSteps(n, date = mxToday()) { const all = LS.get('steps', {}); all[date] = n; LS.set('steps', all); },
  weights() { return LS.get('weights', []); },
  addWeight(kg) { const w = ApoloLocal.weights().filter((x) => x.date !== mxToday()); w.push({ date: mxToday(), kg }); w.sort((a, b) => a.date.localeCompare(b.date)); LS.set('weights', w.slice(-120)); },
  weightThisWeek() { const wk = isoWeek(mxToday()); return ApoloLocal.weights().some((w) => isoWeek(w.date) === wk); },
  meds() {
    let meds = LS.get('meds', null);
    if (meds === null) { meds = importLegacyMeds(); LS.set('meds', meds); }
    return meds;
  },
  saveMeds(meds) { LS.set('meds', meds); },
  dosesTaken(date = mxToday()) { return (LS.get('doses', {}))[date] || {}; },
  markDose(medId, time, date = mxToday()) {
    const all = LS.get('doses', {});
    all[date] = { ...(all[date] || {}), [`${medId}@${time}`]: new Date().toISOString() };
    // keep ~60 days
    Object.keys(all).sort().slice(0, -60).forEach((k) => delete all[k]);
    LS.set('doses', all);
  },
  goalDays() { return LS.get('goalDays', {}); },
  markGoalDay(date = mxToday()) { const g = LS.get('goalDays', {}); g[date] = true; LS.set('goalDays', g); },
  breathSessions() { return LS.get('breath', []); },
  addBreathSession() { const b = LS.get('breath', []); b.push(new Date().toISOString()); LS.set('breath', b.slice(-200)); },
};

// One-time import of the existing smart-reminder schedules (medicine + times).
function importLegacyMeds() {
  try {
    const raw = localStorage.getItem('apollo_medicineSchedules') || localStorage.getItem('medicineSchedules');
    const schedules = raw ? JSON.parse(raw) : [];
    const byName = {};
    (schedules || []).filter((s) => s && s.active !== false && s.medicine).forEach((s) => {
      const times = [...new Set((s.doses || []).map((d) => d.time).filter(Boolean))].sort();
      const key = String(s.medicine).trim().toLowerCase();
      if (!byName[key]) byName[key] = { id: 'm' + Math.random().toString(36).slice(2, 9), name: String(s.medicine).trim(), dose: s.dose || '', times: times.slice(0, 6), supply: null, supplyDate: null };
    });
    return Object.values(byName);
  } catch (e) {
    return [];
  }
}

// Days of medicine left: supply counted at supplyDate minus doses per day since.
export function medDaysLeft(med) {
  if (!med || !(Number(med.supply) > 0) || !med.supplyDate || !(med.times || []).length) return null;
  const perDay = med.times.length;
  const days = Math.max(0, Math.floor((Date.parse(mxToday() + 'T12:00:00Z') - Date.parse(med.supplyDate + 'T12:00:00Z')) / 86400000));
  return Math.max(0, Math.floor((Number(med.supply) - days * perDay) / perDay));
}

// Local streak: consecutive days with ≥1 goal, ending today (or yesterday).
function localStreak() {
  const g = ApoloLocal.goalDays();
  let off = g[mxToday()] ? 0 : -1;
  let n = 0;
  while (g[mxToday(off)] && n < 400) { n++; off--; }
  return n;
}

// ── Coins status (server) ─────────────────────────────────────
let statusCache = { at: 0, data: null };
async function loadStatus(force = false) {
  if (!ctx.getAuthUser() || !window.FarmaciaAPI?.coinsMyStatus) return null;
  if (!force && statusCache.data && Date.now() - statusCache.at < 15000) return statusCache.data;
  const s = await window.FarmaciaAPI.coinsMyStatus();
  if (s) statusCache = { at: Date.now(), data: s };
  return s;
}
export async function getApoloStreak() {
  const s = await loadStatus().catch(() => null);
  return s && s.enrolled ? Number(s.streak || 0) : localStreak();
}

async function claim(kind, slot = null) {
  ApoloLocal.markGoalDay();
  const s = await loadStatus();
  if (!s || !s.enrolled) return { awarded: 0, reason: 'no_inscrito' };
  const { data, error } = await window.FarmaciaAPI.coinsClaim(kind, slot);
  if (error) { ctx.showToast(error.message || 'No se pudieron registrar tus Monedas', 'warning'); return { awarded: 0 }; }
  statusCache.at = 0;
  if (data?.awarded > 0) ctx.showToast(`+${coinsLabel(data.awarded)}`, 'success');
  return data || { awarded: 0 };
}

// ── Shared UI ─────────────────────────────────────────────────
const ICON = {
  // Plain coin (no $ sign: Monedas are not money)
  coin: '<circle cx="12" cy="12" r="9"></circle><circle cx="12" cy="12" r="5"></circle>',
  flame: '<path d="M12 22c4 0 7-3 7-7 0-5-5-7-5-12-3 2-4 5-4 7-1-1-2-2-2-4-2 2-3 5-3 9 0 4 3 7 7 7z"></path>',
  walk: '<circle cx="13" cy="4" r="1.5"></circle><path d="M9 21l2-6 3 3v3M7 12l3-4 4 1 2 3 3 1"></path>',
  scale: '<rect x="3" y="4" width="18" height="16" rx="3"></rect><path d="M8 9a4 4 0 0 1 8 0z"></path>',
  pill: '<rect x="3" y="9" width="18" height="6" rx="3" transform="rotate(-45 12 12)"></rect><path d="M9.5 9.5l5 5"></path>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M3 10h18M8 3v4M16 3v4"></path>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="2"></rect><path d="M11 18h2"></path>',
  wind: '<path d="M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7"></path>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"></path>',
  gift: '<rect x="3" y="8" width="18" height="13" rx="2"></rect><path d="M12 8v13M3 12h18M12 8c-2-4-6-4-6-1s6 1 6 1zM12 8c2-4 6-4 6-1s-6 1-6 1z"></path>',
  tag: '<path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"></path><circle cx="7.5" cy="7.5" r="1.5"></circle>',
  cart: '<circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"></path>',
  star: '<polygon points="12 2 15.1 8.3 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 8.9 8.3 12 2"></polygon>',
  chev: '<path d="M9 6l6 6-6 6"></path>',
  check: '<path d="M20 6L9 17l-5-5"></path>',
  box: '<path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8"></path>',
};
const svg = (name, color = NAVY, size = 20) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name] || ''}</svg>`;
const iconBox = (name, bg = '#EEF0FA', color = NAVY, size = 40) =>
  `<div style="width:${size}px;height:${size}px;border-radius:12px;background:${bg};display:flex;align-items:center;justify-content:center;flex-shrink:0;">${svg(name, color)}</div>`;
const pill = (text, color = COIN_INK, bg = COIN_BG) =>
  `<span style="font-size:11px;font-weight:700;color:${color};background:${bg};border-radius:999px;padding:3px 9px;white-space:nowrap;">${text}</span>`;
const card = (inner, extra = '') =>
  `<div style="background:#fff;border:1px solid ${BORDER};border-radius:16px;padding:14px 16px;${extra}">${inner}</div>`;
const pageHeader = (title, subtitle) => `
  <div style="background:linear-gradient(120deg,#2B37A5 0%,${NAVY} 48%,${NAVY_DARK} 100%);padding:18px 20px;color:#fff;">
    <div style="font-size:20px;font-weight:800;">${esc(title)}</div>
    ${subtitle ? `<div style="font-size:13px;color:#C9D0F2;margin-top:2px;">${esc(subtitle)}</div>` : ''}
  </div>`;
const wrap = (inner) => `<div style="background:#F5F7FB;min-height:100%;font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:${INK};">${inner}</div>`;
const btnPrimary = `width:100%;min-height:48px;border:none;border-radius:12px;background:${NAVY};color:#fff;font-weight:700;font-size:15px;cursor:pointer;`;
const btnOutline = `width:100%;min-height:44px;border:1px solid ${NAVY};border-radius:12px;background:#fff;color:${NAVY};font-weight:700;font-size:14px;cursor:pointer;`;

function openSheet(title, bodyHtml) {
  document.querySelector('.apolo-sheet')?.remove();
  const el = document.createElement('div');
  el.className = 'modal-overlay apolo-sheet';
  el.style.cssText = 'position:fixed;inset:0;background:rgba(20,27,58,0.45);z-index:1000;display:flex;align-items:flex-end;justify-content:center;';
  el.innerHTML = `
    <div role="dialog" aria-modal="true" aria-label="${esc(title)}" style="background:#fff;width:100%;max-width:430px;max-height:92dvh;overflow-y:auto;border-radius:20px 20px 0 0;padding:18px 18px 24px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:${INK};">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <div style="font-size:17px;font-weight:800;">${esc(title)}</div>
        <button type="button" aria-label="Cerrar" onclick="this.closest('.apolo-sheet').remove()" style="width:44px;height:44px;border:none;background:none;font-size:22px;cursor:pointer;color:${MUTED};">×</button>
      </div>
      ${bodyHtml}
    </div>`;
  el.addEventListener('click', (e) => { if (e.target === el) el.remove(); });
  document.body.appendChild(el);
  return el;
}
const closeSheet = () => document.querySelector('.apolo-sheet')?.remove();

function setNavActive(page) {
  document.querySelectorAll('.bottom-nav .nav-item').forEach((n) => n.classList.toggle('active', n.dataset.page === page));
}

// ============================================================
// INICIO
// ============================================================
export async function renderInicio() {
  const main = ctx.getMain();
  const user = ctx.getAuthUser();
  const fullName = (ctx.getProfile && ctx.getProfile()?.name) || user?.user_metadata?.full_name || '';
  const name = String(fullName).trim().split(/\s+/)[0] || '';
  const dateRaw = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Mexico_City' });
  const dateStr = dateRaw.charAt(0).toUpperCase() + dateRaw.slice(1);
  main.innerHTML = wrap(`
    <div style="background:linear-gradient(120deg,#2B37A5 0%,${NAVY} 48%,${NAVY_DARK} 100%);padding:18px 20px 64px;color:#fff;">
      <div style="font-size:12px;color:#C9D0F2;">${esc(dateStr)}</div>
      <div style="font-size:20px;font-weight:800;">Hola${name ? ', ' + esc(name.charAt(0).toUpperCase() + name.slice(1)) : ''}</div>
    </div>
    <div id="apolo-coin-card" style="margin:-50px 16px 0;background:#fff;border-radius:18px;padding:16px;box-shadow:0 10px 30px rgba(20,27,94,0.14);min-height:84px;"></div>
    <div style="padding:14px 16px 24px;display:flex;flex-direction:column;gap:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <h2 style="margin:0;font-size:17px;font-weight:800;">Gana hoy</h2>
        <span id="apolo-today-earned" style="font-size:12px;color:${MUTED};font-weight:600;"></span>
      </div>
      <div id="apolo-goals"></div>
      <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;">
        ${[['cal', 'Chequeo', 'apoloOpenChequeo()'], ['phone', 'Recargas', "apoloGo('ahorro')"], ['wind', 'Respirar 3 min', 'apoloBreathe()'], ['pill', 'Surtir receta', "goPage('prescripciones')"]]
          .map(([ic, label, fn]) => `<button type="button" onclick="${fn}" style="background:#fff;border:1px solid ${BORDER};border-radius:14px;padding:12px 6px;display:flex;flex-direction:column;align-items:center;gap:6px;font-size:11px;font-weight:600;color:${INK};cursor:pointer;min-height:84px;">${iconBox(ic, '#EEF0FA', NAVY, 36)}${label}</button>`).join('')}
      </div>
    </div>`);
  renderCoinCard(null);
  renderGoals(null);
  const s = await loadStatus(true).catch(() => null);
  renderCoinCard(s);
  renderGoals(s);
}

function renderCoinCard(s) {
  const el = document.getElementById('apolo-coin-card');
  if (!el) return;
  const user = ctx.getAuthUser();
  const streak = s && s.enrolled ? Number(s.streak || 0) : localStreak();
  const streakHtml = `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;color:#B4520F;">${svg('flame', '#C2570C', 22)}<span style="font-size:12px;font-weight:800;">${streak} ${streak === 1 ? 'día' : 'días'}</span></div>`;
  let body;
  if (!user) {
    body = `<div style="flex:1;display:flex;flex-direction:column;gap:2px;"><span style="font-size:12px;color:${MUTED};font-weight:600;">Monedas Apolo</span><span style="font-size:15px;font-weight:800;color:${NAVY};">Inicia sesión para ganar Monedas</span><button type="button" onclick="goPage('login')" style="margin-top:4px;align-self:flex-start;min-height:36px;border:none;background:none;color:${NAVY};font-weight:700;padding:0;cursor:pointer;text-decoration:underline;">Iniciar sesión</button></div>`;
  } else if (!s) {
    body = `<div style="flex:1;"><span style="font-size:12px;color:${MUTED};font-weight:600;">Tus Monedas Apolo</span><div style="font-size:14px;color:${MUTED};">Cargando…</div></div>`;
  } else if (!s.enrolled) {
    body = `<div style="flex:1;display:flex;flex-direction:column;gap:2px;"><span style="font-size:12px;color:${MUTED};font-weight:600;">Monedas Apolo</span><span style="font-size:15px;font-weight:800;color:${NAVY};">Gana recompensas por cuidarte</span><button type="button" onclick="apoloGo('monedas')" style="margin-top:4px;align-self:flex-start;min-height:36px;border:none;background:none;color:${NAVY};font-weight:700;padding:0;cursor:pointer;text-decoration:underline;">Activar Monedas</button></div>`;
  } else {
    body = `<button type="button" onclick="apoloGo('monedas')" style="flex:1;display:flex;flex-direction:column;gap:2px;text-align:left;background:none;border:none;padding:0;cursor:pointer;color:inherit;"><span style="font-size:12px;color:${MUTED};font-weight:600;">Tus Monedas Apolo</span><span style="font-size:28px;font-weight:800;color:${NAVY};">${fmtInt(s.balance)}</span><span style="font-size:12px;color:${GREEN};font-weight:600;">Canjéalas por recompensas en caja</span></button>`;
  }
  el.innerHTML = `<div style="display:flex;align-items:center;gap:14px;"><div style="width:52px;height:52px;border-radius:50%;background:${COIN_BG};display:flex;align-items:center;justify-content:center;">${svg('coin', '#9A6A12', 28)}</div>${body}${streakHtml}</div>`;
}

function todaysDoses() {
  const taken = ApoloLocal.dosesTaken();
  const list = [];
  ApoloLocal.meds().forEach((m) => (m.times || []).forEach((t) => list.push({ med: m, time: t, taken: taken[`${m.id}@${t}`] || null })));
  return list.sort((a, b) => toMin(a.time) - toMin(b.time));
}

function renderGoals(s) {
  const el = document.getElementById('apolo-goals');
  if (!el) return;
  const st = s?.settings || {};
  const goal = Number(st.step_goal || 8000);
  const cSteps = Number(st.coins_steps ?? 2), cWeight = Number(st.coins_weight ?? 3), cDose = Number(st.coins_dose ?? 1), maxDoses = Number(st.max_doses_per_day ?? 3);
  const enrolled = !!(s && s.enrolled);
  const steps = ApoloLocal.stepsFor();
  const stepsDone = s?.today?.steps || steps >= goal;
  const weightDone = s?.today?.weight_week || ApoloLocal.weightThisWeek();
  const doses = todaysDoses();
  const claimedSlots = new Set((s?.today?.dose_slots) || []);
  const doseCoinsLeft = Math.max(0, maxDoses - claimedSlots.size);
  // Possible today = already earned + what can still be claimed today.
  const remaining = (s?.today?.steps ? 0 : cSteps) + (s?.today?.weight_week ? 0 : cWeight)
    + Math.max(0, Math.min(doses.length, maxDoses) - claimedSlots.size) * cDose;
  const possible = Number(s?.today?.earned || 0) + remaining;
  const earnedEl = document.getElementById('apolo-today-earned');
  if (earnedEl) earnedEl.textContent = enrolled ? `${fmtInt(s.today?.earned || 0)} de ${fmtInt(possible)} Monedas posibles` : '';

  const row = (icon, iconBg, iconColor, title, coinTag, sub, pct, action) => `
    <div style="display:flex;align-items:center;gap:12px;">
      ${iconBox(icon, iconBg, iconColor)}
      <div style="flex:1;display:flex;flex-direction:column;gap:5px;min-width:0;">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;"><span style="font-size:14px;font-weight:700;">${title}</span>${coinTag}</div>
        <span style="font-size:12px;color:${MUTED};">${sub}</span>
        <div style="height:8px;border-radius:99px;background:#E9EDF5;overflow:hidden;"><div style="width:${Math.max(0, Math.min(100, pct))}%;height:8px;border-radius:99px;background:${GREEN};"></div></div>
      </div>
      ${action || ''}
    </div>`;
  const actBtn = (label, fn) => `<button type="button" onclick="${fn}" style="min-height:44px;min-width:64px;border:1px solid ${NAVY};border-radius:10px;background:#fff;color:${NAVY};font-weight:700;font-size:12px;cursor:pointer;">${label}</button>`;
  const tag = (n, done) => enrolled ? pill(done ? `+${n} ganadas` : `+${n}`, done ? GREEN : COIN_INK, done ? '#E6F4EC' : COIN_BG) : '';

  const rows = [];
  rows.push(row('walk', '#EEF0FA', NAVY, `Caminar ${fmtInt(goal)} pasos`, tag(cSteps, !!s?.today?.steps),
    `${fmtInt(steps)} de ${fmtInt(goal)}`, (steps / goal) * 100, actBtn(stepsDone ? 'Editar' : 'Anotar', 'apoloEnterSteps()')));
  rows.push(row('scale', '#EEF0FA', NAVY, 'Actualizar tu peso', tag(cWeight, !!s?.today?.weight_week),
    weightDone ? 'Esta semana ya lo actualizaste' : 'Una vez por semana', weightDone ? 100 : 0, actBtn(weightDone ? 'Ver' : 'Anotar', 'apoloEnterWeight()')));
  if (doses.length === 0) {
    rows.push(row('pill', '#E6F4EC', GREEN, 'Tomar tu medicina a tiempo', enrolled ? pill(`+${cDose} por toma`) : '',
      'Agrega tus medicinas para recibir recordatorios', 0, actBtn('Agregar', 'apoloEditMeds()')));
  } else {
    doses.forEach((d) => {
      const claimed = claimedSlots.has(d.time);
      const sub = d.taken ? `Tomada a las ${new Date(d.taken).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Mexico_City' })}` : 'Pendiente';
      const coinTag = enrolled ? (claimed ? pill(`+${cDose} ganada`, GREEN, '#E6F4EC') : (doseCoinsLeft > 0 ? pill(`+${cDose}`) : '')) : '';
      rows.push(row('pill', '#E6F4EC', GREEN, `${esc(d.med.name)} ${fmtTime(d.time)}`, coinTag, sub, d.taken ? 100 : 0,
        d.taken ? '' : actBtn('Tomé', `apoloTakeDose('${esc(d.med.id)}','${esc(d.time)}')`)));
    });
  }
  el.innerHTML = card(`<div style="display:flex;flex-direction:column;gap:16px;">${rows.join('')}</div>`) +
    (enrolled || !ctx.getAuthUser() ? '' : `<p style="font-size:12px;color:${MUTED};margin:8px 2px 0;">Activa Monedas Apolo para que tus metas te den Monedas.</p>`) +
    `<p style="font-size:11px;color:${MUTED};margin:8px 2px 0;">Los pasos se anotan a mano (sin sensor). Máximo ${fmtInt(st.step_entry_max || 40000)} al día; la meta da Monedas una vez al día.</p>`;
}

window.apoloEnterSteps = async function () {
  const s = await loadStatus().catch(() => null);
  const max = Number(s?.settings?.step_entry_max || 40000);
  const goal = Number(s?.settings?.step_goal || 8000);
  openSheet('¿Cuántos pasos llevas hoy?', `
    <p style="font-size:13px;color:${MUTED};margin:0 0 10px;">Copia el número de tu teléfono o pulsera. Meta: ${fmtInt(goal)} pasos.</p>
    <label for="apolo-steps" style="font-size:13px;font-weight:600;">Pasos de hoy</label>
    <input id="apolo-steps" type="number" inputmode="numeric" min="0" max="${max}" value="${ApoloLocal.stepsFor() || ''}" style="width:100%;margin:6px 0 14px;padding:12px;border:2px solid ${BORDER};border-radius:12px;font-size:18px;">
    <button type="button" onclick="apoloSaveSteps(${max},${goal})" style="${btnPrimary}">Guardar</button>`);
  setTimeout(() => document.getElementById('apolo-steps')?.focus(), 50);
};
window.apoloSaveSteps = async function (max, goal) {
  const n = Math.round(Number(document.getElementById('apolo-steps')?.value));
  if (!Number.isFinite(n) || n < 0) { ctx.showToast('Escribe un número de pasos', 'warning'); return; }
  if (n > max) { ctx.showToast(`El máximo que se puede anotar es ${fmtInt(max)} pasos al día`, 'warning'); return; }
  ApoloLocal.setSteps(n);
  closeSheet();
  if (n >= goal) await claim('steps');
  if (document.getElementById('apolo-goals')) renderInicio();
};

window.apoloEnterWeight = function () {
  const last = ApoloLocal.weights().slice(-1)[0];
  openSheet('Actualizar tu peso', `
    <p style="font-size:13px;color:${MUTED};margin:0 0 10px;">Se guarda solo en tu teléfono.${last ? ` Último: ${last.kg} kg (${last.date}).` : ''}</p>
    <label for="apolo-weight" style="font-size:13px;font-weight:600;">Peso (kg)</label>
    <input id="apolo-weight" type="number" inputmode="decimal" step="0.1" min="20" max="300" style="width:100%;margin:6px 0 14px;padding:12px;border:2px solid ${BORDER};border-radius:12px;font-size:18px;">
    <button type="button" onclick="apoloSaveWeight()" style="${btnPrimary}">Guardar</button>`);
};
window.apoloSaveWeight = async function () {
  const kg = Number(document.getElementById('apolo-weight')?.value);
  if (!(kg >= 20 && kg <= 300)) { ctx.showToast('Escribe tu peso en kg (20 a 300)', 'warning'); return; }
  ApoloLocal.addWeight(Math.round(kg * 10) / 10);
  closeSheet();
  await claim('weight');
  if (document.getElementById('apolo-goals')) renderInicio();
  else if (window.apoloRefreshSalud) window.apoloRefreshSalud();
};

window.apoloTakeDose = async function (medId, time) {
  ApoloLocal.markDose(medId, time);
  const res = await claim('dose', time);
  if (res?.reason === 'fuera_de_horario') ctx.showToast('Anotado. Las Monedas solo cuentan si la tomas cerca de su hora.', 'info');
  else if (res?.reason === 'tope_diario') ctx.showToast('Anotado. Ya ganaste el máximo de Monedas por medicinas de hoy.', 'info');
  if (document.getElementById('apolo-goals')) renderInicio();
  else if (window.apoloRefreshSalud) window.apoloRefreshSalud();
};

// Medicines (device-only): name, times, supply for the refill countdown.
window.apoloEditMeds = function () {
  const meds = ApoloLocal.meds();
  const rows = meds.map((m) => `
    <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid ${BORDER};">
      <div style="flex:1;min-width:0;"><div style="font-weight:700;font-size:14px;">${esc(m.name)}</div><div style="font-size:12px;color:${MUTED};">${(m.times || []).map(fmtTime).join(' · ') || 'Sin horario'}${m.supply ? ` · ${m.supply} pzas` : ''}</div></div>
      <button type="button" onclick="apoloMedForm('${esc(m.id)}')" style="min-height:40px;border:1px solid ${BORDER};border-radius:10px;background:#fff;padding:0 12px;cursor:pointer;">Editar</button>
    </div>`).join('');
  openSheet('Mis medicinas', `
    <p style="font-size:12px;color:${MUTED};margin:0 0 6px;">Se guardan solo en tu teléfono. Sirven para tus recordatorios y para avisarte cuándo resurtir.</p>
    ${rows || `<p style="font-size:14px;color:${MUTED};">Aún no agregas medicinas.</p>`}
    <button type="button" onclick="apoloMedForm()" style="${btnPrimary};margin-top:14px;">Agregar medicina</button>`);
};
window.apoloMedForm = function (id) {
  const m = ApoloLocal.meds().find((x) => x.id === id) || { name: '', dose: '', times: ['08:00'], supply: '', supplyDate: mxToday() };
  openSheet(id ? 'Editar medicina' : 'Agregar medicina', `
    <label style="font-size:13px;font-weight:600;" for="am-name">Nombre</label>
    <input id="am-name" maxlength="80" value="${esc(m.name)}" placeholder="Ej. Metformina 850 mg" style="width:100%;margin:6px 0 12px;padding:12px;border:2px solid ${BORDER};border-radius:12px;font-size:16px;">
    <label style="font-size:13px;font-weight:600;" for="am-times">Horarios (separa con comas, formato 24 h)</label>
    <input id="am-times" value="${esc((m.times || []).join(', '))}" placeholder="08:00, 20:00" style="width:100%;margin:6px 0 12px;padding:12px;border:2px solid ${BORDER};border-radius:12px;font-size:16px;">
    <label style="font-size:13px;font-weight:600;" for="am-supply">Piezas que tienes hoy (para el resurtido)</label>
    <input id="am-supply" type="number" inputmode="numeric" min="0" max="1000" value="${m.supply != null && id ? esc(medDaysLeft(m) != null ? medDaysLeft(m) * (m.times || []).length : m.supply) : ''}" style="width:100%;margin:6px 0 16px;padding:12px;border:2px solid ${BORDER};border-radius:12px;font-size:16px;">
    <button type="button" onclick="apoloSaveMed('${id ? esc(id) : ''}')" style="${btnPrimary}">Guardar</button>
    ${id ? `<button type="button" onclick="apoloDeleteMed('${esc(id)}')" style="${btnOutline};margin-top:10px;border-color:#B42318;color:#B42318;">Quitar medicina</button>` : ''}`);
};
window.apoloSaveMed = function (id) {
  const name = (document.getElementById('am-name')?.value || '').trim();
  const times = (document.getElementById('am-times')?.value || '').split(/[,\s]+/).map((t) => t.trim()).filter(Boolean)
    .map((t) => { const m = t.match(/^(\d{1,2})(?::(\d{2}))?$/); if (!m) return null; const h = +m[1], mm = +(m[2] || 0); return h < 24 && mm < 60 ? `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}` : null; });
  if (!name) { ctx.showToast('Escribe el nombre', 'warning'); return; }
  if (times.some((t) => t === null) || times.length === 0 || times.length > 6) { ctx.showToast('Revisa los horarios (ej. 08:00, 20:00)', 'warning'); return; }
  const supplyRaw = document.getElementById('am-supply')?.value;
  const supply = supplyRaw === '' ? null : Math.max(0, Math.round(Number(supplyRaw)));
  const meds = ApoloLocal.meds();
  const rec = { id: id || 'm' + Math.random().toString(36).slice(2, 9), name: name.slice(0, 80), times: [...new Set(times)].sort(), supply, supplyDate: supply != null ? mxToday() : null };
  ApoloLocal.saveMeds(id ? meds.map((m) => (m.id === id ? rec : m)) : [...meds, rec]);
  closeSheet();
  ctx.showToast('Medicina guardada', 'success');
  if (document.getElementById('apolo-goals')) renderInicio();
  else if (window.apoloRefreshSalud) window.apoloRefreshSalud();
};
window.apoloDeleteMed = function (id) {
  ApoloLocal.saveMeds(ApoloLocal.meds().filter((m) => m.id !== id));
  closeSheet();
  if (document.getElementById('apolo-goals')) renderInicio();
  else if (window.apoloRefreshSalud) window.apoloRefreshSalud();
};

// ============================================================
// MONEDAS APOLO
// ============================================================
const KIND_EARN = [
  ['walk', 'Meta de pasos del día', 'coins_steps', 2, '1 vez al día'],
  ['scale', 'Actualizar tu peso', 'coins_weight', 3, '1 vez por semana'],
  ['pill', 'Tomar tu medicina a tiempo', 'coins_dose', 1, 'por toma, hasta 3 al día'],
  ['cal', 'Chequeo en sucursal completado', 'coins_chequeo', 10, 'lo registra la sucursal'],
  ['flame', 'Racha de 7 días con al menos una meta', 'coins_streak7', 15, 'cada 7 días seguidos'],
];
const HISTORY_LABEL = {
  earn_steps: 'Meta de pasos', earn_weight: 'Actualizaste tu peso', earn_dose: 'Medicina a tiempo',
  earn_chequeo: 'Chequeo en sucursal', earn_streak7: 'Racha de 7 días', redeem: 'Canje en caja', redeem_reversal: 'Canje cancelado', adjust: 'Ajuste',
};

export async function renderMonedas() {
  const main = ctx.getMain();
  main.innerHTML = wrap(pageHeader('Monedas Apolo', 'Cuidarte te da recompensas') + `<div id="apolo-monedas" style="padding:16px 16px 24px;display:flex;flex-direction:column;gap:12px;"><p style="color:${MUTED};">Cargando…</p></div>`);
  const box = document.getElementById('apolo-monedas');
  if (!ctx.getAuthUser()) {
    const tiers = window.FarmaciaAPI?.getCoinTiersPublic ? await window.FarmaciaAPI.getCoinTiersPublic() : [];
    box.innerHTML = card(`<div style="font-weight:800;margin-bottom:6px;">Inicia sesión</div><p style="font-size:14px;color:${MUTED};margin:0 0 12px;">Monedas Apolo es para clientes con cuenta.</p><button type="button" onclick="goPage('login')" style="${btnPrimary}">Iniciar sesión</button>`) + earnHtml(null) + ladderHtml({ tiers });
    return;
  }
  const s = await loadStatus(true);
  if (!s || !s.customer) {
    box.innerHTML = card(`<p style="font-size:14px;color:${MUTED};margin:0;">No pudimos cargar tus Monedas. Revisa tu conexión e intenta de nuevo.</p>`);
    return;
  }
  if (!s.enrolled) {
    box.innerHTML = enrollHtml() + earnHtml(s) + ladderHtml(s);
    return;
  }
  const next = (s.tiers || []).find((t) => t.coins > s.balance);
  const prev = [...(s.tiers || [])].reverse().find((t) => t.coins <= s.balance);
  const base = prev ? prev.coins : 0;
  const pct = next ? Math.round(((s.balance - base) / (next.coins - base)) * 100) : 100;
  box.innerHTML = `
    <div style="background:${NAVY_DARK};border-radius:18px;padding:16px;color:#fff;display:flex;gap:14px;align-items:center;">
      <div style="flex:1;display:flex;flex-direction:column;gap:4px;">
        <span style="font-size:12px;color:#C9D0F2;font-weight:600;">Tu saldo</span>
        <span style="font-size:34px;font-weight:800;">${fmtInt(s.balance)} <span style="font-size:15px;font-weight:700;">Monedas</span></span>
        <span style="font-size:12px;color:#C9D0F2;">Muestra este código en caja para canjear</span>
        <div style="display:flex;gap:6px;margin-top:4px;">${pill(`Racha ${fmtInt(s.streak)} ${Number(s.streak) === 1 ? 'día' : 'días'}`)}</div>
      </div>
      <div aria-label="Código para canjear en caja" style="background:#fff;color:${INK};border-radius:12px;padding:10px 12px;text-align:center;min-width:104px;">
        <div style="font-size:11px;color:${MUTED};font-weight:600;">Código</div>
        <div style="font-size:24px;font-weight:800;letter-spacing:2px;font-family:ui-monospace,Menlo,monospace;">${esc(s.code || '')}</div>
      </div>
    </div>
    <p style="font-size:12px;color:${MUTED};margin:0 2px;">Las Monedas no son dinero: no se cambian por efectivo. Solo se canjean por las recompensas de abajo, en caja.</p>
    ${card(next ? `
      <div style="display:flex;justify-content:space-between;gap:8px;font-size:13px;"><span style="font-weight:700;">Siguiente: ${esc(next.title)}</span><span style="color:${MUTED};white-space:nowrap;">${fmtInt(next.coins - s.balance)} más</span></div>
      <div style="height:10px;border-radius:99px;background:#E9EDF5;overflow:hidden;margin-top:8px;"><div style="width:${Math.max(3, Math.min(100, pct))}%;height:10px;background:${GREEN};border-radius:99px;"></div></div>` : `<div style="font-weight:700;font-size:13px;">¡Alcanzas todas las recompensas!</div>`)}
    ${earnHtml(s)}
    ${ladderHtml(s)}
    <h2 style="margin:4px 0 0;font-size:17px;font-weight:800;">Movimientos</h2>
    ${card((s.history || []).length ? (s.history || []).map((h) => `
      <div style="display:flex;justify-content:space-between;gap:8px;font-size:13px;padding:6px 0;">
        <span style="color:${MUTED};width:62px;flex-shrink:0;">${histDay(h.day)}</span>
        <span style="flex:1;font-weight:600;">${esc(h.coins < 0 || h.kind === 'redeem_reversal' ? (h.label || HISTORY_LABEL[h.kind]) : HISTORY_LABEL[h.kind] || h.label || '')}</span>
        <span style="font-weight:800;color:${h.coins > 0 ? GREEN : '#B42318'};white-space:nowrap;">${h.coins > 0 ? '+' : '−'}${fmtInt(Math.abs(h.coins))}</span>
      </div>`).join('') : `<p style="font-size:14px;color:${MUTED};margin:0;">Aún no tienes movimientos. Cumple una meta de hoy para empezar.</p>`)}
    <button type="button" onclick="apoloUnenroll()" style="background:none;border:none;color:${MUTED};font-size:12px;text-decoration:underline;cursor:pointer;min-height:44px;">Desactivar Monedas Apolo</button>`;
}
function histDay(day) {
  if (!day) return '';
  if (day === mxToday()) return 'Hoy';
  if (day === mxToday(-1)) return 'Ayer';
  const d = new Date(day + 'T12:00:00');
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}
function enrollHtml() {
  return card(`
    <div style="font-weight:800;font-size:16px;margin-bottom:6px;">Activa Monedas Apolo</div>
    <p style="font-size:13px;color:${MUTED};margin:0 0 10px;line-height:1.5;">
      Monedas Apolo es nuestro programa de lealtad (una finalidad secundaria de nuestro Aviso de Privacidad, por eso te pedimos activarlo).
      Para darte Monedas, la app envía a nuestros servidores <b>solo el aviso de que cumpliste una meta</b> (por ejemplo "meta de pasos", "peso actualizado" o "medicina a tiempo").
      Tus valores de salud —pasos, peso, nombres de tus medicinas— <b>se quedan en tu teléfono</b>.
      Las Monedas no son dinero ni se cambian por efectivo: solo se canjean por las recompensas de la lista, en caja. Puedes desactivarlo cuando quieras.
    </p>
    <label style="display:flex;gap:10px;align-items:flex-start;font-size:13px;margin-bottom:12px;cursor:pointer;">
      <input type="checkbox" id="apolo-consent" style="width:20px;height:20px;margin-top:2px;flex-shrink:0;">
      <span>Acepto participar en Monedas Apolo en los términos anteriores y del <a href="#" onclick="event.preventDefault();goPage('privacidad')" style="color:${NAVY};">Aviso de Privacidad</a>.</span>
    </label>
    <button type="button" onclick="apoloEnroll()" style="${btnPrimary}">Activar Monedas Apolo</button>`);
}
window.apoloEnroll = async function () {
  if (!document.getElementById('apolo-consent')?.checked) { ctx.showToast('Marca la casilla para aceptar', 'warning'); return; }
  const { error } = await window.FarmaciaAPI.coinsEnroll(CONSENT_VERSION);
  if (error) { ctx.showToast(error.message || 'No se pudo activar', 'error'); return; }
  statusCache.at = 0;
  ctx.showToast('¡Monedas Apolo activado!', 'success');
  renderMonedas();
};
window.apoloUnenroll = function () {
  openSheet('Desactivar Monedas Apolo', `
    <p style="font-size:14px;color:${MUTED};margin:0 0 14px;line-height:1.5;">Dejarás de ganar Monedas y no podrás canjear mientras esté desactivado. Tu saldo se conserva si lo vuelves a activar.</p>
    <button type="button" onclick="apoloDoUnenroll()" style="${btnOutline};border-color:#B42318;color:#B42318;">Desactivar</button>`);
};
window.apoloDoUnenroll = async function () {
  const { error } = await window.FarmaciaAPI.coinsUnenroll();
  closeSheet();
  if (error) { ctx.showToast(error.message || 'No se pudo desactivar', 'error'); return; }
  statusCache.at = 0;
  ctx.showToast('Monedas Apolo desactivado', 'info');
  renderMonedas();
};
function earnHtml(s) {
  const st = s?.settings || {};
  return `<h2 style="margin:4px 0 0;font-size:17px;font-weight:800;">Cómo ganar</h2>` + card(`<div style="display:flex;flex-direction:column;gap:6px;">${KIND_EARN.map(([ic, label, key, def, note]) => `
    <div style="display:flex;align-items:center;gap:12px;padding:4px 0;">${iconBox(ic, '#EEF0FA', NAVY, 36)}
      <div style="flex:1;"><div style="font-size:14px;font-weight:600;">${label}</div><div style="font-size:11px;color:${MUTED};">${note}</div></div>
      <span style="font-size:14px;font-weight:800;color:${GREEN};white-space:nowrap;">+${fmtInt(st[key] ?? def)}</span></div>`).join('')}</div>`);
}
function ladderHtml(s) {
  const tiers = s?.tiers || [];
  const bal = Number(s?.balance || 0);
  if (!tiers.length) return '';
  return `<h2 style="margin:4px 0 0;font-size:17px;font-weight:800;">Recompensas</h2>` + card(`<div style="display:flex;flex-direction:column;">${tiers.map((t, i) => {
    const ok = s?.enrolled && bal >= t.coins;
    return `<div style="display:flex;align-items:center;gap:12px;padding:10px 0;${i ? `border-top:1px solid ${BORDER};` : ''}">
      <div style="width:34px;height:34px;border-radius:50%;background:${ok ? '#E6F4EC' : '#EEF0FA'};display:flex;align-items:center;justify-content:center;flex-shrink:0;">${ok ? svg('check', GREEN, 18) : svg('gift', NAVY, 18)}</div>
      <div style="flex:1;font-size:13px;font-weight:600;">${esc(t.title)}</div>
      <span style="font-size:12px;font-weight:800;color:${ok ? GREEN : COIN_INK};white-space:nowrap;">${fmtInt(t.coins)}</span></div>`;
  }).join('')}</div>`) + `<p style="font-size:11px;color:${MUTED};margin:0 2px;">Canjea en caja mostrando tu código. Cada descuento aplica a una compra.</p>`;
}

// ============================================================
// AHORRO
// ============================================================
export async function renderAhorro() {
  const main = ctx.getMain();
  const user = ctx.getAuthUser();
  const tile = (icon, label, fn) => `<button type="button" onclick="${fn}" style="background:#fff;border:1px solid ${BORDER};border-radius:14px;padding:12px 6px;display:flex;flex-direction:column;align-items:center;gap:6px;font-size:12px;font-weight:600;color:${INK};cursor:pointer;min-height:88px;text-align:center;">${iconBox(icon, '#EEF0FA', NAVY, 36)}${label}</button>`;
  main.innerHTML = wrap(pageHeader('Ahorro', 'Paga menos por cuidarte') + `
    <div style="padding:16px 16px 24px;display:flex;flex-direction:column;gap:12px;">
      <div id="apolo-savings" style="background:${NAVY_DARK};border-radius:18px;padding:16px;color:#fff;min-height:80px;">
        <div style="font-size:12px;color:#C9D0F2;font-weight:700;letter-spacing:.04em;">ESTE MES AHORRASTE</div>
        <div style="font-size:30px;font-weight:800;">${user ? '…' : '—'}</div>
        <div style="font-size:12px;color:#C9D0F2;">${user ? '' : 'Inicia sesión para ver tu ahorro'}</div>
      </div>
      <h2 style="margin:4px 0 0;font-size:17px;font-weight:800;">¿Hay genérico?</h2>
      <form onsubmit="event.preventDefault();apoloSearchGeneric()" style="display:flex;gap:8px;">
        <label for="apolo-gen-q" style="position:absolute;left:-9999px;">Buscar producto</label>
        <input id="apolo-gen-q" placeholder="Busca un producto" style="flex:1;min-height:44px;padding:0 12px;border:2px solid ${BORDER};border-radius:12px;font-size:15px;">
        <button type="submit" style="min-height:44px;padding:0 16px;border:none;border-radius:12px;background:${NAVY};color:#fff;font-weight:700;cursor:pointer;">Buscar</button>
      </form>
      <div id="apolo-generics"><p style="font-size:13px;color:${MUTED};">Cargando…</p></div>
      <h2 style="margin:4px 0 0;font-size:17px;font-weight:800;">Recargas y pagos</h2>
      <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;">
        ${tile('phone', 'Recarga celular', "apoloPayInfo('recarga')")}${tile('bolt', 'Pagar luz y más', "apoloPayInfo('servicio')")}${tile('gift', 'Tarjetas de regalo', "apoloPayInfo('tarjeta')")}
      </div>
      <p style="font-size:12px;color:${MUTED};margin:0 2px;">Por ahora se pagan en caja: dile al cajero qué necesitas.</p>
      <h2 style="margin:4px 0 0;font-size:17px;font-weight:800;">Compras y membresía</h2>
      <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;">
        ${tile('cart', 'Compras', "goPage('shop')")}${tile('box', 'Mis pedidos', "goPage('orders')")}${tile('star', 'Membresías', "goPage('membresias')")}
      </div>
    </div>`);
  if (user && window.FarmaciaAPI?.getMySavings) {
    window.FarmaciaAPI.getMySavings().then((sv) => {
      const el = document.getElementById('apolo-savings');
      if (!el) return;
      if (!sv || !sv.customer) { el.querySelector('div:nth-child(2)').textContent = 'No disponible'; return; }
      el.innerHTML = `<div style="font-size:12px;color:#C9D0F2;font-weight:700;letter-spacing:.04em;">ESTE MES AHORRASTE</div>
        <div style="font-size:30px;font-weight:800;">${fmtMXN(sv.total)}</div>
        <div style="font-size:12px;color:#C9D0F2;">${fmtMXN(sv.membership)} con tu membresía · ${fmtMXN(sv.generics)} en genéricos · ${fmtMXN(sv.coins)} con Monedas Apolo</div>`;
    });
  }
  loadGenerics(null);
}
window.apoloSearchGeneric = () => loadGenerics((document.getElementById('apolo-gen-q')?.value || '').trim() || null);
async function loadGenerics(q) {
  const box = document.getElementById('apolo-generics');
  if (!box) return;
  box.innerHTML = `<p style="font-size:13px;color:${MUTED};">Buscando…</p>`;
  const groups = await (window.FarmaciaAPI?.getGenericOptions ? window.FarmaciaAPI.getGenericOptions(q) : Promise.resolve([]));
  if (!groups.length) {
    box.innerHTML = card(`<p style="font-size:13px;color:${MUTED};margin:0;">${q ? 'No encontramos equivalentes para esa búsqueda.' : 'Pronto verás aquí comparaciones.'} Los medicamentos con receta se consultan en sucursal.</p>`);
    return;
  }
  box.innerHTML = groups.slice(0, q ? 10 : 3).map((g) => {
    const best = (g.alternatives || [])[0];
    const cheaper = best && Number(best.price) < Number(g.price);
    return card(`
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;margin-bottom:10px;"><span style="font-size:14px;font-weight:700;">${esc(g.name)}</span>${pill('Mismo activo', NAVY, '#EEF0FA')}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <div style="border:1px solid ${BORDER};border-radius:12px;padding:10px;"><div style="font-size:11px;color:${MUTED};font-weight:600;">Este producto</div><div style="font-size:20px;font-weight:800;">${fmtMXN(g.price)}</div></div>
        ${best ? `<div style="border:2px solid ${cheaper ? GREEN : BORDER};border-radius:12px;padding:10px;background:${cheaper ? '#F2FBF6' : '#fff'};"><div style="font-size:11px;color:${MUTED};font-weight:600;">${cheaper ? 'Equivalente más barato' : 'Equivalente'}</div><div style="font-size:20px;font-weight:800;color:${cheaper ? GREEN : INK};">${fmtMXN(best.price)}</div><div style="font-size:11px;color:${MUTED};">${esc(best.name)}${best.laboratorio ? ' · ' + esc(best.laboratorio) : ''}</div></div>` : ''}
      </div>
      ${cheaper ? `<div style="font-size:12px;color:${GREEN};font-weight:700;margin:8px 0;">Ahorras ${fmtMXN(Number(g.price) - Number(best.price))}</div>` : ''}
      ${best && best.in_stock ? `<button type="button" onclick="apoloReserve('${esc(best.id)}','${esc(best.name).replace(/'/g, '')}')" style="${btnOutline}">Apartar ${cheaper ? 'el equivalente' : 'este'}</button>` : `<div style="font-size:12px;color:${MUTED};">Sin existencia por ahora.</div>`}`, 'margin-bottom:10px;');
  }).join('');
}
window.apoloReserve = async function (inventoryId, name) {
  if (!ctx.getAuthUser()) { ctx.showToast('Inicia sesión para apartar', 'warning'); ctx.goPage('login'); return; }
  const { error } = await window.FarmaciaAPI.requestRefill({ inventoryId, quantity: 1, notes: `Apartado desde la app: ${name}` });
  if (error) { ctx.showToast('No se pudo apartar. Intenta de nuevo.', 'error'); return; }
  ctx.showToast('Apartado. Te lo tenemos en sucursal.', 'success');
};
window.apoloPayInfo = function (kind) {
  const txt = {
    recarga: ['Recarga celular', 'Telcel, AT&T, Movistar, Bait y más, además de paquetes de datos. Pagas el monto de la recarga más la comisión de servicio.'],
    servicio: ['Pagar luz y más', 'CFE, agua, Telmex, Izzi, Sky, Totalplay y más. Lleva tu recibo o número de referencia. Pagas el monto más la comisión de servicio.'],
    tarjeta: ['Tarjetas de regalo', 'Google Play, Xbox, Netflix, Amazon y más. Recibes el código en tu celular.'],
  }[kind];
  openSheet(txt[0], `
    <p style="font-size:14px;color:${INK};line-height:1.5;margin:0 0 10px;">${txt[1]}</p>
    <div style="background:#EEF0FA;border-radius:12px;padding:12px;font-size:13px;color:${NAVY};font-weight:600;line-height:1.5;">Se paga en caja en Farmacia Apolo: dile al cajero qué necesitas y el número. Por ahora no se puede pagar dentro de la app.</div>`);
};

// ============================================================
// CHEQUEO EN SUCURSAL
// ============================================================
const TESTS = [['glucosa', 'Glucosa', 'bolt'], ['presion', 'Presión', 'walk'], ['peso', 'Peso e IMC', 'scale']];
let chequeo = { tests: new Set(['glucosa']), day: null, time: null };

function openDays() {
  const out = [];
  for (let i = 0; out.length < 6 && i < 10; i++) {
    const date = mxToday(i);
    const d = new Date(date + 'T12:00:00');
    out.push({ date, label: i === 0 ? 'Hoy' : d.toLocaleDateString('es-MX', { weekday: 'short' }).replace('.', ''), num: d.getDate() });
  }
  return out;
}
function slotsFor(date) {
  const now = date === mxToday() ? mxMinutesNow() + 30 : -1;
  const out = [];
  for (let m = 8 * 60; m <= 21 * 60; m += 30) if (m > now) out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  return out;
}

window.apoloOpenChequeo = function () { renderChequeo(); setNavActive('salud'); };
export async function renderChequeo(refresh = true) {
  const main = ctx.getMain();
  // Fresh balance when the screen opens; chip taps reuse it.
  const s = await loadStatus(refresh).catch(() => null);
  const days = openDays();
  if (!chequeo.day || !days.some((d) => d.date === chequeo.day)) chequeo.day = days.find((d) => slotsFor(d.date).length)?.date || days[1].date;
  const slots = slotsFor(chequeo.day);
  if (!slots.includes(chequeo.time)) chequeo.time = slots[0] || null;
  const tests = [...chequeo.tests];
  const freeTier = s?.enrolled ? (s.tiers || []).find((t) => t.kind === 'free_service' && tests.length && tests.every((x) => (t.applies_to || []).includes(x)) && Number(s.balance) >= t.coins) : null;
  const price = s?.settings?.chequeo_price || '[PRECIO]';
  const chip = (sel, label, fn, sub = '') => `<button type="button" aria-pressed="${sel}" onclick="${fn}" style="min-height:48px;padding:8px 10px;border-radius:12px;border:${sel ? `2px solid ${NAVY}` : `1px solid ${BORDER}`};background:${sel ? '#EEF0FA' : '#fff'};color:${sel ? NAVY : INK};font-weight:700;font-size:13px;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;">${sub ? `<span style="font-size:11px;font-weight:600;color:${MUTED};">${sub}</span>` : ''}${label}</button>`;
  const dayObj = days.find((d) => d.date === chequeo.day);
  main.innerHTML = wrap(pageHeader('Chequeo en sucursal', 'Glucosa, presión, peso e IMC') + `
    <div style="padding:16px 16px 24px;display:flex;flex-direction:column;gap:14px;">
      <div><div style="font-size:15px;font-weight:800;margin-bottom:8px;">1. ¿Qué te medimos?</div>
        <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;">${TESTS.map(([id, label]) => chip(chequeo.tests.has(id), label, `apoloToggleTest('${id}')`)).join('')}</div></div>
      <div><div style="font-size:15px;font-weight:800;margin-bottom:8px;">2. Día</div>
        <div style="display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px;">${days.map((d) => chip(d.date === chequeo.day, String(d.num), `apoloPickDay('${d.date}')`, d.label)).join('')}</div></div>
      <div><div style="font-size:15px;font-weight:800;margin-bottom:8px;">3. Hora</div>
        ${slots.length ? `<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;">${slots.map((t) => chip(t === chequeo.time, fmtTime(t).replace(' ', ' '), `apoloPickTime('${t}')`)).join('')}</div>` : `<p style="font-size:13px;color:${MUTED};">No quedan horarios hoy. Elige otro día.</p>`}</div>
      <div><label for="apolo-chq-notes" style="font-size:15px;font-weight:800;">Notas (opcional)</label>
        <textarea id="apolo-chq-notes" maxlength="300" placeholder="Algo que debamos saber" style="width:100%;margin-top:8px;padding:12px;border:2px solid ${BORDER};border-radius:12px;font-size:15px;min-height:70px;font-family:inherit;"></textarea></div>
      ${chequeo.tests.has('glucosa') ? `<div style="background:#FFF7E6;border-radius:12px;padding:12px;font-size:13px;color:${COIN_INK};font-weight:600;">Para la glucosa, ven en ayunas de 8 horas.</div>` : ''}
      ${card(`<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;"><span style="font-size:14px;color:${MUTED};">Precio</span><span style="font-size:18px;font-weight:800;color:${freeTier ? GREEN : INK};">${freeTier ? 'Gratis con tus Monedas' : esc(price)}</span></div>
        ${freeTier ? `<div style="font-size:12px;color:${MUTED};margin-top:4px;">Canjea "${esc(freeTier.title)}" (${fmtInt(freeTier.coins)} Monedas) en caja.</div>` : ''}
        ${s?.enrolled ? `<div style="font-size:12px;color:${GREEN};font-weight:600;margin-top:4px;">Al completarlo ganas +${fmtInt(s.settings?.coins_chequeo ?? 10)} Monedas. Tus resultados aparecen en Mi control.</div>` : ''}`)}
      <button type="button" onclick="apoloBookChequeo()" ${!tests.length || !chequeo.time ? 'disabled' : ''} style="${btnPrimary}${!tests.length || !chequeo.time ? 'opacity:.5;cursor:not-allowed;' : ''}">${chequeo.time && dayObj ? `Agendar ${dayObj.label === 'Hoy' ? 'hoy' : dayObj.label + ' ' + dayObj.num} · ${fmtTime(chequeo.time)}` : 'Agendar'}</button>
    </div>`);
}
window.apoloToggleTest = (id) => { chequeo.tests.has(id) ? chequeo.tests.delete(id) : chequeo.tests.add(id); renderChequeo(false); };
window.apoloPickDay = (d) => { chequeo.day = d; chequeo.time = null; renderChequeo(false); };
window.apoloPickTime = (t) => { chequeo.time = t; renderChequeo(false); };
window.apoloBookChequeo = async function () {
  if (!ctx.getAuthUser()) { ctx.showToast('Inicia sesión para agendar', 'warning'); ctx.goPage('login'); return; }
  const tests = [...chequeo.tests];
  if (!tests.length || !chequeo.time) return;
  const notes = (document.getElementById('apolo-chq-notes')?.value || '').trim().slice(0, 300);
  // MX is UTC-6 year-round (no DST since 2022).
  const dateIso = new Date(`${chequeo.day}T${chequeo.time}:00-06:00`).toISOString();
  const { error } = await window.FarmaciaAPI.createChequeoAppointment({ dateIso, tests, notes: [tests.includes('glucosa') ? 'Ayuno 8 h' : '', notes].filter(Boolean).join(' · ') });
  if (error) { ctx.showToast(error.message || 'No se pudo agendar', 'error'); return; }
  ctx.showToast('¡Chequeo agendado! Lo verás en Salud › Citas.', 'success');
  window.__saludTab = 'citas';
  ctx.goPage('salud');
};

// ============================================================
// RESPIRAR 3 MINUTOS (4-7-8)
// ============================================================
let breathTimer = null;
window.apoloBreathe = function () {
  const el = openSheet('Respira 3 minutos', `
    <p style="font-size:13px;color:${MUTED};margin:0 0 12px;">Inhala 4 segundos, sostén 7, exhala 8. Baja el estrés antes de dormir.</p>
    <div style="display:flex;flex-direction:column;align-items:center;gap:14px;padding:10px 0 4px;">
      <div style="width:220px;height:220px;display:flex;align-items:center;justify-content:center;">
        <div id="apolo-breath-ball" style="width:90px;height:90px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#7CCBA2,${GREEN_BRAND});box-shadow:0 0 0 10px rgba(70,172,120,.15);transition:transform 4s ease-in-out;"></div>
      </div>
      <div id="apolo-breath-phase" aria-live="polite" style="font-size:22px;font-weight:800;color:${NAVY};">Listo</div>
      <div id="apolo-breath-time" style="font-size:13px;color:${MUTED};">3:00</div>
      <button type="button" id="apolo-breath-btn" onclick="apoloBreathStart()" style="${btnPrimary}">Empezar</button>
    </div>`);
  const obs = new MutationObserver(() => { if (!document.body.contains(el)) { clearInterval(breathTimer); breathTimer = null; obs.disconnect(); } });
  obs.observe(document.body, { childList: true });
};
window.apoloBreathStart = function () {
  const ball = document.getElementById('apolo-breath-ball');
  const phaseEl = document.getElementById('apolo-breath-phase');
  const timeEl = document.getElementById('apolo-breath-time');
  const btn = document.getElementById('apolo-breath-btn');
  if (!ball) return;
  if (btn) btn.style.display = 'none';
  const phases = [['Inhala', 4, 2.4], ['Sostén', 7, 2.4], ['Exhala', 8, 1]];
  const total = 180;
  let elapsed = 0, pi = 0, left = phases[0][1];
  const apply = () => { const [label, secs, scale] = phases[pi]; phaseEl.textContent = `${label} · ${left}`; ball.style.transition = `transform ${secs}s ease-in-out`; if (left === secs) ball.style.transform = `scale(${scale})`; };
  apply();
  clearInterval(breathTimer);
  breathTimer = setInterval(() => {
    elapsed++; left--;
    const r = total - elapsed;
    timeEl.textContent = `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`;
    if (elapsed >= total) {
      clearInterval(breathTimer); breathTimer = null;
      ball.style.transform = 'scale(1)';
      phaseEl.textContent = '¡Muy bien!';
      ApoloLocal.addBreathSession();
      if (btn) { btn.style.display = ''; btn.textContent = 'Cerrar'; btn.onclick = closeSheet; }
      return;
    }
    if (left <= 0) { pi = (pi + 1) % phases.length; left = phases[pi][1]; }
    apply();
  }, 1000);
};

window.apoloGo = function (page) { ctx.goPage(page); };

// ============================================================
// SALUD › MI CONTROL  and  SALUD › BIENESTAR   (fase 3)
// Rendered under the existing Salud header (tabs Mi control · Bienestar ·
// Citas · Recetas). Readings entered here stay on the device (aviso §7);
// in-store readings come from the customer's own appointments
// (nurse_vitals: ta "128/82", glicemia, weight_kg).
// ============================================================
const GLU_LOW = 80, GLU_HIGH = 130;   // ayunas, meta usual para personas con diabetes
const dayKey = (iso) => {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date(iso)); } catch (e) { return String(iso).slice(0, 10); }
};
const shortDay = (date) => new Date(date + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
const weekdayInitial = (date) => ['D', 'L', 'M', 'M', 'J', 'V', 'S'][new Date(date + 'T12:00:00').getDay()];

export const ApoloVitals = {
  list() { return LS.get('vitals', []); },
  add(v) { const all = ApoloVitals.list(); all.push({ ...v, at: new Date().toISOString() }); LS.set('vitals', all.slice(-400)); },
};

function glucoseStatus(v) {
  if (v < 70) return ['Baja', '#B42318', '#FEE4E2'];
  if (v < GLU_LOW) return ['Un poco baja', COIN_INK, COIN_BG];
  if (v <= GLU_HIGH) return ['En tu meta', GREEN, '#E6F4EC'];
  if (v <= 180) return ['Un poco alta', COIN_INK, COIN_BG];
  return ['Alta', '#B42318', '#FEE4E2'];
}
function bpStatus(sys, dia) {
  if (sys >= 180 || dia >= 120) return ['Muy alta: busca atención', '#B42318', '#FEE4E2'];
  if (sys >= 140 || dia >= 90) return ['Alta', '#B42318', '#FEE4E2'];
  if (sys >= 130 || dia >= 80) return ['Un poco alta', COIN_INK, COIN_BG];
  if (sys >= 120) return ['Elevada', COIN_INK, COIN_BG];
  if (sys < 90 || dia < 60) return ['Baja', COIN_INK, COIN_BG];
  return ['Normal', GREEN, '#E6F4EC'];
}

// All readings (device + in-store), newest first.
async function collectReadings() {
  const local = ApoloVitals.list().map((v) => ({ ...v, source: 'app' }));
  const store = [];
  if (ctx.getAuthUser() && window.FarmaciaAPI?.getMyStoreVitals) {
    (await window.FarmaciaAPI.getMyStoreVitals().catch(() => [])).forEach((a) => {
      const nv = a.nurse_vitals || {};
      const at = a.appointment_date;
      const g = parseFloat(nv.glicemia);
      if (Number.isFinite(g) && g > 0) store.push({ type: 'glucosa', value: g, at, source: 'sucursal' });
      const m = String(nv.ta || '').match(/(\d{2,3})\s*\/\s*(\d{2,3})/);
      if (m) store.push({ type: 'presion', sys: +m[1], dia: +m[2], at, source: 'sucursal' });
      const w = parseFloat(nv.weight_kg);
      if (Number.isFinite(w) && w > 0) store.push({ type: 'peso', kg: w, at, source: 'sucursal' });
    });
  }
  const weights = ApoloLocal.weights().map((w) => ({ type: 'peso', kg: w.kg, at: w.date + 'T12:00:00-06:00', source: 'app' }));
  return [...local, ...store, ...weights].sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

function lineChart(points, { w = 316, h = 150, min, max, band = null, label = '' } = {}) {
  // points: [{x: 0..n-1, y|null}] ; n = points.length
  const n = points.length;
  const pad = 14;
  const sx = (i) => pad + (i * (w - 2 * pad)) / Math.max(1, n - 1);
  const sy = (v) => h - pad - ((v - min) / Math.max(1, max - min)) * (h - 2 * pad);
  const pts = points.map((p, i) => (p.y == null ? null : [sx(i), sy(p.y)]));
  const segs = [];
  let cur = [];
  pts.forEach((p) => { if (p) cur.push(p); else if (cur.length) { segs.push(cur); cur = []; } });
  if (cur.length) segs.push(cur);
  return `<svg width="100%" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}" style="display:block;">
    ${band ? `<rect x="${pad - 4}" y="${sy(band[1])}" width="${w - 2 * pad + 8}" height="${Math.max(2, sy(band[0]) - sy(band[1]))}" rx="6" fill="#E6F4EC"></rect>` : ''}
    ${segs.map((sg) => `<polyline points="${sg.map((p) => p.join(',')).join(' ')}" fill="none" stroke="${NAVY}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"></polyline>`).join('')}
    ${pts.filter(Boolean).map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="${NAVY}"></circle>`).join('')}
  </svg>`;
}

export async function renderMiControl(headerHtml) {
  const main = ctx.getMain();
  main.innerHTML = headerHtml + wrap(`<div id="apolo-control" style="padding:16px 16px 24px;display:flex;flex-direction:column;gap:12px;"><p style="color:${MUTED};">Cargando…</p></div>`);
  window.apoloRefreshSalud = () => { if (document.getElementById('apolo-control')) renderMiControl(headerHtml); };
  const box = document.getElementById('apolo-control');
  const readings = await collectReadings();
  const s = await loadStatus().catch(() => null);
  const lastG = readings.find((r) => r.type === 'glucosa');
  const lastP = readings.find((r) => r.type === 'presion');
  const srcLabel = (r) => (r.source === 'sucursal' ? 'En sucursal' : 'Anotado por ti') + ' · ' + shortDay(dayKey(r.at));
  const statCard = (title, valueHtml, st, r, fn) => `
    <div style="background:#fff;border:1px solid ${BORDER};border-radius:16px;padding:14px;display:flex;flex-direction:column;gap:6px;">
      <span style="font-size:11px;font-weight:700;color:${MUTED};letter-spacing:.03em;">${title}</span>
      ${valueHtml}
      ${st ? pill(st[0], st[1], st[2]) : ''}
      <span style="font-size:11px;color:${MUTED};">${r ? srcLabel(r) : 'Sin lecturas'}</span>
      <button type="button" onclick="${fn}" style="min-height:40px;border:1px solid ${NAVY};border-radius:10px;background:#fff;color:${NAVY};font-weight:700;font-size:12px;cursor:pointer;margin-top:2px;">Anotar</button>
    </div>`;

  // 7-day glucose (latest reading per day)
  const days7 = [...Array(7)].map((_, i) => mxToday(i - 6));
  const gByDay = {};
  readings.filter((r) => r.type === 'glucosa').forEach((r) => { const d = dayKey(r.at); if (gByDay[d] == null) gByDay[d] = r.value; });
  const gPts = days7.map((d) => ({ y: gByDay[d] ?? null }));
  const gVals = gPts.map((p) => p.y).filter((v) => v != null);
  const gMin = Math.min(60, ...gVals) - 5, gMax = Math.max(160, ...gVals) + 5;

  // weight trend (last 10 readings, oldest → newest)
  const wReadings = readings.filter((r) => r.type === 'peso').slice(0, 10).reverse();
  const wVals = wReadings.map((r) => r.kg);

  const meds = ApoloLocal.meds();
  const medRows = meds.map((m) => {
    const left = medDaysLeft(m);
    const tag = left == null ? pill('Anota cuántas tienes', MUTED, '#EEF0FA') : left <= 3 ? pill(left === 0 ? 'Se terminó' : `Toca en ${left} ${left === 1 ? 'día' : 'días'}`, '#B42318', '#FEE4E2') : pill(`Toca en ${left} días`);
    return `<div style="display:flex;align-items:center;gap:12px;">${iconBox('pill')}<div style="flex:1;min-width:0;"><div style="font-size:14px;font-weight:700;">${esc(m.name)}</div><div style="font-size:12px;color:${MUTED};">${(m.times || []).map(fmtTime).join(' y ')}</div></div>${tag}</div>`;
  }).join('');

  box.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;">
      ${statCard('GLUCOSA', lastG ? `<span style="font-size:26px;font-weight:800;color:${NAVY};">${Math.round(lastG.value)} <span style="font-size:12px;font-weight:600;">mg/dL</span></span>` : `<span style="font-size:22px;font-weight:800;color:${MUTED};">—</span>`, lastG ? glucoseStatus(lastG.value) : null, lastG, "apoloAddReading('glucosa')")}
      ${statCard('PRESIÓN', lastP ? `<span style="font-size:26px;font-weight:800;color:${NAVY};">${lastP.sys}/${lastP.dia}</span>` : `<span style="font-size:22px;font-weight:800;color:${MUTED};">—</span>`, lastP ? bpStatus(lastP.sys, lastP.dia) : null, lastP, "apoloAddReading('presion')")}
    </div>
    ${card(`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;"><span style="font-size:15px;font-weight:800;">Glucosa · últimos 7 días</span><span style="font-size:12px;color:${MUTED};">Meta ${GLU_LOW} a ${GLU_HIGH}</span></div>
      ${gVals.length ? lineChart(gPts, { min: gMin, max: gMax, band: [GLU_LOW, GLU_HIGH], label: `Glucosa de los últimos 7 días: ${gVals.join(', ')} mg/dL` }) : `<p style="font-size:13px;color:${MUTED};margin:6px 0;">Anota tu glucosa o hazte un chequeo para ver tu gráfica.</p>`}
      <div style="display:flex;justify-content:space-between;padding:0 10px;font-size:11px;color:${MUTED};font-weight:600;">${days7.map((d) => `<span>${weekdayInitial(d)}</span>`).join('')}</div>`)}
    ${card(`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;"><span style="font-size:15px;font-weight:800;">Peso</span>${wVals.length ? `<span style="font-size:13px;font-weight:700;">${wVals[wVals.length - 1]} kg${wVals.length > 1 ? ` <span style="color:${MUTED};font-weight:600;">(${(wVals[wVals.length - 1] - wVals[0] >= 0 ? '+' : '')}${(wVals[wVals.length - 1] - wVals[0]).toFixed(1)} kg)</span>` : ''}</span>` : ''}</div>
      ${wVals.length > 1 ? lineChart(wReadings.map((r) => ({ y: r.kg })), { h: 110, min: Math.min(...wVals) - 2, max: Math.max(...wVals) + 2, label: `Tendencia de peso: ${wVals.join(', ')} kg` }) : `<p style="font-size:13px;color:${MUTED};margin:6px 0;">${wVals.length ? 'Anota tu peso otra vez la próxima semana para ver la tendencia.' : 'Aún no anotas tu peso.'}</p>`}
      <button type="button" onclick="apoloEnterWeight()" style="${btnOutline};margin-top:8px;">Actualizar peso</button>`)}
    <button type="button" onclick="apoloOpenChequeo()" style="text-align:left;background:${NAVY};border:none;border-radius:16px;padding:14px 16px;display:flex;align-items:center;gap:12px;color:#fff;cursor:pointer;">
      <div style="width:40px;height:40px;border-radius:12px;background:rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;flex-shrink:0;">${svg('cal', '#fff')}</div>
      <div style="flex:1;"><div style="font-size:15px;font-weight:800;">Chequeo en sucursal</div><div style="font-size:12px;color:#C9D0F2;">Glucosa, presión, peso e IMC${s?.enrolled ? ` · gana +${fmtInt(s.settings?.coins_chequeo ?? 10)} Monedas` : ''}</div></div>${svg('chev', '#fff')}
    </button>
    ${card(`<div style="display:flex;justify-content:space-between;align-items:center;"><span style="font-size:15px;font-weight:800;">Mis medicinas</span><button type="button" onclick="apoloEditMeds()" style="min-height:40px;border:none;background:none;color:${NAVY};font-weight:700;cursor:pointer;">Editar</button></div>
      <div style="display:flex;flex-direction:column;gap:12px;margin:8px 0 12px;">${medRows || `<p style="font-size:13px;color:${MUTED};margin:0;">Agrega tus medicinas para tus recordatorios y para saber cuándo resurtir.</p>`}</div>
      ${meds.length ? `<button type="button" onclick="apoloReserveRefill()" style="${btnOutline}">Apartar mi resurtido</button>` : `<button type="button" onclick="apoloMedForm()" style="${btnOutline}">Agregar medicina</button>`}`)}
    <p style="font-size:11px;color:${MUTED};margin:0 2px;">Lo que anotas aquí se guarda solo en tu teléfono. Las metas son orientativas; tu médico define las tuyas.</p>`;
}

window.apoloAddReading = function (type) {
  const body = type === 'glucosa' ? `
      <label for="ar-g" style="font-size:13px;font-weight:600;">Glucosa (mg/dL)</label>
      <input id="ar-g" type="number" inputmode="numeric" min="20" max="600" style="width:100%;margin:6px 0 10px;padding:12px;border:2px solid ${BORDER};border-radius:12px;font-size:18px;">
      <label style="display:flex;gap:8px;align-items:center;font-size:13px;margin-bottom:14px;"><input type="checkbox" id="ar-fast" checked style="width:20px;height:20px;">En ayunas</label>` : `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">
        <div><label for="ar-s" style="font-size:13px;font-weight:600;">Sistólica (alta)</label><input id="ar-s" type="number" inputmode="numeric" min="60" max="260" style="width:100%;margin-top:6px;padding:12px;border:2px solid ${BORDER};border-radius:12px;font-size:18px;"></div>
        <div><label for="ar-d" style="font-size:13px;font-weight:600;">Diastólica (baja)</label><input id="ar-d" type="number" inputmode="numeric" min="30" max="160" style="width:100%;margin-top:6px;padding:12px;border:2px solid ${BORDER};border-radius:12px;font-size:18px;"></div>
      </div>`;
  openSheet(type === 'glucosa' ? 'Anotar glucosa' : 'Anotar presión', `<p style="font-size:12px;color:${MUTED};margin:0 0 10px;">Se guarda solo en tu teléfono.</p>${body}<button type="button" onclick="apoloSaveReading('${type}')" style="${btnPrimary}">Guardar</button>`);
};
window.apoloSaveReading = function (type) {
  if (type === 'glucosa') {
    const v = Number(document.getElementById('ar-g')?.value);
    if (!(v >= 20 && v <= 600)) { ctx.showToast('Escribe un valor entre 20 y 600 mg/dL', 'warning'); return; }
    ApoloVitals.add({ type, value: Math.round(v), fasting: !!document.getElementById('ar-fast')?.checked });
  } else {
    const sys = Number(document.getElementById('ar-s')?.value), dia = Number(document.getElementById('ar-d')?.value);
    if (!(sys >= 60 && sys <= 260 && dia >= 30 && dia <= 160 && sys > dia)) { ctx.showToast('Revisa los valores de presión', 'warning'); return; }
    ApoloVitals.add({ type, sys: Math.round(sys), dia: Math.round(dia) });
    if (sys >= 180 || dia >= 120) ctx.showToast('Tu presión está muy alta. Si tienes dolor de pecho, falta de aire o dolor de cabeza fuerte, busca atención de inmediato.', 'error');
  }
  closeSheet();
  window.apoloRefreshSalud && window.apoloRefreshSalud();
};
window.apoloReserveRefill = async function () {
  if (!ctx.getAuthUser()) { ctx.showToast('Inicia sesión para apartar', 'warning'); ctx.goPage('login'); return; }
  const meds = ApoloLocal.meds();
  const due = meds.filter((m) => { const d = medDaysLeft(m); return d == null || d <= 7; });
  const list = (due.length ? due : meds).map((m) => m.name);
  openSheet('Apartar mi resurtido', `
    <p style="font-size:14px;margin:0 0 8px;">Te apartamos en sucursal:</p>
    <ul style="margin:0 0 12px 18px;font-size:14px;">${list.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
    <p style="font-size:12px;color:${MUTED};margin:0 0 14px;">Al apartar, enviamos los nombres de estas medicinas a la farmacia para preparar tu pedido. Si alguna requiere receta, tráela al recogerla.</p>
    <button type="button" onclick='apoloConfirmRefill(${JSON.stringify(list).replace(/'/g, "&#39;")})' style="${btnPrimary}">Apartar</button>`);
};
window.apoloConfirmRefill = async function (list) {
  const { error } = await window.FarmaciaAPI.requestRefill({ quantity: 1, notes: `Resurtido desde la app: ${list.join(', ')}`.slice(0, 500) });
  closeSheet();
  if (error) { ctx.showToast('No se pudo apartar. Intenta de nuevo.', 'error'); return; }
  ctx.showToast('¡Listo! Te avisamos cuando esté preparado.', 'success');
};

// ── BIENESTAR ──────────────────────────────────────────────────
const MOODS = [['Muy mal', '#B42318'], ['Mal', '#C2570C'], ['Normal', '#7A5200'], ['Bien', '#2F7D55'], ['Muy bien', '#1E6B47']];
const STRESS = ['Bajo', 'Medio', 'Alto'];
const moodFace = (i, color) => {
  const mouth = ['M8 16.5c1.2-1.6 2.6-2.3 4-2.3s2.8.7 4 2.3', 'M8.5 16c1-.9 2.2-1.3 3.5-1.3s2.5.4 3.5 1.3', 'M8.5 15.5h7', 'M8.5 14.5c1 .9 2.2 1.3 3.5 1.3s2.5-.4 3.5-1.3', 'M8 14c1.2 1.6 2.6 2.3 4 2.3s2.8-.7 4-2.3'][i];
  return `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M9 10h.01M15 10h.01"></path><path d="${mouth}"></path></svg>`;
};

export async function renderBienestar(headerHtml) {
  const main = ctx.getMain();
  window.apoloRefreshSalud = () => { if (document.getElementById('apolo-bienestar')) renderBienestar(headerHtml); };
  const today = mxToday();
  const moods = LS.get('mood', {});
  const stress = LS.get('stress', {});
  const sleep = LS.get('sleep', {});
  const s = await loadStatus().catch(() => null);
  const streak = s && s.enrolled ? Number(s.streak || 0) : localStreak();
  const toBonus = 7 - (streak % 7 || 0);
  const lastSleepKey = Object.keys(sleep).sort().pop();
  const sl = lastSleepKey ? sleep[lastSleepKey] : null;
  const days7 = [...Array(7)].map((_, i) => mxToday(i - 6));
  const stressVals = days7.map((d) => (stress[d] ? stress[d] : null));
  const firstHalf = stressVals.slice(0, 3).filter(Boolean), secondHalf = stressVals.slice(4).filter(Boolean);
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const trend = firstHalf.length && secondHalf.length ? (avg(secondHalf) < avg(firstHalf) - 0.2 ? ['Bajando', GREEN, '#E6F4EC'] : avg(secondHalf) > avg(firstHalf) + 0.2 ? ['Subiendo', COIN_INK, COIN_BG] : ['Estable', NAVY, '#EEF0FA']) : null;
  const breaths = ApoloLocal.breathSessions().filter((iso) => dayKey(iso) >= days7[0]).length;

  main.innerHTML = headerHtml + wrap(`<div id="apolo-bienestar" style="padding:16px 16px 24px;display:flex;flex-direction:column;gap:12px;">
    ${card(`<div style="font-size:15px;font-weight:800;margin-bottom:10px;">¿Cómo te sientes hoy?</div>
      <div style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;">${MOODS.map(([label, color], i) => {
        const sel = moods[today] === i + 1;
        return `<button type="button" aria-pressed="${sel}" onclick="apoloSetMood(${i + 1})" style="min-height:72px;border-radius:12px;border:${sel ? `2px solid ${NAVY}` : `1px solid ${BORDER}`};background:${sel ? '#EEF0FA' : '#fff'};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;cursor:pointer;font-size:11px;font-weight:600;color:${INK};">${moodFace(i, color)}${label}</button>`;
      }).join('')}</div>
      <div style="font-size:13px;font-weight:700;margin:12px 0 8px;">¿Y tu estrés?</div>
      <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;">${STRESS.map((label, i) => {
        const sel = stress[today] === i + 1;
        return `<button type="button" aria-pressed="${sel}" onclick="apoloSetStress(${i + 1})" style="min-height:44px;border-radius:12px;border:${sel ? `2px solid ${NAVY}` : `1px solid ${BORDER}`};background:${sel ? '#EEF0FA' : '#fff'};font-weight:700;font-size:13px;color:${INK};cursor:pointer;">${label}</button>`;
      }).join('')}</div>`)}
    <div style="background:linear-gradient(135deg,#F2FBF6,#E2F5EB);border-radius:16px;padding:14px 16px;display:flex;align-items:center;gap:12px;">
      ${iconBox('wind', '#fff', GREEN)}
      <div style="flex:1;"><div style="font-size:15px;font-weight:800;">Respira 3 minutos</div><div style="font-size:12px;color:${MUTED};">Inhala 4, sostén 7, exhala 8. Baja el estrés antes de dormir.${breaths ? ` · ${breaths} esta semana` : ''}</div></div>
      <button type="button" onclick="apoloBreathe()" style="min-height:44px;padding:0 14px;border:none;border-radius:12px;background:${GREEN};color:#fff;font-weight:700;cursor:pointer;">Empezar</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;">
      <button type="button" onclick="apoloEnterSleep()" style="text-align:left;background:#fff;border:1px solid ${BORDER};border-radius:16px;padding:14px;cursor:pointer;color:${INK};">
        <div style="font-size:11px;font-weight:700;color:${MUTED};letter-spacing:.03em;">SUEÑO ${lastSleepKey === today ? 'ANOCHE' : 'ÚLTIMO REGISTRO'}</div>
        <div style="font-size:22px;font-weight:800;color:${NAVY};margin-top:4px;">${sl != null ? `${Math.floor(sl / 60)} h ${String(sl % 60).padStart(2, '0')} m` : '—'}</div>
        <div style="font-size:12px;color:${NAVY};font-weight:700;margin-top:4px;">${lastSleepKey === today ? 'Editar' : 'Anotar'}</div>
      </button>
      <div style="background:#fff;border:1px solid ${BORDER};border-radius:16px;padding:14px;">
        <div style="font-size:11px;font-weight:700;color:${MUTED};letter-spacing:.03em;">RACHA</div>
        <div style="font-size:22px;font-weight:800;color:#B4520F;margin-top:4px;">${streak} ${streak === 1 ? 'día' : 'días'}</div>
        <div style="font-size:12px;color:${MUTED};margin-top:4px;">${s?.enrolled ? `${toBonus} más para +${fmtInt(s.settings?.coins_streak7 ?? 15)} Monedas` : 'Días seguidos con una meta'}</div>
      </div>
    </div>
    ${card(`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;"><span style="font-size:15px;font-weight:800;">Tu semana</span>${trend ? pill(`Estrés ${trend[0].toLowerCase()}`, trend[1], trend[2]) : ''}</div>
      ${weekChart(days7, moods, stress)}
      <div style="display:flex;gap:14px;font-size:11px;color:${MUTED};margin-top:6px;"><span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#C9D0F2;margin-right:4px;"></span>Estrés</span><span><span style="display:inline-block;width:10px;height:3px;background:${GREEN};margin-right:4px;vertical-align:middle;"></span>Ánimo</span></div>`)}
    <p style="font-size:11px;color:${MUTED};margin:0 2px;">Tu ánimo, estrés y sueño se guardan solo en tu teléfono. Respirar no da Monedas.</p>
  </div>`);
}
function weekChart(days, moods, stress) {
  const w = 316, h = 130, pad = 14, colW = (w - 2 * pad) / days.length;
  const bars = days.map((d, i) => {
    const v = stress[d];
    if (!v) return '';
    const bh = (v / 3) * (h - 2 * pad - 10);
    return `<rect x="${pad + i * colW + colW * 0.25}" y="${h - pad - bh}" width="${colW * 0.5}" height="${bh}" rx="4" fill="#C9D0F2"></rect>`;
  }).join('');
  const pts = days.map((d, i) => (moods[d] ? [pad + i * colW + colW / 2, h - pad - ((moods[d] - 1) / 4) * (h - 2 * pad - 10) - 5] : null));
  const line = pts.filter(Boolean).map((p) => p.join(',')).join(' ');
  const has = days.some((d) => moods[d] || stress[d]);
  return `${has ? `<svg width="100%" viewBox="0 0 ${w} ${h}" role="img" aria-label="Ánimo y estrés de los últimos 7 días" style="display:block;">${bars}${line ? `<polyline points="${line}" fill="none" stroke="${GREEN}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"></polyline>` : ''}${pts.filter(Boolean).map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="${GREEN}"></circle>`).join('')}</svg>` : `<p style="font-size:13px;color:${MUTED};margin:6px 0;">Registra tu ánimo y estrés cada día para ver tu semana.</p>`}
    <div style="display:flex;justify-content:space-around;font-size:11px;color:${MUTED};font-weight:600;">${days.map((d) => `<span>${weekdayInitial(d)}</span>`).join('')}</div>`;
}
window.apoloSetMood = (v) => { const m = LS.get('mood', {}); m[mxToday()] = v; LS.set('mood', m); window.apoloRefreshSalud && window.apoloRefreshSalud(); };
window.apoloSetStress = (v) => { const m = LS.get('stress', {}); m[mxToday()] = v; LS.set('stress', m); window.apoloRefreshSalud && window.apoloRefreshSalud(); };
window.apoloEnterSleep = function () {
  const cur = (LS.get('sleep', {}))[mxToday()];
  openSheet('¿Cuánto dormiste anoche?', `
    <p style="font-size:12px;color:${MUTED};margin:0 0 10px;">Se guarda solo en tu teléfono.</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">
      <div><label for="sl-h" style="font-size:13px;font-weight:600;">Horas</label><input id="sl-h" type="number" inputmode="numeric" min="0" max="16" value="${cur != null ? Math.floor(cur / 60) : ''}" style="width:100%;margin-top:6px;padding:12px;border:2px solid ${BORDER};border-radius:12px;font-size:18px;"></div>
      <div><label for="sl-m" style="font-size:13px;font-weight:600;">Minutos</label><input id="sl-m" type="number" inputmode="numeric" min="0" max="59" value="${cur != null ? cur % 60 : ''}" style="width:100%;margin-top:6px;padding:12px;border:2px solid ${BORDER};border-radius:12px;font-size:18px;"></div>
    </div>
    <button type="button" onclick="apoloSaveSleep()" style="${btnPrimary}">Guardar</button>`);
};
window.apoloSaveSleep = function () {
  const h = Number(document.getElementById('sl-h')?.value || 0), m = Number(document.getElementById('sl-m')?.value || 0);
  if (!(h >= 0 && h <= 16 && m >= 0 && m < 60) || h * 60 + m === 0) { ctx.showToast('Revisa las horas de sueño', 'warning'); return; }
  const all = LS.get('sleep', {}); all[mxToday()] = Math.round(h * 60 + m); LS.set('sleep', all);
  closeSheet();
  window.apoloRefreshSalud && window.apoloRefreshSalud();
};

// ============================================================
// LOGIN WALL — welcome screen for visitors without a session
// (2026-11-25). No shop, prices, consulta, salud or membresías content.
// ============================================================
export function renderAuthLoading() {
  ctx.getMain().innerHTML = wrap(`<div style="min-height:60vh;display:flex;align-items:center;justify-content:center;color:${MUTED};font-size:14px;" aria-live="polite">Cargando…</div>`);
}
export function renderWelcome() {
  const feat = (icon, title, sub) => `
    <div style="display:flex;align-items:center;gap:12px;">${iconBox(icon, '#EEF0FA', NAVY)}
      <div><div style="font-size:14px;font-weight:700;">${title}</div><div style="font-size:12px;color:${MUTED};">${sub}</div></div></div>`;
  ctx.getMain().innerHTML = wrap(`
    <div style="padding:24px 20px 32px;display:flex;flex-direction:column;gap:18px;max-width:430px;margin:0 auto;">
      <div style="display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;padding-top:8px;">
        <img src="/brand/apolo-logo.png" alt="Farmacia Apolo" width="72" height="72" style="width:72px;height:72px;object-fit:contain;background:#fff;border-radius:18px;box-shadow:0 6px 20px rgba(20,27,94,0.10);">
        <h1 style="margin:0;font-size:24px;font-weight:800;color:${NAVY};">Bienvenido a Farmacia Apolo</h1>
        <p style="margin:0;font-size:14px;color:${MUTED};line-height:1.5;">Tu salud, tus medicinas y tus recompensas en un solo lugar.</p>
      </div>
      ${card(`<div style="display:flex;flex-direction:column;gap:14px;">
        ${feat('cal', 'Consulta médica', 'Presencial o por videollamada')}
        ${feat('pill', 'Tus medicinas', 'Recordatorios y resurtido')}
        ${feat('coin', 'Monedas Apolo', 'Recompensas por cuidarte')}
        ${feat('tag', 'Ahorro', 'Membresía y equivalentes más baratos')}
      </div>`)}
      <button type="button" onclick="goPage('signup')" style="${btnPrimary}">Crear cuenta gratis</button>
      <button type="button" onclick="goPage('login')" style="${btnOutline};min-height:48px;">Iniciar sesión</button>
      <nav aria-label="Información legal" style="display:flex;flex-wrap:wrap;justify-content:center;gap:4px 16px;font-size:12px;">
        <a href="#" onclick="event.preventDefault();goPage('privacidad')" style="color:${NAVY};min-height:44px;display:inline-flex;align-items:center;">Aviso de privacidad</a>
        <a href="/membresias/terminos" target="_blank" rel="noopener" style="color:${NAVY};min-height:44px;display:inline-flex;align-items:center;">Términos de la membresía</a>
      </nav>
    </div>`);
}
