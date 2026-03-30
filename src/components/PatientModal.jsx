import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { User } from 'lucide-react';

// CURP format: 18 chars alphanumeric, Mexican standard
const CURP_REGEX = /^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[A-Z0-9]{2}$/;

const PatientModal = ({ open, onOpenChange, onConfirm }) => {
  const [name, setName] = useState('');
  const [curp, setCurp] = useState('');
  const [error, setError] = useState('');

  const handleConfirm = () => {
    if (!name.trim()) { setError('El nombre del paciente es obligatorio.'); return; }
    if (curp && !CURP_REGEX.test(curp.toUpperCase())) {
      setError('CURP inválido. Formato: 18 caracteres (ej. LOOA531113HTCPBN07).');
      return;
    }
    setError('');
    onConfirm({ name: name.trim(), curp: curp.toUpperCase().trim() || null });
    setName('');
    setCurp('');
  };

  const handleSkip = () => {
    setError('');
    setName('');
    setCurp('');
    onConfirm(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="w-4 h-4 text-blue-600" />Datos del paciente
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-slate-500">
          Esta venta contiene medicamentos con receta. Registre los datos del paciente.
        </p>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nombre completo del paciente <span className="text-red-500">*</span></Label>
            <Input
              placeholder="Ej. Juan Pérez García"
              value={name}
              onChange={e => { setName(e.target.value); setError(''); }}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>CURP <span className="text-slate-400 text-xs">(opcional)</span></Label>
            <Input
              placeholder="LOOA531113HTCPBN07"
              value={curp}
              onChange={e => { setCurp(e.target.value.toUpperCase()); setError(''); }}
              maxLength={18}
              className="uppercase"
            />
            <p className="text-xs text-slate-400">18 caracteres — Clave Única de Registro de Población</p>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={handleSkip}>
              Omitir
            </Button>
            <Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={handleConfirm}>
              Confirmar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PatientModal;
