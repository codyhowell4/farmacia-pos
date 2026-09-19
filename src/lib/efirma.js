// ============================================================
// efirma.js — e.firma (FIEL) session handling + receta signing
// ============================================================
// The doctor's .cer/.key files are stored once in the doctor_efirma table (the
// .key stays encrypted with the doctor's own SAT password). The password is
// never persisted — it lives only in the tab's sessionStorage, so recetas can
// be auto-signed while the doctor works and the stored key is useless without
// it.

import { supabase } from '@/lib/supabase';
import { signPrescription, getMyEfirma } from '@/lib/db';
import { buildRecetaCadena } from '@/lib/cda';

const storageKey = (userId) => `efirma_pw_${userId}`;

export const setEfirmaSessionPassword = (userId, password) => {
  try { sessionStorage.setItem(storageKey(userId), password); } catch { /* private mode */ }
};

export const getEfirmaSessionPassword = (userId) => {
  try { return sessionStorage.getItem(storageKey(userId)) || ''; } catch { return ''; }
};

export const clearEfirmaSessionPassword = (userId) => {
  try { sessionStorage.removeItem(storageKey(userId)); } catch { /* ignore */ }
};

// `efirmaRow` is a doctor_efirma row ({ cer_base64, key_base64, ... }) or null.
export const hasStoredEfirma = (efirmaRow) =>
  !!(efirmaRow?.cer_base64 && efirmaRow?.key_base64);

// Reads a File as a base64 string (without the data: URL prefix).
export const readFileAsBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });

const invokeSignDocument = async ({ cer_base64, key_base64, password, payload }) => {
  const { data, error } = await supabase.functions.invoke('sign-document', {
    body: { cer_base64, key_base64, password, payload },
  });
  if (error) {
    let message = 'No se pudo firmar con la e.firma';
    try {
      const body = await error?.context?.json();
      message = body?.error || body?.message || message;
    } catch { /* keep default message */ }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
};

// Validates files + password by signing a throwaway payload. Returns the cert
// serial on success; throws a readable error (wrong password, bad files).
export const validateEfirma = async ({ cer_base64, key_base64, password }) => {
  const data = await invokeSignDocument({
    cer_base64,
    key_base64,
    password,
    payload: `VALIDACION|${new Date().toISOString()}`,
  });
  return data?.cert_serial || '';
};

// Signs a receta with the given files + password and persists the signature
// on the prescription row. `efirmaFiles` is a doctor_efirma row (or an ad-hoc
// { cer_base64, key_base64 } pair for one-off signing).
export const signRecetaWithPassword = async (prescription, customer, efirmaFiles, password) => {
  const cadena = buildRecetaCadena(prescription, customer);
  const data = await invokeSignDocument({
    cer_base64: efirmaFiles.cer_base64,
    key_base64: efirmaFiles.key_base64,
    password,
    payload: cadena,
  });
  await signPrescription(prescription.id, {
    signed_payload: cadena,
    signature: data.signature_base64,
    signer_cert_serial: data.cert_serial,
    signed_at: new Date().toISOString(),
  });
  return data;
};

// Auto-sign at receta creation: only when the doctor has stored files AND an
// unlocked session password. Returns true when the receta was signed.
// (The doctorProfile param is kept for caller compatibility but ignored — the
// efirma row is fetched straight from doctor_efirma.)
export const tryAutoSignReceta = async (prescription, customer, doctorProfile, userId) => {
  if (!prescription?.id || !userId) return false;
  const password = getEfirmaSessionPassword(userId);
  if (!password) return false;
  const efirma = await getMyEfirma();
  if (!hasStoredEfirma(efirma)) return false;
  await signRecetaWithPassword(prescription, customer, efirma, password);
  return true;
};
