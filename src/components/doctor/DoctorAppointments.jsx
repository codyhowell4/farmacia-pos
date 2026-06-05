import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  Calendar, Plus, Search, Clock, Phone, Check, Trash2, Edit2
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
  getAppointmentsByDoctor, createAppointment, updateAppointment, deleteAppointment,
  getCustomersForDoctor
} from '@/lib/db';
import { toast } from 'sonner';

const statusColors = {
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  confirmed: 'bg-blue-100 text-blue-800 border-blue-200',
  completed: 'bg-green-100 text-green-800 border-green-200',
  cancelled: 'bg-red-100 text-red-800 border-red-200',
};

const statusLabels = {
  pending: 'Pendiente',
  confirmed: 'Confirmada',
  completed: 'Completada',
  cancelled: 'Cancelada',
};

const formatDateTimeLocal = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

const formatDisplayDate = (iso) => {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
};

const formatDisplayTime = (iso) => {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
};

const DoctorAppointments = () => {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    customer_id: '',
    walkin_name: '',
    walkin_phone: '',
    appointment_date: '',
    status: 'pending',
    notes: '',
  });

  const safeAppointments = Array.isArray(appointments) ? appointments : [];
  const safeCustomers = Array.isArray(customers) ? customers : [];

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [appts, custs] = await Promise.all([
        getAppointmentsByDoctor(user.id),
        getCustomersForDoctor(),
      ]);
      setAppointments(appts);
      setCustomers(custs);
    } catch (err) {
      toast.error('Error cargando citas');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = safeAppointments.filter(a => {
    const matchesSearch = !search ||
      (a?.customers?.full_name || a?.walkin_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (a?.customers?.phone || a?.walkin_phone || '').includes(search);
    const matchesStatus = statusFilter === 'all' || a?.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const openCreate = () => {
    setEditing(null);
    setForm({
      customer_id: '',
      walkin_name: '',
      walkin_phone: '',
      appointment_date: formatDateTimeLocal(new Date()),
      status: 'pending',
      notes: '',
    });
    setDialogOpen(true);
  };

  const openEdit = (appt) => {
    if (!appt) return;
    setEditing(appt);
    setForm({
      customer_id: appt.customer_id || '',
      walkin_name: appt.walkin_name || '',
      walkin_phone: appt.walkin_phone || '',
      appointment_date: formatDateTimeLocal(appt.appointment_date),
      status: appt.status || 'pending',
      notes: appt.notes || '',
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user?.id) return;
    try {
      const payload = {
        ...form,
        doctor_id: user.id,
        customer_id: form.customer_id || null,
      };
      if (editing) {
        await updateAppointment(editing.id, payload);
        toast.success('Cita actualizada');
      } else {
        await createAppointment(payload);
        toast.success('Cita creada');
      }
      setDialogOpen(false);
      loadData();
    } catch (err) {
      toast.error(err.message || 'Error guardando cita');
      console.error(err);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar esta cita permanentemente?')) return;
    try {
      await deleteAppointment(id);
      toast.success('Cita eliminada');
      loadData();
    } catch (err) {
      toast.error('Error eliminando cita');
      console.error(err);
    }
  };

  const quickStatusChange = async (appt, newStatus) => {
    if (!appt?.id) return;
    try {
      await updateAppointment(appt.id, { status: newStatus });
      toast.success(`Cita marcada como ${statusLabels[newStatus]}`);
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
          <h2 className="text-2xl font-bold text-slate-900">Citas</h2>
          <p className="text-slate-600">Gestiona las citas de tus pacientes</p>
        </div>
        <Button onClick={openCreate} className="bg-teal-600 hover:bg-teal-700">
          <Plus className="w-4 h-4 mr-2" />
          Nueva cita
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Buscar paciente..."
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
            <SelectItem value="confirmed">Confirmada</SelectItem>
            <SelectItem value="completed">Completada</SelectItem>
            <SelectItem value="cancelled">Cancelada</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl shadow-lg p-8 text-center">
          <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500">
            {search || statusFilter !== 'all' ? 'No se encontraron citas' : 'No hay citas programadas'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="divide-y">
            {filtered.map(appt => (
              <div key={appt?.id || Math.random()} className="p-4 hover:bg-slate-50 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-slate-900">
                        {appt?.customers?.full_name || appt?.walkin_name || 'Paciente'}
                      </p>
                      <Badge className={statusColors[appt?.status] || 'bg-gray-100 text-gray-800'}>
                        {statusLabels[appt?.status] || appt?.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-slate-500 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {formatDisplayDate(appt?.appointment_date)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {formatDisplayTime(appt?.appointment_date)}
                      </span>
                      {(appt?.customers?.phone || appt?.walkin_phone) && (
                        <span className="flex items-center gap-1">
                          <Phone className="w-3.5 h-3.5" />
                          {appt?.customers?.phone || appt?.walkin_phone}
                        </span>
                      )}
                    </div>
                    {appt?.notes && (
                      <p className="text-sm text-slate-600 mt-2 line-clamp-2">{appt.notes}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {appt?.status === 'pending' && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                        title="Confirmar"
                        onClick={() => quickStatusChange(appt, 'confirmed')}
                      >
                        <Check className="w-4 h-4" />
                      </Button>
                    )}
                    {appt?.status === 'confirmed' && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-green-600 hover:text-green-700 hover:bg-green-50"
                        title="Completar"
                        onClick={() => quickStatusChange(appt, 'completed')}
                      >
                        <Check className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-slate-500 hover:text-slate-700"
                      title="Editar"
                      onClick={() => openEdit(appt)}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      title="Eliminar"
                      onClick={() => handleDelete(appt?.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar cita' : 'Nueva cita'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
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
              <>
                <div>
                  <Label>Nombre (sin registro)</Label>
                  <Input
                    value={form.walkin_name}
                    onChange={e => setForm({ ...form, walkin_name: e.target.value })}
                    placeholder="Nombre del paciente"
                  />
                </div>
                <div>
                  <Label>Teléfono</Label>
                  <Input
                    value={form.walkin_phone}
                    onChange={e => setForm({ ...form, walkin_phone: e.target.value })}
                    placeholder="Teléfono"
                  />
                </div>
              </>
            )}

            <div>
              <Label>Fecha y hora</Label>
              <Input
                type="datetime-local"
                value={form.appointment_date}
                onChange={e => setForm({ ...form, appointment_date: e.target.value })}
                required
              />
            </div>

            <div>
              <Label>Estado</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={form.status}
                onChange={e => setForm({ ...form, status: e.target.value })}
              >
                {Object.entries(statusLabels).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>

            <div>
              <Label>Notas</Label>
              <Textarea
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="Observaciones..."
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-teal-600 hover:bg-teal-700">
                {editing ? 'Guardar cambios' : 'Crear cita'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DoctorAppointments;
