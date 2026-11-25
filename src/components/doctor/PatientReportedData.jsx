import React, { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { getPatientReportedData } from '@/lib/db';

// "Registrado por el paciente, no verificado" (Aviso de Privacidad v3 §7)
// Health records the patient captured in the customer app, kept apart from
// clinical measurements (NOM-004): read-only here, never merged into the
// nota de evolución or signos vitales. RLS: clinical staff of the org.

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Mexico_City' }) : '—');
const fmtDay = (iso) => (iso ? new Date(iso).toLocaleDateString('es-MX', { dateStyle: 'medium', timeZone: 'America/Mexico_City' }) : '—');
const KIND_LABEL = {
  vital: 'Signos y medidas', lab: 'Laboratorio y estudios', vaccine: 'Vacunas', medicine: 'Medicamentos y recordatorios',
  goal: 'Metas de salud', food: 'Alimentación', steps: 'Pasos', sleep: 'Sueño',
};

// Human summary of one stored item (shape depends on the app screen that wrote it).
function describe(r) {
  const d = r.data || {};
  const it = d.item || {};
  const src = d.source || '';
  if (src === 'apolo:vitals') {
    if (it.type === 'glucosa') return `Glucosa ${it.value} mg/dL${it.fasting ? ' (ayuno)' : ''}`;
    if (it.type === 'presion') return `Presión ${it.sys}/${it.dia} mmHg`;
  }
  if (src === 'apolo:weights') return `Peso ${it.kg} kg`;
  if (src === 'apolo:meds') return `${it.name || 'Medicamento'}${(it.times || []).length ? ` · ${it.times.join(', ')}` : ''}`;
  if (src === 'apolo:doses') return `Tomas registradas: ${Object.keys(d.value || {}).length}`;
  if (src === 'apolo:steps') return `${Number(d.value || 0).toLocaleString('es-MX')} pasos`;
  if (src === 'apolo:sleep') { const m = Number(d.value || 0); return `Durmió ${Math.floor(m / 60)} h ${m % 60} min`; }
  const name = it.name || it.medicine || it.vaccine || it.title || it.examName || it.type || it.label || '';
  const value = it.value ?? it.result ?? it.dose ?? it.current ?? '';
  const unit = it.unit || '';
  const parts = [name, value !== '' ? `${value}${unit ? ' ' + unit : ''}` : ''].filter(Boolean);
  if (parts.length) return parts.join(': ');
  const flat = Object.entries(it).filter(([k, v]) => !/^id$|At$|^profileId$/.test(k) && v != null && typeof v !== 'object').slice(0, 4)
    .map(([k, v]) => `${k}: ${v}`).join(' · ');
  return flat || 'Registro';
}

const PatientReportedData = ({ customerId }) => {
  const [state, setState] = useState({ loading: true, error: null, records: [], emergency: null });
  const [open, setOpen] = useState({});

  useEffect(() => {
    if (!customerId) return;
    let alive = true;
    getPatientReportedData(customerId)
      .then((res) => alive && setState({ loading: false, error: null, ...res }))
      .catch((e) => alive && setState({ loading: false, error: e.message, records: [], emergency: null }));
    return () => { alive = false; };
  }, [customerId]);

  const byKind = {};
  state.records.forEach((r) => { (byKind[r.kind] = byKind[r.kind] || []).push(r); });
  const em = state.emergency;
  const hasEm = em && ((em.info && Object.keys(em.info).length) || (Array.isArray(em.contacts) && em.contacts.length));

  return (
    <section className="rounded-xl border border-amber-300 bg-amber-50/40 p-4 space-y-3" aria-labelledby="prd-title">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-5 h-5 text-amber-700 mt-0.5 flex-shrink-0" aria-hidden="true" />
        <div>
          <h3 id="prd-title" className="font-semibold text-slate-900">Registrado por el paciente, no verificado</h3>
          <p className="text-xs text-slate-600">Datos que el paciente capturó en la app Apolo. No son mediciones del personal de salud; corrobóralos antes de usarlos en una decisión clínica.</p>
        </div>
      </div>

      {state.loading && <p className="text-sm text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Cargando…</p>}
      {state.error && <p className="text-sm text-red-600">No se pudieron cargar: {state.error}</p>}
      {!state.loading && !state.error && !state.records.length && !hasEm && (
        <p className="text-sm text-slate-500">El paciente aún no ha registrado datos en la app.</p>
      )}

      {hasEm && (
        <div className="rounded-lg bg-white border border-slate-200 p-3 text-sm">
          <p className="font-medium text-slate-900 mb-1">Identificación de emergencia <span className="text-xs text-slate-500">(actualizada {fmtDate(em.updated_at)})</span></p>
          {em.info && Object.keys(em.info).length > 0 && (
            <ul className="text-slate-700 space-y-0.5">
              {Object.entries(em.info).filter(([, v]) => v != null && v !== '' && typeof v !== 'object').map(([k, v]) => <li key={k}><span className="text-slate-500">{k}:</span> {String(v)}</li>)}
            </ul>
          )}
          {Array.isArray(em.contacts) && em.contacts.length > 0 && (
            <p className="text-slate-700 mt-1"><span className="text-slate-500">Contactos:</span> {em.contacts.map((c) => [c.name, c.relationship, c.phone].filter(Boolean).join(' · ')).join(' | ')}</p>
          )}
        </div>
      )}

      {Object.keys(KIND_LABEL).filter((k) => byKind[k]).map((kind) => {
        const rows = byKind[kind];
        const shown = open[kind] ? rows : rows.slice(0, 5);
        return (
          <div key={kind} className="rounded-lg bg-white border border-slate-200 p-3">
            <div className="flex items-center justify-between">
              <p className="font-medium text-slate-900 text-sm">{KIND_LABEL[kind]} <span className="text-xs text-slate-500">({rows.length})</span></p>
              {rows.length > 5 && (
                <button type="button" className="text-xs text-apolo-navy flex items-center gap-1 min-h-[32px]" onClick={() => setOpen((o) => ({ ...o, [kind]: !o[kind] }))}>
                  {open[kind] ? <>Ver menos <ChevronUp className="w-3 h-3" /></> : <>Ver todo <ChevronDown className="w-3 h-3" /></>}
                </button>
              )}
            </div>
            <ul className="mt-1 divide-y divide-slate-100 text-sm">
              {shown.map((r) => (
                <li key={r.client_id} className="py-1.5 flex justify-between gap-3">
                  <span className="text-slate-800">{describe(r)}</span>
                  <span className="text-xs text-slate-500 whitespace-nowrap">{r.recorded_at ? (kind === 'vital' || kind === 'lab' ? fmtDate(r.recorded_at) : fmtDay(r.recorded_at)) : `act. ${fmtDay(r.updated_at)}`}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
};

export default PatientReportedData;
