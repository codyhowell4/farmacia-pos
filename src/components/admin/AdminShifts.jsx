import { formatMXN } from '@/lib/currency';
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Clock, DollarSign, CreditCard, Stethoscope, ChevronDown, ChevronUp, AlertTriangle, Download, Printer } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Search } from 'lucide-react';
import { exportShiftsCSV, printReport } from '@/lib/exportUtils';
import { useToast } from '@/components/ui/use-toast';

import { getShifts, getSales, closeShiftDb, updateShift } from '@/lib/db';

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
  const { toast } = useToast();

  useEffect(() => {
    getShifts().then(data => setShifts(data)).catch(console.error);
  }, []);

  const handleExportCSV = () => {
    if (shifts.filter(s => s.status === 'closed').length === 0) { toast({ title: 'Sin turnos cerrados para exportar', variant: 'destructive' }); return; }
    exportShiftsCSV(shifts);
    toast({ title: 'Turnos exportados' });
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
    setEditClosingCash((shift.closing_cash || 0).toString());
    setEditNotes(shift.notes || '');
  };

  const handleEditSave = async (shift) => {
    const cash = parseFloat(editClosingCash);
    if (Number.isNaN(cash) || cash < 0) {
      toast({ title: 'Cantidad inválida', description: 'Ingresa un monto válido.', variant: 'destructive' });
      return;
    }

    setSavingEdit(true);
    try {
      const expectedCash = shift.expected_cash || (shift.starting_cash || 0) + (shift.total_cash || 0);
      const variance = cash - expectedCash;

      await updateShift(shift.id, {
        closing_cash: cash,
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
    setEditClosingCash('');
    setEditNotes('');
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
        <div className="flex gap-2">
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
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg p-6 text-white">
          <AlertTriangle className="w-8 h-8 mb-2" />
          <p className="text-sm opacity-90">Variación promedio de efectivo</p>
          <p className="text-3xl font-bold">{formatMXN(avgVariance)}</p>
        </motion.div>
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-white rounded-xl shadow-lg p-6">
        <div className="mb-6 relative">
          <Search className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
          <Input placeholder="Buscar por cajero o ubicación..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10" />
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
                              <div className="md:col-span-2 space-y-2">
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
                                className="bg-blue-500 hover:bg-blue-600"
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
