// ============================================================
// akauntingSync.js — Sync orchestrator
// Handles one-way sync from Farmacia → Akaunting
// ============================================================
import * as akauntingApi from './akauntingApi';
import * as db from '@/lib/db';
import { supabase } from '@/lib/supabase';
import { mapCustomerToContact, mapInventoryToItem, mapSaleToInvoice } from './akauntingMappers';

// ── Cache for Akaunting lookups (refreshed per batch sync) ──
let _taxIdCache = null;
let _accountCache = null;
let _categoryIdCache = null;
let _incomeCategoryIdCache = null;
let _paymentMethodsCache = null;
let _defaultContactIdCache = null;

/**
 * Reads Farmacia akaunting_settings and configures the API client.
 * @returns {Promise<Object>} settings row
 * @throws if not configured or disabled
 */
export const initAkauntingClient = async () => {
  const settings = await db.getAkauntingSettings();
  if (!settings) {
    throw new Error('Akaunting no está configurado. Ve a la pestaña de Conexión e ingresa tus credenciales.');
  }
  if (!settings.enabled) {
    throw new Error('La integración con Akaunting está deshabilitada.');
  }
  akauntingApi.configureClient({
    apiUrl: settings.api_url,
    companyId: settings.company_id,
    apiEmail: settings.api_email,
    apiPassword: settings.api_password,
  });
  _taxIdCache = null;
  _accountCache = null;
  _categoryIdCache = null;
  _incomeCategoryIdCache = null;
  _paymentMethodsCache = null;
  _defaultContactIdCache = null;
  return settings;
};

// ── CATEGORY HELPERS ────────────────────────────────────────

/**
 * Find the default income/sales category in Akaunting.
 * Caches result for the session.
 */
const getOrCreateCategory = async () => {
  if (_categoryIdCache) return _categoryIdCache;

  const categories = await akauntingApi.getCategories();
  const catList = Array.isArray(categories) ? categories : categories?.data || [];

  // Try to find an income/sales category
  const incomeCat = catList.find((c) =>
    c.type === 'income' &&
    ((c.name || '').toLowerCase().includes('venta') ||
     (c.name || '').toLowerCase().includes('sales') ||
     (c.name || '').toLowerCase().includes('income') ||
     (c.name || '').toLowerCase().includes('ingreso') ||
     (c.name || '').toLowerCase().includes('general'))
  );

  if (incomeCat?.id) {
    _categoryIdCache = String(incomeCat.id);
    console.log('[Akaunting Sync] Using category:', incomeCat.name, 'ID:', _categoryIdCache);
    return _categoryIdCache;
  }

  // Fallback: first income category
  const firstIncome = catList.find((c) => c.type === 'income');
  if (firstIncome?.id) {
    _categoryIdCache = String(firstIncome.id);
    console.log('[Akaunting Sync] Using first income category:', firstIncome.name, 'ID:', _categoryIdCache);
    return _categoryIdCache;
  }

  // Last fallback: first category of any type
  if (catList.length > 0 && catList[0]?.id) {
    _categoryIdCache = String(catList[0].id);
    console.log('[Akaunting Sync] Using fallback category:', catList[0].name, 'ID:', _categoryIdCache);
    return _categoryIdCache;
  }

  throw new Error('No se encontró ninguna categoría en Akaunting. Crea al menos una categoría de ingresos.');
};

// ── TAX HELPERS ─────────────────────────────────────────────

/**
 * Find or create the IVA tax in Akaunting.
 * Caches result for the session.
 */
const getOrCreateTax = async () => {
  if (_taxIdCache) return _taxIdCache;

  const taxes = await akauntingApi.getTaxes();
  const taxList = Array.isArray(taxes) ? taxes : taxes?.data || [];
  const ivaTax = taxList.find((t) =>
    (t.name || '').toLowerCase().includes('iva') &&
    Number(t.rate) === 16
  );

  if (ivaTax?.id) {
    _taxIdCache = String(ivaTax.id);
    return _taxIdCache;
  }

  // Create IVA tax if not found
  const created = await akauntingApi.createTax({
    name: 'IVA',
    rate: 16,
    type: 'normal',
    enabled: true,
  });
  _taxIdCache = String(created?.id || created?.data?.id);
  return _taxIdCache;
};

