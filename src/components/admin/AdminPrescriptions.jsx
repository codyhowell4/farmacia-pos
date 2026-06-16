import React, { useState, useEffect } from 'react';
import { Search, FileText, Pill, UserCircle, Stethoscope, Clock, XCircle, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { getDoctorPrescriptions, updatePrescriptionStatus, cancelDoctorPrescription } from '@/lib/db';

const statusConfig = {
  active: { label: 'Activa', className: 'bg-green-100 text-green-800' },
  fulfilled: { label: 'Surtida', className: 'bg-blue-100 text-blue-800' },
  expired: { label: 'Expirada', className: 'bg-amber-100 text-amber-800' },
  cancelled: { label: 'Cancelada', className: 'bg-red-100 text-red-800' },
};

const AdminPrescriptions = () => {
  const [prescriptions, setPrescriptions] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const { toast } = useToast();

  const loadPrescriptions = async () => {
    setIsLoading(true);
    try {
      const data = await getDoctorPrescriptions();
      setPrescriptions(data);
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'No se pudieron cargar las recetas médicas', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadPrescriptions(); }, []);

  const handleCancel = async (id) => {
    if (!confirm('¿Cancelar esta receta?')) return;
    setUpdatingId(id);
    try {
      await cancelDoctorPrescription(id);
      toast({ title: 'Receta cancelada', description: 'La receta ha sido marcada como cancelada' });
      await loadPrescriptions();
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setUpdatingId(null);
    }
  };

  const filtered = prescriptions.filter((rx) => {
    const matchesSearch =
      (rx.prescription_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (rx.patient_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (rx.customers?.full_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (rx.medication || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (rx.profiles?.full_name || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || (rx.status || 'active') === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const formatDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Recetas médicas</h1>
          <p className="text-sm text-slate-500 mt-1">Recetas creadas por médicos en el sistema.</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <div className="flex flex-col sm:flex-row gap-4 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Buscar por número, paciente, medicamento o médico..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-md border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Todos los estados</option>
            <option value="active">🟢 Activa</option>
            <option value="fulfilled">🔵 Surtida</option>
            <option value="expired">🟡 Expirada</option>
            <option value="cancelled">🔴 Cancelada</option>
          </select>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <Skeleton key={i} className="h-20 rounded-lg" />)}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Número</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Paciente</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Médico</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Medicamento</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Dosis/Frecuencia</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Estado</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Fecha</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filtered.map((rx) => (
                  <tr key={rx.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-sm">
                      <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded">{rx.prescription_number}</span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex items-center gap-2">
                        <UserCircle className="w-4 h-4 text-slate-400" />
                        <span className="font-medium text-slate-900">
                          {rx.customers?.full_name || rx.patient_name || '—'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex items-center gap-1.5">
                        <Stethoscope className="w-3.5 h-3.5 text-slate-400" />
                        <span>{rx.profiles?.full_name || '—'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">
                      <div className="flex items-center gap-1.5">
                        <Pill className="w-3.5 h-3.5 text-teal-500" />
                        {rx.medication || '—'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {rx.dosage && <span>{rx.dosage}</span>}
                      {rx.frequency && <span className="text-slate-400"> · {rx.frequency}</span>}
                      {rx.duration && <span className="text-slate-400"> · {rx.duration}</span>}
                      {!rx.dosage && !rx.frequency && !rx.duration && '—'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <Badge className={statusConfig[rx.status]?.className || 'bg-gray-100'}>
                        {statusConfig[rx.status]?.label || rx.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {formatDate(rx.prescription_date || rx.created_at)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {rx.status === 'active' && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={updatingId === rx.id}
                          onClick={() => handleCancel(rx.id)}
                          className="text-xs h-7 px-2 border-red-200 text-red-700 hover:bg-red-50"
                        >
                          {updatingId === rx.id ? (
                            <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin mr-1" />
                          ) : (
                            <XCircle className="w-3 h-3 mr-0.5" />
                          )}
                          Cancelar
                        </Button>
                      )}
                      {rx.status !== 'active' && (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                      {searchTerm || statusFilter !== 'all'
                        ? 'No se encontraron recetas con ese criterio'
                        : 'No hay recetas médicas registradas.'}
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

export default AdminPrescriptions;
