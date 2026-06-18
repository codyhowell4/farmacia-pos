import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Clock, AlertTriangle, Package, Calendar } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getInventory } from '@/lib/db';
import { useToast } from '@/components/ui/use-toast';

const getDaysUntilExpiry = (expirationDate) => {
  if (!expirationDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expirationDate);
  expiry.setHours(0, 0, 0, 0);
  const diffTime = expiry - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

const getExpiryColor = (days) => {
  if (days < 0) return 'text-red-600 bg-red-50';
  if (days <= 30) return 'text-orange-600 bg-orange-50';
  if (days <= 60) return 'text-yellow-600 bg-yellow-50';
  return 'text-green-600 bg-green-50';
};

const DoctorExpiringProducts = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [expiringItems, setExpiringItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadExpiringProducts();
  }, [user?.locationId]);

  const loadExpiringProducts = async () => {
    try {
      setLoading(true);
      const items = await getInventory(user?.locationId);
      
      // Filter items expiring within 90 days
      const expiring = items
        .filter(item => {
          if (!item.expiration_date) return false;
          const days = getDaysUntilExpiry(item.expiration_date);
          return days !== null && days <= 90;
        })
        .map(item => ({
          ...item,
          daysUntilExpiry: getDaysUntilExpiry(item.expiration_date),
        }))
        .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry); // Sort by closest to expiry first

      setExpiringItems(expiring);
    } catch (error) {
      console.error('Error loading expiring products:', error);
      toast({ title: 'Error', description: 'No se pudieron cargar los productos', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const formatExpiryMessage = (days) => {
    if (days < 0) return `Caducó hace ${Math.abs(days)} días`;
    if (days === 0) return 'Caduca hoy';
    if (days === 1) return 'Caduca mañana';
    return `${days} días restantes`;
  };

  return (
    <>
      <Helmet><title>Productos Por Vencer - Portal Médico</title></Helmet>
      
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Clock className="w-6 h-6 text-orange-500" />
              Productos Por Vencer
            </h2>
            <p className="text-slate-600 mt-1">
              Medicamentos que caducan en los próximos 90 días
            </p>
          </div>
          <div className="bg-orange-50 text-orange-700 px-4 py-2 rounded-lg font-semibold">
            {expiringItems.length} productos
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-500"></div>
          </div>
        ) : expiringItems.length === 0 ? (
          <div className="bg-white rounded-xl shadow-lg p-8 text-center">
            <Package className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-700">No hay productos por vencer</h3>
            <p className="text-slate-500">Todos los medicamentos tienen más de 90 días de vigencia.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Medicamento</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Indicación</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-slate-900">Cantidad</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Días restantes</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Fecha de caducidad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {expiringItems.map((item, index) => (
                    <motion.tr
                      key={item.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {item.daysUntilExpiry < 0 && (
                            <AlertTriangle className="w-4 h-4 text-red-500" />
                          )}
                          <span className="font-medium text-slate-900">{item.name}</span>
                          {item.requires_prescription && (
                            <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">
                              Rx
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{item.use || '-'}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                          item.quantity <= (item.low_stock_threshold || 10) 
                            ? 'bg-red-100 text-red-700' 
                            : 'bg-green-100 text-green-700'
                        }`}>
                          {item.quantity}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getExpiryColor(item.daysUntilExpiry)}`}>
                          {formatExpiryMessage(item.daysUntilExpiry)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-slate-400" />
                          {new Date(item.expiration_date).toLocaleDateString('es-MX', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Summary Cards */}
        {!loading && expiringItems.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-red-50 rounded-lg p-4 border border-red-200">
              <p className="text-sm text-red-600 font-medium">Ya caducados</p>
              <p className="text-2xl font-bold text-red-700">
                {expiringItems.filter(i => i.daysUntilExpiry < 0).length}
              </p>
            </div>
            <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
              <p className="text-sm text-orange-600 font-medium">Caducan en 30 días</p>
              <p className="text-2xl font-bold text-orange-700">
                {expiringItems.filter(i => i.daysUntilExpiry >= 0 && i.daysUntilExpiry <= 30).length}
              </p>
            </div>
            <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
              <p className="text-sm text-yellow-600 font-medium">Caducan en 31-90 días</p>
              <p className="text-2xl font-bold text-yellow-700">
                {expiringItems.filter(i => i.daysUntilExpiry > 30 && i.daysUntilExpiry <= 90).length}
              </p>
            </div>
          </div>
        )}
      </motion.div>
    </>
  );
};

export default DoctorExpiringProducts;
