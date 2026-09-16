import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TrendingDown, Search, History } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { searchLostSaleItems, logLostSale } from '@/lib/db';

const LostSaleModal = ({ open, onOpenChange }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [itemName, setItemName] = useState('');
  const [note, setNote] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (!open) {
      setItemName('');
      setNote('');
      setSuggestions([]);
      return;
    }
    searchLostSaleItems('').then(setSuggestions).catch(console.error);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      searchLostSaleItems(itemName).then(setSuggestions).catch(console.error);
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [itemName, open]);

  const handleSubmit = async () => {
    if (!itemName.trim()) {
      toast({ title: 'Escribe qué pidió el cliente', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await logLostSale({ itemName, note, locationId: user?.locationId || null });
      toast({ title: 'Venta perdida registrada', description: itemName.trim() });
      setItemName('');
      setNote('');
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast({ title: 'Error al registrar', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const exactMatch = suggestions.some(s => s.toLowerCase() === itemName.trim().toLowerCase());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingDown className="w-5 h-5 text-red-500" />
            Venta perdida
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Registra lo que el cliente pidió y no teníamos, para saber qué ventas estamos perdiendo.
          </p>
          <div className="space-y-2">
            <Label htmlFor="lost-item">¿Qué pidió el cliente?</Label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                id="lost-item"
                placeholder="Ej. Consulta, Paracetamol 500mg..."
                value={itemName}
                onChange={e => setItemName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                className="pl-9"
                autoFocus
              />
            </div>
            {suggestions.length > 0 && (
              <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-44 overflow-y-auto">
                {suggestions.map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setItemName(s)}
                    className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors ${
                      itemName.trim().toLowerCase() === s.toLowerCase()
                        ? 'bg-apolo-navy/10 text-apolo-navy font-medium'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <History className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    {s}
                  </button>
                ))}
              </div>
            )}
            {itemName.trim() && !exactMatch && (
              <p className="text-xs text-slate-400">Se registrará como nuevo: “{itemName.trim()}”</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="lost-note">Nota (opcional)</Label>
            <Input
              id="lost-note"
              placeholder="Ej. Dr. fuera de oficina, sin existencias..."
              value={note}
              onChange={e => setNote(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            />
          </div>
          <Button onClick={handleSubmit} disabled={saving || !itemName.trim()} className="w-full bg-red-500 hover:bg-red-600">
            {saving ? 'Registrando...' : 'Registrar venta perdida'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LostSaleModal;
