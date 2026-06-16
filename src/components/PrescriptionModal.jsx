import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Stethoscope, User, FileText, Calendar, MapPin, Phone, Search, Link2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { searchPrescriptions, linkPrescriptionToSale } from '@/lib/db';

const PrescriptionModal = ({ 
  open, 
  onOpenChange, 
  cart = [], 
  onConfirm,
  finalTotal,
  paymentMethod,
  selectedCustomer = null,
}) => {
  const { toast } = useToast();
  const rxItems = cart.filter(item => item.requires_prescription);
  
  const [formData, setFormData] = useState({
    patientName: '',
    patientCurp: '',
    doctorName: '',
    doctorLicense: '',
    doctorAddress: '',
    doctorPhone: '',
    prescriptionNumber: '',
    prescriptionDate: new Date().toISOString().split('T')[0],
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [linkedPrescription, setLinkedPrescription] = useState(null);
  const [searching, setSearching] = useState(false);

  // Auto-fill from selected customer
  useEffect(() => {
    if (selectedCustomer) {
      setFormData(prev => ({
        ...prev,
        patientName: selectedCustomer.full_name || prev.patientName,
        patientCurp: selectedCustomer.curp || prev.patientCurp,
      }));
    }
  }, [selectedCustomer]);

  const handleSearchPrescriptions = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const results = await searchPrescriptions(searchQuery.trim());
      setSearchResults(results.filter(r => r.status === 'active'));
    } catch (err) {
      console.error(err);
    } finally {
      setSearching(false);
    }
  };

  const selectPrescription = (rx) => {
    setLinkedPrescription(rx);
    setFormData({
      patientName: rx.patient_name || '',
      patientCurp: rx.patient_curp || '',
      doctorName: rx.doctor_name || '',
      doctorLicense: rx.doctor_license_number || '',
      doctorAddress: rx.doctor_office_address || '',
      doctorPhone: rx.doctor_phone || '',
      prescriptionNumber: rx.prescription_number || '',
      prescriptionDate: rx.prescription_date || new Date().toISOString().split('T')[0],
    });
    setSearchResults([]);
    toast({ title: 'Receta vinculada', description: `Receta ${rx.prescription_number} seleccionada` });
  };

  const clearLinkedPrescription = () => {
    setLinkedPrescription(null);
    setFormData({
      patientName: selectedCustomer?.full_name || '',
      patientCurp: selectedCustomer?.curp || '',
      doctorName: '',
      doctorLicense: '',
      doctorAddress: '',
      doctorPhone: '',
      prescriptionNumber: '',
      prescriptionDate: new Date().toISOString().split('T')[0],
    });
  };

  const handleSubmit = () => {
    // Only patient name is required
    if (!formData.patientName?.trim()) {
      toast({ 
        title: 'Campo requerido', 
        description: 'El nombre del paciente es obligatorio', 
        variant: 'destructive' 
      });
      return;
    }

    const globalRx = formData.prescriptionNumber?.trim() || `MANUAL-${Date.now()}`;
    const itemRxNumbers = {};
    for (const item of rxItems) {
      itemRxNumbers[item.id] = globalRx;
    }

    const prescriptionData = {
      patient_name: formData.patientName.trim(),
      patient_curp: formData.patientCurp.trim() || null,
      doctor_name: formData.doctorName.trim() || null,
      doctor_license_number: formData.doctorLicense.trim() || null,
      doctor_office_address: formData.doctorAddress.trim() || null,
      doctor_phone: formData.doctorPhone.trim() || null,
      prescription_number: globalRx,
      prescription_date: formData.prescriptionDate,
      rx_item_numbers: itemRxNumbers,
      linked_prescription_id: linkedPrescription?.id || null,
    };

    onConfirm(prescriptionData);
  };

  const handleClose = () => {
    setFormData({
      patientName: selectedCustomer?.full_name || '',
      patientCurp: selectedCustomer?.curp || '',
      doctorName: '',
      doctorLicense: '',
      doctorAddress: '',
      doctorPhone: '',
      prescriptionNumber: '',
      prescriptionDate: new Date().toISOString().split('T')[0],
    });
    setLinkedPrescription(null);
    setSearchResults([]);
    setSearchQuery('');
    onOpenChange(false);
  };

  if (rxItems.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Stethoscope className="w-6 h-6 text-blue-600" />
            Información de Receta Médica
          </DialogTitle>
        </DialogHeader>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-blue-800">Medicamentos controlados detectados</p>
              <p className="text-sm text-blue-600">
                Esta venta incluye {rxItems.length} medicamento(s) que requieren receta médica. 
                Solo el nombre del paciente es obligatorio.
              </p>
            </div>
          </div>
        </div>

        {/* Prescription Search */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-4">
          <p className="text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
            <Link2 className="w-4 h-4" />
            Buscar receta existente
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="Número de receta, nombre del paciente..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearchPrescriptions()}
              className="flex-1"
            />
            <Button variant="outline" onClick={handleSearchPrescriptions} disabled={searching}>
              <Search className="w-4 h-4" />
            </Button>
          </div>
          {linkedPrescription && (
            <div className="mt-2 flex items-center justify-between bg-green-50 border border-green-200 rounded p-2">
              <span className="text-sm text-green-800">
                Vinculada: <strong>{linkedPrescription.prescription_number}</strong> — {linkedPrescription.medication}
              </span>
              <Button size="sm" variant="ghost" className="text-red-600 h-6" onClick={clearLinkedPrescription}>
                Quitar
              </Button>
            </div>
          )}
          {searchResults.length > 0 && (
            <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
              {searchResults.map(rx => (
                <button
                  key={rx.id}
                  onClick={() => selectPrescription(rx)}
                  className="w-full text-left p-2 rounded bg-white border hover:bg-blue-50 transition-colors text-sm"
                >
                  <span className="font-mono text-xs bg-slate-100 px-1 rounded">{rx.prescription_number}</span>
                  {' · '}
                  <span className="font-medium">{rx.medication}</span>
                  {' · '}
                  <span className="text-slate-500">{rx.customers?.full_name || rx.patient_name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          {/* Patient Information */}
          <div className="space-y-4">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2 border-b pb-2">
              <User className="w-4 h-4" />
              Información del Paciente
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="patientName">Nombre completo *</Label>
                <Input
                  id="patientName"
                  value={formData.patientName}
                  onChange={(e) => setFormData({ ...formData, patientName: e.target.value })}
                  placeholder="Nombre del paciente"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="patientCurp">CURP</Label>
                <Input
                  id="patientCurp"
                  value={formData.patientCurp}
                  onChange={(e) => setFormData({ ...formData, patientCurp: e.target.value })}
                  placeholder="CURP del paciente"
                  maxLength={18}
                />
              </div>
            </div>
          </div>

          {/* Doctor Information */}
          <div className="space-y-4">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2 border-b pb-2">
              <Stethoscope className="w-4 h-4" />
              Información del Médico
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="doctorName">Nombre completo</Label>
                <Input
                  id="doctorName"
                  value={formData.doctorName}
                  onChange={(e) => setFormData({ ...formData, doctorName: e.target.value })}
                  placeholder="Dr. / Dra. Nombre Apellido"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="doctorLicense">Cédula profesional</Label>
                <Input
                  id="doctorLicense"
                  value={formData.doctorLicense}
                  onChange={(e) => setFormData({ ...formData, doctorLicense: e.target.value })}
                  placeholder="Número de cédula profesional"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="doctorAddress" className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  Domicilio del consultorio
                </Label>
                <Input
                  id="doctorAddress"
                  value={formData.doctorAddress}
                  onChange={(e) => setFormData({ ...formData, doctorAddress: e.target.value })}
                  placeholder="Calle, número, colonia, ciudad, estado"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="doctorPhone" className="flex items-center gap-1">
                  <Phone className="w-3 h-3" />
                  Teléfono del médico
                </Label>
                <Input
                  id="doctorPhone"
                  value={formData.doctorPhone}
                  onChange={(e) => setFormData({ ...formData, doctorPhone: e.target.value })}
                  placeholder="Teléfono de contacto"
                />
              </div>
            </div>
          </div>

          {/* Prescription Information */}
          <div className="space-y-4">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2 border-b pb-2">
              <FileText className="w-4 h-4" />
              Información de la Receta
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="prescriptionNumber">Número de receta</Label>
                <Input
                  id="prescriptionNumber"
                  value={formData.prescriptionNumber}
                  onChange={(e) => setFormData({ ...formData, prescriptionNumber: e.target.value })}
                  placeholder="Número de folio de la receta"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prescriptionDate" className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Fecha de la receta
                </Label>
                <Input
                  id="prescriptionDate"
                  type="date"
                  value={formData.prescriptionDate}
                  onChange={(e) => setFormData({ ...formData, prescriptionDate: e.target.value })}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <Button variant="outline" className="flex-1" onClick={handleClose}>
            Cancelar venta
          </Button>
          <Button 
            className="flex-1 bg-gradient-to-r from-blue-500 to-indigo-600" 
            onClick={handleSubmit}
          >
            Continuar al pago
          </Button>
        </div>

        <p className="text-xs text-slate-500 text-center mt-4">
          Esta información es requerida por COFEPRIS y no puede ser modificada después de guardar.
          En caso de error, la venta deberá ser anulada.
        </p>
      </DialogContent>
    </Dialog>
  );
};

export default PrescriptionModal;
