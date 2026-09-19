// Audit logger — writes to Supabase audit_log table via db.js
// Usage: logAudit({ action, user, details })
// Callers fire-and-forget (no await). A failed write is retried once,
// then queued in localStorage and surfaced via the 'apolo:audit-failed'
// window event so a dropped audit entry is never silent.

import { writeAuditLog } from '@/lib/db';

const FAILED_QUEUE_KEY = 'audit_failed_queue';
const MAX_QUEUED_ENTRIES = 50;

const queueFailedAudit = (entry) => {
  try {
    const existing = JSON.parse(localStorage.getItem(FAILED_QUEUE_KEY) || '[]');
    const queue = Array.isArray(existing) ? existing : [];
    queue.push(entry);
    while (queue.length > MAX_QUEUED_ENTRIES) queue.shift(); // drop oldest
    localStorage.setItem(FAILED_QUEUE_KEY, JSON.stringify(queue));
  } catch { /* storage unavailable — nothing more we can do */ }
  window.dispatchEvent(new CustomEvent('apolo:audit-failed'));
};

export const logAudit = async ({ action, user, details = '' }) => {
  const payload = {
    action,
    userName: user?.name || user || 'System',
    userRole: user?.role || null,
    locationId: user?.locationId || null,
    orgId: user?.orgId || null,
    details,
  };
  // writeAuditLog returns its error instead of throwing; .catch covers throws
  let error = await writeAuditLog(payload).catch(e => e);
  if (error) {
    // One retry after a short pause — transient network blips are common
    await new Promise(resolve => setTimeout(resolve, 800));
    error = await writeAuditLog(payload).catch(e => e);
  }
  if (error) {
    console.error('Audit log write failed:', error);
    queueFailedAudit({
      action,
      user: payload.userName,
      details,
      at: new Date().toISOString(),
    });
  }
};

export const AUDIT_ACTIONS = {
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  SHIFT_OPEN: 'SHIFT_OPEN',
  SHIFT_CLOSE: 'SHIFT_CLOSE',
  SALE_COMPLETE: 'SALE_COMPLETE',
  SALE_VOID: 'SALE_VOID',
  PRICE_OVERRIDE: 'PRICE_OVERRIDE',
  INVENTORY_ADD: 'INVENTORY_ADD',
  INVENTORY_EDIT: 'INVENTORY_EDIT',
  INVENTORY_DELETE: 'INVENTORY_DELETE',
  DISCOUNT_ADD: 'DISCOUNT_ADD',
  DISCOUNT_DELETE: 'DISCOUNT_DELETE',
  USER_ADD: 'USER_ADD',
  USER_EDIT: 'USER_EDIT',
  USER_DELETE: 'USER_DELETE',
  RETURN_PROCESSED: 'RETURN_PROCESSED',
  PRESCRIPTION_ADDED: 'PRESCRIPTION_ADDED',
  PRESCRIPTION_VOIDED: 'PRESCRIPTION_VOIDED',
  // Clinical (NOM-024 audit registry)
  CLINICAL_NOTE_CREATE: 'CLINICAL_NOTE_CREATE',
  HISTORY_UPDATE: 'HISTORY_UPDATE',
  RECETA_CREATE: 'RECETA_CREATE',
  RECETA_CANCEL: 'RECETA_CANCEL',
  RECETA_SIGN: 'RECETA_SIGN',
  PRESCRIPTION_ALLERGY_OVERRIDE: 'PRESCRIPTION_ALLERGY_OVERRIDE',
  CONSENT_CREATE: 'CONSENT_CREATE',
  CONSENT_STATUS: 'CONSENT_STATUS',
  ATTACHMENT_UPLOAD: 'ATTACHMENT_UPLOAD',
  RECORD_EXPORT: 'RECORD_EXPORT',
  NURSE_VITALS: 'NURSE_VITALS',
  APPOINTMENT_TAKEOVER: 'APPOINTMENT_TAKEOVER',
  APPOINTMENT_CANCEL: 'APPOINTMENT_CANCEL',
  DOCTOR_CLOCK_IN: 'DOCTOR_CLOCK_IN',
  DOCTOR_CLOCK_OUT: 'DOCTOR_CLOCK_OUT',
  // Privacy (LFPDPPP ARCO register)
  ARCO_REQUEST_UPDATED: 'ARCO_REQUEST_UPDATED',
};
