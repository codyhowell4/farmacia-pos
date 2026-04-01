import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
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
  // Promise that resolves when profile fetch completes (used by login)
  const profilePromiseRef = useRef(null);

  // Fetch profile once and update state. Never called concurrently.
  const fetchAndSetProfile = useCallback(async (authUser) => {
    if (!authUser) {
      setUser(null);
      setLoading(false);
      return null;
    }
    if (fetchingRef.current) {
      // Return existing promise if already fetching
      return profilePromiseRef.current;
    }
    
    fetchingRef.current = true;
    setLoading(true);
    
    // Create a promise that resolves when fetch completes
    profilePromiseRef.current = (async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*, locations(name), organizations(name, slug)')
          .eq('id', authUser.id)
          .maybeSingle();

        if (error) {
          console.error('Profile fetch error:', error.message);
          setUser(null);
          return null;
        }

        if (!data) {
          // No profile yet (can happen briefly after signup trigger)
          setUser(null);
          return null;
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

        const shim = toUserShim(profile, authUser.email);
        setUser(shim);
        return shim;
      } catch (e) {
        console.error('fetchAndSetProfile caught:', e);
        setUser(null);
        return null;
      } finally {
        fetchingRef.current = false;
        setLoading(false);
      }
    })();
    
    return profilePromiseRef.current;
  }, []);

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
  }, [fetchAndSetProfile]);

  // login() calls signInWithPassword and waits for profile to be fetched
  const login = async (email, password) => {
    // Step 1: Sign in
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;

    // Step 2: Get the authenticated user
    const { data: { user: authUser }, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!authUser) throw new Error('No se pudo obtener el usuario autenticado.');

    // Step 3: Fetch profile and wait for it (with timeout)
    const shim = await Promise.race([
      fetchAndSetProfile(authUser),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Tiempo de espera agotado. Intenta de nuevo.')), 15000)
      ),
    ]);

    if (!shim) {
      throw new Error('Perfil no encontrado.');
    }

    // Step 4: Log audit event
    logAudit({
      action: AUDIT_ACTIONS.LOGIN,
      user: shim,
      details: `Inicio de sesión como ${shim.role}`,
    });

    return shim;
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
