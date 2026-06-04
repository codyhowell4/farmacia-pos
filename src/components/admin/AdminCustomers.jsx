import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Search, UserCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';

import { getCustomers, createCustomer, updateCustomer, deleteCustomer } from '@/lib/db';

const AdminCustomers = () => {
  const [customers, setCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [formData, setFormData] = useState({
    full_name: '', phone: '', email: '', curp: '', address: '', date_of_birth: '', notes: ''
  });
  const { toast } = useToast();

  const loadCustomers = async () => {
    try {
      const data = await getCustomers();
      setCustomers(data);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { loadCustomers(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingCustomer) {
        await updateCustomer(editingCustomer.id, formData);
        toast({ title: 'Cliente actualizado', description: 'La información del cliente ha sido actualizada' });
      } else {
        await createCustomer(formData);
        toast({ title: 'Cliente agregado', description: 'El nuevo cliente ha sido registrado' });
      }
      await loadCustomers();
      setIsDialogOpen(false);
      resetForm();
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar este cliente? Esto también desvinculará sus ventas y citas.')) return;
    try {
      await deleteCustomer(id);
      await loadCustomers();
      toast({ title: 'Cliente eliminado', description: 'El cliente ha sido eliminado' });
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleEdit = (customer) => {
    setEditingCustomer(customer);
    setFormData({
      full_name: customer.full_name || '',
      phone: customer.phone || '',
      email: customer.email || '',
      curp: customer.curp || '',
      address: customer.address || '',
      date_of_birth: customer.date_of_birth || '',
      notes: customer.notes || '',
    });
    setIsDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({ full_name: '', phone: '', email: '', curp: '', address: '', date_of_birth: '', notes: '' });
    setEditingCustomer(null);
  };

  const filtered = customers.filter(c =>
    (c.full_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.phone || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.curp || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.email || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Clientes</h2>
          <p className="text-slate-600">Administra la base de datos de clientes para ventas y citas</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex justify-between items-center mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
            <Input
              placeholder="Buscar clientes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700">
                <Plus className="w-4 h-4 mr-2" />
                Agregar cliente
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <UserCircle className="w-5 h-5" />
                  {editingCustomer ? 'Editar cliente' : 'Nuevo cliente'}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="full_name">Nombre completo *</Label>
                    <Input id="full_name" value={formData.full_name} onChange={(e) => setFormData({ ...formData, full_name: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Teléfono</Label>
                    <Input id="phone" type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Correo electrónico</Label>
                    <Input id="email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="curp">CURP</Label>
                    <Input id="curp" value={formData.curp} onChange={(e) => setFormData({ ...formData, curp: e.target.value.toUpperCase() })} maxLength={18} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="date_of_birth">Fecha de nacimiento</Label>
                    <Input id="date_of_birth" type="date" value={formData.date_of_birth} onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })} />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="address">Dirección</Label>
                    <Input id="address" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="notes">Notas</Label>
                    <Input id="notes" value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
                  </div>
                </div>
                <Button type="submit" className="w-full">
                  {editingCustomer ? 'Actualizar cliente' : 'Agregar cliente'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Nombre</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Teléfono</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">CURP</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Email</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-slate-900">
                    <div className="flex items-center gap-2">
                      <UserCircle className="w-4 h-4 text-slate-400" />
                      {c.full_name}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{c.phone || '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 font-mono">{c.curp || '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{c.email || '—'}</td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex space-x-2">
                      <button onClick={() => handleEdit(c)} className="text-blue-600 hover:text-blue-800"><Edit className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(c.id)} className="text-red-600 hover:text-red-800"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    {searchTerm ? 'No se encontraron clientes con ese criterio' : 'No hay clientes registrados. Agrega el primero.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminCustomers;
