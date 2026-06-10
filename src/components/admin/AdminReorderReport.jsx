import React, { useState, useEffect } from 'react';
import { Download, AlertTriangle, Package, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { getInventoryLowStock } from '@/lib/db';

const AdminReorderReport = () => {
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await getInventoryLowStock();
      setItems(data || []);
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'No se pudo cargar el reporte', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const exportCSV = () => {
    const headers = ['Medicamento', 'Stock actual', 'Stock mínimo', 'Cantidad sugerida', 'Proveedor', 'Código de barras'];
    const rows = items.map((item) => [
      item.name,
      item.quantity || 0,
      item.low_stock_threshold || 10,
      Math.max((item.low_stock_threshold || 10) * 2 - (item.quantity || 0), 0),
      item.suppliers?.name || '',
      item.barcode || '',
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
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

  const suggestedQty = (item) => {
    const threshold = item.low_stock_threshold || 10;
    const current = item.quantity || 0;
    return Math.max(threshold * 2 - current, 0);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Reporte de reorden</h1>
          <p className="text-sm text-slate-500 mt-1">Medicamentos con stock bajo o agotado.</p>
        </div>
        <Button onClick={exportCSV} variant="outline" className="gap-2">
          <Download className="w-4 h-4" />
          Exportar CSV
        </Button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        {isLoading ? (
          <div className="py-12 text-center text-slate-500">Cargando reporte...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Medicamento</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Stock actual</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Stock mínimo</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Cantidad sugerida</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Proveedor</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Alerta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {items.map((item) => {
                  const isOutOfStock = (item.quantity || 0) === 0;
                  const isLowStock = !isOutOfStock && (item.quantity || 0) <= (item.low_stock_threshold || 10);
                  return (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-sm">
                        <div className="flex items-center gap-2">
                          <Package className="w-4 h-4 text-slate-400" />
                          <div>
                            <div className="font-medium text-slate-900">{item.name}</div>
                            {item.barcode && <div className="text-xs text-slate-500 font-mono">{item.barcode}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`font-semibold ${isOutOfStock ? 'text-red-600' : isLowStock ? 'text-amber-600' : 'text-slate-900'}`}>
                          {item.quantity || 0}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{item.low_stock_threshold || 10}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-blue-700">
                        <div className="flex items-center gap-1">
                          <ArrowDown className="w-3.5 h-3.5" />
                          {suggestedQty(item)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{item.suppliers?.name || '—'}</td>
                      <td className="px-4 py-3 text-sm">
                        {isOutOfStock ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            <AlertTriangle className="w-3 h-3" />
                            Agotado
                          </span>
                        ) : isLowStock ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                            <AlertTriangle className="w-3 h-3" />
                            Stock bajo
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      🎉 No hay medicamentos con stock bajo. Todo está bien surtido.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminReorderReport;
