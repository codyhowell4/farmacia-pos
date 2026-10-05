import React, { useEffect, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

// Pure string conversions — never `new Date('YYYY-MM-DD')` (UTC-midnight pitfall, see src/lib/timezone.js)
const isoToDisplay = (iso) => {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

const displayToIso = (text) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.test(text);
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

// Controlled date field: `value`/`onChange` carry ISO `YYYY-MM-DD` (or ''),
// the user sees and types `dd/mm/aaaa`. Calendar button keeps the native picker.
// `min`/`max` are ISO strings and apply to both typed and picked dates.
const DateInput = React.forwardRef(({ value, onChange, className, placeholder = 'dd/mm/aaaa', disabled, id, min, max, ...props }, ref) => {
  const [text, setText] = useState(() => isoToDisplay(value));
  const [editing, setEditing] = useState(false);
  const pickerRef = useRef(null);

  useEffect(() => { if (!editing) setText(isoToDisplay(value)); }, [value, editing]);

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

  const openPicker = () => {
    const el = pickerRef.current;
    if (!el) return;
    el.value = /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value : '';
    if (typeof el.showPicker === 'function') {
      try { el.showPicker(); return; } catch { /* fall through */ }
    }
    el.focus();
    el.click();
  };

  return (
    <div className="relative">
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
        className={cn('pr-9', invalid && 'border-red-500 focus-visible:ring-red-500', className)}
        {...props}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        onClick={openPicker}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-50"
        title="Elegir en calendario"
        aria-label="Elegir fecha en calendario"
      >
        <CalendarDays className="h-4 w-4" />
      </button>
      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        min={min}
        max={max}
        className="absolute right-0 top-1/2 h-0 w-0 opacity-0 pointer-events-none"
        onChange={(e) => {
          const iso = e.target.value;
          if (iso) { onChange?.(iso); setEditing(false); setText(isoToDisplay(iso)); }
        }}
      />
    </div>
  );
});
DateInput.displayName = 'DateInput';

export { DateInput };
