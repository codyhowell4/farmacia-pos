import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Stethoscope, User, FileText, Calendar, MapPin, Phone, Search, Link2, Printer, FileDown } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { searchPrescriptionsPos } from '@/lib/db';
import { isAntibioticName } from '@/lib/antibiotics';
import PrintablePrescription from '@/components/doctor/PrintablePrescription';
import { downloadPrescriptionPDF } from '@/lib/pdf';

// Receta folios without evidentiary value are exempt from the duplicate-folio
// check — mirrors the exemptions in the DB trigger prescriptions_unique_folio.
const RX_FOLIO_PLACEHOLDERS = new Set(['', 'SN', 'S/N', 'SIN', 'SIN NUMERO', 'SIN NÚMERO', 'N/A', 'NA']);
const normalizeFolio = (value) => (value || '').trim().toUpperCase();
const isPlaceholderFolio = (value) => {
  const folio = normalizeFolio(value);
  return RX_FOLIO_PLACEHOLDERS.has(folio) || folio.startsWith('MANUAL-');
};

const CEDULA_RE = /^\d{6,8}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
// Vigencias: antibióticos 30 días (bloqueo), demás Rx 180 días (confirmación).
const ANTIBIOTIC_MAX_AGE_DAYS = 30;
const RX_WARN_AGE_DAYS = 180;

