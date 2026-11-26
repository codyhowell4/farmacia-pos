import React, { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { localDateString } from '@/lib/timezone';

// Pure string conversions — never `new Date('YYYY-MM-DD')` (UTC-midnight pitfall, see src/lib/timezone.js)
const isoToDisplay = (iso) => {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

const displayToIso = (text) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!m) return null;
  const d = Number(m[1]), mo = Number(m[2]), y = Number(m[3]);
  if (y < 1900 || y > 2200 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  // Numeric-arg constructor is local time; used only to reject impossible dates (31/02, etc.)
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
};

const maskDigits = (raw) => {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)]
    .filter((_, i) => digits.length > i * 2)
    .join('/');
};

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const pad = (n) => String(n).padStart(2, '0');
const toIso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;

// Spanish month calendar (lunes primero). No native <input type="date">:
// its MM/DD order on English-locale PCs, and a hidden native field left
// "incompleto" blocked forms with the browser's "fecha no válida" bubble.
function MonthCalendar({ value, min, max, onPick }) {
  const today = localDateString();
  const start = /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value : today;
  const [view, setView] = useState({ y: Number(start.slice(0, 4)), m: Number(start.slice(5, 7)) - 1 });
  const minY = min ? Number(min.slice(0, 4)) : 1900;
  const maxY = max ? Number(max.slice(0, 4)) : Math.max(Number(today.slice(0, 4)) + 30, view.y);
  const years = [];
  for (let y = maxY; y >= minY; y--) years.push(y);
  const first = new Date(view.y, view.m, 1).getDay(); // 0 = domingo
  const lead = (first + 6) % 7;
  const days = new Date(view.y, view.m + 1, 0).getDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const shift = (delta) => setView(({ y, m }) => { const t = m + delta; return { y: y + Math.floor(t / 12), m: ((t % 12) + 12) % 12 }; });
  const sel = 'h-8 rounded-md border border-slate-300 bg-white px-1 text-sm focus:outline-none focus:ring-2 focus:ring-apolo-navy';

  return (
    <div className="w-[17rem] select-none" data-testid="date-calendar">
      <div className="flex items-center gap-1 mb-2">
        <button type="button" onClick={() => shift(-1)} className="p-1.5 rounded hover:bg-slate-100" aria-label="Mes anterior"><ChevronLeft className="h-4 w-4" /></button>
        <select aria-label="Mes" className={cn(sel, 'flex-1')} value={view.m} onChange={(e) => setView((v) => ({ ...v, m: Number(e.target.value) }))}>
          {MONTHS.map((n, i) => <option key={n} value={i}>{n}</option>)}
        </select>
        <select aria-label="Año" className={sel} value={view.y} onChange={(e) => setView((v) => ({ ...v, y: Number(e.target.value) }))}>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <button type="button" onClick={() => shift(1)} className="p-1.5 rounded hover:bg-slate-100" aria-label="Mes siguiente"><ChevronRight className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-slate-500 mb-1">
        {WEEKDAYS.map((w, i) => <span key={i}>{w}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((d, i) => {
          if (!d) return <span key={`e${i}`} />;
          const iso = toIso(view.y, view.m, d);
          const disabled = (min && iso < min) || (max && iso > max);
          const isSel = iso === value;
          return (
            <button
              key={iso}
              type="button"
              disabled={disabled}
              onClick={() => onPick(iso)}
              aria-label={`${d} de ${MONTHS[view.m].toLowerCase()} de ${view.y}`}
              aria-pressed={isSel}
              className={cn(
                'h-8 rounded-md text-sm tabular-nums',
                isSel ? 'bg-apolo-navy text-white font-semibold' : 'hover:bg-slate-100',
                iso === today && !isSel && 'ring-1 ring-apolo-navy/50',
                disabled && 'opacity-30 cursor-not-allowed hover:bg-transparent',
              )}
            >{d}</button>
          );
        })}
      </div>
      <div className="flex justify-between mt-2 text-xs">
        <button type="button" className="text-apolo-navy hover:underline disabled:opacity-40" disabled={(min && today < min) || (max && today > max)} onClick={() => onPick(today)}>Hoy</button>
        <span className="text-slate-400">dd/mm/aaaa</span>
      </div>
    </div>
  );
}

// Controlled date field: `value`/`onChange` carry ISO `YYYY-MM-DD` (or ''),
// the user sees and types `dd/mm/aaaa` (Mexican order, any PC locale).
// The calendar button opens a Spanish calendar. `min`/`max` are ISO strings
// and apply to both typed and picked dates.
const DateInput = React.forwardRef(({ value, onChange, className, placeholder = 'dd/mm/aaaa', disabled, id, min, max, ...props }, ref) => {
  const [text, setText] = useState(() => isoToDisplay(value));
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const wrapRef = useRef(null);
  const panelRef = useRef(null);

  // Open upward when there is no room below (e.g. near the bottom of a
  // dialog that scrolls), then make sure the whole calendar is visible.
  const PANEL_H = 330;
  const toggleCalendar = () => {
    if (!open && wrapRef.current) {
      const r = wrapRef.current.getBoundingClientRect();
      let top = 0; let bottom = window.innerHeight;
      for (let el = wrapRef.current.parentElement; el; el = el.parentElement) {
        const oy = getComputedStyle(el).overflowY;
        if (oy === 'auto' || oy === 'scroll' || oy === 'hidden') {
          const cr = el.getBoundingClientRect(); top = Math.max(top, cr.top); bottom = Math.min(bottom, cr.bottom); break;
        }
      }
      setOpenUp(bottom - r.bottom < PANEL_H && r.top - top > bottom - r.bottom);
    }
    setOpen((o) => !o);
  };
  useEffect(() => { if (open) panelRef.current?.scrollIntoView({ block: 'nearest' }); }, [open]);

  useEffect(() => { if (!editing) setText(isoToDisplay(value)); }, [value, editing]);

  // Close the calendar on outside click / Esc (rendered inline, not in a
  // portal, so it stays clickable inside modal dialogs).
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    // Esc closes only the calendar, not the dialog around it: window capture
    // runs before the dialog's document-level Escape listener.
    const onKey = (e) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); e.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('mousedown', onDown, true); window.removeEventListener('keydown', onKey, true); };
  }, [open]);

  const parse = (t) => {
    const iso = displayToIso(t);
    if (!iso) return null;
    if (min && iso < min) return null; // ISO YYYY-MM-DD compares lexicographically
    if (max && iso > max) return null;
    return iso;
  };

  const invalid = text.replace(/\D/g, '').length === 8 && !parse(text);

  const handleChange = (e) => {
    const masked = maskDigits(e.target.value);
    setText(masked);
    if (masked.replace(/\D/g, '').length === 8) {
      const iso = parse(masked);
      if (iso) onChange?.(iso);
    }
  };

  const handleBlur = () => {
    setEditing(false);
    if (text === '') { onChange?.(''); return; }
    const iso = parse(text);
    if (iso) { onChange?.(iso); setText(isoToDisplay(iso)); }
    else setText(isoToDisplay(value)); // revert incomplete/invalid to last valid value
  };

  const pick = (iso) => {
    onChange?.(iso);
    setEditing(false);
    setText(isoToDisplay(iso));
    setOpen(false);
  };

  return (
    <div className="relative" ref={wrapRef}>
      <Input
        ref={ref}
        id={id}
        value={text}
        disabled={disabled}
        placeholder={placeholder}
        inputMode="numeric"
        autoComplete="off"
        onFocus={() => setEditing(true)}
        onChange={handleChange}
        onBlur={handleBlur}
        title={invalid ? 'Fecha inválida — usa dd/mm/aaaa' : undefined}
        aria-invalid={invalid || undefined}
        className={cn('pr-9', invalid && 'border-red-500 focus-visible:ring-red-500', className)}
        {...props}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        onClick={toggleCalendar}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-50"
        title="Elegir en calendario"
        aria-label="Elegir fecha en calendario"
        aria-expanded={open}
      >
        <CalendarDays className="h-4 w-4" />
      </button>
      {open && (
        <div ref={panelRef} className={cn('absolute right-0 z-[70] rounded-lg border border-slate-200 bg-white p-3 shadow-xl', openUp ? 'bottom-full mb-1' : 'top-full mt-1')} role="dialog" aria-label="Calendario">
          <MonthCalendar value={value} min={min} max={max} onPick={pick} />
        </div>
      )}
    </div>
  );
});
DateInput.displayName = 'DateInput';

export { DateInput };
