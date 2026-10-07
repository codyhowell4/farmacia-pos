import React, { useState, useEffect, useRef } from 'react';
import { HeartHandshake, Plus, Edit2, Trash2, Loader2, Phone, MapPin, Globe, Mail, Ticket, ImagePlus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getPartners, createPartner, updatePartner, deletePartner } from '@/lib/db';
import { supabase } from '@/lib/supabase';

const emptyForm = {
  name: '',
  category: '',
  offer: '',
  description: '',
  phone: '',
  whatsapp: '',
  address: '',
  website: '',
  contact_email: '',
  sort_order: 0,
  active: true,
};

const withTimeout = (promise, ms, step) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${step} tardó demasiado. Revisa tu conexión e inténtalo de nuevo.`)), ms)
    ),
  ]);

const resizeLogo = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('img'));
      img.onload = () => {
        const scale = Math.min(1, 600 / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('blob'))), 'image/jpeg', 0.85);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

const AdminPartners = () => {
  const [partners, setPartners] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editing, setEditing] = useState(null); // { ...form, id?, logo_url? }
  const [logoFile, setLogoFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const { toast } = useToast();
  const logoInputRef = useRef(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await getPartners();
      setPartners(data || []);
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'No se pudieron cargar los afiliados', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openEdit = (partner) => {
    setLogoFile(null);
    if (logoInputRef.current) logoInputRef.current.value = '';
    setEditing(partner ? { ...emptyForm, ...partner } : { ...emptyForm });
  };

  const uploadLogo = async (partnerId) => {
    let blob;
    let contentType = 'image/jpeg';
    let ext = 'jpg';
    try {
      blob = await withTimeout(resizeLogo(logoFile), 10000, 'Procesar la imagen');
    } catch (resizeErr) {
      console.warn('resizeLogo falló; se sube el archivo original:', resizeErr);
      blob = logoFile;
      contentType = logoFile.type || 'image/jpeg';
      ext = { 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[contentType] || 'jpg';
    }
    const path = `${partnerId}/logo-${Date.now()}.${ext}`;
    const { error } = await withTimeout(
      supabase.storage.from('partner-logos').upload(path, blob, { contentType }),
      30000,
      'Subir el logo'
    );
    if (error) throw error;
    const { data } = supabase.storage.from('partner-logos').getPublicUrl(path);
    return data.publicUrl;
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!editing.name.trim() || !editing.offer.trim()) {
      toast({ title: 'Verifica los datos', description: 'Nombre y oferta son obligatorios.', variant: 'destructive' });
      return;
    }
    if (logoFile && logoFile.size > 5 * 1024 * 1024) {
      toast({ title: 'Verifica el logo', description: 'La imagen no debe pasar de 5 MB.', variant: 'destructive' });
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
      contact_email: (editing.contact_email || '').trim() || null,
      sort_order: Number(editing.sort_order) || 0,
      active: !!editing.active,
    };

    try {
      let partnerId = editing.id;
      if (partnerId) {
        const logoUrl = logoFile ? await uploadLogo(partnerId) : null;
        await withTimeout(
          updatePartner(partnerId, { ...payload, ...(logoUrl ? { logo_url: logoUrl } : {}) }),
          15000,
          'Guardar los datos'
        );
      } else {
        const created = await withTimeout(createPartner(payload), 15000, 'Guardar los datos');
        partnerId = created.id;
        setEditing((prev) => (prev ? { ...prev, id: partnerId } : prev));
        if (logoFile) {
          const logoUrl = await uploadLogo(partnerId);
          await withTimeout(updatePartner(partnerId, { logo_url: logoUrl }), 15000, 'Guardar el logo');
        }
      }
      toast({ title: editing.id ? 'Afiliado actualizado' : 'Afiliado agregado' });
      setEditing(null);
      setLogoFile(null);
      await loadData();
    } catch (err) {
      console.error('AdminPartners save failed:', err);
      toast({ title: 'No se pudo guardar', description: err.message, variant: 'destructive' });
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
      toast({ title: 'Afiliado eliminado' });
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
          <h1 className="text-2xl font-bold text-slate-900">Afiliados</h1>
          <p className="text-sm text-slate-500">
            Negocios aliados que ofrecen descuentos o beneficios a los miembros. Se muestran en la sección de membresía de la app.
            También pueden registrarse solos en <span className="font-medium">afiliados.apolofarmacia.com.mx</span>.
          </p>
        </div>
        <Button size="sm" onClick={() => openEdit(null)}>
          <Plus className="w-4 h-4 mr-1" /> Agregar afiliado
        </Button>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-slate-500">Cargando afiliados...</div>
      ) : partners.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
          <HeartHandshake className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">No hay afiliados registrados todavía.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {partners.map((p) => (
            <div key={p.id} className={`bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col gap-3 ${!p.active ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-3 min-w-0">
                  {p.logo_url ? (
                    <img src={p.logo_url} alt="" className="w-11 h-11 rounded-xl object-cover border border-slate-200 shrink-0" loading="lazy" />
                  ) : (
                    <div className="w-11 h-11 rounded-xl bg-indigo-50 text-apolo-navy flex items-center justify-center font-bold text-lg shrink-0">
                      {(p.name || '?').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{p.name}</p>
                    {p.category && <p className="text-xs text-slate-500 capitalize">{p.category}</p>}
                  </div>
                </div>
                <button
                  onClick={() => handleToggleActive(p)}
                  className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${
                    p.active ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'
                  }`}
                  title={p.active ? 'Visible en la app — clic para ocultar' : 'Oculto en la app — clic para mostrar'}
                >
                  {p.active ? 'Activo' : 'Inactivo'}
                </button>
              </div>

              <p className="text-sm font-medium text-apolo-navy">{p.offer}</p>
              {p.description && <p className="text-sm text-slate-600">{p.description}</p>}

              {p.poster_opt_in && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800">📋 Póster</span>
                  {p.coupon_code && (
                    <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded-full bg-indigo-50 text-apolo-navy flex items-center gap-1">
                      <Ticket className="w-3 h-3" /> {p.coupon_code}
                    </span>
                  )}
                </div>
              )}

              <div className="space-y-1 text-xs text-slate-500 mt-auto">
                {p.contact_email && <p className="flex items-center gap-1.5"><Mail className="w-3 h-3" /> {p.contact_email}</p>}
                {p.phone && <p className="flex items-center gap-1.5"><Phone className="w-3 h-3" /> {p.phone}</p>}
                {p.address && <p className="flex items-center gap-1.5"><MapPin className="w-3 h-3" /> {p.address}</p>}
                {p.website && <p className="flex items-center gap-1.5"><Globe className="w-3 h-3" /> {p.website}</p>}
                {p.user_id && <p className="text-emerald-600 font-medium">✓ Tiene cuenta en el portal de afiliados</p>}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>
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
            <DialogTitle>{editing?.id ? 'Editar afiliado' : 'Agregar afiliado'}</DialogTitle>
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
              <div>
                <Label>Logo</Label>
                <div className="flex items-center gap-3 mt-1">
                  {editing.logo_url && !logoFile ? (
                    <img src={editing.logo_url} alt="" className="w-12 h-12 rounded-xl object-cover border border-slate-200" />
                  ) : logoFile ? (
                    <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 text-xs font-bold">Nuevo</div>
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-slate-100 border border-dashed border-slate-300 flex items-center justify-center text-slate-400">
                      <ImagePlus className="w-5 h-5" />
                    </div>
                  )}
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    className="text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-apolo-navy hover:file:bg-indigo-100"
                    onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
                  />
                </div>
                <p className="text-xs text-slate-400 mt-1">Aparece junto al negocio en la app. Máx. 5 MB.</p>
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
                <Label>Correo de contacto</Label>
                <Input
                  type="email"
                  value={editing.contact_email || ''}
                  onChange={(e) => setEditing({ ...editing, contact_email: e.target.value })}
                />
              </div>
              <div>
                <Label>Dirección</Label>
                <Input value={editing.address || ''} onChange={(e) => setEditing({ ...editing, address: e.target.value })} />
              </div>
              <div>
                <Label>Sitio web</Label>
                <Input value={editing.website || ''} onChange={(e) => setEditing({ ...editing, website: e.target.value })} />
              </div>
              {(editing.poster_opt_in || editing.coupon_code) && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 space-y-1">
                  {editing.poster_opt_in && <p>📋 Participa en el programa de póster (10% en sus compras).</p>}
                  {editing.coupon_code && (
                    <p>Cupón: <span className="font-mono font-bold">{editing.coupon_code}</span> — activo en POS y Descuentos.</p>
                  )}
                </div>
              )}
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