const PrescriptionModal = ({ 
  open, 
  onOpenChange, 
  cart = [], 
  onConfirm,
  finalTotal,
  paymentMethod,
  selectedCustomer = null,
  initialData = null,
}) => {
  const { toast } = useToast();
  const rxItems = cart.filter(item => item.requires_prescription);
  const cartHasAntibiotic = rxItems.some(item => isAntibioticName(item.name));
  
  const [formData, setFormData] = useState({
    patientName: '',
    patientCurp: '',
    patientPhone: '',
    patientEmail: '',
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
  const [printOpen, setPrintOpen] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [recetaRetenida, setRecetaRetenida] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Auto-fill from selected customer
  useEffect(() => {
    if (selectedCustomer) {
      setFormData(prev => ({
        ...prev,
        patientName: selectedCustomer.full_name || prev.patientName,
        patientCurp: selectedCustomer.curp || prev.patientCurp,
        patientPhone: selectedCustomer.phone || prev.patientPhone,
        patientEmail: selectedCustomer.email || prev.patientEmail,
      }));
    }
  }, [selectedCustomer]);

  // Pre-fill when editing an already-captured receta
  useEffect(() => {
    if (open && initialData) {
      setFormData({
        patientName: initialData.patient_name || '',
        patientCurp: initialData.patient_curp || '',
        patientPhone: initialData.patient_phone || '',
        patientEmail: initialData.patient_email || '',
        doctorName: initialData.doctor_name || '',
        doctorLicense: initialData.doctor_license_number || '',
        doctorAddress: initialData.doctor_office_address || '',
        doctorPhone: initialData.doctor_phone || '',
        prescriptionNumber: initialData.prescription_number || '',
        prescriptionDate: initialData.prescription_date || new Date().toISOString().split('T')[0],
      });
    }
  }, [open, initialData]);

  // Reset transient validation state each time the modal opens; the
  // receta-retenida flag defaults ON for antibiotic carts (editable).
  useEffect(() => {
    if (!open) return;
    setFieldErrors({});
    setSubmitting(false);
    setRecetaRetenida(initialData?.receta_retenida ?? cartHasAntibiotic);
  }, [open, cartHasAntibiotic, initialData]);

  const handleSearchPrescriptions = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const results = await searchPrescriptionsPos(searchQuery.trim());
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

  const handleSubmit = async () => {
    if (submitting) return;
    const errors = {};
    const missing = [];
    if (!formData.patientName?.trim()) missing.push('nombre del paciente');
    if (!formData.doctorName?.trim()) missing.push('nombre del médico');
    if (!formData.prescriptionNumber?.trim()) missing.push('número de receta');
    if (missing.length > 0) {
      toast({
        title: 'Campos requeridos',
        description: `Completa: ${missing.join(', ')}`,
        variant: 'destructive'
      });
      return;
    }

    // Cédula profesional: obligatoria, 6–8 dígitos (LGS 42 / RIS 27).
    const cedula = formData.doctorLicense.trim();
    if (!cedula) {
      errors.doctorLicense = 'La cédula profesional es obligatoria';
    } else if (!CEDULA_RE.test(cedula)) {
      errors.doctorLicense = 'La cédula profesional debe tener 6 a 8 dígitos';
    }

    // Fecha de la receta: obligatoria, nunca futura, y dentro de la vigencia
    // legal (antibióticos: 30 días — bloqueo; demás Rx: 180 días — aviso).
    const dateStr = formData.prescriptionDate;
    if (!dateStr) {
      errors.prescriptionDate = 'La fecha de la receta es obligatoria';
    } else {
      const rxDate = new Date(`${dateStr}T00:00:00`);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (Number.isNaN(rxDate.getTime())) {
        errors.prescriptionDate = 'Fecha inválida';
      } else if (rxDate > today) {
        errors.prescriptionDate = 'La fecha de la receta no puede ser futura';
      } else {
        const ageDays = Math.floor((today - rxDate) / DAY_MS);
        if (cartHasAntibiotic && ageDays > ANTIBIOTIC_MAX_AGE_DAYS) {
          errors.prescriptionDate = `Receta de antibiótico vencida: tiene ${ageDays} días y la vigencia es de ${ANTIBIOTIC_MAX_AGE_DAYS} días. No se puede surtir.`;
        } else if (!cartHasAntibiotic && ageDays > RX_WARN_AGE_DAYS) {
          const confirmed = window.confirm(
            `La receta tiene ${ageDays} días de antigüedad (más de ${RX_WARN_AGE_DAYS}). ` +
            'Confirma con el cliente que la receta sigue vigente antes de continuar. ¿Deseas registrarla así?'
          );
          if (!confirmed) return;
        }
      }
    }

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast({
        title: 'Revisa la receta',
        description: 'Hay campos con errores — corrígelos antes de guardar.',
        variant: 'destructive',
      });
      return;
    }

    const globalRx = formData.prescriptionNumber.trim();

    // Folio único por org: la receta vinculada reutiliza su propio folio y
    // los placeholders (S/N, MANUAL-…) están exentos — igual que el trigger
    // prescriptions_unique_folio, que es el último respaldo si esto falla.
    if (!linkedPrescription && !isPlaceholderFolio(globalRx)) {
      setSubmitting(true);
      try {
        const matches = await searchPrescriptionsPos(globalRx);
        const folio = normalizeFolio(globalRx);
        const duplicate = matches.find(r =>
          !r.is_voided && normalizeFolio(r.prescription_number) === folio
        );
        if (duplicate) {
          setFieldErrors({ prescriptionNumber: 'Este folio ya fue registrado en otra venta' });
          toast({
            title: 'Folio duplicado',
            description: 'Este folio ya fue registrado en otra venta',
            variant: 'destructive',
          });
          return;
        }
      } catch (err) {
        console.error('Folio availability check failed:', err);
        // Fail open here: the DB trigger enforces uniqueness at insert time
        // and surfaces as the same friendly message at checkout.
      } finally {
        setSubmitting(false);
      }
    }

    const itemRxNumbers = {};
    for (const item of rxItems) {
      itemRxNumbers[item.id] = globalRx;
    }

    const prescriptionData = {
      patient_name: formData.patientName.trim(),
      patient_curp: formData.patientCurp.trim() || null,
      patient_phone: formData.patientPhone.trim() || null,
      patient_email: formData.patientEmail.trim() || null,
      doctor_name: formData.doctorName.trim(),
      doctor_license_number: cedula,
      doctor_office_address: formData.doctorAddress.trim() || null,
      doctor_phone: formData.doctorPhone.trim() || null,
      prescription_number: globalRx,
      prescription_date: formData.prescriptionDate,
      receta_retenida: cartHasAntibiotic ? recetaRetenida : false,
      rx_item_numbers: itemRxNumbers,
      linked_prescription_id: linkedPrescription?.id || null,
    };

    onConfirm(prescriptionData);
  };

  const handleClose = () => {
    setFormData({
      patientName: selectedCustomer?.full_name || '',
      patientCurp: selectedCustomer?.curp || '',
      patientPhone: selectedCustomer?.phone || '',
      patientEmail: selectedCustomer?.email || '',
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
    setFieldErrors({});
    setRecetaRetenida(false);
    setSubmitting(false);
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
              <p className="font-semibold text-blue-800">Medicamentos con receta detectados</p>
              <p className="text-sm text-blue-600">
                Esta venta incluye {rxItems.length} medicamento(s) que requieren receta médica.
                Nombre del paciente, nombre del médico, cédula profesional y número de receta son obligatorios.
              </p>
              {cartHasAntibiotic && (
                <p className="text-sm text-amber-700 font-medium mt-1">
                  El carrito contiene un antibiótico: la receta debe tener máximo 30 días de vigencia y queda retenida en la farmacia.
                </p>
              )}
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
                Vinculada: <strong>{linkedPrescription.prescription_number}</strong> — {linkedPrescription.patient_name}
              </span>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" className="text-blue-600 h-6" onClick={() => setPrintOpen(true)}>
                  <Printer className="w-3.5 h-3.5 mr-1" /> Imprimir
                </Button>
                <Button size="sm" variant="ghost" className="text-red-600 h-6" onClick={clearLinkedPrescription}>
                  Quitar
                </Button>
              </div>
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
              <div className="space-y-2">
                <Label htmlFor="patientPhone">Teléfono</Label>
                <Input
                  id="patientPhone"
                  value={formData.patientPhone}
                  onChange={(e) => setFormData({ ...formData, patientPhone: e.target.value })}
                  placeholder="Opcional — registra al paciente como cliente"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="patientEmail">Email</Label>
                <Input
                  id="patientEmail"
                  type="email"
                  value={formData.patientEmail}
                  onChange={(e) => setFormData({ ...formData, patientEmail: e.target.value })}
                  placeholder="Opcional"
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
                  placeholder="6 a 8 dígitos"
                  inputMode="numeric"
                  maxLength={8}
                  className={fieldErrors.doctorLicense ? 'border-red-500' : ''}
                />
                {fieldErrors.doctorLicense && (
                  <p className="text-xs text-red-600">{fieldErrors.doctorLicense}</p>
                )}
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
                  className={fieldErrors.prescriptionNumber ? 'border-red-500' : ''}
                />
                {fieldErrors.prescriptionNumber && (
                  <p className="text-xs text-red-600">{fieldErrors.prescriptionNumber}</p>
                )}
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
                  max={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setFormData({ ...formData, prescriptionDate: e.target.value })}
                  className={fieldErrors.prescriptionDate ? 'border-red-500' : ''}
                />
                {fieldErrors.prescriptionDate && (
                  <p className="text-xs text-red-600">{fieldErrors.prescriptionDate}</p>
                )}
              </div>
            </div>

            {cartHasAntibiotic && (
              <div className="mt-4 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <input
                  type="checkbox"
                  id="recetaRetenida"
                  checked={recetaRetenida}
                  onChange={(e) => setRecetaRetenida(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-slate-300 accent-amber-600"
                />
                <Label htmlFor="recetaRetenida" className="text-sm cursor-pointer leading-snug">
                  Receta retenida en la farmacia
                  <span className="block text-xs text-amber-700 font-normal mt-0.5">
                    Antibióticos: la receta queda retenida en la farmacia como parte del control sanitario (LGS 42 / RIS 27).
                  </span>
                </Label>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <Button variant="outline" className="flex-1" onClick={handleClose}>
            Cerrar
          </Button>
          <Button 
            className="flex-1 bg-gradient-to-r from-apolo-green to-apolo-green-dark" 
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? 'Verificando folio…' : 'Guardar receta'}
          </Button>
        </div>

        {/* Print Preview — inline toggle, no nested Dialog */}
        {linkedPrescription && printOpen && (
          <div className="mt-4 border rounded-lg bg-white">
            <div className="flex items-center justify-between px-4 py-3 border-b bg-slate-50">
              <h3 className="font-semibold text-slate-900">Vista previa de receta</h3>
              <div className="flex items-center gap-2 no-print">
                <Button variant="outline" size="sm" onClick={() => setPrintOpen(false)}>
                  Volver
                </Button>
                <Button size="sm" variant="outline" onClick={() => downloadPrescriptionPDF(linkedPrescription, linkedPrescription?.customers, `Receta_${linkedPrescription?.prescription_number || 'sinfolio'}.pdf`)}>
                  <FileDown className="w-4 h-4 mr-2" /> Descargar PDF
                </Button>
                <Button size="sm" onClick={() => window.print()}>
                  <Printer className="w-4 h-4 mr-2" /> Imprimir
                </Button>
              </div>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              <PrintablePrescription
                prescription={linkedPrescription}
                customer={linkedPrescription.customers}
              />
            </div>
          </div>
        )}

        <p className="text-xs text-slate-500 text-center mt-4">
          Esta información es requerida por COFEPRIS y no puede ser modificada después de guardar.
          En caso de error, la venta deberá ser anulada.
        </p>
      </DialogContent>
    </Dialog>
  );
};

export default PrescriptionModal;
