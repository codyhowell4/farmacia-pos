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
  // Core state - separated concerns
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isReady, setIsReady] = useState(false);
  
  // For login to wait on auth state change
  const loginResolveRef = useRef(null);
  const loginTimeoutRef = useRef(null);
  
  // Guard to prevent concurrent auth operations
  const isProcessingAuth = useRef(false);

  // Fetch profile with retry logic (for trigger delays)
  const fetchProfileWithRetry = useCallback(async (authUser, maxRetries = 3) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*, locations(name), organizations(name, slug)')
          .eq('id', authUser.id)
          .maybeSingle();

        if (error) {
          console.error(`Profile fetch attempt ${attempt} failed:`, error.message);
          if (attempt === maxRetries) return null;
          // Wait before retry (exponential backoff)
          await new Promise(r => setTimeout(r, 300 * attempt));
          continue;
        }

        if (!data) {
          console.log(`No profile found on attempt ${attempt}`);
          if (attempt === maxRetries) return null;
          await new Promise(r => setTimeout(r, 300 * attempt));
          continue;
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

        return toUserShim(profile, authUser.email);
      } catch (e) {
        console.error(`Profile fetch exception on attempt ${attempt}:`, e);
        if (attempt === maxRetries) return null;
        await new Promise(r => setTimeout(r, 300 * attempt));
      }
    }
    return null;
  }, []);

  // Main auth state listener
  useEffect(() => {
    let mounted = true;
    let subscription;

    // Handle auth state changes
    const handleAuthChange = async (event, newSession) => {
      if (!mounted) return;
      
      // Skip if we're already processing auth in login function
      if (isProcessingAuth.current && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
        console.log('Auth state change skipped - login in progress');
        return;
      }

      console.log('Auth state changed:', event);
      setSession(newSession);

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (newSession?.user) {
          const userProfile = await fetchProfileWithRetry(newSession.user);
          setProfile(userProfile);
          
          // Resolve any waiting login promise
          if (loginResolveRef.current) {
            loginResolveRef.current(userProfile);
            loginResolveRef.current = null;
          }
        }
      } else if (event === 'SIGNED_OUT') {
        setProfile(null);
        setSession(null);
      }

      setIsReady(true);
    };

    // Set up listener
    const setupListener = async () => {
      const { data } = supabase.auth.onAuthStateChange(handleAuthChange);
      subscription = data.subscription;

      // Check for existing session
      const { data: { session: existingSession } } = await supabase.auth.getSession();
      
      if (!mounted) return;

      if (existingSession) {
        setSession(existingSession);
        const userProfile = await fetchProfileWithRetry(existingSession.user);
        setProfile(userProfile);
      }
      
      if (mounted) {
        setIsReady(true);
      }
    };

    setupListener();

    return () => {
      mounted = false;
      if (subscription) subscription.unsubscribe();
      if (loginTimeoutRef.current) clearTimeout(loginTimeoutRef.current);
    };
  }, [fetchProfileWithRetry]);

  // Login function - directly fetches profile after sign in (more reliable than waiting for event)
  const login = async (email, password) => {
    // Prevent concurrent auth operations
    if (isProcessingAuth.current) {
      throw new Error('Otra operación de inicio de sesión está en progreso.');
    }
    
    isProcessingAuth.current = true;
    
    try {
      // Step 1: Sign in
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ 
        email, 
        password 
      });
      
      if (signInError) throw signInError;
      if (!signInData?.user) throw new Error('No se pudo obtener el usuario.');

      // Step 2: Directly fetch profile (don't rely on onAuthStateChange - it's unreliable)
      const userProfile = await fetchProfileWithRetry(signInData.user);

      if (!userProfile) {
        // Sign out since we couldn't get the profile
        await supabase.auth.signOut();
        throw new Error('Perfil no encontrado. Contacta al administrador.');
      }

      // Step 3: Update local state (since we bypassed the event listener)
      setSession(signInData.session);
      setProfile(userProfile);

      // Step 4: Log successful login
      logAudit({
        action: AUDIT_ACTIONS.LOGIN,
        user: userProfile,
        details: `Inicio de sesión como ${userProfile.role}`,
      });

      return userProfile;
    } finally {
      // Always reset the flag
      isProcessingAuth.current = false;
    }
  };

  // Logout function
  const logout = async () => {
    if (profile) {
      logAudit({
        action: AUDIT_ACTIONS.LOGOUT,
        user: profile,
        details: 'Sesión cerrada',
      });
    }
    
    setProfile(null);
    setSession(null);
    await supabase.auth.signOut();
  };

  // Reset password - send email
  const resetPassword = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw error;
  };

  // Update password (when user is already authenticated or has recovery token)
  const updatePassword = async (newPassword) => {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });
    if (error) throw error;
  };

  const checkAdminPin = (pin) => verifyAdminPin(pin);

  // Derived user object (for backward compatibility)
  const user = profile;

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        session,
        isReady,
        loading: !isReady, // backward compat
        login,
        logout,
        resetPassword,
        updatePassword,
        verifyAdminPin: checkAdminPin,
        reloadProfile: async () => {
          const { data: { user: authUser } } = await supabase.auth.getUser();
          if (authUser) {
            const refreshed = await fetchProfileWithRetry(authUser);
            setProfile(refreshed);
            return refreshed;
          }
          return null;
        },
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
