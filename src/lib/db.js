// ============================================================
// db.js — All Supabase data operations in one place
// Each function maps 1:1 to what was previously a localStorage call
// ============================================================
import { supabase } from './supabase';
import { createClient } from '@supabase/supabase-js';


// ── helpers ─────────────────────────────────────────────────

const getOrgId = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');
  const { data } = await supabase.from('profiles').select('org_id').eq('id', user.id).single();
  return data?.org_id;
};

// ── AUTH ────────────────────────────────────────────────────

export const signIn = async (email, password) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

export const getSession = () => supabase.auth.getSession();

export const onAuthStateChange = (cb) => supabase.auth.onAuthStateChange(cb);

export const getMyProfile = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('*, locations(name), organizations(name, slug)')
    .eq('id', user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { ...data, email: user.email };
};

// ── LOCATIONS ───────────────────────────────────────────────

export const getLocations = async () => {
  const orgId = await getOrgId();
  const { data, error } = await supabase.from('locations').select('*').eq('org_id', orgId).order('name');
  if (error) throw error;
  return data;
};

// ── PROFILES / USERS ─────────────────────────────────────────

export const getUsers = async () => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*, locations(name)')
    .order('full_name');
  if (error) throw error;
  return data;
};

export const createUser = async ({ email, password, full_name, role, location_id, pin }) => {
  const adminOrgId = await getOrgId();

  // Step 1: Create the Supabase auth user using a temporary client
  // (so we don't sign out the current admin)
  const tempSupabase = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data: authData, error: authError } = await tempSupabase.auth.signUp({
    email,
    password,
    options: { data: { full_name } },
  });

  if (authError) throw authError;
  if (!authData.user) throw new Error('No se pudo crear el usuario en Auth.');

  const newUserId = authData.user.id;

  // Step 2: Upsert the profile row directly.
  // Using upsert handles both: the trigger already created a bare row OR it hasn't fired yet.
  // We use the admin's existing session which has permission via admin_profiles_all policy.
  const { data, error: profileError } = await supabase
    .from('profiles')
    .upsert({
      id: newUserId,
      full_name,
      email,
      role,
      location_id: location_id || null,
      org_id: adminOrgId,
      pin: pin || null,
    }, { onConflict: 'id' })
    .select()
    .single();

  if (profileError) throw profileError;
  return data;
};

export const updateProfile = async (id, updates) => {
  const { data, error } = await supabase.from('profiles').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data;
};

export const deleteProfile = async (id) => {
  const { error } = await supabase.from('profiles').delete().eq('id', id);
  if (error) throw error;
};

export const verifyAdminPin = async (pin) => {
  const orgId = await getOrgId();
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('org_id', orgId)
    .eq('role', 'admin')
    .eq('pin', pin)
    .single();
  return data || null;
};

// ── INVENTORY ───────────────────────────────────────────────

export const getInventory = async (locationId = null) => {
  let query = supabase.from('inventory').select('*').order('name');
  if (locationId) query = query.eq('location_id', locationId);
  const { data, error } = await query;
  if (error) throw error;
  return data;
};

export const upsertInventoryItem = async (item) => {
  const orgId = await getOrgId();
  const { data: { user } } = await supabase.auth.getUser();
  
  // Enforce barcode uniqueness within the organization
  if (item.barcode) {
    const { data: existing, error: lookupError } = await supabase
      .from('inventory')
      .select('id, name')
      .eq('org_id', orgId)
      .eq('barcode', item.barcode)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (existing && existing.id !== item.id) {
      throw new Error(`El código de barras "${item.barcode}" ya está asignado a "${existing.name}". Usa un código diferente.`);
    }
  }
  
  // If editing, check for quantity change to log movement
  let prevQty = 0;
  let isNew = true;
  if (item.id) {
    const { data: existing } = await supabase
      .from('inventory')
      .select('quantity')
      .eq('id', item.id)
      .single();
    if (existing) {
      prevQty = existing.quantity || 0;
      isNew = false;
    }
  }
  
  const { data, error } = await supabase
    .from('inventory')
    .upsert({ ...item, org_id: orgId, updated_at: new Date().toISOString() })
    .select().single();
  if (error) throw error;
  
  // Log movement if quantity changed on edit
  if (!isNew && item.quantity !== undefined && item.quantity !== prevQty) {
    await logInventoryMovement({
      inventory_id: item.id,
      type: 'edit',
      quantity_change: item.quantity - prevQty,
      previous_quantity: prevQty,
      new_quantity: item.quantity,
      reference_id: item.id,
      reference_type: 'inventory_edit',
      user_name: user?.email,
      reason: `Edición de producto: ${item.name}`,
    });
  }
  
  return data;
};

export const deleteInventoryItem = async (id) => {
  const { error } = await supabase.from('inventory').delete().eq('id', id);
  if (error) throw error;
};

export const logInventoryMovement = async (movement) => {
  try {
    const orgId = await getOrgId();
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('inventory_movements').insert({
      ...movement,
      org_id: orgId,
      user_name: movement.user_name || user?.email,
    });
    if (error) {
      console.error('[logInventoryMovement] insert error:', error);
      throw error;
    }
  } catch (err) {
    console.error('[logInventoryMovement] failed:', err);
    throw err;
  }
};

