import React, { useEffect, useState } from 'react';
import { User, Users, CheckCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export const MEMBERSHIP_SIGNUP_PLANS = {
  individual: { key: 'individual', name: 'Plan Individual', monthlyPrice: 150, visits: 2, productName: 'MEMBRESIA INDIVIDUAL' },
  familiar: { key: 'familiar', name: 'Plan Familiar', monthlyPrice: 500, visits: 8, productName: 'MEMBRESIA FAMILIAR' },
};

const INITIAL_FORM = { fullName: '', email: '', phone: '', termsAccepted: false };

// POS "Registrar Miembro" dialog: captures the titular's data and the plan so
// the fee can ride the current ticket. The real membership is only created
// server-side once the sale completes (pos_register_membership RPC).
const MembershipSignupDialog = ({ open, onOpenChange, onConfirm }) => {
  const [planKey, setPlanKey] = useState('individual');
  const [form, setForm] = useState(INITIAL_FORM);
  const [error, setError] = useState('');

  useEffect(() => {
    setPlanKey('individual');
    setForm(INITIAL_FORM);
    setError('');
  }, [open]);

  const updateField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    const fullName = form.fullName.trim();
    const email = form.email.trim().toLowerCase();
    const phone = form.phone.trim();
    if (!fullName || !email || !phone) {
      setError('Captura el nombre, el correo electrónico y el teléfono del titular.');
      return;
    }
    if (!form.termsAccepted) {
      setError('El titular debe aceptar los Términos y Condiciones y el Aviso de Privacidad.');
      return;
    }
    setError('');
    onConfirm({
      planKey,
      fullName,
      email,
      phone,
      termsAcceptedAt: new Date().toISOString(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar Miembro</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {Object.values(MEMBERSHIP_SIGNUP_PLANS).map((plan) => {
              const selected = planKey === plan.key;
              const PlanIcon = plan.key === 'familiar' ? Users : User;
              return (
                <button
                  key={plan.key}
                  type="button"
                  onClick={() => setPlanKey(plan.key)}
                  aria-pressed={selected}
                  className={`relative text-left p-3 rounded-lg border-2 transition-all ${
                    selected
                      ? 'border-apolo-navy bg-apolo-navy/5'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {selected && <CheckCircle className="absolute top-2 right-2 w-4 h-4 text-apolo-navy" />}
                  <PlanIcon className="w-5 h-5 text-apolo-navy mb-1" />
                  <p className="font-semibold text-sm text-slate-900">{plan.name}</p>
                  <p className="text-sm font-bold text-green-600">${plan.monthlyPrice} MXN/mes</p>
                  <p className="text-xs text-slate-500 mt-1">{plan.visits} consultas mensuales + 10% de descuento</p>
                </button>
              );
            })}
          </div>

          <div className="space-y-2">
            <Label htmlFor="signup-fullname">Nombre completo del titular *</Label>
            <Input
              id="signup-fullname"
              placeholder="Nombre Apellido"
              value={form.fullName}
              onChange={(e) => updateField('fullName', e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="signup-email">Correo electrónico *</Label>
            <Input
              id="signup-email"
              type="email"
              placeholder="correo@ejemplo.com"
              value={form.email}
              onChange={(e) => updateField('email', e.target.value)}
            />
            <p className="text-xs text-slate-500">Ahí llegará el enlace para crear su contraseña</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="signup-phone">Teléfono *</Label>
            <Input
              id="signup-phone"
              type="tel"
              placeholder="10 dígitos"
              value={form.phone}
              onChange={(e) => updateField('phone', e.target.value)}
            />
          </div>

          <div className="flex items-start gap-3">
            <input
              id="signup-terms"
              type="checkbox"
              checked={form.termsAccepted}
              onChange={(e) => updateField('termsAccepted', e.target.checked)}
              className="mt-1 w-4 h-4 flex-shrink-0"
            />
            <Label htmlFor="signup-terms" className="text-sm font-normal text-slate-700 cursor-pointer leading-snug">
              El titular acepta los{' '}
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

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div>
            <Button type="submit" className="w-full">Agregar al ticket</Button>
            <p className="text-xs text-slate-500 text-center mt-2">La membresía se activa al cobrar el ticket.</p>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default MembershipSignupDialog;
