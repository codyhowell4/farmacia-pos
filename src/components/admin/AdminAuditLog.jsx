import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, Download, Shield, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { exportAuditCSV } from '@/lib/exportUtils';
import { AUDIT_ACTIONS } from '@/lib/auditLog';
import { useToast } from '@/components/ui/use-toast';

const ACTION_COLORS = {
  LOGIN: 'bg-green-100 text-green-700',
  LOGOUT: 'bg-slate-100 text-slate-600',
  SHIFT_OPEN: 'bg-blue-100 text-blue-700',
  SHIFT_CLOSE: 'bg-orange-100 text-orange-700',
  SALE_COMPLETE: 'bg-emerald-100 text-emerald-700',
  SALE_VOID: 'bg-red-100 text-red-700',
  PRICE_OVERRIDE: 'bg-yellow-100 text-yellow-700',
  INVENTORY_ADD: 'bg-purple-100 text-purple-700',
  INVENTORY_EDIT: 'bg-purple-100 text-purple-700',
  INVENTORY_DELETE: 'bg-red-100 text-red-700',
  DISCOUNT_ADD: 'bg-cyan-100 text-cyan-700',
  DISCOUNT_DELETE: 'bg-red-100 text-red-700',
  USER_ADD: 'bg-indigo-100 text-indigo-700',
  USER_EDIT: 'bg-indigo-100 text-indigo-700',
  USER_DELETE: 'bg-red-100 text-red-700',
};

import { getAuditLog } from '@/lib/db';

const AdminAuditLog = () => {
  const [entries, setEntries] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const { toast } = useToast();

  const load = () => {
    getAuditLog().then(setEntries).catch(console.error);
  };

  useEffect(() => { load(); }, []);

  const filtered = entries.filter(e => {
    const matchesSearch =
      (e.user_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (e.details || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (e.location_id || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesAction = actionFilter === 'all' || e.action === actionFilter;
    return matchesSearch && matchesAction;
  });

  const handleExport = () => {
    if (filtered.length === 0) { toast({ title: 'Sin entradas para exportar', variant: 'destructive' }); return; }
    exportAuditCSV(filtered);
    toast({ title: 'Registro de auditoría exportado' });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Registro de auditoría</h2>
          <p className="text-slate-600">Historial completo de actividad de todos los usuarios y ubicaciones</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="w-4 h-4 mr-2" />Actualizar</Button>
          <Button size="sm" onClick={handleExport}><Download className="w-4 h-4 mr-2" />Exportar CSV</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { label: 'Total de eventos', value: entries.length, color: 'from-blue-500 to-indigo-600' },
          { label: 'Eventos de venta', value: entries.filter(e => e.action === 'SALE_COMPLETE').length, color: 'from-green-500 to-emerald-600' },
          { label: 'Eventos de anulación', value: entries.filter(e => e.action === 'SALE_VOID').length, color: 'from-red-500 to-rose-600' },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
            className={`bg-gradient-to-br ${s.color} rounded-xl shadow-lg p-6 text-white`}>
            <Shield className="w-8 h-8 mb-2" />
            <p className="text-sm opacity-90">{s.label}</p>
            <p className="text-3xl font-bold">{s.value}</p>
          </motion.div>
        ))}
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex gap-3 mb-6 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
            <Input placeholder="Buscar por usuario, ubicación, detalle..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10" />
          </div>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Filtrar por acción" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las acciones</SelectItem>
              {Object.keys(AUDIT_ACTIONS).map(a => (
                <SelectItem key={a} value={a}>{a.replace(/_/g, ' ')}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-900">Fecha y hora</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-900">Acción</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-900">Usuario</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-900">Ubicación</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-900">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filtered.map(entry => (
                <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{new Date(entry.timestamp).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${ACTION_COLORS[entry.action] || 'bg-slate-100 text-slate-600'}`}>
                      {({
    'LOGIN': 'INICIO SESIÓN',
    'LOGOUT': 'CIERRE SESIÓN',
    'SHIFT_OPEN': 'APERTURA TURNO',
    'SHIFT_CLOSE': 'CIERRE TURNO',
    'SALE_COMPLETE': 'VENTA COMPLETADA',
    'SALE_VOID': 'VENTA ANULADA',
    'PRICE_OVERRIDE': 'PRECIO MODIFICADO',
    'INVENTORY_ADD': 'INV. AGREGADO',
    'INVENTORY_EDIT': 'INV. EDITADO',
    'INVENTORY_DELETE': 'INV. ELIMINADO',
    'DISCOUNT_ADD': 'DESCUENTO AGREGADO',
    'DISCOUNT_DELETE': 'DESCUENTO ELIMINADO',
    'USER_ADD': 'USUARIO AGREGADO',
    'USER_EDIT': 'USUARIO EDITADO',
    'USER_DELETE': 'USUARIO ELIMINADO'
  })[entry.action] || entry.action?.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">{entry.user_name}</td>
                  <td className="px-4 py-3 text-slate-600">{entry.location_id || 'N/A'}</td>
                  <td className="px-4 py-3 text-slate-600 max-w-xs truncate" title={entry.details}>{entry.details}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan="5" className="px-4 py-8 text-center text-slate-500">No se encontraron entradas de auditoría.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
};

export default AdminAuditLog;
