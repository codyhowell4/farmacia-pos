import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, Check, X, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import {
  getBankAccounts,
  createBankAccount,
  updateBankAccount,
  deleteBankAccount,
} from '@/lib/db';

const BankAccountSettings = () => {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    bank_name: '',
    account_number: '',
    clabe: '',
    account_holder: '',
    is_default: false,
  });

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      const data = await getBankAccounts();
      setAccounts(data);
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'No se pudieron cargar las cuentas bancarias', variant: 'destructive' });
    }
  };

  const resetForm = () => {
    setFormData({
      bank_name: '',
      account_number: '',
      clabe: '',
      account_holder: '',
      is_default: false,
    });
    setIsAdding(false);
    setEditingId(null);
  };

  const handleSubmit = async () => {
    if (!formData.bank_name || !formData.account_number) {
      toast({ title: 'Datos incompletos', description: 'Banco y número de cuenta son requeridos', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      if (editingId) {
        await updateBankAccount(editingId, formData);
        toast({ title: 'Cuenta actualizada' });
      } else {
        await createBankAccount(formData);
        toast({ title: 'Cuenta creada' });
      }
      await loadAccounts();
      resetForm();
    } catch (e) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar esta cuenta bancaria?')) return;
    try {
      await deleteBankAccount(id);
      toast({ title: 'Cuenta eliminada' });
      await loadAccounts();
    } catch (e) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const startEdit = (account) => {
    setFormData({
      bank_name: account.bank_name,
      account_number: account.account_number,
      clabe: account.clabe || '',
      account_holder: account.account_holder || '',
      is_default: account.is_default,
    });
    setEditingId(account.id);
    setIsAdding(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Building2 className="w-5 h-5" />
          Cuentas Bancarias (Transferencias)
        </h3>
        {!isAdding && (
          <Button onClick={() => setIsAdding(true)} size="sm">
            <Plus className="w-4 h-4 mr-1" /> Agregar cuenta
          </Button>
        )}
      </div>

      {isAdding && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {editingId ? 'Editar cuenta' : 'Nueva cuenta bancaria'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nombre del banco *</Label>
                <Input
                  value={formData.bank_name}
                  onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                  placeholder="Ej. BBVA, Santander, etc."
                />
              </div>
              <div className="space-y-2">
                <Label>Número de cuenta *</Label>
                <Input
                  value={formData.account_number}
                  onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
                  placeholder="Número de cuenta"
                />
              </div>
              <div className="space-y-2">
                <Label>CLABE</Label>
                <Input
                  value={formData.clabe}
                  onChange={(e) => setFormData({ ...formData, clabe: e.target.value })}
                  placeholder="CLABE interbancaria"
                  maxLength={18}
                />
              </div>
              <div className="space-y-2">
                <Label>Titular de la cuenta</Label>
                <Input
                  value={formData.account_holder}
                  onChange={(e) => setFormData({ ...formData, account_holder: e.target.value })}
                  placeholder="Nombre del titular"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={formData.is_default}
                onCheckedChange={(checked) => setFormData({ ...formData, is_default: checked })}
              />
              <Label className="cursor-pointer">Cuenta predeterminada</Label>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSubmit} disabled={loading}>
                <Check className="w-4 h-4 mr-1" /> {editingId ? 'Actualizar' : 'Guardar'}
              </Button>
              <Button variant="outline" onClick={resetForm}>
                <X className="w-4 h-4 mr-1" /> Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {accounts.map((account) => (
          <Card key={account.id} className={account.is_default ? 'border-blue-300' : ''}>
            <CardContent className="p-4">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold">{account.bank_name}</h4>
                    {account.is_default && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                        Predeterminada
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-600">Cuenta: {account.account_number}</p>
                  {account.clabe && (
                    <p className="text-sm text-slate-600">CLABE: {account.clabe}</p>
                  )}
                  {account.account_holder && (
                    <p className="text-sm text-slate-600">Titular: {account.account_holder}</p>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => startEdit(account)}>
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(account.id)}>
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {accounts.length === 0 && !isAdding && (
          <p className="text-center text-slate-500 py-8">
            No hay cuentas bancarias configuradas. Agrega una para aceptar transferencias.
          </p>
        )}
      </div>
    </div>
  );
};

export default BankAccountSettings;
