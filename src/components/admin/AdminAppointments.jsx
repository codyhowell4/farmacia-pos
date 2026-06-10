import React, { useState, useEffect } from 'react';
import { Search, UserCircle, Clock, Calendar, Stethoscope, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { getAppointments, updateAppointment, createNotification } from '@/lib/db';

const statusConfig = {
  pending:   { label: 'Pendiente',  className: 'bg-yellow-100 text-yellow-800' },
  confirmed: { label: 'Confirmada', className: 'bg-blue-100 text-blue-800' },
  completed: { label: 'Completada', className: 'bg-green-100 text-green-800' },
  cancelled: { label: 'Cancelada',  className: 'bg-red-100 text-red-800' },
};

const StatusBadge = ({ status }) => {
  const s = statusConfig[status] || statusConfig.pending;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${s.className}`}>
      {s.label}
    </span>
  );
};

const AdminAppointments = () => {
  const [appointments, setAppointments] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const { toast } = useToast();

  const loadAppointments = async () => {
    setIsLoading(true);
    try {
      const data = await getAppointments();
      setAppointments(data);
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'No se pudieron cargar las citas', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadAppointments(); }, []);

  const handleStatusChange = async (id, newStatus) => {
    setUpdatingId(id);
    try {
      await updateAppointment(id, { status: newStatus });
      const appt = appointments.find((a) => a.id === id);
      if (appt?.customers?.id) {
        try {
          await createNotification({
            customer_id: appt.customers.id,
            profile_id: appt.customers.profile_id,
            type: 'appointment',
            title: `Cita ${statusConfig[newStatus]?.label || newStatus}`,
            message: appt.appointment_date
              ? `Tu cita del ${new Date(appt.appointment_date).toLocaleDateString('es-MX')} ha sido ${statusConfig[newStatus]?.label || newStatus}.`
              : 'Tu cita ha sido actualizada.',
            related_id: id,
            related_table: 'appointments',
          });
        } catch (notifErr) {
          console.warn('[Notification] Failed to create:', notifErr);
        }
      }
      toast({ title: 'Estado actualizado', description: `Cita marcada como ${statusConfig[newStatus]?.label || newStatus}` });
      await loadAppointments();
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setUpdatingId(null);
    }
  };

  const filtered = appointments.filter((a) => {
    const matchesSearch =
      (a.customers?.full_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (a.walkin_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (a.notes || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || (a.status || 'pending') === statusFilter;
    const matchesDate = !dateFilter || (a.appointment_date && a.appointment_date.startsWith(dateFilter));
    return matchesSearch && matchesStatus && matchesDate;
  });

  const formatDateTime = (d) => {
    if (!d) return '—';
    const date = new Date(d);
    return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ' ' + date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  };

  const nextActions = (status) => {
    switch (status) {
      case 'pending': return [
        { status: 'confirmed', label: 'Confirmar', icon: CheckCircle, className: 'border-blue-200 text-blue-700 hover:bg-blue-50' },
        { status: 'cancelled', label: 'Cancelar', icon: XCircle, className: 'border-red-200 text-red-700 hover:bg-red-50' },
      ];
      case 'confirmed': return [
        { status: 'completed', label: 'Completar', icon: CheckCircle, className: 'border-green-200 text-green-700 hover:bg-green-50' },
        { status: 'cancelled', label: 'Cancelar', icon: XCircle, className: 'border-red-200 text-red-700 hover:bg-red-50' },
      ];
      default: return [];
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Citas médicas</h1>
          <p className="text-sm text-slate-500 mt-1">Gestiona las citas de pacientes con médicos.</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <div className="flex flex-col sm:flex-row gap-4 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Buscar por paciente o notas..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="px-3 py-2 rounded-md border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {dateFilter && (
              <Button size="sm" variant="ghost" onClick={() => setDateFilter('')}>
                Limpiar
              </Button>
            )}
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-md border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Todos los estados</option>
            <option value="pending">Pendiente</option>
            <option value="confirmed">Confirmada</option>
            <option value="completed">Completada</option>
            <option value="cancelled">Cancelada</option>
          </select>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-slate-500">Cargando citas...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Paciente</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Médico</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Fecha y hora</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Motivo</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Estado</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filtered.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-sm">
                      <div className="flex items-center gap-2">
                        <UserCircle className="w-4 h-4 text-slate-400" />
                        <div className="font-medium text-slate-900">
                          {a.customers?.full_name || a.walkin_name || 'Paciente sin nombre'}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      <div className="flex items-center gap-1.5">
                        <Stethoscope className="w-3.5 h-3.5 text-emerald-500" />
                        Dr. {a.profiles?.full_name || '—'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {formatDateTime(a.appointment_date)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 max-w-xs truncate" title={a.notes || ''}>
                      {a.notes || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <StatusBadge status={a.status || 'pending'} />
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex items-center gap-2 flex-wrap">
                        {nextActions(a.status || 'pending').map((action) => {
                          const Icon = action.icon;
                          return (
                            <Button
                              key={action.status}
                              size="sm"
                              variant="outline"
                              disabled={updatingId === a.id}
                              onClick={() => handleStatusChange(a.id, action.status)}
                              className={`text-xs h-7 px-2 ${action.className}`}
                            >
                              {updatingId === a.id ? (
                                <Loader2 className="w-3 h-3 animate-spin mr-0.5" />
                              ) : (
                                <Icon className="w-3 h-3 mr-0.5" />
                              )}
                              {action.label}
                            </Button>
                          );
                        })}
                        {nextActions(a.status || 'pending').length === 0 && (
                          <span className="text-xs text-slate-400">Sin acciones</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      {searchTerm || statusFilter !== 'all' || dateFilter
                        ? 'No se encontraron citas con ese criterio'
                        : 'No hay citas registradas.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminAppointments;
