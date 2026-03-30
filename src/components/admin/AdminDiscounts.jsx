import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, Edit, Trash2, Search, Ticket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';

import { getDiscounts, createDiscount, deleteDiscount } from '@/lib/db';

const AdminDiscounts = () => {
  const [discounts, setDiscounts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState(null);
  const [formData, setFormData] = useState({ code: '', value: '' });
  const { toast } = useToast();

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
      if (editingDiscount) {
        // update via upsert — reuse createDiscount with id
        await createDiscount({ id: editingDiscount.id, code: formData.code, value: parseFloat(formData.value) });
        toast({ title: 'Discount Updated! ✅' });
      } else {
        await createDiscount({ code: formData.code, value: parseFloat(formData.value) });
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
      await deleteDiscount(id);
      await loadDiscounts();
      toast({ title: 'Discount Deleted' });
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleEdit = (discount) => {
    setEditingDiscount(discount);
    setFormData({ code: discount.code, value: discount.value.toString() });
    setIsDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({ code: '', value: '' });
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
              <Button className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700">
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
                  <Label htmlFor="value">Valor del descuento (%)</Label>
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
                  <td className="px-4 py-3 text-sm font-bold text-green-600">{discount.value}%</td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex space-x-2">
                      <button onClick={() => handleEdit(discount)} className="text-blue-600 hover:text-blue-800"><Edit className="w-4 h-4" /></button>
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