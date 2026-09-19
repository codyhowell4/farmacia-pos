import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

export const IDLE_TIMEOUT_MINUTES = 15;

const IDLE_TIMEOUT_MS = IDLE_TIMEOUT_MINUTES * 60 * 1000;
const ACTIVITY_THROTTLE_MS = 1000;
const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'];

// Views where the timer never runs: login, registration and the public site.
const PUBLIC_PATHS = ['/', '/login', '/registro', '/forgot-password', '/reset-password', '/customer-register', '/membresias'];

const isPublicPath = (pathname) =>
  PUBLIC_PATHS.some((path) =>
    path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`)
  );

// Closes the session after IDLE_TIMEOUT_MINUTES without user activity.
// Activity re-arms the timer, throttled to one reset per second. Only runs
// with a logged-in user on internal views.
const useIdleLogout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const timerRef = useRef(null);
  const lastActivityRef = useRef(0);
  // logout is re-created on every AuthProvider render; keep a ref so the
  // effect below does not re-arm on each render.
  const logoutRef = useRef(logout);
  useEffect(() => { logoutRef.current = logout; }, [logout]);

  const enabled = Boolean(user) && !isPublicPath(pathname);

  useEffect(() => {
    if (!enabled) return undefined;

    const expire = async () => {
      await logoutRef.current();
      toast('Sesión cerrada por inactividad');
      navigate('/login', { replace: true });
    };

    const arm = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(expire, IDLE_TIMEOUT_MS);
    };

    const onActivity = () => {
      const now = Date.now();
      if (now - lastActivityRef.current < ACTIVITY_THROTTLE_MS) return;
      lastActivityRef.current = now;
      arm();
    };

    arm();
    ACTIVITY_EVENTS.forEach((eventName) => window.addEventListener(eventName, onActivity, { passive: true }));

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      ACTIVITY_EVENTS.forEach((eventName) => window.removeEventListener(eventName, onActivity));
    };
  }, [enabled, navigate]);
};

export default useIdleLogout;
