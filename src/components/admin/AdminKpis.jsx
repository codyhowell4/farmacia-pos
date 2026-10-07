import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Clock, Target, BarChart3, ShoppingCart, Megaphone, Star, FileText, Phone,
  SignpostBig, RefreshCw, Loader2, AlertTriangle, Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { getPointActivityTypes, getShiftPointsSummaries } from '@/lib/db';
import { dayKeyInTz, dateInTz, timeInTz } from '@/lib/timezone';

const ACTIVITY_ICONS = {
  pitch_membresia: Megaphone,
  resena_google: Star,
  volantes: FileText,
  llamada_seguimiento: Phone,
  aframe_banner: SignpostBig,
};

const TILE_COLORS = [
  'from-blue-500 to-indigo-600',
  'from-purple-500 to-pink-600',
  'from-amber-500 to-yellow-600',
  'from-teal-500 to-emerald-600',
  'from-violet-500 to-purple-600',
  'from-orange-500 to-red-600',
];

const fmt = (n) => (n || 0).toLocaleString('es-MX');

const AdminKpis = () => {
  const [types, setTypes] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { toast } = useToast();

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const since = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
      const [activityTypes, summaries] = await Promise.all([
        getPointActivityTypes(),
        getShiftPointsSummaries(since),
      ]);
      setTypes(activityTypes);
      setRows(summaries);
    } catch (e) {
      console.error(e);
      setError(e);
      toast({ title: 'Error', description: 'No se pudieron cargar los KPIs', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadData(); }, [loadData]);

  const todayKey = dayKeyInTz(new Date().toISOString());

  const last14Keys = useMemo(() => {
    const keys = new Set();
    for (let i = 0; i < 14; i++) {
      keys.add(dayKeyInTz(new Date(Date.now() - i * 86400000).toISOString()));
    }
    return keys;
  }, []);

  const openShift = rows.find(r => r.status === 'open') || null;
  const todayRows = rows.filter(r => dayKeyInTz(r.opened_at) === todayKey);
  const todayTotal = todayRows.reduce((sum, r) => sum + (r.total_points || 0), 0);
  const last14Rows = rows.filter(r => last14Keys.has(dayKeyInTz(r.opened_at)));
  const avgPerShift = last14Rows.length
    ? Math.round(last14Rows.reduce((sum, r) => sum + (r.total_points || 0), 0) / last14Rows.length)
    : 0;
  const todaySalesPoints = todayRows.reduce((sum, r) => sum + (r.sales_points || 0), 0);
  const todayCountFor = (key) =>
    todayRows.reduce((sum, r) => sum + (r.activity_counts?.[key] || 0), 0);

  const topTiles = [
    {
      label: 'Turno actual',
      value: fmt(openShift?.total_points || 0),
      subtitle: openShift ? `Turno de ${openShift.cashier_name || 'caja'}` : 'Sin turno abierto',
      icon: Clock,
      color: 'from-green-500 to-emerald-600',
    },
    {
      label: 'Hoy',
      value: fmt(todayTotal),
      subtitle: `${todayRows.length} ${todayRows.length === 1 ? 'turno' : 'turnos'} hoy`,
      icon: Target,
      color: 'from-blue-500 to-indigo-600',
    },
    {
      label: 'Promedio por turno (14 días)',
      value: fmt(avgPerShift),
      subtitle: `${last14Rows.length} ${last14Rows.length === 1 ? 'turno' : 'turnos'}`,
      icon: BarChart3,
      color: 'from-purple-500 to-pink-600',
    },
  ];

  const activityTiles = [
    {
      key: 'ventas',
      label: 'Ventas mostrador',
      big: `${fmt(todaySalesPoints)} pts`,
      small: null,
      icon: ShoppingCart,
    },
    ...types.map(t => {
      const count = todayCountFor(t.key);
      return {
        key: t.key,
        label: t.label,
        big: fmt(count),
        small: `${fmt(count * t.points)} pts`,
        icon: ACTIVITY_ICONS[t.key] || Zap,
      };
    }),
  ];

  if (loading && rows.length === 0) {
    return (
      <div className="flex justify-center items-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error && rows.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-8 border border-slate-200 text-center">
        <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-3" />
        <p className="text-slate-900 font-semibold mb-1">No se pudieron cargar los KPIs</p>
        <p className="text-slate-500 text-sm mb-4">{error.message}</p>
        <Button variant="outline" onClick={loadData}>Reintentar</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">KPIs de puntos</h2>
          <p className="text-slate-600">Desempeño del equipo por turno — meta de 1,500 puntos</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />Actualizar
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {topTiles.map((tile, index) => {
          const Icon = tile.icon;
          return (
            <motion.div
              key={tile.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.08 }}
              className="bg-white rounded-xl shadow-lg p-6 border border-slate-200 relative overflow-hidden"
            >
              <div className="relative z-10">
                <p className="text-sm text-slate-600 mb-1 truncate pr-10">{tile.label}</p>
                <p className="text-3xl font-bold text-apolo-navy">{tile.value}</p>
                <p className="text-xs text-slate-400 mt-1">{tile.subtitle}</p>
              </div>
              <div className={`absolute top-4 right-4 bg-gradient-to-br ${tile.color} p-2 rounded-lg opacity-20`}>
                <Icon className="w-6 h-6 text-white" />
              </div>
            </motion.div>
          );
        })}
      </div>

      <div>
        <h3 className="text-lg font-semibold text-slate-900 mb-3">Hoy por actividad</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {activityTiles.map((tile, index) => {
            const Icon = tile.icon;
            return (
              <motion.div
                key={tile.key}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + index * 0.05 }}
                className="bg-white rounded-xl shadow-lg p-4 border border-slate-200 relative overflow-hidden"
              >
                <div className="relative z-10">
                  <p className="text-xs text-slate-600 mb-1 truncate pr-8">{tile.label}</p>
                  <p className="text-2xl font-bold text-apolo-navy">{tile.big}</p>
                  {tile.small && <p className="text-xs text-slate-400 mt-0.5">{tile.small}</p>}
                </div>
                <div className={`absolute top-3 right-3 bg-gradient-to-br ${TILE_COLORS[index % TILE_COLORS.length]} p-1.5 rounded-lg opacity-20`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-white rounded-xl shadow-lg p-6"
      >
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Puntos por turno — últimos 31 días</h3>
        <div className="overflow-x-auto">
          <div className="max-h-[600px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Fecha</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Cajero</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Estado</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Ventas</th>
                  {types.map(t => (
                    <th key={t.key} className="px-4 py-3 text-left font-semibold text-slate-900 whitespace-nowrap">{t.label}</th>
                  ))}
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Actividades</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={6 + types.length} className="px-4 py-8 text-center text-slate-500">
                      Sin turnos en los últimos 31 días
                    </td>
                  </tr>
                ) : rows.map(r => (
                  <tr key={r.shift_id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      {dateInTz(r.opened_at, undefined, { day: '2-digit', month: 'short' })} {timeInTz(r.opened_at)}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">{r.cashier_name || '—'}</td>
                    <td className="px-4 py-3">
                      {r.status === 'open'
                        ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700"><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />Abierto</span>
                        : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">Cerrado</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-slate-600">{fmt(r.sales_points)}</td>
                    {types.map(t => {
                      const c = r.activity_counts?.[t.key] || 0;
                      return <td key={t.key} className="px-4 py-3 text-slate-600">{c > 0 ? fmt(c) : '—'}</td>;
                    })}
                    <td className="px-4 py-3 text-slate-600">{fmt(r.activity_points)}</td>
                    <td className="px-4 py-3 font-bold text-slate-900">{fmt(r.total_points)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default AdminKpis;
