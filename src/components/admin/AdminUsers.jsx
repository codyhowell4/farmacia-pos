import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Search, UserX, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

import { getUsers, createUser, updateProfile, deleteProfile, getLocations, setProfilePin } from '@/lib/db';

const AdminUsers = () => {
  const [users, setUsers] = useState([]);
  const [locations, setLocations] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({
    username: '', password: '', name: '', role: '', pharmacyLocation: '', pin: '', timezone: 'America/Mexico_City'
  });
  const { toast } = useToast();
  const { user: currentUser } = useAuth();

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
    // Blank password on edit means "unchanged" (updateProfile never sets one).
    if ((!editingUser || formData.password) && formData.password.length < 10) {
      toast({ title: 'Contraseña muy corta', description: 'La contraseña debe tener al menos 10 caracteres.', variant: 'destructive' });
      return;
    }
    if (formData.pin && !/^\d{4,6}$/.test(formData.pin)) {
      toast({ title: 'PIN inválido', description: 'El PIN de administrador debe tener entre 4 y 6 dígitos.', variant: 'destructive' });
      return;
    }
    try {
      if (editingUser) {
        await updateProfile(editingUser.id, {
          full_name: formData.name,
          email: formData.username,
          role: formData.role,
          location_id: formData.pharmacyLocation,
          timezone: formData.timezone || 'America/Mexico_City',
        });
        // PINs live hashed server-side (profiles.pin_hash) and can only be set
        // via RPC. Blank on edit = keep the current PIN (it can't be read back).
        if (formData.pin) {
          await setProfilePin(editingUser.id, formData.pin);
        }
        toast({ title: 'Usuario actualizado', description: 'La información del usuario ha sido actualizada' });
      } else {
        await createUser({
          email: formData.username,
          password: formData.password,
          full_name: formData.name,
          role: formData.role,
          location_id: formData.pharmacyLocation,
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

  const handleToggleActive = async (user) => {
    const isDeactivated = Boolean(user.deactivated_at);
    const name = user.full_name || user.email;
    const question = isDeactivated
      ? `¿Reactivar a ${name}? Volverá a tener acceso al sistema.`
      : `¿Desactivar a ${name}? Perderá todo acceso al sistema de inmediato.`;
    if (!window.confirm(question)) return;
    try {
      const { error } = await supabase.rpc('admin_set_user_active', {
        p_profile_id: user.id,
        p_active: isDeactivated,
      });
      if (error) throw error;
      toast({
        title: isDeactivated ? 'Usuario reactivado' : 'Usuario desactivado',
        description: isDeactivated ? 'El usuario recuperó su acceso al sistema' : 'El usuario ya no puede acceder al sistema',
      });
      await loadUsers();
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
      pin: '',
      timezone: user.timezone || 'America/Mexico_City',
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
      pin: '',
      timezone: 'America/Mexico_City'
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

      <div className="bg-white rounded-xl shadow-lg p-6">
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
              <Button className="bg-gradient-to-r from-apolo-navy to-apolo-navy-dark hover:from-apolo-navy-dark hover:to-apolo-navy-dark">
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
                    <Input id="password" type="password" minLength={10} value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} required={!editingUser} />
                    <p className="text-xs text-slate-400">Mínimo 10 caracteres</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="role">Rol</Label>
                    <select
                      id="role"
                      value={formData.role}
                      onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                      required
                    >
                      <option value="" disabled>Seleccionar rol</option>
                      <option value="admin">Administrador</option>
                      <option value="pos">Punto de Venta</option>
                      <option value="inventory">Gestor de Inventario</option>
                      <option value="doctor">Médico</option>
                      <option value="customer">Cliente</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pharmacyLocation">Ubicación de farmacia</Label>
                    <select
                      id="pharmacyLocation"
                      value={formData.pharmacyLocation}
                      onChange={(e) => setFormData({ ...formData, pharmacyLocation: e.target.value })}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    >
                      <option value="" disabled>Seleccionar ubicación</option>
                      {locations.map(loc => (
                        <option key={loc.id} value={loc.id}>{loc.name}</option>
                      ))}
                    </select>
                  </div>
                  {formData.role === 'admin' && (
                    <div className="space-y-2">
                      <Label htmlFor="pin">PIN de administrador</Label>
                      <Input id="pin" type="password" inputMode="numeric" maxLength={6} value={formData.pin} onChange={(e) => setFormData({ ...formData, pin: e.target.value })} placeholder="PIN de 4 a 6 dígitos" />
                      {editingUser && <p className="text-xs text-slate-400">Deja vacío para conservar el PIN actual.</p>}
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="timezone">Zona horaria</Label>
                    <select
                      id="timezone"
                      value={formData.timezone}
                      onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    >
                      <option value="America/Mexico_City">Centro — CDMX, Naucalpan, Guadalajara</option>
                      <option value="America/Monterrey">Noreste — Monterrey</option>
                      <option value="America/Cancun">Sureste — Cancún, Quintana Roo</option>
                      <option value="America/Merida">Yucatán — Mérida</option>
                      <option value="America/Mazatlan">Pacífico — Mazatlán, Sinaloa</option>
                      <option value="America/Chihuahua">Chihuahua</option>
                      <option value="America/Hermosillo">Sonora — Hermosillo</option>
                      <option value="America/Tijuana">Noroeste — Tijuana</option>
                    </select>
                  </div>
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
                <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-slate-900">
                    {user.full_name}
                    {user.deactivated_at && (
                      <span className="ml-2 px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">Desactivado</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{user.email}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                      user.role === 'admin' ? 'bg-blue-100 text-blue-700' :
                      user.role === 'pos' ? 'bg-green-100 text-green-700' :
                      user.role === 'inventory' ? 'bg-apolo-navy/10 text-apolo-navy' :
                      user.role === 'doctor' ? 'bg-teal-100 text-teal-700' :
                      'bg-amber-100 text-amber-700'
                    }`}>{
                      user.role === 'admin' ? 'Administrador' :
                      user.role === 'pos' ? 'Punto de Venta' :
                      user.role === 'inventory' ? 'Inventario' :
                      user.role === 'doctor' ? 'Médico' :
                      'Cliente'
                    }</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{user.locations?.name || 'N/A'}</td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex space-x-2">
                      <button onClick={() => handleEdit(user)} className="text-apolo-navy hover:text-apolo-navy-dark"><Edit className="w-4 h-4" /></button>
                      {user.id !== currentUser?.id && (
                        <button
                          onClick={() => handleToggleActive(user)}
                          title={user.deactivated_at ? 'Reactivar' : 'Desactivar'}
                          className={user.deactivated_at ? 'text-green-600 hover:text-green-800' : 'text-amber-600 hover:text-amber-800'}
                        >
                          {user.deactivated_at ? <UserCheck className="w-4 h-4" /> : <UserX className="w-4 h-4" />}
                        </button>
                      )}
                      <button onClick={() => handleDelete(user.id)} className="text-red-600 hover:text-red-800"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminUsers;
