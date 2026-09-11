import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { renderPayPalButtons, PAYPAL_PLAN_IDS, isPayPalConfigured } from '@/lib/paypal';
import { Users, User, CheckCircle, Activity, MapPin, ArrowLeft, Clock, RefreshCw } from 'lucide-react';

const REVISION_SUMMARY = 'Revisión semestral gratis (valor $775): incluye Biometría Hemática, Examen General de Orina, Química Sanguínea de 12 elementos y Consulta';

const PLANS = {
  individual: {
    key: 'individual',
    name: 'Plan Individual',
    monthlyPrice: 150,
    visits: 2,
    features: [
      '2 visitas mensuales a consultorio',
      '50% de descuento si rebasas el límite',
      '10% de descuento en medicamentos',
      'Toma de presión gratis (cuando quiera)',
      REVISION_SUMMARY,
      'Descuentos de negocios aliados',
    ],
  },
  familiar: {
    key: 'familiar',
    name: 'Plan Familiar',
    monthlyPrice: 500,
    visits: 8,
    features: [
      'Hasta 6 personas (titular + 5)',
      '8 visitas mensuales a consultorio compartidas',
      '50% de descuento si rebasas el límite',
      '10% de descuento en medicamentos',
      'Toma de presión gratis (cuando quiera)',
      REVISION_SUMMARY + ' para cada miembro',
      'Descuentos de negocios aliados',
    ],
  },
};

