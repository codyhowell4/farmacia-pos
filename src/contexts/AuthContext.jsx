import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { logAudit, AUDIT_ACTIONS } from '@/lib/auditLog';
import { verifyAdminPin } from '@/lib/db';

const AuthContext = createContext(null);

// Maps a raw profile DB row to the shape the rest of the app expects
const toUserShim = (profile, email) =>
  profile
    ? {
        id: profile.id,
        name: profile.full_name,
        role: profile.role,
        pharmacyLocation: profile.locations?.name || profile.location_id,
        locationId: profile.location_id,
        orgId: profile.org_id,
        pin: profile.pin,
        email: email || profile.email,
      }
    : null;

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // Guard: prevent concurrent profile fetches
  const fetchingRef = useRef(false);

  // Fetch profile once and update state. Never called concurrently.
  const fetchAndSetProfile = async (authUser) => {
    if (!authUser) {
      setUser(null);
      setLoading(false);
      return;
    }
    if (fetchingRef.current) return; // already in-flight
    fetchingRef.current = true;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*, locations(name), organizations(name, slug)')
        .eq('id', authUser.id)
        .maybeSingle();

      if (error) {
        console.error('Profile fetch error:', error.message);
        setUser(null);
        return;
      }

      if (!data) {
        // No profile yet (can happen briefly after signup trigger)
        setUser(null);
        return;
      }

      // If profile has no location_id yet, default to first location in org
      let profile = data;
      if (!profile.location_id && profile.org_id) {
        const { data: locs } = await supabase
          .from('locations')
          .select('id, name')
          .eq('org_id', profile.org_id)
          .limit(1);
        if (locs?.length) {
          profile = {
            ...profile,
            location_id: locs[0].id,
            locations: { name: locs[0].name },
          };
        }
      }

      setUser(toUserShim(profile, authUser.email));
    } catch (e) {
      console.error('fetchAndSetProfile caught:', e);
      setUser(null);
    } finally {
      fetchingRef.current = false;
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    // 1. Check for an existing session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      fetchAndSetProfile(session?.user ?? null);
    });

    // 2. Listen for future auth events (sign-in, sign-out, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;
        if (event === 'SIGNED_OUT') {
          setUser(null);
          setLoading(false);
          return;
        }
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          await fetchAndSetProfile(session?.user ?? null);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // login() just calls signInWithPassword. onAuthStateChange handles profile loading.
  // Returns a Promise that resolves to the user shim once the profile is loaded.
  const login = (email, password) => {
    return new Promise(async (resolve, reject) => {
      try {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        // Wait for onAuthStateChange → fetchAndSetProfile to complete
        // by polling the state (max 15s)
        const start = Date.now();
        const poll = setInterval(() => {
          if (fetchingRef.current) return; // still loading
          clearInterval(poll);
          // Read the latest user from state via a fresh session call
          supabase.auth.getUser().then(({ data: { user: au } }) => {
            if (!au) return reject(new Error('No se pudo cargar el perfil.'));
            supabase
              .from('profiles')
              .select('*, locations(name)')
              .eq('id', au.id)
              .maybeSingle()
              .then(({ data }) => {
                if (!data) return reject(new Error('Perfil no encontrado.'));
                const shim = toUserShim(data, au.email);
                logAudit({
                  action: AUDIT_ACTIONS.LOGIN,
                  user: shim,
                  details: `Inicio de sesión como ${shim.role}`,
                });
                resolve(shim);
              });
          });
          if (Date.now() - start > 15000) {
            clearInterval(poll);
            reject(new Error('Tiempo de espera agotado. Intenta de nuevo.'));
          }
        }, 200);
      } catch (e) {
        reject(e);
      }
    });
  };

  const logout = async () => {
    if (user) {
      logAudit({
        action: AUDIT_ACTIONS.LOGOUT,
        user,
        details: 'Sesión cerrada',
      });
    }
    setUser(null);
    await supabase.auth.signOut();
  };

  const checkAdminPin = (pin) => verifyAdminPin(pin);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile: user, // backward-compat alias
        loading,
        login,
        logout,
        verifyAdminPin: checkAdminPin,
        reloadProfile: () =>
          supabase.auth.getUser().then(({ data: { user: au } }) =>
            fetchAndSetProfile(au)
          ),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
