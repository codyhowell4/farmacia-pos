import { supabase } from '../lib/supabase';

/**
 * Get daily sales summary for date range
 * @param {string} startDate - ISO date string
 * @param {string} endDate - ISO date string
 */
export async function getDailySalesSummary(startDate, endDate) {
  const { data, error } = await supabase
    .from('daily_sales_summary')
    .select('*')
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: false });
  
  if (error) throw error;
  return data || [];
}

/**
 * Get top selling products
 * @param {number} limit - Number of products to return
 */
export async function getTopProducts(limit = 20) {
  const { data, error } = await supabase
    .from('top_products')
    .select('*')
    .limit(limit);
  
  if (error) throw error;
  return data || [];
}

/**
 * Get dead stock items (not sold in 90+ days)
 */
export async function getDeadStock() {
  const { data, error } = await supabase
    .from('dead_stock')
    .select('*')
    .order('days_since_last_sale', { ascending: false, nullsFirst: true });
  
  if (error) throw error;
  return data || [];
}

/**
 * Get inventory valuation by category
 */
export async function getInventoryValuation() {
  const { data, error } = await supabase
    .from('inventory_valuation')
    .select('*');
  
  if (error) throw error;
  return data || [];
}

/**
 * Get profit report for date range
 * @param {string} startDate - ISO date string
 * @param {string} endDate - ISO date string
 */
export async function getProfitReport(startDate, endDate) {
  const { data, error } = await supabase
    .from('profit_report')
    .select('*')
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: false });
  
  if (error) throw error;
  return data || [];
}

/**
 * Get shift report with payment breakdowns
 */
export async function getShiftReport() {
  const { data, error } = await supabase
    .from('shift_report')
    .select('*')
    .order('start_time', { ascending: false });
  
  if (error) throw error;
  return data || [];
}

/**
 * Close a specific shift
 * @param {string} shiftId - Shift UUID
 * @param {number} finalCash - Final cash amount
 * @param {string} notes - Optional notes
 */
export async function closeShift(shiftId, finalCash, notes = '') {
  const { error } = await supabase.rpc('close_shift', {
    p_shift_id: shiftId,
    p_final_cash: finalCash,
    p_notes: notes,
  });
  
  if (error) throw error;
}

/**
 * Close all open shifts (admin function)
 */
export async function closeAllOpenShifts() {
  const { data: user } = await supabase.auth.getUser();
  const { data: org } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.user.id)
    .single();
  
  const { data, error } = await supabase.rpc('close_all_open_shifts', {
    p_org_id: org.org_id,
    p_closed_by: user.user.id,
  });
  
  if (error) throw error;
  return data || [];
}

/**
 * Get dashboard overview stats
 */
export async function getDashboardOverview() {
  const today = new Date().toISOString().split('T')[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  const [sales, inventory, deadStock, openShifts] = await Promise.all([
    getDailySalesSummary(thirtyDaysAgo, today),
    getInventoryValuation(),
    getDeadStock(),
    getShiftReport().then(shifts => shifts.filter(s => s.status === 'open')),
  ]);
  
  const todaySales = sales.find(s => s.date === today);
  const totalRevenue = sales.reduce((sum, s) => sum + (s.total_revenue || 0), 0);
  const totalInventoryValue = inventory.reduce((sum, cat) => sum + (cat.total_retail_value || 0), 0);
  
  return {
    today: {
      sales: todaySales?.total_sales || 0,
      revenue: todaySales?.total_revenue || 0,
    },
    last30Days: {
      sales: sales.reduce((sum, s) => sum + (s.total_sales || 0), 0),
      revenue: totalRevenue,
    },
    inventory: {
      totalValue: totalInventoryValue,
      itemCount: inventory.reduce((sum, cat) => sum + (cat.item_count || 0), 0),
    },
    deadStock: {
      count: deadStock.length,
      value: deadStock.reduce((sum, item) => sum + (item.inventory_value || 0), 0),
    },
    openShifts: openShifts.length,
  };
}

/**
 * Format currency for display
 */
export function formatCurrency(amount) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
  }).format(amount || 0);
}

/**
 * Format number with commas
 */
export function formatNumber(num) {
  return new Intl.NumberFormat('es-MX').format(num || 0);
}
