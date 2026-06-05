import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart3, Calendar, Users, Package, FileText, UserCircle,
  LogOut, Stethoscope, Menu, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import DoctorOverview from '@/components/doctor/DoctorOverview';
import DoctorAppointments from '@/components/doctor/DoctorAppointments';
import DoctorCustomers from '@/components/doctor/DoctorCustomers';
import DoctorPreorders from '@/components/doctor/DoctorPreorders';
import DoctorMedicalNotes from '@/components/doctor/DoctorMedicalNotes';
import DoctorProfile from '@/components/doctor/DoctorProfile';

const DoctorDashboard = () => {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const getCurrentTab = () => {
    const path = location.pathname;
    if (path.includes('/appointments')) return 'appointments';
    if (path.includes('/customers')) return 'customers';
    if (path.includes('/preorders')) return 'preorders';
    if (path.includes('/medical-notes')) return 'medical-notes';
    if (path.includes('/profile')) return 'profile';
    return 'overview';
  };

  const [activeTab, setActiveTab] = useState(getCurrentTab());

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navItems = [
    { id: 'overview', label: 'Resumen', icon: BarChart3, path: '/doctor' },
    { id: 'appointments', label: 'Citas', icon: Calendar, path: '/doctor/appointments' },
    { id: 'customers', label: 'Pacientes', icon: Users, path: '/doctor/customers' },
    { id: 'preorders', label: 'Preórdenes', icon: Package, path: '/doctor/preorders' },
    { id: 'medical-notes', label: 'Notas médicas', icon: FileText, path: '/doctor/medical-notes' },
    { id: 'profile', label: 'Mi perfil', icon: UserCircle, path: '/doctor/profile' },
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
                ? 'bg-gradient-to-r from-teal-500 to-emerald-600 text-white shadow-md'
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
        <title>Portal Médico - Farmacia</title>
        <meta name="description" content="Portal médico del sistema de farmacia" />
      </Helmet>

      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-teal-50">
        <nav className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center space-x-3">
                <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setIsMenuOpen(!isMenuOpen)}>
                  <Menu className="w-6 h-6" />
                </Button>
                <div className="bg-gradient-to-br from-teal-500 to-emerald-600 p-2 rounded-lg">
                  <Stethoscope className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-slate-900">Portal Médico</h1>
                  <p className="text-xs text-slate-500">Bienvenido, Dr. {user?.name}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={handleLogout} variant="outline" className="flex items-center space-x-2">
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
                className="fixed top-0 left-0 h-full w-72 bg-white shadow-xl p-4"
                onClick={(e) => e.stopPropagation()}
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
                <Route path="/" element={<DoctorOverview />} />
                <Route path="/appointments" element={<DoctorAppointments />} />
                <Route path="/customers" element={<DoctorCustomers />} />
                <Route path="/preorders" element={<DoctorPreorders />} />
                <Route path="/medical-notes" element={<DoctorMedicalNotes />} />
                <Route path="/profile" element={<DoctorProfile />} />
              </Routes>
            </main>
          </div>
        </div>
      </div>
    </>
  );
};

export default DoctorDashboard;
