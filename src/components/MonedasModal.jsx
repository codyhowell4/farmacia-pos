import React, { useEffect, useState } from 'react';
import { Coins, Search, Loader2, CheckCircle, AlertTriangle, Undo2, CalendarCheck } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { formatMXN } from '@/lib/currency';
import {
  coinsStaffLookup, coinsRedeem, coinsCancelRedemption, coinsCompleteChequeo, coinsStaffChequeos,
  getCoinTiers, getCoinRedemptions,
} from '@/lib/db';

// Monedas Apolo at the register (2026-11-25). Coins are NOT cash: they are
// spent only on the rewards ladder. The cashier looks the customer up (name,
// phone or the code shown in the app), redeems a reward (logged with who /
// when) and records completed chequeos. % rewards and the wellness-product
// reward are applied to the current cart as a discount with their cap; the
// free services / membership month / device are handed over by staff.

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '');
const coinsFmt = (n) => `${Number(n || 0).toLocaleString('es-MX')} Monedas`;

const HANDOVER = {
  free_service: 'Brinda el servicio sin costo al cliente.',
  membership_month: 'Registra el mes de membresía gratis para el cliente (Admin › Membresía).',
  device: 'Entrega el baumanómetro digital o glucómetro sin costo.',
};

const MonedasModal = ({ open, onOpenChange, onApplyReward, hasDiscount }) => {
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [customer, setCustomer] = useState(null);
  const [tiers, setTiers] = useState([]);
  const [chequeos, setChequeos] = useState([]);
  const [recent, setRecent] = useState([]);
  const [confirmTier, setConfirmTier] = useState(null);
  const [busy, setBusy] = useState(false);
  const [lastRedeemed, setLastRedeemed] = useState(null);

  useEffect(() => {
    if (!open) return;
    setQuery(''); setResults([]); setCustomer(null); setConfirmTier(null); setLastRedeemed(null);
    getCoinTiers().then((t) => setTiers(t.filter((x) => x.active))).catch(() => setTiers([]));
  }, [open]);

  const search = async (e) => {
    e?.preventDefault();
    if (query.trim().length < 3) return;
    setSearching(true);
    try {
      const rows = await coinsStaffLookup(query.trim());
      setResults(rows);
      if (rows.length === 1) pick(rows[0]);
    } catch (err) {
      toast({ title: 'No se pudo buscar', description: err.message, variant: 'destructive' });
    } finally {
      setSearching(false);
    }
  };

  const loadCustomerExtras = async (c) => {
    const [ch, red] = await Promise.all([
      coinsStaffChequeos(c.customer_id).catch(() => []),
      getCoinRedemptions({ customerId: c.customer_id, limit: 10 }).catch(() => []),
    ]);
    setChequeos(ch);
    setRecent(red);
  };

  const pick = (c) => {
    setCustomer(c);
    setLastRedeemed(null);
    loadCustomerExtras(c);
  };

  const refreshCustomer = async () => {
    if (!customer) return;
    const rows = await coinsStaffLookup(customer.code || customer.phone || customer.full_name).catch(() => []);
    const fresh = rows.find((r) => r.customer_id === customer.customer_id);
    if (fresh) setCustomer(fresh);
    loadCustomerExtras(customer);
  };

  const doRedeem = async () => {
    if (!confirmTier || !customer) return;
    setBusy(true);
    try {
      const res = await coinsRedeem(customer.customer_id, confirmTier.id);
      setLastRedeemed(res);
      setConfirmTier(null);
      if (res.kind === 'percent' || res.kind === 'free_product') {
        onApplyReward?.({
          code: 'MONEDAS',
          type: res.kind === 'percent' ? 'percent' : 'fixed',
          value: res.kind === 'percent' ? Number(res.percent) : Number(res.cap_amount || 0),
          cap: res.cap_amount != null ? Number(res.cap_amount) : null,
          redemptionId: res.redemption_id,
          title: res.title,
        });
      }
      toast({ title: 'Recompensa canjeada', description: `${res.title} · quedan ${coinsFmt(res.balance)}` });
      await refreshCustomer();
    } catch (err) {
      toast({ title: 'No se pudo canjear', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const cancelRedemption = async (r) => {
    setBusy(true);
    try {
      await coinsCancelRedemption(r.id, 'Cancelado en caja');
      toast({ title: 'Canje cancelado', description: `Se devolvieron ${coinsFmt(r.coins)}. Si aplicaste el descuento, quítalo del carrito.` });
      await refreshCustomer();
    } catch (err) {
      toast({ title: 'No se pudo cancelar', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const completeChequeo = async (appointmentId) => {
    setBusy(true);
    try {
      const res = await coinsCompleteChequeo(customer.customer_id, appointmentId);
      toast({
        title: 'Chequeo registrado',
        description: res.awarded > 0 ? `+${res.awarded} Monedas para el cliente` : (customer.enrolled ? 'Ya se había registrado hoy.' : 'El cliente no tiene Monedas Apolo activas: no se otorgaron Monedas.'),
      });
      await refreshCustomer();
    } catch (err) {
      toast({ title: 'No se pudo registrar', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const nextTier = customer ? tiers.find((t) => t.coins > customer.balance) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-apolo-navy flex items-center gap-2"><Coins className="w-5 h-5" /> Monedas Apolo</DialogTitle>
          <p className="text-xs text-slate-500">Las Monedas no son dinero: solo se canjean por las recompensas de la lista.</p>
        </DialogHeader>

        <form onSubmit={search} className="flex gap-2">
          <Input placeholder="Código de la app, teléfono o nombre" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
          <Button type="submit" variant="outline" disabled={searching || query.trim().length < 3}>
            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          </Button>
        </form>

        {!customer && results.length > 1 && (
          <div className="space-y-1">
            {results.map((r) => (
              <button key={r.customer_id} type="button" onClick={() => pick(r)} className="w-full text-left p-3 rounded-lg border border-slate-200 hover:border-apolo-navy text-sm flex justify-between">
                <span><b>{r.full_name}</b> <span className="text-slate-500">{r.phone}</span></span>
                <span className="text-slate-600">{r.enrolled ? coinsFmt(r.balance) : 'Sin Monedas'}</span>
              </button>
            ))}
          </div>
        )}
        {!customer && !searching && results.length === 0 && query.trim().length >= 3 && (
          <p className="text-sm text-slate-500">Busca y presiona Enter.</p>
        )}

        {customer && (
          <div className="space-y-4">
            <div className="rounded-xl bg-apolo-navy text-white p-4 flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold">{customer.full_name}</p>
                <p className="text-xs opacity-80">{customer.phone || ''}{customer.code ? ` · Código ${customer.code}` : ''}</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold">{Number(customer.balance || 0).toLocaleString('es-MX')}</p>
                <p className="text-xs opacity-80">Monedas</p>
              </div>
            </div>
            {!customer.enrolled && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 text-sm text-amber-800">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>Este cliente no ha activado Monedas Apolo en la app (requiere su consentimiento). No puede ganar ni canjear hasta activarlo.</span>
              </div>
            )}
            <Button variant="ghost" size="sm" onClick={() => { setCustomer(null); setResults([]); }}>← Buscar otro cliente</Button>

            {lastRedeemed && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-50 text-sm text-emerald-800">
                <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>
                  <b>Canjeado:</b> {lastRedeemed.title}.{' '}
                  {lastRedeemed.kind === 'percent' || lastRedeemed.kind === 'free_product'
                    ? 'El descuento se aplicó al carrito actual (con su tope). Cobra la venta normalmente.'
                    : HANDOVER[lastRedeemed.kind] || ''}
                </span>
              </div>
            )}

            {customer.enrolled && (
              <div>
                <p className="text-sm font-semibold mb-2">Recompensas</p>
                <div className="space-y-2">
                  {tiers.map((t) => {
                    const can = customer.balance >= t.coins;
                    return (
                      <div key={t.id} className={`flex items-center justify-between gap-3 p-3 rounded-lg border ${can ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200'}`}>
                        <div className="text-sm">
                          <p className="font-medium">{t.title}</p>
                          <p className="text-xs text-slate-500">{coinsFmt(t.coins)}</p>
                        </div>
                        <Button size="sm" disabled={!can || busy} onClick={() => setConfirmTier(t)} className="bg-apolo-navy hover:bg-apolo-navy-dark text-white">Canjear</Button>
                      </div>
                    );
                  })}
                </div>
                {nextTier && (
                  <p className="text-xs text-slate-500 mt-2">Le faltan {coinsFmt(nextTier.coins - customer.balance)} para: {nextTier.title}</p>
                )}
              </div>
            )}

            <div>
              <p className="text-sm font-semibold mb-2 flex items-center gap-2"><CalendarCheck className="w-4 h-4" /> Chequeo en sucursal</p>
              {chequeos.length > 0 ? chequeos.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-200 text-sm mb-2">
                  <span>Cita {fmtDate(c.appointment_date)}{c.service_detail?.tests ? ` · ${c.service_detail.tests.join(', ')}` : ''}</span>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => completeChequeo(c.id)}>Chequeo completado</Button>
                </div>
              )) : (
                <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-200 text-sm">
                  <span className="text-slate-600">Sin cita de chequeo. ¿Se le hizo un chequeo hoy?</span>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => completeChequeo(null)}>Registrar chequeo</Button>
                </div>
              )}
            </div>

            {recent.length > 0 && (
              <div>
                <p className="text-sm font-semibold mb-2">Canjes recientes</p>
                {recent.map((r) => {
                  const cancellable = r.status === 'redeemed' && !r.sale_id && Date.now() - new Date(r.redeemed_at).getTime() < 24 * 3600 * 1000;
                  return (
                    <div key={r.id} className="flex items-center justify-between gap-3 py-2 border-b last:border-0 text-sm">
                      <span>
                        {r.title} · {coinsFmt(r.coins)}
                        <span className="block text-xs text-slate-500">{fmtDate(r.redeemed_at)} · {r.redeemed_by_name}{r.status === 'cancelled' ? ' · cancelado' : r.sale_id ? ' · aplicado a venta' : ''}</span>
                      </span>
                      {cancellable && (
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => cancelRedemption(r)} className="text-red-600"><Undo2 className="w-4 h-4 mr-1" />Cancelar</Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <Dialog open={!!confirmTier} onOpenChange={(o) => { if (!o && !busy) setConfirmTier(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Confirmar canje</DialogTitle></DialogHeader>
            {confirmTier && customer && (
              <div className="space-y-3 text-sm">
                <p><b>{confirmTier.title}</b></p>
                <p>Se descuentan <b>{coinsFmt(confirmTier.coins)}</b> a {customer.full_name} (quedan {coinsFmt(customer.balance - confirmTier.coins)}).</p>
                {(confirmTier.kind === 'percent' || confirmTier.kind === 'free_product') && (
                  <p className="text-slate-600">
                    Se aplica al carrito actual como descuento
                    {confirmTier.kind === 'percent' ? ` de ${Number(confirmTier.percent)}%` : ''}
                    {confirmTier.cap_amount != null ? ` (tope ${formatMXN(confirmTier.cap_amount)})` : ''}.
                    {hasDiscount ? ' Reemplaza el descuento que ya tiene el carrito.' : ''}
                  </p>
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setConfirmTier(null)} disabled={busy}>Cancelar</Button>
                  <Button onClick={doRedeem} disabled={busy} className="bg-apolo-navy hover:bg-apolo-navy-dark text-white">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Canjear'}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
};

export default MonedasModal;
