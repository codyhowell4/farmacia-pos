import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { buildRecetaQrText } from '@/lib/cda';

const NAVY = '#1E2A8A';
const GREEN = '#2E9E7B';

const PrintablePrescription = ({ prescription, customer }) => {
  const [qrUrl, setQrUrl] = useState(null);

  // Signed recetas get a verification QR next to the signature area.
  // Generated async because QRCode.toDataURL returns a promise.
  const qrText = prescription?.signature ? buildRecetaQrText(prescription) : null;
  useEffect(() => {
    let cancelled = false;
    if (qrText) {
      QRCode.toDataURL(qrText, { margin: 0, width: 160, color: { dark: NAVY } })
        .then((url) => { if (!cancelled) setQrUrl(url); })
        .catch(() => { if (!cancelled) setQrUrl(null); });
    } else {
      setQrUrl(null);
    }
    return () => { cancelled = true; };
  }, [qrText]);

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
          height: 5.5in;
          margin: 0 auto;
          box-sizing: border-box;
          font-family: 'Century Gothic', 'Futura', 'Trebuchet MS', sans-serif;
          color: ${NAVY};
          position: relative;
          background: white;
          overflow: hidden;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .rx-frame-img {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
        }
        .rx-content {
          position: relative;
          height: 100%;
          box-sizing: border-box;
          padding: 0.38in 0.45in 0.3in;
          display: flex;
          flex-direction: column;
        }
        .rx-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 0.12in;
          flex-shrink: 0;
        }
        .rx-logo {
          text-align: center;
          line-height: 1.1;
          letter-spacing: 3px;
        }
        .rx-logo-farmacia {
          font-size: 10pt;
          letter-spacing: 6px;
          font-weight: 400;
        }
        .rx-logo-apolo {
          font-size: 26pt;
          font-weight: 700;
          letter-spacing: 5px;
          margin: 1px 0;
        }
        .rx-logo-divider {
          position: relative;
          width: 1.9in;
          height: 2px;
          background: ${NAVY};
          margin: 4px auto 5px;
        }
        .rx-logo-circle {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          width: 13px;
          height: 13px;
          border-radius: 50%;
          border: 2.5px solid ${GREEN};
          background: #fff;
          box-sizing: border-box;
        }
        .rx-logo-circle::after {
          content: '';
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: ${NAVY};
        }
        .rx-logo-slogan {
          font-size: 6.5pt;
          letter-spacing: 1.5px;
        }
        .rx-doctor-info {
          padding-top: 0.08in;
          font-size: 9.5pt;
          line-height: 1.9;
          letter-spacing: 1px;
        }
        .rx-doctor-info label {
          font-weight: 700;
        }
        .rx-doctor-info .underline {
          display: inline-block;
          min-width: 1.7in;
          border-bottom: 1px solid ${NAVY};
          margin-left: 4px;
        }
        .rx-header-right {
          display: flex;
          align-items: flex-start;
          gap: 0.12in;
        }
        .rx-caduceus {
          width: 0.5in;
          height: 0.68in;
          flex-shrink: 0;
          padding-top: 0.05in;
        }
        .rx-qr-block {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          padding-top: 0.05in;
          flex-shrink: 0;
        }
        .rx-qr-block img {
          width: 0.72in;
          height: 0.72in;
        }
        .rx-qr-caption {
          font-size: 5.5pt;
          text-align: center;
          max-width: 0.9in;
          line-height: 1.25;
        }
        .rx-body {
          display: flex;
          gap: 0.14in;
          margin-top: 0.06in;
          flex: 1;
          min-height: 0;
          position: relative;
        }
        .rx-vitals {
          width: 1.05in;
          font-size: 8pt;
          line-height: 1.75;
          flex-shrink: 0;
          border-right: 1px solid ${NAVY};
          padding-right: 0.08in;
          letter-spacing: 0.5px;
        }
        .rx-vitals label {
          font-weight: 700;
          display: inline-block;
          width: 0.55in;
          font-size: 7pt;
        }
        .rx-vitals .vline {
          display: inline-block;
          width: 0.4in;
          border-bottom: 1px solid ${NAVY};
          margin-left: 2px;
          text-align: center;
          font-size: 8pt;
          white-space: normal;
          vertical-align: bottom;
          line-height: 1.2;
        }
        .rx-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-height: 0;
          position: relative;
        }
        .rx-watermark {
          position: absolute;
          right: 0.05in;
          top: 0.35in;
          width: 2.9in;
          pointer-events: none;
        }
        .rx-patient-header {
          display: flex;
          justify-content: space-between;
          font-size: 9.5pt;
          margin-bottom: 0.12in;
          flex-shrink: 0;
          letter-spacing: 1px;
          position: relative;
        }
        .rx-patient-header label {
          font-weight: 700;
        }
        .rx-patient-header .underline {
          display: inline-block;
          min-width: 2in;
          border-bottom: 1px solid ${NAVY};
          margin-left: 4px;
        }
        .rx-medications {
          font-size: 11pt;
          line-height: 1.6;
          padding-left: 0.1in;
          flex: 1;
          overflow: hidden;
          position: relative;
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
          margin-top: 0.1in;
          font-size: 9pt;
          display: flex;
          align-items: center;
          gap: 0.1in;
          flex-shrink: 0;
          letter-spacing: 1px;
          position: relative;
        }
        .rx-next-appointment label {
          font-weight: 700;
        }
        .rx-next-appointment .date-box {
          display: inline-block;
          width: 0.35in;
          border-bottom: 1px solid ${NAVY};
          text-align: center;
        }
        .rx-footer {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-top: 0.1in;
          padding-top: 0.08in;
          border-top: 1px solid ${NAVY};
          font-size: 7pt;
          line-height: 1.5;
          flex-shrink: 0;
          letter-spacing: 0.5px;
        }
        .rx-footer-col {
          display: flex;
          align-items: flex-start;
          gap: 6px;
          max-width: 2.2in;
        }
        .rx-footer-icon {
          width: 15px;
          height: 15px;
          flex-shrink: 0;
          margin-top: 1px;
        }
        .rx-footer strong {
          font-size: 7pt;
          display: block;
          margin-bottom: 1px;
        }
        .rx-folio {
          text-align: center;
          font-size: 9pt;
          letter-spacing: 1px;
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
        <img className="rx-frame-img" src="/brand/receta-frame.png" alt="" />
        <div className="rx-content">
          {/* Header */}
          <div className="rx-header">
            <div className="rx-logo">
              <div className="rx-logo-farmacia">— FARMACIA —</div>
              <div className="rx-logo-apolo">APOLO</div>
              <div className="rx-logo-divider"><span className="rx-logo-circle" /></div>
              <div className="rx-logo-slogan">CUIDAMOS DE TI, CUIDAMOS TU SALUD</div>
            </div>
            <div className="rx-header-right">
              <div className="rx-doctor-info">
                <div><label>NOMBRE DE DOCTOR:</label><span className="underline">{prescription.doctor_name || ''}</span></div>
                <div><label>CÉDULA:</label><span className="underline">{prescription.doctor_license_number || ''}</span></div>
              </div>
              {prescription.signature && qrUrl && (
                <div className="rx-qr-block">
                  <img src={qrUrl} alt="QR de verificación de firma electrónica" />
                  <div className="rx-qr-caption">Firma electrónica — verifique con el folio</div>
                </div>
              )}
              <svg className="rx-caduceus" viewBox="0 0 48 64" fill="none" stroke={NAVY} strokeWidth="2" strokeLinecap="round">
                {/* wings */}
                <path d="M24 12 C18 3 8 3 4 9 C10 9 14 11 17 15 C12 15 8 18 7 22 C12 20 16 21 19 23" />
                <path d="M24 12 C30 3 40 3 44 9 C38 9 34 11 31 15 C36 15 40 18 41 22 C36 20 32 21 29 23" />
                {/* staff */}
                <circle cx="24" cy="6" r="2.6" />
                <line x1="24" y1="9" x2="24" y2="61" />
                {/* intertwined snakes */}
                <path d="M24 18 C15 22 33 26 24 30 C15 34 33 38 24 42 C15 46 31 50 24 54" />
                <path d="M24 18 C33 22 15 26 24 30 C33 34 15 38 24 42 C33 46 17 50 24 54" />
              </svg>
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
              <div><label>SO2%:</label><span className="vline">{vitals.so2}</span></div>
              <div><label>GLICEMIA:</label><span className="vline">{vitals.glicemia}</span></div>
              <div><label>ALERGIAS:</label><span className="vline">{vitals.alergias}</span></div>
            </div>

            {/* Main area with statue watermark */}
            <div className="rx-main">
              <img className="rx-watermark" src="/brand/receta-watermark.png" alt="" />
              <div className="rx-patient-header">
                <div>
                  <label>NOMBRE:</label>
                  <span className="underline">{prescription.patient_name || customer?.full_name || ''}</span>
                </div>
                <div>
                  <label>FECHA:</label>
                  <span className="underline" style={{ minWidth: '0.4in', textAlign: 'center' }}>{rxDate.day}</span>
                  <span>/</span>
                  <span className="underline" style={{ minWidth: '0.4in', textAlign: 'center' }}>{rxDate.month}</span>
                  <span>/</span>
                  <span className="underline" style={{ minWidth: '0.5in', textAlign: 'center' }}>{rxDate.year}</span>
                </div>
              </div>

              <div className="rx-medications">
                {meds.map((med, i) => (
                  <div key={i} className="rx-med-item">
                    <div className="rx-med-name">{med.medication}</div>
                    <div className="rx-med-detail">
                      {med.dosage}{med.via && ` · ${med.via}`}{med.frequency && ` · ${med.frequency}`}{med.duration && ` · ${med.duration}`}
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
