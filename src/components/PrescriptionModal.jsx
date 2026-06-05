import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Stethoscope, User, FileText, Calendar, MapPin, Phone, CreditCard } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const PrescriptionModal = ({ 
  open, 
  onOpenChange, 
  cart = [], 
  onConfirm,
  finalTotal,
  paymentMethod,
}) => {
  const { toast } = useToast();
  const rxItems = cart.filter(item => item.requires_prescription);
  
  const [formData, setFormData] = useState({
    // Patient
    patientName: '',
    patientCurp: '',
    
    // Doctor
    doctorName: '',
    doctorLicense: '', // Cedula profesional
    doctorAddress: '', // Domicilio del consultorio
    doctorPhone: '', // Telefono del medico
    
    // Prescription
    prescriptionNumber: '',
    prescriptionDate: new Date().toISOString().split('T')[0],
  });

  // Global prescription number is used for all controlled items (per COFEPRIS requirement)

  const handleSubmit = () => {
    // Validate all required fields
    const required = [
      { field: 'patientName', label: 'Nombre del paciente' },
      { field: 'doctorName', label: 'Nombre del médico' },
      { field: 'doctorLicense', label: 'Cédula profesional del médico' },
      { field: 'prescriptionNumber', label: 'Número de receta' },
      { field: 'prescriptionDate', label: 'Fecha de la receta' },
    ];

    for (const { field, label } of required) {
      if (!formData[field]?.trim()) {
        toast({ 
          title: 'Campo requerido', 
          description: `${label} es obligatorio`, 
          variant: 'destructive' 
        });
        return;
      }
    }

    // Use the single global prescription number for all Rx items
    const globalRx = formData.prescriptionNumber.trim();
    const itemRxNumbers = {};
    for (const item of rxItems) {
      itemRxNumbers[item.id] = globalRx;
    }

    // Build prescription data
    const prescriptionData = {
      patient_name: formData.patientName.trim(),
      patient_curp: formData.patientCurp.trim() || null,
      doctor_name: formData.doctorName.trim(),
      doctor_license_number: formData.doctorLicense.trim(),
      doctor_office_address: formData.doctorAddress.trim() || null,
      doctor_phone: formData.doctorPhone.trim() || null,
      prescription_number: globalRx,
      prescription_date: formData.prescriptionDate,
      rx_item_numbers: itemRxNumbers,
    };

    onConfirm(prescriptionData);
  };

  const handleClose = () => {
    // Reset form
    setFormData({
      patientName: '',
      patientCurp: '',
      doctorName: '',
      doctorLicense: '',
      doctorAddress: '',
      doctorPhone: '',
      prescriptionNumber: '',
      prescriptionDate: new Date().toISOString().split('T')[0],
    });

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
                Debes proporcionar la información completa antes de continuar.
              </p>
            </div>
          </div>
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
                <Label htmlFor="doctorName">Nombre completo *</Label>
                <Input
                  id="doctorName"
                  value={formData.doctorName}
                  onChange={(e) => setFormData({ ...formData, doctorName: e.target.value })}
                  placeholder="Dr. / Dra. Nombre Apellido"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="doctorLicense">Cédula profesional *</Label>
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
                <Label htmlFor="prescriptionNumber">Número de receta *</Label>
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
                  Fecha de la receta *
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
