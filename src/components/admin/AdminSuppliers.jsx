import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Truck, Package, ChevronDown, ChevronUp, CheckCircle, Search, Trash2, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { formatMXN } from '@/lib/currency';

import { getSuppliers, upsertSupplier, deleteSupplier, getPurchaseOrders, createPurchaseOrder, receivePurchaseOrder } from '@/lib/db';

const AdminSuppliers = () => {
  const { toast } = useToast();
  const [tab, setTab] = useState('suppliers');
  const [suppliers, setSuppliers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedOrder, setExpandedOrder] = useState(null);

  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [supplierForm, setSupplierForm] = useState({ name: '', contact: '', phone: '', email: '', notes: '' });

  const [poDialogOpen, setPoDialogOpen] = useState(false);
  const [poForm, setPoForm] = useState({ supplierId: '', notes: '' });
  const [poItems, setPoItems] = useState([{ medicineName: '', quantity: '', unitCost: '' }]);

  const loadAll = async () => {
    const [s, o] = await Promise.all([getSuppliers(), getPurchaseOrders()]);
    setSuppliers(s);
    setOrders(o);
  };

  useEffect(() => { loadAll().catch(console.error); }, []);

  const saveSupplier = async (e) => {
    e.preventDefault();
    try {
      await upsertSupplier(editingSupplier
        ? { id: editingSupplier.id, ...supplierForm }
        : { ...supplierForm }
      );
      await loadAll();
      toast({ title: editingSupplier ? 'Proveedor actualizado' : 'Proveedor agregado' });
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
    setSupplierDialogOpen(false);
    setEditingSupplier(null);
    setSupplierForm({ name: '', contact: '', phone: '', email: '', notes: '' });
  };

  const deleteSupplierItem = async (id) => {
    try {
      await deleteSupplier(id);
      await loadAll();
      toast({ title: 'Proveedor eliminado' });
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const editSupplier = (s) => {
    setEditingSupplier(s);
    setSupplierForm({ name: s.name, contact: s.contact, phone: s.phone, email: s.email, notes: s.notes || '' });
    setSupplierDialogOpen(true);
  };

  const savePO = async (e) => {
    e.preventDefault();
    const validItems = poItems.filter(i => i.medicineName && i.quantity && i.unitCost);
    if (!poForm.supplierId || validItems.length === 0) {
      toast({ title: 'Completa el proveedor y al menos un artículo', variant: 'destructive' });
      return;
    }
    try {
      const poRecord = {
        supplier_id: poForm.supplierId,
        notes: poForm.notes,
        status: 'pending',
      };
      const items = validItems.map(i => ({
        medicine_name: i.medicineName,
        quantity: parseInt(i.quantity),
        unit_cost: parseFloat(i.unitCost),
      }));
      await createPurchaseOrder(poRecord, items);
      await loadAll();
      toast({ title: 'Orden de compra creada' });
      setPoDialogOpen(false);
      setPoForm({ supplierId: '', notes: '' });
      setPoItems([{ medicineName: '', quantity: '', unitCost: '' }]);
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const receivePO = async (orderId) => {
    try {
      await receivePurchaseOrder(orderId);
      await loadAll();
      toast({ title: 'Orden recibida', description: 'Inventario actualizado automáticamente.' });
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const totalPending = orders.filter(o => o.status === 'pending').length;
  const totalValue = orders.reduce((sum, o) => sum + (o.purchase_order_items || []).reduce((s, i) => s + i.unit_cost * i.quantity, 0), 0);

  const filteredSuppliers = suppliers.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()));
  const filteredOrders = orders.filter(o =>
    (o.suppliers?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    o.id.slice(-6).includes(searchTerm)
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Proveedores y Compras</h2>
          <p className="text-slate-600">Gestión de proveedores y órdenes de compra</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { label: 'Proveedores', value: suppliers.length, color: 'from-blue-500 to-indigo-600', icon: Truck },
          { label: 'Órdenes pendientes', value: totalPending, color: 'from-orange-500 to-red-500', icon: Package },
          { label: 'Valor total compras', value: formatMXN(totalValue), color: 'from-green-500 to-emerald-600', icon: Package },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
            className={`bg-gradient-to-br ${s.color} rounded-xl shadow-lg p-6 text-white`}>
            <s.icon className="w-8 h-8 mb-2" />
            <p className="text-sm opacity-90">{s.label}</p>
            <p className="text-3xl font-bold">{s.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        {[['suppliers', 'Proveedores'], ['orders', 'Órdenes de compra']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === id ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {label}
          </button>
        ))}
      </div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex justify-between items-center mb-6 gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
            <Input placeholder="Buscar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10" />
          </div>

          {tab === 'suppliers' && (
            <Dialog open={supplierDialogOpen} onOpenChange={v => { setSupplierDialogOpen(v); if (!v) { setEditingSupplier(null); setSupplierForm({ name: '', contact: '', phone: '', email: '', notes: '' }); } }}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-to-r from-blue-500 to-indigo-600"><Plus className="w-4 h-4 mr-2" />Nuevo proveedor</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{editingSupplier ? 'Editar proveedor' : 'Nuevo proveedor'}</DialogTitle></DialogHeader>
                <form onSubmit={saveSupplier} className="space-y-3">
                  <div className="space-y-1.5"><Label>Nombre *</Label><Input value={supplierForm.name} onChange={e => setSupplierForm(p => ({ ...p, name: e.target.value }))} required /></div>
                  <div className="space-y-1.5"><Label>Contacto</Label><Input value={supplierForm.contact} onChange={e => setSupplierForm(p => ({ ...p, contact: e.target.value }))} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5"><Label>Teléfono</Label><Input value={supplierForm.phone} onChange={e => setSupplierForm(p => ({ ...p, phone: e.target.value }))} /></div>
                    <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={supplierForm.email} onChange={e => setSupplierForm(p => ({ ...p, email: e.target.value }))} /></div>
                  </div>
                  <div className="space-y-1.5"><Label>Notas</Label><Input value={supplierForm.notes} onChange={e => setSupplierForm(p => ({ ...p, notes: e.target.value }))} /></div>
                  <Button type="submit" className="w-full">{editingSupplier ? 'Actualizar' : 'Guardar'}</Button>
                </form>
              </DialogContent>
            </Dialog>
          )}

          {tab === 'orders' && (
            <Dialog open={poDialogOpen} onOpenChange={v => { setPoDialogOpen(v); if (!v) { setPoForm({ supplierId: '', notes: '' }); setPoItems([{ medicineName: '', quantity: '', unitCost: '' }]); } }}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-to-r from-green-500 to-emerald-600"><Plus className="w-4 h-4 mr-2" />Nueva orden</Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader><DialogTitle>Nueva orden de compra</DialogTitle></DialogHeader>
                <form onSubmit={savePO} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Proveedor *</Label>
                      <Select value={poForm.supplierId} onValueChange={v => setPoForm(p => ({ ...p, supplierId: v }))}>
                        <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                        <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5"><Label>Notas</Label><Input value={poForm.notes} onChange={e => setPoForm(p => ({ ...p, notes: e.target.value }))} /></div>
                  </div>
                  <div className="space-y-2">
                    <Label>Artículos</Label>
                    {poItems.map((item, idx) => (
                      <div key={idx} className="grid grid-cols-3 gap-2">
                        <Input placeholder="Nombre del medicamento" value={item.medicineName} onChange={e => setPoItems(p => p.map((it, i) => i === idx ? { ...it, medicineName: e.target.value } : it))} />
                        <Input type="number" placeholder="Cantidad" value={item.quantity} onChange={e => setPoItems(p => p.map((it, i) => i === idx ? { ...it, quantity: e.target.value } : it))} />
                        <Input type="number" step="0.01" placeholder="Costo unitario" value={item.unitCost} onChange={e => setPoItems(p => p.map((it, i) => i === idx ? { ...it, unitCost: e.target.value } : it))} />
                      </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" onClick={() => setPoItems(p => [...p, { medicineName: '', quantity: '', unitCost: '' }])}>
                      <Plus className="w-3 h-3 mr-1" />Agregar artículo
                    </Button>
                  </div>
                  <div className="text-right font-semibold">
                    Total OC: {formatMXN(poItems.reduce((s, i) => s + (parseFloat(i.unitCost) || 0) * (parseInt(i.quantity) || 0), 0))}
                  </div>
                  <Button type="submit" className="w-full">Crear orden de compra</Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Suppliers table */}
        {tab === 'suppliers' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>{['Nombre','Contacto','Teléfono','Email','Acciones'].map(h => <th key={h} className="px-4 py-3 text-left font-semibold text-slate-900">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredSuppliers.map(s => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{s.name}</td>
                    <td className="px-4 py-3 text-slate-600">{s.contact}</td>
                    <td className="px-4 py-3 text-slate-600">{s.phone}</td>
                    <td className="px-4 py-3 text-slate-600">{s.email}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => editSupplier(s)} className="text-blue-600 hover:text-blue-800"><Edit className="w-4 h-4" /></button>
                        <button onClick={() => deleteSupplierItem(s.id)} className="text-red-600 hover:text-red-800"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredSuppliers.length === 0 && <tr><td colSpan="5" className="px-4 py-8 text-center text-slate-500">No hay proveedores. Agrega uno.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {/* Orders table */}
        {tab === 'orders' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>{['','Folio','Proveedor','Fecha','Artículos','Total OC','Estado','Acción'].map(h => <th key={h} className="px-4 py-3 text-left font-semibold text-slate-900">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredOrders.map(order => {
                  const ocTotal = (order.purchase_order_items || []).reduce((s, i) => s + i.unit_cost * i.quantity, 0);
                  return (
                    <React.Fragment key={order.id}>
                      <tr className="hover:bg-slate-50 cursor-pointer" onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}>
                        <td className="px-4 py-3">{expandedOrder === order.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</td>
                        <td className="px-4 py-3 font-medium">#{order.id.slice(-6).toUpperCase()}</td>
                        <td className="px-4 py-3 text-slate-700">{order.suppliers?.name}</td>
                        <td className="px-4 py-3 text-slate-500">{new Date(order.created_at).toLocaleDateString('es-MX')}</td>
                        <td className="px-4 py-3 text-slate-600">{(order.purchase_order_items || []).length}</td>
                        <td className="px-4 py-3 font-semibold text-green-600">{formatMXN(ocTotal)}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${order.status === 'received' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                            {order.status === 'received' ? 'Recibida' : 'Pendiente'}
                          </span>
                        </td>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          {order.status === 'pending' && (
                            <Button size="sm" variant="outline" className="text-green-700 border-green-300 hover:bg-green-50" onClick={() => receivePO(order.id)}>
                              <CheckCircle className="w-3 h-3 mr-1" />Recibir
                            </Button>
                          )}
                          {order.status === 'received' && <span className="text-xs text-slate-400">{new Date(order.received_at).toLocaleDateString('es-MX')}</span>}
                        </td>
                      </tr>
                      {expandedOrder === order.id && (
                        <tr>
                          <td colSpan="8" className="p-0">
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-slate-50 px-8 py-3">
                              <table className="w-full text-xs">
                                <thead><tr className="text-slate-500"><th className="text-left py-1">Medicamento</th><th className="text-left">Cantidad</th><th className="text-left">Costo unitario</th><th className="text-left">Subtotal</th></tr></thead>
                                <tbody>
                                  {(order.purchase_order_items || []).map((item, i) => (
                                    <tr key={i} className="border-t border-slate-200">
                                      <td className="py-1.5">{item.medicine_name}</td>
                                      <td>{item.quantity}</td>
                                      <td>{formatMXN(item.unit_cost)}</td>
                                      <td className="font-medium">{formatMXN(item.unit_cost * item.quantity)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              {order.notes && <p className="text-xs text-slate-500 mt-2 italic">Nota: {order.notes}</p>}
                            </motion.div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
                {filteredOrders.length === 0 && <tr><td colSpan="8" className="px-4 py-8 text-center text-slate-500">No hay órdenes de compra.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default AdminSuppliers;
