import React from 'react';

const PrintablePrescription = ({ prescription, customer }) => {
  if (!prescription) return null;

  const meds = Array.isArray(prescription.medications) && prescription.medications.length > 0
    ? prescription.medications
    : prescription.medication
      ? [{ medication: prescription.medication, dosage: prescription.dosage, frequency: prescription.frequency, duration: prescription.duration, notes: prescription.notes }]
      : [];

  const formatDateMX = (d) => {
    if (!d) return { day: '__', month: '__', year: '____' };
    const date = new Date(d);
    return {
      day: String(date.getDate()).padStart(2, '0'),
      month: String(date.getMonth() + 1).padStart(2, '0'),
      year: String(date.getFullYear()),
    };
  };

  const rxDate = formatDateMX(prescription.prescription_date || prescription.created_at);
  const nextDate = formatDateMX(prescription.next_appointment);

  const vitals = {
    edad: prescription.edad || customer?.date_of_birth ? calculateAge(customer.date_of_birth) : '',
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

  return (
    <div className="prescription-print-container">
      <style>{`
        @media print {
          @page { size: letter; margin: 0; }
          body * { visibility: hidden; }
          .prescription-print-container, .prescription-print-container * { visibility: visible; }
          .prescription-print-container { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
        .prescription-sheet {
          width: 8.5in;
          min-height: 5.5in;
          margin: 0 auto;
          padding: 0.35in;
          box-sizing: border-box;
          font-family: 'Times New Roman', Times, serif;
          position: relative;
          background: white;
        }
        .greek-border {
          border: 3px double #1a1a1a;
          padding: 0.25in;
          position: relative;
          display: flex;
          flex-direction: column;
          min-height: 5.3in;
        }
        .greek-border::before {
          content: '';
          position: absolute;
          top: 4px; left: 4px; right: 4px; bottom: 4px;
          border: 1px solid #1a1a1a;
          pointer-events: none;
        }
        .rx-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 0.15in;
          flex-shrink: 0;
        }
        .rx-logo {
          text-align: center;
          line-height: 1.1;
        }
        .rx-logo-farmacia {
          font-size: 11pt;
          letter-spacing: 6px;
          font-weight: 400;
        }
        .rx-logo-apolo {
          font-size: 28pt;
          font-weight: 900;
          letter-spacing: 4px;
          margin: 2px 0;
        }
        .rx-logo-line {
          width: 1.4in;
          height: 2px;
          background: #1a1a1a;
          margin: 3px auto;
        }
        .rx-logo-slogan {
          font-size: 7pt;
          letter-spacing: 1px;
          margin-top: 3px;
        }
        .rx-doctor-info {
          padding-top: 0.1in;
          font-size: 10pt;
          line-height: 1.8;
        }
        .rx-doctor-info label {
          font-weight: 600;
        }
        .rx-doctor-info .underline {
          display: inline-block;
          min-width: 1.8in;
          border-bottom: 1px solid #1a1a1a;
          margin-left: 4px;
        }
        .rx-body {
          display: flex;
          gap: 0.2in;
          margin-top: 0.1in;
          flex: 1;
          min-height: 0;
        }
        .rx-vitals {
          width: 1.3in;
          font-size: 9pt;
          line-height: 1.9;
          flex-shrink: 0;
        }
        .rx-vitals label {
          font-weight: 700;
          display: inline-block;
          width: 0.55in;
        }
        .rx-vitals .vline {
          display: inline-block;
          width: 0.6in;
          border-bottom: 1px solid #1a1a1a;
          margin-left: 2px;
          text-align: center;
          font-size: 9pt;
        }
        .rx-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }
        .rx-patient-header {
          display: flex;
          justify-content: space-between;
          font-size: 10pt;
          margin-bottom: 0.1in;
          flex-shrink: 0;
        }
        .rx-patient-header label {
          font-weight: 700;
        }
        .rx-patient-header .underline {
          display: inline-block;
          min-width: 2in;
          border-bottom: 1px solid #1a1a1a;
          margin-left: 4px;
        }
        .rx-medications {
          font-size: 11pt;
          line-height: 1.6;
          padding-left: 0.1in;
          flex: 1;
          overflow: hidden;
        }
        .rx-med-item {
          margin-bottom: 0.08in;
        }
        .rx-med-name {
          font-weight: 700;
          text-transform: uppercase;
        }
        .rx-med-detail {
          font-size: 10pt;
          padding-left: 0.15in;
        }
        .rx-next-appointment {
          margin-top: 0.15in;
          font-size: 9pt;
          display: flex;
          align-items: center;
          gap: 0.1in;
          flex-shrink: 0;
        }
        .rx-next-appointment label {
          font-weight: 700;
        }
        .rx-next-appointment .date-box {
          display: inline-block;
          width: 0.35in;
          border-bottom: 1px solid #1a1a1a;
          text-align: center;
        }
        .rx-footer {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-top: 0.15in;
          padding-top: 0.1in;
          border-top: 1px solid #ccc;
          font-size: 7.5pt;
          line-height: 1.5;
          flex-shrink: 0;
        }
        .rx-footer-col {
          display: flex;
          align-items: flex-start;
          gap: 6px;
          max-width: 2.2in;
        }
        .rx-footer-icon {
          width: 16px;
          height: 16px;
          flex-shrink: 0;
          margin-top: 1px;
        }
        .rx-footer strong {
          font-size: 7.5pt;
          display: block;
          margin-bottom: 1px;
        }
        .rx-folio {
          text-align: center;
          font-size: 9pt;
        }
        .rx-folio label {
          font-weight: 700;
          display: block;
        }
        .rx-folio .folio-number {
          font-size: 11pt;
          font-weight: 700;
          font-family: monospace;
        }
      `}</style>

      <div className="prescription-sheet">
        <div className="greek-border">
          {/* Header */}
          <div className="rx-header">
            <div className="rx-logo">
              <div className="rx-logo-farmacia">FARMACIA</div>
              <div className="rx-logo-apolo">APOLO</div>
              <div className="rx-logo-line" />
              <div className="rx-logo-slogan">CUIDAMOS DE TI, CUIDAMOS TU SALUD</div>
            </div>
            <div className="rx-doctor-info">
              <div><label>NOMBRE DE DOCTOR:</label><span className="underline">{prescription.doctor_name || ''}</span></div>
              <div><label>CÉDULA:</label><span className="underline">{prescription.doctor_license_number || ''}</span></div>
            </div>
          </div>

          {/* Body */}
          <div className="rx-body">
            {/* Vitals column */}
            <div className="rx-vitals">
              <div><label>EDAD:</label><span className="vline">{vitals.edad}</span></div>
              <div><label>PESO:</label><span className="vline">{vitals.peso}</span></div>
              <div><label>TALLA:</label><span className="vline">{vitals.talla}</span></div>
              <div><label>TEMP:</label><span className="vline">{vitals.temp}</span></div>
              <div><label>T/A:</label><span className="vline">{vitals.ta}</span></div>
              <div><label>FC:</label><span className="vline">{vitals.fc}</span></div>
              <div><label>FR:</label><span className="vline">{vitals.fr}</span></div>
              <div><label>So2%:</label><span className="vline">{vitals.so2}</span></div>
              <div><label>GLICEMIA:</label><span className="vline">{vitals.glicemia}</span></div>
              <div><label>ALERGIAS:</label><span className="vline">{vitals.alergias}</span></div>
            </div>

            {/* Main area — full width, no watermark */}
            <div className="rx-main">
              <div className="rx-patient-header">
                <div>
                  <label>NOMBRE:</label>
                  <span className="underline">{prescription.patient_name || customer?.full_name || ''}</span>
                </div>
                <div>
                  <label>FECHA:</label>
                  <span className="underline" style={{ minWidth: '0.8in', textAlign: 'center' }}>{rxDate.day}</span>
                  <span>/</span>
                  <span className="underline" style={{ minWidth: '0.8in', textAlign: 'center' }}>{rxDate.month}</span>
                  <span>/</span>
                  <span className="underline" style={{ minWidth: '0.8in', textAlign: 'center' }}>{rxDate.year}</span>
                </div>
              </div>

              <div className="rx-medications">
                {meds.map((med, i) => (
                  <div key={i} className="rx-med-item">
                    <div className="rx-med-name">{med.medication}</div>
                    <div className="rx-med-detail">
                      {med.dosage}{med.frequency && ` · ${med.frequency}`}{med.duration && ` · ${med.duration}`}
                    </div>
                    {med.notes && <div className="rx-med-detail" style={{ fontStyle: 'italic' }}>{med.notes}</div>}
                  </div>
                ))}
              </div>

              <div className="rx-next-appointment">
                <label>PRÓXIMA CITA:</label>
                <span className="date-box">{nextDate.day}</span>
                <span>/</span>
                <span className="date-box">{nextDate.month}</span>
                <span>/</span>
                <span className="date-box">{nextDate.year}</span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="rx-footer">
            <div className="rx-footer-col">
              <svg className="rx-footer-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              <div>
                <strong>AV. CENTENARIO 169, ESQ. COMETA 4,</strong>
                SAN ANTONIO ZOMEYUCAN, 53750,<br />
                NAUCALPAN DE JUÁREZ, MÉX.
              </div>
            </div>
            <div className="rx-footer-col">
              <svg className="rx-footer-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <div>
                <strong>HORARIO:</strong>
                LUNES A VIERNES<br />
                10 A 20 HRS.<br />
                SÁBADO<br />
                11 A 19 HRS.
              </div>
            </div>
            <div className="rx-footer-col">
              <svg className="rx-footer-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              <div>
                <strong>CONTACTO:</strong>
                55-2483-7003
              </div>
            </div>
            <div className="rx-folio">
              <label>FOLIO No.</label>
              <div className="folio-number">{prescription.prescription_number || ''}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

function calculateAge(dob) {
  if (!dob) return '';
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return String(age);
}

export default PrintablePrescription;
