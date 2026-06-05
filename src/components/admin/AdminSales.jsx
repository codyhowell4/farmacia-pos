import { formatMXN } from '@/lib/currency';
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, Calendar, DollarSign, Download, ChevronDown, ChevronUp, CreditCard, Stethoscope, XCircle, Printer, Cloud, CloudOff, RotateCcw, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { exportSalesCSV, printReport } from '@/lib/exportUtils';
import { syncSaleById } from '@/services/akauntingSync';

const PaymentBadge = ({ method }) => {
  if (!method || method === 'cash') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700"><DollarSign className="w-3 h-3" />Efectivo</span>;
  if (method === 'card') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700"><CreditCard className="w-3 h-3" />Tarjeta</span>;
  if (method === 'transferencia') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-orange-100 text-orange-700"><DollarSign className="w-3 h-3" />Transferencia</span>;
  if (method === 'insurance') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-purple-100 text-purple-700"><Stethoscope className="w-3 h-3" />Seguro</span>;
  return <span className="text-xs text-slate-500">{method}</span>;
};

const SyncStatusBadge = ({ sale }) => {
  if (sale.voided) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-500">
        <XCircle className="w-3 h-3" />Anulada
      </span>
    );
  }
  if (sale.akaunting_invoice_id) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700" title={`Factura Akaunting: ${sale.akaunting_invoice_id}`}>
        <Cloud className="w-3 h-3" />Sincronizada
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700">
      <CloudOff className="w-3 h-3" />Pendiente
    </span>
  );
};

import { getSales } from '@/lib/db';

