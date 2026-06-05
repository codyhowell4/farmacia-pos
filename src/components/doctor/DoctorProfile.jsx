import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  UserCircle, Stethoscope, Phone, Mail, Award, Activity,
  Calendar, MapPin
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { getDoctorProfile } from '@/lib/db';
import { toast } from 'sonner';

const InfoRow = ({ icon: Icon, label, value, fallback }) => (
  <div className="flex items-start gap-3 py-3 border-b border-slate-100 last:border-0">
    <div className="mt-0.5 p-2 rounded-lg bg-teal-50 text-teal-600">
      <Icon className="w-4 h-4" />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
      <p className="text-sm font-medium text-slate-900 mt-0.5">
        {value || fallback || <span className="text-slate-400 italic">No registrado</span>}
      </p>
    </div>
  </div>
);

const DoctorProfile = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      console.log('[DoctorProfile] loading for user.id:', user.id);
      const data = await getDoctorProfile(user.id);
      console.log('[DoctorProfile] loaded data:', JSON.stringify(data, null, 2));
      setProfile(data);
    } catch (err) {
      toast.error('Error cargando perfil médico');
      console.error('[DoctorProfile] load error:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Mi Perfil</h2>
          <p className="text-slate-600">Información profesional y configuración</p>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl shadow-lg p-6 space-y-4">
          <div className="flex items-center gap-4">
            <Skeleton className="w-16 h-16 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Header Card */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center text-white text-xl font-bold shrink-0">
                {user?.name?.charAt(0)?.toUpperCase() || 'D'}
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-slate-900 truncate">
                  {user?.name || 'Doctor'}
                </h3>
                <p className="text-sm text-slate-500 flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5" />
                  {profile?.profiles?.email || user?.email || 'Sin email'}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <Badge className={profile?.is_active
                    ? 'bg-green-100 text-green-800 border-green-200'
                    : 'bg-red-100 text-red-800 border-red-200'
                  }>
                    {profile?.is_active ? 'Activo' : 'Inactivo'}
                  </Badge>
                  {profile?.specialty && (
                    <Badge variant="outline" className="text-slate-600">
                      {profile.specialty}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Professional Info */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h4 className="text-sm font-semibold text-slate-900 mb-1 flex items-center gap-2">
              <Stethoscope className="w-4 h-4 text-teal-600" />
              Información profesional
            </h4>
            {!profile ? (
              <div className="text-center py-6 text-slate-500">
                <Award className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                <p className="text-sm">No hay perfil médico registrado.</p>
                <p className="text-xs text-slate-400 mt-1">Contacta al administrador para completar tu registro.</p>
              </div>
            ) : (
              <div className="mt-2">
                <InfoRow
                  icon={Award}
                  label="Cédula profesional"
                  value={profile.license_number}
                />
                <InfoRow
                  icon={Stethoscope}
                  label="Especialidad"
                  value={profile.specialty}
                />
                <InfoRow
                  icon={Phone}
                  label="Teléfono"
                  value={profile.phone}
                />
                <InfoRow
                  icon={Activity}
                  label="Estado"
                  value={profile.is_active ? 'Activo en el sistema' : 'Inactivo'}
                />
              </div>
            )}
          </div>

          {/* Organization Info */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h4 className="text-sm font-semibold text-slate-900 mb-1 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-teal-600" />
              Información de la organización
            </h4>
            <div className="mt-2">
              <InfoRow
                icon={UserCircle}
                label="ID de usuario"
                value={user?.id}
              />
              <InfoRow
                icon={Calendar}
                label="Rol"
                value={user?.role === 'doctor' ? 'Médico' : user?.role}
              />
              <InfoRow
                icon={MapPin}
                label="Sucursal"
                value={user?.pharmacyLocation}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DoctorProfile;
