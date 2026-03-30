import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Package, ShoppingCart, LogOut, BarChart3, Store, Ticket, Menu, X, Clock, Shield, Settings, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import AdminUsers from '@/components/admin/AdminUsers';
import AdminSales from '@/components/admin/AdminSales';
import AdminInventory from '@/components/admin/AdminInventory';
import AdminOverview from '@/components/admin/AdminOverview';
import AdminDiscounts from '@/components/admin/AdminDiscounts';
import AdminShifts from '@/components/admin/AdminShifts';
import AdminAuditLog from '@/components/admin/AdminAuditLog';
import AdminSettings from '@/pages/AdminSettings';
import AdminSuppliers from '@/components/admin/AdminSuppliers';

const AdminDashboard = () => {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  const getCurrentTab = () => {
    const path = location.pathname;
    if (path.includes('/users')) return 'users';
    if (path.includes('/sales')) return 'sales';
    if (path.includes('/inventory')) return 'inventory';
    if (path.includes('/discounts')) return 'discounts';
    if (path.includes('/shifts')) return 'shifts';
    if (path.includes('/audit')) return 'audit';
    if (path.includes('/suppliers')) return 'suppliers';
    if (path.includes('/settings')) return 'settings';
    return 'overview';
  };
  
  const [activeTab, setActiveTab] = useState(getCurrentTab());

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { id: 'overview', label: 'Resumen', icon: BarChart3, path: '/admin' },
    { id: 'users', label: 'Usuarios', icon: Users, path: '/admin/users' },
    { id: 'sales', label: 'Ventas', icon: ShoppingCart, path: '/admin/sales' },
    { id: 'inventory', label: 'Inventario', icon: Package, path: '/admin/inventory' },
    { id: 'discounts', label: 'Descuentos', icon: Ticket, path: '/admin/discounts' },
    { id: 'shifts', label: 'Turnos', icon: Clock, path: '/admin/shifts' },
    { id: 'audit', label: 'Auditoría', icon: Shield, path: '/admin/audit' },
    { id: 'suppliers', label: 'Proveedores', icon: Truck, path: '/admin/suppliers' },
    { id: 'settings', label: 'Configuración', icon: Settings, path: '/admin/settings' },
  ];

  const SideNav = () => (
    <nav className="space-y-2">
      {navItems.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            onClick={() => {
              setActiveTab(item.id);
              navigate(item.path);
              setIsMenuOpen(false);
            }}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${
              activeTab === item.id
                ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-md'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Icon className="w-5 h-5" />
            <span className="font-medium">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );

  return (
    <>
      <Helmet>
        <title>Panel de administración - Farmacia</title>
        <meta name="description" content="Panel de administración del sistema de farmacia" />
      </Helmet>

      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
        <nav className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center space-x-3">
                 <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setIsMenuOpen(!isMenuOpen)}>
                    <Menu className="w-6 h-6" />
                </Button>
                <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-2 rounded-lg">
                  <Store className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-slate-900">Portal de administración</h1>
                  <p className="text-xs text-slate-500">Bienvenido, {user?.name}</p>
                </div>
              </div>
              <Button onClick={handleLogout} variant="outline" className="flex items-center space-x-2">
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Cerrar sesión</span>
              </Button>
            </div>
          </div>
        </nav>

        {/* Mobile Menu */}
        <AnimatePresence>
            {isMenuOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/50 z-50 lg:hidden"
                    onClick={() => setIsMenuOpen(false)}
                >
                    <motion.div
                        initial={{ x: '-100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '-100%' }}
                        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                        className="fixed top-0 left-0 h-full w-72 bg-white shadow-xl p-4"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-lg font-bold">Menú</h2>
                            <Button variant="ghost" size="icon" onClick={() => setIsMenuOpen(false)}>
                                <X className="w-6 h-6" />
                            </Button>
                        </div>
                        <SideNav />
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="lg:grid lg:grid-cols-12 lg:gap-8">
            <aside className="hidden lg:block lg:col-span-3 xl:col-span-2">
                <div className="bg-white rounded-xl shadow-lg p-4 h-fit sticky top-24">
                    <SideNav />
                </div>
            </aside>
            <main className="lg:col-span-9 xl:col-span-10">
              <Routes>
                <Route path="/" element={<AdminOverview />} />
                <Route path="/users" element={<AdminUsers />} />
                <Route path="/sales" element={<AdminSales />} />
                <Route path="/inventory" element={<AdminInventory />} />
                <Route path="/discounts" element={<AdminDiscounts />} />
                <Route path="/shifts" element={<AdminShifts />} />
                <Route path="/audit" element={<AdminAuditLog />} />
                <Route path="/suppliers" element={<AdminSuppliers />} />
                <Route path="/settings" element={<AdminSettings />} />
              </Routes>
            </main>
          </div>
        </div>
      </div>
    </>
  );
};

export default AdminDashboard;