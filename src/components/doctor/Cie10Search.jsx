import { useState, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { searchCie10 } from '@/lib/db';

/**
 * Reusable multi-select CIE-10 diagnosis picker. Searches the cie10_codes
 * catalog (debounced, >= 2 chars) and collects the picks as removable chips.
 * value/onChange work with an array of { code, description }.
 */
const Cie10Search = ({ value = [], onChange }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef(null);

  const selected = Array.isArray(value) ? value : [];

  // Debounced catalog search (only with 2+ chars, like searchCie10 itself)
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const rows = await searchCie10(q);
        setResults(rows);
        setOpen(true);
      } catch (err) {
        console.error('searchCie10 failed:', err);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Close the dropdown on outside clicks
  useEffect(() => {
    const onDocClick = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const addCode = (item) => {
    if (selected.some(s => s.code === item.code)) {
      setQuery('');
      setOpen(false);
      return;
    }
    onChange?.([...selected, { code: item.code, description: item.description }]);
    setQuery('');
    setResults([]);
    setOpen(false);
  };

  const removeCode = (code) => {
    onChange?.(selected.filter(s => s.code !== code));
  };

  return (
    <div className="space-y-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map(item => (
            <span
              key={item.code}
              className="inline-flex items-center gap-1.5 bg-teal-50 text-teal-800 border border-teal-200 rounded-full px-2.5 py-1 text-xs"
            >
              <span className="font-mono font-medium">{item.code}</span>
              <span className="max-w-[220px] truncate">{item.description}</span>
              <button
                type="button"
                className="text-teal-500 hover:text-teal-700"
                title="Quitar"
                onClick={() => removeCode(item.code)}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative" ref={boxRef}>
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          className="pl-10"
          placeholder="Buscar CIE-10 por código o descripción..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
        />
        {open && query.trim().length >= 2 && (
          <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
            {loading ? (
              <p className="px-3 py-2 text-sm text-slate-400">Buscando...</p>
            ) : results.length === 0 ? (
              <p className="px-3 py-2 text-sm text-slate-400">Sin resultados</p>
            ) : (
              results.map(r => (
                <button
                  key={r.code}
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm hover:bg-teal-50 flex items-baseline gap-2"
                  onClick={() => addCode(r)}
                >
                  <span className="font-mono font-medium text-slate-900 shrink-0">{r.code}</span>
                  <span className="text-slate-400">—</span>
                  <span className="text-slate-600 truncate">{r.description}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Cie10Search;
