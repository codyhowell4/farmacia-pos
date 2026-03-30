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
};
