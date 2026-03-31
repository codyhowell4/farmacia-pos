import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { motion, AnimatePresence } from 'framer-motion';
import { Package, Plus, Edit, Trash2, LogOut, Search, AlertTriangle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/components/ui/use-toast';
import { logAudit, AUDIT_ACTIONS } from '@/lib/auditLog';
import { formatMXN } from '@/lib/currency';
import { getInventory, upsertInventoryItem, deleteInventoryItem } from '@/lib/db';

const LOW_STOCK_THRESHOLD = 10;

const getExpiryStatus = (expirationDate) => {
  if (!expirationDate) return null;
  const today = new Date();
  const expiry = new Date(expirationDate);
  const daysUntilExpiry = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
  if (daysUntilExpiry < 0) return { label: 'Expired', color: 'bg-red-100 text-red-700', days: daysUntilExpiry };
  if (daysUntilExpiry <= 30) return { label: `Exp in ${daysUntilExpiry}d`, color: 'bg-orange-100 text-orange-700', days: daysUntilExpiry };
  if (daysUntilExpiry <= 90) return { label: `Exp in ${daysUntilExpiry}d`, color: 'bg-yellow-100 text-yellow-700', days: daysUntilExpiry };
  return { label: `Exp in ${daysUntilExpiry}d`, color: 'bg-green-100 text-green-700', days: daysUntilExpiry };
};

const InventoryDashboard = () => {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [inventory, setInventory] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [alertFilter, setAlertFilter] = useState(null);
  const [formData, setFormData] = useState({
    name: '', use: '', cost: '', price: '', quantity: '',
    lowStockThreshold: LOW_STOCK_THRESHOLD.toString(),
    pharmacyLocation: '', warehouseLocation: '', barcode: '', expirationDate: '',
    requiresPrescription: false
  });

  useEffect(() => { loadInventory(); }, [user?.locationId]);

  const loadInventory = async () => {
    try {
      const items = await getInventory(user?.locationId);
      setInventory(items);
    } catch (e) {
      console.error(e);
    }
  };

  const handleLogout = () => { logout(); navigate('/login'); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const threshold = parseInt(formData.lowStockThreshold) || LOW_STOCK_THRESHOLD;
    try {
      const item = {
        ...(editingItem ? { id: editingItem.id } : {}),
        name: formData.name,
        use: formData.use,
        cost: parseFloat(formData.cost),
        price: parseFloat(formData.price),
        quantity: parseInt(formData.quantity),
        low_stock_threshold: threshold,
        location_id: user.locationId,
        warehouse_location: formData.warehouseLocation,
        barcode: formData.barcode || null,
        expiration_date: formData.expirationDate || null,
        requires_prescription: formData.requiresPrescription,
      };
      await upsertInventoryItem(item);
      logAudit({
        action: editingItem ? AUDIT_ACTIONS.INVENTORY_EDIT : AUDIT_ACTIONS.INVENTORY_ADD,
        user,
        details: editingItem ? `Updated: ${formData.name}` : `Added: ${formData.name} | Qty: ${formData.quantity} | Rx: ${formData.requiresPrescription}`,
      });
      toast({ title: editingItem ? 'Medicamento actualizado' : 'Medicamento agregado' });
      await loadInventory();
      setIsDialogOpen(false);
      resetForm();
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleEdit = (item) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      use: item.use,
      cost: item.cost.toString(),
      price: item.price.toString(),
      quantity: item.quantity.toString(),
      lowStockThreshold: (item.low_stock_threshold || LOW_STOCK_THRESHOLD).toString(),
      pharmacyLocation: item.location_id || '',
      warehouseLocation: item.warehouse_location || '',
      barcode: item.barcode || '',
      expirationDate: item.expiration_date || '',
      requiresPrescription: item.requires_prescription || false,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id) => {
    try {
      const item = inventory.find(i => i.id === id);
      await deleteInventoryItem(id);
      await loadInventory();
      logAudit({ action: AUDIT_ACTIONS.INVENTORY_DELETE, user, details: `Deleted: ${item?.name || id}` });
      toast({ title: 'Medicamento eliminado' });
    } catch (e) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const resetForm = () => {
    setFormData({ name: '', use: '', cost: '', price: '', quantity: '', lowStockThreshold: LOW_STOCK_THRESHOLD.toString(), pharmacyLocation: '', warehouseLocation: '', barcode: '', expirationDate: '', requiresPrescription: false });
    setEditingItem(null);
  };

  const lowStockItems = inventory.filter(item => item.quantity > 0 && item.quantity <= (item.low_stock_threshold || LOW_STOCK_THRESHOLD));
  const expiringItems = inventory.filter(item => { if (!item.expiration_date) return false; const s = getExpiryStatus(item.expiration_date); return s && s.days <= 90; });

  const filteredInventory = inventory.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
    if (alertFilter === 'low_stock') return matchesSearch && item.quantity <= (item.low_stock_threshold || LOW_STOCK_THRESHOLD);
    if (alertFilter === 'expiring') { if (!item.expiration_date) return false; const s = getExpiryStatus(item.expiration_date); return matchesSearch && s && s.days <= 90; }
    return matchesSearch;
  });

  return (
    <>
      <Helmet><title>Gestión de inventario - Farmacia</title></Helmet>
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50">
        <nav className="bg-white border-b border-slate-200 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center space-x-3">
                <div className="bg-gradient-to-br from-purple-500 to-pink-600 p-2 rounded-lg"><Package className="w-6 h-6 text-white" /></div>
                <div><h1 className="text-xl font-bold text-slate-900">Gestión de inventario</h1><p className="text-xs text-slate-500">Gestor: {user?.name}</p></div>
              </div>
              <div className="flex items-center gap-2">
                {user?.role === 'admin' && (
                  <Button onClick={() => navigate('/admin')} variant="outline" className="text-blue-600 border-blue-200 hover:bg-blue-50">
                    ← Admin
                  </Button>
                )}
                <Button onClick={handleLogout} variant="outline"><LogOut className="w-4 h-4 mr-2" />Cerrar sesión</Button>
              </div>
            </div>
          </div>
        </nav>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
          <AnimatePresence>
            {lowStockItems.length > 0 && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className={`flex items-center justify-between p-4 rounded-xl shadow cursor-pointer border-2 transition-all ${alertFilter === 'low_stock' ? 'bg-orange-100 border-orange-500' : 'bg-orange-50 border-orange-200 hover:border-orange-400'}`}
                onClick={() => setAlertFilter(alertFilter === 'low_stock' ? null : 'low_stock')}>
                <div className="flex items-center space-x-3">
                  <AlertTriangle className="w-5 h-5 text-orange-600 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-orange-800">{lowStockItems.length} item{lowStockItems.length > 1 ? 's' : ''} running low on stock</p>
                    <p className="text-sm text-orange-600">{lowStockItems.map(i => i.name).join(', ')}</p>
                  </div>
                </div>
                <span className="text-xs text-orange-600 font-medium whitespace-nowrap ml-4">{alertFilter === 'low_stock' ? 'Mostrar todos' : 'Ver artículos'}</span>
              </motion.div>
            )}
            {expiringItems.length > 0 && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className={`flex items-center justify-between p-4 rounded-xl shadow cursor-pointer border-2 transition-all ${alertFilter === 'expiring' ? 'bg-red-100 border-red-500' : 'bg-red-50 border-red-200 hover:border-red-400'}`}
                onClick={() => setAlertFilter(alertFilter === 'expiring' ? null : 'expiring')}>
                <div className="flex items-center space-x-3">
                  <Clock className="w-5 h-5 text-red-600 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-red-800">{expiringItems.length} item{expiringItems.length > 1 ? 's' : ''} expiring within 90 days</p>
                    <p className="text-sm text-red-600">{expiringItems.map(i => i.name).join(', ')}</p>
                  </div>
                </div>
                <span className="text-xs text-red-600 font-medium whitespace-nowrap ml-4">{alertFilter === 'expiring' ? 'Mostrar todos' : 'Ver artículos'}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex justify-between items-center mb-6 gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
                <Input placeholder="Buscar medicamentos..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
              </div>
              <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
                <DialogTrigger asChild>
                  <Button className="bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700"><Plus className="w-4 h-4 mr-2" />Agregar medicamento</Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader><DialogTitle>{editingItem ? 'Editar medicamento' : 'Nuevo medicamento'}</DialogTitle></DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2"><Label>Nombre del medicamento</Label><Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required /></div>
                      <div className="space-y-2"><Label>Indicación</Label><Input value={formData.use} onChange={(e) => setFormData({ ...formData, use: e.target.value })} required /></div>
                      <div className="space-y-2"><Label>Costo (MXN)</Label><Input type="number" step="0.01" value={formData.cost} onChange={(e) => setFormData({ ...formData, cost: e.target.value })} required /></div>
                      <div className="space-y-2"><Label>Precio de venta (MXN)</Label><Input type="number" step="0.01" value={formData.price} onChange={(e) => setFormData({ ...formData, price: e.target.value })} required /></div>
                      <div className="space-y-2"><Label>Cantidad</Label><Input type="number" value={formData.quantity} onChange={(e) => setFormData({ ...formData, quantity: e.target.value })} required /></div>
                      <div className="space-y-2"><Label>Umbral de alerta de stock bajo</Label><Input type="number" value={formData.lowStockThreshold} onChange={(e) => setFormData({ ...formData, lowStockThreshold: e.target.value })} placeholder="10" /></div>
                      <div className="space-y-2"><Label>Fecha de vencimiento</Label><Input type="date" value={formData.expirationDate} onChange={(e) => setFormData({ ...formData, expirationDate: e.target.value })} /></div>
                      <div className="space-y-2"><Label>Código de barras (UPC)</Label><Input value={formData.barcode} onChange={(e) => setFormData({ ...formData, barcode: e.target.value })} /></div>
                      <div className="space-y-2"><Label>Ubicación de farmacia</Label><Input value={formData.pharmacyLocation} onChange={(e) => setFormData({ ...formData, pharmacyLocation: e.target.value })} required placeholder="Ej. farmacia1" /></div>
                      <div className="space-y-2"><Label>Ubicación en almacén</Label><Input value={formData.warehouseLocation} onChange={(e) => setFormData({ ...formData, warehouseLocation: e.target.value })} required placeholder="Ej. Pasillo 5, Estante B" /></div>
                      <div className="md:col-span-2 flex items-center gap-3 pt-1">
                        <input
                          type="checkbox"
                          id="requiresPrescription"
                          checked={formData.requiresPrescription}
                          onChange={(e) => setFormData({ ...formData, requiresPrescription: e.target.checked })}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 cursor-pointer"
                        />
                        <Label htmlFor="requiresPrescription" className="cursor-pointer">
                          Requiere receta médica (Rx) — el cajero debe ingresar el número de receta al cobrar
                        </Label>
                      </div>
                    </div>
                    <Button type="submit" className="w-full">{editingItem ? 'Actualizar medicamento' : 'Agregar medicamento'}</Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            {alertFilter && (
              <div className="mb-4 flex items-center gap-2">
                <span className="text-sm text-slate-600">Filtrado: <strong>{alertFilter === 'low_stock' ? 'Stock bajo' : 'Próximos a vencer'}</strong></span>
                <button onClick={() => setAlertFilter(null)} className="text-xs text-blue-600 underline">Quitar filtro</button>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {['Name','Use','Cost','Price','Qty','Rx','Expiration','Warehouse','Barcode','Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-sm font-semibold text-slate-900">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredInventory.map((item) => {
                    const expiryStatus = getExpiryStatus(item.expiration_date);
                    const isLow = item.quantity <= (item.low_stock_threshold || LOW_STOCK_THRESHOLD);
                    return (
                      <motion.tr key={item.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-sm font-medium text-slate-900">{item.name}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{item.use}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{formatMXN(item.cost)}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-green-600">{formatMXN(item.price)}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold flex items-center gap-1 w-fit ${isLow ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                            {item.quantity} {isLow && <AlertTriangle className="w-3 h-3" />}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {item.requires_prescription
                            ? <span className="px-2 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700">Rx</span>
                            : <span className="px-2 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-500">OTC</span>
                          }
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {expiryStatus ? <span className={`px-2 py-1 rounded-full text-xs font-semibold ${expiryStatus.color}`}>{expiryStatus.label}</span> : <span className="text-slate-400 text-xs">No establecida</span>}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">{item.warehouse_location}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{item.barcode}</td>
                        <td className="px-4 py-3 text-sm">
                          <div className="flex space-x-2">
                            <button onClick={() => handleEdit(item)} className="text-blue-600 hover:text-blue-800"><Edit className="w-4 h-4" /></button>
                            <button onClick={() => handleDelete(item.id)} className="text-red-600 hover:text-red-800"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredInventory.length === 0 && <p className="text-center text-slate-500 py-8">Sin artículos encontrados.</p>}
            </div>
          </motion.div>
        </div>
      </div>
    </>
  );
};

export default InventoryDashboard;
