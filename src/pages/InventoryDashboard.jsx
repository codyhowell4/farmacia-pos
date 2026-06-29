import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { Package, Plus, Edit, Trash2, LogOut, Search, AlertTriangle, Clock, Barcode, History, SlidersHorizontal, Upload, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/components/ui/use-toast';
import { logAudit, AUDIT_ACTIONS } from '@/lib/auditLog';
import { formatMXN } from '@/lib/currency';
import { getInventoryWithSupplier, upsertInventoryItem, deleteInventoryItem, createStockAdjustment, getInventoryMovements, getSuppliers, bulkInsertInventory } from '@/lib/db';

const LOW_STOCK_THRESHOLD = 10;
const waitForDialogUnmount = () => new Promise(resolve => setTimeout(resolve, 0));

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
  const [adjustmentItem, setAdjustmentItem] = useState(null);
  const [isAdjustmentDialogOpen, setIsAdjustmentDialogOpen] = useState(false);
  const [adjustmentHistory, setAdjustmentHistory] = useState([]);
  const [showHistoryItem, setShowHistoryItem] = useState(null);
  const [formData, setFormData] = useState({
    name: '', use: '', cost: '', price: '', quantity: '',
    lowStockThreshold: LOW_STOCK_THRESHOLD.toString(),
    pharmacyLocation: '', warehouseLocation: '', barcode: '', expirationDate: '',
    requiresPrescription: false, batchNumber: '', supplierId: '', department: '', itemType: 'product',
  });
  const [suppliers, setSuppliers] = useState([]);
  const [adjustmentForm, setAdjustmentForm] = useState({
    newQuantity: '', reason: '',
  });

  // CSV import state
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [importRows, setImportRows] = useState([]);
  const [importErrors, setImportErrors] = useState([]);
  const [importFileName, setImportFileName] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  useEffect(() => { loadInventory(); loadSuppliers(); }, [user?.locationId]);

  const loadSuppliers = async () => {
    try {
      const data = await getSuppliers();
      setSuppliers(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    }
  };

  const loadInventory = async () => {
    try {
      const items = await getInventoryWithSupplier(user?.locationId);
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
        batch_number: formData.batchNumber || null,
        supplier_id: formData.supplierId || null,
        department: formData.department || null,
        item_type: formData.itemType || 'product',
      };
      await upsertInventoryItem(item);
      logAudit({
        action: editingItem ? AUDIT_ACTIONS.INVENTORY_EDIT : AUDIT_ACTIONS.INVENTORY_ADD,
        user,
        details: editingItem ? `Updated: ${formData.name}` : `Added: ${formData.name} | Qty: ${formData.quantity} | Rx: ${formData.requiresPrescription}`,
      });
      toast({ title: editingItem ? 'Medicamento actualizado' : 'Medicamento agregado' });
      setIsDialogOpen(false);
      resetForm();
      await waitForDialogUnmount();
      await loadInventory();
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
      batchNumber: item.batch_number || '',
      supplierId: item.supplier_id || '',
      department: item.department || '',
      itemType: item.item_type || 'product',
    });
    setIsDialogOpen(true);
  };

  const handleAdjustStock = (item) => {
    setAdjustmentItem(item);
    setAdjustmentForm({
      newQuantity: item.quantity.toString(),
      reason: '',
    });
    setIsAdjustmentDialogOpen(true);
  };

  const resetAdjustmentForm = () => {
    setAdjustmentForm({ newQuantity: '', reason: '' });
  };

  const closeAdjustmentModal = async () => {
    setIsAdjustmentDialogOpen(false);
    await waitForDialogUnmount();
    setAdjustmentItem(null);
    resetAdjustmentForm();
  };

  const submitAdjustment = async () => {
    if (!adjustmentForm.reason.trim()) {
      toast({ title: 'Motivo requerido', description: 'Debes proporcionar un motivo para el ajuste', variant: 'destructive' });
      return;
    }
    
    const newQty = parseInt(adjustmentForm.newQuantity);
    if (isNaN(newQty) || newQty < 0) {
      toast({ title: 'Cantidad inválida', description: 'La cantidad debe ser un número positivo', variant: 'destructive' });
      return;
    }

    try {
      await createStockAdjustment({
        inventory_id: adjustmentItem.id,
        previous_quantity: adjustmentItem.quantity,
        new_quantity: newQty,
        reason: adjustmentForm.reason,
      });
      
      logAudit({
        action: AUDIT_ACTIONS.INVENTORY_EDIT,
        user,
        details: `Stock adjusted: ${adjustmentItem.name} from ${adjustmentItem.quantity} to ${newQty}. Reason: ${adjustmentForm.reason}`,
      });
      
      toast({ title: 'Stock ajustado', description: `Cantidad actualizada de ${adjustmentItem.quantity} a ${newQty}` });
      await closeAdjustmentModal();
      await loadInventory();
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const viewAdjustmentHistory = async (item) => {
    try {
      const history = await getInventoryMovements(item.id);
      setAdjustmentHistory(history);
      setShowHistoryItem(item);
    } catch (e) {
      toast({ title: 'Error', description: 'No se pudo cargar el historial', variant: 'destructive' });
    }
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
    setFormData({ name: '', use: '', cost: '', price: '', quantity: '', lowStockThreshold: LOW_STOCK_THRESHOLD.toString(), pharmacyLocation: '', warehouseLocation: '', barcode: '', expirationDate: '', requiresPrescription: false, batchNumber: '', supplierId: '', department: '', itemType: 'product' });
    setEditingItem(null);
  };

  // CSV import helpers
  const parseMoney = (value) => {
    if (value === null || value === undefined || String(value).trim() === '') return 0;
    const cleaned = String(value).replace(/^\$/, '').replace(/,/g, '').trim();
    const number = parseFloat(cleaned);
    return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
  };

  const parseQuantity = (value) => {
    if (value === null || value === undefined || String(value).trim() === '') return 0;
    const cleaned = String(value).replace(/,/g, '').trim();
    const number = parseFloat(cleaned);
    return Number.isFinite(number) ? Math.round(number) : 0;
  };

  const normalizeName = (value) => (value || '').toString().trim().replace(/\s+/g, ' ');
  const normalizeDepartment = (value) => (value || '').toString().trim();

  const parseCsvRows = (records) => {
    const rows = [];
    const errors = [];

    records.forEach((record, index) => {
      const line = index + 2;
      const name = normalizeName(record.Producto ?? record.producto ?? record.Nombre ?? record.nombre);
      const cost = parseMoney(record.Costo ?? record.costo ?? record.COSTO);
      const price = parseMoney(record.Venta ?? record.venta ?? record.VENTA);
      const quantity = parseQuantity(record.Existencia ?? record.existencia ?? record.EXISTENCIA ?? record.stock ?? record.cantidad);
      const department = normalizeDepartment(record.Departamento ?? record.departamento ?? record.DEPARTAMENTO);

      if (!name) {
        errors.push({ line, reason: 'Falta el nombre del producto', record });
        return;
      }

      rows.push({
        name,
        cost,
        price,
        quantity,
        department: department || null,
        use: department || null,
        low_stock_threshold: LOW_STOCK_THRESHOLD,
        location_id: user?.locationId || null,
        barcode: null,
        warehouse_location: null,
        expiration_date: null,
        requires_prescription: false,
        batch_number: null,
        supplier_id: null,
        item_type: 'product',
        sales_count: 0,
      });
    });

    return { rows, errors };
  };

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFileName(file.name);
    setImportRows([]);
    setImportErrors([]);
    setImportResult(null);

    try {
      const { parse } = await import('csv-parse/browser/esm/sync');
      const text = await file.text();
      const records = parse(text, { columns: true, skip_empty_lines: true, trim: true });
      const { rows, errors } = parseCsvRows(records);
      setImportRows(rows);
      setImportErrors(errors);
      if (rows.length === 0) {
        toast({ title: 'CSV vacío o inválido', description: 'No se encontraron productos válidos.', variant: 'destructive' });
      }
    } catch (err) {
      toast({ title: 'Error leyendo CSV', description: err.message, variant: 'destructive' });
      setImportFileName('');
    }
  };

  const handleImport = async () => {
    if (importRows.length === 0) return;
    setIsImporting(true);
    try {
      const { inserted, errors } = await bulkInsertInventory(importRows);
      setImportResult({ inserted, errors: errors.length });
      logAudit({ action: AUDIT_ACTIONS.INVENTORY_ADD, user, details: `CSV import: ${inserted} products from ${importFileName}` });
      toast({ title: 'Importación completada', description: `${inserted} productos importados.` });
      if (errors.length === 0) {
        setTimeout(() => {
          setIsImportDialogOpen(false);
          resetImportState();
          loadInventory();
        }, 1500);
      } else {
        loadInventory();
      }
    } catch (err) {
      toast({ title: 'Error al importar', description: err.message, variant: 'destructive' });
    } finally {
      setIsImporting(false);
    }
  };

  const resetImportState = () => {
    setImportRows([]);
    setImportErrors([]);
    setImportFileName('');
    setImportResult(null);
  };

  const closeImportDialog = () => {
    setIsImportDialogOpen(false);
    resetImportState();
  };

  // Handle barcode scan in form
  const handleBarcodeScan = async (barcode) => {
    if (!barcode) return;
    // Search for existing item with this barcode
    const existingItem = inventory.find(item => item.barcode === barcode);
    if (existingItem) {
      // Pre-fill form with existing data
      setFormData({
        ...formData,
        name: existingItem.name,
        use: existingItem.use || '',
        cost: existingItem.cost?.toString() || '',
        price: existingItem.price?.toString() || '',
        lowStockThreshold: (existingItem.low_stock_threshold || LOW_STOCK_THRESHOLD).toString(),
        warehouseLocation: existingItem.warehouse_location || '',
        requiresPrescription: existingItem.requires_prescription || false,
        department: existingItem.department || '',
        itemType: existingItem.item_type || 'product',
        barcode: barcode,
      });
      toast({ title: 'Producto encontrado', description: 'Datos pre-llenados del producto existente' });
    }
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
          <>
            {lowStockItems.length > 0 && (
              <div
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
              </div>
            )}
            {expiringItems.length > 0 && (
              <div
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
              </div>
            )}
          </>

          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex justify-between items-center mb-6 gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
                <Input placeholder="Buscar medicamentos..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
              </div>
              <Button variant="outline" onClick={() => setIsImportDialogOpen(true)}>
                <Upload className="w-4 h-4 mr-2" />Importar CSV
              </Button>
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
                      <div className="space-y-2"><Label>Departamento</Label><Input value={formData.department} onChange={(e) => setFormData({ ...formData, department: e.target.value })} placeholder="Ej. Analgésicos, Antibióticos" /></div>
                      <div className="space-y-2">
                        <Label>Tipo</Label>
                        <select
                          value={formData.itemType}
                          onChange={(e) => setFormData({ ...formData, itemType: e.target.value })}
                          className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                        >
                          <option value="product">Producto</option>
                          <option value="service">Servicio</option>
                        </select>
                      </div>
                      <div className="space-y-2"><Label>Costo (MXN)</Label><Input type="number" step="0.01" value={formData.cost} onChange={(e) => setFormData({ ...formData, cost: e.target.value })} required /></div>
                      <div className="space-y-2"><Label>Precio de venta (MXN)</Label><Input type="number" step="0.01" value={formData.price} onChange={(e) => setFormData({ ...formData, price: e.target.value })} required /></div>
                      <div className="space-y-2"><Label>Cantidad</Label><Input type="number" value={formData.quantity} onChange={(e) => setFormData({ ...formData, quantity: e.target.value })} required /></div>
                      <div className="space-y-2"><Label>Umbral de alerta de stock bajo</Label><Input type="number" value={formData.lowStockThreshold} onChange={(e) => setFormData({ ...formData, lowStockThreshold: e.target.value })} placeholder="10" /></div>
                      <div className="space-y-2"><Label>Fecha de vencimiento</Label><Input type="date" value={formData.expirationDate} onChange={(e) => setFormData({ ...formData, expirationDate: e.target.value })} /></div>
                      <div className="space-y-2"><Label>Número de lote</Label><Input value={formData.batchNumber} onChange={(e) => setFormData({ ...formData, batchNumber: e.target.value })} placeholder="Ej. LOT-2024-001" /></div>
                      <div className="space-y-2"><Label>Código de barras (UPC)</Label>
                        <div className="relative">
                          <Barcode className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                          <Input 
                            className="pl-10"
                            value={formData.barcode} 
                            onChange={(e) => {
                              setFormData({ ...formData, barcode: e.target.value });
                              handleBarcodeScan(e.target.value);
                            }} 
                            placeholder="Escanear o escribir código"
                          />
                        </div>
                      </div>
                      <div className="space-y-2"><Label>Ubicación en almacén</Label><Input value={formData.warehouseLocation} onChange={(e) => setFormData({ ...formData, warehouseLocation: e.target.value })} required placeholder="Ej. Pasillo 5, Estante B" /></div>
                      <div className="space-y-2">
                        <Label>Proveedor</Label>
                        <select
                          value={formData.supplierId}
                          onChange={(e) => setFormData({ ...formData, supplierId: e.target.value })}
                          className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                        >
                          <option value="">Sin proveedor</option>
                          {suppliers.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </div>
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
                    {['Nombre','Indicación','Depto','Costo','Precio','Cant','Receta','Vencimiento','Lote','Almacén','Proveedor','Acciones'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-sm font-semibold text-slate-900">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredInventory.map((item) => {
                    const expiryStatus = getExpiryStatus(item.expiration_date);
                    const isLow = item.quantity <= (item.low_stock_threshold || LOW_STOCK_THRESHOLD);
                    return (
                      <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-sm font-medium text-slate-900">{item.name}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{item.use}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{item.department || '-'}</td>
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
                        <td className="px-4 py-3 text-sm text-slate-600">{item.batch_number || '-'}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{item.warehouse_location}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{item.suppliers?.name || '-'}</td>
                        <td className="px-4 py-3 text-sm">
                          <div className="flex space-x-2">
                            <button onClick={() => handleEdit(item)} className="text-blue-600 hover:text-blue-800" title="Editar"><Edit className="w-4 h-4" /></button>
                            <button onClick={() => handleAdjustStock(item)} className="text-orange-600 hover:text-orange-800" title="Ajustar stock"><SlidersHorizontal className="w-4 h-4" /></button>
                            <button onClick={() => viewAdjustmentHistory(item)} className="text-purple-600 hover:text-purple-800" title="Historial"><History className="w-4 h-4" /></button>
                            <button onClick={() => handleDelete(item.id)} className="text-red-600 hover:text-red-800" title="Eliminar"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredInventory.length === 0 && <p className="text-center text-slate-500 py-8">Sin artículos encontrados.</p>}
            </div>
          </div>
        </div>

        {/* Stock Adjustment Modal */}
        <Dialog open={isAdjustmentDialogOpen} onOpenChange={(open) => { if (!open) closeAdjustmentModal(); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Ajustar Stock - {adjustmentItem?.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-slate-50 p-3 rounded">
                <p className="text-sm text-slate-600">Stock actual: <strong>{adjustmentItem?.quantity}</strong></p>
              </div>
              <div className="space-y-2">
                <Label>Nueva cantidad *</Label>
                <Input 
                  type="number" 
                  min="0"
                  value={adjustmentForm.newQuantity}
                  onChange={(e) => setAdjustmentForm({ ...adjustmentForm, newQuantity: e.target.value })}
                  placeholder="Ingresa la nueva cantidad"
                />
              </div>
              <div className="space-y-2">
                <Label>Motivo del ajuste *</Label>
                <Textarea 
                  value={adjustmentForm.reason}
                  onChange={(e) => setAdjustmentForm({ ...adjustmentForm, reason: e.target.value })}
                  placeholder="Ej: Conteo físico, Producto dañado, Corrección de inventario..."
                  rows={3}
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={submitAdjustment} className="flex-1">Guardar ajuste</Button>
                <Button variant="outline" onClick={closeAdjustmentModal}>Cancelar</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* CSV Import Modal */}
        <Dialog open={isImportDialogOpen} onOpenChange={(open) => { if (!open) closeImportDialog(); }}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-purple-600" />
                Importar inventario desde CSV
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
                <p className="font-semibold mb-1">Columnas esperadas:</p>
                <p><code>Producto, Costo, Venta, Existencia, Departamento</code></p>
                <p className="mt-1 text-blue-700">Los campos faltantes (código de barras, lote, vencimiento, receta, etc.) los podrás completar después editando cada producto.</p>
              </div>

              <div className="space-y-2">
                <Label>Archivo CSV</Label>
                <Input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleImportFile}
                  disabled={isImporting}
                />
              </div>

              {importFileName && importRows.length > 0 && (
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <p className="font-medium text-slate-900">{importFileName}</p>
                  <p className="text-sm text-slate-600">Productos listos para importar: <strong>{importRows.length}</strong></p>
                  {importErrors.length > 0 && (
                    <p className="text-sm text-orange-600 mt-1">Filas con error (se omitirán): <strong>{importErrors.length}</strong></p>
                  )}

                  <div className="mt-3 max-h-48 overflow-y-auto border border-slate-200 rounded">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-100 sticky top-0">
                        <tr>
                          <th className="px-2 py-1 text-left">Nombre</th>
                          <th className="px-2 py-1 text-right">Costo</th>
                          <th className="px-2 py-1 text-right">Venta</th>
                          <th className="px-2 py-1 text-right">Cant</th>
                          <th className="px-2 py-1 text-left">Depto</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {importRows.slice(0, 20).map((row, idx) => (
                          <tr key={idx}>
                            <td className="px-2 py-1 text-slate-900">{row.name}</td>
                            <td className="px-2 py-1 text-right">{formatMXN(row.cost)}</td>
                            <td className="px-2 py-1 text-right">{formatMXN(row.price)}</td>
                            <td className="px-2 py-1 text-right">{row.quantity}</td>
                            <td className="px-2 py-1 text-slate-600">{row.department || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {importRows.length > 20 && (
                      <p className="text-xs text-slate-500 p-2 text-center">...y {importRows.length - 20} productos más</p>
                    )}
                  </div>

                  {importErrors.length > 0 && (
                    <div className="mt-3 max-h-32 overflow-y-auto">
                      <p className="text-xs font-semibold text-orange-700 mb-1">Errores encontrados:</p>
                      {importErrors.slice(0, 5).map((err, idx) => (
                        <p key={idx} className="text-xs text-orange-600">Fila {err.line}: {err.reason}</p>
                      ))}
                      {importErrors.length > 5 && (
                        <p className="text-xs text-orange-600">...y {importErrors.length - 5} errores más</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {importResult && (
                <div className={`rounded-lg p-4 border ${importResult.errors === 0 ? 'bg-green-50 border-green-200 text-green-800' : 'bg-orange-50 border-orange-200 text-orange-800'}`}>
                  <p className="font-medium">
                    {importResult.errors === 0 ? '✅ Importación exitosa' : '⚠️ Importación parcial'}
                  </p>
                  <p className="text-sm">Insertados: <strong>{importResult.inserted}</strong> | Errores: <strong>{importResult.errors}</strong></p>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button
                  onClick={handleImport}
                  disabled={importRows.length === 0 || isImporting}
                  className="flex-1 bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700"
                >
                  {isImporting ? 'Importando...' : `Importar ${importRows.length} productos`}
                </Button>
                <Button variant="outline" onClick={closeImportDialog} disabled={isImporting}>Cancelar</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Adjustment History Modal */}
        <Dialog open={!!showHistoryItem} onOpenChange={() => setShowHistoryItem(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Historial de Ajustes - {showHistoryItem?.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {adjustmentHistory.length === 0 ? (
                <p className="text-center text-slate-500 py-8">No hay movimientos registrados para este producto</p>
              ) : (
                <div className="space-y-3">
                  {adjustmentHistory.map((movement) => {
                    const typeLabels = {
                      sale: 'Venta',
                      return: 'Devolución',
                      adjustment: 'Ajuste',
                      purchase: 'Compra',
                      void: 'Anulación',
                      edit: 'Edición',
                    };
                    const typeColors = {
                      sale: 'bg-red-100 text-red-700',
                      return: 'bg-green-100 text-green-700',
                      adjustment: 'bg-blue-100 text-blue-700',
                      purchase: 'bg-purple-100 text-purple-700',
                      void: 'bg-amber-100 text-amber-700',
                      edit: 'bg-slate-100 text-slate-700',
                    };
                    return (
                      <div key={movement.id} className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                        <div className="flex justify-between items-start">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-xs px-2 py-0.5 rounded font-semibold ${typeColors[movement.type] || 'bg-slate-100 text-slate-700'}`}>
                                {typeLabels[movement.type] || movement.type}
                              </span>
                              <p className="font-medium text-sm">
                                {movement.previous_quantity} → {movement.new_quantity} unidades
                                <span className={`ml-2 text-xs px-2 py-0.5 rounded ${movement.quantity_change > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                  {movement.quantity_change > 0 ? '+' : ''}{movement.quantity_change}
                                </span>
                              </p>
                            </div>
                            <p className="text-sm text-slate-600 mt-1">{movement.reason}</p>
                          </div>
                          <div className="text-right text-sm text-slate-500 ml-4 shrink-0">
                            <p>{new Date(movement.created_at).toLocaleDateString('es-MX')}</p>
                            <p className="text-xs">{movement.user_name || 'Sistema'}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <Button variant="outline" className="w-full" onClick={() => setShowHistoryItem(null)}>Cerrar</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
};

export default InventoryDashboard;
