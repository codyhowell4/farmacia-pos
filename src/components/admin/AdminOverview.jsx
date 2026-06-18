import { formatMXN } from '@/lib/currency';
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { DollarSign, Package, ShoppingCart, Users, TrendingUp, XCircle, UserCog, ClipboardList, Pill, Clock, AlertTriangle, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { getSales, getInventory, getUsers, getActivePrescriptionCount, getPreorders, getAppointments } from '@/lib/db';

const AdminOverview = () => {
  const [stats, setStats] = useState({
    totalSales: 0, totalRevenue: 0, totalInventory: 0,
    totalUsers: 0, lowStockItems: 0, outOfStockItems: 0,
    pendingPrescriptions: 0, pendingPreorders: 0,
    appointmentsToday: 0, pendingOrders: 0,
  });
  const [dateRange, setDateRange] = useState({
    startDate: '',
    endDate: '',
  });
  const navigate = useNavigate();

  useEffect(() => {
    loadData();
  }, [dateRange]);

  const loadData = async () => {
    try {
      const [sales, inventory, users, activeRxCount, preorders, appointments] = 
        await Promise.all([getSales(), getInventory(), getUsers(), getActivePrescriptionCount(), getPreorders(), getAppointments()]);
      
      // Filter sales by date range if specified
      let filteredSales = sales.filter(s => !s.voided);
      if (dateRange.startDate) {
        const start = new Date(dateRange.startDate);
        filteredSales = filteredSales.filter(s => new Date(s.created_at) >= start);
      }
      if (dateRange.endDate) {
        const end = new Date(dateRange.endDate);
        end.setHours(23, 59, 59, 999);
        filteredSales = filteredSales.filter(s => new Date(s.created_at) <= end);
      }
      
      const totalRevenue = filteredSales.reduce((sum, sale) => sum + sale.total, 0);
      const lowStockItems = inventory.filter(item => item.quantity > 0 && item.quantity < (item.low_stock_threshold || 10)).length;
      const outOfStockItems = inventory.filter(item => item.quantity === 0).length;
      const pendingPrescriptions = activeRxCount;
      const pendingPreorders = preorders.filter(p => (p.status || 'pending') === 'pending').length;
      const today = new Date().toISOString().split('T')[0];
      const appointmentsToday = appointments.filter(a => a.appointment_date && a.appointment_date.startsWith(today)).length;
      const pendingOrders = sales.filter(s => !s.voided && (s.status === 'pending' || s.status === 'processing')).length;
      
      setStats({
        totalSales: filteredSales.length,
        totalRevenue,
        totalInventory: inventory.length,
        totalUsers: users.length,
        lowStockItems,
        outOfStockItems,
        pendingPrescriptions,
        pendingPreorders,
        appointmentsToday,
        pendingOrders,
      });
    } catch (error) {
      console.error(error);
    }
  };

  const statCards = [
    { label: 'Ingresos totales', value: formatMXN(stats.totalRevenue), icon: DollarSign, color: 'from-green-500 to-emerald-600', path: '/admin/sales' },
    { label: 'Total de ventas', value: stats.totalSales, icon: ShoppingCart, color: 'from-blue-500 to-indigo-600', path: '/admin/sales' },
    { label: 'Artículos en inventario', value: stats.totalInventory, icon: Package, color: 'from-purple-500 to-pink-600', path: '/admin/inventory' },
    { label: 'Usuarios totales', value: stats.totalUsers, icon: Users, color: 'from-sky-500 to-cyan-600', path: '/admin/users' },
    { label: 'Stock bajo', value: stats.lowStockItems, icon: TrendingUp, color: 'from-yellow-500 to-orange-600', path: '/admin/inventory' },
    { label: 'Sin existencias', value: stats.outOfStockItems, icon: XCircle, color: 'from-red-500 to-rose-600', path: '/admin/inventory' },
    { label: 'Recetas pendientes', value: stats.pendingPrescriptions, icon: ClipboardList, color: 'from-amber-500 to-yellow-600', path: '/admin/prescriptions' },
    { label: 'Recargas pendientes', value: stats.pendingPreorders, icon: Pill, color: 'from-teal-500 to-emerald-600', path: '/admin/preorders' },
    { label: 'Citas hoy', value: stats.appointmentsToday, icon: Clock, color: 'from-violet-500 to-purple-600', path: '/admin/appointments' },
    { label: 'Pedidos pendientes', value: stats.pendingOrders, icon: ShoppingCart, color: 'from-orange-500 to-red-600', path: '/admin/orders' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Resumen del sistema</h2>
        <p className="text-slate-600">Bienvenido al sistema de gestión de farmacia</p>
      </div>

      {/* Date Range Selector */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-xl shadow p-4 border border-slate-200"
      >
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="w-5 h-5 text-slate-500" />
          <h3 className="font-semibold text-slate-900">Filtrar por fecha</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label className="text-sm text-slate-600">Fecha inicio</Label>
            <Input
              type="date"
              value={dateRange.startDate}
              onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-sm text-slate-600">Fecha fin</Label>
            <Input
              type="date"
              value={dateRange.endDate}
              onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
            />
          </div>
        </div>
        {(dateRange.startDate || dateRange.endDate) && (
          <button
            onClick={() => setDateRange({ startDate: '', endDate: '' })}
            className="mt-3 text-sm text-blue-600 hover:text-blue-800 underline"
          >
            Limpiar filtros
          </button>
        )}
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.08 }}
              className="bg-white rounded-xl shadow-lg p-6 border border-slate-200 hover:shadow-xl hover:ring-2 hover:ring-blue-500 transition-all cursor-pointer overflow-hidden"
              onClick={() => navigate(stat.path)}
            >
              <div className="flex items-center justify-between relative">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-600 mb-1 truncate">{stat.label}</p>
                  <p className="text-3xl font-bold text-slate-900">{stat.value}</p>
                </div>
                <div className={`bg-gradient-to-br ${stat.color} p-3 rounded-lg shrink-0 ml-2`}>
                  <Icon className="w-8 h-8 text-white" />
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg p-8 text-white"
      >
        <h3 className="text-2xl font-bold mb-4">Acciones rápidas</h3>
        <p className="text-blue-100 mb-4">Usa el menú lateral para navegar entre las secciones del panel</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <motion.div 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="bg-white/10 backdrop-blur-sm rounded-lg p-4 cursor-pointer hover:bg-white/20 transition-colors"
            onClick={() => navigate('/admin/users')}
          >
            <UserCog className="w-6 h-6 mb-2" />
            <p className="font-semibold">Gestionar usuarios</p>
            <p className="text-sm text-blue-100">Agrega, edita o elimina usuarios</p>
          </motion.div>
          <motion.div 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="bg-white/10 backdrop-blur-sm rounded-lg p-4 cursor-pointer hover:bg-white/20 transition-colors"
            onClick={() => navigate('/admin/sales')}
          >
            <ShoppingCart className="w-6 h-6 mb-2" />
            <p className="font-semibold">Ver ventas</p>
            <p className="text-sm text-blue-100">Consulta todas las transacciones</p>
          </motion.div>
          <motion.div 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="bg-white/10 backdrop-blur-sm rounded-lg p-4 cursor-pointer hover:bg-white/20 transition-colors"
            onClick={() => navigate('/admin/inventory')}
          >
            <Package className="w-6 h-6 mb-2" />
            <p className="font-semibold">Monitorear inventario</p>
            <p className="text-sm text-blue-100">Revisa los niveles de stock</p>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
};

export default AdminOverview;
