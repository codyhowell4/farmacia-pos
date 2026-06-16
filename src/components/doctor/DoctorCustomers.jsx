import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Search, ChevronRight, Phone, Mail, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { getCustomersForDoctor, createCustomer } from '@/lib/db';
import { toast } from 'sonner';

const DoctorCustomers = () => {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    full_name: '', phone: '', email: '', date_of_birth: '', notes: '',
  });

  const safeCustomers = Array.isArray(customers) ? customers : [];

  useEffect(() => {
    loadCustomers();
  }, []);

  useEffect(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      setFiltered(safeCustomers);
      return;
    }
    setFiltered(safeCustomers.filter(c =>
      c?.full_name?.toLowerCase().includes(q) ||
      c?.phone?.toLowerCase().includes(q) ||
      c?.email?.toLowerCase().includes(q) ||
      c?.curp?.toLowerCase().includes(q)
    ));
  }, [search, safeCustomers.length]);

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const data = await getCustomersForDoctor();
      const safe = Array.isArray(data) ? data : [];
      setCustomers(safe);
      setFiltered(safe);
    } catch (err) {
      toast.error('Error cargando pacientes');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCustomer = async () => {
    if (!newCustomer.full_name.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }
    setCreating(true);
    try {
      const created = await createCustomer({
        full_name: newCustomer.full_name.trim(),
        phone: newCustomer.phone.trim() || null,
        email: newCustomer.email.trim() || null,
        date_of_birth: newCustomer.date_of_birth || null,
        notes: newCustomer.notes.trim() || null,
      });
      toast.success('Paciente creado exitosamente');
      setCreateDialogOpen(false);
      setNewCustomer({ full_name: '', phone: '', email: '', date_of_birth: '', notes: '' });
      // Navigate to the new patient's workspace
      navigate(`/doctor/customers/${created.id}`);
      loadCustomers();
    } catch (err) {
      toast.error(err.message || 'Error creando paciente');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Pacientes</h2>
          <p className="text-slate-600">Consulta y gestiona tus pacientes</p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" /> Nuevo Paciente
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Buscar por nombre, teléfono, CURP..."
          className="pl-10"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl shadow-lg p-8 text-center">
          <Users className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500">
            {search ? 'No se encontraron pacientes' : 'No hay pacientes registrados'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="divide-y">
            {filtered.map(c => (
              <button
                key={c?.id || Math.random()}
                onClick={() => navigate(`/doctor/customers/${c.id}`)}
                className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors text-left"
              >
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 truncate">{c?.full_name || 'Sin nombre'}</p>
                  <div className="flex items-center gap-3 text-sm text-slate-500 mt-1">
                    {c?.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</span>}
                    {c?.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{c.email}</span>}
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Create Patient Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuevo Paciente</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre completo *</Label>
              <Input
                placeholder="Nombre del paciente"
                value={newCustomer.full_name}
                onChange={(e) => setNewCustomer({ ...newCustomer, full_name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Teléfono</Label>
                <Input
                  placeholder="555-123-4567"
                  value={newCustomer.phone}
                  onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  placeholder="paciente@email.com"
                  value={newCustomer.email}
                  onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Fecha de nacimiento</Label>
              <Input
                type="date"
                value={newCustomer.date_of_birth}
                onChange={(e) => setNewCustomer({ ...newCustomer, date_of_birth: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Notas</Label>
              <Input
                placeholder="Notas adicionales..."
                value={newCustomer.notes}
                onChange={(e) => setNewCustomer({ ...newCustomer, notes: e.target.value })}
              />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setCreateDialogOpen(false)}>Cancelar</Button>
              <Button
                className="flex-1 bg-gradient-to-r from-teal-500 to-emerald-600"
                onClick={handleCreateCustomer}
                disabled={creating}
              >
                {creating ? 'Guardando...' : 'Guardar Paciente'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DoctorCustomers;
