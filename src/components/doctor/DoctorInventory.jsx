import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import {
  Package, AlertTriangle, Calendar, Search, Clock, XCircle, TrendingDown, LayoutGrid
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getInventory } from '@/lib/db';
import { useToast } from '@/components/ui/use-toast';
import { formatMXN } from '@/lib/currency';

const getDaysUntilExpiry = (expirationDate) => {
  if (!expirationDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expirationDate);
  expiry.setHours(0, 0, 0, 0);
  return Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
};

const lowThreshold = (item) => item.low_stock_threshold ?? 5;

const FILTERS = [
  { id: 'all',     label: 'Todos',              icon: LayoutGrid,    activeClass: 'bg-apolo-navy text-white border-apolo-navy' },
  { id: 'out',     label: 'Agotados',           icon: XCircle,       activeClass: 'bg-red-600 text-white border-red-600' },
  { id: 'low',     label: 'Stock bajo',         icon: TrendingDown,  activeClass: 'bg-amber-500 text-white border-amber-500' },
  { id: 'exp30',   label: 'Caduca en <30 días', icon: Clock,         activeClass: 'bg-orange-500 text-white border-orange-500' },
  { id: 'expired', label: 'Caducados',          icon: AlertTriangle, activeClass: 'bg-red-700 text-white border-red-700' },
];

const matchesFilter = (item, filterId) => {
  const days = getDaysUntilExpiry(item.expiration_date);
  switch (filterId) {
    case 'out':     return item.quantity <= 0;
    case 'low':     return item.quantity > 0 && item.quantity <= lowThreshold(item);
    case 'exp30':   return days !== null && days >= 0 && days <= 30;
    case 'expired': return days !== null && days < 0;
    default:        return true;
  }
};

const getExpiryColor = (days) => {
  if (days < 0) return 'text-red-600 bg-red-50';
  if (days <= 30) return 'text-orange-600 bg-orange-50';
  if (days <= 90) return 'text-yellow-600 bg-yellow-50';
  return 'text-green-600 bg-green-50';
};

const formatExpiryMessage = (days) => {
  if (days < 0) return `Caducó hace ${Math.abs(days)} días`;
  if (days === 0) return 'Caduca hoy';
  if (days === 1) return 'Caduca mañana';
  return `${days} días restantes`;
};

const DoctorInventory = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const items = await getInventory(user?.locationId);
        setInventory(Array.isArray(items) ? items : []);
      } catch (error) {
        console.error('Error loading inventory:', error);
        toast({ title: 'Error', description: 'No se pudo cargar el inventario', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user?.locationId]);

  const counts = useMemo(() => {
    const c = { all: inventory.length };
    FILTERS.forEach(f => {
      if (f.id !== 'all') c[f.id] = inventory.filter(i => matchesFilter(i, f.id)).length;
    });
    return c;
  }, [inventory]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const result = inventory.filter(item => {
      if (!matchesFilter(item, filter)) return false;
      if (!q) return true;
      return [item.name, item.use, item.barcode, item.department]
        .some(v => (v || '').toLowerCase().includes(q));
    });
    if (filter === 'exp30' || filter === 'expired') {
      result.sort((a, b) => getDaysUntilExpiry(a.expiration_date) - getDaysUntilExpiry(b.expiration_date));
    }
    return result;
  }, [inventory, filter, search]);

  return (
    <>
      <Helmet><title>Inventario - Portal Médico</title></Helmet>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Package className="w-6 h-6 text-teal-600" />
              Inventario
            </h2>
            <p className="text-slate-600 mt-1">
              Existencias completas de la farmacia
            </p>
          </div>
          <div className="bg-teal-50 text-teal-700 px-4 py-2 rounded-lg font-semibold">
            {visible.length} productos
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nombre, indicación, código de barras o departamento..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>

        {/* Premade filters */}
        <div className="flex flex-wrap gap-2">
          {FILTERS.map(f => {
            const Icon = f.icon;
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium transition-colors ${
                  active
                    ? f.activeClass
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {f.label}
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${active ? 'bg-white/20' : 'bg-slate-100'}`}>
                  {counts[f.id] ?? 0}
                </span>
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-500"></div>
          </div>
        ) : visible.length === 0 ? (
          <div className="bg-white rounded-xl shadow-lg p-8 text-center">
            <Package className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-700">Sin resultados</h3>
            <p className="text-slate-500">
              {search
                ? 'Ningún producto coincide con la búsqueda y el filtro seleccionado.'
                : 'No hay productos en esta categoría.'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Medicamento</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Indicación</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-slate-900">Precio</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-slate-900">Cantidad</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Caducidad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {visible.map((item) => {
                    const days = getDaysUntilExpiry(item.expiration_date);
                    const out = item.quantity <= 0;
                    const low = !out && item.quantity <= lowThreshold(item);
                    return (
                      <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {days !== null && days < 0 && (
                              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                            )}
                            <div>
                              <span className="font-medium text-slate-900">{item.name}</span>
                              {item.requires_prescription && (
                                <span className="ml-2 px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">
                                  Rx
                                </span>
                              )}
                              {item.department && (
                                <p className="text-xs text-slate-400">{item.department}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">{item.use || '-'}</td>
                        <td className="px-4 py-3 text-sm text-slate-900 text-right">
                          {item.price != null ? formatMXN(item.price) : '-'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                            out ? 'bg-red-100 text-red-700'
                              : low ? 'bg-amber-100 text-amber-700'
                              : 'bg-green-100 text-green-700'
                          }`}>
                            {out ? 'Agotado' : item.quantity}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          {item.expiration_date ? (
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-4 h-4 text-slate-400" />
                                {new Date(item.expiration_date).toLocaleDateString('es-MX', {
                                  year: 'numeric', month: 'short', day: 'numeric'
                                })}
                              </span>
                              {days !== null && days <= 90 && (
                                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${getExpiryColor(days)}`}>
                                  {formatExpiryMessage(days)}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400">Sin fecha</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default DoctorInventory;
