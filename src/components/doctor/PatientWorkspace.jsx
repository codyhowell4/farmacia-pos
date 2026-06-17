import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Users, ArrowLeft, Phone, Mail, Calendar, FileText, ShoppingCart,
  Pill, Clock, Plus, Edit2, Trash2, ChevronDown, ChevronUp,
  CheckCircle, XCircle, AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import {
  getCustomerById, getDoctorPrescriptions, createDoctorPrescription,
  getAppointmentsByDoctor, createAppointment, updateAppointment, deleteAppointment,
  getCustomerPurchaseHistory, getMedicalNotesByCustomer, createMedicalNote,
  updateMedicalNote, deleteMedicalNote, getInventoryForDoctor, updateCustomer,
} from '@/lib/db';
import { formatMXN } from '@/lib/currency';
import { toast } from 'sonner';

const statusConfig = {
  active: { label: 'Activa', className: 'bg-green-100 text-green-800' },
  fulfilled: { label: 'Surtida', className: 'bg-blue-100 text-blue-800' },
  expired: { label: 'Expirada', className: 'bg-amber-100 text-amber-800' },
  cancelled: { label: 'Cancelada', className: 'bg-red-100 text-red-800' },
};

const apptStatusConfig = {
  pending: { label: 'Pendiente', className: 'bg-yellow-100 text-yellow-800' },
  confirmed: { label: 'Confirmada', className: 'bg-blue-100 text-blue-800' },
  completed: { label: 'Completada', className: 'bg-green-100 text-green-800' },
  cancelled: { label: 'Cancelada', className: 'bg-red-100 text-red-800' },
};

