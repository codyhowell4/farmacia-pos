import { formatMXN } from '@/lib/currency';
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, Package, AlertTriangle, Clock, TrendingDown } from 'lucide-react';
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

import { getInventoryWithSupplier, getSalesInRange } from '@/lib/db';

const DAYS_WINDOW = 30;

const AdminInventory = () => {
  const [inventory, setInventory] = useState([]);
  const [velocityMap, setVelocityMap] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [inv, sales] = await Promise.all([
        getInventoryWithSupplier(),
        getSalesInRange(
          new Date(Date.now() - DAYS_WINDOW * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          new Date().toISOString().split('T')[0]
        ),
      ]);
      setInventory(inv);

      // Calculate sales velocity per inventory item
      const salesMap = {};
      for (const sale of sales) {
        for (const item of sale.sale_items || []) {
          if (!item.inventory_id) continue;
          salesMap[item.inventory_id] = (salesMap[item.inventory_id] || 0) + (item.quantity || 0);
        }
      }
      setVelocityMap(salesMap);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const getVelocityInfo = (item) => {
    const sold = velocityMap[item.id] || 0;
    const avgDaily = sold / DAYS_WINDOW;
    const current = item.quantity || 0;
    const threshold = item.low_stock_threshold || 10;
    const stockDays = avgDaily > 0 ? Math.round(current / avgDaily) : Infinity;
    const needsReorder = stockDays < 30 || current < threshold;
    return { sold, avgDaily, stockDays, needsReorder, threshold };
  };

  const filteredInventory = inventory.filter(item =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.location_id || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const lowStockItems = inventory.filter(item => item.quantity > 0 && item.quantity < (item.low_stock_threshold || 10));
  const expiringItems = inventory.filter(item => { if (!item.expiration_date) return false; const s = getExpiryStatus(item.expiration_date); return s !== null; });
  const totalValue = inventory.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const reorderItems = inventory.filter(item => {
    const info = getVelocityInfo(item);
    return info.needsReorder && item.quantity >= 0;
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Resumen de inventario</h2>
        <p className="text-slate-600">Monitorea los niveles de stock en todas las farmacias</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
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
          <p className="text-sm opacity-90">Stock bajo (fijo)</p>
          <p className="text-3xl font-bold">{lowStockItems.length}</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="bg-gradient-to-br from-pink-500 to-rose-600 rounded-xl shadow-lg p-6 text-white"
        >
          <TrendingDown className="w-8 h-8 mb-2" />
          <p className="text-sm opacity-90">Reorden sugerido</p>
          <p className="text-3xl font-bold">{reorderItems.length}</p>
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
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Proyección</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Almacén</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Proveedor</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Código de barras</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredInventory.map((item) => {
                const info = getVelocityInfo(item);
                return (
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
                    <td className="px-4 py-3 text-sm">
                      {info.needsReorder ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-700" title={`${info.sold} vendidos en ${DAYS_WINDOW}d · ~${info.avgDaily.toFixed(1)}/día`}>
                          <TrendingDown className="w-3 h-3" />
                          {info.stockDays === Infinity ? 'Sin ventas' : `${info.stockDays}d stock`}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500" title={`${info.sold} vendidos en ${DAYS_WINDOW}d · ~${info.avgDaily.toFixed(1)}/día`}>
                          {info.stockDays === Infinity ? 'Sin ventas' : `${info.stockDays}d stock`}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{item.warehouse_location}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{item.suppliers?.name || '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{item.barcode}</td>
                  </motion.tr>
                );
              })}
              {filteredInventory.length === 0 && !loading && (
                <tr><td colSpan="9" className="px-4 py-8 text-center text-slate-500">Sin resultados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
};

export default AdminInventory;
