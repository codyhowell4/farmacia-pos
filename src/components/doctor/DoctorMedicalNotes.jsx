import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  FileText, Plus, Search, ChevronDown, ChevronUp, Edit2, Trash2,
  User
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem
} from '@/components/ui/select';
import {
  getMedicalNotesByDoctor,
  createMedicalNote, updateMedicalNote, deleteMedicalNote,
  getCustomersForDoctor
} from '@/lib/db';
import { toast } from 'sonner';

const formatDate = (ts) => {
  if (!ts) return '-';
  return new Date(ts).toLocaleDateString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
};

const DoctorMedicalNotes = () => {
  const { user } = useAuth();
  const [notes, setNotes] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [customerFilter, setCustomerFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [expandedNote, setExpandedNote] = useState(null);
  const [form, setForm] = useState({
    customer_id: '',
    walkin_name: '',
    note: '',
  });

  const safeNotes = Array.isArray(notes) ? notes : [];
  const safeCustomers = Array.isArray(customers) ? customers : [];

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [notesData, custs] = await Promise.all([
        getMedicalNotesByDoctor(user.id),
        getCustomersForDoctor(),
      ]);
      setNotes(notesData);
      setCustomers(custs);
    } catch (err) {
      toast.error('Error cargando notas médicas');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = safeNotes.filter(n => {
    const q = search.toLowerCase();
    const matchesSearch = !q ||
      (n?.customers?.full_name || n?.walkin_name || '').toLowerCase().includes(q) ||
      (n?.note || '').toLowerCase().includes(q);
    const matchesCustomer = customerFilter === 'all' || n?.customer_id === customerFilter;
    return matchesSearch && matchesCustomer;
  });

  const openCreate = () => {
    setEditingNote(null);
    setForm({ customer_id: '', walkin_name: '', note: '' });
    setDialogOpen(true);
  };

  const openEdit = (note) => {
    if (!note) return;
    setEditingNote(note);
    setForm({
      customer_id: note.customer_id || '',
      walkin_name: note.walkin_name || '',
      note: note.note || '',
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
      if (editingNote) {
        await updateMedicalNote(editingNote.id, payload);
        toast.success('Nota actualizada');
      } else {
        await createMedicalNote(payload);
        toast.success('Nota creada');
      }
      setDialogOpen(false);
      loadData();
    } catch (err) {
      toast.error(err.message || 'Error guardando nota');
      console.error(err);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar esta nota permanentemente?')) return;
    try {
      await deleteMedicalNote(id);
      toast.success('Nota eliminada');
      loadData();
    } catch (err) {
      toast.error('Error eliminando nota');
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Notas Médicas</h2>
          <p className="text-slate-600">Registra notas y observaciones de tus pacientes</p>
        </div>
        <Button onClick={openCreate} className="bg-teal-600 hover:bg-teal-700">
          <Plus className="w-4 h-4 mr-2" />
          Nueva nota
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Buscar en notas..."
            className="pl-10"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Select value={customerFilter} onValueChange={setCustomerFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Paciente" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los pacientes</SelectItem>
            {safeCustomers.map(c => (
              <SelectItem key={c?.id || Math.random()} value={c?.id || ''}>{c?.full_name || 'Sin nombre'}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl shadow-lg p-8 text-center">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500">
            {search || customerFilter !== 'all' ? 'No se encontraron notas' : 'No hay notas médicas registradas'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-lg overflow-hidden divide-y">
          {filtered.map(note => (
            <div key={note?.id || Math.random()} className="p-4 hover:bg-slate-50 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-2 text-slate-900 font-medium">
                      <User className="w-4 h-4 text-teal-600" />
                      {note?.customers?.full_name || note?.walkin_name || 'Paciente'}
                    </div>
                    <span className="text-xs text-slate-400">{formatDate(note?.created_at)}</span>
                  </div>

                  <div className="mt-2">
                    {expandedNote === note?.id ? (
                      <div className="text-sm text-slate-700 whitespace-pre-wrap">{note?.note || ''}</div>
                    ) : (
                      <p className="text-sm text-slate-700 line-clamp-2">{note?.note || ''}</p>
                    )}
                  </div>

                  {(note?.note || '').length > 200 && (
                    <button
                      onClick={() => setExpandedNote(expandedNote === note?.id ? null : note?.id)}
                      className="text-xs text-teal-600 hover:text-teal-700 mt-1 flex items-center gap-1"
                    >
                      {expandedNote === note?.id ? (
                        <><ChevronUp className="w-3 h-3" /> Ver menos</>
                      ) : (
                        <><ChevronDown className="w-3 h-3" /> Ver más</>
                      )}
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-slate-500 hover:text-slate-700"
                    title="Editar"
                    onClick={() => openEdit(note)}
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    title="Eliminar"
                    onClick={() => handleDelete(note?.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingNote ? 'Editar nota médica' : 'Nueva nota médica'}</DialogTitle>
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
              <div>
                <Label>Nombre (sin registro)</Label>
                <Input
                  value={form.walkin_name}
                  onChange={e => setForm({ ...form, walkin_name: e.target.value })}
                  placeholder="Nombre del paciente"
                />
              </div>
            )}

            <div>
              <Label>Nota</Label>
              <Textarea
                value={form.note}
                onChange={e => setForm({ ...form, note: e.target.value })}
                placeholder="Escribe la nota médica..."
                rows={8}
                required
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-teal-600 hover:bg-teal-700">
                {editingNote ? 'Guardar cambios' : 'Crear nota'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DoctorMedicalNotes;
