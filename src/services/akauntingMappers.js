// ============================================================
// akauntingMappers.js — Pure data transformers
// Farmacia shape → Akaunting shape
// ============================================================

/**
 * Map a Farmacia profile to an Akaunting Contact payload.
 * @param {Object} profile — row from profiles table
 * @returns {Object} Akaunting contact payload
 */
export const mapProfileToContact = (profile) => {
  const payload = {
    type: 'customer',
    name: profile.full_name || 'Sin nombre',
    phone: profile.phone || '',
    currency_code: 'MXN',
    enabled: true,
  };

  if (profile.email) {
    payload.email = profile.email;
  }

  return payload;
};

/**
 * Map a Farmacia customer to an Akaunting Contact payload.
 * @param {Object} customer — row from customers table
 * @returns {Object} Akaunting contact payload
 */
export const mapCustomerToContact = (customer) => {
  const payload = {
    type: 'customer',
    name: customer.full_name || 'Sin nombre',
    phone: customer.phone || '',
    currency_code: 'MXN',
    enabled: true,
  };

  if (customer.email) {
    payload.email = customer.email;
  }

  return payload;
};

/**
 * Map a Farmacia inventory item to an Akaunting Item payload.
 * @param {Object} item — row from inventory table
 * @param {string|null} categoryId — Akaunting item category ID
 * @returns {Object} Akaunting item payload
 */
export const mapInventoryToItem = (item, categoryId) => {
  return {
    type: 'product',
    name: item.name,
    description: item.use_description || item.use || '',
    sale_price: Number(item.price) || 0,
    purchase_price: Number(item.cost) || 0,
    quantity: Number(item.quantity) || 0,
    enabled: true,
    sku: item.barcode || null,
    category_id: categoryId ? Number(categoryId) : null,
  };
};

/**
 * Map a Farmacia payment method to an Akaunting payment method string.
 * @param {string} method — Farmacia payment method
 * @returns {string} Akaunting payment method
 */
export const mapPaymentMethod = (method) => {
  const map = {
    cash: 'cash',
    card: 'card',
    transferencia: 'transfer',
    insurance: 'other',
  };
  return map[method] || 'other';
};

/**
 * Map a Farmacia sale + items to an Akaunting Document (Invoice) payload.
 * @param {Object} sale — row from sales table
 * @param {Array} saleItems — rows from sale_items
 * @param {string|null} taxId — Akaunting tax ID
 * @param {string|null} categoryId — Akaunting category ID
 * @param {Object} contactInfo — {contactId, contactName} resolved Akaunting contact
 * @returns {Object} Akaunting document payload
 */
export const mapSaleToInvoice = (sale, saleItems, taxId, categoryId, contactInfo) => {
  const dateStr = sale.timestamp
    ? sale.timestamp.split('T')[0]
    : new Date().toISOString().split('T')[0];

  const items = (saleItems || []).map((item) => {
    const line = {
      name: item.name,
      description: item.description || item.name || '',
      quantity: Number(item.quantity) || 1,
      price: Number(item.price) || 0,
    };
    // Only add tax if the POS sale actually included IVA
    const hasTax = sale.iva_enabled === true && (sale.iva_amount > 0 || sale.iva_rate > 0);
    if (taxId && hasTax) {
      line.tax_ids = [Number(taxId)];
    }
    return line;
  });

  // Akaunting 3.x REQUIRES the "amount" field even when items are present.
  // If amount > 0, Akaunting treats it as a separate header charge and ADDS
  // line items on top — causing double-counting. The safe value is 0, letting
  // line items define the entire invoice total.

  return {
    type: 'invoice',
    document_number: `FARM-${sale.id.slice(0, 8).toUpperCase()}`,
    status: 'sent',
    issued_at: dateStr,
    due_at: dateStr,
    amount: 0,
    currency_code: 'MXN',
    currency_rate: 1,
    category_id: categoryId ? Number(categoryId) : null,
    contact_id: contactInfo?.contactId ? Number(contactInfo.contactId) : null,
    contact_name: contactInfo?.contactName || sale.patient_name || sale.customer_name || 'Cliente general',
    notes: `Venta Farmacia POS #${sale.id} | Cajero: ${sale.salesperson || 'N/A'}`.trim(),
    items,
  };
};
