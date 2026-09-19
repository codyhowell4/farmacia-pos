// ============================================================
// cda.js — Cadena original de recetas y documentos CDA (NOM-024)
// ============================================================

// ── CADENA ORIGINAL DE LA RECETA ────────────────────────────
// Deterministic canonical string that is cryptographically signed
// with the doctor's e.firma (FIEL). Format (pipe-separated,
// label-value pairs, no trimming/casing changes):
//
//   FOLIO|<prescription_number>|FECHA|<prescription_date>|
//   PACIENTE|<patient name>|CURP|<curp or ''>|
//   DOCTOR|<doctor_name>|CEDULA|<doctor_license_number or ''>|
//   MEDS|<med1 dosage1>;<med2 dosage2>;...
//
// Each med entry is `<medication> <dosage>` (dosage may be empty).
// Any change to this format invalidates previously generated
// signatures, so it must stay byte-for-byte stable.
export const buildRecetaCadena = (rx, customer) => {
  if (!rx) return '';

  const meds = Array.isArray(rx.medications) && rx.medications.length > 0
    ? rx.medications
    : rx.medication
      ? [{ medication: rx.medication, dosage: rx.dosage }]
      : [];

  const name = rx.patient_name || customer?.full_name || '';
  const curp = customer?.curp || '';

  const medsStr = meds
    .map((m) => `${m.medication || ''} ${m.dosage || ''}`.trim())
    .join(';');

  return (
    `FOLIO|${rx.prescription_number || ''}` +
    `|FECHA|${rx.prescription_date || ''}` +
    `|PACIENTE|${name}` +
    `|CURP|${curp}` +
    `|DOCTOR|${rx.doctor_name || ''}` +
    `|CEDULA|${rx.doctor_license_number || ''}` +
    `|MEDS|${medsStr}`
  );
};

// ── QR DE VERIFICACIÓN ──────────────────────────────────────
// URL encoded in the QR printed on electronically signed recetas.
// It points at the public verification page carrying the folio and
// the first 32 chars of the e.firma signature, so any pharmacist can
// confirm the receta against the stored signed record.
export const buildRecetaQrText = (rx) =>
  `https://app.apolofarmacia.com.mx/verifica/?f=${encodeURIComponent(rx?.prescription_number || '')}&s=${encodeURIComponent((rx?.signature || '').slice(0, 32))}`;

// ── XML HELPERS ─────────────────────────────────────────────

const escapeXml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const section = (title, text) => `    <section>
      <title>${escapeXml(title)}</title>
      <text>${escapeXml(text)}</text>
    </section>`;

// Keys of the vitals jsonb written by PostVisitDialog/NurseVitalsDialog.
// '_' keys (_negated/_recorded_by/_edited_by) are metadata and are never
// matched here, so they stay out of the rendered section.
const VITAL_LABELS = [
  ['edad', 'Edad'],
  ['height_cm', 'Talla (cm)'],
  ['weight_kg', 'Peso (kg)'],
  ['temperatura', 'Temperatura'],
  ['ta', 'T/A'],
  ['fc', 'FC'],
  ['fr', 'FR'],
  ['so2', 'So2%'],
  ['glicemia', 'Glicemia'],
  ['alergias', 'Alergias'],
];

const formatVitals = (vitals) => {
  if (!vitals || typeof vitals !== 'object') return '';
  return VITAL_LABELS
    .filter(([key]) => vitals[key] !== null && vitals[key] !== undefined && vitals[key] !== '')
    .map(([key, label]) => `${label}: ${vitals[key]}`)
    .join(', ');
};

