import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  Calendar, CalendarPlus, Plus, Search, Clock, Phone, Check, Trash2, Edit2, Video, FileText, Activity,
  FolderOpen, StickyNote, MoreVertical, Play, UserCheck, XCircle
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
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem
} from '@/components/ui/dropdown-menu';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem
} from '@/components/ui/select';
import {
  getAppointmentsByDoctor, createAppointment, updateAppointment, deleteAppointment,
  getCustomersForDoctor, confirmVideoAppointment, createMedicalNote,
  getActiveDoctorShift, getClockedInDoctorIds, getOrgDoctorNames,
  getOrgAppointmentsForDate, startConsulta, claimAppointment,
  takeoverAppointment, cancelAppointmentStaff
} from '@/lib/db';
import { logAudit, AUDIT_ACTIONS } from '@/lib/auditLog';
import PostVisitDialog from './PostVisitDialog';
import NurseVitalsDialog from './NurseVitalsDialog';
import { toast } from 'sonner';

const statusColors = {
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  confirmed: 'bg-blue-100 text-blue-800 border-blue-200',
  in_consulta: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  completed: 'bg-green-100 text-green-800 border-green-200',
  cancelled: 'bg-red-100 text-red-800 border-red-200',
};

const statusLabels = {
  pending: 'Pendiente',
  confirmed: 'Confirmada',
  in_consulta: 'En consulta',
  completed: 'Completada',
  cancelled: 'Cancelada',
};

const paymentLabels = {
  unpaid: 'Pago pendiente',
  paid: 'Pagado',
  membership_visit: 'Membresía (visita)',
  membership_half: '50% membresía',
  waived: 'Cortesía',
};

