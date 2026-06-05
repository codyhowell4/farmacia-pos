import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  Package, Plus, Search, Check, ShoppingBag, AlertTriangle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem
} from '@/components/ui/select';
import {
  getPreordersByDoctor, updatePreorderStatus, createPreorder,
  getCustomersForDoctor, getInventoryForDoctor
} from '@/lib/db';
import { toast } from 'sonner';

const statusColors = {
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  ready: 'bg-blue-100 text-blue-800 border-blue-200',
  picked_up: 'bg-green-100 text-green-800 border-green-200',
  cancelled: 'bg-red-100 text-red-800 border-red-200',
};

const statusLabels = {
  pending: 'Pendiente',
  ready: 'Listo',
  picked_up: 'Entregado',
  cancelled: 'Cancelado',
};

const formatDate = (ts) => {
  if (!ts) return '-';
  return new Date(ts).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
};

const DoctorPreorders = () => {
  const { user } = useAuth();
  const [preorders, setPreorders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    customer_id: '',
    walkin_name: '',
    inventory_id: '',
    quantity: '1',
    notes: '',
  });
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const safePreorders = Array.isArray(preorders) ? preorders : [];
  const safeCustomers = Array.isArray(customers) ? customers : [];
  const safeInventory = Array.isArray(inventory) ? inventory : [];

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [data, custs, inv] = await Promise.all([
        getPreordersByDoctor(user.id),
        getCustomersForDoctor(),
        getInventoryForDoctor(),
      ]);
      setPreorders(Array.isArray(data) ? data : []);
      setCustomers(Array.isArray(custs) ? custs : []);
      setInventory(Array.isArray(inv) ? inv : []);
    } catch (err) {
      toast.error('Error cargando preórdenes');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = safePreorders.filter(p => {
    const q = search.toLowerCase();
    const matchesSearch = !q ||
      (p?.customers?.full_name || p?.walkin_name || '').toLowerCase().includes(q) ||
      (p?.inventory?.name || '').toLowerCase().includes(q);
    const matchesStatus = statusFilter === 'all' || p?.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const selectedItem = safeInventory.find(i => i.id === form.inventory_id);
  const maxStock = selectedItem?.quantity ?? 0;

  const openCreate = () => {
    setForm({
      customer_id: '',
      walkin_name: '',
      inventory_id: '',
      quantity: '1',
      notes: '',
    });
    setFormErrors({});
    setDialogOpen(true);
  };

  const validate = () => {
    const errors = {};
    if (!form.customer_id && !form.walkin_name?.trim()) {
      errors.patient = 'Selecciona un paciente registrado o ingresa un nombre';
    }
    if (!form.inventory_id) {
      errors.inventory = 'Selecciona un medicamento';
    }
    const qty = parseInt(form.quantity, 10);
    if (!qty || qty < 1) {
      errors.quantity = 'La cantidad debe ser al menos 1';
    } else if (selectedItem && qty > selectedItem.quantity) {
      errors.quantity = `Solo hay ${selectedItem.quantity} unidad(es) disponible(s)`;
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate() || !user?.id) return;
    setSubmitting(true);
    try {
      const payload = {
        doctor_id: user.id,
        customer_id: form.customer_id || null,
        walkin_name: form.customer_id ? null : form.walkin_name.trim() || null,
        inventory_id: form.inventory_id,
        quantity: parseInt(form.quantity, 10),
        notes: form.notes.trim() || null,
        status: 'pending',
      };
      await createPreorder(payload);
      toast.success('Preórden creada exitosamente');
      setDialogOpen(false);
      loadData();
    } catch (err) {
      toast.error(err.message || 'Error creando preórden');
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (id, status) => {
    if (!id) return;
    try {
      await updatePreorderStatus(id, status);
      toast.success(`Estado actualizado a ${statusLabels[status]}`);
      loadData();
    } catch (err) {
      toast.error('Error actualizando estado');
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Preórdenes</h2>
          <p className="text-slate-600">Solicita medicamentos del inventario para tus pacientes</p>
        </div>
        <Button onClick={openCreate} className="bg-teal-600 hover:bg-teal-700">
          <Plus className="w-4 h-4 mr-2" />
          Nueva preórden
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Buscar paciente o medicamento..."
            className="pl-10"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pending">Pendiente</SelectItem>
            <SelectItem value="ready">Listo</SelectItem>
            <SelectItem value="picked_up">Entregado</SelectItem>
            <SelectItem value="cancelled">Cancelado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl shadow-lg p-8 text-center">
          <Package className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500">
            {search || statusFilter !== 'all' ? 'No se encontraron preórdenes' : 'No hay preórdenes registradas'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-lg overflow-hidden divide-y">
          {filtered.map(p => (
            <div key={p?.id || Math.random()} className="p-4 hover:bg-slate-50 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-slate-900">
                      {p?.customers?.full_name || p?.walkin_name || 'Paciente'}
                    </p>
                    <Badge className={statusColors[p?.status] || 'bg-gray-100 text-gray-800'}>
                      {statusLabels[p?.status] || p?.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-sm text-slate-500 flex-wrap">
                    <span className="flex items-center gap-1">
                      <ShoppingBag className="w-3.5 h-3.5" />
                      {p?.inventory?.name || 'Medicamento desconocido'}
                    </span>
                    <span>Cantidad: {p?.quantity ?? 0}</span>
                    <span>{formatDate(p?.created_at)}</span>
                  </div>
                  {p?.notes && (
                    <p className="text-sm text-slate-600 mt-2">{p.notes}</p>
                  )}
                </div>

                <div className="shrink-0">
                  {p?.status === 'pending' && (
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-blue-600 border-blue-200 hover:bg-blue-50"
                        onClick={() => handleStatusChange(p?.id, 'ready')}
                      >
                        <Check className="w-3 h-3 mr-1" />
                        Listo
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 border-red-200 hover:bg-red-50"
                        onClick={() => handleStatusChange(p?.id, 'cancelled')}
                      >
                        Cancelar
                      </Button>
                    </div>
                  )}
                  {p?.status === 'ready' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-green-600 border-green-200 hover:bg-green-50"
                      onClick={() => handleStatusChange(p?.id, 'picked_up')}
                    >
                      <Check className="w-3 h-3 mr-1" />
                      Entregado
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nueva preórden</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Patient */}
            <div>
              <Label>Paciente registrado</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={form.customer_id}
                onChange={e => setForm({ ...form, customer_id: e.target.value })}
              >
                <option value="">Sin paciente registrado</option>
                {safeCustomers.map(c => (
                  <option key={c?.id || Math.random()} value={c?.id || ''}>{c?.full_name || 'Sin nombre'}</option>
                ))}
              </select>
            </div>

            {!form.customer_id && (
              <div>
                <Label>Nombre del paciente (sin registro)</Label>
                <Input
                  value={form.walkin_name}
                  onChange={e => setForm({ ...form, walkin_name: e.target.value })}
                  placeholder="Nombre del paciente"
                />
                {formErrors.patient && (
                  <p className="text-xs text-red-600 mt-1">{formErrors.patient}</p>
                )}
              </div>
            )}

            {/* Inventory */}
            <div>
              <Label>Medicamento</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={form.inventory_id}
                onChange={e => setForm({ ...form, inventory_id: e.target.value })}
              >
                <option value="">Seleccionar medicamento...</option>
                {safeInventory.map(item => (
                  <option key={item?.id || Math.random()} value={item?.id || ''}>
                    {item?.name || 'Sin nombre'} ({item?.quantity ?? 0} disponible{item?.requires_prescription ? ' - Requiere receta' : ''})
                  </option>
                ))}
              </select>
              {formErrors.inventory && (
                <p className="text-xs text-red-600 mt-1">{formErrors.inventory}</p>
              )}
            </div>

            {/* Quantity */}
            <div>
              <Label>Cantidad</Label>
              <Input
                type="number"
                min={1}
                max={maxStock || undefined}
                value={form.quantity}
                onChange={e => setForm({ ...form, quantity: e.target.value })}
                placeholder="Cantidad"
              />
              {selectedItem && (
                <p className="text-xs text-slate-500 mt-1">
                  Stock disponible: {selectedItem.quantity} unidad(es)
                  {selectedItem.requires_prescription && (
                    <span className="text-amber-600 ml-2 flex items-center gap-1 inline-flex">
                      <AlertTriangle className="w-3 h-3" />
                      Requiere receta médica
                    </span>
                  )}
                </p>
              )}
              {formErrors.quantity && (
                <p className="text-xs text-red-600 mt-1">{formErrors.quantity}</p>
              )}
            </div>

            {/* Notes */}
            <div>
              <Label>Notas</Label>
              <Textarea
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="Instrucciones o comentarios..."
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-teal-600 hover:bg-teal-700" disabled={submitting}>
                {submitting ? 'Creando...' : 'Crear preórden'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DoctorPreorders;
