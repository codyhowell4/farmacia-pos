import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingDown, Download, MapPin, Search, Trash2,
  AlertTriangle, ClipboardList, Hash, Trophy
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { getLostSales, deleteLostSale, getLocations } from '@/lib/db';

const MONTHS_BACK = 6;

const AdminLostSales = () => {
  const [entries, setEntries] = useState([]);
  const [locations, setLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [itemFilter, setItemFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const months = useMemo(() => {
    const arr = [];
    const now = new Date();
    for (let i = MONTHS_BACK - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      arr.push({
        key: `${d.getFullYear()}-${d.getMonth()}`,
        label: d.toLocaleDateString('es-MX', { month: 'short', year: '2-digit' }),
        start: d,
      });
    }
    return arr;
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await getLostSales({
        since: months[0].start.toISOString(),
        locationId: selectedLocation || undefined,
      });
      setEntries(data);
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'No se pudieron cargar las ventas perdidas', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    getLocations().then(locs => setLocations(locs || [])).catch(console.error);
  }, []);

  useEffect(() => {
    loadData();
  }, [selectedLocation]);

  const handleDelete = async (entry) => {
    if (!window.confirm(`¿Eliminar el registro "${entry.item_name}"?`)) return;
    try {
      await deleteLostSale(entry.id);
      setEntries(prev => prev.filter(e => e.id !== entry.id));
      toast({ title: 'Registro eliminado' });
    } catch (e) {
      toast({ title: 'Error al eliminar', description: e.message, variant: 'destructive' });
    }
  };

  const items = useMemo(() => {
    const byItem = new Map();
    for (const e of entries) {
      const key = e.item_name.trim().toLowerCase();
      const monthKey = (() => {
        const d = new Date(e.created_at);
        return `${d.getFullYear()}-${d.getMonth()}`;
      })();
      if (!byItem.has(key)) {
        byItem.set(key, { name: e.item_name.trim(), counts: {}, total: 0 });
      }
      const row = byItem.get(key);
      row.counts[monthKey] = (row.counts[monthKey] || 0) + 1;
      row.total += 1;
    }
    return [...byItem.values()].sort((a, b) => b.total - a.total);
  }, [entries]);

  const filteredItems = useMemo(() => {
    if (!itemFilter.trim()) return items;
    return items.filter(i => i.name.toLowerCase().includes(itemFilter.trim().toLowerCase()));
  }, [items, itemFilter]);

  const currentMonthKey = months[months.length - 1].key;
  const thisMonthTotal = items.reduce((s, i) => s + (i.counts[currentMonthKey] || 0), 0);
  const topItem = items[0];

  const exportCSV = () => {
    const headers = ['Artículo', ...months.map(m => m.label), 'Total'];
    const rows = filteredItems.map(i => [
      i.name,
      ...months.map(m => i.counts[m.key] || 0),
      i.total,
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ventas_perdidas_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast({ title: 'CSV exportado' });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Ventas perdidas</h1>
          <p className="text-sm text-slate-500 mt-1">Lo que los clientes piden y no tenemos — cuántas ventas se pierden por mes.</p>
        </div>
        <div className="flex items-center gap-2">
          {locations.length > 1 && (
            <div className="flex items-center gap-2 mr-2">
              <MapPin className="w-4 h-4 text-slate-400" />
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className="px-2 py-1.5 rounded-md border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-apolo-navy"
              >
                <option value="">Todas las ubicaciones</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            </div>
          )}
          <Button onClick={exportCSV} variant="outline" size="sm" className="gap-1.5" disabled={items.length === 0}>
            <Download className="w-4 h-4" />
            CSV
          </Button>
        </div>
      </div>

      {/* Summary bar */}
      {!loading && items.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white rounded-lg border border-slate-200 p-3 flex items-center gap-3">
            <TrendingDown className="w-8 h-8 text-red-500" />
            <div>
              <p className="text-2xl font-bold text-slate-900">{thisMonthTotal}</p>
              <p className="text-xs text-slate-500">Perdidas este mes</p>
            </div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-3 flex items-center gap-3">
            <Hash className="w-8 h-8 text-blue-500" />
            <div>
              <p className="text-2xl font-bold text-slate-900">{entries.length}</p>
              <p className="text-xs text-slate-500">Total en {MONTHS_BACK} meses</p>
            </div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-3 flex items-center gap-3">
            <ClipboardList className="w-8 h-8 text-orange-500" />
            <div>
              <p className="text-2xl font-bold text-slate-900">{items.length}</p>
              <p className="text-xs text-slate-500">Artículos distintos</p>
            </div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-3 flex items-center gap-3">
            <Trophy className="w-8 h-8 text-amber-500" />
            <div>
              <p className="text-lg font-bold text-slate-900 leading-tight truncate max-w-[140px]" title={topItem?.name}>{topItem?.name || '—'}</p>
              <p className="text-xs text-slate-500">{topItem ? `${topItem.total} perdidas — más pedido` : 'Más pedido'}</p>
            </div>
          </div>
        </div>
      )}

      {/* Velocity table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="font-semibold text-slate-900">Pérdidas por artículo y mes</h2>
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Filtrar artículo..."
              value={itemFilter}
              onChange={e => setItemFilter(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
        </div>
        <div className="p-4">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 rounded-lg" />)}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="py-16 text-center text-slate-500">
              <TrendingDown className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p className="text-lg font-medium">Sin ventas perdidas registradas</p>
              <p className="text-sm">Cuando el personal registre una venta perdida en el POS, aparecerá aquí.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Artículo</th>
                    {months.map(m => (
                      <th key={m.key} className="px-3 py-2 text-center font-semibold capitalize">{m.label}</th>
                    ))}
                    <th className="px-3 py-2 text-center font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredItems.map(item => (
                    <tr key={item.name.toLowerCase()} className="hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-2 font-medium text-slate-900">{item.name}</td>
                      {months.map(m => {
                        const n = item.counts[m.key] || 0;
                        return (
                          <td key={m.key} className="px-3 py-2 text-center">
                            {n > 0 ? (
                              <span className={`inline-flex items-center justify-center min-w-[1.75rem] px-1.5 py-0.5 rounded-full text-xs font-semibold ${
                                m.key === currentMonthKey ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'
                              }`}>
                                {n}
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-center">
                        <span className="font-bold text-slate-900">{item.total}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Recent entries */}
      {!loading && entries.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="p-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-900">Registros recientes</h2>
          </div>
          <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
            {entries.slice(0, 50).map(e => (
              <div key={e.id} className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-slate-50">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 truncate">{e.item_name}</p>
                  <p className="text-xs text-slate-500">
                    {new Date(e.created_at).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
                    {e.profiles?.full_name ? ` · ${e.profiles.full_name}` : ''}
                    {e.locations?.name ? ` · ${e.locations.name}` : ''}
                    {e.note ? ` · ${e.note}` : ''}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(e)}
                  className="text-slate-400 hover:text-red-600 p-1.5 shrink-0"
                  title="Eliminar registro"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminLostSales;
