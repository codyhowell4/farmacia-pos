import { supabase } from '../lib/supabase';

/**
 * Get controlled substances sales for a date range
 * @param {string} startDate - ISO date string
 * @param {string} endDate - ISO date string
 * @returns {Promise<Array>}
 */
export async function getControlledSubstancesSales(startDate, endDate) {
  const { data, error } = await supabase
    .from('controlled_substances_sales')
    .select('*')
    .gte('sale_date', startDate)
    .lte('sale_date', endDate + 'T23:59:59')
    .order('sale_date', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Get inventory movement (adjustments) for a date range
 * @param {string} startDate - ISO date string
 * @param {string} endDate - ISO date string
 * @returns {Promise<Array>}
 */
export async function getInventoryMovement(startDate, endDate) {
  const { data, error } = await supabase
    .from('inventory_movement')
    .select('*')
    .gte('created_at', startDate)
    .lte('created_at', endDate + 'T23:59:59')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Get expiring items with their status
 * @param {number} days - Number of days to look ahead
 * @returns {Promise<Array>}
 */
export async function getExpiringItems(days = 90) {
  const { data, error } = await supabase
    .from('expiration_tracking')
    .select('*')
    .lte('days_until_expiry', days)
    .order('days_until_expiry', { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Get expired items
 * @returns {Promise<Array>}
 */
export async function getExpiredItems() {
  const { data, error } = await supabase
    .from('expiration_tracking')
    .select('*')
    .eq('status', 'EXPIRED');

  if (error) throw error;
  return data || [];
}

/**
 * Export data to CSV format
 * @param {Array} data - Array of objects
 * @param {Array} headers - Array of {key, label} objects
 * @returns {string} CSV content
 */
export function exportToCSV(data, headers) {
  const headerRow = headers.map(h => `"${h.label}"`).join(',');
  const rows = data.map(row => {
    return headers.map(h => {
      const value = row[h.key] ?? '';
      // Escape quotes and wrap in quotes if contains comma
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
 * @param {string} csvContent - CSV content
 * @param {string} filename - Filename without extension
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

/**
 * Format date for reports
 * @param {string} dateStr - ISO date string
 * @returns {string} Formatted date
 */
export function formatReportDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('es-MX', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

/**
 * Format datetime for reports
 * @param {string} dateStr - ISO datetime string
 * @returns {string} Formatted datetime
 */
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
