// Datos fiscales/sanitarios de la organización para el encabezado del ticket
// (RFC, aviso de funcionamiento, responsable sanitario). Se leen de la fila
// `organizations` y se cachean en memoria + localStorage; si la consulta
// falla (offline / RLS) se devuelve lo último cacheado o vacío.

import { supabase } from '@/lib/supabase';

const CACHE_KEY = 'apollo_org_info';
let memoryCache = null;

const readStorageCache = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

// Org pública por env (mismo valor que usa el registro de membresías); si no
// está configurada, cae a la org del perfil autenticado.
export const resolveOrgId = async () => {
  const envOrgId = import.meta.env.VITE_PUBLIC_ORG_ID;
  if (envOrgId) return envOrgId;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase.from('profiles').select('org_id').eq('id', user.id).single();
    return data?.org_id || null;
  } catch {
    return null;
  }
};

export const getOrgInfo = async () => {
  if (memoryCache) return memoryCache;
  const cached = readStorageCache();
  try {
    const orgId = await resolveOrgId();
    if (!orgId) return cached || {};
    const { data, error } = await supabase
      .from('organizations')
      .select('name, rfc, aviso_funcionamiento, responsable_sanitario')
      .eq('id', orgId)
      .single();
    if (error) throw error;
    memoryCache = {
      name: data?.name || '',
      rfc: data?.rfc || '',
      aviso_funcionamiento: data?.aviso_funcionamiento || '',
      responsable_sanitario: data?.responsable_sanitario || '',
    };
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(memoryCache)); } catch { /* storage no disponible */ }
    return memoryCache;
  } catch {
    return cached || {};
  }
};

// Llamar después de guardar cambios en Admin → Configuración para que el
// siguiente ticket lea los datos frescos.
export const clearOrgInfoCache = () => {
  memoryCache = null;
  try { localStorage.removeItem(CACHE_KEY); } catch { /* storage no disponible */ }
};
