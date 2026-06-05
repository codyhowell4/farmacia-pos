import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/toaster';
import LoginPage from '@/pages/LoginPage';
import ForgotPasswordPage from '@/pages/ForgotPasswordPage';
import ResetPasswordPage from '@/pages/ResetPasswordPage';
import AdminDashboard from '@/pages/AdminDashboard';
import PoSDashboard from '@/pages/PoSDashboard';
import InventoryDashboard from '@/pages/InventoryDashboard';
import DoctorDashboard from '@/pages/DoctorDashboard';
import { AuthProvider } from '@/contexts/AuthContext';
import { ShiftProvider } from '@/contexts/ShiftContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import ShiftGate from '@/components/ShiftGate';

function App() {
  return (
    <AuthProvider>
      <ShiftProvider>
        <Router>
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route
              path="/admin/*"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/pos"
              element={
                <ProtectedRoute allowedRoles={['pos', 'admin']}>
                  <ShiftGate>
                    <PoSDashboard />
                  </ShiftGate>
                </ProtectedRoute>
              }
            />
            <Route
              path="/inventory"
              element={
                <ProtectedRoute allowedRoles={['inventory', 'admin']}>
                  <InventoryDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/doctor/*"
              element={
                <ProtectedRoute allowedRoles={['doctor']}>
                  <DoctorDashboard />
                </ProtectedRoute>
              }
            />
          </Routes>
          <Toaster />
        </Router>
      </ShiftProvider>
    </AuthProvider>
  );
}

export default App;
