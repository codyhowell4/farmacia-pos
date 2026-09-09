import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { renderPayPalButtons, PAYPAL_PLAN_IDS, isPayPalConfigured } from '@/lib/paypal';
import { Users, User, CheckCircle, Activity, MapPin, ArrowLeft } from 'lucide-react';

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
  const paypalRendered = useRef(false);

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
    if (selectedPlanKey === 'familiar') {
      if (
        !form.member2.trim() ||
        !form.member3.trim() ||
        !form.member4.trim() ||
        !form.member5.trim() ||
        !form.member6.trim()
      ) {
        return 'Debes registrar los 5 integrantes adicionales del plan familiar.';
      }
    }
    if (!isPayPalConfigured()) return 'PayPal no está configurado.';
    return null;
  };

  const getFamilyMembers = () => {
    if (selectedPlanKey !== 'familiar') return [];
    return [form.member2, form.member3, form.member4, form.member5, form.member6]
      .map((m) => m.trim())
      .filter(Boolean);
  };

  const handlePayPalApprove = async (data) => {
    const currentForm = formRef.current;
    const currentPlanKey = selectedPlanKeyRef.current;
    const currentPlan = currentPlanKey ? PLANS[currentPlanKey] : null;

    const validationError = (() => {
      if (!currentForm.ownerName.trim()) return 'El nombre del titular es obligatorio.';
      if (!currentForm.email.trim()) return 'El correo electrónico es obligatorio.';
      if (!currentForm.phone.trim()) return 'El teléfono es obligatorio.';
      if (currentForm.password.length < 6) return 'La contraseña debe tener al menos 6 caracteres.';
      if (currentForm.password !== currentForm.confirmPassword) return 'Las contraseñas no coinciden.';
      if (currentPlanKey === 'familiar') {
        if (
          !currentForm.member2.trim() ||
          !currentForm.member3.trim() ||
          !currentForm.member4.trim() ||
          !currentForm.member5.trim() ||
          !currentForm.member6.trim()
        ) {
          return 'Debes registrar los 5 integrantes adicionales del plan familiar.';
        }
      }
      if (!isPayPalConfigured()) return 'PayPal no está configurado.';
      return null;
    })();

    if (validationError) {
      toast({ title: 'Verifica los datos', description: validationError, variant: 'destructive' });
      return;
    }

    const familyMembers = currentPlanKey === 'familiar'
      ? [currentForm.member2, currentForm.member3, currentForm.member4, currentForm.member5, currentForm.member6]
          .map((m) => m.trim())
          .filter(Boolean)
      : [];

    setLoading(true);
    try {
      const res = await fetch(EDGE_FUNCTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription_id: data.subscriptionID,
          plan_type: currentPlanKey,
          password: currentForm.password,
          customer: {
            full_name: currentForm.ownerName.trim(),
            email: currentForm.email.trim(),
            phone: currentForm.phone.trim(),
          },
          member_names: familyMembers,
          trackers_to_fulfill: 0,
          org_id: PUBLIC_ORG_ID,
        }),
      });

      const result = await res.json();
      if (!res.ok || result.error) {
        throw new Error(result.error || 'Error al registrar la membresía');
      }

      setCreated(result.membership);
      setStep('success');
      toast({
        title: 'Membresía registrada',
        description: `Plan ID: ${result.membership.plan_id}`,
      });
    } catch (err) {
      console.error(err);
      toast({
        title: 'Error',
        description: err.message || 'No se pudo registrar la membresía.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (step === 'form' && plan && !paypalRendered.current && isPayPalConfigured()) {
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
      }).catch((err) => {
        console.error('Failed to render PayPal buttons:', err);
        paypalRendered.current = false;
      });
    }
  }, [step, plan, selectedPlanKey]);

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
      <Button variant="outline" onClick={() => { setStep('plans'); paypalRendered.current = false; }} className="flex items-center gap-2">
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[2, 3, 4, 5, 6].map((n) => (
                <div key={n}>
                  <Label>Integrante {n} *</Label>
                  <Input
                    value={form[`member${n}`]}
                    onChange={(e) => updateField(`member${n}`, e.target.value)}
                    required
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
          <div id="paypal-button-container" className="min-h-[120px]" />
        </div>
      </div>
    </div>
  );

  const renderSuccess = () => (
    <div className="max-w-xl mx-auto text-center space-y-6">
      <CheckCircle className="w-16 h-16 text-green-600 mx-auto" />
      <h1 className="text-3xl font-bold text-slate-900">¡Bienvenido a Membresías Apolo!</h1>
      <div className="bg-slate-50 rounded-xl p-6 space-y-2 text-left">
        <p className="text-sm text-slate-500">Plan ID</p>
        <p className="text-2xl font-mono font-bold text-slate-900">{created?.plan_id}</p>
        <p className="text-sm text-slate-500">Titular</p>
        <p className="font-medium">{created?.customers?.full_name}</p>
        <p className="text-sm text-slate-500">Renovación</p>
        <p className="font-medium">{created?.next_renewal_date}</p>
        <p className="text-sm text-slate-500">Monto mensual</p>
        <p className="font-medium">${Number(created?.monthly_amount).toFixed(2)} MXN</p>
      </div>
      <p className="text-slate-600">Guarda tu Plan ID. Lo necesitarás en tu próxima visita.</p>
      <p className="text-slate-600">
        Ya puedes iniciar sesión en el portal de clientes en{' '}
        <a href="/customer-app/" className="text-apolo-navy underline">/customer-app/</a>{' '}
        con tu correo electrónico, teléfono o número de membresía y la contraseña que elegiste.
      </p>
    </div>
  );

  return (
    <div className="min-h-screen bg-apolo-bg py-12 px-4">
      <div className="max-w-6xl mx-auto">
        {step === 'plans' && renderPlans()}
        {step === 'form' && renderForm()}
        {step === 'success' && renderSuccess()}
      </div>
    </div>
  );
};

export default MembershipPublicPage;