export const getInventoryMovements = async (inventoryId) => {
  const { data, error } = await supabase
    .from('inventory_movements')
    .select('*')
    .eq('inventory_id', inventoryId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
};

export const decrementInventory = async (items, referenceId = null, referenceType = 'sale') => {
  // items: [{ inventory_id, quantity, name }] - inventory_id is the FK to inventory table
  for (const item of items) {
    const inventoryId = item.inventory_id || item.id;
    if (!inventoryId) {
      console.error('[decrementInventory] No inventory_id found for item:', item);
      continue;
    }
    
    // Get current quantity before decrementing
    const { data: current, error: fetchError } = await supabase.from('inventory').select('quantity, sales_count').eq('id', inventoryId).single();
    if (fetchError) {
      console.error('[decrementInventory] Failed to fetch current inventory:', fetchError);
      continue;
    }
    const prevQty = current?.quantity || 0;
    
    const { error } = await supabase.rpc('decrement_inventory', {
      p_id: inventoryId,
      p_qty: item.quantity,
    });
    
    if (error) {
      console.error('[decrementInventory] RPC decrement_inventory failed:', error);
      // Fallback: manual update
      const newQty = Math.max(0, prevQty - item.quantity);
    const { error: updateError } = await supabase.from('inventory').update({
        quantity: newQty,
        sales_count: (current?.sales_count || 0) + item.quantity,
        updated_at: new Date().toISOString(),
      }).eq('id', inventoryId);
      if (updateError) {
        console.error('[decrementInventory] Failed to update inventory:', updateError);
        continue;
      }
    }
    
    // Log movement
    console.log('[decrementInventory] Logging movement:', { inventoryId, referenceType, referenceId, qty: item.quantity });
    try {
      await logInventoryMovement({
        inventory_id: inventoryId,
        type: referenceType,
        quantity_change: -item.quantity,
        previous_quantity: prevQty,
        new_quantity: newQty,
        reference_id: referenceId,
        reference_type: referenceType,
        reason: item.name || referenceType,
      });
      console.log('[decrementInventory] Movement logged successfully');
    } catch (logErr) {
      console.error('[decrementInventory] Failed to log movement:', logErr);
      // Do not throw — sale should succeed even if audit logging fails
    }
  }
};

export const incrementInventory = async (items, referenceId = null, referenceType = 'return') => {
  // items: [{ inventory_id, returnQty, name }] - for returns/voids
  for (const item of items) {
    const inventoryId = item.inventory_id || item.id;
    const qty = item.returnQty || item.quantity || 0;
    if (!inventoryId) {
      console.error('[incrementInventory] No inventory_id found for item:', item);
      continue;
    }
    
    const { data: current, error: fetchError } = await supabase.from('inventory').select('quantity, sales_count').eq('id', inventoryId).single();
    if (fetchError) {
      console.error('[incrementInventory] Failed to fetch current inventory:', fetchError);
      continue;
    }
    
    const prevQty = current?.quantity || 0;
    const newQty = prevQty + qty;
    
    const { error: updateError } = await supabase.from('inventory').update({
      quantity: newQty,
      sales_count: Math.max(0, (current?.sales_count || 0) - qty),
      updated_at: new Date().toISOString(),
    }).eq('id', inventoryId);
    
    if (updateError) {
      console.error('[incrementInventory] Failed to update inventory:', updateError);
      continue;
    }
    
    // Log movement
    console.log('[incrementInventory] Logging movement:', { inventoryId, referenceType, referenceId, qty });
    try {
      await logInventoryMovement({
        inventory_id: inventoryId,
        type: referenceType,
        quantity_change: qty,
        previous_quantity: prevQty,
        new_quantity: newQty,
        reference_id: referenceId,
        reference_type: referenceType,
        reason: item.name || referenceType,
      });
      console.log('[incrementInventory] Movement logged successfully');
    } catch (logErr) {
      console.error('[incrementInventory] Failed to log movement:', logErr);
      // Do not throw — return/void should succeed even if audit logging fails
    }
  }
};

// ── DISCOUNTS ───────────────────────────────────────────────

export const getDiscounts = async () => {
  const { data, error } = await supabase.from('discounts').select('*').order('code');
  if (error) throw error;
  return data;
};

export const createDiscount = async (discount) => {
  const orgId = await getOrgId();
  const { data, error } = await supabase.from('discounts').insert({ ...discount, org_id: orgId }).select().single();
  if (error) throw error;
  return data;
};

export const deleteDiscount = async (id) => {
  const { error } = await supabase.from('discounts').delete().eq('id', id);
  if (error) throw error;
};

export const findDiscount = async (code) => {
  const { data } = await supabase.from('discounts').select('*').ilike('code', code).single();
  return data || null;
};

// ── SHIFTS ──────────────────────────────────────────────────

export const getOpenShift = async (profileId, locationId) => {
  // Find ANY open shift at this location, not just one opened by the current user.
  // This allows different cashiers to close each other's shifts.
  const { data, error } = await supabase
    .from('shifts')
    .select('*')
    .eq('location_id', locationId)
    .eq('status', 'open')
    .order('opened_at', { ascending: false })
    .maybeSingle();
  if (error) {
    console.error('[getOpenShift] error:', error);
    return null;
  }
  return data || null;
};

export const createShift = async (shift) => {
  const orgId = await getOrgId();
  const { data, error } = await supabase.from('shifts').insert({ ...shift, org_id: orgId }).select().single();
  if (error) throw error;
  return data;
};

export const closeShiftDb = async (id, updates) => {
  const { data, error } = await supabase.from('shifts').update({ ...updates, status: 'closed' }).eq('id', id).select().single();
  if (error) throw error;
  return data;
};

export const getShifts = async () => {
  const { data, error } = await supabase.from('shifts').select('*, locations(name)').order('opened_at', { ascending: false });
  if (error) throw error;
  return data;
};

// ── SALES ───────────────────────────────────────────────────

export const createSale = async (sale, items) => {
  const orgId = await getOrgId();
  const { data: saleRow, error } = await supabase
    .from('sales')
    .insert({ ...sale, org_id: orgId })
    .select().single();
  if (error) throw error;

  if (items?.length) {
    const { error: itemsError } = await supabase.from('sale_items').insert(
      items.map(i => ({ ...i, sale_id: saleRow.id }))
    );
    if (itemsError) throw itemsError;
  }

  await decrementInventory(items || [], saleRow.id, 'sale');
  return saleRow;
};

export const getSales = async () => {
  const { data, error } = await supabase
    .from('sales')
    .select('*, sale_items(*), customers(id, full_name, phone, curp, email, profile_id)')
    .order('timestamp', { ascending: false });
  if (error) throw error;
  return data;
};

export const getRecentSales = async (locationId, limit = 10) => {
  const { data, error } = await supabase
    .from('sales')
    .select('*, sale_items(*)')
    .eq('location_id', locationId)
    .eq('voided', false)
    .order('timestamp', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
};

export const getSalesInRange = async (startDate, endDate) => {
  const { data, error } = await supabase
    .from('sales')
    .select('*, sale_items(*)')
    .eq('voided', false)
    .gte('timestamp', startDate)
    .lte('timestamp', endDate + 'T23:59:59')
    .order('timestamp', { ascending: false });
  if (error) throw error;
  return data || [];
};

export const voidSale = async (saleId, voidedByName) => {
  const { data: sale, error: fetchError } = await supabase
    .from('sales')
    .select('*, sale_items(*)')
    .eq('id', saleId)
    .single();
  if (fetchError) throw fetchError;
  if (sale.voided) throw new Error('Venta ya fue anulada');

  await incrementInventory(
    sale.sale_items.map(i => ({ ...i, returnQty: i.quantity })),
    saleId,
    'void'
  );

  const { error } = await supabase.from('sales').update({
    voided: true,
    voided_by: voidedByName,
    voided_at: new Date().toISOString(),
  }).eq('id', saleId);
  if (error) throw error;
};

// ── RETURNS ─────────────────────────────────────────────────

export const createReturn = async (returnRecord, items) => {
  const orgId = await getOrgId();
  const { data: ret, error } = await supabase
    .from('returns')
    .insert({ ...returnRecord, org_id: orgId })
    .select().single();
  if (error) throw error;

  if (items?.length) {
    await supabase.from('return_items').insert(items.map(i => ({ ...i, return_id: ret.id })));
  }

  await incrementInventory(items || [], ret.id, 'return');
  return ret;
};

export const getReturnsBySaleId = async (saleId) => {
  const { data } = await supabase
    .from('returns')
    .select('*, return_items(*)')
    .eq('original_sale_id', saleId);
  return data || [];
};

// ── SUPPLIERS ───────────────────────────────────────────────

export const getSuppliers = async () => {
  const { data, error } = await supabase.from('suppliers').select('*').order('name');
  if (error) throw error;
  return data;
};

export const upsertSupplier = async (supplier) => {
  const orgId = await getOrgId();
  const { data, error } = await supabase
    .from('suppliers')
    .upsert({ ...supplier, org_id: orgId })
    .select().single();
  if (error) throw error;
  return data;
};

export const deleteSupplier = async (id) => {
  const { error } = await supabase.from('suppliers').delete().eq('id', id);
  if (error) throw error;
};

// ── PURCHASE ORDERS ─────────────────────────────────────────

export const getPurchaseOrders = async () => {
  const { data, error } = await supabase
    .from('purchase_orders')
    .select('*, purchase_order_items(*), suppliers(name)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
};

export const createPurchaseOrder = async (po, items) => {
  const orgId = await getOrgId();
  const { data: poRow, error } = await supabase
    .from('purchase_orders')
    .insert({ ...po, org_id: orgId })
    .select().single();
  if (error) throw error;

  if (items?.length) {
    await supabase.from('purchase_order_items').insert(items.map(i => ({ ...i, po_id: poRow.id })));
  }
  return poRow;
};

export const updatePurchaseOrder = async (poId, updates, items) => {
  // Update PO header
  const { data: poRow, error } = await supabase
    .from('purchase_orders')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', poId)
    .select().single();
  if (error) throw error;

  // Replace items: delete old, insert new
  if (items) {
    await supabase.from('purchase_order_items').delete().eq('po_id', poId);
    if (items.length) {
      await supabase.from('purchase_order_items').insert(items.map(i => ({ ...i, po_id: poId })));
    }
  }
  return poRow;
};

export const receivePurchaseOrder = async (poId) => {
  const { data: po, error } = await supabase
    .from('purchase_orders')
    .select('*, purchase_order_items(*)')
    .eq('id', poId)
    .single();
  if (error) throw error;

  // Increment inventory for matching items by name
  for (const item of po.purchase_order_items) {
    const { data: inv } = await supabase
      .from('inventory')
      .select('id, quantity, name')
      .ilike('name', item.medicine_name)
      .single();
    if (inv) {
      const newQty = inv.quantity + item.quantity;
      await supabase.from('inventory').update({
        quantity: newQty,
        cost: item.unit_cost,
        updated_at: new Date().toISOString(),
      }).eq('id', inv.id);
      
      // Log purchase movement
      await logInventoryMovement({
        inventory_id: inv.id,
        type: 'purchase',
        quantity_change: item.quantity,
        previous_quantity: inv.quantity,
        new_quantity: newQty,
        reference_id: poId,
        reference_type: 'purchase_order',
        reason: `Recepción OC: ${item.medicine_name}`,
      });
    }
  }

  const { data: updated, error: updateError } = await supabase
    .from('purchase_orders')
    .update({ status: 'received', received_at: new Date().toISOString() })
    .eq('id', poId)
    .select().single();
  if (updateError) throw updateError;
  return updated;
};

// ── AUDIT LOG ───────────────────────────────────────────────

export const writeAuditLog = async ({ action, userName, userRole, locationId, details, orgId }) => {
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from('audit_log').insert({
    org_id: orgId,
    user_id: user?.id || null,
    user_name: userName,
    user_role: userRole,
    location_id: locationId || null,
    action,
    details,
  });
};

export const getAuditLog = async () => {
  const { data, error } = await supabase
    .from('audit_log')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(2000);
  if (error) throw error;
  return data;
};

// ── INVENTORY BATCH MANAGEMENT ───────────────────────────────

export const getInventoryWithBatches = async (locationId = null) => {
  let query = supabase
    .from('inventory')
    .select('*, suppliers(name)')
    .order('expiration_date', { ascending: true })
    .order('created_at', { ascending: true });
  
  if (locationId) query = query.eq('location_id', locationId);
  
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
};

export const addInventoryBatch = async (batch) => {
  const orgId = await getOrgId();
  const { data, error } = await supabase
    .from('inventory')
    .insert({ ...batch, org_id: orgId })
    .select()
    .single();
  if (error) throw error;
  return data;
};

// ── STOCK ADJUSTMENTS ────────────────────────────────────────

export const createStockAdjustment = async (adjustment) => {
  const orgId = await getOrgId();
  const { data: { user } } = await supabase.auth.getUser();
  
  // Get current profile for name
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single();
  
  const { data, error } = await supabase
    .from('stock_adjustments')
    .insert({
      ...adjustment,
      org_id: orgId,
      adjusted_by: user?.id,
      adjusted_by_name: profile?.full_name || user?.email,
    })
    .select()
    .single();
  
  if (error) throw error;
  
  // Update inventory quantity
  const { error: updateError } = await supabase
    .from('inventory')
    .update({ 
      quantity: adjustment.new_quantity,
      updated_at: new Date().toISOString(),
    })
    .eq('id', adjustment.inventory_id);
  
  if (updateError) throw updateError;
  
  // Log unified movement
  await logInventoryMovement({
    inventory_id: adjustment.inventory_id,
    type: 'adjustment',
    quantity_change: adjustment.new_quantity - adjustment.previous_quantity,
    previous_quantity: adjustment.previous_quantity,
    new_quantity: adjustment.new_quantity,
    reference_id: data?.id,
    reference_type: 'stock_adjustment',
    user_name: profile?.full_name || user?.email,
    reason: adjustment.reason,
  });
  
  return data;
};

export const getStockAdjustments = async (inventoryId = null) => {
  let query = supabase
    .from('stock_adjustments')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (inventoryId) query = query.eq('inventory_id', inventoryId);
  
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
};

// ── TAX SETTINGS ─────────────────────────────────────────────

export const getTaxSettingsDb = async () => {
  const orgId = await getOrgId();
  const { data } = await supabase.from('tax_settings').select('*').eq('org_id', orgId).single();
  return data || { iva_enabled: true, iva_rate: 16 };
};

export const saveTaxSettingsDb = async (settings) => {
  const orgId = await getOrgId();
  const { error } = await supabase
    .from('tax_settings')
    .upsert({
      org_id: orgId,
      iva_enabled: settings.ivaEnabled,
      iva_rate: settings.ivaRate,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'org_id' });
  if (error) throw error;
};

// ── BANK ACCOUNTS ────────────────────────────────────────────

export const getBankAccounts = async () => {
  const { data, error } = await supabase
    .from('bank_accounts')
    .select('*')
    .eq('is_active', true)
    .order('is_default', { ascending: false });
  if (error) throw error;
  return data || [];
};

export const createBankAccount = async (account) => {
  const orgId = await getOrgId();
  
  // If this is the first account or marked as default, handle defaults
  if (account.is_default) {
    await supabase.from('bank_accounts')
      .update({ is_default: false })
      .eq('org_id', orgId);
  }
  
  const { data, error } = await supabase
    .from('bank_accounts')
    .insert({ ...account, org_id: orgId })
    .select().single();
  if (error) throw error;
  return data;
};

export const updateBankAccount = async (id, updates) => {
  const orgId = await getOrgId();
  
  // Handle default flag
  if (updates.is_default) {
    await supabase.from('bank_accounts')
      .update({ is_default: false })
      .eq('org_id', orgId);
  }
  
  const { data, error } = await supabase
    .from('bank_accounts')
    .update(updates)
    .eq('id', id)
    .select().single();
  if (error) throw error;
  return data;
};

export const deleteBankAccount = async (id) => {
  const { error } = await supabase
    .from('bank_accounts')
    .update({ is_active: false })
    .eq('id', id);
  if (error) throw error;
};

// ── SPLIT PAYMENTS ───────────────────────────────────────────

export const createSaleWithPayments = async (sale, items, payments) => {
  const orgId = await getOrgId();
  
  // Create the sale
  const { data: saleRow, error } = await supabase
    .from('sales')
    .insert({ ...sale, org_id: orgId, is_split_payment: payments.length > 1 })
    .select().single();
  if (error) throw error;

  // Create sale items
  if (items?.length) {
    const { error: itemsError } = await supabase.from('sale_items').insert(
      items.map(i => ({ ...i, sale_id: saleRow.id }))
    );
    if (itemsError) throw itemsError;
  }

  // Create payment records
  if (payments?.length) {
    const { error: paymentsError } = await supabase.from('sale_payments').insert(
      payments.map(p => ({ ...p, sale_id: saleRow.id }))
    );
    if (paymentsError) throw paymentsError;
  }

  // Update inventory
  await decrementInventory(items || [], saleRow.id, 'sale');
  
  return saleRow;
};

// ── PRESCRIPTIONS (COFEPRIS) ─────────────────────────────────

export const createPrescription = async (prescription) => {
  const orgId = await getOrgId();
  const { data: { user } } = await supabase.auth.getUser();
  
  const { data, error } = await supabase
    .from('prescriptions')
    .insert({
      ...prescription,
      org_id: orgId,
      created_by: user?.id,
    })
    .select().single();
  if (error) throw error;
  return data;
};

export const getPrescriptions = async (filters = {}) => {
  let query = supabase
    .from('prescriptions')
    .select('*, sales(timestamp, total)')
    .order('created_at', { ascending: false });
  
  if (filters.startDate) {
    query = query.gte('prescription_date', filters.startDate);
  }
  if (filters.endDate) {
    query = query.lte('prescription_date', filters.endDate);
  }
  if (filters.isVoided !== undefined) {
    query = query.eq('is_voided', filters.isVoided);
  }
  
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
};

export const getCustomerDocuments = async () => {
  const orgId = await getOrgId();
  const { data, error } = await supabase
    .from('customer_documents')
    .select('*, customers(id, full_name, email, profile_id)')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
};

export const voidPrescription = async (prescriptionId, voidedBy) => {
  const { error } = await supabase
    .from('prescriptions')
    .update({
      is_voided: true,
      voided_at: new Date().toISOString(),
      voided_by: voidedBy,
    })
    .eq('id', prescriptionId);
  if (error) throw error;
};

// ── AKAUNTING SETTINGS ───────────────────────────────────────

export const getAkauntingSettings = async () => {
  const orgId = await getOrgId();
  const { data, error } = await supabase
    .from('akaunting_settings')
    .select('*')
    .eq('org_id', orgId)
    .single();
  if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
  return data || null;
};

export const saveAkauntingSettings = async (settings) => {
  const orgId = await getOrgId();
  const { error } = await supabase
    .from('akaunting_settings')
    .upsert({
      org_id: orgId,
      api_url: settings.apiUrl,
      company_id: settings.companyId,
      api_email: settings.apiEmail,
      api_password: settings.apiPassword,
      enabled: settings.enabled,
      sync_customers: settings.syncCustomers,
      sync_sales: settings.syncSales,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'org_id' });
  if (error) throw error;
};

// ── AKAUNTING MAPPINGS ───────────────────────────────────────

export const getCustomerProfiles = async () => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*, locations(name)')
    .eq('role', 'customer')
    .order('full_name');
  if (error) throw error;
  return data || [];
};

export const getAkauntingMapping = async (entityType, farmaciaId) => {
  const orgId = await getOrgId();
  const { data } = await supabase
    .from('akaunting_mappings')
    .select('akaunting_id')
    .eq('org_id', orgId)
    .eq('entity_type', entityType)
    .eq('farmacia_id', farmaciaId)
    .maybeSingle();
  return data?.akaunting_id || null;
};

export const saveAkauntingMapping = async (entityType, farmaciaId, akauntingId) => {
  const orgId = await getOrgId();
  const { error } = await supabase
    .from('akaunting_mappings')
    .upsert({
      org_id: orgId,
      entity_type: entityType,
      farmacia_id: farmaciaId,
      akaunting_id: String(akauntingId),
      last_synced_at: new Date().toISOString(),
    }, { onConflict: 'org_id,entity_type,farmacia_id' });
  if (error) throw error;
};

export const deleteAkauntingMapping = async (entityType, farmaciaId) => {
  const orgId = await getOrgId();
  const { error } = await supabase
    .from('akaunting_mappings')
    .delete()
    .eq('org_id', orgId)
    .eq('entity_type', entityType)
    .eq('farmacia_id', farmaciaId);
  if (error) throw error;
};

// ── AKAUNTING SYNC HELPERS ───────────────────────────────────

export const getInventoryForSync = async () => {
  const { data, error } = await supabase
    .from('inventory')
    .select('*, suppliers(name)')
    .order('name');
  if (error) throw error;
  return data || [];
};

export const getUnsyncedSales = async (limit = 50) => {
  const { data, error } = await supabase
    .from('sales')
    .select('*, sale_items(*), sale_payments(*)')
    .is('akaunting_invoice_id', null)
    .eq('voided', false)
    .eq('sync_in_progress', false)
    .order('timestamp', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
};

export const markSaleSyncInProgress = async (saleId) => {
  const { error } = await supabase
    .from('sales')
    .update({ sync_in_progress: true })
    .eq('id', saleId);
  if (error) throw error;
};

export const clearSaleSyncInProgress = async (saleId) => {
  const { error } = await supabase
    .from('sales')
    .update({ sync_in_progress: false })
    .eq('id', saleId);
  if (error) throw error;
};

export const markSaleAsSynced = async (saleId, invoiceId) => {
  const { error } = await supabase
    .from('sales')
    .update({
      akaunting_invoice_id: String(invoiceId),
      synced_at: new Date().toISOString(),
      sync_in_progress: false,
    })
    .eq('id', saleId);
  if (error) throw error;
};

export const markSalePaymentSynced = async (saleId, status, errorMsg = null) => {
  const { error } = await supabase
    .from('sales')
    .update({
      payment_sync_status: status,
      payment_synced_at: status === 'synced' ? new Date().toISOString() : null,
      payment_sync_error: errorMsg,
    })
    .eq('id', saleId);
  if (error) throw error;
};

// ── SALE BY ID (for retry sync) ─────────────────────────────

export const getSaleById = async (saleId) => {
  const { data, error } = await supabase
    .from('sales')
    .select('*, sale_items(*), sale_payments(*)')
    .eq('id', saleId)
    .single();
  if (error) throw error;
  return data;
};

// ── CUSTOMERS ────────────────────────────────────────────────

export const getCustomers = async () => {
  const orgId = await getOrgId();
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('org_id', orgId)
    .order('full_name');
  if (error) throw error;
  return data || [];
};

export const getCustomerById = async (id) => {
  const orgId = await getOrgId();
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .eq('org_id', orgId)
    .single();
  if (error) throw error;
  return data;
};

export const searchCustomers = async (query) => {
  const orgId = await getOrgId();
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('org_id', orgId)
    .or(`full_name.ilike.%${query}%,phone.ilike.%${query}%,curp.ilike.%${query}%`)
    .order('full_name')
    .limit(20);
  if (error) throw error;
  return data || [];
};

export const createCustomer = async (customer) => {
  const orgId = await getOrgId();
  const { data, error } = await supabase
    .from('customers')
    .insert({ ...customer, org_id: orgId })
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const updateCustomer = async (id, updates) => {
  const { data, error } = await supabase
    .from('customers')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const deleteCustomer = async (id) => {
  const { error } = await supabase.from('customers').delete().eq('id', id);
  if (error) throw error;
};

export const getCustomersForSync = async () => {
  const orgId = await getOrgId();
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('org_id', orgId)
    .order('full_name');
  if (error) throw error;
  return data || [];
};


// ── DOCTOR PORTAL ───────────────────────────────────────────

const getUserId = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');
  return user.id;
};

// ── APPOINTMENTS ────────────────────────────────────────────

export const getAppointments = async () => {
  const orgId = await getOrgId();
  const { data, error } = await supabase
    .from('appointments')
    .select('*, customers(id, full_name, phone, profile_id), profiles(full_name)')
    .eq('org_id', orgId)
    .order('appointment_date', { ascending: true });
  if (error) throw error;
  return data || [];
};

export const getAppointmentsByDoctor = async (doctorId) => {
  const orgId = await getOrgId();
  const { data, error } = await supabase
    .from('appointments')
    .select('*, customers(full_name, phone)')
    .eq('org_id', orgId)
    .eq('doctor_id', doctorId)
    .order('appointment_date', { ascending: true });
  if (error) throw error;
  return data || [];
};

export const createAppointment = async (appointment) => {
  const orgId = await getOrgId();
  const { data, error } = await supabase
    .from('appointments')
    .insert({ ...appointment, org_id: orgId })
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const updateAppointment = async (id, updates) => {
  const { data, error } = await supabase
    .from('appointments')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const deleteAppointment = async (id) => {
  const { error } = await supabase.from('appointments').delete().eq('id', id);
  if (error) throw error;
};

// ── PREORDERS ───────────────────────────────────────────────

export const getPreorders = async () => {
  const orgId = await getOrgId();
  const { data, error } = await supabase
    .from('preorders')
    .select('*, customers(id, full_name, profile_id), inventory(name, price, quantity)')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
};

export const getPreordersByDoctor = async (doctorId) => {
  const orgId = await getOrgId();
  const { data, error } = await supabase
    .from('preorders')
    .select('*, customers(full_name), inventory(name, price, quantity)')
    .eq('org_id', orgId)
    .eq('doctor_id', doctorId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
};

export const createPreorder = async (preorder) => {
  const orgId = await getOrgId();
  const { data, error } = await supabase
    .from('preorders')
    .insert({ ...preorder, org_id: orgId })
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const updatePreorderStatus = async (id, status) => {
  const { data, error } = await supabase
    .from('preorders')
    .update({ status })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

// ── MEDICAL NOTES ───────────────────────────────────────────

export const getMedicalNotesByCustomer = async (customerId) => {
  const orgId = await getOrgId();
  const { data, error } = await supabase
    .from('medical_notes')
    .select('*')
    .eq('org_id', orgId)
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
};

export const getMedicalNotesByDoctor = async (doctorId) => {
  const orgId = await getOrgId();
  const { data, error } = await supabase
    .from('medical_notes')
    .select('*, customers(full_name)')
    .eq('org_id', orgId)
    .eq('doctor_id', doctorId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
};

export const createMedicalNote = async (note) => {
  const orgId = await getOrgId();
  const { data, error } = await supabase
    .from('medical_notes')
    .insert({ ...note, org_id: orgId })
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const updateMedicalNote = async (id, updates) => {
  const { data, error } = await supabase
    .from('medical_notes')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

// ── DOCTOR CUSTOMERS ────────────────────────────────────────

export const getCustomersForDoctor = async () => {
  const orgId = await getOrgId();
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('org_id', orgId)
    .order('full_name');
  if (error) throw error;
  return data || [];
};

export const getCustomerPurchaseHistory = async (customerId) => {
  const { data, error } = await supabase
    .from('sales')
    .select('*, sale_items(*)')
    .eq('customer_id', customerId)
    .eq('voided', false)
    .order('timestamp', { ascending: false })
    .limit(20);
  if (error) throw error;
  return data || [];
};

export const getCustomerMedicalNoteCount = async (customerId) => {
  const { count, error } = await supabase
    .from('medical_notes')
    .select('*', { count: 'exact', head: true })
    .eq('customer_id', customerId);
  if (error) throw error;
  return count || 0;
};

// ── DOCTOR DASHBOARD STATS ──────────────────────────────────

export const getDoctorDashboardStats = async (doctorId) => {
  const orgId = await getOrgId();
  const today = new Date().toISOString().split('T')[0];

  const { count: apptCount } = await supabase
    .from('appointments')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('doctor_id', doctorId)
    .gte('appointment_date', `${today}T00:00:00`)
    .lte('appointment_date', `${today}T23:59:59`);

  const { count: customerCount } = await supabase
    .from('customers')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', orgId);

  const { count: rxCount } = await supabase
    .from('prescriptions')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('doctor_id', doctorId)
    .eq('status', 'active');

  const { count: upcomingCount } = await supabase
    .from('appointments')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('doctor_id', doctorId)
    .gte('appointment_date', `${today}T00:00:00`)
    .in('status', ['pending', 'confirmed']);

  return {
    appointmentsToday: apptCount || 0,
    totalCustomers: customerCount || 0,
    activePrescriptions: rxCount || 0,
    upcomingAppointments: upcomingCount || 0,
  };
};

export const deleteMedicalNote = async (id) => {
  const { error } = await supabase.from('medical_notes').delete().eq('id', id);
  if (error) throw error;
};


// ── DOCTOR PROFILES ─────────────────────────────────────────

export const getDoctorProfile = async (profileId) => {
  console.log('[getDoctorProfile] profileId:', profileId);
  const { data, error } = await supabase
    .from('doctor_profiles')
    .select('*, profiles(full_name, email)')
    .eq('profile_id', profileId)
    .maybeSingle();
  if (error) {
    console.error('[getDoctorProfile] error:', error);
    throw error;
  }
  console.log('[getDoctorProfile] result:', data);
  return data;
};

export const getDoctorUsersWithProfiles = async () => {
  const orgId = await getOrgId();
  console.log('[getDoctorUsersWithProfiles] orgId:', orgId);

  // Try explicit select (includes email). If the email column does not exist yet
  // (migration not run), fall back to * so the page does not crash.
  let query = supabase
    .from('profiles')
    .select('id, full_name, email, role, org_id, location_id, created_at, doctor_profiles(*)')
    .eq('org_id', orgId)
    .eq('role', 'doctor')
    .order('full_name');

  let { data, error } = await query;

  if (error?.message?.includes('email') && error.message.includes('does not exist')) {
    console.warn('[getDoctorUsersWithProfiles] email column missing, falling back to *');
    const fallback = await supabase
      .from('profiles')
      .select('*, doctor_profiles(*)')
      .eq('org_id', orgId)
      .eq('role', 'doctor')
      .order('full_name');
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    console.error('[getDoctorUsersWithProfiles] error:', error);
    throw error;
  }
  console.log('[getDoctorUsersWithProfiles] rows:', data?.length || 0);
  if (data?.[0]) {
    console.log('[getDoctorUsersWithProfiles] first row shape:', JSON.stringify(data[0], null, 2));
  }
  return data || [];
};

export const upsertDoctorProfile = async (profileId, data) => {
  console.log('[upsertDoctorProfile] profileId:', profileId);
  console.log('[upsertDoctorProfile] data:', data);

  // 1. Check if row already exists
  const { data: existing, error: findError } = await supabase
    .from('doctor_profiles')
    .select('id')
    .eq('profile_id', profileId)
    .maybeSingle();

  if (findError) {
    console.error('[upsertDoctorProfile] find error:', findError);
    throw findError;
  }

  console.log('[upsertDoctorProfile] existing row:', existing);

  if (existing?.id) {
    // 2. UPDATE existing row
    const { error: updateError } = await supabase
      .from('doctor_profiles')
      .update(data)
      .eq('id', existing.id);
    if (updateError) {
      console.error('[upsertDoctorProfile] update error:', updateError);
      throw updateError;
    }
    console.log('[upsertDoctorProfile] updated row id:', existing.id);
  } else {
    // 3. INSERT new row
    const { error: insertError } = await supabase
      .from('doctor_profiles')
      .insert({ profile_id: profileId, ...data });
    if (insertError) {
      console.error('[upsertDoctorProfile] insert error:', insertError);
      throw insertError;
    }
    console.log('[upsertDoctorProfile] inserted new row for profile_id:', profileId);
  }
};

// ── SUPPLIER PRODUCTS ───────────────────────────────────────

export const getSupplierProducts = async (supplierId = null) => {
  let query = supabase
    .from('supplier_products')
    .select('*, suppliers(name), inventory(name, barcode)')
    .order('created_at', { ascending: false });
  if (supplierId) query = query.eq('supplier_id', supplierId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
};

export const upsertSupplierProduct = async (sp) => {
  const { data, error } = await supabase
    .from('supplier_products')
    .upsert(sp)
    .select().single();
  if (error) throw error;
  return data;
};

export const deleteSupplierProduct = async (id) => {
  const { error } = await supabase.from('supplier_products').delete().eq('id', id);
  if (error) throw error;
};

// ── INVENTORY BATCHES ───────────────────────────────────────

export const getInventoryBatches = async (inventoryId) => {
  const { data, error } = await supabase
    .from('inventory_batches')
    .select('*')
    .eq('inventory_id', inventoryId)
    .order('expiration_date', { ascending: true });
  if (error) throw error;
  return data || [];
};

export const createInventoryBatch = async (batch) => {
  const orgId = await getOrgId();
  const { data, error } = await supabase
    .from('inventory_batches')
    .insert({ ...batch, org_id: orgId })
    .select().single();
  if (error) throw error;
  return data;
};

export const updateInventoryBatch = async (id, updates) => {
  const { data, error } = await supabase
    .from('inventory_batches')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select().single();
  if (error) throw error;
  return data;
};

// ── INVENTORY (doctor-scoped) ───────────────────────────────

export const getInventoryForDoctor = async () => {
  const orgId = await getOrgId();
  const { data, error } = await supabase
    .from('inventory')
    .select('id, name, quantity, price, requires_prescription, barcode')
    .eq('org_id', orgId)
    .gt('quantity', 0)
    .order('name');
  if (error) throw error;
  return data || [];
};

// ── CUSTOMER DOCUMENTS (PRESCRIPTIONS) ──────────────────────

export const updateCustomerDocumentStatus = async (id, status) => {
  const { data, error } = await supabase
    .from('customer_documents')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

// ── SALES / ORDERS ──────────────────────────────────────────

export const updateSaleStatus = async (id, status) => {
  const { data, error } = await supabase
    .from('sales')
    .update({ status })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

// ── CUSTOMER STATS & PROFILE ────────────────────────────────

export const getCustomerStats = async (customerId) => {
  const orgId = await getOrgId();
  // Verify customer belongs to org before counting
  const { data: customer, error: custError } = await supabase
    .from('customers')
    .select('id')
    .eq('id', customerId)
    .eq('org_id', orgId)
    .single();
  if (custError || !customer) {
    return { prescriptions: 0, preorders: 0, appointments: 0, orders: 0 };
  }
  const [{ count: prescriptions }, { count: preorders }, { count: appointments }, { count: orders }] = await Promise.all([
    supabase.from('prescriptions').select('*', { count: 'exact', head: true }).eq('customer_id', customerId).eq('org_id', orgId),
    supabase.from('preorders').select('*', { count: 'exact', head: true }).eq('customer_id', customerId).eq('org_id', orgId),
    supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('customer_id', customerId).eq('org_id', orgId),
    supabase.from('sales').select('*', { count: 'exact', head: true }).eq('customer_id', customerId).eq('voided', false).eq('org_id', orgId),
  ]);
  return {
    prescriptions: prescriptions || 0,
    preorders: preorders || 0,
    appointments: appointments || 0,
    orders: orders || 0,
  };
};

export const getCustomerPrescriptions = async (customerId) => {
  const orgId = await getOrgId();
  // Verify customer belongs to org (customer_documents may not have org_id column)
  const { data: customer, error: custError } = await supabase
    .from('customers')
    .select('id')
    .eq('id', customerId)
    .eq('org_id', orgId)
    .single();
  if (custError || !customer) return [];

  const { data, error } = await supabase
    .from('prescriptions')
    .select('*, profiles:doctor_id(full_name)')
    .eq('customer_id', customerId)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
};

export const getCustomerPreorders = async (customerId) => {
  const orgId = await getOrgId();
  const { data, error } = await supabase
    .from('preorders')
    .select('*, inventory(name, price)')
    .eq('customer_id', customerId)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
};

export const getCustomerAppointments = async (customerId) => {
  const orgId = await getOrgId();
  const { data, error } = await supabase
    .from('appointments')
    .select('*, profiles(full_name)')
    .eq('customer_id', customerId)
    .eq('org_id', orgId)
    .order('appointment_date', { ascending: false });
  if (error) throw error;
  return data || [];
};

export const getCustomerOrders = async (customerId) => {
  const orgId = await getOrgId();
  const { data, error } = await supabase
    .from('sales')
    .select('*, sale_items(*)')
    .eq('customer_id', customerId)
    .eq('voided', false)
    .eq('org_id', orgId)
    .order('timestamp', { ascending: false });
  if (error) throw error;
  return data || [];
};

// ── NOTIFICATIONS ───────────────────────────────────────────

export const getNotifications = async () => {
  const orgId = await getOrgId();
  const { data, error } = await supabase
    .from('notifications')
    .select('*, customers(full_name)')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return data || [];
};

export const getUnreadNotificationsCount = async (customerId = null, profileId = null) => {
  let query = supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('is_read', false);
  if (customerId) query = query.eq('customer_id', customerId);
  if (profileId) query = query.eq('profile_id', profileId);
  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
};

export const createNotification = async (notification) => {
  const orgId = await getOrgId();
  const { data, error } = await supabase
    .from('notifications')
    .insert({ ...notification, org_id: orgId })
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const markNotificationRead = async (id) => {
  const { data, error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const markAllNotificationsRead = async (customerId = null, profileId = null) => {
  let query = supabase.from('notifications').update({ is_read: true }).eq('is_read', false);
  if (customerId) query = query.eq('customer_id', customerId);
  if (profileId) query = query.eq('profile_id', profileId);
  const { error } = await query;
  if (error) throw error;
};

// ── INVENTORY / REORDER ─────────────────────────────────────

export const getInventoryQuantity = async (inventoryId) => {
  const { data, error } = await supabase
    .from('inventory')
    .select('quantity, name')
    .eq('id', inventoryId)
    .single();
  if (error) throw error;
  return data;
};

export const decrementInventoryItem = async (inventoryId, quantity) => {
  const { data, error } = await supabase
    .rpc('decrement_inventory', { p_id: inventoryId, p_qty: quantity });
  if (error) throw error;
  return data;
};

export const getInventoryLowStock = async () => {
  const orgId = await getOrgId();
  const { data, error } = await supabase
    .from('inventory')
    .select('*, suppliers(name)')
    .eq('org_id', orgId)
    .order('quantity', { ascending: true });
  if (error) throw error;
  return (data || []).filter(item =>
    item.quantity <= (item.low_stock_threshold || 10) || item.quantity === 0
  );
};

// ── PHASE 2: DOCTOR PRESCRIPTIONS ────────────────────────────

export const createDoctorPrescription = async (prescription) => {
  const orgId = await getOrgId();
  const { data: { user } } = await supabase.auth.getUser();
  
  const { data, error } = await supabase
    .from('prescriptions')
    .insert({
      ...prescription,
      org_id: orgId,
      doctor_id: user?.id,
      created_by: user?.id,
      status: prescription.status || 'active',
    })
    .select('*, customers(full_name), profiles:doctor_id(full_name)')
    .single();
  if (error) throw error;
  return data;
};

export const getDoctorPrescriptions = async (customerId = null) => {
  const orgId = await getOrgId();
  let query = supabase
    .from('prescriptions')
    .select('*, customers(full_name), profiles:doctor_id(full_name)')
    .eq('org_id', orgId)
    .not('doctor_id', 'is', null)
    .order('created_at', { ascending: false });
  
  if (customerId) {
    query = query.eq('customer_id', customerId);
  }
  
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
};

export const getPrescriptionByNumber = async (number) => {
  const orgId = await getOrgId();
  const { data, error } = await supabase
    .from('prescriptions')
    .select('*, customers(full_name, phone, curp), profiles:doctor_id(full_name)')
    .eq('org_id', orgId)
    .eq('prescription_number', number)
    .maybeSingle();
  if (error) throw error;
  return data;
};

export const searchPrescriptions = async (query) => {
  const orgId = await getOrgId();
  const { data, error } = await supabase
    .from('prescriptions')
    .select('*, customers(full_name, phone), profiles:doctor_id(full_name)')
    .eq('org_id', orgId)
    .or(`prescription_number.ilike.%${query}%,patient_name.ilike.%${query}%,customers.full_name.ilike.%${query}%`)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  return data || [];
};

export const linkPrescriptionToSale = async (prescriptionId, saleId) => {
  const { data, error } = await supabase
    .from('prescriptions')
    .update({
      sale_id: saleId,
      status: 'fulfilled',
      fulfilled_at: new Date().toISOString(),
    })
    .eq('id', prescriptionId)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const updatePrescriptionStatus = async (id, status) => {
  const updates = { status };
  if (status === 'fulfilled') {
    updates.fulfilled_at = new Date().toISOString();
  }
  const { data, error } = await supabase
    .from('prescriptions')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const cancelDoctorPrescription = async (id) => {
  const { data, error } = await supabase
    .from('prescriptions')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('status', 'active')
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const getActivePrescriptionCount = async () => {
  const orgId = await getOrgId();
  const { count, error } = await supabase
    .from('prescriptions')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('status', 'active')
    .not('doctor_id', 'is', null);
  if (error) throw error;
  return count || 0;
};

// ── PUBLIC CUSTOMER REGISTRATION ─────────────────────────────

export const registerCustomer = async ({ email, password, fullName, phone }) => {
  // Step 1: Create auth user with customer role
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        role: 'customer',
      },
    },
  });

  if (authError) throw authError;
  if (!authData.user) throw new Error('No se pudo crear el usuario.');

  // Step 2: The handle_new_user trigger should have created profile + customer rows.
  // But we need to update the customer record with phone number.
  // Wait a moment for trigger to complete, then update.
  await new Promise(resolve => setTimeout(resolve, 500));

  const { data: customerRow, error: customerError } = await supabase
    .from('customers')
    .update({ phone })
    .eq('profile_id', authData.user.id)
    .select()
    .single();

  if (customerError) {
    console.warn('[registerCustomer] Could not update phone:', customerError);
  }

  return {
    user: authData.user,
    customer: customerRow,
  };
};

// ── INVENTORY WITH SUPPLIER ──────────────────────────────────

export const getInventoryWithSupplier = async (locationId = null) => {
  let query = supabase
    .from('inventory')
    .select('*, suppliers(id, name)')
    .order('name');
  if (locationId) query = query.eq('location_id', locationId);
  const { data, error } = await query;
  if (error) throw error;
  return data;
};
