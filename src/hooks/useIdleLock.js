import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useScreenLock } from '@/contexts/LockContext';

export const IDLE_LOCK_MINUTES = 30;
export const IDLE_LOCK_MINUTES_DOCTOR = 60;

const IDLE_LOCK_MS = IDLE_LOCK_MINUTES * 60 * 1000;
const IDLE_LOCK_DOCTOR_MS = IDLE_LOCK_MINUTES_DOCTOR * 60 * 1000;
const ACTIVITY_THROTTLE_MS = 1000;
const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'];

// Views where the timer never runs: login, registration and the public site.
const PUBLIC_PATHS = ['/', '/login', '/registro', '/forgot-password', '/reset-password', '/customer-register', '/membresias'];

const isPublicPath = (pathname) =>
  PUBLIC_PATHS.some((path) =>
    path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`)
  );

// Locks the screen (ScreenLock overlay, PIN to re-enter) after a period
// without user activity: 60 minutes in the doctor portal (/doctor), 30
// minutes everywhere else. Activity re-arms the timer, throttled to one
// reset per second. Only runs with a logged-in user on internal views, and
// pauses while the screen is already locked (unlocking re-arms it).
const useIdleLock = () => {
  const { user } = useAuth();
  const { locked, lock } = useScreenLock();
  const { pathname } = useLocation();

  const timerRef = useRef(null);
  const lastActivityRef = useRef(0);
  // lock is re-created when the user id changes; keep a ref so the effect
  // below does not re-arm on each render.
  const lockRef = useRef(lock);
  useEffect(() => { lockRef.current = lock; }, [lock]);

  const enabled = Boolean(user) && !locked && !isPublicPath(pathname);
  const idleLockMs = pathname.startsWith('/doctor') ? IDLE_LOCK_DOCTOR_MS : IDLE_LOCK_MS;

  useEffect(() => {
    if (!enabled) return undefined;

    const expire = () => lockRef.current();

    const arm = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(expire, idleLockMs);
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
  }, [enabled, idleLockMs]);
};

export default useIdleLock;
