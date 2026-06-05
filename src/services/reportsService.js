import { supabase } from '../lib/supabase';

/**
 * Get controlled substances sales for a date range
 * Queries actual tables (sales + sale_items + inventory) since the
 * controlled_substances_sales view may not exist yet.
 */
export async function getControlledSubstancesSales(startDate, endDate) {
  const { data, error } = await supabase
    .from('sales')
    .select('*, sale_items(*, inventory:inventory_id(name, requires_prescription, barcode))')
    .gte('timestamp', startDate)
    .lte('timestamp', endDate + 'T23:59:59')
    .order('timestamp', { ascending: false });

  if (error) throw error;

  // Filter to sales that have at least one controlled/prescription item
  const filtered = (data || []).filter(sale => {
    const items = sale.sale_items || [];
    return items.some(item => item.inventory?.requires_prescription);
  }).map(sale => ({
    ...sale,
    controlled_items: (sale.sale_items || []).filter(item => item.inventory?.requires_prescription),
  }));

  return filtered;
}

/**
 * Get inventory movement for a date range
 * Queries inventory_movements table (unified: sales, returns, adjustments, purchases, voids, edits).
 */
export async function getInventoryMovement(startDate, endDate) {
  const { data, error } = await supabase
    .from('inventory_movements')
    .select('*, inventory:inventory_id(name, barcode)')
    .gte('created_at', startDate)
    .lte('created_at', endDate + 'T23:59:59')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Get expiring items with their status
 * Queries inventory directly since expiration_tracking view may not exist.
 */
export async function getExpiringItems(days = 90) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + days);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('inventory')
    .select('*')
    .not('expiration_date', 'is', null)
    .lte('expiration_date', cutoffStr)
    .order('expiration_date', { ascending: true });

  if (error) throw error;

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

  const { data, error } = await supabase
    .from('inventory')
    .select('*')
    .not('expiration_date', 'is', null)
    .lt('expiration_date', today)
    .order('expiration_date', { ascending: true });

  if (error) throw error;
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
