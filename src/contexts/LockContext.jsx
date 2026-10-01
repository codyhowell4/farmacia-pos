import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';

// sessionStorage so the lock survives a page reload (F5 cannot bypass it) but
// is scoped to the tab — the value is the user id the lock belongs to, so a
// different account never inherits someone else's lock. AuthContext.login()
// and .logout() clear the same key.
const STORAGE_KEY = 'apolo:screen-lock';

const LockContext = createContext(null);

export const LockProvider = ({ children }) => {
  const { user } = useAuth();
  const [locked, setLocked] = useState(() => Boolean(sessionStorage.getItem(STORAGE_KEY)));

  // Reconcile the persisted flag with the signed-in user once the session
  // resolves: a different user never inherits the lock, and a stale flag for
  // an unknown user is dropped.
  useEffect(() => {
    if (!user?.id) return;
    const lockedFor = sessionStorage.getItem(STORAGE_KEY);
    if (lockedFor && lockedFor !== user.id) {
      sessionStorage.removeItem(STORAGE_KEY);
    }
    setLocked(lockedFor === user.id);
  }, [user?.id]);

  const lock = useCallback(() => {
    if (user?.id) sessionStorage.setItem(STORAGE_KEY, user.id);
    setLocked(true);
  }, [user?.id]);

  const unlock = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setLocked(false);
  }, []);

  return (
    <LockContext.Provider value={{ locked, lock, unlock }}>
      {children}
    </LockContext.Provider>
  );
};

export const useScreenLock = () => {
  const ctx = useContext(LockContext);
  if (!ctx) throw new Error('useScreenLock must be used within LockProvider');
  return ctx;
};
