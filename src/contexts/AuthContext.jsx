import React, { createContext, useContext, useState, useEffect } from 'react';
import { signIn, signOut, getSession, onAuthStateChange, getMyProfile, verifyAdminPin } from '@/lib/db';
import { logAudit, AUDIT_ACTIONS } from '@/lib/auditLog';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);       // Supabase auth user
  const [profile, setProfile] = useState(null); // Our profiles row
  const [loading, setLoading] = useState(true);

  const loadProfile = async () => {
    try {
      const p = await getMyProfile();
      setProfile(p);
      return p;
    } catch {
      setProfile(null);
      return null;
    }
  };

  useEffect(() => {
    // Restore session on mount
    getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadProfile().finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = onAuthStateChange(async (event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        await loadProfile();
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = async (email, password) => {
    const data = await signIn(email, password);
    const p = await loadProfile();
    if (p) {
      logAudit({
        action: AUDIT_ACTIONS.LOGIN,
        user: { name: p.full_name, role: p.role, pharmacyLocation: p.locations?.name },
        details: `Inicio de sesión como ${p.role}`,
      });
    }
    return p;
  };

  const logout = async () => {
    if (profile) {
      logAudit({
        action: AUDIT_ACTIONS.LOGOUT,
        user: { name: profile.full_name, role: profile.role },
        details: 'Sesión cerrada',
      });
    }
    await signOut();
    setProfile(null);
  };

  const checkAdminPin = async (pin) => {
    return verifyAdminPin(pin);
  };

  // Compatibility shim: components use user.name, user.role, user.pharmacyLocation
  // Map profile fields to that shape
  const userShim = profile ? {
    id: profile.id,
    name: profile.full_name,
    role: profile.role,
    pharmacyLocation: profile.locations?.name || profile.location_id,
    locationId: profile.location_id,
    orgId: profile.org_id,
    pin: profile.pin,
    email: profile.email,
  } : null;

  return (
    <AuthContext.Provider value={{
      user: userShim,
      profile,
      supabaseUser: user,
      loading,
      login,
      logout,
      verifyAdminPin: checkAdminPin,
      reloadProfile: loadProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
