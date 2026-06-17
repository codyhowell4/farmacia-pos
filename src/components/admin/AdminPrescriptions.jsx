import React, { useState, useEffect } from 'react';
import { Search, FileText, Pill, UserCircle, Stethoscope, Clock, XCircle, AlertCircle, ClipboardList, Printer, X, FileDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { getDoctorPrescriptions, updatePrescriptionStatus, cancelDoctorPrescription, getPrescriptionById } from '@/lib/db';
import { downloadPrescriptionPDF } from '@/lib/pdf';
import PrintablePrescription from '@/components/doctor/PrintablePrescription';

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
  const [printRxFull, setPrintRxFull] = useState(null);
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
                {filtered.map((rx) => {
                  const meds = Array.isArray(rx.medications) && rx.medications.length > 0
                    ? rx.medications
                    : rx.medication ? [{ medication: rx.medication, dosage: rx.dosage, frequency: rx.frequency, duration: rx.duration }] : [];
                  return (
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
                        {(rx.height_cm || rx.weight_kg) && (
                          <p className="text-xs text-slate-400 mt-0.5">
                            {rx.height_cm && `Talla: ${rx.height_cm}cm`}
                            {rx.height_cm && rx.weight_kg && ' · '}
                            {rx.weight_kg && `Peso: ${rx.weight_kg}kg`}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex items-center gap-1.5">
                          <Stethoscope className="w-3.5 h-3.5 text-slate-400" />
                          <span>{rx.profiles?.full_name || '—'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-900">
                        <div className="space-y-0.5">
                          {meds.map((med, i) => (
                            <div key={i} className="flex items-center gap-1.5">
                              <Pill className="w-3 h-3 text-teal-500" />
                              <span>{med.medication}</span>
                            </div>
                          ))}
                          {meds.length === 0 && '—'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {meds.map((med, i) => (
                          <div key={i}>
                            {med.dosage && <span>{med.dosage}</span>}
                            {med.frequency && <span className="text-slate-400"> · {med.frequency}</span>}
                            {med.duration && <span className="text-slate-400"> · {med.duration}</span>}
                          </div>
                        ))}
                        {meds.length === 0 && '—'}
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
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" className="text-slate-500 h-7 px-1" onClick={async () => {
                            const full = await getPrescriptionById(rx.id);
                            setPrintRxFull(full);
                          }}>
                            <Printer className="w-3.5 h-3.5" />
                          </Button>
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
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center">
                      <div className="flex flex-col items-center">
                        <ClipboardList className="w-10 h-10 text-slate-300 mb-2" />
                        <p className="text-slate-500">
                          {searchTerm || statusFilter !== 'all'
                            ? 'No se encontraron recetas con ese criterio'
                            : 'No hay recetas médicas registradas.'}
                        </p>
                        {!searchTerm && statusFilter === 'all' && (
                          <p className="text-xs text-slate-400 mt-1">
                            Las recetas creadas por médicos aparecerán aquí automáticamente.
                          </p>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Print Preview Overlay — plain div, no Dialog import needed */}
      {printRxFull && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full my-4">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">Vista previa de receta</h2>
              <button
                onClick={() => setPrintRxFull(null)}
                className="rounded-full p-1.5 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[70vh]">
              <PrintablePrescription prescription={printRxFull} customer={printRxFull.customers} />
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t no-print">
              <Button variant="outline" onClick={() => setPrintRxFull(null)}>Cerrar</Button>
              <Button variant="outline" onClick={() => downloadPrescriptionPDF(printRxFull, printRxFull?.customers, `Receta_${printRxFull?.prescription_number || 'sinfolio'}.pdf`)}>
                <FileDown className="w-4 h-4 mr-2" /> Descargar PDF
              </Button>
              <Button onClick={() => window.print()}>
                <Printer className="w-4 h-4 mr-2" /> Imprimir
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPrescriptions;
