import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';

// Weekly availability editor for telehealth video consultas.
// Emits the exact contract shape:
//   { "mon": [["09:00","14:00"],["16:00","19:00"]], "tue": [], ... }
// Keys: mon..sun; each an array of 0+ [start,end] windows ("HH:MM" 24h,
// clinic local time America/Mexico_City). Disabled days are omitted
// entirely from the emitted object. Windows with start >= end are
// flagged in the UI and NOT propagated to onChange.

const DAYS = [
  { key: 'mon', label: 'Lun' },
  { key: 'tue', label: 'Mar' },
  { key: 'wed', label: 'Mié' },
  { key: 'thu', label: 'Jue' },
  { key: 'fri', label: 'Vie' },
  { key: 'sat', label: 'Sáb' },
  { key: 'sun', label: 'Dom' },
];

const MAX_WINDOWS = 3;

const isValidWindow = (w) =>
  Array.isArray(w) && typeof w[0] === 'string' && typeof w[1] === 'string' && w[0] < w[1];

// Internal display state: every day present, windows as {start,end} objects
// (invalid windows are kept locally so the user can fix them).
const toDisplay = (value) => {
  const src = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const out = {};
  for (const { key } of DAYS) {
    const windows = Array.isArray(src[key]) ? src[key] : null;
    out[key] = {
      enabled: windows !== null,
      windows: (windows || []).map(w => ({
        start: typeof w?.[0] === 'string' ? w[0] : '09:00',
        end: typeof w?.[1] === 'string' ? w[1] : '14:00',
      })),
    };
  }
  return out;
};

// Display state → contract jsonb. Skips disabled days and invalid windows.
const toContract = (display) => {
  const out = {};
  for (const { key } of DAYS) {
    const day = display[key];
    if (!day?.enabled) continue;
    out[key] = day.windows
      .filter(w => w.start && w.end && w.start < w.end)
      .map(w => [w.start, w.end]);
  }
  return out;
};

const DoctorAvailabilityEditor = ({ value, onChange, disabled = false }) => {
  const [days, setDays] = useState(() => toDisplay(value));

  const update = (nextDays) => {
    setDays(nextDays);
    onChange?.(toContract(nextDays));
  };

  const toggleDay = (key, enabled) => {
    const day = days[key];
    update({
      ...days,
      [key]: {
        enabled,
        // Seed a first window when enabling a day with none yet.
        windows: enabled && day.windows.length === 0 ? [{ start: '09:00', end: '14:00' }] : day.windows,
      },
    });
  };

  const addWindow = (key) => {
    const day = days[key];
    if (day.windows.length >= MAX_WINDOWS) return;
    update({ ...days, [key]: { ...day, windows: [...day.windows, { start: '', end: '' }] } });
  };

  const removeWindow = (key, idx) => {
    const day = days[key];
    update({ ...days, [key]: { ...day, windows: day.windows.filter((_, i) => i !== idx) } });
  };

  const setWindowField = (key, idx, field, val) => {
    const day = days[key];
    update({
      ...days,
      [key]: {
        ...day,
        windows: day.windows.map((w, i) => (i === idx ? { ...w, [field]: val } : w)),
      },
    });
  };

  return (
    <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
      {DAYS.map(({ key, label }) => {
        const day = days[key];
        return (
          <div key={key} className="px-3 py-2.5">
            <div className="flex items-center gap-3">
              <Checkbox
                id={`avail-${key}`}
                checked={day.enabled}
                disabled={disabled}
                onCheckedChange={checked => toggleDay(key, !!checked)}
              />
              <label
                htmlFor={`avail-${key}`}
                className={`text-sm font-medium w-10 select-none ${day.enabled ? 'text-slate-900' : 'text-slate-400'} ${disabled ? '' : 'cursor-pointer'}`}
              >
                {label}
              </label>
              {!day.enabled && (
                <span className="text-xs text-slate-400 italic">No disponible</span>
              )}
            </div>

            {day.enabled && (
              <div className="mt-2 ml-7 space-y-2">
                {day.windows.map((w, idx) => {
                  const invalid = !w.start || !w.end || w.start >= w.end;
                  return (
                    <div key={idx} className="flex items-center gap-2 flex-wrap">
                      <input
                        type="time"
                        value={w.start}
                        disabled={disabled}
                        onChange={e => setWindowField(key, idx, 'start', e.target.value)}
                        className={`h-8 rounded-md border bg-white px-2 text-sm text-slate-900 focus:outline-none focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                          invalid
                            ? 'border-red-300 ring-2 ring-red-400'
                            : 'border-slate-300 focus:ring-teal-500'
                        }`}
                      />
                      <span className="text-xs text-slate-400">a</span>
                      <input
                        type="time"
                        value={w.end}
                        disabled={disabled}
                        onChange={e => setWindowField(key, idx, 'end', e.target.value)}
                        className={`h-8 rounded-md border bg-white px-2 text-sm text-slate-900 focus:outline-none focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                          invalid
                            ? 'border-red-300 ring-2 ring-red-400'
                            : 'border-slate-300 focus:ring-teal-500'
                        }`}
                      />
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => removeWindow(key, idx)}
                        className="p-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Quitar horario"
                      >
                        <X className="w-4 h-4" />
                      </button>
                      {invalid && (
                        <span className="text-xs text-red-500">La hora de inicio debe ser menor que la de fin</span>
                      )}
                    </div>
                  );
                })}
                {day.windows.length < MAX_WINDOWS && (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => addWindow(key)}
                    className="flex items-center gap-1 text-xs font-medium text-teal-600 hover:text-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Agregar horario
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default DoctorAvailabilityEditor;
