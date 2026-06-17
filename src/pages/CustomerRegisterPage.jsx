import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { Pill, User, Mail, Phone, CheckCircle, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { createCustomer } from '@/lib/db';

const CustomerRegisterPage = () => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!fullName.trim() || !phone.trim()) {
      toast({ title: 'Datos incompletos', description: 'Nombre y teléfono son obligatorios.', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      const result = await createCustomer({
        full_name: fullName.trim(),
        email: email.trim() || null,
        phone: phone.trim(),
        notes: notes.trim() || null,
      });

      setRegisteredEmail(email.trim() || phone.trim());
      setSuccess(true);
      toast({ title: '¡Registro exitoso!', description: 'El cliente ha sido registrado en el sistema.' });
    } catch (err) {
      console.error('Registration error:', err);
      let message = err.message || 'Error al registrar el cliente';
      toast({ title: 'Error al registrarse', description: message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <>
        <Helmet><title>Registro exitoso - Farmacia</title></Helmet>
        <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-green-50 to-teal-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md"
          >
            <div className="bg-white rounded-2xl shadow-2xl p-8 border border-slate-200 text-center">
              <div className="bg-gradient-to-br from-green-500 to-teal-600 p-4 rounded-full w-fit mx-auto mb-6">
                <CheckCircle className="w-10 h-10 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-slate-900 mb-2">¡Registro exitoso!</h1>
              <p className="text-slate-600 mb-4">
                El cliente <strong>{fullName}</strong> ha sido registrado.
              </p>
              <div className="bg-slate-50 rounded-lg p-4 mb-6 flex flex-col items-center">
                <p className="text-xs text-slate-500 mb-2">Escanea para acceder al portal:</p>
                <QRCodeSVG
                  value={`${window.location.origin}/customer-app/`}
                  size={160}
                  bgColor="#ffffff"
                  fgColor="#0f172a"
                  level="M"
                  includeMargin={false}
                />
                <code className="text-[10px] text-slate-400 mt-2 bg-slate-100 px-2 py-1 rounded break-all">
                  {window.location.origin}/customer-app/
                </code>
              </div>
              <div className="flex flex-col gap-2">
                <Button onClick={() => navigate('/login')} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600">
                  Ir al inicio de sesión
                </Button>
                <Link to="/customer-app/" className="text-sm text-blue-600 hover:underline">
                  Ir al portal de cliente
                </Link>
              </div>
            </div>
          </motion.div>
        </div>
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>Registro de cliente - Farmacia</title>
      </Helmet>

      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 to-indigo-50">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 border border-slate-200">
            <div className="flex justify-center mb-6">
              <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-4 rounded-full">
                <Pill className="w-10 h-10 text-white" />
              </div>
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold text-center mb-2 bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              Farmacia Apollo
            </h1>
            <p className="text-center text-slate-600 mb-6">Registro rápido de cliente</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Nombre completo *</Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
                  <Input
                    id="fullName"
                    placeholder="Juan Pérez"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="pl-10"
                    disabled={submitting}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Teléfono *</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="555-123-4567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="pl-10"
                    disabled={submitting}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Correo electrónico</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="correo@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    disabled={submitting}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notas</Label>
                <div className="relative">
                  <FileText className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
                  <Textarea
                    id="notes"
                    placeholder="Alergias, preferencias, etc."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="pl-10 min-h-[80px]"
                    disabled={submitting}
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={submitting}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 transition-all py-5"
              >
                {submitting ? 'Guardando...' : 'Registrar cliente'}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-sm text-slate-600">
                ¿Ya tienes cuenta?{' '}
                <Link to="/login" className="text-blue-600 hover:text-blue-800 hover:underline font-medium">
                  Inicia sesión
                </Link>
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </>
  );
};

export default CustomerRegisterPage;
