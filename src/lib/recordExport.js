// Patient clinical-record PDF export (expediente clínico completo, NOM-024 6.6.6).
// Simple sectioned text layout: headings + wrapped lines, matching the
// jsPDF import style already used in src/lib/pdf.js.

import { jsPDF } from 'jspdf';

// Section titles mirror SECTIONS in PatientMedicalHistory.jsx
// (kept as a plain map so this lib has no component imports).
export const HISTORY_SECTION_TITLES = {
  alergias: 'Alergias',
  patologicos: 'Antecedentes Patológicos',
  no_patologicos: 'Antecedentes No Patológicos',
  heredofamiliares: 'Antecedentes Heredofamiliares',
  gineco_obstetricos: 'Antecedentes Gineco-Obstétricos',
  vacunacion: 'Esquema de Vacunación',
  perinatales: 'Antecedentes Perinatales',
};

const RX_STATUS_LABELS = {
  active: 'Activa',
  fulfilled: 'Surtida',
  expired: 'Expirada',
  cancelled: 'Cancelada',
};

const APPT_STATUS_LABELS = {
  pending: 'Pendiente',
  confirmed: 'Confirmada',
  in_consulta: 'En consulta',
  completed: 'Completada',
  cancelled: 'Cancelada',
};

const CONSENT_STATUS_LABELS = {
  pending: 'Pendiente',
  signed: 'Firmado',
  declined: 'Rechazado',
  revoked: 'Revocado',
};

const CONSENT_TYPE_LABELS = {
  general: 'General',
  teleconsulta: 'Teleconsulta',
  procedimiento: 'Procedimiento',
  otro: 'Otro',
};

const DOC_TYPE_LABELS = {
  laboratorio: 'Laboratorio',
  imagen: 'Imagen',
  consentimiento: 'Consentimiento',
  justificante: 'Justificante',
  receta: 'Receta',
  nota_doctor: 'Nota del doctor',
  otro: 'Otro',
};

// Vitals jsonb keys → labels (shared with ConsultaNotesList). Keys prefixed
// with '_' in the jsonb are attribution metadata, never rendered as vitals.
export const VITALS_LABELS = {
  edad: 'Edad',
  height_cm: 'Talla (cm)',
  weight_kg: 'Peso (kg)',
  temperatura: 'Temp',
  ta: 'T/A',
  fc: 'FC',
  fr: 'FR',
  so2: 'So2%',
  glicemia: 'Glicemia',
  alergias: 'Alergias',
};

