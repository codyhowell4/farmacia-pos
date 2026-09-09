import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { createMembership } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import { renderPayPalButtons, PAYPAL_PLAN_IDS, isPayPalConfigured } from '@/lib/paypal';
import { Users, User, Banknote, ChevronLeft, CheckCircle, Activity, CreditCard } from 'lucide-react';

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

const CASH_SURCHARGE = 50;
const EDGE_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/paypal-subscription`;

const MembershipRegistration = () => {
  const navigate = useNavigate();
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
    member2: '',
    member3: '',
    member4: '',
    member5: '',
    member6: '',
    paymentMethod: 'paypal',
  });

  const formRef = useRef(form);
  const selectedPlanKeyRef = useRef(selectedPlanKey);
  useEffect(() => { formRef.current = form; }, [form]);
  useEffect(() => { selectedPlanKeyRef.current = selectedPlanKey; }, [selectedPlanKey]);

  const plan = PLANS[selectedPlanKey];

  const monthlyTotal = useMemo(() => {
    if (!plan) return 0;
    let total = plan.monthlyPrice;
    if (form.paymentMethod === 'cash') total += CASH_SURCHARGE;
    return total;
  }, [plan, form.paymentMethod]);

  const handlePlanSelect = (key) => {
    setSelectedPlanKey(key);
    setStep('form');
  };

  const updateField = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const validate = () => {
    if (!form.ownerName.trim()) return 'El nombre del titular es obligatorio.';
    if (!form.email.trim()) return 'El correo electrónico es obligatorio.';
    if (!form.phone.trim()) return 'El teléfono es obligatorio.';
    if (form.password.length < 6) return 'La contraseña del portal debe tener al menos 6 caracteres.';
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
    if (form.paymentMethod === 'paypal' && !isPayPalConfigured()) {
      return 'PayPal no está configurado.';
    }
    return null;
  };

  const getFamilyMembers = () => {
    if (selectedPlanKey !== 'familiar') return [];
    return [form.member2, form.member3, form.member4, form.member5, form.member6]
      .map((m) => m.trim())
      .filter(Boolean);
  };

  const createCashMembership = async () => {
    const customer = {
      full_name: form.ownerName.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
    };

    const result = await createMembership({
      customer,
      membership: {
        plan_type: selectedPlanKey,
        discount_percent: 10,
        visits_limit: plan.visits,
        basic_trackers_included: 0,
        basic_trackers_fulfilled: 0,
        monthly_amount: monthlyTotal,
        payment_method: 'cash',
        payment_processor: null,
        processor_subscription_id: null,
      },
      familyMembers: getFamilyMembers(),
    });

    return result;
  };

  const handleCashSubmit = async (e) => {
    e.preventDefault();
    const error = validate();
    if (error) {
      toast({ title: 'Verifica los datos', description: error, variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const result = await createCashMembership();
      try {
        const { data: portalData, error: portalError } = await supabase.functions.invoke('create-portal-account', {
          body: {
            customer_id: result.customer_id,
            email: form.email.trim(),
            password: form.password,
            full_name: form.ownerName.trim(),
          },
        });
        if (portalError || portalData?.error) {
          throw new Error(portalError?.message || portalData.error);
        }
      } catch (portalErr) {
        console.error('create-portal-account error:', portalErr);
        toast({
          title: 'Membresía creada, pero la cuenta del portal no pudo vincularse',
          description: 'Puedes intentarlo de nuevo desde la ficha del cliente.',
        });
      }
      setCreated(result);
      setStep('success');
      toast({ title: 'Membresía registrada', description: `Plan ID: ${result.plan_id}` });
    } catch (err) {
      console.error(err);
      toast({ title: 'Error', description: err.message || 'No se pudo registrar la membresía.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handlePayPalApprove = async (data) => {
    const currentForm = formRef.current;
    const currentPlanKey = selectedPlanKeyRef.current;
    const currentPlan = currentPlanKey ? PLANS[currentPlanKey] : null;

    const error = (() => {
      if (!currentForm.ownerName.trim()) return 'El nombre del titular es obligatorio.';
      if (!currentForm.email.trim()) return 'El correo electrónico es obligatorio.';
      if (!currentForm.phone.trim()) return 'El teléfono es obligatorio.';
      if (currentForm.password.length < 6) return 'La contraseña del portal debe tener al menos 6 caracteres.';
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

    if (error) {
      toast({ title: 'Verifica los datos', description: error, variant: 'destructive' });
      return;
    }

    const familyMembers = currentPlanKey === 'familiar'
      ? [currentForm.member2, currentForm.member3, currentForm.member4, currentForm.member5, currentForm.member6]
          .map((m) => m.trim())
          .filter(Boolean)
      : [];

    setLoading(true);
    try {
      const orgId = import.meta.env.VITE_PUBLIC_ORG_ID;
      const res = await fetch(EDGE_FUNCTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: 'Bearer anon' },
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
          org_id: orgId,
        }),
      });

      const result = await res.json();
      if (!res.ok || result.error) {
        throw new Error(result.error || 'Error al registrar la membresía');
      }

      setCreated(result.membership);
      setStep('success');
      toast({ title: 'Membresía registrada', description: `Plan ID: ${result.membership.plan_id}` });
    } catch (err) {
      console.error(err);
      toast({ title: 'Error', description: err.message || 'No se pudo registrar la membresía.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (
      step === 'form' &&
      plan &&
      form.paymentMethod === 'paypal' &&
      !paypalRendered.current &&
      isPayPalConfigured()
    ) {
      paypalRendered.current = true;
      renderPayPalButtons({
        containerId: 'paypal-button-container-admin',
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
  }, [step, plan, form.paymentMethod, selectedPlanKey]);

  const renderPlans = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-slate-900">Membresías Apolo</h1>
        <p className="text-slate-600 mt-2">Elige el plan que mejor se ajuste a tus necesidades.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {Object.values(PLANS).map((p) => (
          <Card
            key={p.key}
            className={`cursor-pointer transition-all hover:shadow-lg ${
              selectedPlanKey === p.key ? 'ring-2 ring-apolo-navy' : ''
            }`}
            onClick={() => handlePlanSelect(p.key)}
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {p.key === 'individual' ? <User className="w-5 h-5" /> : <Users className="w-5 h-5" />}
                {p.name}
              </CardTitle>
              <CardDescription>
                <span className="text-2xl font-bold text-slate-900">${p.monthlyPrice}</span>
                <span className="text-slate-500"> / mes</span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {p.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                    <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button className="w-full mt-6">Seleccionar plan</Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );

  const renderForm = () => (
    <div className="max-w-2xl mx-auto space-y-6">
      <Button variant="ghost" onClick={() => { setStep('plans'); paypalRendered.current = false; }} className="mb-2">
        <ChevronLeft className="w-4 h-4 mr-1" /> Cambiar plan
      </Button>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
        <div>
          <p className="font-bold text-blue-900">{plan.name}</p>
          <p className="text-sm text-blue-700">${plan.monthlyPrice}/mes + complementos</p>
        </div>
        <Activity className="w-8 h-8 text-blue-600" />
      </div>

      <form onSubmit={handleCashSubmit} className="space-y-5">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Datos del titular</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Nombre completo *</Label>
              <Input value={form.ownerName} onChange={(e) => updateField('ownerName', e.target.value)} required />
            </div>
            <div>
              <Label>Teléfono *</Label>
              <Input type="tel" value={form.phone} onChange={(e) => updateField('phone', e.target.value)} required />
            </div>
            <div className="md:col-span-2">
              <Label>Correo electrónico *</Label>
              <Input type="email" value={form.email} onChange={(e) => updateField('email', e.target.value)} required />
            </div>
            <div className="md:col-span-2">
              <Label>Contraseña del portal *</Label>
              <Input type="password" minLength={6} value={form.password} onChange={(e) => updateField('password', e.target.value)} required />
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

        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Forma de pago</h2>
          <div className="flex gap-4">
            <label className={`flex-1 flex items-center gap-3 p-3 border rounded-lg cursor-pointer ${
              form.paymentMethod === 'paypal' ? 'bg-apolo-navy/5 border-apolo-navy/30' : 'hover:bg-slate-50'
            }`}>
              <input
                type="radio"
                name="paymentMethod"
                value="paypal"
                checked={form.paymentMethod === 'paypal'}
                onChange={(e) => {
                  updateField('paymentMethod', e.target.value);
                  paypalRendered.current = false;
                }}
                className="w-4 h-4"
              />
              <CreditCard className="w-5 h-5" />
              <span>PayPal (suscripción mensual)</span>
            </label>
            <label className={`flex-1 flex items-center gap-3 p-3 border rounded-lg cursor-pointer ${
              form.paymentMethod === 'cash' ? 'bg-amber-50 border-amber-300' : 'hover:bg-slate-50'
            }`}>
              <input
                type="radio"
                name="paymentMethod"
                value="cash"
                checked={form.paymentMethod === 'cash'}
                onChange={(e) => {
                  updateField('paymentMethod', e.target.value);
                  paypalRendered.current = false;
                }}
                className="w-4 h-4"
              />
              <Banknote className="w-5 h-5" />
              <span>Efectivo (+${CASH_SURCHARGE} MXN)</span>
            </label>
          </div>
        </div>

        {form.paymentMethod === 'paypal' && !isPayPalConfigured() && (
          <div className="p-3 bg-yellow-50 text-yellow-800 text-sm rounded-lg">
            PayPal no está configurado. Agrega las variables de entorno de PayPal para continuar.
          </div>
        )}

        <div className="border-t pt-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <p className="text-sm text-slate-500">Total mensual</p>
            <p className="text-2xl font-bold text-slate-900">${monthlyTotal.toFixed(2)} MXN</p>
          </div>
          {form.paymentMethod === 'cash' && (
            <Button type="submit" disabled={loading} size="lg">
              {loading ? 'Registrando...' : 'Registrar membresía'}
            </Button>
          )}
        </div>

        {form.paymentMethod === 'paypal' && (
          <div id="paypal-button-container-admin" className="min-h-[120px]" />
        )}
      </form>
    </div>
  );

  const renderSuccess = () => (
    <div className="max-w-xl mx-auto text-center space-y-6">
      <CheckCircle className="w-16 h-16 text-green-600 mx-auto" />
      <h1 className="text-3xl font-bold text-slate-900">¡Membresía registrada!</h1>
      <div className="bg-slate-50 rounded-xl p-6 space-y-2 text-left">
        <p className="text-sm text-slate-500">Plan ID</p>
        <p className="text-2xl font-mono font-bold text-slate-900">{created.plan_id}</p>
        <p className="text-sm text-slate-500">Titular</p>
        <p className="font-medium">{created.customers?.full_name}</p>
        <p className="text-sm text-slate-500">Renovación</p>
        <p className="font-medium">{created.next_renewal_date}</p>
        <p className="text-sm text-slate-500">Monto mensual</p>
        <p className="font-medium">${Number(created.monthly_amount).toFixed(2)} MXN</p>
      </div>
      <div className="flex gap-3 justify-center">
        <Button variant="outline" onClick={() => navigate('/admin/memberships')}>
          Ver membresías
        </Button>
        <Button onClick={() => {
          setStep('plans');
          setSelectedPlanKey(null);
          setCreated(null);
          paypalRendered.current = false;
          setForm({
            ownerName: '',
            email: '',
            phone: '',
            password: '',
            member2: '',
            member3: '',
            member4: '',
            member5: '',
            member6: '',
            paymentMethod: 'paypal',
          });
        }}>
          Registrar otra
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {step === 'plans' && renderPlans()}
      {step === 'form' && renderForm()}
      {step === 'success' && renderSuccess()}
    </div>
  );
};

export default MembershipRegistration;
