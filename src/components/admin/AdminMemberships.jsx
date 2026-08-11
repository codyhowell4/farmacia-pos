import React, { useState, useEffect } from 'react';
import { Search, Users, User, ChevronDown, ChevronUp, Edit2, Loader2, RefreshCw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { getMemberships, searchMemberships, updateMembership, processMembershipRenewals } from '@/lib/db';
import { formatMXN } from '@/lib/currency';

const statusConfig = {
  active: { label: 'Activo', className: 'bg-green-100 text-green-800' },
  paused: { label: 'Pausado', className: 'bg-yellow-100 text-yellow-800' },
  cancelled: { label: 'Cancelado', className: 'bg-red-100 text-red-800' },
  expired: { label: 'Expirado', className: 'bg-slate-100 text-slate-800' },
  pending_payment: { label: 'Pago pendiente', className: 'bg-amber-100 text-amber-800' },
};

const StatusBadge = ({ status }) => {
  const s = statusConfig[status] || statusConfig.active;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${s.className}`}>
      {s.label}
    </span>
  );
};

const AdminMemberships = () => {
  const [memberships, setMemberships] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [processing, setProcessing] = useState(false);
  const { toast } = useToast();

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = searchTerm.trim()
        ? await searchMemberships(searchTerm.trim())
        : await getMemberships();
      setMemberships(data || []);
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'No se pudieron cargar las membresías', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const timer = setTimeout(loadData, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const handleProcessRenewals = async () => {
    setProcessing(true);
    try {
      const count = await processMembershipRenewals();
      toast({ title: 'Renovaciones procesadas', description: `${count} membresía(s) actualizada(s).` });
      await loadData();
    } catch (e) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    try {
      await updateMembership(editing.id, {
        customerUpdates: {
          full_name: editing.customers?.full_name,
          email: editing.customers?.email,
          phone: editing.customers?.phone,
        },
        membershipUpdates: {
          discount_percent: Number(editing.discount_percent),
          visits_remaining: Number(editing.visits_remaining),
          status: editing.status,
        },
      });
      toast({ title: 'Membresía actualizada' });
      setEditing(null);
      await loadData();
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Membresías</h1>
          <p className="text-sm text-slate-500">Administra los planes de membresía Apolo.</p>
        </div>
        <Button variant="outline" size="sm" disabled={processing} onClick={handleProcessRenewals}>
          {processing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
          Procesar renovaciones
        </Button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Buscar por ID, nombre, teléfono o correo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-slate-500">Cargando membresías...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Plan ID</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Nombre</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Teléfono</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Correo</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Plan</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Miembros</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Estado</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {memberships.map((m) => (
                  <React.Fragment key={m.id}>
                    <tr className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-mono font-medium text-slate-900">{m.plan_id}</td>
                      <td className="px-4 py-3 text-slate-900">{m.customers?.full_name || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{m.customers?.phone || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{m.customers?.email || '—'}</td>
                      <td className="px-4 py-3 capitalize text-slate-700">
                        {m.plan_type === 'familiar' ? 'Familiar' : 'Individual'}
                      </td>
                      <td className="px-4 py-3">
                        {m.plan_type === 'familiar' ? (
                          <button
                            onClick={() => setExpandedId(expandedId === m.id ? null : m.id)}
                            className="flex items-center gap-1 text-blue-600 hover:text-blue-800"
                          >
                            {m.membership_members?.length || 0} miembros
                            {expandedId === m.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={m.status} />
                      </td>
                      <td className="px-4 py-3">
                        <Button size="sm" variant="ghost" onClick={() => setEditing({ ...m, customers: { ...m.customers } })}>
                          <Edit2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                    {expandedId === m.id && m.plan_type === 'familiar' && (
                      <tr>
                        <td colSpan={8} className="px-4 py-3 bg-slate-50">
                          <div className="space-y-2">
                            <p className="text-xs font-semibold text-slate-500 uppercase">Miembros del plan</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                              {(m.membership_members || []).map((mm) => (
                                <div key={mm.id} className="bg-white border rounded p-2 text-sm">
                                  <p className="font-medium text-slate-900">{mm.name}</p>
                                  <p className="text-xs text-slate-500 font-mono">{mm.sub_id}</p>
                                  {mm.is_owner && <span className="text-xs text-blue-600">Titular</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
                {memberships.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                      {searchTerm ? 'No se encontraron membresías con ese criterio' : 'No hay membresías registradas.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar membresía</DialogTitle>
          </DialogHeader>
          {editing && (
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <Label>Plan ID</Label>
                <Input value={editing.plan_id} disabled />
              </div>
              <div>
                <Label>Nombre</Label>
                <Input
                  value={editing.customers?.full_name || ''}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      customers: { ...editing.customers, full_name: e.target.value },
                    })
                  }
                />
              </div>
              <div>
                <Label>Teléfono</Label>
                <Input
                  value={editing.customers?.phone || ''}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      customers: { ...editing.customers, phone: e.target.value },
                    })
                  }
                />
              </div>
              <div>
                <Label>Correo</Label>
                <Input
                  value={editing.customers?.email || ''}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      customers: { ...editing.customers, email: e.target.value },
                    })
                  }
                />
              </div>
              <div>
                <Label>Descuento (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={editing.discount_percent}
                  onChange={(e) => setEditing({ ...editing, discount_percent: e.target.value })}
                />
              </div>
              <div>
                <Label>Consultas restantes</Label>
                <Input
                  type="number"
                  min={0}
                  value={editing.visits_remaining}
                  onChange={(e) => setEditing({ ...editing, visits_remaining: e.target.value })}
                />
              </div>
              <div>
                <Label>Estado</Label>
                <select
                  value={editing.status}
                  onChange={(e) => setEditing({ ...editing, status: e.target.value })}
                  className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm bg-white"
                >
                  {Object.keys(statusConfig).map((s) => (
                    <option key={s} value={s}>
                      {statusConfig[s].label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                  Cancelar
                </Button>
                <Button type="submit">Guardar cambios</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminMemberships;
