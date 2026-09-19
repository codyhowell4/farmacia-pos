import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, Edit, Trash2, Search, Ticket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';

import { getDiscounts, createDiscount, deleteDiscount } from '@/lib/db';
import { useAuth } from '@/contexts/AuthContext';
import { logAudit, AUDIT_ACTIONS } from '@/lib/auditLog';

const AdminDiscounts = () => {
  const [discounts, setDiscounts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState(null);
  const [formData, setFormData] = useState({ code: '', value: '', type: 'percent' });
  const { toast } = useToast();
  const { user } = useAuth();

  const loadDiscounts = async () => {
    try {
      const data = await getDiscounts();
      setDiscounts(data);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { loadDiscounts(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const valueLabel = formData.type === 'cost_plus' ? `costo +${formData.value}%` : `${formData.value}%`;
      if (editingDiscount) {
        // update via upsert — reuse createDiscount with id
        await createDiscount({ id: editingDiscount.id, code: formData.code, value: parseFloat(formData.value), type: formData.type });
        logAudit({ action: AUDIT_ACTIONS.DISCOUNT_ADD, user, details: `Descuento actualizado: ${formData.code} (${valueLabel})` });
        toast({ title: 'Discount Updated! ✅' });
      } else {
        await createDiscount({ code: formData.code, value: parseFloat(formData.value), type: formData.type });
        logAudit({ action: AUDIT_ACTIONS.DISCOUNT_ADD, user, details: `Descuento creado: ${formData.code} (${valueLabel})` });
        toast({ title: 'Discount Added! 🎉' });
      }
      await loadDiscounts();
      setIsDialogOpen(false);
      resetForm();
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleDelete = async (id) => {
    try {
      const target = discounts.find(d => d.id === id);
      await deleteDiscount(id);
      logAudit({
        action: AUDIT_ACTIONS.DISCOUNT_DELETE,
        user,
        details: `Descuento eliminado: ${target?.code || id}${target ? ` (${target.type === 'cost_plus' ? `costo +${target.value}%` : `${target.value}%`})` : ''}`,
      });
      await loadDiscounts();
      toast({ title: 'Discount Deleted' });
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleEdit = (discount) => {
    setEditingDiscount(discount);
    setFormData({ code: discount.code, value: discount.value.toString(), type: discount.type || 'percent' });
    setIsDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({ code: '', value: '', type: 'percent' });
    setEditingDiscount(null);
  };

  const filteredDiscounts = discounts.filter(d =>
    d.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Código de descuentos</h2>
        <p className="text-slate-600">Crea y administra códigos de descuento for the PoS</p>
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
              placeholder="Search codes..."
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
                Agregar descuento
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingDiscount ? 'Edit Discount' : 'Nuevo descuento'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="code">Código de descuento</Label>
                  <Input id="code" value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>Tipo de descuento</Label>
                  <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">Porcentaje de descuento</SelectItem>
                      <SelectItem value="cost_plus">Costo + % (empleados)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="value">{formData.type === 'cost_plus' ? 'Porcentaje sobre el costo (%)' : 'Valor del descuento (%)'}</Label>
                  <Input id="value" type="number" value={formData.value} onChange={(e) => setFormData({ ...formData, value: e.target.value })} required placeholder="e.g., 15 for 15%" />
                </div>
                <Button type="submit" className="w-full">
                  {editingDiscount ? 'Update Discount' : 'Agregar descuento'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Código</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Valor</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredDiscounts.map((discount) => (
                <motion.tr key={discount.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-slate-900 flex items-center">
                    <Ticket className="w-4 h-4 mr-2 text-slate-500" />
                    {discount.code}
                  </td>
                  <td className="px-4 py-3 text-sm font-bold text-green-600">
                    {discount.type === 'cost_plus' ? `Costo +${discount.value}%` : `${discount.value}%`}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex space-x-2">
                      <button onClick={() => handleEdit(discount)} className="text-apolo-navy hover:text-apolo-navy-dark"><Edit className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(discount.id)} className="text-red-600 hover:text-red-800"><Trash2 className="w-4 h-4" /></button>
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

export default AdminDiscounts;