// ============================================================
// js/supabase.js - Supabase Client Initialization
// ============================================================
// Initializes the Supabase client for connecting to the
// farmacia-pos backend. Attach credentials below.
//
// When credentials are missing or the CDN fails to load,
// window.farmaciaSupabase is set to null and the app
// continues working with localStorage.
// ============================================================

const SUPABASE_CONFIG = {
  URL: 'https://ieinjhonepkudxxpmuly.supabase.co',
  ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllaW5qaG9uZXBrdWR4eHBtdWx5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3NDc2MzgsImV4cCI6MjA5MDMyMzYzOH0.Zc79127QCi3VcrK_WYWv_-cQdBtpweYqTt3zziMJBno',
  DEFAULT_ORG_ID: '718f51b5-dc67-4f70-8aa9-1a315cd1deeb'
};

// Expose config globally so API layer can read DEFAULT_ORG_ID
window.farmaciaSupabaseConfig = SUPABASE_CONFIG;

(function initSupabase() {
  // 1. Verify the CDN library loaded
  if (typeof supabase === 'undefined' || typeof supabase.createClient !== 'function') {
    console.log('[Supabase] Disabled - CDN library not loaded');
    window.farmaciaSupabase = null;
    return;
  }

  // 2. Verify credentials are configured
  if (!SUPABASE_CONFIG.URL || !SUPABASE_CONFIG.ANON_KEY) {
    console.log('[Supabase] Disabled - credentials not configured (update SUPABASE_CONFIG in js/supabase.js)');
    window.farmaciaSupabase = null;
    return;
  }

  // 3. Create client
  try {
    window.farmaciaSupabase = supabase.createClient(
      SUPABASE_CONFIG.URL,
      SUPABASE_CONFIG.ANON_KEY,
      {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true
        }
      }
    );
    console.log('[Supabase] Initialized');
  } catch (err) {
    console.error('[Supabase] Initialization failed:', err);
    window.farmaciaSupabase = null;
  }
})();
