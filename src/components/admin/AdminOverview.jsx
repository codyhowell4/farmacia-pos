import { formatMXN } from '@/lib/currency';
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { DollarSign, Package, ShoppingCart, Users, TrendingUp, XCircle, UserCog } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { getSales, getInventory, getUsers } from '@/lib/db';

const AdminOverview = () => {
  const [stats, setStats] = useState({
    totalSales: 0, totalRevenue: 0, totalInventory: 0,
    totalUsers: 0, lowStockItems: 0, outOfStockItems: 0,
  });
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([getSales(), getInventory(), getUsers()])
      .then(([sales, inventory, users]) => {
        const totalRevenue = sales.filter(s => !s.voided).reduce((sum, sale) => sum + sale.total, 0);
        const lowStockItems = inventory.filter(item => item.quantity > 0 && item.quantity < (item.low_stock_threshold || 10)).length;
        const outOfStockItems = inventory.filter(item => item.quantity === 0).length;
        setStats({
          totalSales: sales.filter(s => !s.voided).length,
          totalRevenue,
          totalInventory: inventory.length,
          totalUsers: users.length,
          lowStockItems,
          outOfStockItems,
        });
      })
      .catch(console.error);
  }, []);

  const statCards = [
    { label: 'Ingresos totales', value: formatMXN(stats.totalRevenue), icon: DollarSign, color: 'from-green-500 to-emerald-600', path: '/admin/sales' },
    { label: 'Total de ventas', value: stats.totalSales, icon: ShoppingCart, color: 'from-blue-500 to-indigo-600', path: '/admin/sales' },
    { label: 'Artículos en inventario', value: stats.totalInventory, icon: Package, color: 'from-purple-500 to-pink-600', path: '/admin/inventory' },
    { label: 'Usuarios totales', value: stats.totalUsers, icon: Users, color: 'from-sky-500 to-cyan-600', path: '/admin/users' },
    { label: 'Stock bajo', value: stats.lowStockItems, icon: TrendingUp, color: 'from-yellow-500 to-orange-600', path: '/admin/inventory' },
    { label: 'Sin existencias', value: stats.outOfStockItems, icon: XCircle, color: 'from-red-500 to-rose-600', path: '/admin/inventory' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Resumen del sistema</h2>
        <p className="text-slate-600">Bienvenido al sistema de gestión de farmacia</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.08 }}
              className="bg-white rounded-xl shadow-lg p-6 border border-slate-200 hover:shadow-xl hover:ring-2 hover:ring-blue-500 transition-all cursor-pointer"
              onClick={() => navigate(stat.path)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 mb-1">{stat.label}</p>
                  <p className="text-3xl font-bold text-slate-900">{stat.value}</p>
                </div>
                <div className={`bg-gradient-to-br ${stat.color} p-3 rounded-lg`}>
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