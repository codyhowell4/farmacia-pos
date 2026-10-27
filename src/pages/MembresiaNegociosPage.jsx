import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { getStripe, isStripeConfigured } from '@/lib/stripe';
import { Building2, CheckCircle, MapPin, Minus, Plus, CreditCard, Sparkles } from 'lucide-react';

const PRICE_PER_SEAT = 100;
const MIN_SEATS = 1;
const MAX_SEATS = 100;

const BENEFITS = [
  'Cada empleado: 2 consultas al mes (adicionales al 50%)',
  '10% de descuento en toda la tienda para cada empleado',
  'Estudios de laboratorio por antigüedad (revisión gratis cada 6 meses, valor $775)',
  'Toma de presión gratis cuando quieran',
  'Descuentos de negocios aliados',
  'Administra tu equipo (agregar o quitar empleados) desde el portal',
];

const PUBLIC_ORG_ID = import.meta.env.VITE_PUBLIC_ORG_ID;
const EDGE_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/empresa-signup`;

const CARD_DECLINED_MESSAGE = 'Tu banco rechazó la tarjeta — intenta con otra.';

// The SetupIntent id travels inside its client_secret (seti_…_secret_…).
const setupIntentIdFromSecret = (clientSecret) =>
  (clientSecret || '').split('_secret_')[0] || null;

const MembresiaNegociosPage = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  // Holds the mounted Stripe card element for the current form state.
  const stripeCardRef = useRef(null);
  const [cardholderName, setCardholderName] = useState('');
  const [cardError, setCardError] = useState(null);
  const [cardReady, setCardReady] = useState(false);

  const [form, setForm] = useState({
    companyName: '',
    contactName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    seats: 5,
    termsAccepted: false,
  });

  const updateField = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const monthlyTotal = useMemo(() => form.seats * PRICE_PER_SEAT, [form.seats]);

  const validateForm = (f) => {
    if (f.companyName.trim().length < 2) return 'El nombre de la empresa es obligatorio.';
    if (!f.contactName.trim()) return 'El nombre del contacto es obligatorio.';
    if (!f.email.trim()) return 'El correo electrónico del contacto es obligatorio.';
    if (f.phone.replace(/\D/g, '').length < 7) return 'El teléfono del contacto es obligatorio.';
    if (f.password.length < 10) return 'La contraseña debe tener al menos 10 caracteres.';
    if (f.password !== f.confirmPassword) return 'Las contraseñas no coinciden.';
    if (!Number.isInteger(f.seats) || f.seats < MIN_SEATS || f.seats > MAX_SEATS) {
      return `El número de lugares debe ser entre ${MIN_SEATS} y ${MAX_SEATS}.`;
    }
    if (!f.termsAccepted) return 'Debes aceptar los Términos y Condiciones y el Aviso de Privacidad.';
    if (!isStripeConfigured()) return 'Stripe no está configurado.';
    return null;
  };

  // Mount the Stripe card element once the terms checkbox is on. Unmounts
  // when the user unchecks terms.
  useEffect(() => {
    if (!form.termsAccepted || !isStripeConfigured()) return undefined;
    let cancelled = false;
    let card = null;
    getStripe().then((stripe) => {
      if (cancelled) return;
      const container = document.getElementById('stripe-card-element');
      if (!container) return;
      const elements = stripe.elements();
      card = elements.create('card');
      card.mount(container);
      card.on('change', (e) => setCardError(e.error ? e.error.message : null));
      stripeCardRef.current = { stripe, card };
      setCardReady(true);
    }).catch((err) => {
      console.error('Failed to load Stripe:', err);
      if (!cancelled) setCardError('No se pudo cargar el formulario de pago. Intenta de nuevo.');
    });
    return () => {
      cancelled = true;
      stripeCardRef.current = null;
      setCardReady(false);
      if (card) card.unmount();
    };
  }, [form.termsAccepted]);

  // Shared body for the 'start' and 'confirm' calls to the signup function.
  const buildPayload = (snapshot) => ({
    company_name: snapshot.companyName.trim(),
    contact: {
      full_name: snapshot.contactName.trim(),
      email: snapshot.email.trim(),
      phone: snapshot.phone.trim(),
    },
    seats: snapshot.seats,
    password: snapshot.password,
    org_id: PUBLIC_ORG_ID,
    terms_accepted_at: new Date().toISOString(),
    origin: window.location.origin,
  });

  const submitSignup = async (payload) => {
    const res = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await res.json();
    if (!res.ok || result.error) {
      throw new Error(result.error || 'Error al registrar el plan');
    }
    return result;
  };

  // The card is only VERIFIED (no charge) before 'confirm', but 'confirm'
  // creates the subscription — and the edge function treats a repeated
  // confirm as a replay, so transient failures are worth retrying before
  // ever bothering the user.
  const submitSignupWithRetry = async (payload) => {
    let result = null;
    let lastError = null;
    for (let attempt = 0; attempt < 3 && !result; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 1500 * attempt));
      try {
        result = await submitSignup(payload);
      } catch (err) {
        console.error(`[membresia-negocios] attempt ${attempt + 1} failed:`, err);
        lastError = err;
      }
    }
    if (!result) throw (lastError || new Error('Error al registrar el plan'));
    return result;
  };

  const handleSubmit = async () => {
    const validationError = validateForm(form);
    if (validationError) {
      toast({ title: 'Verifica los datos', description: validationError, variant: 'destructive' });
      return;
    }

    const stripeCtx = stripeCardRef.current;
    if (!stripeCtx) {
      toast({
        title: 'Formulario de pago no listo',
        description: 'Espera a que cargue el campo de tarjeta e intenta de nuevo.',
        variant: 'destructive',
      });
      return;
    }

    const snapshot = { ...form };
    const basePayload = buildPayload(snapshot);
    setLoading(true);
    setCardError(null);
    try {
      // Phase 1: create the Stripe customer + SetupIntent.
      const started = await submitSignupWithRetry({ ...basePayload, action: 'start' });
      if (started.status !== 'requires_setup' || !started.client_secret) {
        throw new Error('Respuesta inesperada del servidor de pagos');
      }

      // Phase 2: verify the card (3DS when the bank asks for it).
      const { error: setupError } = await stripeCtx.stripe.confirmCardSetup(started.client_secret, {
        payment_method: {
          card: stripeCtx.card,
          billing_details: {
            name: cardholderName.trim() || snapshot.contactName.trim(),
            email: snapshot.email.trim(),
          },
        },
      });
      if (setupError) {
        setCardError(CARD_DECLINED_MESSAGE);
        toast({
          title: 'No se pudo verificar la tarjeta',
          description: CARD_DECLINED_MESSAGE,
          variant: 'destructive',
        });
        return;
      }

      // Phase 3: create the trialing subscription + provision everything.
      const confirmed = await submitSignupWithRetry({
        ...basePayload,
        action: 'confirm',
        setup_intent_id: setupIntentIdFromSecret(started.client_secret),
        stripe_customer_id: started.stripe_customer_id,
      });

      if (confirmed.status === 'active' && confirmed.setup_url) {
        // Straight to roster activation — the contact assigns the seats now.
        window.location.href = confirmed.setup_url;
        return;
      }

      throw new Error('Respuesta inesperada del servidor de pagos');
    } catch (err) {
      console.error('[membresia-negocios] signup failed:', err);
      toast({
        title: 'Error',
        description: err.message || 'No se pudo registrar el plan. Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-apolo-bg py-12 px-4">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="text-center space-y-3">
          <h1 className="text-4xl font-bold text-slate-900">Plan Empresa</h1>
          <p className="text-lg text-slate-600">
            Cuida la salud de tu equipo con Membresías Apolo.
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
            <MapPin className="w-4 h-4" /> Válido en todas nuestras ubicaciones
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Building2 className="w-6 h-6" />
              Plan Empresa
            </CardTitle>
            <CardDescription>
              <span className="text-3xl font-bold text-slate-900">${PRICE_PER_SEAT}</span>
              <span className="text-slate-500"> / mes por empleado</span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-green-50 border border-green-200 px-4 py-2 text-sm font-medium text-green-800">
              <Sparkles className="w-4 h-4" />
              Primer mes gratis — el primer cargo es el día 30
            </div>
            <ul className="space-y-3">
              {BENEFITS.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-slate-700">
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <div className="space-y-5">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Datos de la empresa</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Label>Nombre de la empresa *</Label>
                <Input
                  value={form.companyName}
                  onChange={(e) => updateField('companyName', e.target.value)}
                  placeholder="Ej. Constructora del Valle SA de CV"
                  required
                />
              </div>
              <div>
                <Label>Nombre del contacto *</Label>
                <Input
                  value={form.contactName}
                  onChange={(e) => updateField('contactName', e.target.value)}
                  placeholder="Quien administrará el plan"
                  required
                />
              </div>
              <div>
                <Label>Teléfono del contacto *</Label>
                <Input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => updateField('phone', e.target.value)}
                  required
                />
              </div>
              <div className="md:col-span-2">
                <Label>Correo electrónico del contacto *</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  required
                />
              </div>
              <div>
                <Label>Contraseña para tu portal *</Label>
                <Input
                  type="password"
                  minLength={10}
                  value={form.password}
                  onChange={(e) => updateField('password', e.target.value)}
                  required
                />
              </div>
              <div>
                <Label>Confirmar contraseña *</Label>
                <Input
                  type="password"
                  minLength={10}
                  value={form.confirmPassword}
                  onChange={(e) => updateField('confirmPassword', e.target.value)}
                  required
                />
              </div>
            </div>
            <p className="text-sm text-slate-500">
              Con este correo y contraseña entrarás al portal para administrar a tus empleados.
            </p>
          </div>

          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Número de empleados</h2>
            <div className="flex items-center gap-4">
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={form.seats <= MIN_SEATS}
                onClick={() => updateField('seats', Math.max(MIN_SEATS, form.seats - 1))}
              >
                <Minus className="w-4 h-4" />
              </Button>
              <Input
                type="number"
                min={MIN_SEATS}
                max={MAX_SEATS}
                value={form.seats}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  if (Number.isInteger(n)) {
                    updateField('seats', Math.min(MAX_SEATS, Math.max(MIN_SEATS, n)));
                  }
                }}
                className="w-24 text-center text-lg font-bold"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={form.seats >= MAX_SEATS}
                onClick={() => updateField('seats', Math.min(MAX_SEATS, form.seats + 1))}
              >
                <Plus className="w-4 h-4" />
              </Button>
              <p className="text-sm text-slate-500">lugares (máx. {MAX_SEATS})</p>
            </div>
            <p className="text-sm text-slate-500">
              Puedes agregar o quitar lugares después desde el portal — el cobro se ajusta solo.
            </p>
          </div>

          {!isStripeConfigured() && (
            <div className="p-3 bg-yellow-50 text-yellow-800 text-sm rounded-lg">
              Stripe no está configurado. Agrega las variables de entorno de Stripe para continuar.
            </div>
          )}

          <div className="border-t pt-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">
                  Total mensual ({form.seats} × ${PRICE_PER_SEAT})
                </p>
                <p className="text-2xl font-bold text-slate-900">${monthlyTotal.toFixed(2)} MXN</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-slate-500">Hoy pagas</p>
                <p className="text-2xl font-bold text-green-700">$0.00</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <input
                id="terms-accepted"
                type="checkbox"
                checked={form.termsAccepted}
                onChange={(e) => updateField('termsAccepted', e.target.checked)}
                className="mt-1 w-4 h-4 flex-shrink-0"
              />
              <Label htmlFor="terms-accepted" className="text-sm font-normal text-slate-700 cursor-pointer leading-snug">
                He leído y acepto los{' '}
                <a
                  href="/membresias/terminos"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-apolo-navy underline"
                >
                  Términos y Condiciones y el Aviso de Privacidad
                </a>
              </Label>
            </div>

            {form.termsAccepted ? (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="cardholder-name">Nombre en la tarjeta</Label>
                  <Input
                    id="cardholder-name"
                    value={cardholderName}
                    onChange={(e) => setCardholderName(e.target.value)}
                    placeholder={form.contactName || 'Como aparece en la tarjeta'}
                    autoComplete="cc-name"
                  />
                </div>
                <div>
                  <Label>Datos de la tarjeta</Label>
                  <div id="stripe-card-element" className="mt-1 rounded-md border border-input bg-white px-3 py-3 shadow-sm" />
                </div>
                {cardError && (
                  <p className="text-sm text-red-600">{cardError}</p>
                )}
                <Button
                  className="w-full text-lg py-6"
                  disabled={loading || !cardReady || !isStripeConfigured()}
                  onClick={handleSubmit}
                >
                  <CreditCard className="w-5 h-5 mr-2" />
                  {loading ? 'Procesando...' : `Activar Plan Empresa — $${monthlyTotal.toFixed(2)}/mes desde el día 30`}
                </Button>
                <p className="text-xs text-slate-500 text-center">
                  Hoy no se hace ningún cargo. Tu tarjeta se verifica de forma segura con Stripe y el primer
                  cargo automático es en 30 días. Puedes cancelar cuando quieras.
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-500 text-center">
                Debes aceptar los Términos y Condiciones para continuar.
              </p>
            )}
          </div>
        </div>

        <p className="text-xs text-slate-500 text-center mt-10">
          Farmacia Apolo · Cometa 4, San Antonio Zomeyucan, Naucalpan de Juárez · Tel: +52 1 442 548 8893
        </p>
      </div>
    </div>
  );
};

export default MembresiaNegociosPage;
