import { useState, useEffect } from 'react';
import {
  Stethoscope, Search, Edit2, AlertTriangle, CheckCircle2, Phone, Award
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import { getDoctorUsersWithProfiles, upsertDoctorProfile } from '@/lib/db';
import { toast } from 'sonner';

// Normalize Supabase nested relation shape: doctor_profiles may be
// null, {}, [], or [{...}]. Always return a single object or null.
const getDoctorProfileFromRow = (row) => {
  if (!row) return null;
  const dp = row.doctor_profiles;
  if (!dp) return null;
  if (Array.isArray(dp)) return dp[0] || null;
  if (typeof dp === 'object') return dp;
  return null;
};

const AdminDoctors = () => {
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState(null);
  const [form, setForm] = useState({
    license_number: '',
    specialty: '',
    phone: '',
    is_active: true,
  });
  const [submitting, setSubmitting] = useState(false);

  const safeDoctors = Array.isArray(doctors) ? doctors : [];

  const loadDoctors = async () => {
    setLoading(true);
    try {
      const data = await getDoctorUsersWithProfiles();
      console.log('[AdminDoctors] loaded doctors count:', data?.length);
      if (data?.[0]) {
        console.log('[AdminDoctors] first doctor row:', JSON.stringify(data[0], null, 2));
      }
      setDoctors(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error('Error cargando médicos');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDoctors();
  }, []);

  const filtered = safeDoctors.filter(d => {
    const q = search.toLowerCase();
    if (!q) return true;
    const dp = getDoctorProfileFromRow(d);
    return (
      d?.full_name?.toLowerCase().includes(q) ||
      d?.email?.toLowerCase().includes(q) ||
      dp?.license_number?.toLowerCase().includes(q) ||
      dp?.specialty?.toLowerCase().includes(q)
    );
  });

  const openEdit = (doctor) => {
    setEditingDoctor(doctor);
    const dp = getDoctorProfileFromRow(doctor);
    console.log('[AdminDoctors] openEdit profile:', dp);
    setForm({
      license_number: dp?.license_number || '',
      specialty: dp?.specialty || '',
      phone: dp?.phone || '',
      is_active: dp?.is_active ?? true,
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!editingDoctor?.id) return;
    setSubmitting(true);

    const payload = {
      license_number: form.license_number.trim(),
      specialty: form.specialty.trim() || null,
      phone: form.phone.trim() || null,
      is_active: form.is_active,
    };

    console.log('[AdminDoctors] Saving profile for doctor:', {
      doctorId: editingDoctor.id,
      doctorName: editingDoctor.full_name,
      doctorEmail: editingDoctor.email,
      payload,
    });

    try {
      await upsertDoctorProfile(editingDoctor.id, payload);
      toast.success('Perfil médico guardado exitosamente');
      setDialogOpen(false);
      await loadDoctors();
    } catch (err) {
      toast.error(err.message || 'Error guardando perfil médico');
      console.error('[AdminDoctors] Save failed:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Médicos</h2>
          <p className="text-slate-600">Gestiona los perfiles profesionales de los médicos</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Buscar por nombre, email, cédula o especialidad..."
          className="pl-10"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl shadow-lg p-8 text-center">
          <Stethoscope className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500">
            {search ? 'No se encontraron médicos' : 'No hay médicos registrados en esta organización'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-lg overflow-hidden divide-y">
          {filtered.map(doctor => {
            const dp = getDoctorProfileFromRow(doctor);
            const hasProfile = !!dp;
            console.log('[AdminDoctors] render doctor:', doctor?.full_name, 'hasProfile:', hasProfile, 'dp:', dp);
            return (
              <div key={doctor?.id || Math.random()} className="p-4 hover:bg-slate-50 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-slate-900">
                        {doctor?.full_name || 'Sin nombre'}
                      </p>
                      {hasProfile ? (
                        <Badge className={dp?.is_active
                          ? 'bg-green-100 text-green-800 border-green-200'
                          : 'bg-red-100 text-red-800 border-red-200'
                        }>
                          {dp?.is_active ? 'Activo' : 'Inactivo'}
                        </Badge>
                      ) : (
                        <Badge className="bg-amber-100 text-amber-800 border-amber-200">
                          Perfil incompleto
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-slate-500 mt-0.5">{doctor?.email || 'Sin email'}</p>

                    {!doctor?.email && (
                      <div className="flex items-center gap-1.5 mt-1 text-sm text-amber-600">
                        <AlertTriangle className="w-4 h-4" />
                        <span>Este médico no tiene email de inicio de sesión registrado. Edítalo en Usuarios.</span>
                      </div>
                    )}

                    {hasProfile ? (
                      <div className="flex items-center gap-4 mt-2 text-sm text-slate-600 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Award className="w-3.5 h-3.5 text-teal-600" />
                          {dp?.license_number || 'Sin cédula'}
                        </span>
                        {dp?.specialty && (
                          <span className="flex items-center gap-1">
                            <Stethoscope className="w-3.5 h-3.5 text-teal-600" />
                            {dp.specialty}
                          </span>
                        )}
                        {dp?.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3.5 h-3.5 text-teal-600" />
                            {dp.phone}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 mt-2 text-sm text-amber-600">
                        <AlertTriangle className="w-4 h-4" />
                        <span>Este médico no tiene un perfil profesional registrado.</span>
                      </div>
                    )}
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => openEdit(doctor)}
                  >
                    <Edit2 className="w-3.5 h-3.5 mr-1" />
                    {hasProfile ? 'Editar perfil' : 'Completar perfil'}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Profile Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Stethoscope className="w-5 h-5 text-teal-600" />
              {getDoctorProfileFromRow(editingDoctor) ? 'Editar perfil médico' : 'Completar perfil médico'}
            </DialogTitle>
          </DialogHeader>

          <div className="bg-slate-50 p-3 rounded-lg mb-2">
            <p className="text-sm font-medium text-slate-900">{editingDoctor?.full_name || 'Sin nombre'}</p>
            <p className="text-xs text-slate-500">
              {editingDoctor?.email || 'Sin email registrado'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="license_number">Cédula profesional *</Label>
              <Input
                id="license_number"
                value={form.license_number}
                onChange={e => setForm({ ...form, license_number: e.target.value })}
                placeholder="Ej. 12345678"
                required
              />
            </div>

            <div>
              <Label htmlFor="specialty">Especialidad</Label>
              <Input
                id="specialty"
                value={form.specialty}
                onChange={e => setForm({ ...form, specialty: e.target.value })}
                placeholder="Ej. Medicina general"
              />
            </div>

            <div>
              <Label htmlFor="phone">Teléfono</Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                placeholder="Ej. 55 1234 5678"
              />
            </div>

            <div className="flex items-center justify-between py-2">
              <div>
                <Label htmlFor="is_active" className="cursor-pointer">Activo en el sistema</Label>
                <p className="text-xs text-slate-500">
                  Los médicos inactivos no pueden acceder al portal médico
                </p>
              </div>
              <Switch
                id="is_active"
                checked={form.is_active}
                onCheckedChange={v => setForm({ ...form, is_active: v })}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-teal-600 hover:bg-teal-700" disabled={submitting}>
                {submitting ? 'Guardando...' : 'Guardar perfil'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminDoctors;
