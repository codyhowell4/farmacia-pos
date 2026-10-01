import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Lock, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { useScreenLock } from '@/contexts/LockContext';
import { verifyProfilePin } from '@/lib/db';

// Client-side throttle on top of the server-side audit log: 5 wrong PINs
// pause the pad for 30 seconds.
const MAX_ATTEMPTS = 5;
const COOLDOWN_SECONDS = 30;

// Full-screen overlay shown when the idle timer (useIdleLock) locks the
// terminal. The Supabase session stays alive underneath; the user re-enters
// with their PIN (default 1234 until changed). "Cerrar sesión" is always
// available so a forgotten PIN can never brick the terminal.
const ScreenLock = () => {
  const { user, logout } = useAuth();
  const { locked, unlock } = useScreenLock();
  const navigate = useNavigate();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const inputRef = useRef(null);

  const active = locked && Boolean(user);

  // Fresh state (and focus) every time the lock engages.
  useEffect(() => {
    if (!active) return;
    setPin('');
    setError('');
    setAttempts(0);
    setCooldownUntil(0);
    const id = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(id);
  }, [active]);

  useEffect(() => {
    if (cooldownUntil <= Date.now()) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  if (!active) return null;

  const cooldownLeft = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
  const inCooldown = cooldownLeft > 0;

  const handleUnlock = async (e) => {
    e.preventDefault();
    if (!pin || checking || inCooldown) return;
    setChecking(true);
    setError('');
    try {
      const ok = await verifyProfilePin(pin);
      if (ok === true) {
        unlock();
        return;
      }
      if (ok === null) {
        setError('No se pudo verificar el PIN. Revisa tu conexión e intenta de nuevo.');
      } else {
        const next = attempts + 1;
        setAttempts(next);
        setError('PIN incorrecto');
        if (next >= MAX_ATTEMPTS) {
          setAttempts(0);
          setCooldownUntil(Date.now() + COOLDOWN_SECONDS * 1000);
          setNow(Date.now());
        }
      }
      setPin('');
      inputRef.current?.focus();
    } finally {
      setChecking(false);
    }
  };

  const handleLogout = async () => {
    unlock();
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-8 border border-slate-200"
      >
        <div className="flex justify-center mb-4">
          <div className="bg-gradient-to-br from-apolo-navy to-apolo-navy-dark p-4 rounded-full">
            <Lock className="w-8 h-8 text-white" />
          </div>
        </div>

        <h2 className="text-2xl font-bold text-center text-slate-900">Pantalla bloqueada</h2>
        <p className="text-center text-slate-600 mt-1 mb-6">
          <span className="font-medium text-slate-800">{user.name}</span> · ingresa tu PIN para continuar
        </p>

        <form onSubmit={handleUnlock} className="space-y-4">
          <Input
            ref={inputRef}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            placeholder="PIN de 4 a 6 dígitos"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            className={`text-center text-2xl tracking-[0.5em] h-14 ${error && !inCooldown ? 'border-red-400' : ''}`}
            disabled={checking || inCooldown}
          />
          {inCooldown ? (
            <p className="text-sm text-center text-amber-600">
              Demasiados intentos — espera {cooldownLeft}s
            </p>
          ) : (
            error && <p className="text-sm text-center text-red-600">{error}</p>
          )}
          <Button
            type="submit"
            disabled={!pin || checking || inCooldown}
            className="w-full bg-gradient-to-r from-apolo-navy to-apolo-navy-dark hover:from-apolo-navy-dark hover:to-apolo-navy-dark py-5"
          >
            {checking ? 'Verificando…' : 'Desbloquear'}
          </Button>
        </form>

        <button
          type="button"
          onClick={handleLogout}
          className="mt-5 w-full text-sm text-slate-500 hover:text-slate-700 transition-colors flex items-center justify-center gap-1.5"
        >
          <LogOut className="w-4 h-4" />
          ¿No eres {user.name}? Cerrar sesión
        </button>
      </motion.div>
    </div>
  );
};

export default ScreenLock;
