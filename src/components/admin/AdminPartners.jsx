import React, { useState, useEffect } from 'react';
import { HeartHandshake, Plus, Edit2, Trash2, Loader2, Phone, MapPin, Globe } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getPartners, createPartner, updatePartner, deletePartner } from '@/lib/db';

const emptyForm = {
  name: '',
  category: '',
  offer: '',
  description: '',
  phone: '',
  whatsapp: '',
  address: '',
  website: '',
  sort_order: 0,
  active: true,
};

const AdminPartners = () => {
  const [partners, setPartners] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editing, setEditing] = useState(null); // { ...form, id? }
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const { toast } = useToast();

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await getPartners();
      setPartners(data || []);
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'No se pudieron cargar los socios', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!editing.name.trim() || !editing.offer.trim()) {
      toast({ title: 'Verifica los datos', description: 'Nombre y oferta son obligatorios.', variant: 'destructive' });
      return;
    }

    setSaving(true);
    const payload = {
      name: editing.name.trim(),
      category: editing.category.trim() || null,
      offer: editing.offer.trim(),
      description: editing.description.trim() || null,
      phone: editing.phone.trim() || null,
      whatsapp: editing.whatsapp.trim() || null,
      address: editing.address.trim() || null,
      website: editing.website.trim() || null,
      sort_order: Number(editing.sort_order) || 0,
      active: !!editing.active,
    };

    try {
      if (editing.id) {
        await updatePartner(editing.id, payload);
        toast({ title: 'Socio actualizado' });
      } else {
        await createPartner(payload);
        toast({ title: 'Socio agregado' });
      }
      setEditing(null);
      await loadData();
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (partner) => {
    try {
      await updatePartner(partner.id, { active: !partner.active });
      await loadData();
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleDelete = async (partner) => {
    if (!window.confirm(`¿Eliminar a ${partner.name}? Esto no se puede deshacer.`)) return;
    setDeletingId(partner.id);
    try {
      await deletePartner(partner.id);
      toast({ title: 'Socio eliminado' });
      await loadData();
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Socios</h1>
          <p className="text-sm text-slate-500">
            Negocios aliados que ofrecen descuentos o beneficios a los miembros. Se muestran en la sección de membresía de la app.
          </p>
        </div>
        <Button size="sm" onClick={() => setEditing({ ...emptyForm })}>
          <Plus className="w-4 h-4 mr-1" /> Agregar socio
        </Button>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-slate-500">Cargando socios...</div>
      ) : partners.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
          <HeartHandshake className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">No hay socios registrados todavía.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {partners.map((p) => (
            <div key={p.id} className={`bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col gap-3 ${!p.active ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-900">{p.name}</p>
                  {p.category && <p className="text-xs text-slate-500 capitalize">{p.category}</p>}
                </div>
                <button
                  onClick={() => handleToggleActive(p)}
                  className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                    p.active ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'
                  }`}
                  title={p.active ? 'Visible en la app — clic para ocultar' : 'Oculto en la app — clic para mostrar'}
                >
                  {p.active ? 'Activo' : 'Inactivo'}
                </button>
              </div>

              <p className="text-sm font-medium text-apolo-navy">{p.offer}</p>
              {p.description && <p className="text-sm text-slate-600">{p.description}</p>}

              <div className="space-y-1 text-xs text-slate-500 mt-auto">
                {p.phone && <p className="flex items-center gap-1.5"><Phone className="w-3 h-3" /> {p.phone}</p>}
                {p.address && <p className="flex items-center gap-1.5"><MapPin className="w-3 h-3" /> {p.address}</p>}
                {p.website && <p className="flex items-center gap-1.5"><Globe className="w-3 h-3" /> {p.website}</p>}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <Button size="sm" variant="ghost" onClick={() => setEditing({ ...emptyForm, ...p })}>
                  <Edit2 className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-600 hover:text-red-700"
                  disabled={deletingId === p.id}
                  onClick={() => handleDelete(p)}
                >
                  {deletingId === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? 'Editar socio' : 'Agregar socio'}</DialogTitle>
          </DialogHeader>
          {editing && (
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <Label>Nombre del negocio *</Label>
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} required />
              </div>
              <div>
                <Label>Categoría</Label>
                <Input
                  placeholder="Ej. gimnasio, óptica, laboratorio, restaurante"
                  value={editing.category}
                  onChange={(e) => setEditing({ ...editing, category: e.target.value })}
                />
              </div>
              <div>
                <Label>Oferta para miembros *</Label>
                <Input
                  placeholder="Ej. 15% de descuento mostrando tu tarjeta digital"
                  value={editing.offer}
                  onChange={(e) => setEditing({ ...editing, offer: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Descripción</Label>
                <Input
                  placeholder="Detalles o condiciones (opcional)"
                  value={editing.description || ''}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Teléfono</Label>
                  <Input value={editing.phone || ''} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
                </div>
                <div>
                  <Label>WhatsApp</Label>
                  <Input value={editing.whatsapp || ''} onChange={(e) => setEditing({ ...editing, whatsapp: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Dirección</Label>
                <Input value={editing.address || ''} onChange={(e) => setEditing({ ...editing, address: e.target.value })} />
              </div>
              <div>
                <Label>Sitio web</Label>
                <Input value={editing.website || ''} onChange={(e) => setEditing({ ...editing, website: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4 items-end">
                <div>
                  <Label>Orden (menor primero)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={editing.sort_order}
                    onChange={(e) => setEditing({ ...editing, sort_order: e.target.value })}
                  />
                </div>
                <label className="flex items-center gap-2 pb-2">
                  <input
                    type="checkbox"
                    checked={!!editing.active}
                    onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Visible en la app</span>
                </label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                  Guardar
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminPartners;
