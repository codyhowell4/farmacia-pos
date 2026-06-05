import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Calendar, Package, Users, FileText, Clock } from 'lucide-react';
import { getDoctorDashboardStats, getAppointmentsByDoctor } from '@/lib/db';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

const StatCard = ({ label, value, icon: Icon, color }) => {
  const colorMap = {
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    green: 'bg-green-50 border-green-200 text-green-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
  };
  return (
    <div className={`rounded-xl p-6 border ${colorMap[color]}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm opacity-80">{label}</p>
          <p className="text-3xl font-bold mt-1">{value}</p>
        </div>
        <Icon className="w-8 h-8 opacity-60" />
      </div>
    </div>
  );
};

const statusColors = {
  pending: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
};

const statusLabels = {
  pending: 'Pendiente',
  confirmed: 'Confirmada',
  completed: 'Completada',
  cancelled: 'Cancelada',
};

const formatTime = (dateStr) => {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
};

const DoctorOverview = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);

  const safeAppointments = Array.isArray(appointments) ? appointments : [];

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [s, a] = await Promise.all([
        getDoctorDashboardStats(user.id),
        getAppointmentsByDoctor(user.id),
      ]);
      setStats(s || {});
      const appts = Array.isArray(a) ? a : [];
      const today = new Date().toISOString().split('T')[0];
      const todays = appts.filter(ap => ap?.appointment_date?.startsWith(today));
      setAppointments(todays);
    } catch (err) {
      toast.error('Error cargando resumen');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Resumen</h2>
        <p className="text-slate-600">Bienvenido al portal médico</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Citas hoy" value={stats?.appointmentsToday ?? 0} icon={Calendar} color="blue" />
          <StatCard label="Preórdenes pendientes" value={stats?.pendingPreorders ?? 0} icon={Package} color="amber" />
          <StatCard label="Pacientes" value={stats?.totalCustomers ?? 0} icon={Users} color="green" />
          <StatCard label="Notas médicas" value={stats?.medicalNotes ?? 0} icon={FileText} color="purple" />
        </div>
      )}

      <div className="bg-white rounded-xl shadow-lg p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Citas de hoy</h3>
        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}
          </div>
        ) : safeAppointments.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <Calendar className="w-10 h-10 mx-auto mb-2 text-slate-300" />
            <p>No hay citas programadas para hoy</p>
          </div>
        ) : (
          <div className="space-y-3">
            {safeAppointments.map(ap => (
              <div key={ap?.id || Math.random()} className="flex items-center justify-between p-4 rounded-lg border bg-slate-50">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 text-slate-600 min-w-[60px]">
                    <Clock className="w-4 h-4" />
                    <span className="text-sm font-medium">{formatTime(ap?.appointment_date)}</span>
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">
                      {ap?.customers?.full_name || ap?.walkin_name || 'Paciente'}
                    </p>
                    <p className="text-sm text-slate-500">
                      {ap?.customers?.phone || ap?.walkin_phone || 'Sin teléfono'}
                    </p>
                  </div>
                </div>
                <Badge className={statusColors[ap?.status] || 'bg-gray-100 text-gray-800'}>
                  {statusLabels[ap?.status] || ap?.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DoctorOverview;
