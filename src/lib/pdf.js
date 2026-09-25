import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { buildRecetaQrText } from './cda';
import { formatAge } from './age';

const INCH = 72;

function formatDateMX(d) {
  if (!d) return { day: '__', month: '__', year: '____' };
  const date = new Date(d);
  return {
    day: String(date.getDate()).padStart(2, '0'),
    month: String(date.getMonth() + 1).padStart(2, '0'),
    year: String(date.getFullYear()),
  };
}

/**
 * Generate a native vector PDF of the prescription.
 * @param {Object} prescription — prescription record
 * @param {Object} customer   — customer record (optional)
 * @param {string} filename   — download filename
 */
export const downloadPrescriptionPDF = async (prescription, customer, filename = 'receta.pdf') => {
  if (!prescription) return;

  // ── Data ──────────────────────────────────────────────────────────
  const meds = Array.isArray(prescription.medications) && prescription.medications.length > 0
    ? prescription.medications
    : prescription.medication
      ? [{ medication: prescription.medication, dosage: prescription.dosage, frequency: prescription.frequency, duration: prescription.duration, notes: prescription.notes }]
      : [];

  const rxDate = formatDateMX(prescription.prescription_date || prescription.created_at);
  const nextDate = formatDateMX(prescription.next_appointment);

  const vitals = {
    edad: prescription.edad || formatAge(customer?.date_of_birth),
    peso: prescription.weight_kg || customer?.weight || '',
    talla: prescription.height_cm || customer?.height || '',
    temp: prescription.temperatura || '',
    ta: prescription.ta || '',
    fc: prescription.fc || '',
    fr: prescription.fr || '',
    so2: prescription.so2 || '',
    glicemia: prescription.glicemia || '',
    alergias: prescription.alergias || '',
  };

  // ── Layout constants ──────────────────────────────────────────────
  const PAGE_W = 8.5;
  const MARGIN = 0.35;
  const PAD = 0.25;
  const CONTENT_L = MARGIN + PAD;          // 0.60
  const CONTENT_R = PAGE_W - MARGIN - PAD; // 7.65
  const CONTENT_W = CONTENT_R - CONTENT_L; // 7.05

  const VIT_X = CONTENT_L;
  const VIT_LABEL_W = 0.48;
  const VIT_LINE_W = 0.45;
  const VIT_GAP = 0.18;

  const MAIN_X = CONTENT_L + 1.30;
  const MAIN_R = CONTENT_R;

  // ── Calculate dynamic height ──────────────────────────────────────
  // Base elements height
  const HEADER_H = 0.95;   // logo + doctor info
  const BODY_GAP = 0.15;   // gap after header
  const FOOTER_H_FULL = 0.90; // footer + padding
  const PATIENT_HDR_H = 0.35;
  const NEXT_APPT_H = 0.30;

  // Medication block height per med (detail fields joined on one wrapped
  // line, same as the print template)
  const MED_NAME_SIZE = 12;
  const MED_DETAIL_SIZE = 10;
  const MED_GAP = 0.10;
  const DETAIL_CHARS_PER_LINE = 75;
  let MED_BLOCK_H = 0;

  meds.forEach((med) => {
    let h = 0.20; // name line
    const detail = [med.dosage, med.via, med.frequency, med.duration].filter(Boolean).join(' · ');
    if (detail) h += Math.max(1, Math.ceil(detail.length / DETAIL_CHARS_PER_LINE)) * 0.15;
    if (med.notes) h += 0.15;
    MED_BLOCK_H += h + MED_GAP;
  });

  // Indicaciones box: always printed (blank room lets the doctor hand-write
  // on the printed sheet); grows with the typed text
  const indicaciones = (prescription.indicaciones || '').trim();
  const INDIC_MIN_H = 0.55;
  const indicEstLines = indicaciones ? Math.ceil(indicaciones.length / 80) : 0;
  const INDIC_BOX_H = Math.max(INDIC_MIN_H, 0.24 + indicEstLines * 0.16) + 0.10;

  // The receta must always fit a half letter sheet (media carta, 5.5in).
  // When content runs long, the footer (address / horario / contacto) is
  // compressed first; only if that alone is not enough, the body text
  // shrinks too. The sheet never grows past BASE_SHEET_H.
  const BASE_SHEET_H = 5.5;
  const SIG_H = 0.60;      // firma del médico block (line + name + cédula)
  const FOOTER_H_MIN = 0.52;
  const neededBodyH = HEADER_H + BODY_GAP + PATIENT_HDR_H + MED_BLOCK_H + INDIC_BOX_H + NEXT_APPT_H + SIG_H + 0.2;

  let scale = 1;
  let footerScale = 1;
  let footerH = FOOTER_H_FULL;
  const availFooter = BASE_SHEET_H - neededBodyH;
  if (availFooter < FOOTER_H_FULL) {
    if (availFooter >= FOOTER_H_MIN) {
      footerScale = availFooter / FOOTER_H_FULL;
      footerH = availFooter;
    } else {
      footerScale = FOOTER_H_MIN / FOOTER_H_FULL;
      footerH = FOOTER_H_MIN;
      scale = (BASE_SHEET_H - FOOTER_H_MIN - HEADER_H - BODY_GAP - PATIENT_HDR_H)
        / (neededBodyH - HEADER_H - BODY_GAP - PATIENT_HDR_H);
    }
  }
  const sheetH = BASE_SHEET_H;

  // ── Page setup ────────────────────────────────────────────────────
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'in', format: 'letter' });
  pdf.setTextColor(26, 26, 26);

  const setFont = (style, size) => { pdf.setFont('times', style); pdf.setFontSize(size * scale); };
  const tw = (s) => pdf.getTextWidth(s);
  const txt = (s, x, y, o = {}) => pdf.text(s, x, y, o);
  const line = (x1, y1, x2, y2) => pdf.line(x1, y1, x2, y2);

  // ── Greek border ──────────────────────────────────────────────────
  const bL = MARGIN;
  const bT = MARGIN;
  const bW = PAGE_W - 2 * MARGIN;
  const bH = sheetH;

  pdf.setDrawColor(26, 26, 26);
  pdf.setLineWidth((3 / INCH) * scale);
  pdf.rect(bL, bT, bW, bH);
  pdf.setLineWidth((1 / INCH) * scale);
  const innerOff = (4 / INCH) * scale;
  pdf.rect(bL + innerOff, bT + innerOff, bW - 2 * innerOff, bH - 2 * innerOff);

  // ── HEADER ────────────────────────────────────────────────────────
  const HEAD_Y = CONTENT_L;

  // Logo
  const LOGO_X = CONTENT_L + 0.8;
  setFont('normal', 11);
  txt('FARMACIA', LOGO_X, HEAD_Y + 0.12 * scale, { align: 'center' });
  setFont('bold', 28);
  txt('APOLO', LOGO_X, HEAD_Y + 0.42 * scale, { align: 'center' });
  pdf.setLineWidth((2 / INCH) * scale);
  line(LOGO_X - 0.70, HEAD_Y + 0.50 * scale, LOGO_X + 0.70, HEAD_Y + 0.50 * scale);
  setFont('normal', 7);
  txt('CUIDAMOS DE TI, CUIDAMOS TU SALUD', LOGO_X, HEAD_Y + 0.60 * scale, { align: 'center' });

  // Doctor info
  const DOC_X = CONTENT_R - 2.6;
  const DOC_Y = HEAD_Y + 0.15 * scale;
  const UNDER_W = 2.4;

  setFont('bold', 10);
  const lblDoc = 'NOMBRE DE DOCTOR:';
  txt(lblDoc, DOC_X, DOC_Y);
  setFont('normal', 10);
  const docValX = DOC_X + tw(lblDoc) + 0.03;
  txt(prescription.doctor_name || '', docValX, DOC_Y);
  // underline with clear gap below text baseline
  pdf.setLineWidth((1 / INCH) * scale);
  line(docValX, DOC_Y + 0.07 * scale, DOC_X + tw(lblDoc) + UNDER_W, DOC_Y + 0.07 * scale);

  const lblCed = 'CÉDULA:';
  setFont('bold', 10);
  txt(lblCed, DOC_X, DOC_Y + 0.28 * scale);
  setFont('normal', 10);
  const cedValX = DOC_X + tw(lblCed) + 0.03;
  txt(prescription.doctor_license_number || '', cedValX, DOC_Y + 0.28 * scale);
  line(cedValX, DOC_Y + 0.28 * scale + 0.07 * scale, DOC_X + tw(lblCed) + UNDER_W, DOC_Y + 0.28 * scale + 0.07 * scale);

  // ── Firma electrónica: verification QR near the signature area ──
  // (only when the receta was electronically signed; QR failure must
  // never block the PDF download)
  if (prescription.signature) {
    try {
      const qrDataUrl = await QRCode.toDataURL(buildRecetaQrText(prescription), { margin: 0, width: 160 });
      const QR_SIZE = 0.79; // ≈2cm
      const QR_X = LOGO_X + 1.0;
      const QR_Y = HEAD_Y;
      pdf.addImage(qrDataUrl, 'PNG', QR_X, QR_Y, QR_SIZE, QR_SIZE);
      setFont('normal', 5.5);
      const caption = pdf.splitTextToSize('Firma electrónica — Verifique la firma escaneando el código o en app.apolofarmacia.com.mx/verifica', QR_SIZE + 0.4);
      pdf.text(caption, QR_X + QR_SIZE / 2, QR_Y + QR_SIZE + 0.10 * scale, { align: 'center' });
    } catch { /* keep the PDF usable without the QR */ }
  }

  // ── BODY ──────────────────────────────────────────────────────────
  const BODY_Y = HEAD_Y + HEADER_H + BODY_GAP;

  // ── Vitals ──
  const vitalsList = [
    ['EDAD:', vitals.edad], ['PESO:', vitals.peso], ['TALLA:', vitals.talla],
    ['TEMP:', vitals.temp], ['T/A:', vitals.ta], ['FC:', vitals.fc],
    ['FR:', vitals.fr], ['So2%:', vitals.so2], ['GLICEMIA:', vitals.glicemia],
    ['ALERGIAS:', vitals.alergias],
  ].filter(([, value]) => value !== '' && value !== null && value !== undefined);

  vitalsList.forEach(([label, value], i) => {
    const y = BODY_Y + i * VIT_GAP * scale;
    setFont('bold', 8);
    txt(label, VIT_X, y);
    setFont('normal', 8);
    const valX = VIT_X + VIT_LABEL_W + 0.02;
    // Wrap long values (e.g. allergies) so they stay inside the vitals column
    const maxValW = MAIN_X - valX - 0.15;
    const wrapped = pdf.splitTextToSize(String(value || ''), maxValW);
    txt(wrapped, valX, y);
    // underline clearly below first line of text
    line(valX, y + 0.06 * scale, valX + VIT_LINE_W, y + 0.06 * scale);
  });

  // Vertical divider between vitals column and main area
  pdf.setLineWidth((1 / INCH) * scale);
  const DIV_X = MAIN_X - 0.12;
  line(DIV_X, BODY_Y - 0.10 * scale, DIV_X, BODY_Y + 10 * VIT_GAP * scale + 0.15);

  // ── Patient header ──
  const HDR_Y = BODY_Y;
  const NAME_UNDER_W = 2.6;

  setFont('bold', 10);
  const lblName = 'NOMBRE:';
  txt(lblName, MAIN_X, HDR_Y);
  setFont('normal', 10);
  const patientName = prescription.patient_name || customer?.full_name || '';
  const nameValX = MAIN_X + tw(lblName) + 0.03;
  txt(patientName, nameValX, HDR_Y);
  line(nameValX, HDR_Y + 0.07 * scale, nameValX + NAME_UNDER_W, HDR_Y + 0.07 * scale);

  // Date
  const DATE_X = MAIN_X + 3.4;
  setFont('bold', 10);
  const lblDate = 'FECHA:';
  txt(lblDate, DATE_X, HDR_Y);
  setFont('normal', 10);
  let dx = DATE_X + tw(lblDate) + 0.03;
  txt(rxDate.day, dx, HDR_Y);
  line(dx, HDR_Y + 0.07 * scale, dx + 0.28, HDR_Y + 0.07 * scale);
  dx += 0.32; txt('/', dx, HDR_Y); dx += 0.06;
  txt(rxDate.month, dx, HDR_Y);
  line(dx, HDR_Y + 0.07 * scale, dx + 0.28, HDR_Y + 0.07 * scale);
  dx += 0.32; txt('/', dx, HDR_Y); dx += 0.06;
  txt(rxDate.year, dx, HDR_Y);
  line(dx, HDR_Y + 0.07 * scale, dx + 0.42, HDR_Y + 0.07 * scale);

  // ── Medications ──
  let medY = BODY_Y + PATIENT_HDR_H;

  meds.forEach((med) => {
    // Name (bold, uppercase)
    setFont('bold', MED_NAME_SIZE);
    txt((med.medication || '').toUpperCase(), MAIN_X, medY);
    medY += 0.22 * scale;

    // Detail fields joined on one wrapped line (mirrors the print template)
    const detail = [med.dosage, med.via, med.frequency, med.duration].filter(Boolean).join(' · ');
    if (detail) {
      setFont('normal', MED_DETAIL_SIZE);
      const detailLines = pdf.splitTextToSize(detail, MAIN_R - MAIN_X - 0.15);
      txt(detailLines, MAIN_X + 0.15, medY);
      medY += detailLines.length * 0.16 * scale;
    }
    if (med.notes) {
      setFont('italic', MED_DETAIL_SIZE);
      const noteLines = pdf.splitTextToSize(med.notes, MAIN_R - MAIN_X - 0.15);
      txt(noteLines, MAIN_X + 0.15, medY);
      medY += noteLines.length * 0.16 * scale;
    }
    medY += MED_GAP * scale;
  });

  // ── Indicaciones: always-printed box (typed text or room to hand-write) ──
  medY += 0.05 * scale;
  const INDIC_X = MAIN_X;
  const INDIC_W = MAIN_R - MAIN_X;
  setFont('normal', 9);
  const indicWrapped = indicaciones ? pdf.splitTextToSize(indicaciones, INDIC_W - 0.20) : [];
  const indicBoxH = Math.max(INDIC_MIN_H, 0.24 + indicWrapped.length * 0.16) * scale;
  pdf.setLineWidth((1 / INCH) * scale);
  pdf.rect(INDIC_X, medY - 0.12 * scale, INDIC_W, indicBoxH);
  setFont('bold', 9);
  txt('INDICACIONES:', INDIC_X + 0.08, medY);
  if (indicWrapped.length > 0) {
    setFont('normal', 9);
    txt(indicWrapped, INDIC_X + 0.10, medY + 0.18 * scale);
  }
  medY += indicBoxH;

  // ── Next appointment ──
  medY += 0.12 * scale;
  const APPT_X = MAIN_X;
  setFont('bold', 9);
  const lblAppt = 'PRÓXIMA CITA:';
  txt(lblAppt, APPT_X, medY);
  setFont('normal', 9);
  let ax = APPT_X + tw(lblAppt) + 0.03;
  txt(nextDate.day, ax, medY);
  line(ax, medY + 0.07 * scale, ax + 0.22, medY + 0.07 * scale);
  ax += 0.26; txt('/', ax, medY); ax += 0.05;
  txt(nextDate.month, ax, medY);
  line(ax, medY + 0.07 * scale, ax + 0.22, medY + 0.07 * scale);
  ax += 0.26; txt('/', ax, medY); ax += 0.05;
  txt(nextDate.year, ax, medY);
  line(ax, medY + 0.07 * scale, ax + 0.35, medY + 0.07 * scale);

  // ── Signature block (mirrors PrintablePrescription) ──
  const FOOTER_Y = bT + bH - footerH + 0.05;
  const SIG_W = 2.0;
  const SIG_X = MAIN_R - SIG_W;
  const SIG_CX = SIG_X + SIG_W / 2;
  const SIG_LINE_Y = FOOTER_Y - 0.45 * scale;
  // E-signed recetas carry the same firma notice as the print template
  if (prescription.signature && prescription.signer_cert_serial) {
    setFont('normal', 7);
    txt('Firmada electrónicamente', SIG_CX, SIG_LINE_Y - 0.07 * scale, { align: 'center' });
  }
  pdf.setLineWidth((1 / INCH) * scale);
  line(SIG_X + 0.15, SIG_LINE_Y, SIG_X + SIG_W - 0.15, SIG_LINE_Y);
  setFont('bold', 7.5);
  txt('FIRMA DEL MÉDICO', SIG_CX, SIG_LINE_Y + 0.11 * scale, { align: 'center' });
  setFont('normal', 8);
  txt(prescription.doctor_name || '', SIG_CX, SIG_LINE_Y + 0.22 * scale, { align: 'center' });
  txt(`Céd. Prof. ${prescription.doctor_license_number || ''}`, SIG_CX, SIG_LINE_Y + 0.33 * scale, { align: 'center' });

  // ── FOOTER (compresses first when the receta runs long) ──
  const setFontF = (style, size) => { pdf.setFont('times', style); pdf.setFontSize(size * footerScale); };

  pdf.setDrawColor(180, 180, 180);
  pdf.setLineWidth((1 / INCH) * scale);
  line(CONTENT_L, FOOTER_Y - 0.06, CONTENT_R, FOOTER_Y - 0.06);
  pdf.setDrawColor(26, 26, 26);

  const F1_X = CONTENT_L;
  setFontF('bold', 7.5);
  txt('AV. CENTENARIO 169, ESQ. COMETA 4,', F1_X, FOOTER_Y);
  setFontF('normal', 7.5);
  txt('SAN ANTONIO ZOMEYUCAN, 53750,', F1_X, FOOTER_Y + 0.11 * footerScale);
  txt('NAUCALPAN DE JUÁREZ, MÉX.', F1_X, FOOTER_Y + 0.22 * footerScale);

  const F2_X = CONTENT_L + 2.2;
  setFontF('bold', 7.5);
  txt('HORARIO:', F2_X, FOOTER_Y);
  setFontF('normal', 7.5);
  txt('LUNES A VIERNES', F2_X, FOOTER_Y + 0.11 * footerScale);
  txt('10 A 20 HRS.', F2_X, FOOTER_Y + 0.22 * footerScale);
  txt('SÁBADO', F2_X, FOOTER_Y + 0.33 * footerScale);
  txt('11 A 19 HRS.', F2_X, FOOTER_Y + 0.44 * footerScale);

  const F3_X = CONTENT_L + 4.1;
  setFontF('bold', 7.5);
  txt('CONTACTO:', F3_X, FOOTER_Y);
  setFontF('normal', 7.5);
  txt('55-2483-7003', F3_X, FOOTER_Y + 0.11 * footerScale);

  // Folio + verification fragment stay full size so they remain readable
  // for manual verification (folio + fragment on /verifica).
  const FOLIO_X = CONTENT_R - 0.4;
  pdf.setFont('times', 'bold'); pdf.setFontSize(9);
  txt('FOLIO No.', FOLIO_X, FOOTER_Y, { align: 'center' });
  pdf.setFont('times', 'bold'); pdf.setFontSize(11);
  txt(prescription.prescription_number || '', FOLIO_X, FOOTER_Y + 0.18, { align: 'center' });

  // Firma electrónica: the same 32-char fragment encoded in the QR, printed
  // so a pharmacist can also verify manually (folio + fragment on /verifica).
  if (prescription.signature) {
    pdf.setFont('times', 'normal'); pdf.setFontSize(5.5);
    txt(
      `Verifique en app.apolofarmacia.com.mx/verifica — Folio: ${prescription.prescription_number || ''} · Fragmento de firma: ${prescription.signature.slice(0, 32)}`,
      bL + bW / 2,
      FOOTER_Y + 0.62 * footerScale,
      { align: 'center' }
    );
  }

  // ── Save ──
  pdf.save(filename);
};
