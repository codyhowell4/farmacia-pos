import React, { useState, useEffect, useMemo } from 'react';
import {
  Download, Printer, AlertTriangle, Package, ArrowDown,
  Settings, Truck, ClipboardList, TrendingUp, TrendingDown,
  Clock, Shield, BarChart3, MapPin
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { formatMXN } from '@/lib/currency';
import {
  getReorderRecommendations, getInventorySettings, upsertInventorySettings,
  getLocations
} from '@/lib/db';

const getRiskBadge = (score) => {
  if (score >= 80) return { label: 'Crítico', color: 'bg-red-100 text-red-700 border-red-200' };
  if (score >= 50) return { label: 'Alto', color: 'bg-orange-100 text-orange-700 border-orange-200' };
  if (score >= 20) return { label: 'Medio', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' };
  return { label: 'Bajo', color: 'bg-green-100 text-green-700 border-green-200' };
};

const TABS = [
  { id: 'reorder', label: 'Reorden recomendada', icon: ClipboardList },
  { id: 'supplier', label: 'Por proveedor', icon: Truck },
  { id: 'settings', label: 'Configuración', icon: Settings },
];

const AdminReorderReport = () => {
  const [activeTab, setActiveTab] = useState('reorder');
  const [items, setItems] = useState([]);
  const [settings, setSettings] = useState(null);
  const [settingsForm, setSettingsForm] = useState({});
  const [locations, setLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadLocations();
    loadSettings();
  }, []);

  useEffect(() => {
    loadData();
  }, [selectedLocation]);

  const loadLocations = async () => {
    try {
      const locs = await getLocations();
      setLocations(locs || []);
    } catch (e) { console.error(e); }
  };

  const loadSettings = async () => {
    try {
      const s = await getInventorySettings();
      setSettings(s);
      setSettingsForm({
        default_lead_time_days: s.default_lead_time_days || 7,
        critical_safety_stock_days: s.critical_safety_stock_days || 7,
        normal_safety_stock_days: s.normal_safety_stock_days || 3,
        reorder_lookback_days: s.reorder_lookback_days || 30,
      });
    } catch (e) { console.error(e); }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const locationId = selectedLocation || null;
      const data = await getReorderRecommendations(locationId);
      // Only show items that need to be ordered (recommended_qty >= 1)
      const filteredData = (data || []).filter(item => item.recommended_qty >= 1);
      setItems(filteredData);
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'No se pudo cargar el reporte', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      await upsertInventorySettings({
        default_lead_time_days: parseInt(settingsForm.default_lead_time_days) || 7,
        critical_safety_stock_days: parseInt(settingsForm.critical_safety_stock_days) || 7,
        normal_safety_stock_days: parseInt(settingsForm.normal_safety_stock_days) || 3,
        reorder_lookback_days: parseInt(settingsForm.reorder_lookback_days) || 30,
      });
      toast({ title: 'Configuración guardada', description: 'Los nuevos valores se aplicarán al recargar.' });
      await loadSettings();
      await loadData();
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const supplierGroups = useMemo(() => {
    const groups = {};
    for (const item of items) {
      const supName = item.supplier_name || 'Sin proveedor';
      if (!groups[supName]) {
        groups[supName] = { items: [], supplierId: item.supplier_id, totalQty: 0, totalCost: 0 };
      }
      groups[supName].items.push(item);
      groups[supName].totalQty += item.recommended_qty;
      groups[supName].totalCost += (item.recommended_qty * (item.cost || 0));
    }
    return Object.entries(groups).sort((a, b) => b[1].totalQty - a[1].totalQty);
  }, [items]);

  const exportCSV = () => {
    const headers = [
      'Medicamento', 'Código de barras', 'Stock actual', 'Stock mínimo',
      'Ventas 30d', 'Ventas/día', 'Días restantes', 'Lead time',
      'Punto de reorden', 'Stock seguridad', 'Cantidad sugerida',
      'Riesgo', 'Proveedor', 'Costo unitario', 'Costo total'
    ];
    const rows = items.map(i => [
      i.name, i.barcode || '', i.quantity, i.low_stock_threshold,
      i.sold_30d, i.avg_daily_sales_30 || 0,
      i.days_of_inventory != null ? i.days_of_inventory : 'N/A',
      i.lead_time_days || 7,
      Math.round(i.reorder_point || 0), Math.round(i.safety_stock || 0),
      i.recommended_qty, i.stockout_risk_score,
      i.supplier_name || '', i.cost || 0, (i.recommended_qty * (i.cost || 0)).toFixed(2)
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reorden_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast({ title: 'CSV exportado', description: 'El reporte se descargó correctamente.' });
  };

  const exportSupplierCSV = (supplierName, groupItems) => {
    const headers = ['Medicamento', 'Cantidad sugerida', 'Costo unitario', 'Costo total', 'Riesgo'];
    const rows = groupItems.map(i => [
      i.name, i.recommended_qty, i.cost || 0,
      (i.recommended_qty * (i.cost || 0)).toFixed(2), i.stockout_risk_score
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reorden_${supplierName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const printReport = () => {
    window.print();
  };

  const renderReorderTab = () => {
    if (loading) {
      return (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}
        </div>
      );
    }

    if (items.length === 0) {
      return (
        <div className="py-16 text-center text-slate-500">
          <Package className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p className="text-lg font-medium">¡Inventario saludable!</p>
          <p className="text-sm">No hay medicamentos que necesiten ser reordenados.</p>
          <p className="text-xs text-slate-400 mt-2">Solo se muestran productos con cantidad sugerida ≥ 1</p>
        </div>
      );
    }

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Medicamento</th>
              <th className="px-3 py-2 text-left font-semibold">Stock</th>
              <th className="px-3 py-2 text-left font-semibold">Ventas/día</th>
              <th className="px-3 py-2 text-left font-semibold">Días rest.</th>
              <th className="px-3 py-2 text-left font-semibold">Lead time</th>
              <th className="px-3 py-2 text-left font-semibold">Punto reorden</th>
              <th className="px-3 py-2 text-left font-semibold">Stock seg.</th>
              <th className="px-3 py-2 text-left font-semibold">Sugerida</th>
              <th className="px-3 py-2 text-left font-semibold">Riesgo</th>
              <th className="px-3 py-2 text-left font-semibold">Proveedor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => {
              const risk = getRiskBadge(item.stockout_risk_score || 0);
              const insufficient = !item.has_sufficient_data;
              return (
                <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-900">{item.name}</div>
                    {item.barcode && <div className="text-xs text-slate-400 font-mono">{item.barcode}</div>}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                      item.quantity === 0 ? 'bg-red-100 text-red-700' :
                      item.quantity <= item.low_stock_threshold ? 'bg-amber-100 text-amber-700' :
                      'bg-green-100 text-green-700'
                    }`}>
                      {item.quantity}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {insufficient ? <span className="text-xs text-slate-400 italic">Sin datos</span> : item.avg_daily_sales_30?.toFixed(1)}
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {insufficient ? <span className="text-xs text-slate-400">—</span> :
                      item.days_of_inventory == null ? 'Sin ventas' :
                      <span className={item.days_of_inventory <= 7 ? 'text-red-600 font-semibold' : ''}>
                        {Math.round(item.days_of_inventory)}d
                      </span>
                    }
                  </td>
                  <td className="px-3 py-2 text-slate-600">{item.lead_time_days || 7}d</td>
                  <td className="px-3 py-2 text-slate-600">
                    {insufficient ? '—' : Math.round(item.reorder_point || 0)}
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {insufficient ? '—' : Math.round(item.safety_stock || 0)}
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1 text-blue-700 font-semibold text-sm">
                      <ArrowDown className="w-3.5 h-3.5" />
                      {item.recommended_qty}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className={`text-xs ${risk.color}`}>
                      {risk.label}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{item.supplier_name || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderSupplierTab = () => {
    if (loading) {
      return (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 rounded-lg" />)}
        </div>
      );
    }

    if (supplierGroups.length === 0) {
      return (
        <div className="py-16 text-center text-slate-500">
          <Truck className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p className="text-lg font-medium">Sin recomendaciones</p>
          <p className="text-sm">No hay medicamentos que necesiten ser reordenados.</p>
          <p className="text-xs text-slate-400 mt-2">Solo se muestran productos con cantidad sugerida ≥ 1</p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {supplierGroups.map(([supplierName, group]) => (
          <div key={supplierName} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-slate-500" />
                <span className="font-semibold text-slate-900">{supplierName}</span>
                <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                  {group.items.length} artículos
                </Badge>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-600">
                  Total: <span className="font-semibold text-slate-900">{group.totalQty}</span> unidades
                </span>
                <span className="text-sm text-slate-600">
                  Costo: <span className="font-semibold text-slate-900">{formatMXN(group.totalCost)}</span>
                </span>
                <Button
                  onClick={() => exportSupplierCSV(supplierName, group.items)}
                  variant="ghost" size="sm" className="h-7 text-xs gap-1"
                >
                  <Download className="w-3 h-3" />
                  CSV
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50/50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-slate-600">Medicamento</th>
                    <th className="px-4 py-2 text-left font-medium text-slate-600">Stock</th>
                    <th className="px-4 py-2 text-left font-medium text-slate-600">Cantidad sugerida</th>
                    <th className="px-4 py-2 text-left font-medium text-slate-600">Costo unit.</th>
                    <th className="px-4 py-2 text-left font-medium text-slate-600">Costo total</th>
                    <th className="px-4 py-2 text-left font-medium text-slate-600">Riesgo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {group.items.map(item => {
                    const risk = getRiskBadge(item.stockout_risk_score || 0);
                    return (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2 font-medium text-slate-900">{item.name}</td>
                        <td className="px-4 py-2 text-slate-600">{item.quantity}</td>
                        <td className="px-4 py-2 text-blue-700 font-semibold">{item.recommended_qty}</td>
                        <td className="px-4 py-2 text-slate-600">{formatMXN(item.cost || 0)}</td>
                        <td className="px-4 py-2 text-slate-600">{formatMXN(item.recommended_qty * (item.cost || 0))}</td>
                        <td className="px-4 py-2">
                          <Badge variant="outline" className={`text-xs ${risk.color}`}>{risk.label}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderSettingsTab = () => (
    <div className="max-w-lg">
      <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-5">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Configuración de reorden</h3>
          <p className="text-sm text-slate-500">Valores predeterminados para todos los cálculos de inventario.</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="leadTime" className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              Lead time promedio (días)
            </Label>
            <Input
              id="leadTime"
              type="number"
              min={1}
              max={90}
              value={settingsForm.default_lead_time_days}
              onChange={(e) => setSettingsForm({ ...settingsForm, default_lead_time_days: e.target.value })}
            />
            <p className="text-xs text-slate-400">Tiempo desde orden hasta recepción</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lookback" className="flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5 text-slate-400" />
              Días de análisis
            </Label>
            <Input
              id="lookback"
              type="number"
              min={7}
              max={180}
              value={settingsForm.reorder_lookback_days}
              onChange={(e) => setSettingsForm({ ...settingsForm, reorder_lookback_days: e.target.value })}
            />
            <p className="text-xs text-slate-400">Ventana histórica para promedios</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="criticalSS" className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-red-400" />
              Stock seguridad crítico (días)
            </Label>
            <Input
              id="criticalSS"
              type="number"
              min={1}
              max={30}
              value={settingsForm.critical_safety_stock_days}
              onChange={(e) => setSettingsForm({ ...settingsForm, critical_safety_stock_days: e.target.value })}
            />
            <p className="text-xs text-slate-400">Para medicamentos con receta</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="normalSS" className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-green-400" />
              Stock seguridad normal (días)
            </Label>
            <Input
              id="normalSS"
              type="number"
              min={1}
              max={30}
              value={settingsForm.normal_safety_stock_days}
              onChange={(e) => setSettingsForm({ ...settingsForm, normal_safety_stock_days: e.target.value })}
            />
            <p className="text-xs text-slate-400">Para medicamentos sin receta</p>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
          <p className="font-medium">Nota:</p>
          <p>Los cambios se aplicarán al recargar el reporte. El lead time por producto se puede configurar en la relación proveedor-producto.</p>
        </div>

        <Button onClick={handleSaveSettings} disabled={saving} className="w-full">
          {saving ? 'Guardando...' : 'Guardar configuración'}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Reporte de reorden</h1>
          <p className="text-sm text-slate-500 mt-1">Recomendaciones inteligentes basadas en velocidad de ventas.</p>
        </div>
        <div className="flex items-center gap-2">
          {locations.length > 1 && (
            <div className="flex items-center gap-2 mr-2">
              <MapPin className="w-4 h-4 text-slate-400" />
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className="px-2 py-1.5 rounded-md border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Todas las ubicaciones</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            </div>
          )}
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

      {/* Summary bar */}
      {!loading && items.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white rounded-lg border border-slate-200 p-3 flex items-center gap-3">
            <AlertTriangle className="w-8 h-8 text-red-500" />
            <div>
              <p className="text-2xl font-bold text-slate-900">{items.length}</p>
              <p className="text-xs text-slate-500">Artículos a reordenar</p>
            </div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-3 flex items-center gap-3">
            <Package className="w-8 h-8 text-blue-500" />
            <div>
              <p className="text-2xl font-bold text-slate-900">
                {items.reduce((s, i) => s + i.recommended_qty, 0)}
              </p>
              <p className="text-xs text-slate-500">Total unidades sugeridas</p>
            </div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-3 flex items-center gap-3">
            <TrendingUp className="w-8 h-8 text-orange-500" />
            <div>
              <p className="text-2xl font-bold text-slate-900">
                {items.filter(i => i.stockout_risk_score >= 80).length}
              </p>
              <p className="text-xs text-slate-500">Riesgo crítico</p>
            </div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-3 flex items-center gap-3">
            <Truck className="w-8 h-8 text-green-500" />
            <div>
              <p className="text-2xl font-bold text-slate-900">{supplierGroups.length}</p>
              <p className="text-xs text-slate-500">Proveedores afectados</p>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="flex border-b border-slate-100">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="p-4">
          {activeTab === 'reorder' && renderReorderTab()}
          {activeTab === 'supplier' && renderSupplierTab()}
          {activeTab === 'settings' && renderSettingsTab()}
        </div>
      </div>
    </div>
  );
};

export default AdminReorderReport;
