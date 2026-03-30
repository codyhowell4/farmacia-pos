import { formatMXN } from '@/lib/currency';
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, Package, AlertTriangle, Clock } from 'lucide-react';
import { Input } from '@/components/ui/input';

const getExpiryStatus = (expirationDate) => {
  if (!expirationDate) return null;
  const today = new Date();
  const expiry = new Date(expirationDate);
  const daysUntilExpiry = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
  if (daysUntilExpiry < 0) return { label: 'Expired', color: 'bg-red-100 text-red-700' };
  if (daysUntilExpiry <= 30) return { label: `${daysUntilExpiry}d left`, color: 'bg-orange-100 text-orange-700' };
  if (daysUntilExpiry <= 90) return { label: `${daysUntilExpiry}d left`, color: 'bg-yellow-100 text-yellow-700' };
  return null;
};

import { getInventory } from '@/lib/db';

const AdminInventory = () => {
  const [inventory, setInventory] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    getInventory().then(setInventory).catch(console.error);
  }, []);

  const filteredInventory = inventory.filter(item =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.location_id || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const lowStockItems = inventory.filter(item => item.quantity > 0 && item.quantity < (item.low_stock_threshold || 10));
  const expiringItems = inventory.filter(item => { if (!item.expiration_date) return false; const s = getExpiryStatus(item.expiration_date); return s !== null; });
  const totalValue = inventory.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Resumen de inventario</h2>
        <p className="text-slate-600">Monitorea los niveles de stock en todas las farmacias</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl shadow-lg p-6 text-white"
        >
          <Package className="w-8 h-8 mb-2" />
          <p className="text-sm opacity-90">Total de artículos</p>
          <p className="text-3xl font-bold">{inventory.length}</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl shadow-lg p-6 text-white"
        >
          <Package className="w-8 h-8 mb-2" />
          <p className="text-sm opacity-90">Valor total</p>
          <p className="text-3xl font-bold">${totalValue.toFixed(2)}</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-gradient-to-br from-red-500 to-orange-600 rounded-xl shadow-lg p-6 text-white"
        >
          <AlertTriangle className="w-8 h-8 mb-2" />
          <p className="text-sm opacity-90">Artículos con stock bajo</p>
          <p className="text-3xl font-bold">{lowStockItems.length}</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-gradient-to-br from-yellow-500 to-amber-600 rounded-xl shadow-lg p-6 text-white"
        >
          <Clock className="w-8 h-8 mb-2" />
          <p className="text-sm opacity-90">Próximos a vencer</p>
          <p className="text-3xl font-bold">{expiringItems.length}</p>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-white rounded-xl shadow-lg p-6"
      >
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
            <Input
              placeholder="Buscar en inventario..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Nombre</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Uso</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Farmacia</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Cantidad</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Precio</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Vencimiento</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Almacén</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Código de barras</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredInventory.map((item) => (
                <motion.tr
                  key={item.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="hover:bg-slate-50 transition-colors"
                >
                  <td className="px-4 py-3 text-sm font-medium text-slate-900">{item.name}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{item.use}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{item.location_id}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                      item.quantity < (item.low_stock_threshold || 10) ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                    }`}>
                      {item.quantity}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-green-600">${item.price.toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm">
                    {(() => { const s = getExpiryStatus(item.expiration_date); return s ? <span className={`px-2 py-1 rounded-full text-xs font-semibold ${s.color}`}>{s.label}</span> : <span className="text-slate-400 text-xs">{item.expiration_date ? new Date(item.expiration_date).toLocaleDateString() : 'No establecida'}</span>; })()}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{item.warehouse_location}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{item.barcode}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
};

export default AdminInventory;