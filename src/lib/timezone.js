// Mexican timezones (IANA) for doctor-location-aware time display.
export const MX_TIMEZONES = [
  { value: 'America/Mexico_City', label: 'Centro — CDMX, Naucalpan, Guadalajara' },
  { value: 'America/Monterrey', label: 'Noreste — Monterrey' },
  { value: 'America/Cancun', label: 'Sureste — Cancún, Quintana Roo' },
  { value: 'America/Merida', label: 'Yucatán — Mérida' },
  { value: 'America/Mazatlan', label: 'Pacífico — Mazatlán, Sinaloa' },
  { value: 'America/Chihuahua', label: 'Chihuahua' },
  { value: 'America/Hermosillo', label: 'Sonora — Hermosillo' },
  { value: 'America/Tijuana', label: 'Noroeste — Tijuana' },
];

export const DEFAULT_TZ = 'America/Mexico_City';

// Day key (YYYY-MM-DD) of an instant in the given timezone — for grouping
// appointments by the doctor's local day rather than the browser's or UTC's.
export const dayKeyInTz = (iso, tz) =>
  new Date(iso).toLocaleDateString('en-CA', { timeZone: tz || DEFAULT_TZ });

export const dateInTz = (iso, tz, opts = {}) =>
  new Date(iso).toLocaleDateString('es-MX', { timeZone: tz || DEFAULT_TZ, ...opts });

export const timeInTz = (iso, tz) =>
  new Date(iso).toLocaleTimeString('es-MX', { timeZone: tz || DEFAULT_TZ, hour: '2-digit', minute: '2-digit' });
