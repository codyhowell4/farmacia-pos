import { supabase } from '../lib/supabase';
import { fetchAllPages } from '../lib/db';

/**
 * Get prescription-required medications sold in a date range.
 * Returns one FLATTENED row per sale item whose inventory item requires
 * a receta (this is not the controlled-substances registry — Grupo II/III
 * items are flagged in inventory.controlled_group). Receta metadata is
 * merged from the prescriptions row linked to the sale (sale_id); items
 * without a linked receta keep their rx fields blank instead of being
 * dropped.
 */
export async function getControlledSubstancesSales(startDate, endDate) {
  const data = await fetchAllPages(() =>
    supabase
      .from('sales')
      .select('*, sale_items(*, inventory:inventory_id(name, requires_prescription, barcode))')
      .gte('timestamp', startDate)
      .lte('timestamp', endDate + 'T23:59:59')
      .order('timestamp', { ascending: false })
  );

  // Only sales containing at least one Rx-required item contribute rows
  const rxSales = (data || []).filter(sale =>
    (sale.sale_items || []).some(item => item.inventory?.requires_prescription)
  );

  // Batch-fetch the receta rows linked to those sales and index by sale_id
  const saleIds = rxSales.map(sale => sale.id);
  let rxBySaleId = {};
  if (saleIds.length > 0) {
    // .order('sale_id') added: offset pagination needs a deterministic order;
    // rows only feed the sale_id map below, so the order is unobservable.
    const prescriptions = await fetchAllPages(() =>
      supabase
        .from('prescriptions')
        .select('sale_id, patient_name, patient_curp, doctor_name, doctor_license_number, prescription_number, prescription_date')
        .in('sale_id', saleIds)
        .order('sale_id')
    );
    rxBySaleId = Object.fromEntries((prescriptions || []).map(p => [p.sale_id, p]));
  }

  return rxSales.flatMap(sale => {
    const rx = rxBySaleId[sale.id] || {};
    return (sale.sale_items || [])
      .filter(item => item.inventory?.requires_prescription)
      .map(item => ({
        sale_id: sale.id,
        sale_date: sale.timestamp || sale.created_at,
        patient_name: rx.patient_name || sale.patient_name || '',
        patient_curp: rx.patient_curp || sale.patient_curp || '',
        doctor_name: rx.doctor_name || '',
        doctor_license_number: rx.doctor_license_number || '',
        prescription_number: rx.prescription_number || '',
        prescription_date: rx.prescription_date || '',
        medication_name: item.inventory?.name || item.name || '',
        quantity: item.quantity,
        rx_number: item.rx_number || '',
        total: (item.quantity || 0) * (item.price || 0),
      }));
  });
}

/**
 * Get inventory movement for a date range
 * Queries inventory_movements table (unified: sales, returns, adjustments, purchases, voids, edits).
 */
export async function getInventoryMovement(startDate, endDate) {
  return fetchAllPages(() =>
    supabase
      .from('inventory_movements')
      .select('*, inventory:inventory_id(name, barcode)')
      .gte('created_at', startDate)
      .lte('created_at', endDate + 'T23:59:59')
      .order('created_at', { ascending: false })
  );
}

/**
 * Get expiring items with their status
 * Queries inventory directly since expiration_tracking view may not exist.
 */
export async function getExpiringItems(days = 90) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + days);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  const data = await fetchAllPages(() =>
    supabase
      .from('inventory')
      .select('*')
      .not('expiration_date', 'is', null)
      .lte('expiration_date', cutoffStr)
      .order('expiration_date', { ascending: true })
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (data || []).map(item => {
    const exp = item.expiration_date ? new Date(item.expiration_date) : null;
    if (exp) exp.setHours(0, 0, 0, 0);
    const daysUntil = exp ? Math.ceil((exp - today) / (1000 * 60 * 60 * 24)) : null;
    return {
      ...item,
      days_until_expiry: daysUntil,
      status: daysUntil < 0 ? 'EXPIRED' : daysUntil <= 30 ? 'EXPIRING_SOON' : 'OK',
    };
  });
}

/**
 * Get expired items
 */
export async function getExpiredItems() {
  const today = new Date().toISOString().split('T')[0];

  const data = await fetchAllPages(() =>
    supabase
      .from('inventory')
      .select('*')
      .not('expiration_date', 'is', null)
      .lt('expiration_date', today)
      .order('expiration_date', { ascending: true })
  );

  return (data || []).map(item => ({ ...item, days_until_expiry: -1, status: 'EXPIRED' }));
}

/**
 * Export data to CSV format
 */
export function exportToCSV(data, headers) {
  const headerRow = headers.map(h => `"${h.label}"`).join(',');
  const rows = data.map(row => {
    return headers.map(h => {
      const value = row[h.key] ?? '';
      const escaped = String(value).replace(/"/g, '""');
      if (escaped.includes(',') || escaped.includes('\n') || escaped.includes('"')) {
        return `"${escaped}"`;
      }
      return escaped;
    }).join(',');
  });
  return [headerRow, ...rows].join('\n');
}

/**
 * Download CSV file
 */
export function downloadCSV(csvContent, filename) {
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function formatReportDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('es-MX', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export function formatReportDateTime(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString('es-MX', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
