import { formatMXN } from '@/lib/currency';
import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Search, Package, AlertTriangle, Clock, TrendingDown,
  TrendingUp, Flame, Snowflake, Pill, BarChart3, MapPin,
  Download, Printer
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { getInventoryIntelligence, getLocations } from '@/lib/db';

const getExpiryStatus = (expirationDate) => {
  if (!expirationDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expirationDate);
  const daysUntilExpiry = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
  if (daysUntilExpiry < 0) return { label: 'Vencido', color: 'bg-red-100 text-red-700', days: daysUntilExpiry };
  if (daysUntilExpiry <= 30) return { label: `${daysUntilExpiry}d`, color: 'bg-orange-100 text-orange-700', days: daysUntilExpiry };
  if (daysUntilExpiry <= 90) return { label: `${daysUntilExpiry}d`, color: 'bg-yellow-100 text-yellow-700', days: daysUntilExpiry };
  return null;
};

const getRiskBadge = (score) => {
  if (score >= 80) return { label: 'Crítico', color: 'bg-red-100 text-red-700 border-red-200' };
  if (score >= 50) return { label: 'Alto', color: 'bg-orange-100 text-orange-700 border-orange-200' };
  if (score >= 20) return { label: 'Medio', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' };
  return { label: 'Bajo', color: 'bg-green-100 text-green-700 border-green-200' };
};

const TABS = [
  { id: 'all', label: 'Todos', icon: Package },
  { id: 'low', label: 'Stock bajo', icon: AlertTriangle },
  { id: 'out', label: 'Agotados', icon: TrendingDown },
  { id: 'expired', label: 'Expirados', icon: AlertTriangle },
  { id: 'fast', label: 'Más vendidos', icon: Flame },
  { id: 'slow', label: 'Más lentos', icon: Snowflake },
  { id: 'expiring', label: 'Por vencer', icon: Clock },
  { id: 'reorder', label: 'Reorden', icon: BarChart3 },
];

const AdminInventory = () => {
  const [items, setItems] = useState([]);
  const [locations, setLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadLocations();
  }, []);

  useEffect(() => {
    loadData();
  }, [selectedLocation]);

  const loadLocations = async () => {
    try {
      const locs = await getLocations();
      setLocations(locs || []);
    } catch (e) {
      console.error(e);
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const locationId = selectedLocation || null;
      const data = await getInventoryIntelligence(locationId);
      setItems(data || []);
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'No se pudo cargar el inventario', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = useMemo(() => {
    let result = items;

    // Tab filter
    switch (activeTab) {
      case 'low':
        result = result.filter(i => i.quantity > 0 && i.quantity <= i.low_stock_threshold);
        break;
      case 'out':
        result = result.filter(i => i.quantity === 0);
        break;
      case 'fast':
        result = result.filter(i => i.has_sufficient_data && i.avg_daily_sales_30 > 0)
          .sort((a, b) => b.avg_daily_sales_30 - a.avg_daily_sales_30)
          .slice(0, 20);
        break;
      case 'slow':
        result = result.filter(i => i.has_sufficient_data && i.avg_daily_sales_30 > 0)
          .sort((a, b) => a.avg_daily_sales_30 - b.avg_daily_sales_30)
          .slice(0, 20);
        break;
      case 'expiring':
        result = result.filter(i => {
          const s = getExpiryStatus(i.expiration_date);
          return s !== null && !i.is_expired;
        });
        break;
      case 'expired':
        result = result.filter(i => i.is_expired);
        break;
      case 'reorder':
        result = result.filter(i => i.recommended_qty > 0 || i.quantity === 0 || (i.days_of_inventory !== null && i.days_of_inventory <= 14));
        break;
      default:
        break;
    }

    // Search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(i =>
        i.name?.toLowerCase().includes(term) ||
        i.barcode?.toLowerCase().includes(term) ||
        i.supplier_name?.toLowerCase().includes(term) ||
        i.use?.toLowerCase().includes(term)
      );
    }

    return result;
  }, [items, activeTab, searchTerm]);

  const stats = useMemo(() => {
    const totalItems = items.length;
    const totalValue = items.reduce((sum, i) => sum + (i.inventory_value || 0), 0);
    const lowStock = items.filter(i => i.quantity > 0 && i.quantity <= i.low_stock_threshold).length;
    const outOfStock = items.filter(i => i.quantity === 0).length;
    const reorderNeeded = items.filter(i => i.recommended_qty > 0 || i.quantity === 0).length;
    const expiringSoon = items.filter(i => {
      const s = getExpiryStatus(i.expiration_date);
      return s !== null;
    }).length;
    const avgRisk = items.length > 0
      ? Math.round(items.reduce((sum, i) => sum + (i.stockout_risk_score || 0), 0) / items.length)
      : 0;
    const expiredCount = items.filter(i => i.is_expired).length;
    return { totalItems, totalValue, lowStock, outOfStock, reorderNeeded, expiringSoon, expiredCount, avgRisk };
  }, [items]);

  const exportCSV = () => {
    const headers = [
      'Nombre', 'Código de barras', 'Cantidad', 'Stock mínimo', 'Ventas 30d',
      'Ventas/día', 'Días de stock', 'Punto de reorden', 'Stock seguridad',
      'Cantidad sugerida', 'Riesgo', 'Proveedor', 'Costo', 'Precio', 'Vencimiento'
    ];
    const rows = filteredItems.map(i => [
      i.name, i.barcode || '', i.quantity, i.low_stock_threshold,
      i.sold_30d, i.avg_daily_sales_30 || 0,
      i.days_of_inventory != null ? i.days_of_inventory : 'N/A',
      i.reorder_point || 0, i.safety_stock || 0,
      i.recommended_qty, i.stockout_risk_score,
      i.supplier_name || '', i.cost, i.price, i.expiration_date || ''
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `inventario_inteligente_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast({ title: 'CSV exportado', description: 'El reporte se descargó correctamente.' });
  };

  const printReport = () => {
    window.print();
  };

  const renderTable = () => {
    if (loading) {
      return (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-14 rounded-lg" />)}
        </div>
      );
    }

    if (filteredItems.length === 0) {
      return (
        <div className="py-12 text-center text-slate-500">
          <Package className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p className="text-lg font-medium">Sin resultados</p>
          <p className="text-sm">No hay medicamentos que coincidan con los filtros actuales.</p>
        </div>
      );
    }

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-slate-900">Nombre</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-900">Cant.</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-900">Ventas 30d</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-900">Ventas/día</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-900">Días stock</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-900">Punto reorden</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-900">Sugerida</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-900">Riesgo</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-900">Vencimiento</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-900">Proveedor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredItems.map((item) => {
              const risk = getRiskBadge(item.stockout_risk_score || 0);
              const expiry = getExpiryStatus(item.expiration_date);
              const isOut = item.quantity === 0;
              const isLow = !isOut && item.quantity <= item.low_stock_threshold;
              const insufficient = !item.has_sufficient_data;

              return (
                <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-900">{item.name}</div>
                    {item.barcode && <div className="text-xs text-slate-400 font-mono">{item.barcode}</div>}
                    {item.use && <div className="text-xs text-slate-500">{item.use}</div>}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                      isOut ? 'bg-red-100 text-red-700' : isLow ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                    }`}>
                      {item.quantity}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {insufficient ? (
                      <span className="text-xs text-slate-400 italic">Sin datos</span>
                    ) : (
                      item.sold_30d
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {insufficient ? (
                      <span className="text-xs text-slate-400 italic">—</span>
                    ) : (
                      item.avg_daily_sales_30?.toFixed(1) || '0'
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {insufficient ? (
                      <span className="text-xs text-slate-400 italic">—</span>
                    ) : item.days_of_inventory == null ? (
                      <span className="text-xs text-slate-400">Sin ventas</span>
                    ) : (
                      <span className={item.days_of_inventory <= 7 ? 'text-red-600 font-semibold' : ''}>
                        {Math.round(item.days_of_inventory)}d
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {insufficient ? (
                      <span className="text-xs text-slate-400 italic">—</span>
                    ) : (
                      <span>{Math.round(item.reorder_point || 0)}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {item.recommended_qty > 0 ? (
                      <span className="inline-flex items-center gap-1 text-blue-700 font-semibold text-xs">
                        <TrendingUp className="w-3 h-3" />
                        {item.recommended_qty}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className={`text-xs ${risk.color}`}>
                      {risk.label} {item.stockout_risk_score > 0 ? `(${item.stockout_risk_score})` : ''}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    {item.is_expired ? (
                      <Badge variant="outline" className="text-xs bg-red-100 text-red-700 border-red-200">
                        VENCIDO
                      </Badge>
                    ) : expiry ? (
                      <Badge variant="outline" className={`text-xs ${expiry.color}`}>
                        {expiry.label}
                      </Badge>
                    ) : (
                      <span className="text-xs text-slate-400">{item.expiration_date || '—'}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {item.supplier_name || '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Inventario inteligente</h2>
          <p className="text-slate-600">Análisis predictivo de stock con recomendaciones de reorden</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={exportCSV} variant="outline" size="sm" className="gap-1.5">
            <Download className="w-4 h-4" />
            CSV
          </Button>
          <Button onClick={printReport} variant="outline" size="sm" className="gap-1.5">
            <Printer className="w-4 h-4" />
            Imprimir
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl shadow-lg p-5 text-white">
          <Package className="w-7 h-7 mb-2" />
          <p className="text-xs opacity-90">Total artículos</p>
          <p className="text-2xl font-bold">{stats.totalItems}</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl shadow-lg p-5 text-white">
          <Pill className="w-7 h-7 mb-2" />
          <p className="text-xs opacity-90">Valor inventario</p>
          <p className="text-2xl font-bold">{formatMXN(stats.totalValue)}</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-gradient-to-br from-red-500 to-orange-600 rounded-xl shadow-lg p-5 text-white">
          <AlertTriangle className="w-7 h-7 mb-2" />
          <p className="text-xs opacity-90">Stock bajo</p>
          <p className="text-2xl font-bold">{stats.lowStock}</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="bg-gradient-to-br from-rose-500 to-pink-600 rounded-xl shadow-lg p-5 text-white">
          <TrendingDown className="w-7 h-7 mb-2" />
          <p className="text-xs opacity-90">Agotados</p>
          <p className="text-2xl font-bold">{stats.outOfStock}</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg p-5 text-white">
          <BarChart3 className="w-7 h-7 mb-2" />
          <p className="text-xs opacity-90">Reorden sugerida</p>
          <p className="text-2xl font-bold">{stats.reorderNeeded}</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="bg-gradient-to-br from-yellow-500 to-amber-600 rounded-xl shadow-lg p-5 text-white">
          <Clock className="w-7 h-7 mb-2" />
          <p className="text-xs opacity-90">Próximos a vencer</p>
          <p className="text-2xl font-bold">{stats.expiringSoon}</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-gradient-to-br from-gray-500 to-slate-600 rounded-xl shadow-lg p-5 text-white">
          <AlertTriangle className="w-7 h-7 mb-2" />
          <p className="text-xs opacity-90">Expirados</p>
          <p className="text-2xl font-bold">{stats.expiredCount}</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="bg-gradient-to-br from-teal-500 to-cyan-600 rounded-xl shadow-lg p-5 text-white">
          <AlertTriangle className="w-7 h-7 mb-2" />
          <p className="text-xs opacity-90">Riesgo promedio</p>
          <p className="text-2xl font-bold">{stats.avgRisk}</p>
        </motion.div>
      </div>

      {/* Location Filter */}
      {locations.length > 1 && (
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-slate-400" />
          <select
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
            className="px-3 py-1.5 rounded-md border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todas las ubicaciones</option>
            {locations.map(loc => (
              <option key={loc.id} value={loc.id}>{loc.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Tabs + Search */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 border-b border-slate-100">
          <div className="flex gap-1 overflow-x-auto pb-1 sm:pb-0">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                    isActive
                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                      : 'text-slate-600 hover:bg-slate-50 border border-transparent'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Buscar medicamento..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-8 text-sm"
            />
          </div>
        </div>

        <div className="p-3">
          {renderTable()}
        </div>
      </div>
    </div>
  );
};

export default AdminInventory;
