import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, Edit, Trash2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';

import { getUsers, createUser, updateProfile, deleteProfile, getLocations } from '@/lib/db';

const AdminUsers = () => {
  const [users, setUsers] = useState([]);
  const [locations, setLocations] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({
    username: '', password: '', name: '', role: '', pharmacyLocation: '', pin: ''
  });
  const { toast } = useToast();

  const loadAll = async () => {
    try {
      const [usersData, locsData] = await Promise.all([getUsers(), getLocations()]);
      setUsers(usersData);
      setLocations(locsData);
    } catch (e) { console.error(e); }
  };

  const loadUsers = async () => {
    try {
      const data = await getUsers();
      setUsers(data);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { loadAll(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingUser) {
        await updateProfile(editingUser.id, {
          full_name: formData.name,
          role: formData.role,
          pin: formData.pin || null,
        });
        toast({ title: 'Usuario actualizado', description: 'La información del usuario ha sido actualizada' });
      } else {
        await createUser({
          email: formData.username,
          password: formData.password,
          full_name: formData.name,
          role: formData.role,
          pin: formData.pin || null,
        });
        toast({ title: 'Usuario agregado', description: 'El nuevo usuario ha sido creado' });
      }
      await loadUsers();
      setIsDialogOpen(false);
      resetForm();
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteProfile(id);
      await loadUsers();
      toast({ title: 'Usuario eliminado', description: 'El usuario ha sido eliminado' });
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleEdit = (user) => {
    setEditingUser(user);
    setFormData({
      username: user.email || '',
      password: '',
      name: user.full_name || '',
      role: user.role || '',
      pharmacyLocation: user.location_id || (locations?.length > 0 ? locations[0].id : ''),
      pin: user.pin || '',
    });
    setIsDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      username: '',
      password: '',
      name: '',
      role: '',
      pharmacyLocation: locations?.length > 0 ? locations[0].id : '',
      pin: ''
    });
    setEditingUser(null);
  };

  const filteredUsers = users.filter(user =>
    (user.full_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (user.email || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Gestión de usuarios</h2>
          <p className="text-slate-600">Administra los usuarios y permisos del sistema</p>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-xl shadow-lg p-6"
      >
        <div className="flex justify-between items-center mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
            <Input
              placeholder="Buscar usuarios..."
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
                Agregar usuario
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingUser ? 'Editar usuario' : 'Nuevo usuario'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nombre completo</Label>
                    <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="username">Usuario</Label>
                    <Input id="username" value={formData.username} onChange={(e) => setFormData({ ...formData, username: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Contraseña</Label>
                    <Input id="password" type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="role">Rol</Label>
                    <Select value={formData.role} onValueChange={(value) => setFormData({ ...formData, role: value })}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar rol" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Administrador</SelectItem>
                        <SelectItem value="pos">Punto de Venta</SelectItem>
                        <SelectItem value="inventory">Gestor de Inventario</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pharmacyLocation">Ubicación de farmacia</Label>
                    <Select value={formData.pharmacyLocation} onValueChange={(value) => setFormData({ ...formData, pharmacyLocation: value })}>
                      <SelectTrigger id="pharmacyLocation"><SelectValue placeholder="Seleccionar ubicación" /></SelectTrigger>
                      <SelectContent>
                        {locations.map(loc => (
                          <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {formData.role === 'admin' && (
                    <div className="space-y-2">
                      <Label htmlFor="pin">PIN de administrador</Label>
                      <Input id="pin" type="password" value={formData.pin} onChange={(e) => setFormData({ ...formData, pin: e.target.value })} placeholder="PIN de 4 dígitos" />
                    </div>
                  )}
                </div>
                <Button type="submit" className="w-full">
                  {editingUser ? 'Actualizar usuario' : 'Agregar usuario'}
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
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Usuario</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Rol</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Ubicación de farmacia</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredUsers.map((user) => (
                <motion.tr key={user.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-slate-900">{user.full_name}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{user.email}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${user.role === 'admin' ? 'bg-blue-100 text-blue-700' : user.role === 'pos' ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700'}`}>{user.role === 'admin' ? 'Administrador' : user.role === 'pos' ? 'Punto de Venta' : 'Inventario'}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{user.locations?.name || 'N/A'}</td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex space-x-2">
                      <button onClick={() => handleEdit(user)} className="text-blue-600 hover:text-blue-800"><Edit className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(user.id)} className="text-red-600 hover:text-red-800"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
};

export default AdminUsers;