// ── ACCOUNT HELPERS ─────────────────────────────────────────

/**
 * Find the best matching Akaunting account for a payment method.
 */
const findAccountForPayment = (paymentMethod) => {
  const accounts = _accountCache;
  if (!accounts || accounts.length === 0) return null;

  const method = paymentMethod?.toLowerCase() || '';
  const patterns = {
    cash: ['caja', 'cash', 'caja general', 'efectivo'],
    card: ['bancos', 'bank', 'tarjeta', 'card'],
    transferencia: ['bancos', 'bank', 'transfer'],
    insurance: ['cuentas por cobrar', 'receivable', 'aseguradora'],
  };

  const searchTerms = patterns[method] || [];
  for (const term of searchTerms) {
    const match = accounts.find((a) =>
      (a.name || '').toLowerCase().includes(term)
    );
    if (match) return String(match.id);
  }

  // Fallback: first account
  return String(accounts[0].id);
};

// ── CUSTOMER SYNC ───────────────────────────────────────────

export const syncCustomer = async (customer) => {
  if (!customer.full_name?.trim()) {
    return { action: 'skipped', akauntingId: null };
  }

  const existingAkauntingId = await db.getAkauntingMapping('customer', customer.id);
  const contactData = mapCustomerToContact(customer);

  if (existingAkauntingId) {
    try {
      await akauntingApi.updateContact(existingAkauntingId, contactData);
      await db.saveAkauntingMapping('customer', customer.id, existingAkauntingId);
      return { action: 'updated', akauntingId: existingAkauntingId };
    } catch (e) {
      if (e.message?.includes('404')) {
        console.warn('[syncCustomer] mapped contact deleted in Akaunting (404), recreating:', customer.full_name);
        await db.deleteAkauntingMapping('customer', customer.id);
        // fall through to create
      } else {
        throw e;
      }
    }
  }

  const result = await akauntingApi.createContact(contactData);
  const newId = result?.id || result?.data?.id;
  if (!newId) {
    throw new Error('Akaunting no devolvió un ID de contacto');
  }
  await db.saveAkauntingMapping('customer', customer.id, String(newId));
  return { action: 'created', akauntingId: String(newId) };
};

export const syncAllCustomers = async () => {
  let settings;
  try {
    settings = await initAkauntingClient();
  } catch (e) {
    console.error('[syncAllCustomers] init failed:', e);
    return { created: 0, updated: 0, failed: 0, skipped: 0, total: 0, errors: [{ name: 'Configuración', error: e.message }] };
  }

  if (!settings.sync_customers) {
    return { created: 0, updated: 0, failed: 0, skipped: 0, total: 0, errors: [{ name: 'Configuración', error: 'La sincronización de clientes está deshabilitada en la configuración.' }] };
  }

  let customers;
  try {
    customers = await db.getCustomersForSync();
  } catch (e) {
    console.error('[syncAllCustomers] failed to load customers:', e);
    return { created: 0, updated: 0, failed: 0, skipped: 0, total: 0, errors: [{ name: 'Base de datos', error: e.message }] };
  }

  const results = { created: 0, updated: 0, failed: 0, skipped: 0, total: customers.length, errors: [] };

  for (const customer of customers) {
    try {
      const res = await syncCustomer(customer);
      results[res.action]++;
      console.log('[syncAllCustomers] synced:', customer.full_name, '->', res.action, res.akauntingId);
    } catch (e) {
      results.failed++;
      const errInfo = { name: customer.full_name || customer.id, error: e.message };
      results.errors.push(errInfo);
      console.error('[syncAllCustomers] failed:', customer.full_name, e.message);
    }
  }

  console.log('[syncAllCustomers] batch complete:', results);
  return results;
};

// ── PRODUCT CATEGORY HELPER ─────────────────────────────────

let _productCategoryIdCache = null;

const getProductCategory = async () => {
  if (_productCategoryIdCache) return _productCategoryIdCache;

  const categories = await akauntingApi.getCategories({ search: 'type:item' });
  const catList = Array.isArray(categories) ? categories : categories?.data || [];

  const productCat = catList.find((c) => c.type === 'item');
  if (productCat?.id) {
    _productCategoryIdCache = String(productCat.id);
    console.log('[syncItem] using product category:', productCat.name, 'ID:', _productCategoryIdCache);
    return _productCategoryIdCache;
  }

  if (catList.length > 0 && catList[0]?.id) {
    _productCategoryIdCache = String(catList[0].id);
    console.log('[syncItem] using fallback category:', catList[0].name, 'ID:', _productCategoryIdCache);
    return _productCategoryIdCache;
  }

  console.warn('[syncItem] no item categories found, proceeding without category_id');
  return null;
};

