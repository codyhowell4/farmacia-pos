import { jsPDF } from 'jspdf';

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

function calculateAge(dob) {
  if (!dob) return '';
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return String(age);
}

/**
 * Generate a native vector PDF of the prescription.
 * @param {Object} prescription — prescription record
 * @param {Object} customer   — customer record (optional)
 * @param {string} filename   — download filename
 */
export const downloadPrescriptionPDF = (prescription, customer, filename = 'receta.pdf') => {
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
    edad: prescription.edad || (customer?.date_of_birth ? calculateAge(customer.date_of_birth) : ''),
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
  const VIT_LABEL_W = 0.55;
  const VIT_LINE_W = 0.60;
  const VIT_GAP = 0.22;

  const MAIN_X = CONTENT_L + 1.55;
  const MAIN_R = CONTENT_R;

  // ── Calculate dynamic height ──────────────────────────────────────
  // Base elements height
  const HEADER_H = 0.95;   // logo + doctor info
  const BODY_GAP = 0.15;   // gap after header
  const FOOTER_H = 0.90;   // footer + padding
  const PATIENT_HDR_H = 0.35;
  const NEXT_APPT_H = 0.30;

  // Medication block height per med
  const medCount = meds.length;
  let MED_NAME_SIZE = 12;
  let MED_DETAIL_SIZE = 10;
  let MED_GAP = 0.10;
  let MED_BLOCK_H = 0;

  meds.forEach((med) => {
    let h = 0.20; // name line
    if (med.dosage) h += 0.15;
    if (med.frequency) h += 0.15;
    if (med.duration) h += 0.15;
    if (med.notes) h += 0.15;
    MED_BLOCK_H += h + MED_GAP;
  });

  // If too many meds, shrink font
  const BASE_SHEET_H = 5.5;
  const neededH = HEADER_H + BODY_GAP + PATIENT_HDR_H + MED_BLOCK_H + NEXT_APPT_H + FOOTER_H + 0.2;
  let sheetH = Math.max(BASE_SHEET_H, neededH);

  // Scale down if still too tall for letter page (11in - 2*margin = 10.3in usable)
  const MAX_H = 10.0;
  let scale = 1;
  if (sheetH > MAX_H) {
    scale = MAX_H / sheetH;
    sheetH = MAX_H;
  }

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

  // ── BODY ──────────────────────────────────────────────────────────
  const BODY_Y = HEAD_Y + HEADER_H + BODY_GAP;

  // ── Vitals ──
  const vitalsList = [
    ['EDAD:', vitals.edad], ['PESO:', vitals.peso], ['TALLA:', vitals.talla],
    ['TEMP:', vitals.temp], ['T/A:', vitals.ta], ['FC:', vitals.fc],
    ['FR:', vitals.fr], ['So2%:', vitals.so2], ['GLICEMIA:', vitals.glicemia],
    ['ALERGIAS:', vitals.alergias],
  ];

  vitalsList.forEach(([label, value], i) => {
    const y = BODY_Y + i * VIT_GAP * scale;
    setFont('bold', 9);
    txt(label, VIT_X, y);
    setFont('normal', 9);
    const valX = VIT_X + VIT_LABEL_W + 0.02;
    txt(String(value || ''), valX, y);
    // underline clearly below text
    line(valX, y + 0.07 * scale, valX + VIT_LINE_W, y + 0.07 * scale);
  });

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

    // Details on separate lines
    setFont('normal', MED_DETAIL_SIZE);
    if (med.dosage) {
      txt(med.dosage, MAIN_X + 0.15, medY);
      medY += 0.16 * scale;
    }
    if (med.frequency) {
      txt(med.frequency, MAIN_X + 0.15, medY);
      medY += 0.16 * scale;
    }
    if (med.duration) {
      txt(med.duration, MAIN_X + 0.15, medY);
      medY += 0.16 * scale;
    }
    if (med.notes) {
      setFont('italic', MED_DETAIL_SIZE);
      txt(med.notes, MAIN_X + 0.15, medY);
      setFont('normal', MED_DETAIL_SIZE);
      medY += 0.16 * scale;
    }
    medY += MED_GAP * scale;
  });

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

  // ── FOOTER ──
  const FOOTER_Y = bT + bH - 0.85;

  pdf.setDrawColor(180, 180, 180);
  pdf.setLineWidth((1 / INCH) * scale);
  line(CONTENT_L, FOOTER_Y - 0.06, CONTENT_R, FOOTER_Y - 0.06);
  pdf.setDrawColor(26, 26, 26);

  const F1_X = CONTENT_L;
  setFont('bold', 7.5);
  txt('AV. CENTENARIO 169, ESQ. COMETA 4,', F1_X, FOOTER_Y);
  setFont('normal', 7.5);
  txt('SAN ANTONIO ZOMEYUCAN, 53750,', F1_X, FOOTER_Y + 0.11 * scale);
  txt('NAUCALPAN DE JUÁREZ, MÉX.', F1_X, FOOTER_Y + 0.22 * scale);

  const F2_X = CONTENT_L + 2.2;
  setFont('bold', 7.5);
  txt('HORARIO:', F2_X, FOOTER_Y);
  setFont('normal', 7.5);
  txt('LUNES A VIERNES', F2_X, FOOTER_Y + 0.11 * scale);
  txt('10 A 20 HRS.', F2_X, FOOTER_Y + 0.22 * scale);
  txt('SÁBADO', F2_X, FOOTER_Y + 0.33 * scale);
  txt('11 A 19 HRS.', F2_X, FOOTER_Y + 0.44 * scale);

  const F3_X = CONTENT_L + 4.1;
  setFont('bold', 7.5);
  txt('CONTACTO:', F3_X, FOOTER_Y);
  setFont('normal', 7.5);
  txt('55-2483-7003', F3_X, FOOTER_Y + 0.11 * scale);

  const FOLIO_X = CONTENT_R - 0.4;
  setFont('bold', 9);
  txt('FOLIO No.', FOLIO_X, FOOTER_Y, { align: 'center' });
  setFont('bold', 11);
  txt(prescription.prescription_number || '', FOLIO_X, FOOTER_Y + 0.18 * scale, { align: 'center' });

  // ── Save ──
  pdf.save(filename);
};