const PatientWorkspace = () => {
  const { customerId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('resumen');

  // Data states
  const [prescriptions, setPrescriptions] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [notes, setNotes] = useState([]);
  const [inventory, setInventory] = useState([]);

  // Dialog states
  const [rxDialogOpen, setRxDialogOpen] = useState(false);
  const [apptDialogOpen, setApptDialogOpen] = useState(false);
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [patientEditOpen, setPatientEditOpen] = useState(false);
  const [patientForm, setPatientForm] = useState({ height: '', weight: '', notes: '' });
  const [savingPatient, setSavingPatient] = useState(false);

  // Form states
  const [rxForm, setRxForm] = useState({
    medication: '', dosage: '', frequency: '', duration: '', notes: '',
    useInventory: false, inventoryId: '',
    height_cm: '', weight_kg: '',
  });
  const [apptForm, setApptForm] = useState({
    appointment_date: '', status: 'pending', notes: '', type: 'in_person',
  });
  const [noteForm, setNoteForm] = useState({ note: '' });

  const loadAll = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    try {
      // Load customer first — this must succeed
      const cust = await getCustomerById(customerId);
      setCustomer(cust);
    } catch (err) {
      console.error('getCustomerById failed:', err);
      toast.error('Error cargando datos del paciente');
      setLoading(false);
      return;
    }

    // Secondary data — load independently so one failure doesn't break everything
    const loadSecondary = async () => {
      const rxs = await getDoctorPrescriptions(customerId).catch(e => {
        console.error('getDoctorPrescriptions failed:', e);
        return [];
      });
      setPrescriptions(Array.isArray(rxs) ? rxs : []);

      if (user?.id) {
        const appts = await getAppointmentsByDoctor(user.id).catch(e => {
          console.error('getAppointmentsByDoctor failed:', e);
          return [];
        });
        const customerAppts = Array.isArray(appts)
          ? appts.filter(a => a.customer_id === customerId)
          : [];
        setAppointments(customerAppts);
      }

      const hist = await getCustomerPurchaseHistory(customerId).catch(e => {
        console.error('getCustomerPurchaseHistory failed:', e);
        return [];
      });
      setPurchases(Array.isArray(hist) ? hist : []);

      const meds = await getMedicalNotesByCustomer(customerId).catch(e => {
        console.error('getMedicalNotesByCustomer failed:', e);
        return [];
      });
      setNotes(Array.isArray(meds) ? meds : []);

      const inv = await getInventoryForDoctor().catch(e => {
        console.error('getInventoryForDoctor failed:', e);
        return [];
      });
      setInventory(Array.isArray(inv) ? inv : []);
    };

    try {
      await loadSecondary();
    } catch (err) {
      console.error('Unexpected secondary load error:', err);
    } finally {
      setLoading(false);
    }
  }, [customerId, user?.id]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const formatDate = (ts) => {
    if (!ts) return '-';
    return new Date(ts).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const formatDateTime = (ts) => {
    if (!ts) return '-';
    const d = new Date(ts);
    return `${d.toLocaleDateString('es-MX')} ${d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`;
  };

  // ── PRESCRIPTION HANDLERS ──
  const handleCreateRx = async () => {
    if (!rxForm.medication.trim()) {
      toast.error('El medicamento es obligatorio');
      return;
    }
    try {
      const payload = {
        customer_id: customerId,
        patient_name: customer?.full_name || '',
        patient_curp: customer?.curp || null,
        doctor_name: user?.name || user?.email || '',
        doctor_license_number: '', // Could be fetched from doctor_profiles
        medication: rxForm.medication.trim(),
        dosage: rxForm.dosage.trim() || null,
        frequency: rxForm.frequency.trim() || null,
        duration: rxForm.duration.trim() || null,
        notes: rxForm.notes.trim() || null,
        prescription_date: new Date().toISOString().split('T')[0],
        height_cm: rxForm.height_cm ? parseFloat(rxForm.height_cm) : null,
        weight_kg: rxForm.weight_kg ? parseFloat(rxForm.weight_kg) : null,
      };
      await createDoctorPrescription(payload);
      toast.success('Receta creada exitosamente');
      setRxDialogOpen(false);
      setRxForm({ medication: '', dosage: '', frequency: '', duration: '', notes: '', useInventory: false, inventoryId: '', height_cm: '', weight_kg: '' });
      loadAll();
    } catch (err) {
      toast.error(err.message || 'Error creando receta');
    }
  };

  // ── APPOINTMENT HANDLERS ──
  const handleCreateAppt = async () => {
    if (!apptForm.appointment_date) {
      toast.error('La fecha y hora son obligatorias');
      return;
    }
    try {
      await createAppointment({
        customer_id: customerId,
        doctor_id: user?.id,
        appointment_date: new Date(apptForm.appointment_date).toISOString(),
        status: apptForm.status,
        notes: apptForm.notes,
        type: apptForm.type,
      });
      toast.success('Cita creada exitosamente');
      setApptDialogOpen(false);
      setApptForm({ appointment_date: '', status: 'pending', notes: '', type: 'in_person' });
      loadAll();
    } catch (err) {
      toast.error(err.message || 'Error creando cita');
    }
  };

  const handleApptStatus = async (id, status) => {
    try {
      await updateAppointment(id, { status });
      toast.success('Cita actualizada');
      loadAll();
    } catch (err) {
      toast.error('Error actualizando cita');
    }
  };

  const handleDeleteAppt = async (id) => {
    if (!confirm('¿Eliminar esta cita?')) return;
    try {
      await deleteAppointment(id);
      toast.success('Cita eliminada');
      loadAll();
    } catch (err) {
      toast.error('Error eliminando cita');
    }
  };

  // ── PATIENT INFO HANDLERS ──
  const openPatientEdit = () => {
    setPatientForm({
      height: customer?.height || '',
      weight: customer?.weight || '',
      notes: customer?.notes || '',
    });
    setPatientEditOpen(true);
  };

  const handleUpdatePatient = async () => {
    setSavingPatient(true);
    try {
      await updateCustomer(customerId, {
        height: patientForm.height ? parseFloat(patientForm.height) : null,
        weight: patientForm.weight ? parseFloat(patientForm.weight) : null,
        notes: patientForm.notes.trim() || null,
      });
      toast.success('Información del paciente actualizada');
      setPatientEditOpen(false);
      loadAll();
    } catch (err) {
      toast.error('Error actualizando paciente');
      console.error(err);
    } finally {
      setSavingPatient(false);
    }
  };

  // ── NOTE HANDLERS ──
  const handleSaveNote = async () => {
    if (!noteForm.note.trim()) {
      toast.error('La nota no puede estar vacía');
      return;
    }
    try {
      if (editingNote) {
        await updateMedicalNote(editingNote.id, { note: noteForm.note.trim() });
        toast.success('Nota actualizada');
      } else {
        await createMedicalNote({
          customer_id: customerId,
          doctor_id: user?.id,
          note: noteForm.note.trim(),
        });
        toast.success('Nota creada');
      }
      setNoteDialogOpen(false);
      setEditingNote(null);
      setNoteForm({ note: '' });
      loadAll();
    } catch (err) {
      toast.error('Error guardando nota');
    }
  };

  const handleDeleteNote = async (id) => {
    if (!confirm('¿Eliminar esta nota?')) return;
    try {
      await deleteMedicalNote(id);
      toast.success('Nota eliminada');
      loadAll();
    } catch (err) {
      toast.error('Error eliminando nota');
    }
  };

  const openEditNote = (note) => {
    setEditingNote(note);
    setNoteForm({ note: note.note });
    setNoteDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-48 rounded-lg" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="text-center py-12">
        <Users className="w-12 h-12 text-slate-300 mx-auto mb-4" />
        <p className="text-slate-500">Paciente no encontrado</p>
        <Button onClick={() => navigate('/doctor/customers')} variant="outline" className="mt-4">
          <ArrowLeft className="w-4 h-4 mr-2" /> Volver a pacientes
        </Button>
      </div>
    );
  }

  const upcomingAppts = appointments.filter(a =>
    ['pending', 'confirmed'].includes(a.status) &&
    new Date(a.appointment_date) >= new Date()
  );
  const pastAppts = appointments.filter(a =>
    a.status === 'completed' ||
    a.status === 'cancelled' ||
    new Date(a.appointment_date) < new Date()
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => navigate('/doctor/customers')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{customer.full_name}</h2>
          <div className="flex items-center gap-3 text-sm text-slate-500 mt-1">
            {customer.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{customer.phone}</span>}
            {customer.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{customer.email}</span>}
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-5 w-full">
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="recetas">Recetas</TabsTrigger>
          <TabsTrigger value="citas">Citas</TabsTrigger>
          <TabsTrigger value="compras">Compras</TabsTrigger>
          <TabsTrigger value="notas">Notas</TabsTrigger>
        </TabsList>

        {/* RESUMEN TAB */}
        <TabsContent value="resumen" className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl p-6 border border-slate-200">
              <p className="text-sm text-slate-500">Total Recetas</p>
              <p className="text-3xl font-bold text-slate-900">{prescriptions.length}</p>
            </div>
            <div className="bg-white rounded-xl p-6 border border-slate-200">
              <p className="text-sm text-slate-500">Total Citas</p>
              <p className="text-3xl font-bold text-slate-900">{appointments.length}</p>
            </div>
            <div className="bg-white rounded-xl p-6 border border-slate-200">
              <p className="text-sm text-slate-500">Total Compras</p>
              <p className="text-3xl font-bold text-slate-900">{purchases.length}</p>
            </div>
            <div className="bg-white rounded-xl p-6 border border-slate-200">
              <p className="text-sm text-slate-500">Notas Médicas</p>
              <p className="text-3xl font-bold text-slate-900">{notes.length}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900">Información del paciente</h3>
              <Button size="sm" variant="outline" onClick={openPatientEdit}>
                <Edit2 className="w-3 h-3 mr-1" /> Editar
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
              <div><span className="text-slate-500">Nombre:</span> {customer.full_name}</div>
              <div><span className="text-slate-500">Email:</span> {customer.email || '-'}</div>
              <div><span className="text-slate-500">Teléfono:</span> {customer.phone || '-'}</div>
              <div><span className="text-slate-500">CURP:</span> {customer.curp || '-'}</div>
              <div><span className="text-slate-500">Nacimiento:</span> {formatDate(customer.date_of_birth)}</div>
              <div><span className="text-slate-500">Registro:</span> {formatDate(customer.created_at)}</div>
              <div><span className="text-slate-500">Talla:</span> {customer.height ? `${customer.height} cm` : '-'}</div>
              <div><span className="text-slate-500">Peso:</span> {customer.weight ? `${customer.weight} kg` : '-'}</div>
              {customer.notes && <div className="col-span-full"><span className="text-slate-500">Notas:</span> {customer.notes}</div>}
            </div>
          </div>
        </TabsContent>

        {/* RECETAS TAB */}
        <TabsContent value="recetas" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Recetas médicas</h3>
            <Button onClick={() => setRxDialogOpen(true)} size="sm">
              <Plus className="w-4 h-4 mr-1" /> Nueva Receta
            </Button>
          </div>

          {prescriptions.length === 0 ? (
            <div className="bg-white rounded-xl p-8 text-center border border-slate-200">
              <Pill className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">No hay recetas registradas</p>
            </div>
          ) : (
            <div className="space-y-3">
              {prescriptions.map(rx => (
                <div key={rx.id} className="bg-white rounded-xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Pill className="w-4 h-4 text-teal-600" />
                        <span className="font-semibold text-slate-900">{rx.medication}</span>
                        <Badge className={statusConfig[rx.status]?.className || 'bg-gray-100'}>
                          {statusConfig[rx.status]?.label || rx.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-500 mt-1">
                        <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded">{rx.prescription_number}</span>
                        {' · '}{formatDate(rx.created_at)}
                      </p>
                      {(rx.dosage || rx.frequency || rx.duration) && (
                        <p className="text-sm text-slate-600 mt-2">
                          {rx.dosage && <span>{rx.dosage}</span>}
                          {rx.frequency && <span> · {rx.frequency}</span>}
                          {rx.duration && <span> · {rx.duration}</span>}
                        </p>
                      )}
                      {rx.notes && <p className="text-sm text-slate-500 mt-1 italic">{rx.notes}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* CITAS TAB */}
        <TabsContent value="citas" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Citas</h3>
            <Button onClick={() => setApptDialogOpen(true)} size="sm">
              <Plus className="w-4 h-4 mr-1" /> Nueva Cita
            </Button>
          </div>

          {appointments.length === 0 ? (
            <div className="bg-white rounded-xl p-8 text-center border border-slate-200">
              <Calendar className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">No hay citas registradas</p>
            </div>
          ) : (
            <div className="space-y-6">
              {upcomingAppts.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-slate-500 mb-3">Próximas citas</h4>
                  <div className="space-y-2">
                    {upcomingAppts.map(ap => (
                      <div key={ap.id} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-slate-400" />
                            <span className="font-medium">{formatDateTime(ap.appointment_date)}</span>
                            <Badge className={apptStatusConfig[ap.status]?.className}>
                              {apptStatusConfig[ap.status]?.label}
                            </Badge>
                          </div>
                          {ap.notes && <p className="text-sm text-slate-500 mt-1">{ap.notes}</p>}
                        </div>
                        <div className="flex gap-2">
                          {ap.status === 'pending' && (
                            <Button size="sm" variant="outline" onClick={() => handleApptStatus(ap.id, 'confirmed')}>
                              <CheckCircle className="w-3 h-3 mr-1" /> Confirmar
                            </Button>
                          )}
                          {ap.status === 'confirmed' && (
                            <Button size="sm" variant="outline" onClick={() => handleApptStatus(ap.id, 'completed')}>
                              <CheckCircle className="w-3 h-3 mr-1" /> Completar
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="text-red-600" onClick={() => handleDeleteAppt(ap.id)}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {pastAppts.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-slate-500 mb-3">Citas anteriores</h4>
                  <div className="space-y-2">
                    {pastAppts.map(ap => (
                      <div key={ap.id} className="bg-slate-50 rounded-xl border border-slate-100 p-4 flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-slate-400" />
                            <span className="text-sm">{formatDateTime(ap.appointment_date)}</span>
                            <Badge className={apptStatusConfig[ap.status]?.className}>
                              {apptStatusConfig[ap.status]?.label}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* COMPRAS TAB */}
        <TabsContent value="compras" className="space-y-4">
          <h3 className="text-lg font-semibold">Historial de compras</h3>
          {purchases.length === 0 ? (
            <div className="bg-white rounded-xl p-8 text-center border border-slate-200">
              <ShoppingCart className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">No hay compras registradas</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Fecha</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Productos</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Total</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Folio</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {purchases.map(sale => (
                    <tr key={sale.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm">{formatDate(sale.timestamp)}</td>
                      <td className="px-4 py-3 text-sm">
                        {sale.sale_items?.map(i => i.name).join(', ') || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium">{formatMXN(sale.total)}</td>
                      <td className="px-4 py-3 text-sm font-mono text-slate-500">
                        #{sale.id?.slice(-8).toUpperCase()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* NOTAS TAB */}
        <TabsContent value="notas" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Notas médicas</h3>
            <Button onClick={() => { setEditingNote(null); setNoteForm({ note: '' }); setNoteDialogOpen(true); }} size="sm">
              <Plus className="w-4 h-4 mr-1" /> Nueva Nota
            </Button>
          </div>
          {notes.length === 0 ? (
            <div className="bg-white rounded-xl p-8 text-center border border-slate-200">
              <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">No hay notas registradas</p>
            </div>
          ) : (
            <div className="space-y-3">
              {notes.map(note => (
                <div key={note.id} className="bg-white rounded-xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="text-sm text-slate-700 whitespace-pre-wrap">{note.note}</p>
                      <p className="text-xs text-slate-400 mt-2">{formatDateTime(note.created_at)}</p>
                    </div>
                    <div className="flex gap-1 ml-4">
                      <Button size="sm" variant="ghost" onClick={() => openEditNote(note)}>
                        <Edit2 className="w-3 h-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="text-red-600" onClick={() => handleDeleteNote(note.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Prescription Dialog */}
      <Dialog open={rxDialogOpen} onOpenChange={setRxDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nueva Receta</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Medicamento *</Label>
              <div className="flex gap-2">
                <Select
                  value={rxForm.useInventory ? 'inventory' : 'custom'}
                  onValueChange={(v) => setRxForm({ ...rxForm, useInventory: v === 'inventory' })}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="custom">Personalizado</SelectItem>
                    <SelectItem value="inventory">De inventario</SelectItem>
                  </SelectContent>
                </Select>
                {rxForm.useInventory ? (
                  <Select value={rxForm.inventoryId} onValueChange={(v) => {
                    const item = inventory.find(i => i.id === v);
                    setRxForm({ ...rxForm, inventoryId: v, medication: item?.name || '' });
                  }}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Seleccionar medicamento..." />
                    </SelectTrigger>
                    <SelectContent>
                      {inventory.map(item => (
                        <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    className="flex-1"
                    placeholder="Ej: Amoxicilina 500mg"
                    value={rxForm.medication}
                    onChange={(e) => setRxForm({ ...rxForm, medication: e.target.value })}
                  />
                )}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Dosis</Label>
                <Input placeholder="500mg" value={rxForm.dosage} onChange={(e) => setRxForm({ ...rxForm, dosage: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Frecuencia</Label>
                <Input placeholder="Cada 8h" value={rxForm.frequency} onChange={(e) => setRxForm({ ...rxForm, frequency: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Duración</Label>
                <Input placeholder="7 días" value={rxForm.duration} onChange={(e) => setRxForm({ ...rxForm, duration: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Talla (cm)</Label>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="Ej: 170"
                  value={rxForm.height_cm}
                  onChange={(e) => setRxForm({ ...rxForm, height_cm: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Peso (kg)</Label>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="Ej: 70"
                  value={rxForm.weight_kg}
                  onChange={(e) => setRxForm({ ...rxForm, weight_kg: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notas adicionales</Label>
              <Textarea
                placeholder="Instrucciones especiales..."
                value={rxForm.notes}
                onChange={(e) => setRxForm({ ...rxForm, notes: e.target.value })}
                rows={3}
              />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setRxDialogOpen(false)}>Cancelar</Button>
              <Button className="flex-1 bg-gradient-to-r from-teal-500 to-emerald-600" onClick={handleCreateRx}>Guardar Receta</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Appointment Dialog */}
      <Dialog open={apptDialogOpen} onOpenChange={setApptDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nueva Cita</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Fecha y hora *</Label>
              <Input
                type="datetime-local"
                value={apptForm.appointment_date}
                onChange={(e) => setApptForm({ ...apptForm, appointment_date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={apptForm.type} onValueChange={(v) => setApptForm({ ...apptForm, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="in_person">Presencial</SelectItem>
                  <SelectItem value="video">Video consulta</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notas</Label>
              <Textarea
                placeholder="Motivo de la consulta..."
                value={apptForm.notes}
                onChange={(e) => setApptForm({ ...apptForm, notes: e.target.value })}
                rows={3}
              />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setApptDialogOpen(false)}>Cancelar</Button>
              <Button className="flex-1 bg-gradient-to-r from-teal-500 to-emerald-600" onClick={handleCreateAppt}>Guardar Cita</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Note Dialog */}
      <Dialog open={noteDialogOpen} onOpenChange={setNoteDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingNote ? 'Editar Nota' : 'Nueva Nota Médica'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nota *</Label>
              <Textarea
                placeholder="Escribe la nota médica..."
                value={noteForm.note}
                onChange={(e) => setNoteForm({ ...noteForm, note: e.target.value })}
                rows={6}
              />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setNoteDialogOpen(false)}>Cancelar</Button>
              <Button className="flex-1 bg-gradient-to-r from-teal-500 to-emerald-600" onClick={handleSaveNote}>Guardar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Patient Edit Dialog */}
      <Dialog open={patientEditOpen} onOpenChange={setPatientEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar información del paciente</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Talla (cm)</Label>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="Ej: 170"
                  value={patientForm.height}
                  onChange={(e) => setPatientForm({ ...patientForm, height: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Peso (kg)</Label>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="Ej: 70"
                  value={patientForm.weight}
                  onChange={(e) => setPatientForm({ ...patientForm, weight: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notas generales</Label>
              <Textarea
                placeholder="Notas sobre el paciente..."
                value={patientForm.notes}
                onChange={(e) => setPatientForm({ ...patientForm, notes: e.target.value })}
                rows={3}
              />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setPatientEditOpen(false)}>Cancelar</Button>
              <Button
                className="flex-1 bg-gradient-to-r from-teal-500 to-emerald-600"
                onClick={handleUpdatePatient}
                disabled={savingPatient}
              >
                {savingPatient ? 'Guardando...' : 'Guardar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PatientWorkspace;
