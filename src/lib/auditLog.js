// Audit logger — writes to Supabase audit_log table via db.js
// Usage: logAudit({ action, user, details })

import { writeAuditLog } from '@/lib/db';

export const logAudit = async ({ action, user, details = '' }) => {
  try {
    await writeAuditLog({
      action,
      userName: user?.name || user || 'System',
      userRole: user?.role || null,
      locationId: user?.locationId || null,
      orgId: user?.orgId || null,
      details,
    });
  } catch (e) {
    console.error('Audit log write failed:', e);
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
  CONSENT_CREATE: 'CONSENT_CREATE',
  CONSENT_STATUS: 'CONSENT_STATUS',
  ATTACHMENT_UPLOAD: 'ATTACHMENT_UPLOAD',
  RECORD_EXPORT: 'RECORD_EXPORT',
  NURSE_VITALS: 'NURSE_VITALS',
  APPOINTMENT_TAKEOVER: 'APPOINTMENT_TAKEOVER',
  APPOINTMENT_CANCEL: 'APPOINTMENT_CANCEL',
  DOCTOR_CLOCK_IN: 'DOCTOR_CLOCK_IN',
  DOCTOR_CLOCK_OUT: 'DOCTOR_CLOCK_OUT',
};
