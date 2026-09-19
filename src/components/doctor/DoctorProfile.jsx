import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  UserCircle, Stethoscope, Phone, Mail, Award, Activity,
  Calendar, MapPin, Clock, KeyRound, ShieldCheck
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getDoctorProfile, upsertDoctorProfile, getMyEfirma, saveMyEfirma, deleteMyEfirma } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import { MX_TIMEZONES, DEFAULT_TZ } from '@/lib/timezone';
import {
  hasStoredEfirma, validateEfirma, readFileAsBase64,
  setEfirmaSessionPassword, getEfirmaSessionPassword, clearEfirmaSessionPassword,
} from '@/lib/efirma';
import DoctorAvailabilityEditor from '@/components/DoctorAvailabilityEditor';
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
  const [availability, setAvailability] = useState({});
  const [savingAvailability, setSavingAvailability] = useState(false);
  const [doctorName, setDoctorName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [timezone, setTimezone] = useState(DEFAULT_TZ);
  const [savingTz, setSavingTz] = useState(false);
  const [cerFile, setCerFile] = useState(null);
  const [keyFile, setKeyFile] = useState(null);
  const [efirma, setEfirma] = useState(null); // doctor_efirma row (own row only)
  const [efirmaPw, setEfirmaPw] = useState('');
  const [savingEfirma, setSavingEfirma] = useState(false);
  const [showEfirmaForm, setShowEfirmaForm] = useState(false);
  const [efirmaUnlocked, setEfirmaUnlocked] = useState(false);
  const [licenseNumber, setLicenseNumber] = useState('');
  const [savingLicense, setSavingLicense] = useState(false);

  useEffect(() => {
    if (user?.timezone) setTimezone(user.timezone);
  }, [user?.timezone]);

  useEffect(() => {
    if (user?.id) setEfirmaUnlocked(!!getEfirmaSessionPassword(user.id));
  }, [user?.id]);

  // The doctor's local timezone drives every time shown in the portal.
  const handleSaveTimezone = async () => {
    if (!user?.id) return;
    setSavingTz(true);
    try {
      const { error } = await supabase.from('profiles').update({ timezone }).eq('id', user.id);
      if (error) throw error;
      toast.success('Ubicación guardada — los horarios se mostrarán en tu hora local');
    } catch (err) {
      toast.error(err.message || 'Error guardando la ubicación');
      console.error('[DoctorProfile] save timezone error:', err);
    } finally {
      setSavingTz(false);
    }
  };

  // e.firma: validate the .cer/.key + password against the SAT key before
  // storing anything; the password itself is only kept in this browser session.
  const handleSaveEfirma = async () => {
    if (!cerFile || !keyFile || !efirmaPw || !user?.id) {
      toast.error('Selecciona los archivos .cer y .key e ingresa la contraseña');
      return;
    }
    setSavingEfirma(true);
    try {
      const [cer_base64, key_base64] = await Promise.all([
        readFileAsBase64(cerFile),
        readFileAsBase64(keyFile),
      ]);
      const certSerial = await validateEfirma({ cer_base64, key_base64, password: efirmaPw });
      await saveMyEfirma({ cer_base64, key_base64, cert_serial: certSerial || null });
      setEfirmaSessionPassword(user.id, efirmaPw);
      setEfirmaUnlocked(true);
      setShowEfirmaForm(false);
      setCerFile(null);
      setKeyFile(null);
      setEfirmaPw('');
      toast.success('e.firma guardada — tus recetas nuevas se firmarán automáticamente');
      loadProfile();
    } catch (err) {
      toast.error(err.message || 'No se pudo validar la e.firma — revisa archivos y contraseña');
    } finally {
      setSavingEfirma(false);
    }
  };

  const handleUnlockEfirma = async () => {
    if (!efirmaPw || !user?.id || !efirma) return;
    setSavingEfirma(true);
    try {
      await validateEfirma({
        cer_base64: efirma.cer_base64,
        key_base64: efirma.key_base64,
        password: efirmaPw,
      });
      setEfirmaSessionPassword(user.id, efirmaPw);
      setEfirmaUnlocked(true);
      setEfirmaPw('');
      toast.success('e.firma desbloqueada — las recetas nuevas se firmarán automáticamente');
    } catch (err) {
      toast.error(err.message || 'Contraseña incorrecta o archivos inválidos');
    } finally {
      setSavingEfirma(false);
    }
  };

  const handleRemoveEfirma = async () => {
    if (!user?.id) return;
    if (!confirm('¿Eliminar tu e.firma? Las recetas nuevas ya no se firmarán automáticamente.')) return;
    setSavingEfirma(true);
    try {
      await deleteMyEfirma();
      clearEfirmaSessionPassword(user.id);
      setEfirmaUnlocked(false);
      toast.success('e.firma eliminada');
      loadProfile();
    } catch (err) {
      toast.error(err.message || 'Error eliminando la e.firma');
    } finally {
      setSavingEfirma(false);
    }
  };

  useEffect(() => {
    if (user?.name) setDoctorName(user.name);
  }, [user?.name]);

  // Patients see profiles.full_name everywhere (booking, Mis Citas);
  // the profiles_update RLS policy allows editing your own row.
  const handleSaveName = async () => {
    const name = doctorName.trim();
    if (!name || !user?.id) return;
    setSavingName(true);
    try {
      const { error } = await supabase.from('profiles').update({ full_name: name }).eq('id', user.id);
      if (error) throw error;
      toast.success('Nombre actualizado — los pacientes ya lo ven');
    } catch (err) {
      toast.error(err.message || 'Error guardando el nombre');
      console.error('[DoctorProfile] save name error:', err);
    } finally {
      setSavingName(false);
    }
  };

  // La cédula profesional lands on every receta; the doctor may capture it
  // here (admins can also set it from Usuarios → Médicos).
  const handleSaveLicense = async () => {
    if (!user?.id) return;
    const license = licenseNumber.trim();
    if (license && !/^\d{6,8}$/.test(license)) {
      toast.error('La cédula profesional debe tener 6 a 8 dígitos');
      return;
    }
    setSavingLicense(true);
    try {
      await upsertDoctorProfile(user.id, { license_number: license || null });
      toast.success('Cédula profesional guardada');
      loadProfile();
    } catch (err) {
      toast.error(err.message || 'Error guardando la cédula');
    } finally {
      setSavingLicense(false);
    }
  };

  const loadProfile = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      console.log('[DoctorProfile] loading for user.id:', user.id);
      const [data, efirmaRow] = await Promise.all([
        getDoctorProfile(user.id),
        getMyEfirma().catch(() => null),
      ]);
      setProfile(data);
      setEfirma(efirmaRow);
      setLicenseNumber(data?.license_number || '');
      setAvailability(
        data?.availability && typeof data.availability === 'object' && !Array.isArray(data.availability)
          ? data.availability
          : {}
      );
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

  const handleSaveAvailability = async () => {
    if (!user?.id) return;
    setSavingAvailability(true);
    try {
      console.log('[DoctorProfile] saving availability:', availability);
      await upsertDoctorProfile(user.id, { availability: availability || {} });
      toast.success('Disponibilidad guardada');
    } catch (err) {
      toast.error(err.message || 'Error guardando disponibilidad');
      console.error('[DoctorProfile] save availability error:', err);
    } finally {
      setSavingAvailability(false);
    }
  };

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
            <div className="mt-5 pt-5 border-t border-slate-100">
              <Label htmlFor="doctor-display-name" className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                Nombre visible para pacientes
              </Label>
              <div className="flex gap-2 mt-1.5">
                <Input
                  id="doctor-display-name"
                  value={doctorName}
                  onChange={(e) => setDoctorName(e.target.value)}
                  placeholder="Dr. Nombre Apellido"
                />
                <Button
                  onClick={handleSaveName}
                  disabled={savingName || !doctorName.trim()}
                  className="bg-[#46AC78] hover:bg-[#3b9566] shrink-0"
                >
                  {savingName ? 'Guardando…' : 'Guardar'}
                </Button>
              </div>
              <p className="text-xs text-slate-400 mt-1">Así te verán los pacientes al agendar y en sus citas.</p>
            </div>
          </div>

          {/* Location / timezone */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h4 className="text-sm font-semibold text-slate-900 mb-1 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-teal-600" />
              Mi ubicación (zona horaria)
            </h4>
            <p className="text-xs text-slate-500 mb-4">
              Las citas y horarios del portal se muestran en la hora local de tu ubicación.
            </p>
            <div className="flex gap-2">
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                {MX_TIMEZONES.map(tz => (
                  <option key={tz.value} value={tz.value}>{tz.label}</option>
                ))}
              </select>
              <Button
                onClick={handleSaveTimezone}
                disabled={savingTz}
                className="bg-[#46AC78] hover:bg-[#3b9566] shrink-0"
              >
                {savingTz ? 'Guardando…' : 'Guardar'}
              </Button>
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
                <div className="flex items-start gap-3 py-3 border-b border-slate-100">
                  <div className="mt-0.5 p-2 rounded-lg bg-teal-50 text-teal-600">
                    <Award className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Cédula profesional</p>
                    <div className="flex gap-2 mt-1.5">
                      <Input
                        value={licenseNumber}
                        onChange={(e) => setLicenseNumber(e.target.value)}
                        placeholder="6 a 8 dígitos"
                        inputMode="numeric"
                      />
                      <Button
                        onClick={handleSaveLicense}
                        disabled={savingLicense}
                        className="bg-[#46AC78] hover:bg-[#3b9566] shrink-0"
                      >
                        {savingLicense ? 'Guardando…' : 'Guardar'}
                      </Button>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      Obligatoria para emitir recetas electrónicas (LGS 42 Bis) — se imprime en cada receta.
                    </p>
                  </div>
                </div>
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

          {/* e.firma (FIEL) */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h4 className="text-sm font-semibold text-slate-900 mb-1 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-teal-600" />
              Firma electrónica (e.firma / FIEL)
            </h4>
            <p className="text-xs text-slate-500 mb-4">
              Sube tus archivos .cer y .key del SAT una sola vez y tus recetas se firmarán
              electrónicamente al crearlas. Los archivos se guardan cifrados en tu perfil y
              tu contraseña <strong>nunca se almacena</strong> — solo vive en esta sesión del navegador.
            </p>

            {hasStoredEfirma(efirma) && !showEfirmaForm ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span className="font-medium text-slate-800">e.firma configurada</span>
                  {efirma?.cert_serial && (
                    <span className="text-xs text-slate-400">cert {efirma.cert_serial}</span>
                  )}
                </div>
                {efirmaUnlocked ? (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                    <p className="text-xs text-emerald-800">
                      Desbloqueada — las recetas nuevas se firmarán automáticamente.
                    </p>
                    <Button
                      size="sm" variant="ghost" className="text-emerald-700 shrink-0"
                      onClick={() => { clearEfirmaSessionPassword(user.id); setEfirmaUnlocked(false); }}
                    >
                      Bloquear
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      placeholder="Contraseña de tu llave privada"
                      value={efirmaPw}
                      onChange={(e) => setEfirmaPw(e.target.value)}
                      autoComplete="off"
                    />
                    <Button
                      onClick={handleUnlockEfirma}
                      disabled={savingEfirma || !efirmaPw}
                      className="bg-[#46AC78] hover:bg-[#3b9566] shrink-0"
                    >
                      {savingEfirma ? 'Validando…' : 'Desbloquear'}
                    </Button>
                  </div>
                )}
                <div className="flex gap-4 pt-1">
                  <button
                    type="button"
                    className="text-xs text-slate-500 hover:text-slate-700 underline"
                    onClick={() => setShowEfirmaForm(true)}
                  >
                    Reemplazar archivos
                  </button>
                  <button
                    type="button"
                    className="text-xs text-red-500 hover:text-red-700 underline"
                    onClick={handleRemoveEfirma}
                    disabled={savingEfirma}
                  >
                    Eliminar e.firma
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label>Certificado (.cer)</Label>
                    <Input type="file" accept=".cer" onChange={(e) => setCerFile(e.target.files?.[0] || null)} />
                  </div>
                  <div>
                    <Label>Llave privada (.key)</Label>
                    <Input type="file" accept=".key" onChange={(e) => setKeyFile(e.target.files?.[0] || null)} />
                  </div>
                </div>
                <div>
                  <Label>Contraseña de la llave privada</Label>
                  <Input
                    type="password"
                    value={efirmaPw}
                    onChange={(e) => setEfirmaPw(e.target.value)}
                    autoComplete="off"
                    placeholder="Solo se usa para validar — no se guarda"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleSaveEfirma}
                    disabled={savingEfirma}
                    className="bg-[#46AC78] hover:bg-[#3b9566] text-white"
                  >
                    {savingEfirma ? 'Validando…' : 'Validar y guardar'}
                  </Button>
                  {showEfirmaForm && (
                    <Button variant="outline" onClick={() => setShowEfirmaForm(false)} disabled={savingEfirma}>
                      Cancelar
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Availability (video consultas) */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h4 className="text-sm font-semibold text-slate-900 mb-1 flex items-center gap-2">
              <Clock className="w-4 h-4 text-teal-600" />
              Mi disponibilidad (video consultas)
            </h4>
            <p className="text-xs text-slate-500 mb-4">
              Los pacientes podrán agendar video consultas en estos horarios.
            </p>
            <DoctorAvailabilityEditor
              value={availability}
              onChange={setAvailability}
              disabled={savingAvailability}
            />
            <div className="flex justify-end mt-4">
              <Button
                onClick={handleSaveAvailability}
                disabled={savingAvailability}
                className="bg-[#46AC78] hover:bg-[#3b9566] text-white"
              >
                {savingAvailability ? 'Guardando...' : 'Guardar disponibilidad'}
              </Button>
            </div>
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
