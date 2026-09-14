# Normas Oficiales Mexicanas — Referencias

Links de referencia guardados para el portal médico y el expediente clínico electrónico (guardado 2026-09-11 a petición del usuario).

## NOM-004-SSA3-2012 — Del expediente clínico
https://sidof.segob.gob.mx/notas/docFuente/5272787

Qué exige para consulta ambulatoria (lo que captura nuestro flujo de consulta):
- **Nota de evolución (6.2):** evolución/actualización del cuadro clínico, signos vitales, resultados de estudios auxiliares de diagnóstico, diagnósticos o problemas clínicos, pronóstico, tratamiento e indicaciones (medicamentos: dosis, vía de administración y periodicidad).
- **Historia clínica (6.1):** interrogatorio (ficha de identificación, antecedentes heredo-familiares, personales patológicos y no patológicos, padecimiento actual, interrogatorio por aparatos y sistemas), exploración física (habitus, signos vitales: temp, TA, FC, FR + peso y talla), estudios, diagnósticos, pronóstico, indicación terapéutica.
- **Todas las notas (5.9–5.10):** nombre completo del paciente, edad, sexo, fecha y hora, nombre completo y firma de quien la elabora.
- **Conservación:** mínimo 5 años desde el último acto médico (5.4).
- **Cartas de consentimiento informado (10.1).**

Implementado en: `src/components/doctor/PostVisitDialog.jsx` (nota de evolución, append-only en `consulta_notes`), `NurseVitalsDialog.jsx` (signos vitales), `ConsentTab.jsx` (consentimientos).

## NOM-024-SSA3-2012 — Sistemas de información de registro electrónico para la salud
https://sidof.segob.gob.mx/notas/docFuente/5280847

Objetivos funcionales para Sistemas de Expediente Clínico Electrónico: interoperabilidad, confidencialidad, seguridad, estándares y catálogos (CIE-10).

Revisión existente del portal: `docs/DOCTOR_PORTAL_NOM024_REVIEW.md`.

## RESPUESTA a comentarios — PROY-NOM-024-SSA3-2010 → 2012
https://dof.gob.mx/nota_detalle_popup.php?codigo=5277740

Respuestas del Comité Consultivo a los comentarios del proyecto de modificación de NOM-024 (contexto/interpretación de la NOM-024-SSA3-2012).

## Firma electrónica y mensajes de datos (base legal del consentimiento digital)

Referencias usadas en el documento "Consentimiento de Firma Electrónica y Documentos Digitales"
(`public/customer-app/js/consentDocs.js`, tipo `firma_electronica`):

- **Código de Comercio, arts. 89, 89 Bis y 1205:** los mensajes de datos tienen la misma validez
  que los documentos escritos; requisitos de originalidad/integridad (89 Bis) y de atribución de
  la firma electrónica al firmante (1205).
- **Ley de Firma Electrónica Avanzada (art. 3):** requisitos de la firma electrónica avanzada
  (vinculación única al firmante, detección de alteraciones).
- **NOM-151-SCFI-2016:** requisitos para la conservación de mensajes de datos y digitalización
  de documentos (integridad y cadena de custodia).
- **NOM-004-SSA3-2012, numeral 5.10:** la firma del expediente puede ser autógrafa, electrónica
  o digital; 5.4: conservación mínima de 5 años desde el último acto médico.

Evidencia que captura el sistema por cada firma: `signer_name` (nombre completo), `signed_at`
(fecha y hora exactas) y el contenido íntegro del documento firmado, vinculados a la cuenta del
paciente (tabla `consent_documents`).