const AdminSales = () => {
  const [sales, setSales] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedSale, setExpandedSale] = useState(null);
  const [showVoided, setShowVoided] = useState(false);
  const [retryingId, setRetryingId] = useState(null);
  const { toast } = useToast();

  const loadSales = async () => {
    try {
      const data = await getSales();
      setSales(data);
    } catch (e) {
      console.error(e);
      setSales([]);
      toast({ title: 'Error Loading Data', description: 'Could not load sales history.', variant: 'destructive' });
    }
  };

  useEffect(() => {
    loadSales();
  }, []);

  const downloadCSV = () => {
    if (filteredSales.length === 0) { toast({ title: 'Sin datos para exportar', variant: 'destructive' }); return; }
    exportSalesCSV(filteredSales);
    toast({ title: 'Reporte descargado' });
  };

  const handlePrint = () => {
    if (filteredSales.length === 0) { toast({ title: 'Sin datos para imprimir', variant: 'destructive' }); return; }
    const activeSales = filteredSales.filter(s => !s.voided);
    const revenue = activeSales.reduce((sum, s) => sum + s.total, 0);
    const summaryHtml = `
      <h1>Sales Report</h1>
      <p class="meta">${filteredSales.length} transactions &middot; ${activeSales.length} completed &middot; ${filteredSales.length - activeSales.length} voided</p>
      <div class="summary">
        <div class='summary-card'><p class='label'>Ingresos totales</p><p class='value'>${new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(revenue)}</p></div>
        <div class='summary-card'><p class='label'>Transacciones</p><p class='value'>${activeSales.length}</p></div>
        <div class='summary-card'><p class='label'>Venta promedio</p><p class='value'>${activeSales.length ? new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(revenue/activeSales.length) : 'MX$0.00'}</p></div>
      </div>
      <table>
        <thead><tr><th>Fecha</th><th>Vendedor</th><th>Farmacia</th><th>Artículos</th><th>Pago</th><th>Total</th><th>Estado</th></tr></thead>
        <tbody>
          ${filteredSales.map(s => `
            <tr>
              <td>${new Date(s.timestamp).toLocaleString()}</td>
              <td>${s.salesperson}</td>
              <td>${s.location_id}</td>
              <td>${(s.sale_items || []).length}</td>
              <td>${s.payment_method || 'cash'}</td>
              <td>${formatMXN((s.total || 0))}</td>
              <td><span class="badge ${s.voided ? 'red' : 'green'}">${s.voided ? 'Anulada' : 'Completada'}</span></td>
            </tr>`).join('')}
        </tbody>
      </table>`;
    printReport('Reporte de ventas', summaryHtml);
  };

  const handleRetrySync = async (sale) => {
    if (sale.voided) {
      toast({ title: 'No se puede sincronizar', description: 'Las ventas anuladas no se sincronizan.', variant: 'destructive' });
      return;
    }
    setRetryingId(sale.id);
    try {
      const res = await syncSaleById(sale.id);
      if (res.action === 'created' || res.action === 'updated') {
        toast({ title: 'Sincronización exitosa', description: `Factura Akaunting: ${res.akauntingId}` });
        await loadSales(); // refresh to show synced status
      } else {
        toast({ title: 'Sin cambios', description: 'La venta ya estaba sincronizada.' });
      }
    } catch (e) {
      toast({ title: 'Error de sincronización', description: e.message, variant: 'destructive' });
    } finally {
      setRetryingId(null);
    }
  };

  const filteredSales = sales.filter(sale => {
    const matchesSearch = (sale.salesperson && sale.salesperson.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (sale.location_id && sale.location_id.toLowerCase().includes(searchTerm.toLowerCase()));
    if (!showVoided && sale.voided) return false;
    return matchesSearch;
  });

  const activeSalesForStats = filteredSales.filter(s => !s.voided);
  const totalRevenue = activeSalesForStats.reduce((sum, sale) => sum + (sale.total || 0), 0);
  const totalIVA = activeSalesForStats.reduce((sum, sale) => sum + (sale.iva_amount || 0), 0);
  const totalBaseRevenue = totalRevenue - totalIVA;
  const totalByCash = activeSalesForStats.filter(s => !s.payment_method || s.payment_method === 'cash').reduce((sum, s) => sum + s.total, 0);
  const totalByCard = activeSalesForStats.filter(s => s.payment_method === 'card').reduce((sum, s) => sum + s.total, 0);
  const totalByInsurance = activeSalesForStats.filter(s => s.payment_method === 'insurance').reduce((sum, s) => sum + s.total, 0);

  const toggleExpand = (id) => {
    setExpandedSale(expandedSale === id ? null : id);
  };

  return (
    <div className="space-y-6">
      <div className="sm:flex sm:justify-between sm:items-start">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Historial de ventas</h2>
          <p className="text-slate-600">Consulta todas las transacciones de la farmacia</p>
        </div>
        <div className="flex gap-2 mt-4 sm:mt-0">
          <Button variant="outline" onClick={handlePrint}><Printer className="w-4 h-4 mr-2" />Imprimir PDF</Button>
          <Button onClick={downloadCSV}><Download className="w-4 h-4 mr-2" />Exportar CSV</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl shadow-lg p-6 text-white">
          <DollarSign className="w-8 h-8 mb-2" /><p className="text-sm opacity-90">Total Revenue</p><p className="text-3xl font-bold">{formatMXN(totalRevenue)}</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg p-6 text-white">
          <Calendar className="w-8 h-8 mb-2" /><p className="text-sm opacity-90">Total Transactions</p><p className="text-3xl font-bold">{filteredSales.length}</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl shadow-lg p-6 text-white">
          <DollarSign className="w-8 h-8 mb-2" /><p className="text-sm opacity-90">Average Sale</p><p className="text-3xl font-bold">${filteredSales.length > 0 ? (totalRevenue / filteredSales.length).toFixed(2) : '0.00'}</p>
        </motion.div>
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-white rounded-xl shadow-lg p-6">
        <div className="mb-6 flex gap-3 items-center">
          <div className="relative flex-1"><Search className="absolute left-3 top-3 h-5 w-5 text-slate-400" /><Input placeholder="Buscar por vendedor o farmacia..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" /></div>
          <Button variant={showVoided ? 'destructive' : 'outline'} size="sm" onClick={() => setShowVoided(!showVoided)}>
            <XCircle className="w-4 h-4 mr-1" />{showVoided ? 'Hide Voided' : 'Show Voided'}
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200"><tr><th className="px-4 py-3 text-left font-semibold text-slate-900 w-10"></th><th className="px-4 py-3 text-left font-semibold text-slate-900">Fecha y hora</th><th className="px-4 py-3 text-left font-semibold text-slate-900">Vendedor</th><th className="px-4 py-3 text-left font-semibold text-slate-900">Farmacia</th><th className="px-4 py-3 text-left font-semibold text-slate-900">Artículos</th><th className="px-4 py-3 text-left font-semibold text-slate-900">Pago</th><th className="px-4 py-3 text-left font-semibold text-slate-900">IVA</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-900">Descuento</th><th className="px-4 py-3 text-left font-semibold text-slate-900">Total</th><th className="px-4 py-3 text-left font-semibold text-slate-900">Akaunting</th></tr></thead>
            <tbody className="divide-y divide-slate-200">
              {filteredSales.map((sale) => (
                <React.Fragment key={sale.id}>
                <tr className={`hover:bg-slate-50 transition-colors cursor-pointer ${sale.voided ? 'opacity-50' : ''}`} onClick={() => toggleExpand(sale.id)}>
                  <td className="px-4 py-3 text-center">{expandedSale === sale.id ? <ChevronUp className="w-4 h-4"/> : <ChevronDown className="w-4 h-4"/>}</td>
                  <td className="px-4 py-3 text-slate-600">{new Date(sale.timestamp).toLocaleString()}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{sale.salesperson}</td>
                  <td className="px-4 py-3 text-slate-600">{sale.location_id}</td>
                  <td className="px-4 py-3 text-slate-600">{sale.sale_items ? sale.sale_items.length : 0}</td>
                  <td className="px-4 py-3"><PaymentBadge method={sale.payment_method} /></td>
                  <td className="px-4 py-3 text-slate-600 text-sm">{sale.iva_amount ? formatMXN(sale.iva_amount) : <span className="text-slate-400">—</span>}</td>
                  <td className="px-4 py-3 text-slate-600">{sale.discount_code ? `${sale.discount_code} (-${formatMXN(sale.discount_amount || 0)})` : 'Ninguno'}</td>
                  <td className="px-4 py-3">
                    {sale.voided
                      ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700"><XCircle className="w-3 h-3" />Anulada</span>
                      : <span className="font-bold text-green-600">{formatMXN(sale.total || 0)}</span>
                    }
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      <SyncStatusBadge sale={sale} />
                      {!sale.voided && !sale.akaunting_invoice_id && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-xs"
                          disabled={retryingId === sale.id}
                          onClick={() => handleRetrySync(sale)}
                        >
                          {retryingId === sale.id ? (
                            <RotateCcw className="w-3 h-3 animate-spin" />
                          ) : (
                            <RotateCcw className="w-3 h-3" />
                          )}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
                {expandedSale === sale.id && (
                    <tr>
                        <td colSpan="10" className="p-0">
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="bg-slate-50 px-8 py-4">
                               <div className="flex items-center justify-between mb-2">
                                 <h4 className="font-bold">Detalle de venta</h4>
                                 <span className="text-sm font-mono font-semibold text-slate-600 bg-white border px-2 py-0.5 rounded">Folio: #{sale.id.slice(-8).toUpperCase()}</span>
                               </div>
                               {(sale.patient_name || sale.customers?.full_name) && (
                                 <div className="mb-2 p-2 bg-blue-50 rounded text-xs text-blue-700">
                                   <span className="font-medium">Cliente:</span> {sale.customers?.full_name || sale.patient_name}
                                   {(sale.customers?.phone || sale.patient_curp) && (
                                     <span className="ml-2">| {(sale.customers?.phone || sale.patient_curp)}</span>
                                   )}
                                   {sale.customers?.curp && <span className="ml-2">| CURP: {sale.customers.curp}</span>}
                                 </div>
                               )}
                               {sale.akaunting_invoice_id && (
                                 <div className="mb-2 p-2 bg-blue-50 rounded text-xs text-blue-700 flex items-center gap-2">
                                   <Cloud className="w-3 h-3" />
                                   <span className="font-medium">Factura Akaunting:</span> {sale.akaunting_invoice_id}
                                   {sale.synced_at && <span className="ml-2 text-slate-500">| {new Date(sale.synced_at).toLocaleString()}</span>}
                                 </div>
                               )}
                               {sale.voided && sale.akaunting_invoice_id && (
                                 <div className="mb-2 p-2 bg-amber-50 rounded text-xs text-amber-700 flex items-center gap-2">
                                   <AlertTriangle className="w-3 h-3" />
                                   <span className="font-medium">Venta anulada después de sincronizar.</span>
                                   La factura en Akaunting deberá cancelarse manualmente.
                                 </div>
                               )}
                               <ul>
                                {(sale.sale_items || []).map((item, index) => (
                                    <li key={item.id || index} className="flex justify-between items-center py-1 border-b">
                                        <div>
                                            {item.name} <span className="text-slate-500">x{item.quantity}</span>
                                            {item.override_by && <span className="text-xs text-blue-600 ml-2 rounded-full px-2 py-0.5 bg-blue-100">Overridden by {item.override_by}</span>}
                                        </div>
                                        <div className="text-right">
                                            <p>${(item.price && item.quantity) ? (item.price * item.quantity).toFixed(2) : '0.00'}</p>
                                            {item.price !== item.original_price && <p className="text-xs text-slate-500 line-through">${(item.original_price && item.quantity) ? (item.original_price * item.quantity).toFixed(2) : '0.00'}</p>}
                                        </div>
                                    </li>
                                ))}
                               </ul>
                            </motion.div>
                        </td>
                    </tr>
                )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
};

export default AdminSales;
