import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Coins, Plus, Save, Loader2, Undo2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { formatMXN } from '@/lib/currency';
import {
  getCoinTiers, saveCoinTier, getCoinsSettings, saveCoinsSettings, getCoinRedemptions, coinsCancelRedemption, getCoinsProgramStats,
} from '@/lib/db';

// Admin › Monedas Apolo (2026-11-25): program settings, the rewards ladder
// (editable tiers) and recent redemptions. Coins are NOT cash: they are
// spent only on these rewards, at the register.

const KINDS = [
  { id: 'percent', label: '% de descuento (con tope)' },
  { id: 'free_service', label: 'Servicio gratis' },
  { id: 'free_product', label: 'Producto gratis (hasta un monto)' },
  { id: 'membership_month', label: 'Mes de membresía' },
  { id: 'device', label: 'Equipo (baumanómetro / glucómetro)' },
];
const TESTS = [
  { id: 'presion', label: 'Presión' },
  { id: 'glucosa', label: 'Glucosa' },
  { id: 'peso', label: 'Peso e IMC' },
  { id: 'consulta', label: 'Consulta' },
];
const SETTING_FIELDS = [
  { key: 'step_goal', label: 'Meta de pasos del día', min: 1000, max: 50000 },
  { key: 'step_entry_max', label: 'Máximo de pasos que se pueden capturar al día', min: 5000, max: 100000 },
  { key: 'coins_steps', label: 'Monedas por meta de pasos (1 vez al día)', min: 0, max: 100 },
  { key: 'coins_weight', label: 'Monedas por actualizar peso (1 vez por semana)', min: 0, max: 100 },
  { key: 'coins_dose', label: 'Monedas por toma a tiempo', min: 0, max: 100 },
  { key: 'max_doses_per_day', label: 'Máximo de tomas con Monedas al día', min: 0, max: 20 },
  { key: 'dose_window_minutes', label: 'Margen "a tiempo" (± minutos)', min: 10, max: 240 },
  { key: 'coins_chequeo', label: 'Monedas por chequeo en sucursal', min: 0, max: 500 },
  { key: 'coins_streak7', label: 'Monedas por racha de 7 días', min: 0, max: 500 },
];

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '');

