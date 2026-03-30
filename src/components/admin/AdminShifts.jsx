import { formatMXN } from '@/lib/currency';
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Clock, DollarSign, CreditCard, Stethoscope, ChevronDown, ChevronUp, AlertTriangle, Download, Printer } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search } from 'lucide-react';
import { exportShiftsCSV, printReport } from '@/lib/exportUtils';
import { useToast } from '@/components/ui/use-toast';

import { getShifts } from '@/lib/db';

const AdminShifts = () => {
  const [shifts, setShifts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedShift, setExpandedShift] = useState(null);
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
    const totalRev = closed.reduce((sum, s) => sum + (s.summary?.totalRevenue || 0), 0);
    const html = `
      <h1>Historial de turnos Report</h1>
      <div class="summary">
        <div class="summary-card"><p class="label">Total de turnos</p><p class="value">${closed.length}</p></div>
        <div class="summary-card"><p class="label">Total Revenue</p><p class="value">{formatMXN(totalRev)}</p></div>
      </div>
      <table>
        <thead><tr><th>Cajero</th><th>Ubicación</th><th>Apertura</th><th>Duración</th><th>Ventas</th><th>Ingresos</th><th>Efectivo inicial</th><th>Efectivo contado</th><th>Variación</th></tr></thead>
        <tbody>
          ${closed.map(s => {
            const ms = new Date(s.closedAt) - new Date(s.openedAt);
            const dur = `${Math.floor(ms/3600000)}h ${Math.floor((ms%3600000)/60000)}m`;
            const varClass = Math.abs(s.variance) < 0.01 ? 'green' : s.variance < 0 ? 'red' : 'yellow';
            return `<tr>
              <td>${s.openedBy}</td><td>${s.pharmacyLocation}</td>
              <td>${new Date(s.openedAt).toLocaleString()}</td><td>${dur}</td>
              <td>${s.summary?.totalSales || 0}</td><td>{formatMXN((s.summary?.totalRevenue||0))}</td>
              <td>{formatMXN(s.startingCash || 0)}</td><td>{formatMXN(s.closingCash || 0)}</td>
              <td><span class="badge ${varClass}">${s.variance > 0 ? '+' : ''}${s.variance?.toFixed(2)}</span></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
    printReport('Historial de turnos Report', html);
  };

  const filtered = shifts.filter(s =>
    (s.opened_by_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.locations?.name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const closedShifts = shifts.filter(s => s.status === 'closed');
  const totalRevenue = closedShifts.reduce((sum, s) => sum + (s.total_revenue || 0), 0);
  const avgVariance = closedShifts.length ? closedShifts.reduce((sum, s) => sum + Math.abs(s.variance || 0), 0) / closedShifts.length : 0;

  const duration = (shift) => {
    if (!shift.closed_at) return 'Abierto';
    const ms = new Date(shift.closed_at) - new Date(shift.opened_at);
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}h ${m}m`;
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
                  {expandedShift === shift.id && shift.status === 'closed' && (
                    <tr>
                      <td colSpan="9" className="p-0">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-slate-50 px-8 py-4 grid grid-cols-2 md:grid-cols-4 gap-4">
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
                        </motion.div>
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