// ── PRODUCT SYNC ────────────────────────────────────────────

export const syncItem = async (item) => {
  if (!item.name?.trim()) {
    return { action: 'skipped', akauntingId: null };
  }

  const existingAkauntingId = await db.getAkauntingMapping('item', item.id);
  const categoryId = await getProductCategory();
  const itemData = mapInventoryToItem(item, categoryId);

  console.log('[syncItem] item payload:', JSON.stringify(itemData, null, 2));

  if (existingAkauntingId) {
    try {
      await akauntingApi.updateItem(existingAkauntingId, itemData);
      await db.saveAkauntingMapping('item', item.id, existingAkauntingId);
      return { action: 'updated', akauntingId: existingAkauntingId };
    } catch (e) {
      if (e.message?.includes('404')) {
        console.warn('[syncItem] mapped item deleted in Akaunting (404), recreating:', item.name);
        await db.deleteAkauntingMapping('item', item.id);
        // fall through to create
      } else {
        throw e;
      }
    }
  }

  const result = await akauntingApi.createItem(itemData);
  const newId = result?.id || result?.data?.id;
  if (!newId) {
    throw new Error('Akaunting no devolvió un ID de producto');
  }
  await db.saveAkauntingMapping('item', item.id, String(newId));
  return { action: 'created', akauntingId: String(newId) };
};

export const syncAllItems = async () => {
  const settings = await initAkauntingClient();
  const items = await db.getInventoryForSync();
  const results = { created: 0, updated: 0, failed: 0, skipped: 0, total: items.length, errors: [] };

  for (const item of items) {
    try {
      const res = await syncItem(item);
      results[res.action]++;
    } catch (e) {
      results.failed++;
      results.errors.push({ name: item.name || item.id, error: e.message });
    }
  }

  return results;
};

// ── INCOME CATEGORY HELPER ─────────────────────────────────

/**
 * Find an income category for transactions.
 * Caches result for the session.
 */
const getIncomeCategory = async () => {
  if (_incomeCategoryIdCache) return _incomeCategoryIdCache;

  const categories = await akauntingApi.getCategories({ search: 'type:income' });
  const catList = Array.isArray(categories) ? categories : categories?.data || [];
  console.log('[syncSale] income categories found:', catList.length, catList.map((c) => ({ id: c.id, name: c.name, type: c.type })));

  const incomeCat = catList.find((c) => c.type === 'income');
  if (incomeCat?.id) {
    _incomeCategoryIdCache = String(incomeCat.id);
    console.log('[syncSale] using income category:', incomeCat.name, 'ID:', _incomeCategoryIdCache);
    return _incomeCategoryIdCache;
  }

  if (catList.length > 0 && catList[0]?.id) {
    _incomeCategoryIdCache = String(catList[0].id);
    console.log('[syncSale] using fallback income category:', catList[0].name, 'ID:', _incomeCategoryIdCache);
    return _incomeCategoryIdCache;
  }

  throw new Error('No se encontró ninguna categoría de ingresos en Akaunting.');
};

// ── PAYMENT METHOD MAPPER ───────────────────────────────────

/**
 * Query Akaunting payment methods and map Farmacia methods to Akaunting codes.
 * Akaunting uses format: offline-payments.{slug}.{index}
 */
