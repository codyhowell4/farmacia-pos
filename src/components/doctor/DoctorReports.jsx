import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getConsultaNotesByDoctor, getAppointmentsByDoctor, getDoctorPrescriptions } from '@/lib/db';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BarChart3, Stethoscope, CalendarCheck, Pill, FileText, Users } from 'lucide-react';
import { toast } from 'sonner';

const toISODate = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const getDefaultRange = () => {
  const now = new Date();
  return {
    from: toISODate(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: toISODate(now),
  };
};

const isWithinRange = (dateStr, from, to) => {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  return d >= new Date(`${from}T00:00:00`) && d <= new Date(`${to}T23:59:59.999`);
};

const SummaryCard = ({ label, value, icon: Icon }) => (
  <div className="rounded-xl p-6 border bg-apolo-navy/5 border-apolo-navy/20 text-apolo-navy">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm opacity-80">{label}</p>
        <p className="text-3xl font-bold mt-1">{value}</p>
      </div>
      <Icon className="w-8 h-8 opacity-60" />
    </div>
  </div>
);

const statusLabels = {
  completed: 'Completadas',
  cancelled: 'Canceladas',
  pending: 'Pendientes',
  confirmed: 'Confirmadas',
};

const statusDot = {
  completed: 'bg-green-500',
  cancelled: 'bg-red-500',
  pending: 'bg-yellow-500',
  confirmed: 'bg-blue-500',
};

const DoctorReports = () => {
  const { user } = useAuth();
  const [range, setRange] = useState(getDefaultRange);
  const [notes, setNotes] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [n, a, rx] = await Promise.all([
        getConsultaNotesByDoctor(user.id, {
          from: `${range.from}T00:00:00`,
          to: `${range.to}T23:59:59.999`,
        }),
        getAppointmentsByDoctor(user.id),
        getDoctorPrescriptions(),
      ]);
      setNotes(Array.isArray(n) ? n : []);
      setAppointments(Array.isArray(a) ? a : []);
      setPrescriptions(Array.isArray(rx) ? rx : []);
    } catch (err) {
      toast.error('Error cargando reportes');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [user?.id, range.from, range.to]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Citas del rango seleccionado
  const rangeAppointments = useMemo(
    () => appointments.filter((ap) => isWithinRange(ap?.appointment_date, range.from, range.to)),
    [appointments, range.from, range.to]
  );

  // Recetas del doctor dentro del rango
  const rangePrescriptions = useMemo(
    () => prescriptions.filter(
      (rx) => rx?.doctor_id === user?.id && isWithinRange(rx?.created_at, range.from, range.to)
    ),
    [prescriptions, user?.id, range.from, range.to]
  );

  // Consultas por diagnóstico (CIE-10)
  const diagnosisRows = useMemo(() => {
    const counts = new Map();
    notes.forEach((note) => {
      const codes = Array.isArray(note?.cie10_codes) ? note.cie10_codes : [];
      if (codes.length === 0) {
        const entry = counts.get('SIN_CODIGO') || { code: 'Sin código', description: 'Consulta sin diagnóstico CIE-10', count: 0 };
        entry.count += 1;
        counts.set('SIN_CODIGO', entry);
        return;
      }
      codes.forEach((c) => {
        const code = typeof c === 'string' ? c : c?.code || 'Sin código';
        const description = typeof c === 'object' && c?.description ? c.description : '—';
        const entry = counts.get(code) || { code, description, count: 0 };
        entry.count += 1;
        counts.set(code, entry);
      });
    });
    return [...counts.values()].sort((a, b) => b.count - a.count);
  }, [notes]);

  // Resultados de citas
  const appointmentStats = useMemo(() => {
    const stats = { completed: 0, cancelled: 0, pending: 0, confirmed: 0 };
    rangeAppointments.forEach((ap) => {
      if (stats[ap?.status] !== undefined) stats[ap.status] += 1;
    });
    const done = stats.completed + stats.cancelled;
    const attendance = done > 0 ? Math.round((stats.completed / done) * 100) : null;
    return { ...stats, attendance, total: rangeAppointments.length };
  }, [rangeAppointments]);

  // Medicamentos más recetados (top 15)
  const topMedications = useMemo(() => {
    const counts = new Map();
    rangePrescriptions.forEach((rx) => {
      const meds = Array.isArray(rx?.medications) ? rx.medications : [];
      meds.forEach((med) => {
        const name = (med?.medication || '').trim();
        if (!name) return;
        const key = name.toLowerCase();
        const entry = counts.get(key) || { name, count: 0 };
        entry.count += 1;
        counts.set(key, entry);
      });
    });
    return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 15);
  }, [rangePrescriptions]);

  // Pacientes únicos atendidos (con nota de consulta en el rango)
  const uniquePatients = useMemo(
    () => new Set(notes.map((n) => n?.customer_id).filter(Boolean)).size,
    [notes]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Reportes</h2>
          <p className="text-slate-600">Estadísticas de tu actividad médica</p>
        </div>
        <div className="flex items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="reports-from" className="text-xs text-slate-500">Del</Label>
            <Input
              id="reports-from"
              type="date"
              value={range.from}
              max={range.to}
              onChange={(e) => e.target.value && setRange((r) => ({ ...r, from: e.target.value }))}
              className="bg-white"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="reports-to" className="text-xs text-slate-500">Al</Label>
            <Input
              id="reports-to"
              type="date"
              value={range.to}
              min={range.from}
              onChange={(e) => e.target.value && setRange((r) => ({ ...r, to: e.target.value }))}
              className="bg-white"
            />
          </div>
        </div>
      </div>

      {/* Resumen */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <SummaryCard label="Consultas" value={notes.length} icon={Stethoscope} />
          <SummaryCard label="Recetas emitidas" value={rangePrescriptions.length} icon={FileText} />
          <SummaryCard label="Pacientes únicos atendidos" value={uniquePatients} icon={Users} />
        </div>
      )}

      {/* Resultados de citas */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <CalendarCheck className="w-5 h-5 text-apolo-navy" />
          <h3 className="text-lg font-semibold text-slate-900">Resultados de citas</h3>
        </div>
        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
          </div>
        ) : appointmentStats.total === 0 ? (
          <p className="text-center py-6 text-slate-500">No hay citas en el rango seleccionado</p>
        ) : (
          <div className="space-y-3">
            {Object.keys(statusLabels).map((status) => (
              <div key={status} className="flex items-center justify-between p-3 rounded-lg border bg-slate-50">
                <div className="flex items-center gap-3">
                  <span className={`w-2.5 h-2.5 rounded-full ${statusDot[status]}`} />
                  <span className="text-sm font-medium text-slate-700">{statusLabels[status]}</span>
                </div>
                <span className="text-sm font-bold text-slate-900">{appointmentStats[status]}</span>
              </div>
            ))}
            <div className="flex items-center justify-between p-3 rounded-lg border border-apolo-navy/20 bg-apolo-navy/5">
              <span className="text-sm font-medium text-apolo-navy">% de asistencia</span>
              <span className="text-sm font-bold text-apolo-navy">
                {appointmentStats.attendance === null ? '—' : `${appointmentStats.attendance}%`}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Consultas por diagnóstico */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-5 h-5 text-apolo-navy" />
          <h3 className="text-lg font-semibold text-slate-900">Consultas por diagnóstico</h3>
        </div>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
          </div>
        ) : diagnosisRows.length === 0 ? (
          <p className="text-center py-6 text-slate-500">No hay consultas en el rango seleccionado</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="py-2 pr-4 font-medium">Código</th>
                  <th className="py-2 pr-4 font-medium">Descripción</th>
                  <th className="py-2 font-medium text-right">Consultas</th>
                </tr>
              </thead>
              <tbody>
                {diagnosisRows.map((row) => (
                  <tr key={row.code} className="border-b last:border-0">
                    <td className="py-2.5 pr-4 font-medium text-slate-900 whitespace-nowrap">{row.code}</td>
                    <td className="py-2.5 pr-4 text-slate-600">{row.description}</td>
                    <td className="py-2.5 text-right font-bold text-slate-900">{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Medicamentos más recetados */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <Pill className="w-5 h-5 text-apolo-navy" />
          <h3 className="text-lg font-semibold text-slate-900">Medicamentos más recetados</h3>
        </div>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
          </div>
        ) : topMedications.length === 0 ? (
          <p className="text-center py-6 text-slate-500">No hay recetas en el rango seleccionado</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="py-2 pr-4 font-medium w-10">#</th>
                  <th className="py-2 pr-4 font-medium">Medicamento</th>
                  <th className="py-2 font-medium text-right">Veces recetado</th>
                </tr>
              </thead>
              <tbody>
                {topMedications.map((med, idx) => (
                  <tr key={med.name} className="border-b last:border-0">
                    <td className="py-2.5 pr-4 text-slate-400">{idx + 1}</td>
                    <td className="py-2.5 pr-4 font-medium text-slate-900">{med.name}</td>
                    <td className="py-2.5 text-right font-bold text-slate-900">{med.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default DoctorReports;
