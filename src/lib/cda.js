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
// Text encoded in the QR printed on electronically signed recetas.
// It carries the folio, a prefix of the signature and the signing
// certificate serial so the receta can be verified against the
// stored record.
export const buildRecetaQrText = (rx) =>
  `FOLIO:${rx.prescription_number || ''}|FIRMA:${(rx.signature || '').slice(0, 32)}...|CERT:${rx.signer_cert_serial || ''}`;

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

const VITAL_LABELS = [
  ['edad', 'Edad'],
  ['peso_kg', 'Peso (kg)'],
  ['talla_cm', 'Talla (cm)'],
  ['temperatura', 'Temperatura'],
  ['ta', 'T/A'],
  ['fc', 'FC'],
  ['fr', 'FR'],
  ['so2', 'So2%'],
  ['glicemia', 'Glicemia'],
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
// consulta note (NOM-004): recordTarget = patient, author =
// doctor, custodian = Farmacia Apolo, and one <section> per
// clinical section. Diagnósticos include CIE-10 coded entries
// (codeSystem 2.16.840.1.113883.6.3 = ICD-10).
export const buildConsultaCda = ({ note, customer, doctorName }) => {
  if (!note) return '';

  const patientName = customer?.full_name || 'Paciente';
  const curp = customer?.curp || '';
  const effectiveTime = note.created_at
    ? new Date(note.created_at).toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)
    : '';

  const vitalsText = formatVitals(note.vitals);
  const cie10 = Array.isArray(note.cie10_codes) ? note.cie10_codes : [];

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

  return `<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns="urn:hl7-org:v3">
  <typeId root="2.16.840.1.113883.1.3" extension="POCD_HD000040" />
  <id root="2.16.840.1.113883.3.2154" extension="${escapeXml(note.id || '')}" />
  <code code="34133-9" codeSystem="2.16.840.1.113883.6.1" codeSystemName="LOINC" displayName="Nota de evolución" />
  <title>Nota de evolución — Consulta</title>
  <effectiveTime value="${effectiveTime}" />
  <recordTarget>
    <patientRole>
      <id root="2.16.840.1.113883.4.1" extension="${escapeXml(curp)}" assigningAuthorityName="CURP" />
      <patient>
        <name>${escapeXml(patientName)}</name>
      </patient>
    </patientRole>
  </recordTarget>
  <author>
    <assignedAuthor>
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
  </custodian>
  <component>
    <structuredBody>
${section('Padecimiento actual', note.padecimiento_actual || '')}
${section('Exploración física', note.exploracion_fisica || '')}
${section('Signos vitales', vitalsText)}
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