const PUBLIC_ORG_ID = import.meta.env.VITE_PUBLIC_ORG_ID;
const EDGE_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/paypal-subscription`;

const MembershipPublicPage = () => {
  const { toast } = useToast();
  const [step, setStep] = useState('plans');
  const [selectedPlanKey, setSelectedPlanKey] = useState(null);
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState(null);
  // Set when PayPal charged but activation failed after all retries: drives
  // the "pago recibido" screen instead of a bare error. Money was taken, so
  // the UX must never look like the purchase failed.
  const [pending, setPending] = useState(null);
  const [createdSnapshot, setCreatedSnapshot] = useState(null);
  const paypalRendered = useRef(false);
  // True once the PayPal buttons are on screen for the current form state;
  // used to lock the terms checkbox so it can't be unchecked mid-payment.
  const [paypalReady, setPaypalReady] = useState(false);

  const [form, setForm] = useState({
    ownerName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    member2: '',
    member3: '',
    member4: '',
    member5: '',
    member6: '',
    termsAccepted: false,
  });

  const formRef = useRef(form);
  const selectedPlanKeyRef = useRef(selectedPlanKey);
  useEffect(() => { formRef.current = form; }, [form]);
  useEffect(() => { selectedPlanKeyRef.current = selectedPlanKey; }, [selectedPlanKey]);

  const plan = PLANS[selectedPlanKey];

  const monthlyTotal = useMemo(() => {
    if (!plan) return 0;
    return plan.monthlyPrice;
  }, [plan]);

  const handlePlanSelect = (key) => {
    setSelectedPlanKey(key);
    setStep('form');
  };

  const updateField = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const validate = () => {
    if (!form.ownerName.trim()) return 'El nombre del titular es obligatorio.';
    if (!form.email.trim()) return 'El correo electrónico es obligatorio.';
    if (!form.phone.trim()) return 'El teléfono es obligatorio.';
    if (form.password.length < 6) return 'La contraseña debe tener al menos 6 caracteres.';
    if (form.password !== form.confirmPassword) return 'Las contraseñas no coinciden.';
    if (!form.termsAccepted) return 'Debes aceptar los Términos y Condiciones y el Aviso de Privacidad.';
    if (!isPayPalConfigured()) return 'PayPal no está configurado.';
    return null;
  };

  const getFamilyMembers = () => {
    if (selectedPlanKey !== 'familiar') return [];
    return [form.member2, form.member3, form.member4, form.member5, form.member6]
      .map((m) => m.trim())
      .filter(Boolean);
  };

  // Sends the activation to the edge function. Throws with the server's
  // error message on failure; callers decide whether to retry.
  const submitRegistration = async (subscriptionId, planKey, snapshot) => {
    const familyMembers = planKey === 'familiar'
      ? [snapshot.member2, snapshot.member3, snapshot.member4, snapshot.member5, snapshot.member6]
          .map((m) => m.trim())
          .filter(Boolean)
      : [];

    const res = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription_id: subscriptionId,
        plan_type: planKey,
        password: snapshot.password,
        customer: {
          full_name: snapshot.ownerName.trim(),
          email: snapshot.email.trim(),
          phone: snapshot.phone.trim(),
        },
        member_names: familyMembers,
        trackers_to_fulfill: 0,
        org_id: PUBLIC_ORG_ID,
        terms_accepted_at: new Date().toISOString(),
      }),
    });

    const result = await res.json();
    if (!res.ok || result.error) {
      throw new Error(result.error || 'Error al registrar la membresía');
    }
    return result;
  };

  const finishRegistration = (result, snapshot) => {
    setCreated(result.membership);
    setCreatedSnapshot(snapshot);
    setStep('success');
    toast({
      title: 'Membresía registrada',
      description: `Plan ID: ${result.membership.plan_id}`,
    });
  };

  const handlePayPalApprove = async (data) => {
    const currentForm = formRef.current;
    const currentPlanKey = selectedPlanKeyRef.current;

    const validationError = (() => {
      if (!currentForm.ownerName.trim()) return 'El nombre del titular es obligatorio.';
      if (!currentForm.email.trim()) return 'El correo electrónico es obligatorio.';
      if (!currentForm.phone.trim()) return 'El teléfono es obligatorio.';
      if (currentForm.password.length < 6) return 'La contraseña debe tener al menos 6 caracteres.';
      if (currentForm.password !== currentForm.confirmPassword) return 'Las contraseñas no coinciden.';
      if (!currentForm.termsAccepted) return 'Debes aceptar los Términos y Condiciones y el Aviso de Privacidad.';
      if (!isPayPalConfigured()) return 'PayPal no está configurado.';
      return null;
    })();

    if (validationError) {
      // PayPal may already have taken the money by the time onApprove runs,
      // so point the user at the pharmacy instead of showing a bare error.
      toast({
        title: 'Verifica los datos',
        description: `${validationError} Si ya completaste el pago en PayPal, contacta a la farmacia para resolverlo antes de intentar de nuevo.`,
        variant: 'destructive',
      });
      return;
    }

    const snapshot = { ...currentForm };
    setLoading(true);
    try {
      // The payment already happened at PayPal, so a failure here is almost
      // always transient (network blip, function cold start, schema cache
      // reload). Retry before ever bothering the user with it.
      let result = null;
      let lastError = null;
      for (let attempt = 0; attempt < 3 && !result; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 1500 * attempt));
        try {
          result = await submitRegistration(data.subscriptionID, currentPlanKey, snapshot);
        } catch (err) {
          console.error(`[membresias] activation attempt ${attempt + 1} failed:`, err);
          lastError = err;
        }
      }

      if (result) {
        finishRegistration(result, snapshot);
      } else {
        setPending({
          subscriptionId: data.subscriptionID,
          planKey: currentPlanKey,
          snapshot,
          error: lastError?.message || null,
        });
        setStep('pending');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRetryActivation = async () => {
    if (!pending) return;
    setLoading(true);
    try {
      const result = await submitRegistration(pending.subscriptionId, pending.planKey, pending.snapshot);
      finishRegistration(result, pending.snapshot);
      setPending(null);
    } catch (err) {
      console.error('[membresias] manual activation retry failed:', err);
      setPending((p) => ({ ...p, error: err.message }));
      toast({
        title: 'Aún no se puede activar',
        description: 'Lo revisamos y te contactamos. Tu pago está seguro.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (step === 'form' && plan && form.termsAccepted && !paypalRendered.current && isPayPalConfigured()) {
      paypalRendered.current = true;
      renderPayPalButtons({
        containerId: 'paypal-button-container',
        planId: PAYPAL_PLAN_IDS[selectedPlanKey],
        onApprove: handlePayPalApprove,
        onError: (err) => {
          console.error('PayPal error:', err);
          toast({
            title: 'Error de PayPal',
            description: 'No se pudo cargar el botón de pago. Intenta de nuevo.',
            variant: 'destructive',
          });
        },
      }).then(() => {
        // Buttons are on screen for the current form state: lock the terms
        // checkbox so it can't be unchecked mid-payment. Guard against a
        // stale resolve after the user unchecked terms while the SDK loaded.
        if (formRef.current.termsAccepted) setPaypalReady(true);
      }).catch((err) => {
        console.error('Failed to render PayPal buttons:', err);
        paypalRendered.current = false;
      });
    }
  }, [step, plan, form.termsAccepted, selectedPlanKey]);

  const renderPlans = () => (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="text-center space-y-3">
        <h1 className="text-4xl font-bold text-slate-900">Membresías Apolo</h1>
        <p className="text-lg text-slate-600">
          Cuida de tu salud y la de tu familia con beneficios todos los meses.
        </p>
        <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
          <MapPin className="w-4 h-4" /> Válido en todas nuestras ubicaciones
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {Object.values(PLANS).map((p) => (
          <Card
            key={p.key}
            className={`cursor-pointer transition-all hover:shadow-xl ${
              selectedPlanKey === p.key ? 'ring-2 ring-apolo-navy' : ''
            }`}
            onClick={() => handlePlanSelect(p.key)}
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl">
                {p.key === 'individual' ? <User className="w-6 h-6" /> : <Users className="w-6 h-6" />}
                {p.name}
              </CardTitle>
              <CardDescription>
                <span className="text-3xl font-bold text-slate-900">${p.monthlyPrice}</span>
                <span className="text-slate-500"> / mes</span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {p.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-slate-700">
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button className="w-full mt-8 text-lg py-6">Seleccionar plan</Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );

  const renderForm = () => (
    <div className="max-w-2xl mx-auto space-y-6">
      <Button variant="outline" onClick={() => { setStep('plans'); paypalRendered.current = false; setPaypalReady(false); }} className="flex items-center gap-2">
        <ArrowLeft className="w-4 h-4" /> Volver a planes
      </Button>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
        <div>
          <p className="font-bold text-blue-900">{plan.name}</p>
          <p className="text-sm text-blue-700">${plan.monthlyPrice}/mes + upgrades</p>
        </div>
        <Activity className="w-8 h-8 text-blue-600" />
      </div>

      <div className="space-y-5">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Datos del titular</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Nombre completo *</Label>
              <Input
                value={form.ownerName}
                onChange={(e) => updateField('ownerName', e.target.value)}
                required
              />
            </div>
            <div>
              <Label>Teléfono *</Label>
              <Input
                type="tel"
                value={form.phone}
                onChange={(e) => updateField('phone', e.target.value)}
                required
              />
            </div>
            <div className="md:col-span-2">
              <Label>Correo electrónico *</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => updateField('email', e.target.value)}
                required
              />
            </div>
            <div>
              <Label>Contraseña *</Label>
              <Input
                type="password"
                minLength={6}
                value={form.password}
                onChange={(e) => updateField('password', e.target.value)}
                required
              />
            </div>
            <div>
              <Label>Confirmar contraseña *</Label>
              <Input
                type="password"
                minLength={6}
                value={form.confirmPassword}
                onChange={(e) => updateField('confirmPassword', e.target.value)}
                required
              />
            </div>
          </div>
        </div>

        {selectedPlanKey === 'familiar' && (
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Integrantes adicionales</h2>
            <p className="text-sm text-slate-500">
              Puedes registrar hasta 5 integrantes adicionales ahora, o agregarlos después en sucursal.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[2, 3, 4, 5, 6].map((n) => (
                <div key={n}>
                  <Label>Integrante {n} (opcional)</Label>
                  <Input
                    value={form[`member${n}`]}
                    onChange={(e) => updateField(`member${n}`, e.target.value)}
                    placeholder="Nombre completo (opcional)"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {!isPayPalConfigured() && (
          <div className="p-3 bg-yellow-50 text-yellow-800 text-sm rounded-lg">
            PayPal no está configurado. Agrega las variables de entorno de PayPal para continuar.
          </div>
        )}

        <div className="border-t pt-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Total mensual</p>
              <p className="text-2xl font-bold text-slate-900">${monthlyTotal.toFixed(2)} MXN</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <input
              id="terms-accepted"
              type="checkbox"
              checked={form.termsAccepted}
              disabled={paypalReady}
              onChange={(e) => {
                updateField('termsAccepted', e.target.checked);
                if (!e.target.checked) {
                  paypalRendered.current = false;
                  setPaypalReady(false);
                }
              }}
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

          {paypalReady && (
            <p className="text-xs text-slate-500">
              Ya puedes pagar con PayPal — términos aceptados. Si necesitas modificarlos, vuelve a la lista de planes.
            </p>
          )}

          {form.termsAccepted ? (
            <div id="paypal-button-container" className="min-h-[120px]" />
          ) : (
            <p className="text-sm text-slate-500 text-center">
              Debes aceptar los Términos y Condiciones para continuar con el pago.
            </p>
          )}
        </div>
      </div>
    </div>
  );

  const renderSuccess = () => (
    <div className="max-w-xl mx-auto text-center space-y-6">
      <CheckCircle className="w-16 h-16 text-green-600 mx-auto" />
      <h1 className="text-3xl font-bold text-slate-900">¡Gracias! Tu membresía está activa</h1>
      <p className="text-lg text-slate-600">Bienvenido a Membresías Apolo.</p>
      <div className="bg-slate-50 rounded-xl p-6 space-y-2 text-left">
        <p className="text-sm text-slate-500">Plan ID</p>
        <p className="text-2xl font-mono font-bold text-slate-900">{created?.plan_id}</p>
        <p className="text-sm text-slate-500">Titular</p>
        <p className="font-medium">{created?.customers?.full_name || createdSnapshot?.ownerName}</p>
        <p className="text-sm text-slate-500">Renovación</p>
        <p className="font-medium">{created?.next_renewal_date}</p>
        <p className="text-sm text-slate-500">Monto mensual</p>
        <p className="font-medium">${Number(created?.monthly_amount).toFixed(2)} MXN</p>
      </div>
      <p className="text-slate-600">
        Guarda tu Plan ID — lo necesitarás en tus visitas. Te enviaremos la confirmación a{' '}
        <span className="font-medium">{createdSnapshot?.email}</span>.
      </p>
      <div className="space-y-3">
        <Button className="w-full text-lg py-6" onClick={() => { window.location.href = '/customer-app/'; }}>
          Entrar a la app de clientes
        </Button>
        <p className="text-sm text-slate-500">
          Inicia sesión con tu correo electrónico, teléfono o número de membresía y la contraseña que elegiste.
        </p>
      </div>
    </div>
  );

  // PayPal charged but activation didn't confirm: reassure, keep the
  // evidence on screen, and offer a manual retry (safe — the edge function
  // treats a repeated subscription id as a replay).
  const renderPending = () => (
    <div className="max-w-xl mx-auto text-center space-y-6">
      <Clock className="w-16 h-16 text-amber-500 mx-auto" />
      <h1 className="text-3xl font-bold text-slate-900">¡Recibimos tu pago!</h1>
      <p className="text-lg text-slate-600">
        PayPal procesó tu pago correctamente. Estamos terminando de activar tu membresía — normalmente toma solo unos minutos.
      </p>
      <div className="bg-slate-50 rounded-xl p-6 space-y-2 text-left">
        <p className="text-sm text-slate-500">Plan</p>
        <p className="font-medium">{pending?.planKey ? PLANS[pending.planKey].name : ''}</p>
        <p className="text-sm text-slate-500">Titular</p>
        <p className="font-medium">{pending?.snapshot?.ownerName}</p>
        <p className="text-sm text-slate-500">ID de suscripción de PayPal</p>
        <p className="font-mono font-medium break-all">{pending?.subscriptionId}</p>
      </div>
      <Button className="w-full text-lg py-6" disabled={loading} onClick={handleRetryActivation}>
        <RefreshCw className={`w-5 h-5 mr-2 ${loading ? 'animate-spin' : ''}`} />
        {loading ? 'Activando...' : 'Reintentar activación'}
      </Button>
      <p className="text-slate-600">
        Si el problema continúa, contáctanos y te activamos de inmediato — tu pago está seguro:
      </p>
      <p className="font-medium text-slate-900">
        Tel: +52 1 442 548 8893 · citas@apolofarmacia.com.mx
      </p>
      {pending?.error && (
        <p className="text-xs text-slate-400">Detalle técnico: {pending.error}</p>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-apolo-bg py-12 px-4">
      <div className="max-w-6xl mx-auto">
        {step === 'plans' && renderPlans()}
        {step === 'form' && renderForm()}
        {step === 'success' && renderSuccess()}
        {step === 'pending' && renderPending()}
      </div>
      <p className="text-xs text-slate-500 text-center mt-10">
        Farmacia Apolo · Cometa 4, San Antonio Zomeyucan, Naucalpan de Juárez · Tel: +52 1 442 548 8893
      </p>
    </div>
  );
};

export default MembershipPublicPage;
