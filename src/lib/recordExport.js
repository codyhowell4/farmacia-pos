// Patient clinical-record PDF export (expediente clínico).
// Simple sectioned text layout: headings + wrapped lines, matching the
// jsPDF import style already used in src/lib/pdf.js.

import { jsPDF } from 'jspdf';

// Section titles mirror SECTIONS in PatientMedicalHistory.jsx
// (kept as a plain map so this lib has no component imports).
const HISTORY_SECTION_TITLES = {
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

const CONSENT_STATUS_LABELS = {
  pending: 'Pendiente',
  signed: 'Firmado',
  declined: 'Rechazado',
};

const CONSENT_TYPE_LABELS = {
  general: 'General',
  teleconsulta: 'Teleconsulta',
  procedimiento: 'Procedimiento',
  otro: 'Otro',
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

/**
 * Build the full clinical-record PDF for a patient.
 * @param {Object} args
 * @param {Object} args.customer       — customers row (incl. medical_history jsonb)
 * @param {Object} [args.history]      — medical_history object (defaults to customer.medical_history)
 * @param {Array}  [args.consultaNotes]— consulta_notes rows (with profiles join)
 * @param {Array}  [args.prescriptions]— prescriptions rows
 * @param {Array}  [args.consents]     — consent_documents rows
 * @returns {jsPDF} the document (not yet saved)
 */
export const buildPatientRecordPdf = ({
  customer,
  history = null,
  consultaNotes = [],
  prescriptions = [],
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
  field('Teléfono', customer?.phone);
  field('Email', customer?.email);
  if (customer?.height) field('Talla', `${customer.height} cm`);
  if (customer?.weight) field('Peso', `${customer.weight} kg`);
  if (customer?.notes) field('Notas', customer.notes);

  // ── Historia clínica ────────────────────────────────────────────────
  heading('Historia clínica');
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

  // ── Notas de consulta ───────────────────────────────────────────────
  heading('Notas de consulta');
  if (!consultaNotes.length) {
    line('Sin notas de consulta registradas.', { indent: 2 });
  } else {
    consultaNotes.forEach((n) => {
      checkPage(20);
      const doctor = n.profiles?.full_name || '';
      line(`${formatDateTime(n.created_at)}${doctor ? ` — ${doctor}` : ''}`, { bold: true, size: 11 });
      if (n.padecimiento_actual) field('Padecimiento actual', n.padecimiento_actual);
      if (n.diagnostico) field('Diagnóstico', n.diagnostico);
      const codes = Array.isArray(n.cie10_codes) ? n.cie10_codes : [];
      if (codes.length) {
        field('CIE-10', codes.map((c) => (c.description ? `${c.code} ${c.description}` : c.code)).join('; '));
      }
      if (n.plan) field('Plan', n.plan);
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
          ? [{ medication: rx.medication, dosage: rx.dosage, frequency: rx.frequency, duration: rx.duration, notes: rx.notes }]
          : [];
      meds.forEach((m) => {
        const parts = [m.medication, m.dosage, m.frequency, m.duration].filter(Boolean).join(' · ');
        line(`• ${parts}`, { indent: 4 });
        if (m.notes) line(`  ${m.notes}`, { indent: 6, size: 9 });
      });
      y += 2;
    });
  }

  // ── Consentimientos ─────────────────────────────────────────────────
  heading('Consentimientos informados');
  if (!consents.length) {
    line('Sin consentimientos registrados.', { indent: 2 });
  } else {
    consents.forEach((c) => {
      checkPage(12);
      const type = CONSENT_TYPE_LABELS[c.type] || c.type || '';
      const status = CONSENT_STATUS_LABELS[c.status] || c.status || '';
      line(`${c.title || 'Consentimiento'} (${type}) — ${status}`, { bold: true, size: 11 });
      line(`Creado: ${formatDate(c.created_at)}`, { indent: 4, size: 9 });
      if (c.status === 'signed') {
        line(`Firmado por: ${c.signer_name || '-'} — ${formatDateTime(c.signed_at)}`, { indent: 4, size: 9 });
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
