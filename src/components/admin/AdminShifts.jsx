import { formatMXN } from '@/lib/currency';
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Clock, DollarSign, CreditCard, Stethoscope, ChevronDown, ChevronUp, AlertTriangle, Download, Printer, Calendar } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Search } from 'lucide-react';
import { exportShiftsSummaryCSV, printReport } from '@/lib/exportUtils';
import { useToast } from '@/components/ui/use-toast';

import { getShifts, getSales, getSalesSince, closeShiftDb, updateShift, updateSale, createShift } from '@/lib/db';

const formatShiftDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
};

const formatShiftDuration = (shift) => {
  if (!shift.opened_at || !shift.closed_at) return '-';
  const opened = new Date(shift.opened_at);
  const closed = new Date(shift.closed_at);
  const ms = closed - opened;
  if (Number.isNaN(ms) || ms < 0) return '-';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
};

const AdminShifts = () => {
  const [shifts, setShifts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedShift, setExpandedShift] = useState(null);
  const [closingCash, setClosingCash] = useState({});
  const [closingNotes, setClosingNotes] = useState({});
  const [closingId, setClosingId] = useState(null);
  const [editingShift, setEditingShift] = useState(null);
  const [editClosingCash, setEditClosingCash] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [editStartingCash, setEditStartingCash] = useState('');
  const [exportStartDate, setExportStartDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [exportEndDate, setExportEndDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const { toast } = useToast();

  useEffect(() => {
    getShifts().then(data => setShifts(data)).catch(console.error);
  }, []);

  const handleExportCSV = () => {
    if (!exportStartDate || !exportEndDate) {
      toast({ title: 'Selecciona un rango de fechas', description: 'Elige la fecha de inicio y fin para descargar el CSV.', variant: 'destructive' });
      return;
    }
    const exported = exportShiftsSummaryCSV(shifts, exportStartDate, exportEndDate);
    if (exported === 0) {
      toast({ title: 'Sin turnos cerrados en este rango', description: 'No hay turnos cerrados entre las fechas seleccionadas.', variant: 'destructive' });
      return;
    }
    toast({ title: 'CSV descargado', description: `${exported} turno(s) exportado(s).` });
  };

  const handlePrint = () => {
    const closed = shifts.filter(s => s.status === 'closed');
    if (closed.length === 0) { toast({ title: 'Sin turnos cerrados para imprimir', variant: 'destructive' }); return; }
    const totalRev = closed.reduce((sum, s) => sum + (s.total_revenue || 0), 0);
    const html = `
      <h1>Reporte de historial de turnos</h1>
      <div class="summary">
        <div class="summary-card"><p class="label">Total de turnos</p><p class="value">${closed.length}</p></div>
        <div class="summary-card"><p class="label">Ingresos totales</p><p class="value">${formatMXN(totalRev)}</p></div>
      </div>
      <table>
        <thead><tr><th>Cajero</th><th>Ubicación</th><th>Apertura</th><th>Duración</th><th>Ventas</th><th>Ingresos</th><th>Efectivo inicial</th><th>Efectivo contado</th><th>Variación</th></tr></thead>
        <tbody>
          ${closed.map(s => {
            const variance = s.variance || 0;
            const varClass = Math.abs(variance) < 0.01 ? 'green' : variance < 0 ? 'red' : 'yellow';
            return `<tr>
              <td>${s.opened_by_name || '-'}</td><td>${s.locations?.name || '-'}</td>
              <td>${formatShiftDate(s.opened_at)}</td><td>${formatShiftDuration(s)}</td>
              <td>${s.total_sales ?? 0}</td><td>${formatMXN(s.total_revenue || 0)}</td>
              <td>${formatMXN(s.starting_cash || 0)}</td><td>${formatMXN(s.closing_cash || 0)}</td>
              <td><span class="badge ${varClass}">${variance > 0 ? '+' : ''}${formatMXN(variance)}</span></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
    printReport('Reporte de historial de turnos', html);
  };

  const filtered = shifts.filter(s =>
    (s.opened_by_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.locations?.name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const closedShifts = shifts.filter(s => s.status === 'closed');
  const totalRevenue = closedShifts.reduce((sum, s) => sum + (s.total_revenue || 0), 0);
  const avgVariance = closedShifts.length ? closedShifts.reduce((sum, s) => sum + Math.abs(s.variance || 0), 0) / closedShifts.length : 0;

  const handleCloseShift = async (shift) => {
    const cash = parseFloat(closingCash[shift.id]);
    if (Number.isNaN(cash) || cash < 0) {
      toast({ title: 'Cantidad inválida', description: 'Ingresa el efectivo contado al cierre.', variant: 'destructive' });
      return;
    }

    setClosingId(shift.id);
    try {
      const allSales = await getSales();
      const shiftSales = allSales.filter(s => !s.voided && s.shift_id === shift.id);

      let totalCash = 0, totalCard = 0, totalInsurance = 0, totalTransferencia = 0;
      shiftSales.forEach(sale => {
        if (sale.is_split_payment && sale.sale_payments?.length > 0) {
          sale.sale_payments.forEach(payment => {
            const amount = payment.amount || 0;
            switch (payment.payment_method) {
              case 'cash': totalCash += amount; break;
              case 'card': totalCard += amount; break;
              case 'insurance': totalInsurance += amount; break;
              case 'transferencia': totalTransferencia += amount; break;
            }
          });
        } else {
          switch (sale.payment_method) {
            case 'cash': totalCash += sale.total; break;
            case 'card': totalCard += sale.total; break;
            case 'insurance': totalInsurance += sale.total; break;
            case 'transferencia': totalTransferencia += sale.total; break;
            default: totalCash += sale.total;
          }
        }
      });

      const totalRevenue = shiftSales.reduce((sum, s) => sum + (s?.total || 0), 0);
      const expectedCash = (shift.starting_cash || 0) + totalCash;
      const variance = cash - expectedCash;

      await closeShiftDb(shift.id, {
        closed_at: new Date().toISOString(),
        closing_cash: cash,
        expected_cash: expectedCash,
        variance,
        notes: closingNotes[shift.id] || '',
        total_sales: shiftSales.length,
        total_revenue: totalRevenue,
        total_cash: totalCash,
        total_card: totalCard,
        total_insurance: totalInsurance,
      });

      const updated = await getShifts();
      setShifts(updated);
      setExpandedShift(null);
      toast({ title: 'Turno cerrado', description: `Variación: ${formatMXN(variance)}` });
    } catch (err) {
      console.error(err);
      toast({ title: 'Error al cerrar turno', description: err?.message || 'Intenta de nuevo', variant: 'destructive' });
    } finally {
      setClosingId(null);
    }
  };

  const handleEditStart = (shift) => {
    setEditingShift(shift.id);
    setEditStartingCash((shift.starting_cash || 0).toString());
    setEditClosingCash((shift.closing_cash || 0).toString());
    setEditNotes(shift.notes || '');
  };

  const handleEditSave = async (shift) => {
    const startingCash = parseFloat(editStartingCash);
    const cash = parseFloat(editClosingCash);
    if (Number.isNaN(startingCash) || startingCash < 0 || Number.isNaN(cash) || cash < 0) {
      toast({ title: 'Cantidad inválida', description: 'Ingresa montos válidos.', variant: 'destructive' });
      return;
    }

    setSavingEdit(true);
    try {
      const expectedCash = startingCash + (shift.total_cash || 0);
      const variance = cash - expectedCash;

      await updateShift(shift.id, {
        starting_cash: startingCash,
        closing_cash: cash,
        expected_cash: expectedCash,
        notes: editNotes,
        variance,
      });

      const updated = await getShifts();
      setShifts(updated);
      setEditingShift(null);
      toast({ title: 'Turno actualizado' });
    } catch (err) {
      console.error(err);
      toast({ title: 'Error al actualizar turno', description: err?.message || 'Intenta de nuevo', variant: 'destructive' });
    } finally {
      setSavingEdit(false);
    }
  };

  const handleEditCancel = () => {
    setEditingShift(null);
    setEditStartingCash('');
    setEditClosingCash('');
    setEditNotes('');
  };

  const handleReconciliation = async () => {
    if (!confirm('¿Crear turnos de reconciliación para ventas de las últimas 24 horas sin turno asignado?')) return;

    setReconciling(true);
    try {
      const now = new Date();
      const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const sales = await getSalesSince(since);
      const unlinked = sales.filter(s => !s.voided && !s.shift_id);

      if (unlinked.length === 0) {
        toast({ title: 'No hay ventas pendientes', description: 'Todas las ventas de las últimas 24 horas ya están en un turno.' });
        return;
      }

      // Group by org, location, date
      const groups = {};
      unlinked.forEach(sale => {
        const key = `${sale.org_id || 'null'}|${sale.location_id || 'null'}|${new Date(sale.timestamp).toISOString().split('T')[0]}`;
        if (!groups[key]) {
          groups[key] = {
            org_id: sale.org_id,
            location_id: sale.location_id,
            date: new Date(sale.timestamp).toISOString().split('T')[0],
            sales: [],
          };
        }
        groups[key].sales.push(sale);
      });

      let createdCount = 0;
      for (const group of Object.values(groups)) {
        const sorted = group.sales.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const firstSale = sorted[0];
        const lastSale = sorted[sorted.length - 1];

        let totalCash = 0, totalCard = 0, totalInsurance = 0, totalTransferencia = 0;
        group.sales.forEach(sale => {
          if (sale.is_split_payment && sale.sale_payments?.length > 0) {
            sale.sale_payments.forEach(payment => {
              const amount = payment.amount || 0;
              switch (payment.payment_method) {
                case 'cash': totalCash += amount; break;
                case 'card': totalCard += amount; break;
                case 'insurance': totalInsurance += amount; break;
                case 'transferencia': totalTransferencia += amount; break;
              }
            });
          } else {
            switch (sale.payment_method) {
              case 'cash': totalCash += sale.total; break;
              case 'card': totalCard += sale.total; break;
              case 'insurance': totalInsurance += sale.total; break;
              case 'transferencia': totalTransferencia += sale.total; break;
              default: totalCash += sale.total;
            }
          }
        });

        const totalRevenue = group.sales.reduce((sum, s) => sum + (s.total || 0), 0);
        const startingCash = 1000;
        const expectedCash = startingCash + totalCash;
        const closingCash = startingCash + totalCash;

        const shift = await createShift({
          location_id: group.location_id,
          opened_at: new Date(new Date(firstSale.timestamp).getTime() - 60 * 1000).toISOString(),
          closed_at: lastSale.timestamp,
          status: 'closed',
          starting_cash: startingCash,
          closing_cash: closingCash,
          expected_cash: expectedCash,
          variance: 0,
          notes: `Turno de reconciliación ${group.date}`,
          total_sales: group.sales.length,
          total_revenue: totalRevenue,
          total_cash: totalCash,
          total_card: totalCard,
          total_insurance: totalInsurance,
        });

        // Link sales to the new shift
        for (const sale of group.sales) {
          await updateSale(sale.id, { shift_id: shift.id });
        }
        createdCount++;
      }

      const updated = await getShifts();
      setShifts(updated);
      toast({ title: 'Reconciliación completada', description: `${createdCount} turno(s) creado(s) para ${unlinked.length} venta(s).` });
    } catch (err) {
      console.error(err);
      toast({ title: 'Error en reconciliación', description: err?.message || 'Intenta de nuevo', variant: 'destructive' });
    } finally {
      setReconciling(false);
    }
  };

  const duration = (shift) => {
    if (!shift.closed_at) return 'Abierto';
    return formatShiftDuration(shift);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Historial de turnos</h2>
          <p className="text-slate-600">Registros de conciliación de efectivo para todos los turnos</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1 w-44">
            <Label htmlFor="export-start" className="text-xs text-slate-600">Del</Label>
            <div className="relative">
              <Calendar className="absolute left-2 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
              <Input id="export-start" type="date" value={exportStartDate} onChange={e => setExportStartDate(e.target.value)} className="pl-8 w-full" />
            </div>
          </div>
          <div className="flex flex-col gap-1 w-44">
            <Label htmlFor="export-end" className="text-xs text-slate-600">Al</Label>
            <div className="relative">
              <Calendar className="absolute left-2 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
              <Input id="export-end" type="date" value={exportEndDate} onChange={e => setExportEndDate(e.target.value)} className="pl-8 w-full" />
            </div>
          </div>
          <Button variant="outline" onClick={handlePrint}><Printer className="w-4 h-4 mr-2" />Imprimir PDF</Button>
          <Button onClick={handleExportCSV}><Download className="w-4 h-4 mr-2" />Exportar CSV</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-gradient-to-br from-orange-500 to-red-500 rounded-xl shadow-lg p-6 text-white">
          <Clock className="w-8 h-8 mb-2" />
          <p className="text-sm opacity-90">Total de turnos</p>
          <p className="text-3xl font-bold">{closedShifts.length}</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl shadow-lg p-6 text-white">
          <DollarSign className="w-8 h-8 mb-2" />
          <p className="text-sm opacity-90">Ingresos totales (cerrados)</p>
          <p className="text-3xl font-bold">{formatMXN(totalRevenue)}</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-gradient-to-br from-apolo-navy to-apolo-navy-dark rounded-xl shadow-lg p-6 text-white">
          <AlertTriangle className="w-8 h-8 mb-2" />
          <p className="text-sm opacity-90">Variación promedio de efectivo</p>
          <p className="text-3xl font-bold">{formatMXN(avgVariance)}</p>
        </motion.div>
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-white rounded-xl shadow-lg p-6">
        <div className="mb-6 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
            <Input placeholder="Buscar por cajero o ubicación..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10" />
          </div>
          <Button
            variant="outline"
            onClick={handleReconciliation}
            disabled={reconciling}
            className="border-apolo-navy/30 text-apolo-navy hover:bg-apolo-navy/5"
          >
            {reconciling ? 'Reconciliando...' : 'Reconciliación'}
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-900 w-10"></th>
                <th className="px-4 py-3 text-left font-semibold text-slate-900">Cajero</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-900">Ubicación</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-900">Apertura</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-900">Duración</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-900">Ventas</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-900">Ingresos</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-900">Variación</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-900">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filtered.map(shift => (
                <React.Fragment key={shift.id}>
                  <tr className="hover:bg-slate-50 cursor-pointer" onClick={() => setExpandedShift(expandedShift === shift.id ? null : shift.id)}>
                    <td className="px-4 py-3 text-center">{expandedShift === shift.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{shift.opened_by_name}</td>
                    <td className="px-4 py-3 text-slate-600">{shift.locations?.name}</td>
                    <td className="px-4 py-3 text-slate-600">{new Date(shift.opened_at).toLocaleString()}</td>
                    <td className="px-4 py-3 text-slate-600">{duration(shift)}</td>
                    <td className="px-4 py-3 text-slate-600">{shift.total_sales ?? '...'}</td>
                    <td className="px-4 py-3 font-semibold text-green-600">{formatMXN((shift.total_revenue || 0))}</td>
                    <td className="px-4 py-3">
                      {shift.status === 'open'
                        ? <span className="text-slate-400 text-xs">Pending</span>
                        : (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${Math.abs(shift.variance) < 0.01 ? 'bg-green-100 text-green-700' : shift.variance < 0 ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                            {shift.variance > 0 ? '+' : ''}{(shift.variance || 0).toFixed(2)}
                          </span>
                        )
                      }
                    </td>
                    <td className="px-4 py-3">
                      {shift.status === 'open'
                        ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700"><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />Abierto</span>
                        : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">Cerrado</span>
                      }
                    </td>
                  </tr>
                  {expandedShift === shift.id && (
                    <tr>
                      <td colSpan="9" className="p-0">
                        {shift.status === 'open' ? (
                          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-slate-50 px-8 py-4 space-y-4">
                            <p className="text-sm font-medium text-slate-900">Cerrar turno manualmente</p>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div className="space-y-2">
                                <Label htmlFor={`closing-cash-${shift.id}`}>Efectivo contado al cierre (MXN)</Label>
                                <Input
                                  id={`closing-cash-${shift.id}`}
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  placeholder="0.00"
                                  value={closingCash[shift.id] || ''}
                                  onChange={e => setClosingCash(prev => ({ ...prev, [shift.id]: e.target.value }))}
                                />
                              </div>
                              <div className="md:col-span-2 space-y-2">
                                <Label htmlFor={`closing-notes-${shift.id}`}>Notas (opcional)</Label>
                                <Input
                                  id={`closing-notes-${shift.id}`}
                                  placeholder="Ej: cierre forzado por administrador"
                                  value={closingNotes[shift.id] || ''}
                                  onChange={e => setClosingNotes(prev => ({ ...prev, [shift.id]: e.target.value }))}
                                />
                              </div>
                            </div>
                            <div className="flex justify-end">
                              <Button
                                onClick={() => handleCloseShift(shift)}
                                disabled={closingId === shift.id}
                                className="bg-orange-500 hover:bg-orange-600"
                              >
                                {closingId === shift.id ? 'Cerrando...' : 'Cerrar turno'}
                              </Button>
                            </div>
                          </motion.div>
                        ) : editingShift === shift.id ? (
                          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-slate-50 px-8 py-4 space-y-4">
                            <p className="text-sm font-medium text-slate-900">Editar turno cerrado</p>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div className="space-y-2">
                                <Label htmlFor={`edit-starting-cash-${shift.id}`}>Efectivo inicial (MXN)</Label>
                                <Input
                                  id={`edit-starting-cash-${shift.id}`}
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  placeholder="0.00"
                                  value={editStartingCash}
                                  onChange={e => setEditStartingCash(e.target.value)}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor={`edit-closing-cash-${shift.id}`}>Efectivo contado (MXN)</Label>
                                <Input
                                  id={`edit-closing-cash-${shift.id}`}
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  placeholder="0.00"
                                  value={editClosingCash}
                                  onChange={e => setEditClosingCash(e.target.value)}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor={`edit-notes-${shift.id}`}>Notas</Label>
                                <Input
                                  id={`edit-notes-${shift.id}`}
                                  placeholder="Notas del cierre"
                                  value={editNotes}
                                  onChange={e => setEditNotes(e.target.value)}
                                />
                              </div>
                            </div>
                            <div className="flex justify-end gap-2">
                              <Button variant="outline" onClick={handleEditCancel}>Cancelar</Button>
                              <Button
                                onClick={() => handleEditSave(shift)}
                                disabled={savingEdit}
                                className="bg-apolo-navy hover:bg-apolo-navy-dark"
                              >
                                {savingEdit ? 'Guardando...' : 'Guardar'}
                              </Button>
                            </div>
                          </motion.div>
                        ) : (
                          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-slate-50 px-8 py-4 space-y-4">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-medium text-slate-900">Detalle del turno</p>
                              <Button variant="outline" size="sm" onClick={() => handleEditStart(shift)}>
                                Editar
                              </Button>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              <div className="space-y-1">
                                <p className="text-xs text-slate-500">Efectivo inicial</p>
                                <p className="font-semibold">{formatMXN(shift.starting_cash || 0)}</p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-xs text-slate-500 flex items-center gap-1"><DollarSign className="w-3 h-3" />Ventas en efectivo</p>
                                <p className="font-semibold">{formatMXN(shift.total_cash || 0)}</p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-xs text-slate-500 flex items-center gap-1"><CreditCard className="w-3 h-3" />Ventas con tarjeta</p>
                                <p className="font-semibold">{formatMXN(shift.total_card || 0)}</p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-xs text-slate-500 flex items-center gap-1"><Stethoscope className="w-3 h-3" />Seguro</p>
                                <p className="font-semibold">{formatMXN(shift.total_insurance || 0)}</p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-xs text-slate-500">Efectivo esperado</p>
                                <p className="font-semibold">{formatMXN(shift.expected_cash || 0)}</p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-xs text-slate-500">Efectivo contado</p>
                                <p className="font-semibold">{formatMXN(shift.closing_cash || 0)}</p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-xs text-slate-500">Cerrado a las</p>
                                <p className="font-semibold">{new Date(shift.closed_at).toLocaleTimeString()}</p>
                              </div>
                              {shift.notes && (
                                <div className="space-y-1 md:col-span-1">
                                  <p className="text-xs text-slate-500">Notas</p>
                                  <p className="text-sm italic text-slate-600">{shift.notes}</p>
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan="9" className="px-4 py-8 text-center text-slate-500">No se encontraron turnos.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
};

export default AdminShifts;
