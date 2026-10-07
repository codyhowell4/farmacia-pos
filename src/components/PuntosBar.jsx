import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Minus, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/lib/supabase';
import { useShift } from '@/contexts/ShiftContext';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import {
  getMyOrgId,
  getPointActivityTypes,
  getShiftPointsSummary,
  getShiftActivityCounts,
  setShiftActivityCount,
} from '@/lib/db';

const META = 1500;

const bandOf = (total) => {
  if (total <= 500) return 'red';
  if (total <= 1000) return 'amber';
  if (total <= 1500) return 'green';
  return 'blue';
};

const BAND_FILL = {
  red: 'bg-red-500',
  amber: 'bg-amber-400',
  green: 'bg-green-500',
  blue: 'bg-blue-500',
};

const BAND_TEXT = {
  red: 'text-red-500',
  amber: 'text-amber-500',
  green: 'text-green-500',
  blue: 'text-blue-500',
};

const BAND_STATUS = {
  red: 'Arrancando',
  amber: 'En progreso',
  green: 'Casi en la meta',
  blue: '¡Meta superada!',
};

const PuntosActivityModal = ({ open, onOpenChange, shiftId, onSaved }) => {
  const { toast } = useToast();
  const [types, setTypes] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(false);
  const timersRef = useRef({});
  const pendingRef = useRef({});

  const refetchCounts = useCallback(async () => {
    try {
      const rows = await getShiftActivityCounts(shiftId);
      const map = {};
      rows.forEach(r => { map[r.activity] = r.count; });
      setCounts(map);
    } catch (err) {
      console.error(err);
    }
  }, [shiftId]);

  useEffect(() => {
    if (!open || !shiftId) return;
    setLoading(true);
    Promise.all([getPointActivityTypes(), getShiftActivityCounts(shiftId)])
      .then(([t, rows]) => {
        setTypes(t);
        const map = {};
        rows.forEach(r => { map[r.activity] = r.count; });
        setCounts(map);
      })
      .catch(err => {
        console.error(err);
        toast({ title: 'Error', description: 'No se pudieron cargar las actividades', variant: 'destructive' });
      })
      .finally(() => setLoading(false));
  }, [open, shiftId, toast]);

  const flushSave = useCallback(async (key) => {
    clearTimeout(timersRef.current[key]);
    delete timersRef.current[key];
    if (!(key in pendingRef.current)) return;
    const count = pendingRef.current[key];
    delete pendingRef.current[key];
    try {
      await setShiftActivityCount(shiftId, key, count);
      onSaved?.();
    } catch (err) {
      console.error(err);
      toast({ title: 'No se pudo guardar', description: err?.message, variant: 'destructive' });
      refetchCounts();
    }
  }, [shiftId, onSaved, toast, refetchCounts]);

  const flushAll = useCallback(async () => {
    const keys = Object.keys(pendingRef.current);
    if (keys.length) await Promise.all(keys.map(k => flushSave(k)));
  }, [flushSave]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => Object.values(timers).forEach(clearTimeout);
  }, []);

  const setCount = (key, value) => {
    let n = parseInt(value, 10);
    if (Number.isNaN(n) || n < 0) n = 0;
    setCounts(prev => ({ ...prev, [key]: n }));
    pendingRef.current[key] = n;
    clearTimeout(timersRef.current[key]);
    timersRef.current[key] = setTimeout(() => flushSave(key), 400);
  };

  const handleOpenChange = (next) => {
    if (!next) {
      flushAll().then(() => onSaved?.());
    }
    onOpenChange(next);
  };

  const activityPoints = types.reduce((sum, t) => sum + (counts[t.key] || 0) * t.points, 0);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar actividad</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-slate-500 -mt-2">Se guarda automáticamente</p>
        {loading ? (
          <div className="py-8 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {types.map(t => {
              const count = counts[t.key] || 0;
              return (
                <div key={t.key} className="flex items-center gap-3 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900">{t.label}</p>
                    <p className="text-xs text-slate-500">{t.points} pts c/u</p>
                  </div>
                  {t.max_per_shift === 1 ? (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={count >= 1}
                        onCheckedChange={c => setCount(t.key, c ? 1 : 0)}
                      />
                      <span className="text-sm text-slate-600">Hecho</span>
                    </label>
                  ) : (
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        disabled={count <= 0}
                        onClick={() => setCount(t.key, count - 1)}
                      >
                        <Minus className="w-4 h-4" />
                      </Button>
                      <Input
                        type="number"
                        min={0}
                        value={count}
                        onChange={e => setCount(t.key, e.target.value)}
                        className="w-16 h-8 text-center"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setCount(t.key, count + 1)}
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                  <p className="w-16 text-right text-sm font-semibold text-slate-900">
                    {(count * t.points).toLocaleString('es-MX')} pts
                  </p>
                </div>
              );
            })}
          </div>
        )}
        <div className="flex items-center justify-between pt-2 border-t border-slate-200">
          <p className="text-sm font-bold text-slate-900">
            Puntos por actividades: {activityPoints.toLocaleString('es-MX')}
          </p>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>Cerrar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const PuntosBar = () => {
  const { activeShift } = useShift();
  const { user } = useAuth();
  const { toast } = useToast();
  const [summary, setSummary] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const prevTotalRef = useRef(null);

  const shiftId = activeShift?.id;

  const refetchSummary = useCallback(async () => {
    if (!shiftId) return;
    try {
      const data = await getShiftPointsSummary(shiftId);
      setSummary(data);
    } catch (err) {
      console.error(err);
    }
  }, [shiftId]);

  useEffect(() => {
    prevTotalRef.current = null;
    setSummary(null);
    refetchSummary();
  }, [refetchSummary]);

  useEffect(() => {
    if (!summary) return;
    const total = summary.total_points ?? 0;
    const prev = prevTotalRef.current;
    prevTotalRef.current = total;
    if (prev === null) return;
    if (prev <= 1000 && total >= 1001) {
      toast({ title: 'Más de 1,000 puntos', description: 'El turno va en verde — ¡sigan así!' });
    }
    if (prev <= 1500 && total >= 1501) {
      toast({ title: '¡Meta del turno superada!', description: 'Más de 1,500 puntos. Increíble trabajo.' });
    }
  }, [summary, toast]);

  useEffect(() => {
    if (!user?.id || !shiftId) return undefined;
    let timer = null;
    let channel = null;
    let cancelled = false;
    const scheduleRefresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { if (!cancelled) refetchSummary(); }, 500);
    };
    getMyOrgId().then((orgId) => {
      if (cancelled) return;
      channel = supabase
        .channel(`puntos-bar-${shiftId}`)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'shift_point_events',
          ...(orgId ? { filter: `org_id=eq.${orgId}` } : {}),
        }, scheduleRefresh)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'shift_activity_counts',
          ...(orgId ? { filter: `org_id=eq.${orgId}` } : {}),
        }, scheduleRefresh)
        .subscribe();
    }).catch(() => {});
    window.addEventListener('focus', scheduleRefresh);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener('focus', scheduleRefresh);
      if (channel) supabase.removeChannel(channel);
    };
  }, [user?.id, shiftId, refetchSummary]);

  if (!activeShift) return null;

  const total = summary?.total_points ?? 0;
  const band = bandOf(total);
  const pct = Math.min((total / META) * 100, 100);

  return (
    <>
      <div className="fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 shadow-[0_-4px_12px_rgba(0,0,0,0.08)]">
        <div className="max-w-screen-2xl mx-auto px-4 py-3 flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="shrink-0">
            <p className="text-xs font-semibold text-slate-500 tracking-wide">PUNTOS DEL TURNO</p>
            <p className={`text-2xl font-bold ${BAND_TEXT[band]}`}>
              {total.toLocaleString('es-MX')}
              <span className="text-sm font-medium text-slate-400"> / 1,500 meta</span>
            </p>
          </div>
          <div className="flex-1">
            <div className="h-4 rounded-full bg-slate-200 relative overflow-visible">
              <div
                className={`h-full rounded-full transition-all duration-700 ${BAND_FILL[band]}`}
                style={{ width: `${pct}%` }}
              />
              <div className="absolute top-0 bottom-0 w-px bg-slate-400/60" style={{ left: '33.33%' }} />
              <div className="absolute top-0 bottom-0 w-px bg-slate-400/60" style={{ left: '66.67%' }} />
              <div className="absolute right-0 -top-0.5 -bottom-0.5 w-0.5 bg-slate-500 rounded-full" />
            </div>
            <div className="flex justify-between mt-1">
              <p className="text-xs text-slate-500">{BAND_STATUS[band]}</p>
              <p className="text-xs text-slate-500">{total.toLocaleString('es-MX')} pts</p>
            </div>
          </div>
          <Button
            onClick={() => setModalOpen(true)}
            className="bg-gradient-to-r from-green-500 to-emerald-600 shrink-0"
          >
            <Plus className="w-4 h-4 mr-2" />Actividad
          </Button>
        </div>
      </div>
      <PuntosActivityModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        shiftId={shiftId}
        onSaved={refetchSummary}
      />
    </>
  );
};

export default PuntosBar;