const resolvePaymentMethod = async (farmaciaMethod) => {
  if (_paymentMethodsCache) {
    return _paymentMethodsCache[farmaciaMethod] || _paymentMethodsCache['cash'] || 'offline-payments.cash.1';
  }

  try {
    const settings = await akauntingApi.getSettings({ search: 'key:offline-payments.methods' });
    const settingsList = Array.isArray(settings) ? settings : settings?.data || [];
    const pmSetting = settingsList.find((s) => s.key === 'offline-payments.methods');

    if (pmSetting?.value) {
      const methods = typeof pmSetting.value === 'string' ? JSON.parse(pmSetting.value) : pmSetting.value;
      console.log('[syncSale] Akaunting payment methods:', methods);

      _paymentMethodsCache = {};
      for (const m of methods) {
        const slug = (m.code || m.name || '').toLowerCase();
        if (slug.includes('cash') || slug.includes('efectivo')) {
          _paymentMethodsCache['cash'] = m.code;
        }
        if (slug.includes('bank') || slug.includes('transfer') || slug.includes('banco')) {
          _paymentMethodsCache['transferencia'] = m.code;
          _paymentMethodsCache['card'] = m.code;
        }
        if (slug.includes('check') || slug.includes('cheque')) {
          _paymentMethodsCache['check'] = m.code;
        }
      }
      console.log('[syncSale] payment method map:', _paymentMethodsCache);
    }
  } catch (e) {
    console.warn('[syncSale] failed to load payment methods, using defaults:', e.message);
  }

  // Hardcoded fallbacks based on Akaunting defaults
  _paymentMethodsCache = _paymentMethodsCache || {};
  _paymentMethodsCache['cash'] = _paymentMethodsCache['cash'] || 'offline-payments.cash.1';
  _paymentMethodsCache['card'] = _paymentMethodsCache['card'] || 'offline-payments.bank_transfer.2';
  _paymentMethodsCache['transferencia'] = _paymentMethodsCache['transferencia'] || 'offline-payments.bank_transfer.2';
  _paymentMethodsCache['insurance'] = _paymentMethodsCache['insurance'] || 'offline-payments.cash.1';

  return _paymentMethodsCache[farmaciaMethod] || _paymentMethodsCache['cash'];
};

// ── DEFAULT CUSTOMER CONTACT ────────────────────────────────

/**
 * Ensure a default "Cliente general" contact exists in Akaunting.
 * Used for sales without a linked customer. Idempotent via akaunting_mappings.
 */
const ensureDefaultCustomerContact = async () => {
  if (_defaultContactIdCache) return _defaultContactIdCache;

  const existingId = await db.getAkauntingMapping('customer', '_default');
  if (existingId) {
    _defaultContactIdCache = existingId;
    console.log('[syncSale] default customer cached contact_id:', _defaultContactIdCache);
    return _defaultContactIdCache;
  }

  const defaultData = {
    type: 'customer',
    name: 'Cliente general',
    email: 'cliente.general@farmaciaatlas.com',
    currency_code: 'MXN',
    enabled: true,
  };

  const result = await akauntingApi.createContact(defaultData);
  const newId = result?.id || result?.data?.id;
  if (!newId) {
    throw new Error('Akaunting no devolvió un ID para el cliente general');
  }

  await db.saveAkauntingMapping('customer', '_default', String(newId));
  _defaultContactIdCache = String(newId);
  console.log('[syncSale] created default customer contact_id:', _defaultContactIdCache);
  return _defaultContactIdCache;
};

// ── SALE → INVOICE SYNC ─────────────────────────────────────

/**
 * Check if an invoice already exists for this sale.
 * Checks both sales.akaunting_invoice_id and akaunting_mappings.
 */
const getExistingInvoiceId = async (sale) => {
  if (sale.akaunting_invoice_id) return String(sale.akaunting_invoice_id);
  const mappedId = await db.getAkauntingMapping('sale', sale.id);
  return mappedId || null;
};

/**
 * Idempotently sync payments for an existing Akaunting invoice.
 * Checks existing transactions before creating new ones to avoid duplicates.
 */
