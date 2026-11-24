import React, { useEffect, useMemo, useState } from 'react';
import { Smartphone, Wifi, Receipt, Gift, ArrowLeft, AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatMXN } from '@/lib/currency';
import {
  RNP_FEES, RNP_CATEGORIES, RNP_DEFAULT_RECARGA_AMOUNTS,
  getRnpSaldo, getRnpProductos, buildRnpCartLines, formatPhone, isRnpServiceLine,
} from '@/lib/rnpServices';

// Pago de servicios / Tarjetas de regalo stay disabled until the live
// catalog (obtenerProductos servicios + tarjetas) has been reviewed with
// the owner (task step 1). Flip to true once the form is validated.
export const RNP_SERVICIOS_FORM_READY = false;

const TILES = [
  { key: 'recarga', icon: Smartphone, title: 'Recarga de saldo', sub: 'Tiempo aire para cualquier compañía', categoria: 'recargas' },
  { key: 'paquete', icon: Wifi, title: 'Paquete de datos', sub: 'Internet, llamadas y redes por días', categoria: 'recargas' },
  { key: 'servicio', icon: Receipt, title: 'Pago de servicios', sub: 'Luz, agua, gas, teléfono, internet, TV', categoria: 'servicios' },
  { key: 'tarjeta', icon: Gift, title: 'Tarjetas de regalo', sub: 'Google Play, Xbox, Netflix y más', categoria: 'tarjetas' },
];

// Package detection inside the 'recargas' catalog (RNP returns plain
// recargas and paquetes together; `tipo` / name tell them apart).
const isPackageProduct = (p) =>
  /paquete|internet|datos|\bgb\b|\bmb\b|ilimitad|redes|amigo sin l[ií]mite/i.test(`${p.tipo || ''} ${p.nombre || ''} ${p.descripcion || ''}`);

const groupByCarrier = (items) => {
  const map = new Map();
  for (const p of items) {
    const label = (p.carrier_nombre || p.carrier_id || p.nombre || '').toString().trim();
    if (!label) continue;
    if (!map.has(label)) map.set(label, { label, id: p.carrier_id || null, products: [] });
    map.get(label).products.push(p);
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'es'));
};

const chipCls = (sel) =>
  `min-h-[48px] px-3 py-2 rounded-lg border text-sm font-semibold flex flex-col items-center justify-center text-center transition-colors ${
    sel ? 'border-2 border-apolo-navy bg-apolo-navy/5 text-apolo-navy' : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300'
  }`;
const rowCls = (sel) =>
  `w-full min-h-[48px] px-4 py-2 rounded-lg border text-sm flex items-center justify-between gap-3 text-left transition-colors ${
    sel ? 'border-2 border-apolo-navy bg-apolo-navy/5 text-apolo-navy' : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300'
  }`;

const fresh = () => ({
  step: 'menu', cat: null, carrier: null, product: null, amount: null, customAmount: '', phone: '', phone2: '', ok: false,
});