const formatDate = (ts) => {
  if (!ts) return '-';
  return new Date(ts).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatDateTime = (ts) => {
  if (!ts) return '-';
  const d = new Date(ts);
  return `${d.toLocaleDateString('es-MX')} ${d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`;
};

// Storage path is {orgId}/{customerId}/{ts}_{name} — show just the file name
const fileNameFromPath = (path) => {
  const base = (path || '').split('/').pop() || '';
  return base.replace(/^\d+_/, '');
};

const formatVitals = (vitals) => {
  if (!vitals || typeof vitals !== 'object') return null;
  const parts = Object.entries(VITALS_LABELS)
    .filter(([key]) => vitals[key] !== null && vitals[key] !== undefined && vitals[key] !== '')
    .map(([key, label]) => `${label}: ${vitals[key]}`);
  return parts.length ? parts.join(' · ') : null;
};

/**
 * Build the full clinical-record PDF for a patient (NOM-024 6.6.6: the export
 * must reproduce the complete expediente, not a subset).
 * @param {Object} args
 * @param {Object} args.customer       — customers row (incl. medical_history jsonb)
 * @param {Object} [args.history]      — medical_history object (defaults to customer.medical_history)
 * @param {Object} [args.historia]     — historia_clinica row (primera vez, NOM-004 6.1)
 * @param {Array}  [args.medicalNotes] — medical_notes rows (with profiles join)
 * @param {Array}  [args.consultaNotes]— consulta_notes rows (with profiles join)
 * @param {Array}  [args.prescriptions]— prescriptions rows
 * @param {Array}  [args.appointments] — appointments rows (with profiles join)
 * @param {Array}  [args.attachments]  — customer_documents rows (metadata index)
 * @param {Array}  [args.consents]     — consent_documents rows
 * @returns {jsPDF} the document (not yet saved)
 */
export const buildPatientRecordPdf = ({
  customer,
  history = null,
  historia = null,
  medicalNotes = [],
  consultaNotes = [],
  prescriptions = [],
  appointments = [],
  attachments = [],
  consents = [],
}) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });

  const PAGE_W = doc.internal.pageSize.getWidth();
  const PAGE_H = doc.internal.pageSize.getHeight();
  const MARGIN = 18;
  const CONTENT_W = PAGE_W - MARGIN * 2;
  let y = MARGIN;

  const checkPage = (needed = 8) => {
    if (y + needed > PAGE_H - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  };

  const line = (text, { bold = false, size = 10, indent = 0, gap = 5 } = {}) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    const wrapped = doc.splitTextToSize(String(text ?? ''), CONTENT_W - indent);
    wrapped.forEach((l) => {
      checkPage(gap);
      doc.text(l, MARGIN + indent, y);
      y += gap;
    });
  };

  const heading = (text) => {
    checkPage(14);
    y += 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(15, 118, 110); // teal-700
    doc.text(text, MARGIN, y);
    doc.setTextColor(0, 0, 0);
    y += 3;
    doc.setDrawColor(203, 213, 225);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += 6;
  };

  const field = (label, value) => {
    line(`${label}: ${value || '-'}`, { indent: 2 });
  };

  // ── Header ──────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Farmacia Apollo — Consultorio Médico', MARGIN, y);
  y += 7;
  doc.setFontSize(14);
  doc.text('EXPEDIENTE CLÍNICO', MARGIN, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Generado: ${formatDateTime(new Date())}`, MARGIN, y);
  y += 8;

  // ── Datos del paciente ──────────────────────────────────────────────
  heading('Datos del paciente');
  field('Nombre', customer?.full_name);
  field('CURP', customer?.curp);
  field('Sexo', customer?.sexo === 'M' ? 'Mujer' : customer?.sexo === 'H' ? 'Hombre' : null);
  field('Fecha de nacimiento', formatDate(customer?.date_of_birth));
  field('Entidad de nacimiento', customer?.birth_state);
  field('Domicilio', customer?.address);
  field('Teléfono', customer?.phone);
  field('Email', customer?.email);
  if (customer?.guardian_name) {
    field(
      'Tutor / responsable',
      `${customer.guardian_name}${customer.guardian_relationship ? ` (${customer.guardian_relationship})` : ''}${customer.guardian_id_ref ? ` — INE ${customer.guardian_id_ref}` : ''}`
    );
  }
  if (customer?.height) field('Talla', `${customer.height} cm`);
  if (customer?.weight) field('Peso', `${customer.weight} kg`);
  if (customer?.notes) field('Notas', customer.notes);

  // ── Historia clínica de primera vez (NOM-004 6.1) ───────────────────
  heading('Historia clínica de primera vez (NOM-004 6.1)');
  if (!historia) {
    line('Sin historia clínica de primera vez registrada.', { indent: 2 });
  } else {
    line(
      `Registrada: ${formatDateTime(historia.created_at)}${historia.profiles?.full_name ? ` — ${historia.profiles.full_name}` : ''}`,
      { bold: true, size: 11 }
    );
    field('Padecimiento actual', historia.padecimiento_actual);
    field('Interrogatorio por aparatos y sistemas', historia.interrogatorio_aparatos);
    field('Exploración física', historia.exploracion_fisica);
    field('Antecedentes (resumen)', historia.antecedentes_resumen);
    field('Diagnóstico', historia.diagnostico);
  }

  // ── Antecedentes (historial médico) ─────────────────────────────────
  heading('Antecedentes (historial médico)');
  const hist = history || customer?.medical_history || {};
  const sectionKeys = Object.keys(HISTORY_SECTION_TITLES);
  let anyEntry = false;
  sectionKeys.forEach((key) => {
    const entries = Array.isArray(hist[key]) ? hist[key] : [];
    if (entries.length === 0) return;
    anyEntry = true;
    line(HISTORY_SECTION_TITLES[key], { bold: true, size: 11 });
    entries.forEach((e) => {
      const denied = e.status === 'denied';
      const text = `• ${e.label}${e.value ? ` — ${e.value}` : ''}${denied ? ' (negado)' : ''}`;
      line(text, { indent: 4 });
    });
  });
  if (!anyEntry) line('Sin antecedentes registrados.', { indent: 2 });

  // ── Notas médicas ───────────────────────────────────────────────────
  heading('Notas médicas');
  if (!medicalNotes.length) {
    line('Sin notas médicas registradas.', { indent: 2 });
  } else {
    medicalNotes.forEach((n) => {
      checkPage(14);
      // author_name snapshot first (NOM-004 5.10) — the live profiles join
      // only fills rows that predate the snapshot column
      const author = n.author_name || n.profiles?.full_name || '';
      line(`${formatDateTime(n.created_at)}${author ? ` — ${author}` : ''}`, { bold: true, size: 11 });
      line(n.note || '', { indent: 4 });
      y += 2;
    });
  }

  // ── Notas de consulta (NOM-004 structured) ──────────────────────────
  heading('Notas de consulta');
  if (!consultaNotes.length) {
    line('Sin notas de consulta registradas.', { indent: 2 });
  } else {
    consultaNotes.forEach((n) => {
      checkPage(24);
      const doctor = n.author_name || n.profiles?.full_name || '';
      const modality = n.modality === 'video' ? ' — Teleconsulta' : '';
      line(`${formatDateTime(n.created_at)}${doctor ? ` — ${doctor}` : ''}${modality}`, { bold: true, size: 11 });
      if (n.modality === 'video') {
        field('Ubicación declarada del paciente', n.tele_patient_location);
        field('Identidad verificada', n.tele_identity_verified ? 'Sí' : 'No');
      }
      if (n.padecimiento_actual) field('Padecimiento actual', n.padecimiento_actual);
      if (n.exploracion_fisica) field('Exploración física', n.exploracion_fisica);
      // Vitals jsonb: '_' keys are attribution metadata (_negated/_recorded_by/
      // _edited_by), rendered as their own line, never as vital signs
      const vitalsText = formatVitals(n.vitals);
      if (n.vitals?._negated) field('Signos vitales', n.vitals._negated);
      else if (vitalsText) field('Signos vitales', vitalsText);
      const vitalsMeta = [
        n.vitals?._recorded_by ? `registrados por ${n.vitals._recorded_by}` : null,
        n.vitals?._edited_by ? `editados por ${n.vitals._edited_by}` : null,
      ].filter(Boolean).join(' · ');
      if (vitalsMeta) field('Signos — atribución', vitalsMeta);
      if (n.resultados_estudios) field('Resultados de estudios', n.resultados_estudios);
      if (n.diagnostico) field('Diagnóstico', n.diagnostico);
      const codes = Array.isArray(n.cie10_codes) ? n.cie10_codes : [];
      if (codes.length) {
        field('CIE-10', codes.map((c) => (c.description ? `${c.code} ${c.description}` : c.code)).join('; '));
      }
      if (n.pronostico) field('Pronóstico', n.pronostico);
      if (n.plan) field('Plan', n.plan);
      if (n.signed_at) {
        field(
          'Firma electrónica',
          `Firmada el ${formatDateTime(n.signed_at)}${n.signer_cert_serial ? ` — cert. ${n.signer_cert_serial}` : ''}`
        );
      }
      y += 2;
    });
  }

  // ── Recetas ─────────────────────────────────────────────────────────
  heading('Recetas médicas');
  if (!prescriptions.length) {
    line('Sin recetas registradas.', { indent: 2 });
  } else {
    prescriptions.forEach((rx) => {
      checkPage(16);
      const status = RX_STATUS_LABELS[rx.status] || rx.status || '';
      line(`${rx.prescription_number || 'Sin folio'} — ${formatDate(rx.created_at)} — ${status}`, { bold: true, size: 11 });
      const meds = Array.isArray(rx.medications) && rx.medications.length > 0
        ? rx.medications
        : rx.medication
          ? [{ medication: rx.medication, dosage: rx.dosage, via: rx.via, frequency: rx.frequency, duration: rx.duration, notes: rx.notes }]
          : [];
      meds.forEach((m) => {
        const parts = [m.medication, m.dosage, m.via ? `vía ${m.via}` : null, m.frequency, m.duration].filter(Boolean).join(' · ');
        line(`• ${parts}`, { indent: 4 });
        if (m.notes) line(`  ${m.notes}`, { indent: 6, size: 9 });
      });
      if (rx.alergias) field('Alergias', rx.alergias);
      if (rx.signed_at) {
        field(
          'Firma electrónica',
          `Firmada el ${formatDateTime(rx.signed_at)}${rx.signer_cert_serial ? ` — cert. ${rx.signer_cert_serial}` : ''}`
        );
      }
      y += 2;
    });
  }

  // ── Citas ───────────────────────────────────────────────────────────
  heading('Citas');
  if (!appointments.length) {
    line('Sin citas registradas.', { indent: 2 });
  } else {
    appointments.forEach((a) => {
      checkPage(8);
      const status = APPT_STATUS_LABELS[a.status] || a.status || '';
      const type = a.type === 'video' ? 'Teleconsulta' : 'Presencial';
      const doctor = a.profiles?.full_name ? ` — ${a.profiles.full_name}` : '';
      line(`• ${formatDateTime(a.appointment_date)} — ${type} — ${status}${doctor}`, { indent: 2 });
    });
  }

  // ── Adjuntos (índice) ───────────────────────────────────────────────
  heading('Documentos adjuntos (índice)');
  if (!attachments.length) {
    line('Sin documentos adjuntos.', { indent: 2 });
  } else {
    attachments.forEach((d) => {
      checkPage(8);
      const type = DOC_TYPE_LABELS[d.document_type] || d.document_type || 'Documento';
      const title = d.notes || fileNameFromPath(d.file_url) || 'Sin título';
      const status = d.status ? ` — ${d.status}` : '';
      line(`• ${title} (${type})${status} — ${formatDate(d.created_at)}`, { indent: 2 });
    });
  }

  // ── Consentimientos ─────────────────────────────────────────────────
  heading('Consentimientos informados');
  if (!consents.length) {
    line('Sin consentimientos registrados.', { indent: 2 });
  } else {
    consents.forEach((c) => {
      checkPage(14);
      const type = CONSENT_TYPE_LABELS[c.type] || c.type || '';
      const status = CONSENT_STATUS_LABELS[c.status] || c.status || '';
      line(`${c.title || 'Consentimiento'} (${type}) — ${status}`, { bold: true, size: 11 });
      line(`Creado: ${formatDate(c.created_at)}`, { indent: 4, size: 9 });
      // content_sha256 is trigger-computed at insert and immutable — it pins
      // the exact text the patient signed (integrity evidence, NOM-024)
      if (c.content_sha256) line(`SHA-256 del contenido: ${c.content_sha256}`, { indent: 4, size: 9 });
      if (c.status === 'signed') {
        const signer = [
          c.signer_name,
          c.signer_relationship ? `(${c.signer_relationship})` : null,
          c.signer_id_ref ? `INE ${c.signer_id_ref}` : null,
        ].filter(Boolean).join(' ');
        line(`Firmado por: ${signer || '-'} — ${formatDateTime(c.signed_at)}`, { indent: 4, size: 9 });
        if (c.signer_ip) line(`IP del firmante: ${c.signer_ip}`, { indent: 4, size: 9 });
        if (c.signer_user_agent) line(`Dispositivo: ${c.signer_user_agent}`, { indent: 4, size: 9 });
      }
      if (c.status === 'revoked' && c.revoked_at) {
        line(`Revocado: ${formatDateTime(c.revoked_at)}`, { indent: 4, size: 9 });
      }
      y += 2;
    });
  }

  // ── Footer on every page ────────────────────────────────────────────
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(
      `Expediente clínico de ${customer?.full_name || 'paciente'} — Página ${i} de ${pageCount}`,
      PAGE_W / 2,
      PAGE_H - 8,
      { align: 'center' }
    );
    doc.setTextColor(0, 0, 0);
  }

  return doc;
};

/**
 * Trigger the browser download of a built jsPDF document.
 * @param {jsPDF} doc
 * @param {string} filename
 */
export const triggerDownload = (doc, filename = 'expediente.pdf') => {
  if (!doc) return;
  doc.save(filename);
};
