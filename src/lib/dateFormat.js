// Mexican date display for staff screens: always DD/MM/AAAA, Spanish labels,
// America/Mexico_City — never the browser's locale (an English-locale
// Windows PC would otherwise show MM/DD).
//
// Date-only values (`date` columns, 'YYYY-MM-DD') are handled as plain
// strings — never `new Date('YYYY-MM-DD')`, which is UTC midnight and shows
// the previous day in Mexico (AGENTS.md rule 5).
import { DEFAULT_TZ, localDateString } from '@/lib/timezone';

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

const partsInTz = (value) => {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const p = {};
  new Intl.DateTimeFormat('es-MX', {
    timeZone: DEFAULT_TZ, day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).forEach(({ type, value: v }) => { p[type] = v; });
  return p;
};

// 'DD/MM/AAAA' from a 'YYYY-MM-DD' string, an ISO timestamp or a Date.
export const fmtDate = (value, empty = '—') => {
  if (value == null || value === '') return empty;
  const m = typeof value === 'string' ? DATE_ONLY.exec(value) : null;
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const p = partsInTz(value);
  return p ? `${p.day}/${p.month}/${p.year}` : empty;
};

// 'DD/MM/AAAA HH:MM' (24 h, hora del centro de México)
export const fmtDateTime = (value, empty = '—') => {
  if (value == null || value === '') return empty;
  if (typeof value === 'string' && DATE_ONLY.test(value)) return fmtDate(value, empty);
  const p = partsInTz(value);
  return p ? `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}` : empty;
};

// 'HH:MM' (24 h)
export const fmtTime = (value, empty = '—') => {
  if (value == null || value === '') return empty;
  const p = partsInTz(value);
  return p ? `${p.hour}:${p.minute}` : empty;
};

// Whole days from today (Mexico) until a 'YYYY-MM-DD' date; negative = past.
export const daysUntil = (dateStr) => {
  if (!dateStr) return null;
  const m = DATE_ONLY.exec(String(dateStr).slice(0, 10));
  if (!m) return null;
  const today = DATE_ONLY.exec(localDateString());
  const a = Date.UTC(+today[1], +today[2] - 1, +today[3]);
  const b = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return Math.round((b - a) / 86400000);
};

// Expired = the expiry date is before today (a product is still sellable on
// its expiry day).
export const isDateExpired = (dateStr) => {
  const d = daysUntil(dateStr);
  return d != null && d < 0;
};

// Spanish expiry label: 'Caducado', 'Caduca hoy', 'Caduca mañana', 'Caduca en N días'
export const expiryLabel = (days) => {
  if (days == null) return '';
  if (days < 0) return 'Caducado';
  if (days === 0) return 'Caduca hoy';
  if (days === 1) return 'Caduca mañana';
  return `Caduca en ${days} días`;
};
