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
  const { data, error } = await supabase
    .from('inventory')
    .upsert({ ...item, org_id: orgId, updated_at: new Date().toISOString() })
    .select().single();
  if (error) throw error;
  return data;
};

export const deleteInventoryItem = async (id) => {
  const { error } = await supabase.from('inventory').delete().eq('id', id);
  if (error) throw error;
};

export const decrementInventory = async (items) => {
  // items: [{ inventory_id, quantity }] - inventory_id is the FK to inventory table
  for (const item of items) {
    const inventoryId = item.inventory_id || item.id;
    if (!inventoryId) {
      console.error('No inventory_id found for item:', item);
      continue;
    }
    
    const { error } = await supabase.rpc('decrement_inventory', {
      p_id: inventoryId,
      p_qty: item.quantity,
    });
    
    if (error) {
      console.error('RPC decrement_inventory failed:', error);
      // Fallback: manual update
      const { data: current, error: fetchError } = await supabase.from('inventory').select('quantity, sales_count').eq('id', inventoryId).single();
      if (fetchError) {
        console.error('Failed to fetch current inventory:', fetchError);
        continue;
      }
      const { error: updateError } = await supabase.from('inventory').update({
        quantity: (current?.quantity || 0) - item.quantity,
        sales_count: (current?.sales_count || 0) + item.quantity,
        updated_at: new Date().toISOString(),
      }).eq('id', inventoryId);
      if (updateError) {
        console.error('Failed to update inventory:', updateError);
      }
    }
  }
};

export const incrementInventory = async (items) => {
  // items: [{ inventory_id, returnQty }] - for returns
  for (const item of items) {
    const inventoryId = item.inventory_id || item.id;
    if (!inventoryId) {
      console.error('No inventory_id found for item:', item);
      continue;
    }
    
    const { data: current, error: fetchError } = await supabase.from('inventory').select('quantity, sales_count').eq('id', inventoryId).single();
    if (fetchError) {
      console.error('Failed to fetch current inventory for return:', fetchError);
      continue;
    }
    
    const { error: updateError } = await supabase.from('inventory').update({
      quantity: (current?.quantity || 0) + (item.returnQty || item.quantity || 0),
      sales_count: Math.max(0, (current?.sales_count || 0) - (item.returnQty || item.quantity || 0)),
      updated_at: new Date().toISOString(),
    }).eq('id', inventoryId);
    
    if (updateError) {
      console.error('Failed to update inventory for return:', updateError);
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
  const { data } = await supabase
    .from('shifts')
    .select('*')
    .eq('opened_by', profileId)
    .eq('location_id', locationId)
    .eq('status', 'open')
    .single();
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

  await decrementInventory(items || []);
  return saleRow;
};

export const getSales = async () => {
  const { data, error } = await supabase
    .from('sales')
    .select('*, sale_items(*)')
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

export const voidSale = async (saleId, voidedByName) => {
  const { data: sale, error: fetchError } = await supabase
    .from('sales')
    .select('*, sale_items(*)')
    .eq('id', saleId)
    .single();
  if (fetchError) throw fetchError;
  if (sale.voided) throw new Error('Venta ya fue anulada');

  await incrementInventory(sale.sale_items.map(i => ({ ...i, returnQty: i.quantity })));

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

  await incrementInventory(items || []);
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
      .select('id, quantity')
      .ilike('name', item.medicine_name)
      .single();
    if (inv) {
      await supabase.from('inventory').update({
        quantity: inv.quantity + item.quantity,
        cost: item.unit_cost,
        updated_at: new Date().toISOString(),
      }).eq('id', inv.id);
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
  await decrementInventory(items || []);
  
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