// ── CDA R2-STYLE CONSULTA DOCUMENT (NOM-024) ────────────────
// Builds an HL7 CDA R2-style XML document for a structured
// consulta note (NOM-004): recordTarget = patient (CURP, sexo,
// birthTime, addr), author = doctor (cédula profesional as id),
// custodian = Farmacia Apolo, signed consent documents as
// <authorization><consent> entries, the consulta itself as
// <documentationOf><serviceEvent>, and one <section> per clinical
// section. Diagnósticos include CIE-10 coded entries
// (codeSystem 2.16.840.1.113883.6.3 = ICD-10).
//
// @param {Object} args.note            — consulta_notes row
// @param {Object} args.customer        — customers row (curp, sexo, date_of_birth, address)
// @param {string} args.doctorName      — prefer the note's author_name snapshot
// @param {string} [args.doctorLicense] — doctor_profiles.license_number (cédula profesional)
// @param {Array}  [args.consents]      — signed consent_documents rows ({id, type, title, signed_at})
export const buildConsultaCda = ({ note, customer, doctorName, doctorLicense = '', consents = [] }) => {
  if (!note) return '';

  const patientName = customer?.full_name || 'Paciente';
  const curp = customer?.curp || '';
  const toCdaTs = (ts) => (ts ? new Date(ts).toISOString().replace(/[-:T.Z]/g, '').slice(0, 14) : '');
  const effectiveTime = toCdaTs(note.created_at);

  // customers.sexo uses the Mexican convention 'H' (Hombre) / 'M' (Mujer);
  // HL7 administrativeGender codes are M / F / UN.
  const GENDER_MAP = { H: ['M', 'Hombre'], M: ['F', 'Mujer'], F: ['F', 'Mujer'], O: ['UN', 'Otro'] };
  const gender = GENDER_MAP[String(customer?.sexo || '').trim().toUpperCase()];
  const genderXml = gender
    ? `<administrativeGenderCode code="${gender[0]}" codeSystem="2.16.840.1.113883.5.1" displayName="${gender[1]}" />`
    : '<administrativeGenderCode nullFlavor="UNK" />';

  // date_of_birth ('YYYY-MM-DD') → CDA TS (YYYYMMDD)
  const dobRaw = String(customer?.date_of_birth || '').slice(0, 10);
  const birthTime = /^\d{4}-\d{2}-\d{2}$/.test(dobRaw) ? dobRaw.replace(/-/g, '') : '';

  // A declared "no se tomaron signos" negation renders as the section text
  const vitalsText = note.vitals?._negated || formatVitals(note.vitals);
  const cie10 = Array.isArray(note.cie10_codes) ? note.cie10_codes : [];

  const authorIdXml = doctorLicense
    ? `<id root="2.16.840.1.113883.3.2154" extension="${escapeXml(doctorLicense)}" assigningAuthorityName="Cédula Profesional" />`
    : '<id nullFlavor="NI" />';

  // One <authorization><consent> per signed consent document (aviso de
  // privacidad, consentimientos, firma electrónica). Content integrity is
  // pinned DB-side via the immutable trigger-computed content_sha256.
  const authorizationsXml = (Array.isArray(consents) ? consents : [])
    .map((c) => `  <authorization>
    <consent>
      <id root="2.16.840.1.113883.3.2154" extension="${escapeXml(c.id || '')}" />
      <code code="${escapeXml(c.type || '')}" codeSystem="2.16.840.1.113883.3.2154" displayName="${escapeXml(c.title || c.type || '')}" />${c.signed_at ? `
      <effectiveTime value="${toCdaTs(c.signed_at)}" />` : ''}
    </consent>
  </authorization>`)
    .join('\n');

  const diagnosticosSection = `    <section>
      <title>Diagnósticos</title>
      <text>${escapeXml(note.diagnostico || '')}</text>
      <entry>
        <observation>
${cie10
  .map(
    (c) => `          <code code="${escapeXml(c.code || '')}" codeSystem="2.16.840.1.113883.6.3" codeSystemName="CIE-10" displayName="${escapeXml(c.description || '')}" />`
  )
  .join('\n')}
        </observation>
      </entry>
    </section>`;

  // TODO[ORG]: replace with the official DGIS CURP OID once confirmed
  // against the DGIS OID catalog (also flagged inline in the generated XML).
  return `<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns="urn:hl7-org:v3">
  <typeId root="2.16.840.1.113883.1.3" extension="POCD_HD000040" />
  <id root="2.16.840.1.113883.3.2154" extension="${escapeXml(note.id || '')}" />
  <code code="34133-9" codeSystem="2.16.840.1.113883.6.1" codeSystemName="LOINC" displayName="Nota de evolución" />
  <title>Nota de evolución — Consulta</title>
  <effectiveTime value="${effectiveTime}" />
  <confidentialityCode code="N" codeSystem="2.16.840.1.113883.5.25" displayName="Normal" />
  <languageCode code="es-MX" />
  <setId root="2.16.840.1.113883.3.2154" extension="${escapeXml(note.id || '')}" />
  <versionNumber value="1" />
  <recordTarget>
    <patientRole>
      <!-- TODO[ORG]: replace with the official DGIS CURP OID once confirmed against the DGIS OID catalog -->
      <id root="2.16.840.1.113883.3.2154" extension="${escapeXml(curp)}" assigningAuthorityName="CURP" />${customer?.address ? `
      <addr use="HP"><streetAddressLine>${escapeXml(customer.address)}</streetAddressLine></addr>` : ''}
      <patient>
        <name>${escapeXml(patientName)}</name>
        ${genderXml}${birthTime ? `
        <birthTime value="${birthTime}" />` : ''}
      </patient>
    </patientRole>
  </recordTarget>
  <author>
    <assignedAuthor>
      ${authorIdXml}
      <assignedPerson>
        <name>${escapeXml(doctorName || '')}</name>
      </assignedPerson>
    </assignedAuthor>
  </author>
  <custodian>
    <assignedCustodian>
      <representedCustodianOrganization>
        <name>Farmacia Apolo</name>
      </representedCustodianOrganization>
    </assignedCustodian>
  </custodian>${authorizationsXml ? `
${authorizationsXml}` : ''}
  <documentationOf>
    <serviceEvent>
      <code code="11429006" codeSystem="2.16.840.1.113883.6.96" codeSystemName="SNOMED CT" displayName="Consulta" />
      <effectiveTime value="${effectiveTime}" />
    </serviceEvent>
  </documentationOf>
  <component>
    <structuredBody>
${section('Padecimiento actual', note.padecimiento_actual || '')}
${section('Exploración física', note.exploracion_fisica || '')}
${section('Resultados de estudios', note.resultados_estudios || '')}
${section('Signos vitales', vitalsText)}
${note.modality === 'video'
  ? section('Teleconsulta (NOM-027)', `Ubicación del paciente: ${note.tele_patient_location || '-'}\nIdentidad verificada: ${note.tele_identity_verified ? 'Sí' : 'No'}`)
  : ''}
${diagnosticosSection}
${section('Pronóstico', note.pronostico || '')}
${section('Plan', note.plan || '')}
    </structuredBody>
  </component>
</ClinicalDocument>`;
};

// Triggers a browser download of the CDA XML document.
export const downloadCda = (xml, filename = 'consulta_cda.xml') => {
  const blob = new Blob([xml], { type: 'text/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