const syncPaymentsForInvoice = async (sale, invoiceId) => {
  console.log('[syncSale] syncing payments for existing invoice:', invoiceId);

  _accountCache = await akauntingApi.getAccounts();
  const accounts = Array.isArray(_accountCache) ? _accountCache : _accountCache?.data || [];
  _accountCache = accounts;

  if (accounts.length === 0) {
    throw new Error('No hay cuentas bancarias configuradas en Akaunting. No se pueden registrar pagos.');
  }

  const incomeCategoryId = await getIncomeCategory();
  const payments = sale.sale_payments || [];

  if (payments.length === 0) {
    console.log('[syncSale] no payments to sync for invoice', invoiceId);
    await db.markSalePaymentSynced(sale.id, 'synced');
    return;
  }

  // Load existing transactions on this invoice to avoid duplicates
  let existingTxs = [];
  try {
    const txData = await akauntingApi.getDocumentTransactions(invoiceId);
    existingTxs = Array.isArray(txData) ? txData : txData?.data || [];
    console.log('[syncSale] existing transactions on invoice:', existingTxs.length);
  } catch (e) {
    console.warn('[syncSale] could not load existing transactions:', e.message);
  }

  const paidAt = sale.timestamp
    ? sale.timestamp.replace('T', ' ').slice(0, 19)
    : new Date().toISOString().replace('T', ' ').slice(0, 19);

  let allPaymentsSynced = true;
  let lastError = null;

  for (const payment of payments) {
    const accountId = findAccountForPayment(payment.payment_method);
    const akauntingPaymentMethod = await resolvePaymentMethod(payment.payment_method);

    if (!accountId) {
      const errMsg = `No se encontró cuenta bancaria para método de pago: ${payment.payment_method}. Cuentas disponibles: ${accounts.map((a) => a.name).join(', ')}`;
      console.error('[syncSale]', errMsg);
      allPaymentsSynced = false;
      lastError = errMsg;
      continue;
    }

    // Check if a transaction with same amount + method already exists
    const alreadyExists = existingTxs.some(
      (tx) =>
        Math.abs(Number(tx.amount) - Number(payment.amount)) < 0.01 &&
        tx.payment_method === akauntingPaymentMethod
    );
    if (alreadyExists) {
      console.log('[syncSale] payment already exists for', payment.payment_method, 'amount', payment.amount, '- skipping');
      continue;
    }

    const txNumber = `PAY-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const txPayload = {
      type: 'income',
      number: txNumber,
      payment_method: akauntingPaymentMethod,
      account_id: Number(accountId),
      category_id: Number(incomeCategoryId),
      currency_code: 'MXN',
      currency_rate: 1,
      amount: Number(payment.amount) || 0,
      paid_at: paidAt,
    };
    console.log('[syncSale] sending payment transaction:', JSON.stringify(txPayload, null, 2));

    try {
      const txRes = await akauntingApi.createDocumentTransaction(invoiceId, txPayload);
      console.log('[syncSale] payment transaction created:', txRes);
    } catch (e) {
      console.warn('[syncSale] Payment sync failed for', payment.payment_method, ':', e.message);
      allPaymentsSynced = false;
      lastError = e.message;
    }
  }

  await db.markSalePaymentSynced(sale.id, allPaymentsSynced ? 'synced' : 'failed', lastError);
  if (!allPaymentsSynced) {
    throw new Error(`Algunos pagos no se sincronizaron: ${lastError}`);
  }
};

export const syncSale = async (sale) => {
  await initAkauntingClient();

  // 0. Check for existing invoice (defensive: both sales column + mappings)
  const existingInvoiceId = await getExistingInvoiceId(sale);
  if (existingInvoiceId) {
    console.log('[syncSale] invoice already exists for sale', sale.id, 'invoice_id:', existingInvoiceId);

    // If payments not yet synced, retry payments only
    if (sale.payment_sync_status !== 'synced') {
      try {
        await syncPaymentsForInvoice(sale, existingInvoiceId);
        return { action: 'synced_payments', akauntingId: existingInvoiceId };
      } catch (e) {
        return { action: 'payment_failed', akauntingId: existingInvoiceId, error: e.message };
      }
    }
    return { action: 'skipped_existing_invoice', akauntingId: existingInvoiceId };
  }

  // Concurrent sync protection: mark sale as in-progress
  try {
    await db.markSaleSyncInProgress(sale.id);
  } catch (e) {
    console.warn('[syncSale] sale', sale.id, 'already in progress or failed to lock:', e.message);
    return { action: 'skipped', akauntingId: null, error: 'Sync already in progress' };
  }

  try {
    console.log('[syncSale] resolving customer for sale', sale.id, 'customer_id:', sale.customer_id);

    // 1. Resolve customer contact
    let contactId;
    let contactName;

    if (sale.customer_id) {
      try {
        const existingId = await db.getAkauntingMapping('customer', sale.customer_id);
        if (existingId) {
          contactId = existingId;
          const customer = await db.getCustomerById(sale.customer_id);
          contactName = customer?.full_name || 'Cliente general';
          console.log('[syncSale] using mapped customer:', contactName, 'contact_id:', contactId);
        } else {
          const customer = await db.getCustomerById(sale.customer_id);
          if (customer) {
            const res = await syncCustomer(customer);
            contactId = res.akauntingId;
            contactName = customer.full_name;
            console.log('[syncSale] synced customer on-the-fly:', contactName, 'contact_id:', contactId);
          } else {
            throw new Error('Customer not found in DB');
          }
        }
      } catch (e) {
        console.warn('[syncSale] failed to resolve customer, falling back to default:', e.message);
        contactId = await ensureDefaultCustomerContact();
        contactName = sale.patient_name || sale.customer_name || 'Cliente general';
        console.log('[syncSale] using default customer (fallback), contact_id:', contactId);
      }
    } else {
      contactId = await ensureDefaultCustomerContact();
      contactName = sale.patient_name || sale.customer_name || 'Cliente general';
      console.log('[syncSale] using default customer (no customer_id), contact_id:', contactId);
    }

    // 2. Get tax ID and category ID
    const hasTax = sale.iva_enabled === true && (sale.iva_amount > 0 || sale.iva_rate > 0);
    console.log('[syncSale] sale tax check:', { iva_enabled: sale.iva_enabled, iva_amount: sale.iva_amount, iva_rate: sale.iva_rate, hasTax });
    const taxId = hasTax ? await getOrCreateTax() : null;
    const categoryId = await getOrCreateCategory();

    // 3. Build invoice payload
    const invoiceData = mapSaleToInvoice(sale, sale.sale_items, taxId, categoryId, {
      contactId,
      contactName,
    });
    console.log('[syncSale] invoice item payload:', JSON.stringify(invoiceData.items, null, 2));
    console.log('[syncSale] final invoice payload:', JSON.stringify(invoiceData, null, 2));

    // 4. Create invoice
    const invoice = await akauntingApi.createDocument(invoiceData);
    const invoiceId = invoice?.id || invoice?.data?.id;
    if (!invoiceId) {
      throw new Error('Akaunting no devolvió un ID de factura');
    }

    // 5. ATOMIC: Save mapping + mark sale as synced BEFORE payment sync
    // This prevents duplicate invoices even if payment sync fails.
    await db.saveAkauntingMapping('sale', sale.id, String(invoiceId));
    await db.markSaleAsSynced(sale.id, invoiceId);
    console.log('[syncSale] invoice mapping saved atomically, invoice_id:', invoiceId);

    // 6. Sync payments (idempotent — checks existing transactions)
    await syncPaymentsForInvoice(sale, invoiceId);

    return { action: 'created', akauntingId: String(invoiceId) };
  } catch (e) {
    // On any error, clear sync_in_progress so the sale can be retried
    await db.clearSaleSyncInProgress(sale.id).catch(() => {});
    throw e;
  }
};

export const syncAllSales = async () => {
  const settings = await initAkauntingClient();
  if (!settings.sync_sales) {
    throw new Error('La sincronización de ventas está deshabilitada en la configuración.');
  }

  const sales = await db.getUnsyncedSales(50);
  const results = { created: 0, updated: 0, failed: 0, skipped: 0, synced_payments: 0, payment_failed: 0, total: sales.length, errors: [] };

  for (const sale of sales) {
    try {
      const res = await syncSale(sale);
      if (results[res.action] !== undefined) {
        results[res.action]++;
      } else {
        results.skipped++;
      }
    } catch (e) {
      results.failed++;
      const errMsg = e.message || 'Error desconocido';
      console.error(`[syncAllSales] sale ${sale.id} failed:`, errMsg);
      results.errors.push({
        name: `Venta #${sale.id.slice(0, 8)}`,
        error: errMsg,
        saleId: sale.id,
      });
      // Ensure sync_in_progress is cleared on failure
      await db.clearSaleSyncInProgress(sale.id).catch(() => {});
    }
  }

  console.log('[syncAllSales] batch complete:', results);
  return results;
};

// ── RETRY SINGLE SALE ───────────────────────────────────────

export const syncSaleById = async (saleId) => {
  const sale = await db.getSaleById(saleId);
  if (!sale) {
    throw new Error('Venta no encontrada');
  }
  if (sale.voided) {
    throw new Error('No se pueden sincronizar ventas anuladas');
  }
  const res = await syncSale(sale);
  return res;
};
