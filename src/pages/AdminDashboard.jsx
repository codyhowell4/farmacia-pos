import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Package, ShoppingCart, LogOut, BarChart3, Store, Ticket, Menu, X, Clock, Shield,
  Settings, Truck, FileText, TrendingUp, BookOpen, UserCircle, Stethoscope, Smartphone,
  ClipboardList, Pill, CalendarDays, AlertTriangle, ChevronDown, ChevronRight,
} from 'lucide-react';
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
import ReportsPage from './ReportsPage';
import AdminReports from '@/components/admin/AdminReports';
import AdminAccounting from '@/components/admin/AdminAccounting';
import AdminCustomers from '@/components/admin/AdminCustomers';
import AdminDoctors from '@/components/admin/AdminDoctors';
import AdminPrescriptions from '@/components/admin/AdminPrescriptions';
import AdminPreorders from '@/components/admin/AdminPreorders';
import AdminAppointments from '@/components/admin/AdminAppointments';
import AdminOrders from '@/components/admin/AdminOrders';
import AdminCustomerProfile from '@/components/admin/AdminCustomerProfile';
import AdminReorderReport from '@/components/admin/AdminReorderReport';

const AdminDashboard = () => {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  
  const getCurrentTab = () => {
    const path = location.pathname;
    if (path === '/admin') return 'overview';
    if (path.includes('/users')) return 'users';
    if (path.includes('/customers')) return 'customers';
    if (path.includes('/sales')) return 'sales';
    if (path.includes('/inventory')) return 'inventory';
    if (path.includes('/discounts')) return 'discounts';
    if (path.includes('/shifts')) return 'shifts';
    if (path.includes('/audit')) return 'audit';
    if (path.includes('/suppliers')) return 'suppliers';
    if (path.includes('/reports')) return 'reports';
    if (path.includes('/analytics')) return 'analytics';
    if (path.includes('/settings')) return 'settings';
    if (path.includes('/accounting')) return 'accounting';
    if (path.includes('/doctors')) return 'doctors';
    if (path.includes('/prescriptions')) return 'prescriptions';
    if (path.includes('/preorders')) return 'preorders';
    if (path.includes('/appointments')) return 'appointments';
    if (path.includes('/orders')) return 'orders';
    if (path.includes('/reorder-report')) return 'reorder-report';
    return 'overview';
  };
  
  const [activeTab, setActiveTab] = useState(getCurrentTab());

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navigateTo = (path, id) => {
    setActiveTab(id);
    navigate(path);
    setIsMenuOpen(false);
  };

  const isActive = (id) => activeTab === id;

  const navButtonClass = (active) =>
    `w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${
      active
        ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-md'
        : 'text-slate-600 hover:bg-slate-100'
    }`;

  const subNavButtonClass = (active) =>
    `w-full flex items-center space-x-3 px-4 py-2 rounded-lg transition-all text-sm ${
      active
        ? 'bg-blue-50 text-blue-700 font-medium'
        : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
    }`;

  const SideNav = () => (
    <nav className="space-y-1">
      {/* Portal Cliente — Prominent external link */}
      <button
        onClick={() => window.open('/customer-app/', '_blank')}
        className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all border-2 border-dashed border-indigo-200 text-indigo-700 hover:bg-indigo-50 hover:border-indigo-300 mb-2"
      >
        <Smartphone className="w-5 h-5" />
        <span className="font-semibold">Portal Cliente</span>
      </button>

      {/* Main nav items */}
      <button onClick={() => navigateTo('/admin', 'overview')} className={navButtonClass(isActive('overview'))}>
        <BarChart3 className="w-5 h-5" />
        <span className="font-medium">Resumen</span>
      </button>

      <div className="py-2">
        <div className="h-px bg-slate-200 mx-4" />
      </div>

      <button onClick={() => navigateTo('/admin/sales', 'sales')} className={navButtonClass(isActive('sales'))}>
        <ShoppingCart className="w-5 h-5" />
        <span className="font-medium">Ventas</span>
      </button>
      <button onClick={() => navigateTo('/admin/orders', 'orders')} className={navButtonClass(isActive('orders'))}>
        <Package className="w-5 h-5" />
        <span className="font-medium">Pedidos</span>
      </button>
      <button onClick={() => navigateTo('/admin/inventory', 'inventory')} className={navButtonClass(isActive('inventory'))}>
        <Package className="w-5 h-5" />
        <span className="font-medium">Inventario</span>
      </button>
      <button onClick={() => navigateTo('/admin/suppliers', 'suppliers')} className={navButtonClass(isActive('suppliers'))}>
        <Truck className="w-5 h-5" />
        <span className="font-medium">Proveedores</span>
      </button>

      <div className="py-2">
        <div className="h-px bg-slate-200 mx-4" />
      </div>

      {/* Configuración — Collapsible submenu */}
      <div>
        <button
          onClick={() => setConfigOpen(!configOpen)}
          className={`w-full flex items-center justify-between px-4 py-3 rounded-lg transition-all ${
            ['users', 'doctors', 'customers', 'appointments', 'audit', 'settings'].includes(activeTab)
              ? 'bg-blue-50 text-blue-700'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <div className="flex items-center space-x-3">
            <Settings className="w-5 h-5" />
            <span className="font-medium">Configuración</span>
          </div>
          {configOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <AnimatePresence>
          {configOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden ml-2"
            >
              <div className="space-y-1 pt-1">
                <button onClick={() => navigateTo('/admin/users', 'users')} className={subNavButtonClass(isActive('users'))}>
                  <Users className="w-4 h-4" /><span>Usuarios</span>
                </button>
                <button onClick={() => navigateTo('/admin/doctors', 'doctors')} className={subNavButtonClass(isActive('doctors'))}>
                  <Stethoscope className="w-4 h-4" /><span>Médicos</span>
                </button>
                <button onClick={() => navigateTo('/admin/customers', 'customers')} className={subNavButtonClass(isActive('customers'))}>
                  <UserCircle className="w-4 h-4" /><span>Clientes</span>
                </button>
                <button onClick={() => navigateTo('/admin/appointments', 'appointments')} className={subNavButtonClass(isActive('appointments'))}>
                  <CalendarDays className="w-4 h-4" /><span>Citas</span>
                </button>
                <button onClick={() => navigateTo('/admin/audit', 'audit')} className={subNavButtonClass(isActive('audit'))}>
                  <Shield className="w-4 h-4" /><span>Auditoría</span>
                </button>
                <button onClick={() => navigateTo('/admin/settings', 'settings')} className={subNavButtonClass(isActive('settings'))}>
                  <Settings className="w-4 h-4" /><span>General (IVA, Bancos)</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <button onClick={() => navigateTo('/admin/prescriptions', 'prescriptions')} className={navButtonClass(isActive('prescriptions'))}>
        <ClipboardList className="w-5 h-5" />
        <span className="font-medium">Recetas médicas</span>
      </button>

      {/* Análisis — Collapsible submenu */}
      <div>
        <button
          onClick={() => setAnalyticsOpen(!analyticsOpen)}
          className={`w-full flex items-center justify-between px-4 py-3 rounded-lg transition-all ${
            ['reports', 'reorder-report', 'analytics'].includes(activeTab)
              ? 'bg-blue-50 text-blue-700'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <div className="flex items-center space-x-3">
            <TrendingUp className="w-5 h-5" />
            <span className="font-medium">Análisis</span>
          </div>
          {analyticsOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <AnimatePresence>
          {analyticsOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden ml-2"
            >
              <div className="space-y-1 pt-1">
                <button onClick={() => navigateTo('/admin/reports', 'reports')} className={subNavButtonClass(isActive('reports'))}>
                  <FileText className="w-4 h-4" /><span>Reporte COFEPRIS</span>
                </button>
                <button onClick={() => navigateTo('/admin/reorder-report', 'reorder-report')} className={subNavButtonClass(isActive('reorder-report'))}>
                  <AlertTriangle className="w-4 h-4" /><span>Reporte Reorden</span>
                </button>
                <button onClick={() => navigateTo('/admin/analytics', 'analytics')} className={subNavButtonClass(isActive('analytics'))}>
                  <TrendingUp className="w-4 h-4" /><span>Ventas e Inventario</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="py-2">
        <div className="h-px bg-slate-200 mx-4" />
      </div>

      <button onClick={() => navigateTo('/admin/discounts', 'discounts')} className={navButtonClass(isActive('discounts'))}>
        <Ticket className="w-5 h-5" />
        <span className="font-medium">Descuentos</span>
      </button>
      <button onClick={() => navigateTo('/admin/shifts', 'shifts')} className={navButtonClass(isActive('shifts'))}>
        <Clock className="w-5 h-5" />
        <span className="font-medium">Turnos</span>
      </button>
      <button onClick={() => navigateTo('/admin/accounting', 'accounting')} className={navButtonClass(isActive('accounting'))}>
        <BookOpen className="w-5 h-5" />
        <span className="font-medium">Contabilidad</span>
      </button>
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
              <div className="flex items-center gap-2">
                <Button onClick={() => navigate('/pos')} className="bg-green-600 hover:bg-green-700 text-white hidden sm:flex border-none">
                  Punto de Venta
                </Button>
                <Button onClick={() => navigate('/inventory')} className="bg-purple-600 hover:bg-purple-700 text-white hidden sm:flex border-none">
                  Módulo Inventario
                </Button>
                <Button onClick={handleLogout} variant="outline" className="flex items-center space-x-2 ml-4">
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline">Cerrar sesión</span>
                </Button>
              </div>
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
                        className="fixed top-0 left-0 h-full w-72 bg-white shadow-xl p-4 overflow-y-auto"
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
                <Route path="/customers" element={<AdminCustomers />} />
                <Route path="/sales" element={<AdminSales />} />
                <Route path="/inventory" element={<AdminInventory />} />
                <Route path="/discounts" element={<AdminDiscounts />} />
                <Route path="/shifts" element={<AdminShifts />} />
                <Route path="/audit" element={<AdminAuditLog />} />
                <Route path="/suppliers" element={<AdminSuppliers />} />
                <Route path="/reports" element={<ReportsPage />} />
                <Route path="/analytics" element={<AdminReports />} />
                <Route path="/accounting" element={<AdminAccounting />} />
                <Route path="/doctors" element={<AdminDoctors />} />
                <Route path="/prescriptions" element={<AdminPrescriptions />} />
                <Route path="/preorders" element={<AdminPreorders />} />
                <Route path="/appointments" element={<AdminAppointments />} />
                <Route path="/orders" element={<AdminOrders />} />
                <Route path="/customers/:customerId" element={<AdminCustomerProfile />} />
                <Route path="/reorder-report" element={<AdminReorderReport />} />
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
