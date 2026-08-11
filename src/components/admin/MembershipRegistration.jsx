import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { createMembership } from '@/lib/db';
import { tokenizeCard, isOpenPayConfigured, maskCardNumber } from '@/lib/openpay';
import { Users, User, CreditCard, Banknote, ChevronLeft, CheckCircle, Activity } from 'lucide-react';

const PLANS = {
  individual: {
    key: 'individual',
    name: 'Plan Individual',
    monthlyPrice: 150,
    visits: 2,
    trackers: 1,
    features: [
      '2 consultas médicas mensuales',
      '10% de descuento en farmacia',
      '1 rastreador fitness básico',
      'Consultas adicionales al 50%',
    ],
  },
  familiar: {
    key: 'familiar',
    name: 'Plan Familiar',
    monthlyPrice: 500,
    visits: 8,
    trackers: 4,
    features: [
      'Hasta 4 personas',
      '8 consultas médicas mensuales',
      '10% de descuento en farmacia',
      '4 rastreadores fitness básicos',
      'Consultas adicionales al 50%',
    ],
  },
};

const CASH_SURCHARGE = 50;
const PREMIUM_TRACKER_PRICE = 250;

const MembershipRegistration = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState('plans');
  const [selectedPlanKey, setSelectedPlanKey] = useState(null);
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState(null);

  const [form, setForm] = useState({
    ownerName: '',
    email: '',
    phone: '',
    member2: '',
    member3: '',
    member4: '',
    paymentMethod: 'card',
    premiumTrackers: 0,
    cardNumber: '',
    cardHolder: '',
    expiry: '',
    cvv: '',
  });

  const plan = PLANS[selectedPlanKey];

  const monthlyTotal = useMemo(() => {
    if (!plan) return 0;
    let total = plan.monthlyPrice;
    if (form.paymentMethod === 'cash') total += CASH_SURCHARGE;
    total += (Number(form.premiumTrackers) || 0) * PREMIUM_TRACKER_PRICE;
    return total;
  }, [plan, form.paymentMethod, form.premiumTrackers]);

  const handlePlanSelect = (key) => {
    setSelectedPlanKey(key);
    setForm((f) => ({
      ...f,
      premiumTrackers: key === 'individual' ? 0 : 0,
    }));
    setStep('form');
  };

  const updateField = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const parseExpiry = (expiry) => {
    const [mm, yy] = expiry.split('/');
    return {
      month: mm?.trim(),
      year: yy?.trim()?.length === 2 ? `20${yy.trim()}` : yy?.trim(),
    };
  };

  const validate = () => {
    if (!form.ownerName.trim()) return 'El nombre del titular es obligatorio.';
    if (!form.email.trim()) return 'El correo electrónico es obligatorio.';
    if (!form.phone.trim()) return 'El teléfono es obligatorio.';
    if (selectedPlanKey === 'familiar') {
      if (!form.member2.trim() || !form.member3.trim() || !form.member4.trim()) {
        return 'Debes registrar los 3 integrantes adicionales del plan familiar.';
      }
    }
    if (form.paymentMethod === 'card') {
      if (!isOpenPayConfigured()) return null; // allow saving without card token for now
      if (form.cardNumber.replace(/\D/g, '').length < 15) return 'Número de tarjeta incompleto.';
      if (!form.cardHolder.trim()) return 'El nombre del tarjetahabiente es obligatorio.';
      if (!form.expiry.trim()) return 'La fecha de vencimiento es obligatoria.';
      if (form.cvv.length < 3) return 'El CVV es obligatorio.';
    }
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const error = validate();
    if (error) {
      toast({ title: 'Verifica los datos', description: error, variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      let cardToken = null;
      let cardLast4 = null;

      if (form.paymentMethod === 'card' && isOpenPayConfigured()) {
        const { month, year } = parseExpiry(form.expiry);
        const tokenRes = await tokenizeCard({
          card_number: form.cardNumber.replace(/\D/g, ''),
          holder_name: form.cardHolder,
          expiration_year: year,
          expiration_month: month,
          cvv2: form.cvv,
        });
        cardToken = tokenRes.token;
        cardLast4 = maskCardNumber(form.cardNumber);
      }

      const customer = {
        full_name: form.ownerName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
      };

      const familyMembers =
        selectedPlanKey === 'familiar'
          ? [form.member2.trim(), form.member3.trim(), form.member4.trim()]
          : [];

      const membershipPayload = {
        plan_type: selectedPlanKey,
        discount_percent: 10,
        visits_limit: plan.visits,
        premium_trackers: Number(form.premiumTrackers) || 0,
        monthly_amount: monthlyTotal,
        payment_method: form.paymentMethod,
        payment_processor: 'openpay',
        card_token: cardToken,
        card_last4: cardLast4,
      };

      const result = await createMembership({
        customer,
        membership: membershipPayload,
        familyMembers,
      });

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
            className={`cursor-pointer transition-all hover:shadow-lg ${selectedPlanKey === p.key ? 'ring-2 ring-blue-500' : ''}`}
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
      <Button variant="ghost" onClick={() => setStep('plans')} className="mb-2">
        <ChevronLeft className="w-4 h-4 mr-1" /> Cambiar plan
      </Button>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
        <div>
          <p className="font-bold text-blue-900">{plan.name}</p>
          <p className="text-sm text-blue-700">${plan.monthlyPrice}/mes + complementos</p>
        </div>
        <Activity className="w-8 h-8 text-blue-600" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
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
          </div>
        </div>

        {selectedPlanKey === 'familiar' && (
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Integrantes adicionales</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Integrante 2 *</Label>
                <Input value={form.member2} onChange={(e) => updateField('member2', e.target.value)} required />
              </div>
              <div>
                <Label>Integrante 3 *</Label>
                <Input value={form.member3} onChange={(e) => updateField('member3', e.target.value)} required />
              </div>
              <div>
                <Label>Integrante 4 *</Label>
                <Input value={form.member4} onChange={(e) => updateField('member4', e.target.value)} required />
              </div>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Rastreador fitness</h2>
          {selectedPlanKey === 'individual' ? (
            <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-slate-50">
              <input
                type="checkbox"
                checked={form.premiumTrackers > 0}
                onChange={(e) => updateField('premiumTrackers', e.target.checked ? 1 : 0)}
                className="w-4 h-4"
              />
              <span>Actualizar a rastreador premium (+${PREMIUM_TRACKER_PRICE} MXN)</span>
            </label>
          ) : (
            <div className="flex items-center gap-4">
              <Label>Cantidad de upgrades a premium:</Label>
              <select
                value={form.premiumTrackers}
                onChange={(e) => updateField('premiumTrackers', Number(e.target.value))}
                className="px-3 py-2 rounded-md border border-slate-300 text-sm"
              >
                {[0, 1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? 'rastreador' : 'rastreadores'} (+${n * PREMIUM_TRACKER_PRICE})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Forma de pago</h2>
          <div className="flex gap-4">
            <label className={`flex-1 flex items-center gap-3 p-3 border rounded-lg cursor-pointer ${form.paymentMethod === 'card' ? 'bg-blue-50 border-blue-300' : 'hover:bg-slate-50'}`}>
              <input
                type="radio"
                name="paymentMethod"
                value="card"
                checked={form.paymentMethod === 'card'}
                onChange={(e) => updateField('paymentMethod', e.target.value)}
                className="w-4 h-4"
              />
              <CreditCard className="w-5 h-5" />
              <span>Tarjeta (autopago mensual)</span>
            </label>
            <label className={`flex-1 flex items-center gap-3 p-3 border rounded-lg cursor-pointer ${form.paymentMethod === 'cash' ? 'bg-amber-50 border-amber-300' : 'hover:bg-slate-50'}`}>
              <input
                type="radio"
                name="paymentMethod"
                value="cash"
                checked={form.paymentMethod === 'cash'}
                onChange={(e) => updateField('paymentMethod', e.target.value)}
                className="w-4 h-4"
              />
              <Banknote className="w-5 h-5" />
              <span>Efectivo (+${CASH_SURCHARGE} MXN)</span>
            </label>
          </div>
        </div>

        {form.paymentMethod === 'card' && (
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Datos de la tarjeta</h2>
            {!isOpenPayConfigured() && (
              <div className="p-3 bg-yellow-50 text-yellow-800 text-sm rounded-lg">
                El procesador de pagos no está configurado. La membresía se guardará sin token de tarjeta hasta que agregues las credenciales de OpenPay en el archivo .env.
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Label>Número de tarjeta</Label>
                <Input
                  value={form.cardNumber}
                  onChange={(e) => updateField('cardNumber', e.target.value)}
                  placeholder="0000 0000 0000 0000"
                  maxLength={19}
                />
              </div>
              <div className="md:col-span-2">
                <Label>Nombre del tarjetahabiente</Label>
                <Input value={form.cardHolder} onChange={(e) => updateField('cardHolder', e.target.value)} />
              </div>
              <div>
                <Label>Vencimiento (MM/AA)</Label>
                <Input
                  value={form.expiry}
                  onChange={(e) => updateField('expiry', e.target.value)}
                  placeholder="MM/AA"
                  maxLength={5}
                />
              </div>
              <div>
                <Label>CVV</Label>
                <Input
                  type="password"
                  value={form.cvv}
                  onChange={(e) => updateField('cvv', e.target.value)}
                  placeholder="123"
                  maxLength={4}
                />
              </div>
            </div>
          </div>
        )}

        <div className="border-t pt-4 flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-500">Total mensual</p>
            <p className="text-2xl font-bold text-slate-900">${monthlyTotal.toFixed(2)} MXN</p>
          </div>
          <Button type="submit" disabled={loading} size="lg">
            {loading ? 'Registrando...' : 'Registrar membresía'}
          </Button>
        </div>
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
        <Button onClick={() => { setStep('plans'); setSelectedPlanKey(null); setCreated(null); setForm({ ownerName: '', email: '', phone: '', member2: '', member3: '', member4: '', paymentMethod: 'card', premiumTrackers: 0, cardNumber: '', cardHolder: '', expiry: '', cvv: '' }); }}>
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