const AdminMonedas = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [tiers, setTiers] = useState([]);
  const [settings, setSettings] = useState(null);
  const [redemptions, setRedemptions] = useState([]);
  const [stats, setStats] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [savingSettings, setSavingSettings] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [t, s, r, st] = await Promise.all([getCoinTiers(), getCoinsSettings(), getCoinRedemptions({ limit: 50 }), getCoinsProgramStats().catch(() => null)]);
      setTiers(t.map((x) => ({ ...x, _dirty: false })));
      setSettings(s);
      setRedemptions(r);
      setStats(st);
    } catch (e) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const editTier = (idx, patch) => setTiers((list) => list.map((t, i) => (i === idx ? { ...t, ...patch, _dirty: true } : t)));

  const saveTier = async (idx) => {
    const t = tiers[idx];
    if (!t.title?.trim() || !(Number(t.coins) > 0)) { toast({ title: 'Falta nombre o Monedas', variant: 'destructive' }); return; }
    if (t.kind === 'percent' && !(Number(t.percent) > 0 && Number(t.percent) <= 100)) { toast({ title: 'Porcentaje inválido', variant: 'destructive' }); return; }
    setSavingId(t.id || `new-${idx}`);
    try {
      const saved = await saveCoinTier({
        ...(t.id ? { id: t.id } : {}),
        sort: Number(t.sort) || 0,
        coins: Math.round(Number(t.coins)),
        title: t.title.trim(),
        kind: t.kind,
        percent: t.kind === 'percent' ? Number(t.percent) : null,
        cap_amount: t.cap_amount === '' || t.cap_amount == null ? null : Number(t.cap_amount),
        applies_to: t.kind === 'free_service' ? (t.applies_to || []) : [],
        active: !!t.active,
      });
      setTiers((list) => list.map((x, i) => (i === idx ? { ...saved, _dirty: false } : x)));
      toast({ title: 'Recompensa guardada' });
    } catch (e) {
      toast({ title: 'No se pudo guardar', description: e.message, variant: 'destructive' });
    } finally {
      setSavingId(null);
    }
  };

  const addTier = () => setTiers((list) => [...list, {
    sort: (list.length ? Math.max(...list.map((t) => t.sort || 0)) : 0) + 1,
    coins: '', title: '', kind: 'free_service', percent: null, cap_amount: null, applies_to: [], active: true, _dirty: true,
  }]);

  const saveSettingsForm = async () => {
    setSavingSettings(true);
    try {
      const patch = { program_active: !!settings.program_active, chequeo_price: (settings.chequeo_price || '').trim() || '[PRECIO]' };
      SETTING_FIELDS.forEach((f) => { patch[f.key] = Math.round(Number(settings[f.key])); });
      const saved = await saveCoinsSettings(patch);
      setSettings(saved);
      toast({ title: 'Configuración guardada' });
    } catch (e) {
      toast({ title: 'No se pudo guardar', description: e.message, variant: 'destructive' });
    } finally {
      setSavingSettings(false);
    }
  };

  const cancelRed = async (r) => {
    try {
      await coinsCancelRedemption(r.id, 'Cancelado por administración');
      toast({ title: 'Canje cancelado', description: `Se devolvieron ${r.coins} Monedas` });
      load();
    } catch (e) {
      toast({ title: 'No se pudo cancelar', description: e.message, variant: 'destructive' });
    }
  };

  return (
    <>
      <Helmet><title>Monedas Apolo - Admin</title></Helmet>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><Coins className="w-6 h-6 text-apolo-navy" /> Monedas Apolo</h2>
            <p className="text-slate-600 text-sm">Programa de lealtad. Las Monedas no son dinero: solo se canjean por estas recompensas, en caja.</p>
          </div>
          <Button variant="outline" onClick={load} disabled={loading}><RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />Actualizar</Button>
        </div>

        {stats && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white rounded-xl shadow p-4"><p className="text-xs text-slate-500">Clientes con Monedas activas</p><p className="text-2xl font-bold">{stats.enrolled}</p></div>
            <div className="bg-white rounded-xl shadow p-4"><p className="text-xs text-slate-500">Monedas ganadas (30 días)</p><p className="text-2xl font-bold text-green-700">{stats.earned30.toLocaleString('es-MX')}</p></div>
            <div className="bg-white rounded-xl shadow p-4"><p className="text-xs text-slate-500">Monedas canjeadas (30 días)</p><p className="text-2xl font-bold">{stats.spent30.toLocaleString('es-MX')}</p></div>
          </div>
        )}

        {/* Ladder */}
        <section className="bg-white rounded-xl shadow p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-slate-900">Escalera de recompensas</h3>
            <Button size="sm" variant="outline" onClick={addTier}><Plus className="w-4 h-4 mr-1" />Agregar</Button>
          </div>
          <p className="text-xs text-slate-500">Los % de descuento se aplican al ticket con su tope, igual que un código de descuento. "Servicio gratis" con pruebas marcadas hace que el chequeo aparezca como "Gratis con tus Monedas" en la app.</p>
          <div className="space-y-3">
            {tiers.map((t, idx) => (
              <div key={t.id || `new-${idx}`} className={`rounded-lg border p-3 grid gap-2 sm:grid-cols-12 items-end ${t.active ? 'border-slate-200' : 'border-slate-200 opacity-60'}`}>
                <div className="sm:col-span-1"><Label className="text-xs">Orden</Label><Input type="number" value={t.sort ?? ''} onChange={(e) => editTier(idx, { sort: e.target.value })} /></div>
                <div className="sm:col-span-2"><Label className="text-xs">Monedas</Label><Input type="number" min="1" value={t.coins ?? ''} onChange={(e) => editTier(idx, { coins: e.target.value })} /></div>
                <div className="sm:col-span-5"><Label className="text-xs">Recompensa</Label><Input value={t.title ?? ''} maxLength={120} onChange={(e) => editTier(idx, { title: e.target.value })} /></div>
                <div className="sm:col-span-4">
                  <Label className="text-xs">Tipo</Label>
                  <select className="w-full border border-slate-300 rounded-md px-2 py-2 bg-white text-sm" value={t.kind} onChange={(e) => editTier(idx, { kind: e.target.value })}>
                    {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
                  </select>
                </div>
                {t.kind === 'percent' && (
                  <div className="sm:col-span-2"><Label className="text-xs">%</Label><Input type="number" min="1" max="100" value={t.percent ?? ''} onChange={(e) => editTier(idx, { percent: e.target.value })} /></div>
                )}
                {(t.kind === 'percent' || t.kind === 'free_product') && (
                  <div className="sm:col-span-2"><Label className="text-xs">Tope ($)</Label><Input type="number" min="0" value={t.cap_amount ?? ''} onChange={(e) => editTier(idx, { cap_amount: e.target.value })} /></div>
                )}
                {t.kind === 'free_service' && (
                  <div className="sm:col-span-6 flex flex-wrap gap-3 text-sm">
                    {TESTS.map((x) => (
                      <label key={x.id} className="flex items-center gap-1">
                        <input type="checkbox" checked={(t.applies_to || []).includes(x.id)}
                          onChange={(e) => editTier(idx, { applies_to: e.target.checked ? [...(t.applies_to || []), x.id] : (t.applies_to || []).filter((a) => a !== x.id) })} />
                        {x.label}
                      </label>
                    ))}
                  </div>
                )}
                <div className="sm:col-span-2 flex items-center gap-2 text-sm">
                  <label className="flex items-center gap-1"><input type="checkbox" checked={!!t.active} onChange={(e) => editTier(idx, { active: e.target.checked })} />Activa</label>
                </div>
                <div className="sm:col-span-2 flex justify-end">
                  <Button size="sm" disabled={!t._dirty || savingId === (t.id || `new-${idx}`)} onClick={() => saveTier(idx)} className="bg-apolo-navy hover:bg-apolo-navy-dark text-white">
                    {savingId === (t.id || `new-${idx}`) ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-1" />Guardar</>}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Settings */}
        {settings && (
          <section className="bg-white rounded-xl shadow p-5 space-y-3">
            <h3 className="font-semibold text-slate-900">Reglas para ganar</h3>
            <p className="text-xs text-slate-500">Se aplican en el servidor. Los pasos se capturan a mano en la app (no hay sensor), por eso se limita cuánto se puede capturar al día y la meta solo da Monedas una vez al día.</p>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!settings.program_active} onChange={(e) => setSettings({ ...settings, program_active: e.target.checked })} />Programa activo (si se desactiva, nadie gana Monedas; los canjes siguen)</label>
            <div className="grid sm:grid-cols-2 gap-3">
              {SETTING_FIELDS.map((f) => (
                <div key={f.key}><Label className="text-xs">{f.label}</Label><Input type="number" min={f.min} max={f.max} value={settings[f.key] ?? ''} onChange={(e) => setSettings({ ...settings, [f.key]: e.target.value })} /></div>
              ))}
              <div><Label className="text-xs">Precio regular del chequeo (se muestra en la app)</Label><Input value={settings.chequeo_price ?? ''} maxLength={40} onChange={(e) => setSettings({ ...settings, chequeo_price: e.target.value })} placeholder="[PRECIO]" /></div>
            </div>
            <div className="flex justify-end"><Button onClick={saveSettingsForm} disabled={savingSettings} className="bg-apolo-navy hover:bg-apolo-navy-dark text-white">{savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar reglas'}</Button></div>
          </section>
        )}

        {/* Redemptions */}
        <section className="bg-white rounded-xl shadow p-5 space-y-3">
          <h3 className="font-semibold text-slate-900">Canjes recientes</h3>
          {redemptions.length === 0 ? <p className="text-sm text-slate-500">Aún no hay canjes.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-slate-500 border-b"><th className="py-2 pr-3">Fecha</th><th className="py-2 pr-3">Cliente</th><th className="py-2 pr-3">Recompensa</th><th className="py-2 pr-3">Monedas</th><th className="py-2 pr-3">Canjeó</th><th className="py-2 pr-3">Estado</th><th /></tr></thead>
                <tbody>
                  {redemptions.map((r) => {
                    const cancellable = r.status === 'redeemed' && !r.sale_id && Date.now() - new Date(r.redeemed_at).getTime() < 24 * 3600 * 1000;
                    return (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="py-2 pr-3 whitespace-nowrap">{fmtDate(r.redeemed_at)}</td>
                        <td className="py-2 pr-3">{r.customers?.full_name || '—'}</td>
                        <td className="py-2 pr-3">{r.title}{r.cap_amount != null ? <span className="block text-xs text-slate-500">tope {formatMXN(r.cap_amount)}</span> : null}</td>
                        <td className="py-2 pr-3">{r.coins}</td>
                        <td className="py-2 pr-3">{r.redeemed_by_name || '—'}</td>
                        <td className="py-2 pr-3">{r.status === 'cancelled' ? `Cancelado (${r.cancelled_by_name || ''})` : r.sale_id ? 'Aplicado a venta' : 'Canjeado'}</td>
                        <td className="py-2">{cancellable && <Button size="sm" variant="ghost" className="text-red-600" onClick={() => cancelRed(r)}><Undo2 className="w-4 h-4 mr-1" />Cancelar</Button>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
};

export default AdminMonedas;
