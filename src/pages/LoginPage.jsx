import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Pill, Lock, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();
  const { toast } = useToast();

  // Note: Removed the useEffect auto-redirect based on user state
  // This was causing race conditions - we now handle navigation after successful login only

  const handleLogin = async (e) => {
    e.preventDefault();
    
    if (!email || !password) {
      toast({ 
        title: 'Datos incompletos', 
        description: 'Ingresa tu correo y contraseña.', 
        variant: 'destructive' 
      });
      return;
    }
    
    setSubmitting(true);
    
    try {
      const profile = await login(email, password);
      
      toast({ 
        title: '¡Bienvenido!', 
        description: `Hola, ${profile.name}` 
      });
      
      // Navigate based on role
      if (profile.role === 'admin') {
        navigate('/admin');
      } else if (profile.role === 'pos') {
        navigate('/pos');
      } else if (profile.role === 'inventory') {
        navigate('/inventory');
      } else if (profile.role === 'doctor') {
        navigate('/doctor');
      } else if (profile.role === 'customer') {
        // Customer portal is a separate static app; full page navigation
        window.location.href = '/customer-app/';
      } else {
        // Fallback for unknown roles
        navigate('/');
      }
    } catch (err) {
      console.error('Login error:', err);
      
      // Better error messages
      let errorMessage = err.message;
      
      if (err.message?.includes('Invalid login credentials')) {
        errorMessage = 'Correo o contraseña incorrectos.';
      } else if (err.message?.includes('Email not confirmed')) {
        errorMessage = 'El correo no ha sido confirmado.';
      } else if (err.message?.includes('Tiempo de espera')) {
        errorMessage = 'El servidor está tardando en responder. Intenta de nuevo.';
      }
      
      toast({
        title: 'Error al iniciar sesión',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Iniciar sesión - Sistema de Farmacia</title>
      </Helmet>

      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 to-indigo-50">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          <div className="bg-white rounded-2xl shadow-2xl p-8 border border-slate-200">
            <div className="flex justify-center mb-6">
              <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-4 rounded-full">
                <Pill className="w-10 h-10 text-white" />
              </div>
            </div>

            <h1 className="text-3xl font-bold text-center mb-2 bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              Sistema de Farmacia
            </h1>
            <p className="text-center text-slate-600 mb-8">Inicia sesión para continuar</p>

            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">Correo electrónico</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="correo@farmacia.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    autoComplete="email"
                    disabled={submitting}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10"
                    autoComplete="current-password"
                    disabled={submitting}
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Link 
                  to="/forgot-password" 
                  className="text-sm text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                >
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>

              <Button
                type="submit"
                disabled={submitting}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 transition-all py-5"
              >
                {submitting ? 'Iniciando sesión...' : 'Iniciar sesión'}
              </Button>
            </form>
          </div>
        </motion.div>
      </div>
    </>
  );
};

export default LoginPage;