const ServiciosModal = ({ open, onOpenChange, cart, onAdd }) => {
  const [s, setS] = useState(fresh());
  const set = (patch) => setS((prev) => ({ ...prev, ...patch }));
  const [saldo, setSaldo] = useState({ loading: false, recargas: null, servicios: null, error: null });
  const [catalog, setCatalog] = useState({ loading: false, error: null, items: [] });

  const loadSaldo = async () => {
    setSaldo((p) => ({ ...p, loading: true, error: null }));
    try {
      const d = await getRnpSaldo();
      setSaldo({ loading: false, recargas: d?.saldo_recargas ?? null, servicios: d?.saldo_servicios ?? null, error: null });
    } catch (e) {
      setSaldo({ loading: false, recargas: null, servicios: null, error: e.message || 'No disponible' });
    }
  };

  useEffect(() => {
    if (open) {
      setS(fresh());
      loadSaldo();
    }
  }, [open]);

  const tile = TILES.find((t) => t.key === s.cat);

  const loadCatalog = async (categoria, force = false) => {
    setCatalog({ loading: true, error: null, items: [] });
    try {
      const items = await getRnpProductos(categoria, { force });
      setCatalog({ loading: false, error: null, items });
    } catch (e) {
      setCatalog({ loading: false, error: e.message || 'No se pudo cargar el catálogo', items: [] });
    }
  };

  const pickCategory = (key) => {
    const t = TILES.find((x) => x.key === key);
    setS({ ...fresh(), step: 'form', cat: key });
    loadCatalog(t.categoria);
  };

  // Catalog filtered to the chosen tile.
  const scoped = useMemo(() => {
    if (s.cat === 'recarga') return catalog.items.filter((p) => !isPackageProduct(p));
    if (s.cat === 'paquete') return catalog.items.filter(isPackageProduct);
    return catalog.items;
  }, [catalog.items, s.cat]);
  const carriers = useMemo(() => groupByCarrier(scoped), [scoped]);
  const carrier = carriers.find((c) => c.label === s.carrier) || null;

  // Fixed-amount products for the chosen carrier (monto > 0). Products
  // with monto 0/empty mean "open amount" (typed, 1.00–5000.00).
  const fixedProducts = (carrier?.products || []).filter((p) => Number(p.monto) > 0)
    .sort((a, b) => Number(a.monto) - Number(b.monto));
  const openProduct = (carrier?.products || []).find((p) => !(Number(p.monto) > 0)) || null;

  const recargaAmounts = useMemo(() => {
    if (s.cat !== 'recarga' || !carrier) return [];
    const fromCatalog = [...new Set(fixedProducts.map((p) => Number(p.monto)))];
    return fromCatalog.length > 0 ? fromCatalog : RNP_DEFAULT_RECARGA_AMOUNTS;
  }, [s.cat, carrier, fixedProducts]);

  const amount = (() => {
    if (s.cat === 'recarga') return s.amount;
    if (s.product) return Number(s.product.monto) > 0 ? Number(s.product.monto) : parseFloat(s.customAmount) || 0;
    return 0;
  })();

  const phoneOk = /^\d{10}$/.test(s.phone) && s.phone === s.phone2;
  const phoneMismatch = s.phone2.length > 0 && s.phone !== s.phone2 && (s.phone2.length >= s.phone.length || s.phone2.length === 10);
  const phoneInCart = (cart || []).some((i) => isRnpServiceLine(i) && i.rnp.phone === s.phone);
  const amountOk = s.cat === 'recarga'
    ? Number.isInteger(amount) && amount > 0
    : amount >= 1 && amount <= 5000;
  const formOk = !!carrier && (s.cat === 'recarga' || !!s.product) && amountOk && phoneOk && !phoneInCart;

  const fee = Number(RNP_FEES[s.cat] || 0);

  const draft = () => {
    // Carrier parameter sent to RNP:
    //  · recarga  → the carrier (id when the catalog has one, else name)
    //  · paquete / servicio / tarjeta → the product name from obtenerProductos
    // (to be confirmed against the live catalog — step 1).
    const isRecarga = s.cat === 'recarga';
    const productNombre = s.product?.nombre || openProduct?.nombre || '';
    return {
      category: s.cat,
      carrierLabel: carrier?.label || '',
      carrierParam: isRecarga ? (carrier?.id || carrier?.label) : productNombre,
      productLabel: isRecarga ? formatMXN(amount) : productNombre,
      phone: s.phone,
      amount,
    };
  };

  const confirmAdd = () => {
    if (!formOk || !s.ok) return;
    onAdd(buildRnpCartLines(draft()));
    onOpenChange(false);
  };

  const phoneLabel = s.cat === 'servicio'
    ? 'Número / referencia de 10 dígitos'
    : s.cat === 'tarjeta'
      ? 'Celular del cliente (10 dígitos)'
      : 'Número celular (10 dígitos)';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <p className="text-xs text-slate-500">
            Servicios{tile ? ` › ${tile.title}` : ''}{s.step === 'confirm' ? ' › Confirmar' : ''}
          </p>
          <DialogTitle className="text-apolo-navy">
            {s.step === 'menu' ? 'Servicios' : s.step === 'confirm' ? 'Confirma con el cliente' : tile?.title}
          </DialogTitle>
          <p className="sr-only">Recargas, paquetes, pagos de servicios y tarjetas de regalo</p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="px-2.5 py-1 rounded-md bg-slate-100 text-xs text-slate-700">
              Saldo recargas <b className="text-slate-900">{saldo.recargas != null ? formatMXN(saldo.recargas) : '—'}</b>
            </span>
            <span className="px-2.5 py-1 rounded-md bg-slate-100 text-xs text-slate-700">
              Saldo servicios <b className="text-slate-900">{saldo.servicios != null ? formatMXN(saldo.servicios) : '—'}</b>
            </span>
            <button type="button" onClick={loadSaldo} className="p-1 text-slate-500 hover:text-apolo-navy" aria-label="Actualizar saldos">
              {saldo.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </button>
            {saldo.error && <span className="text-xs text-red-600">{saldo.error}</span>}
          </div>
        </DialogHeader>

        {s.step === 'menu' && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-700">¿Qué quiere pagar el cliente?</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {TILES.map((t) => {
                const Icon = t.icon;
                const disabled = !RNP_SERVICIOS_FORM_READY && (t.key === 'servicio' || t.key === 'tarjeta');
                return (
                  <button
                    key={t.key}
                    type="button"
                    disabled={disabled}
                    onClick={() => pickCategory(t.key)}
                    className="flex items-start gap-3 p-4 rounded-xl border border-slate-200 bg-white text-left hover:border-apolo-navy hover:bg-apolo-navy/5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-slate-200 disabled:hover:bg-white"
                  >
                    <span className="w-10 h-10 rounded-lg bg-apolo-navy/10 text-apolo-navy flex items-center justify-center flex-shrink-0">
                      <Icon className="w-5 h-5" />
                    </span>
                    <span>
                      <span className="block font-semibold text-slate-900">{t.title}</span>
                      <span className="block text-xs text-slate-500">{disabled ? 'Disponible pronto' : t.sub}</span>
                      <span className="block text-xs text-slate-500 mt-0.5">Comisión {formatMXN(RNP_FEES[t.key])}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {s.step === 'form' && (
          <div className="space-y-5">
            {catalog.loading && (
              <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Cargando catálogo de RNP…</p>
            )}
            {catalog.error && (
              <div className="flex items-center justify-between gap-2 p-3 rounded-lg bg-red-50 text-sm text-red-700">
                <span>{catalog.error}</span>
                <Button size="sm" variant="outline" onClick={() => loadCatalog(tile.categoria, true)}>Reintentar</Button>
              </div>
            )}
            {!catalog.loading && !catalog.error && carriers.length === 0 && (
              <p className="text-sm text-slate-500">El catálogo de RNP no trae productos para esta opción.</p>
            )}

            {carriers.length > 0 && (
              <div>
                <Label className="mb-2 block">1. {s.cat === 'servicio' ? 'Servicio' : s.cat === 'tarjeta' ? 'Tarjeta' : 'Compañía'}</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {carriers.map((c) => (
                    <button key={c.label} type="button" className={chipCls(s.carrier === c.label)}
                      onClick={() => set({ carrier: c.label, product: null, amount: null, customAmount: '' })}>
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {carrier && s.cat === 'recarga' && (
              <div>
                <Label className="mb-2 block">2. Monto</Label>
                <div className="grid grid-cols-4 gap-2">
                  {recargaAmounts.map((a) => (
                    <button key={a} type="button" className={chipCls(s.amount === a)} onClick={() => set({ amount: a })}>
                      {formatMXN(a)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {carrier && s.cat !== 'recarga' && (
              <div>
                <Label className="mb-2 block">2. {s.cat === 'paquete' ? 'Paquete' : s.cat === 'tarjeta' ? 'Monto' : 'Concepto'}</Label>
                <div className="space-y-2">
                  {(fixedProducts.length > 0 ? fixedProducts : openProduct ? [openProduct] : []).map((p, idx) => (
                    <button key={`${p.nombre}-${idx}`} type="button" className={rowCls(s.product === p)}
                      onClick={() => set({ product: p, customAmount: '' })}>
                      <span>{p.nombre}{p.descripcion ? <span className="block text-xs text-slate-500">{p.descripcion}</span> : null}</span>
                      <span className="font-bold whitespace-nowrap">{Number(p.monto) > 0 ? formatMXN(p.monto) : 'Monto abierto'}</span>
                    </button>
                  ))}
                </div>
                {s.product && !(Number(s.product.monto) > 0) && (
                  <div className="mt-3">
                    <Label className="mb-1 block">Monto a pagar (1.00 – 5,000.00)</Label>
                    <Input type="number" inputMode="decimal" min="1" max="5000" step="0.01" value={s.customAmount}
                      onChange={(e) => set({ customAmount: e.target.value })} className="max-w-[200px]" />
                  </div>
                )}
              </div>
            )}

            {carrier && (s.cat === 'recarga' ? !!s.amount : !!s.product) && (
              <div>
                <Label className="mb-2 block">3. {phoneLabel}</Label>
                <div className="grid sm:grid-cols-2 gap-3">
                  <Input inputMode="numeric" autoComplete="off" maxLength={10} placeholder="10 dígitos" value={s.phone}
                    onChange={(e) => set({ phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                    className="text-lg tracking-wider" />
                  <Input inputMode="numeric" autoComplete="off" maxLength={10} placeholder="Confirmar número" value={s.phone2}
                    onPaste={(e) => e.preventDefault()}
                    onChange={(e) => set({ phone2: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                    className={`text-lg tracking-wider ${phoneMismatch ? 'border-red-400 bg-red-50' : ''}`} />
                </div>
                {phoneMismatch && (
                  <p className="mt-2 flex items-center gap-1.5 text-sm text-red-600">
                    <AlertTriangle className="w-4 h-4" /> Los números no coinciden. Revísalo con el cliente.
                  </p>
                )}
                {phoneOk && phoneInCart && (
                  <p className="mt-2 flex items-center gap-1.5 text-sm text-red-600">
                    <AlertTriangle className="w-4 h-4" /> Este número ya está en el carrito. RNP bloquea el mismo número durante 5 minutos.
                  </p>
                )}
              </div>
            )}

            {formOk && (
              <div className="rounded-lg bg-slate-50 p-3 text-sm space-y-1">
                <div className="flex justify-between"><span>{s.cat === 'servicio' ? 'Recibo' : 'Monto'}</span><span>{formatMXN(amount)}</span></div>
                <div className="flex justify-between"><span>Comisión Apolo</span><span>{formatMXN(fee)}</span></div>
                <div className="flex justify-between font-bold border-t border-slate-200 pt-1"><span>Cobrar al cliente</span><span>{formatMXN(amount + fee)}</span></div>
              </div>
            )}

            <div className="flex justify-between gap-2 pt-2">
              <Button variant="outline" onClick={() => setS(fresh())}><ArrowLeft className="w-4 h-4 mr-2" />Atrás</Button>
              <Button className="bg-apolo-navy hover:bg-apolo-navy-dark text-white" disabled={!formOk} onClick={() => set({ step: 'confirm', ok: false })}>
                Continuar
              </Button>
            </div>
          </div>
        )}

        {s.step === 'confirm' && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 text-sm text-amber-800">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>Lee los datos en voz alta al cliente antes de agregarlos. Una recarga o pago enviado no se puede cancelar ni devolver.</span>
            </div>
            <div className="text-center py-2">
              <p className="text-sm text-slate-500">{s.cat === 'servicio' ? 'Número / referencia' : 'Número'}</p>
              <p className="text-4xl sm:text-5xl font-bold tracking-wider text-slate-900">{formatPhone(s.phone)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 divide-y divide-slate-100 text-sm">
              <div className="flex justify-between px-3 py-2"><span className="text-slate-500">{s.cat === 'servicio' ? 'Servicio' : s.cat === 'tarjeta' ? 'Tarjeta' : 'Compañía'}</span><span className="font-medium">{carrier?.label}</span></div>
              {s.cat !== 'recarga' && (
                <div className="flex justify-between px-3 py-2"><span className="text-slate-500">Producto</span><span className="font-medium text-right">{s.product?.nombre}</span></div>
              )}
              <div className="flex justify-between px-3 py-2"><span className="text-slate-500">Monto</span><span className="font-medium">{formatMXN(amount)}</span></div>
              <div className="flex justify-between px-3 py-2"><span className="text-slate-500">Comisión Apolo</span><span className="font-medium">{formatMXN(fee)}</span></div>
              <div className="flex justify-between px-3 py-2 font-bold"><span>Cobrar al cliente</span><span>{formatMXN(amount + fee)}</span></div>
            </div>
            <label className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 cursor-pointer">
              <input type="checkbox" className="w-5 h-5 accent-[#1E2A8A]" checked={s.ok} onChange={(e) => set({ ok: e.target.checked })} />
              <span className="text-sm font-medium">El cliente confirmó que los datos son correctos</span>
            </label>
            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => set({ step: 'form', ok: false })}><ArrowLeft className="w-4 h-4 mr-2" />Atrás</Button>
              <Button className="bg-apolo-navy hover:bg-apolo-navy-dark text-white" disabled={!s.ok || !formOk} onClick={confirmAdd}>
                Agregar al carrito
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ServiciosModal;
