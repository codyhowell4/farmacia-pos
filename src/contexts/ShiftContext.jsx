import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { logAudit, AUDIT_ACTIONS } from '@/lib/auditLog';
import { getOpenShift, createShift, closeShiftDb, getSales } from '@/lib/db';
import { formatMXN } from '@/lib/currency';

const ShiftContext = createContext(null);

export const ShiftProvider = ({ children }) => {
  const { user } = useAuth();
  const [activeShift, setActiveShift] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id || !user?.locationId) { setActiveShift(null); setLoading(false); return; }
    getOpenShift(user.id, user.locationId)
      .then(shift => setActiveShift(shift || null))
      .catch(() => setActiveShift(null))
      .finally(() => setLoading(false));
  }, [user?.id, user?.locationId]);

  const openShift = async (startingCash) => {
    const shift = await createShift({
      opened_by: user.id,
      opened_by_name: user.name,
      location_id: user.locationId,
      starting_cash: parseFloat(startingCash),
      opened_at: new Date().toISOString(),
    });
    setActiveShift(shift);
    logAudit({
      action: AUDIT_ACTIONS.SHIFT_OPEN,
      user,
      details: `Efectivo inicial: ${formatMXN(parseFloat(startingCash))}`,
    });
    return shift;
  };

  const closeShift = async (closingCash, notes = '') => {
    if (!activeShift) return null;

    // Calculate shift totals from DB sales
    const allSales = await getSales();
    const shiftSales = allSales.filter(s =>
      !s.voided &&
      s.location_id === activeShift.location_id &&
      new Date(s.timestamp) >= new Date(activeShift.opened_at)
    );

    const totalCash = shiftSales.filter(s => s && (s.payment_method === 'cash' || !s.payment_method)).reduce((sum, s) => sum + (s?.total || 0), 0);
    const totalCard = shiftSales.filter(s => s && s.payment_method === 'card').reduce((sum, s) => sum + (s?.total || 0), 0);
    const totalInsurance = shiftSales.filter(s => s && s.payment_method === 'insurance').reduce((sum, s) => sum + (s?.total || 0), 0);
    const totalRevenue = shiftSales.filter(s => s).reduce((sum, s) => sum + (s?.total || 0), 0);
    const expectedCash = activeShift.starting_cash + totalCash;
    const variance = parseFloat(closingCash) - expectedCash;

    const closedShift = await closeShiftDb(activeShift.id, {
      closed_at: new Date().toISOString(),
      closing_cash: parseFloat(closingCash),
      expected_cash: expectedCash,
      variance,
      notes,
      total_sales: shiftSales.length,
      total_revenue: totalRevenue,
      total_cash: totalCash,
      total_card: totalCard,
      total_insurance: totalInsurance,
    });

    setActiveShift(null);
    logAudit({
      action: AUDIT_ACTIONS.SHIFT_CLOSE,
      user,
      details: `Ingresos: ${formatMXN(totalRevenue)} | Variación: ${formatMXN(variance)}`,
    });
    return { ...closedShift, summary: { totalSales: shiftSales.length, totalRevenue, totalCash, totalCard, totalInsurance } };
  };

  return (
    <ShiftContext.Provider value={{ activeShift, loading, openShift, closeShift }}>
      {children}
    </ShiftContext.Provider>
  );
};

export const useShift = () => {
  const ctx = useContext(ShiftContext);
  if (!ctx) throw new Error('useShift must be used within ShiftProvider');
  return ctx;
};