const paymentColors = {
  unpaid: 'bg-amber-100 text-amber-800 border-amber-200',
  paid: 'bg-green-100 text-green-800 border-green-200',
  membership_visit: 'bg-purple-100 text-purple-800 border-purple-200',
  membership_half: 'bg-purple-100 text-purple-800 border-purple-200',
  waived: 'bg-slate-100 text-slate-700 border-slate-200',
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
  const navigate = useNavigate();
  const { user } = useAuth();
  const [appointments, setAppointments] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [postVisitAppt, setPostVisitAppt] = useState(null);
  const [postVisitOpen, setPostVisitOpen] = useState(false);
  const [nurseVitalsAppt, setNurseVitalsAppt] = useState(null);
  const [nurseVitalsOpen, setNurseVitalsOpen] = useState(false);
  const [quickNoteAppt, setQuickNoteAppt] = useState(null);
  const [quickNoteOpen, setQuickNoteOpen] = useState(false);
  const [quickNoteText, setQuickNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [followUpAppt, setFollowUpAppt] = useState(null);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpNotes, setFollowUpNotes] = useState('');
  const [savingFollowUp, setSavingFollowUp] = useState(false);
  // Doctor shift (clock-in) + coverage state
  const [activeShift, setActiveShift] = useState(null);
  const [clockedInIds, setClockedInIds] = useState([]);
  const [doctorNames, setDoctorNames] = useState({});
  const [orgToday, setOrgToday] = useState([]);
  const [coverAppt, setCoverAppt] = useState(null);
  const [coverOpen, setCoverOpen] = useState(false);
  const [cancelAppt, setCancelAppt] = useState(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [busyAction, setBusyAction] = useState(false);
  const [form, setForm] = useState({
    customer_id: '',
    walkin_name: '',
    walkin_phone: '',
    appointment_date: '',
    status: 'pending',
    notes: '',
  });

  const canConsult = ['doctor', 'admin'].includes(user?.role);

  const safeAppointments = Array.isArray(appointments) ? appointments : [];
  const safeCustomers = Array.isArray(customers) ? customers : [];

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [appts, custs, shift, clocked, names, today] = await Promise.all([
        getAppointmentsByDoctor(user.id),
        getCustomersForDoctor(),
        getActiveDoctorShift(user.id).catch(() => null),
        getClockedInDoctorIds().catch(() => []),
        getOrgDoctorNames().catch(() => ({})),
        getOrgAppointmentsForDate().catch(() => []),
      ]);
      setAppointments(appts);
      setCustomers(custs);
      setActiveShift(shift);
      setClockedInIds(clocked);
      setDoctorNames(names);
      setOrgToday(today);
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
    // Unpaid pending video consultas stay hidden — the patient hasn't paid
    // yet (stale ones auto-cancel after 10 min). They appear once paid
    // and confirmed. Pending in-person citas are unaffected.
    if (isUnpaidPendingVideo(a)) return false;
    const matchesSearch = !search ||
      (a?.customers?.full_name || a?.walkin_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (a?.customers?.phone || a?.walkin_phone || '').includes(search);
    const matchesStatus = statusFilter === 'all' || a?.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Coverage view (salon-style): only relevant when I'm clocked in.
  // - queueAppts: unassigned in-person citas — free to grab
  // - coverableAppts: citas whose doctor is NOT clocked in — takeover with
  //   acknowledgement, reschedule, or cancel (membership visits refunded)
  const queueAppts = (canConsult && activeShift)
    ? orgToday.filter(a => !a?.doctor_id && a?.type !== 'video' && !isUnpaidPendingVideo(a))
    : [];
  const coverableAppts = (canConsult && activeShift)
    ? orgToday.filter(a =>
        a?.doctor_id &&
        a.doctor_id !== user?.id &&
        !clockedInIds.includes(a.doctor_id) &&
        !isUnpaidPendingVideo(a))
    : [];

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
      // Video appointments confirm through the video-room edge function:
      // it validates payment/membership, creates the Daily.co room and sets
      // status='confirmed' itself. In-person appointments keep the direct update.
      if (newStatus === 'confirmed' && appt?.type === 'video') {
        try {
          await confirmVideoAppointment(appt.id);
        } catch (videoErr) {
          toast.error(videoErr.message || 'No se pudo crear la sala de video');
          return; // keep the appointment pending
        }
        toast.success('Consulta confirmada — enlace de video creado');
        loadData();
        return;
      }
      // Completing a consulta goes through the post-visit form: the doctor
      // must leave the structured nota de evolución (padecimiento and
      // diagnóstico required; receta optional) before the cita is marked
      // Completada.
      if (newStatus === 'completed') {
        setPostVisitAppt(appt);
        setPostVisitOpen(true);
        return;
      }
      await updateAppointment(appt.id, { status: newStatus });
      toast.success(`Cita marcada como ${statusLabels[newStatus]}`);
      loadData();
    } catch (err) {
      toast.error('Error actualizando estado');
      console.error(err);
    }
  };

  const isUnpaidPendingVideo = (a) =>
    a?.type === 'video' && a?.status === 'pending' &&
    ['unpaid', 'membership_half'].includes(a?.payment_status || 'unpaid');

  // Empezar Consulta: two-step — confirmed → in_consulta, then the
  // NOM-004 form (PostVisitDialog) ends the consulta on save.
  const handleStartConsulta = async (appt) => {
    if (!appt?.id) return;
    if (!activeShift) {
      toast.error('Inicia tu turno antes de empezar una consulta');
      return;
    }
    try {
      const updated = await startConsulta(appt.id);
      toast.success('Consulta iniciada');
      setPostVisitAppt({ ...appt, ...updated });
      setPostVisitOpen(true);
      loadData();
    } catch (err) {
      toast.error('No se pudo iniciar la consulta');
      console.error(err);
    }
  };

  // Claim an unassigned in-person cita from the consultorio queue
  const handleClaim = async (appt) => {
    if (!appt?.id || !user?.id) return;
    setBusyAction(true);
    try {
      await claimAppointment(appt.id, user.id);
      toast.success('Cita tomada — aparece en tu lista');
      loadData();
    } catch (err) {
      toast.error('No se pudo tomar la cita');
      console.error(err);
    } finally {
      setBusyAction(false);
    }
  };

  // Take over a cita whose doctor is not clocked in (coverage)
  const handleTakeover = async () => {
    if (!coverAppt?.id || !user?.id) return;
    setBusyAction(true);
    try {
      await takeoverAppointment(coverAppt.id, user.id, coverAppt.doctor_id);
      await logAudit({
        action: AUDIT_ACTIONS.APPOINTMENT_TAKEOVER,
        user,
        details: `Cobertura de cita ${coverAppt.id} — médico original ${doctorNames[coverAppt.doctor_id] || coverAppt.doctor_id}`,
      });
      toast.success('Cita cubierta — ahora está en tu lista');
      setCoverOpen(false);
      setCoverAppt(null);
      loadData();
    } catch (err) {
      toast.error('No se pudo cubrir la cita');
      console.error(err);
    } finally {
      setBusyAction(false);
    }
  };

  const handleStaffCancel = async () => {
    if (!cancelAppt?.id) return;
    setBusyAction(true);
    try {
      const result = await cancelAppointmentStaff(cancelAppt.id, cancelReason.trim());
      await logAudit({
        action: AUDIT_ACTIONS.APPOINTMENT_CANCEL,
        user,
        details: `Cita ${cancelAppt.id} cancelada por personal — motivo: ${cancelReason.trim() || 'no especificado'}${result?.visit_refunded ? ' — visita de membresía reembolsada' : ''}`,
      });
      toast.success(result?.visit_refunded
        ? 'Cita cancelada — visita de membresía devuelta al paciente'
        : 'Cita cancelada');
      setCancelOpen(false);
      setCancelAppt(null);
      setCancelReason('');
      loadData();
    } catch (err) {
      toast.error(err.message || 'No se pudo cancelar la cita');
      console.error(err);
    } finally {
      setBusyAction(false);
    }
  };

  const openPatientRecord = (appt) => {
    if (!appt?.customer_id) {
      toast.info('Esta cita es walk-in y aún no tiene expediente vinculado.');
      return;
    }
    navigate(`/doctor/customers/${appt.customer_id}`);
  };

  const openQuickNote = (appt) => {
    setQuickNoteAppt(appt);
    setQuickNoteText('');
    setQuickNoteOpen(true);
  };

  const handleSaveQuickNote = async () => {
    if (!quickNoteAppt || !user?.id) return;
    const text = quickNoteText.trim();
    if (!text) {
      toast.error('Escribe una nota antes de guardar');
      return;
    }
    setSavingNote(true);
    try {
      await createMedicalNote({
        customer_id: quickNoteAppt.customer_id || null,
        appointment_id: quickNoteAppt.id,
        doctor_id: user.id,
        note: text,
      });
      toast.success('Nota guardada');
      setQuickNoteOpen(false);
      setQuickNoteText('');
      setQuickNoteAppt(null);
    } catch (err) {
      toast.error(err.message || 'Error guardando la nota');
    } finally {
      setSavingNote(false);
    }
  };

  const openFollowUp = (appt) => {
    setFollowUpAppt(appt);
    const next = new Date();
    next.setDate(next.getDate() + 7);
    next.setMinutes(next.getMinutes() - next.getTimezoneOffset());
    setFollowUpDate(next.toISOString().slice(0, 16));
    setFollowUpNotes('');
    setFollowUpOpen(true);
  };

  const handleSaveFollowUp = async () => {
    if (!followUpAppt || !user?.id || !followUpDate) return;
    setSavingFollowUp(true);
    try {
      await createAppointment({
        customer_id: followUpAppt.customer_id || null,
        walkin_name: followUpAppt.walkin_name || '',
        walkin_phone: followUpAppt.walkin_phone || '',
        doctor_id: user.id,
        appointment_date: new Date(followUpDate).toISOString(),
        status: 'pending',
        type: 'in_person',
        notes: followUpNotes.trim() || 'Seguimiento',
      });
      toast.success('Siguiente cita agendada');
      setFollowUpOpen(false);
      setFollowUpDate('');
      setFollowUpNotes('');
      setFollowUpAppt(null);
      loadData();
    } catch (err) {
      toast.error(err.message || 'Error agendando la cita');
    } finally {
      setSavingFollowUp(false);
    }
  };

  // Parse the auto-report stored in appointments.notes (tablet-checkin or
  // check-in flow) into labeled fields for cleaner display.
  const parseIntakeNote = (text) => {
    if (!text) return null;
    const lines = text.split('\n').filter(l => l.trim());
    const result = { source: '', fields: [], hasConsents: false };
    lines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith('Registro en tableta')) result.source = 'Registro en tableta';
      else if (trimmed.startsWith('Check-in en línea')) result.source = 'Check-in en línea';
      else if (/Consentimientos?\s+firmados?|Documentos de consentimiento/i.test(trimmed)) {
        result.hasConsents = true;
      } else {
        const match = trimmed.match(/^([^:]+):\s*(.+)$/);
        if (match) {
          result.fields.push({ label: match[1].trim(), value: match[2].trim() });
        }
      }
    });
    return result;
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
            <SelectItem value="in_consulta">En consulta</SelectItem>
            <SelectItem value="completed">Completada</SelectItem>
            <SelectItem value="cancelled">Cancelada</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Coverage: cola sin asignar + citas de médicos no disponibles */}
      {(queueAppts.length > 0 || coverableAppts.length > 0) && (
        <div className="space-y-3">
          {queueAppts.length > 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <h3 className="font-semibold text-emerald-900 mb-1 flex items-center gap-2">
                <UserCheck className="w-4 h-4" /> Fila del consultorio ({queueAppts.length})
              </h3>
              <p className="text-xs text-emerald-700 mb-3">Citas sin médico asignado — tómalas para atenderlas tú.</p>
              <div className="space-y-2">
                {queueAppts.map(a => (
                  <div key={a?.id || Math.random()} className="bg-white rounded-lg border border-emerald-100 p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900 truncate">
                        {a?.customers?.full_name || a?.walkin_name || 'Paciente'}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatDisplayTime(a?.appointment_date)}
                        {(a?.customers?.phone || a?.walkin_phone) ? ` · ${a?.customers?.phone || a?.walkin_phone}` : ''}
                        {' · '}{statusLabels[a?.status] || a?.status}
                      </p>
                    </div>
                    <Button size="sm" disabled={busyAction} className="bg-emerald-600 hover:bg-emerald-700 shrink-0" onClick={() => handleClaim(a)}>
                      Tomar cita
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {coverableAppts.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <h3 className="font-semibold text-amber-900 mb-1 flex items-center gap-2">
                <XCircle className="w-4 h-4" /> Citas de médicos no disponibles ({coverableAppts.length})
              </h3>
              <p className="text-xs text-amber-700 mb-3">Estas citas pertenecen a médicos que no han iniciado turno. Puedes cubrirlas, reagendarlas o cancelarlas.</p>
              <div className="space-y-2">
                {coverableAppts.map(a => (
                  <div key={a?.id || Math.random()} className="bg-white rounded-lg border border-amber-100 p-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 truncate">
                          {a?.customers?.full_name || a?.walkin_name || 'Paciente'}
                        </p>
                        <p className="text-xs text-slate-500">
                          {formatDisplayTime(a?.appointment_date)} · {a?.type === 'video' ? '📹 Video' : '🏥 Presencial'} · Cita con: <span className="font-medium">{doctorNames[a?.doctor_id] || 'Otro médico'}</span>
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button size="sm" disabled={busyAction} className="bg-amber-600 hover:bg-amber-700" onClick={() => { setCoverAppt(a); setCoverOpen(true); }}>
                          Cubrir
                        </Button>
                        <Button size="sm" variant="outline" disabled={busyAction} onClick={() => openEdit(a)}>
                          Reagendar
                        </Button>
                        <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" disabled={busyAction} onClick={() => { setCancelAppt(a); setCancelReason(''); setCancelOpen(true); }}>
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

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
                      <Badge className={appt?.type === 'video'
                        ? 'bg-apolo-navy text-white border-apolo-navy'
                        : 'bg-slate-200 text-slate-700 border-slate-200'}>
                        {appt?.type === 'video' ? '📹 Video' : '🏥 Presencial'}
                      </Badge>
                      {appt?.type === 'video' && (
                        <Badge className={paymentColors[appt?.payment_status || 'unpaid']}>
                          {paymentLabels[appt?.payment_status || 'unpaid']}
                        </Badge>
                      )}
                      {appt?.nurse_vitals && (
                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">
                          ✓ Signos
                        </Badge>
                      )}
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
                    {(() => {
                      const intake = parseIntakeNote(appt?.notes);
                      if (!intake) return null;
                      return (
                        <div className="mt-3 space-y-2">
                          {intake.source && (
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{intake.source}</p>
                          )}
                          {intake.fields.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {intake.fields.map((f, i) => (
                                <div key={i} className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm">
                                  <span className="text-slate-500 text-xs block">{f.label}</span>
                                  <span className="text-slate-900 font-medium">{f.value}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {intake.hasConsents && (
                            <p className="text-xs text-emerald-700 flex items-center gap-1">
                              <Check className="w-3 h-3" /> Consentimientos firmados
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {appt?.type === 'video' && appt?.meeting_url && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-apolo-navy text-apolo-navy hover:bg-apolo-navy/5 h-8"
                        onClick={() => window.open(appt.meeting_url, '_blank', 'noopener,noreferrer')}
                      >
                        <Video className="w-3.5 h-3.5 mr-1" />
                        Unirse
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant="outline"
                      className="border-apolo-navy text-apolo-navy hover:bg-apolo-navy/5 h-8"
                      title="Abrir expediente"
                      onClick={() => openPatientRecord(appt)}
                    >
                      <FolderOpen className="w-3.5 h-3.5 mr-1" />
                      Expediente
                    </Button>

                    {appt?.status === 'pending' && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-apolo-navy hover:text-apolo-navy-dark hover:bg-apolo-navy/5"
                        title="Confirmar"
                        onClick={() => quickStatusChange(appt, 'confirmed')}
                      >
                        <Check className="w-4 h-4" />
                      </Button>
                    )}
                    {appt?.status === 'confirmed' && (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-cyan-600 hover:text-cyan-700 hover:bg-cyan-50"
                          title="Capturar signos"
                          onClick={() => { setNurseVitalsAppt(appt); setNurseVitalsOpen(true); }}
                        >
                          <Activity className="w-4 h-4" />
                        </Button>
                        {canConsult && (
                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white h-8"
                            title="Empezar consulta (pasa a En consulta)"
                            onClick={() => handleStartConsulta(appt)}
                          >
                            <Play className="w-3.5 h-3.5 mr-1" />
                            Empezar Consulta
                          </Button>
                        )}
                      </>
                    )}
                    {appt?.status === 'in_consulta' && (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-cyan-600 hover:text-cyan-700 hover:bg-cyan-50"
                          title="Capturar signos"
                          onClick={() => { setNurseVitalsAppt(appt); setNurseVitalsOpen(true); }}
                        >
                          <Activity className="w-4 h-4" />
                        </Button>
                        {canConsult && (
                          <Button
                            size="sm"
                            className="bg-cyan-600 hover:bg-cyan-700 text-white h-8"
                            title="Continuar la consulta en curso"
                            onClick={() => { setPostVisitAppt(appt); setPostVisitOpen(true); }}
                          >
                            <Play className="w-3.5 h-3.5 mr-1" />
                            Continuar consulta
                          </Button>
                        )}
                      </>
                    )}
                    {appt?.status === 'completed' && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-teal-600 hover:text-teal-700 hover:bg-teal-50"
                        title="Nota post-consulta"
                        onClick={() => { setPostVisitAppt(appt); setPostVisitOpen(true); }}
                      >
                        <FileText className="w-4 h-4" />
                      </Button>
                    )}

                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                      title="Nota rápida"
                      onClick={() => openQuickNote(appt)}
                    >
                      <StickyNote className="w-4 h-4" />
                    </Button>

                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                      title="Agendar siguiente"
                      onClick={() => openFollowUp(appt)}
                    >
                      <CalendarPlus className="w-4 h-4" />
                    </Button>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-slate-500 hover:text-slate-700"
                          title="Más acciones"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(appt)}>
                          <Edit2 className="w-3.5 h-3.5 mr-2" /> Editar cita
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDelete(appt?.id)} className="text-red-600 focus:text-red-600">
                          <Trash2 className="w-3.5 h-3.5 mr-2" /> Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cobertura: advertencia de que el médico original no está disponible */}
      <Dialog open={coverOpen} onOpenChange={setCoverOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cubrir cita de otro médico</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-slate-700">
              Esta cita está agendada con <span className="font-semibold">{doctorNames[coverAppt?.doctor_id] || 'otro médico'}</span>.
              Al tomarla aceptas que {doctorNames[coverAppt?.doctor_id] || 'el médico asignado'} no está disponible y no puede atenderla.
            </p>
            <p className="text-sm text-slate-500">
              Paciente: <span className="font-medium text-slate-700">{coverAppt?.customers?.full_name || coverAppt?.walkin_name || 'Paciente'}</span>
              {coverAppt ? ` · ${formatDisplayTime(coverAppt.appointment_date)}` : ''}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCoverOpen(false)} disabled={busyAction}>
                Volver
              </Button>
              <Button onClick={handleTakeover} disabled={busyAction} className="bg-amber-600 hover:bg-amber-700">
                {busyAction ? 'Tomando...' : 'Acepto — cubrir cita'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cancelación por personal (con reembolso de visita de membresía) */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cancelar cita — {cancelAppt?.customers?.full_name || cancelAppt?.walkin_name || 'Paciente'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {cancelAppt?.payment_status === 'membership_visit' && (
              <p className="text-sm bg-purple-50 border border-purple-200 text-purple-800 rounded-lg px-3 py-2">
                Es una cita de membresía: al cancelar, la visita se devuelve automáticamente al paciente.
              </p>
            )}
            <div>
              <Label>Motivo de cancelación</Label>
              <Textarea
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder="Ej. médico no disponible, paciente no llegó..."
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={busyAction}>
                Volver
              </Button>
              <Button onClick={handleStaffCancel} disabled={busyAction} className="bg-red-600 hover:bg-red-700">
                {busyAction ? 'Cancelando...' : 'Cancelar cita'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Nota de evolución estructurada (padecimiento + diagnóstico obligatorios) */}
      <PostVisitDialog
        open={postVisitOpen}
        onOpenChange={setPostVisitOpen}
        appointment={postVisitAppt}
        onSaved={loadData}
      />

      {/* Captura de signos vitales pre-consulta (enfermería) */}
      <NurseVitalsDialog
        open={nurseVitalsOpen}
        onOpenChange={setNurseVitalsOpen}
        appointment={nurseVitalsAppt}
        onSaved={loadData}
      />

      {/* Quick note dialog */}
      <Dialog open={quickNoteOpen} onOpenChange={setQuickNoteOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nota rápida — {quickNoteAppt?.customers?.full_name || quickNoteAppt?.walkin_name || 'Paciente'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              value={quickNoteText}
              onChange={e => setQuickNoteText(e.target.value)}
              placeholder="Escribe una nota sobre esta cita..."
              rows={5}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setQuickNoteOpen(false)} disabled={savingNote}>
                Cancelar
              </Button>
              <Button onClick={handleSaveQuickNote} disabled={savingNote} className="bg-teal-600 hover:bg-teal-700">
                {savingNote ? 'Guardando...' : 'Guardar nota'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Follow-up appointment dialog */}
      <Dialog open={followUpOpen} onOpenChange={setFollowUpOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Agendar siguiente — {followUpAppt?.customers?.full_name || followUpAppt?.walkin_name || 'Paciente'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Fecha y hora</Label>
              <Input
                type="datetime-local"
                value={followUpDate}
                onChange={e => setFollowUpDate(e.target.value)}
                required
              />
            </div>
            <div>
              <Label>Motivo / notas</Label>
              <Textarea
                value={followUpNotes}
                onChange={e => setFollowUpNotes(e.target.value)}
                placeholder="Ej. seguimiento, resultado de estudios..."
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setFollowUpOpen(false)} disabled={savingFollowUp}>
                Cancelar
              </Button>
              <Button onClick={handleSaveFollowUp} disabled={savingFollowUp} className="bg-teal-600 hover:bg-teal-700">
                {savingFollowUp ? 'Agendando...' : 'Agendar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
