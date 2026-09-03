import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Users, Award, ScanLine, Package } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { searchMemberships } from '@/lib/db';

const MembershipPosLookup = ({ selectedMembership, onSelect, onClear, onFulfillTrackers, fulfillingTrackers }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [dialogQuery, setDialogQuery] = useState('');
  const [dialogResults, setDialogResults] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const timer = setTimeout(async () => {
      const term = query.trim();
      if (!term) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const data = await searchMemberships(term);
        setResults(data || []);
      } catch (e) {
        console.error(e);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      const term = dialogQuery.trim();
      try {
        const data = await searchMemberships(term);
        setDialogResults(data || []);
      } catch (e) {
        console.error(e);
        setDialogResults([]);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [dialogQuery]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && results.length > 0) {
      onSelect(results[0]);
      setQuery('');
      setResults([]);
    }
  };

  const handleSelect = (m) => {
    onSelect(m);
    setQuery('');
    setResults([]);
    setOpen(false);
  };

  const renderSuggestion = (m) => (
    <button
      key={m.id}
      onClick={() => handleSelect(m)}
      className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b last:border-b-0 border-slate-100"
    >
      <div className="flex items-center justify-between">
        <span className="font-medium text-slate-900">{m.customers?.full_name || 'Sin nombre'}</span>
        <span className="text-xs font-mono text-slate-500">{m.plan_id}</span>
      </div>
      <div className="text-xs text-slate-500">
        {m.plan_type === 'familiar' ? 'Plan Familiar' : 'Plan Individual'}
        {m.customers?.phone ? ` · ${m.customers.phone}` : ''}
        {m.customers?.email ? ` · ${m.customers.email}` : ''}
      </div>
    </button>
  );

  if (selectedMembership) {
    const included = selectedMembership.basic_trackers_included || 0;
    const fulfilled = selectedMembership.basic_trackers_fulfilled || 0;
    const trackersAvailable = Math.max(0, included - fulfilled);

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-amber-700" />
            <div>
              <p className="text-sm font-bold text-amber-900">{selectedMembership.plan_id}</p>
              <p className="text-xs text-amber-700">
                {selectedMembership.customers?.full_name} · {selectedMembership.discount_percent}% descuento
                {selectedMembership.plan_type === 'familiar' && ` · ${selectedMembership.membership_members?.length || 0} miembros`}
                {' · '}
                {selectedMembership.visits_remaining || 0} consultas restantes
              </p>
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={onClear}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {trackersAvailable > 0 && onFulfillTrackers && (
          <div className="flex items-center justify-between p-2 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center gap-2 text-sm text-blue-800">
              <Package className="w-4 h-4" />
              <span>{trackersAvailable} rastreador(es) básico(s) por entregar</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={onFulfillTrackers}
              disabled={fulfillingTrackers}
            >
              {fulfillingTrackers ? 'Entregando...' : 'Entregar 1'}
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex space-x-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            ref={inputRef}
            placeholder="Membresía (ID, nombre, teléfono, correo)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="pl-10"
          />
          {query && (
            <button
              onClick={() => { setQuery(''); setResults([]); inputRef.current?.focus(); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <Button variant="outline" size="icon" onClick={() => { setOpen(true); setDialogQuery(query); }}>
          <Users className="w-4 h-4" />
        </Button>
      </div>

      {results.length > 0 && (
        <div className="border border-slate-200 rounded-lg bg-white shadow-sm max-h-48 overflow-y-auto">
          {results.map(renderSuggestion)}
        </div>
      )}
      {loading && <p className="text-xs text-slate-500">Buscando...</p>}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScanLine className="w-5 h-5" /> Buscar membresía
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Buscar por ID, nombre, teléfono o correo..."
                value={dialogQuery}
                onChange={(e) => setDialogQuery(e.target.value)}
                className="pl-10"
                autoFocus
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Plan ID</th>
                    <th className="px-3 py-2 text-left font-semibold">Titular</th>
                    <th className="px-3 py-2 text-left font-semibold">Teléfono</th>
                    <th className="px-3 py-2 text-left font-semibold">Correo</th>
                    <th className="px-3 py-2 text-left font-semibold">Plan</th>
                    <th className="px-3 py-2 text-left font-semibold">Miembros</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {dialogResults.map((m) => (
                    <React.Fragment key={m.id}>
                      <tr
                        className="hover:bg-slate-50 cursor-pointer"
                        onClick={() => handleSelect(m)}
                      >
                        <td className="px-3 py-2 font-mono">{m.plan_id}</td>
                        <td className="px-3 py-2">{m.customers?.full_name}</td>
                        <td className="px-3 py-2">{m.customers?.phone}</td>
                        <td className="px-3 py-2">{m.customers?.email}</td>
                        <td className="px-3 py-2 capitalize">{m.plan_type}</td>
                        <td className="px-3 py-2">
                          {m.plan_type === 'familiar' ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); setExpandedId(expandedId === m.id ? null : m.id); }}
                              className="text-apolo-navy hover:underline"
                            >
                              {m.membership_members?.length || 0} miembros
                            </button>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                      {expandedId === m.id && m.plan_type === 'familiar' && (
                        <tr>
                          <td colSpan={6} className="px-3 py-2 bg-slate-50">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                              {(m.membership_members || []).map((mm) => (
                                <div key={mm.id} className="bg-white border rounded p-2 text-xs">
                                  <p className="font-medium">{mm.name}</p>
                                  <p className="font-mono text-slate-500">{mm.sub_id}</p>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                  {dialogResults.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-4 text-center text-slate-500">
                        {dialogQuery ? 'No se encontraron membresías' : 'Escribe para buscar'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MembershipPosLookup;
