import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { Building2, CheckCircle, AlertCircle, Mail, UserPlus, Trash2, PartyPopper } from 'lucide-react';

const EDGE_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/empresa-setup`;
const WHATSAPP_URL = 'https://wa.me/5214425488893?text=' +
  encodeURIComponent('Hola, necesito ayuda con la activación de mi Plan Empresa.');

const STATUS_LABELS = {
  invited: { label: 'Invitado por correo', Icon: Mail, className: 'text-green-700 bg-green-50 border-green-200' },
  roster_only: { label: 'Solo registro en tienda', Icon: CheckCircle, className: 'text-blue-700 bg-blue-50 border-blue-200' },
  error: { label: 'Error', Icon: AlertCircle, className: 'text-red-700 bg-red-50 border-red-200' },
};

const emptyRow = () => ({ name: '', email: '', phone: '' });

const MembresiaNegociosSetupPage = () => {
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const token = (searchParams.get('setup') || '').trim();

  const [rows, setRows] = useState([emptyRow(), emptyRow(), emptyRow()]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  // 'form' | 'success' | 'link_error'
  const [screen, setScreen] = useState(token ? 'form' : 'link_error');
  const [linkErrorMessage, setLinkErrorMessage] = useState('');

  const updateRow = (index, field, value) =>
    setRows((rs) => rs.map((r, i) => (i === index ? { ...r, [field]: value } : r)));

  const addRow = () => setRows((rs) => [...rs, emptyRow()]);
  const removeRow = (index) => setRows((rs) => rs.filter((_, i) => i !== index));

  const filledRows = () =>
    rows
      .map((r) => ({ name: r.name.trim(), email: r.email.trim(), phone: r.phone.trim() }))
      .filter((r) => r.name || r.email || r.phone);

  const validate = (list) => {
    if (!list.length) return 'Agrega al menos un empleado con su nombre.';
    for (const r of list) {
      if (r.name.length < 2) return `Falta el nombre de un empleado (revisa "${r.email || r.phone || 'fila vacía'}").`;
      if (!r.email && !r.phone) return `${r.name}: captura al menos su correo o su teléfono.`;
      if (r.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(r.email)) return `${r.name}: el correo no es válido.`;
    }
    return null;
  };

  const handleSubmit = async () => {
    const list = filledRows();
    const validationError = validate(list);
    if (validationError) {
      toast({ title: 'Verifica los datos', description: validationError, variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(EDGE_FUNCTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          employees: list.map((r) => ({
            name: r.name,
            ...(r.email ? { email: r.email } : {}),
            ...(r.phone ? { phone: r.phone } : {}),
          })),
          origin: window.location.origin,
        }),
      });
      const result = await res.json();

      if (!res.ok || result.error) {
        // 404 invalid token / 410 expired or seats exhausted — friendly screen.
        setLinkErrorMessage(result.error || 'Este enlace ya no está disponible.');
        setScreen('link_error');
        return;
      }

      setResults(result.results || []);
      const anyError = (result.results || []).some((r) => r.status === 'error');
      if (!anyError) {
        setScreen('success');
      } else {
        toast({
          title: 'Algunos empleados no se pudieron registrar',
          description: 'Revisa el detalle abajo — puedes corregir y enviar de nuevo.',
          variant: 'destructive',
        });
      }
    } catch (err) {
      console.error('[membresia-negocios-setup] failed:', err);
      toast({
        title: 'Error de conexión',
        description: 'No se pudo registrar la lista. Revisa tu conexión e inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const renderLinkError = () => (
    <div className="max-w-xl mx-auto text-center space-y-6">
      <AlertCircle className="w-16 h-16 text-amber-500 mx-auto" />
      <h1 className="text-3xl font-bold text-slate-900">Este enlace venció o ya se usó</h1>
      <p className="text-lg text-slate-600">
        {linkErrorMessage || 'Por seguridad, el enlace de activación solo es válido por 48 horas.'}
      </p>
      <p className="text-slate-600">
        No te preocupes — tu Plan Empresa sigue activo. Escríbenos y te enviamos un enlace nuevo,
        o registra a tus empleados desde el portal del cliente.
      </p>
      <div className="space-y-3">
        <Button className="w-full text-lg py-6" onClick={() => { window.location.href = WHATSAPP_URL; }}>
          Escribirnos por WhatsApp
        </Button>
        <p className="text-sm text-slate-500">
          Tel: +52 1 442 548 8893 · citas@apolofarmacia.com.mx
        </p>
      </div>
    </div>
  );

  const renderSuccess = () => (
    <div className="max-w-xl mx-auto text-center space-y-6">
      <PartyPopper className="w-16 h-16 text-green-600 mx-auto" />
      <h1 className="text-3xl font-bold text-slate-900">¡Tu equipo está registrado!</h1>
      <p className="text-lg text-slate-600">
        Cada empleado con correo recibió un correo para crear su contraseña y entrar al portal de
        Farmacia Apolo. Pídeles que revisen su bandeja (y la carpeta de spam).
      </p>
      {results && (
        <div className="space-y-2 text-left">
          {results.map((r, i) => {
            const meta = STATUS_LABELS[r.status] || STATUS_LABELS.roster_only;
            return (
              <div key={i} className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${meta.className}`}>
                <meta.Icon className="w-5 h-5 flex-shrink-0" />
                <div>
                  <p className="font-medium">{r.name}</p>
                  <p className="text-sm">
                    {meta.label}{r.note ? ` — ${r.note}` : ''}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-slate-600">
        Desde tu portal puedes agregar o quitar empleados cuando quieras — el cobro mensual se ajusta solo.
      </p>
      <Button className="w-full text-lg py-6" onClick={() => { window.location.href = '/customer-app/'; }}>
        Entrar al portal de clientes
      </Button>
    </div>
  );

  const renderForm = () => (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center space-y-3">
        <h1 className="text-3xl font-bold text-slate-900">Asigna los lugares de tu Plan Empresa</h1>
        <p className="text-slate-600">
          Registra a tus empleados. Los que tengan correo recibirán un mensaje para crear su
          contraseña y entrar al portal; los que solo tengan teléfono quedan registrados para
          mostrar su membresía en tienda.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Building2 className="w-5 h-5" />
            Empleados
          </CardTitle>
          <CardDescription>
            Nombre completo y al menos un dato de contacto (correo o teléfono) por persona.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {rows.map((row, i) => (
            <div key={i} className="rounded-lg border border-slate-200 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">Empleado {i + 1}</p>
                {rows.length > 1 && (
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeRow(i)}>
                    <Trash2 className="w-4 h-4 text-slate-400" />
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label>Nombre *</Label>
                  <Input
                    value={row.name}
                    onChange={(e) => updateRow(i, 'name', e.target.value)}
                    placeholder="Nombre completo"
                  />
                </div>
                <div>
                  <Label>Correo</Label>
                  <Input
                    type="email"
                    value={row.email}
                    onChange={(e) => updateRow(i, 'email', e.target.value)}
                    placeholder="correo@ejemplo.com"
                  />
                </div>
                <div>
                  <Label>Teléfono</Label>
                  <Input
                    type="tel"
                    value={row.phone}
                    onChange={(e) => updateRow(i, 'phone', e.target.value)}
                    placeholder="55 0000 0000"
                  />
                </div>
              </div>
            </div>
          ))}

          <Button type="button" variant="outline" className="w-full" onClick={addRow}>
            <UserPlus className="w-4 h-4 mr-2" /> Agregar otro empleado
          </Button>

          <Button className="w-full text-lg py-6" disabled={loading} onClick={handleSubmit}>
            {loading ? 'Registrando...' : 'Registrar empleados'}
          </Button>
        </CardContent>
      </Card>

      {results && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Resultado del registro</CardTitle>
            <CardDescription>
              Corrige las filas con error y vuelve a enviar — los que ya quedaron registrados se omiten.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {results.map((r, i) => {
              const meta = STATUS_LABELS[r.status] || STATUS_LABELS.error;
              return (
                <div key={i} className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${meta.className}`}>
                  <meta.Icon className="w-5 h-5 flex-shrink-0" />
                  <div>
                    <p className="font-medium">{r.name}</p>
                    <p className="text-sm">
                      {meta.label}{r.note ? ` — ${r.note}` : ''}
                    </p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-slate-500 text-center mt-10">
        Farmacia Apolo · Cometa 4, San Antonio Zomeyucan, Naucalpan de Juárez · Tel: +52 1 442 548 8893
      </p>
    </div>
  );

  return (
    <div className="min-h-screen bg-apolo-bg py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {screen === 'form' && renderForm()}
        {screen === 'success' && renderSuccess()}
        {screen === 'link_error' && renderLinkError()}
      </div>
    </div>
  );
};

export default MembresiaNegociosSetupPage;
