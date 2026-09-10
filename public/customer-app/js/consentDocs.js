// ============================================================
// js/consentDocs.js - Standard consent documents (content module)
// ============================================================
// The three documents every signed-in user must accept before
// using the app (consent-onboarding gate in app.js). Loaded as a
// plain script before app.js; exposes window.APOLO_CONSENT_DOCS.
//
// Each document: { type, title, summary, content }
//   type    - stored in consent_documents.type
//   title   - stored in consent_documents.title
//   summary - one-line teaser shown above the scrollable card
//   content - full text the user signs (rendered with pre-wrap)
// ============================================================

window.APOLO_CONSENT_DOCS = [
  {
    type: 'privacidad',
    title: 'Aviso de Privacidad',
    summary: 'Cómo recabamos, usamos y protegemos tus datos personales y tus datos sensibles de salud (LFPDPPP y NOM-004-SSA3-2012).',
    content: `AVISO DE PRIVACIDAD — FARMACIA APOLO
Última actualización: septiembre 2026

1. RESPONSABLE DEL TRATAMIENTO DE TUS DATOS
Farmacia Apolo (en adelante "la Farmacia"), con domicilio en Cometa 4, San Antonio Zomeyucan, 53750 Naucalpan de Juárez, Estado de México, México, es la responsable del tratamiento de tus datos personales y de tus datos personales sensibles de salud, conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP), publicada en el Diario Oficial de la Federación el 20 de marzo de 2025, y, en materia de expediente clínico, a la NOM-004-SSA3-2012.

2. DATOS PERSONALES QUE RECABAMOS
Para la prestación de nuestros servicios recabamos: nombre completo, fecha de nacimiento y género; correo electrónico, teléfono y número de membresía; datos de contacto de emergencia; e información de compras y pedidos en la farmacia. Además, con tu consentimiento expreso, recabamos datos personales sensibles de salud: padecimiento actual, antecedentes y notas de consulta médica; diagnósticos, pronósticos, planes de tratamiento y recetas médicas; signos vitales, alergias, condiciones médicas y medicamentos actuales; métricas de salud registradas en la aplicación (peso, altura, sueño, ayuno, actividad física); y los documentos de consentimiento informado que firmes.

3. FINALIDADES DEL TRATAMIENTO
Finalidades primarias (necesarias): prestación de servicios de salud, incluyendo consulta médica general y teleconsulta; integración, resguardo y actualización de tu expediente clínico; despacho de medicamentos y gestión de pedidos de farmacia; agenda, recordatorios y seguimiento de citas médicas; y facturación, cobro y administración de tu membresía.
Finalidades secundarias (opcionales): envío de promociones, programas de lealtad y estadísticas internas de mejora del servicio. Si no deseas que tus datos sean tratados para estas finalidades secundarias, puedes manifestarlo en cualquier momento por los medios descritos en la sección 5.

4. TRANSFERENCIAS DE DATOS PERSONALES
Tus datos personales no serán transferidos a terceros sin tu consentimiento, salvo en los casos previstos por el artículo 36 de la LFPDPPP, incluyendo: (a) profesionales de la salud que participen en tu atención y que están obligados al secreto profesional; (b) autoridades sanitarias competentes cuando así lo exija la legislación aplicable; y (c) proveedores de servicios que actúan como encargados del tratamiento, bajo acuerdos de confidencialidad. Para operar la aplicación, la Farmacia se auxilia de proveedores de servicios que tratan tus datos por cuenta de la Farmacia y con las mismas protecciones previstas en este aviso y en la LFPDPPP: servicios de hospedaje de la información (con servidores ubicados en Estados Unidos), procesamiento de pagos (PayPal), envío de correos electrónicos y mensajes de WhatsApp, y el proveedor de videollamadas utilizado en la teleconsulta. Tus datos sensibles de salud se almacenan y tratan conforme a la NOM-004-SSA3-2012 del expediente clínico y solo el personal autorizado tiene acceso a ellos.

5. DERECHOS ARCO (ACCESO, RECTIFICACIÓN, CANCELACIÓN Y OPOSICIÓN)
Puedes ejercer tus derechos ARCO enviando una solicitud al correo citas@apolofarmacia.com.mx, o presentándola directamente en nuestro domicilio en Cometa 4, San Antonio Zomeyucan, 53750 Naucalpan de Juárez, Estado de México, México. Tu solicitud debe incluir tu nombre completo, el derecho que deseas ejercer y una descripción clara del dato respecto del cual lo ejerces. La Farmacia responderá en un plazo máximo de 20 días hábiles conforme a la LFPDPPP.

6. REVOCACIÓN DEL CONSENTIMIENTO
En cualquier momento puedes revocar el consentimiento que has otorgado para el tratamiento de tus datos personales, incluidos tus datos sensibles de salud, sin que se leguen efectos retroactivos. Para revocarlo, envía tu solicitud al correo citas@apolofarmacia.com.mx o preséntala en nuestro domicilio. Ten en cuenta que la revocación puede implicar que no sea posible seguir prestando los servicios de salud, teleconsulta o farmacia que requieran dichos datos.

7. CAMBIOS AL AVISO DE PRIVACIDAD
El presente aviso de privacidad puede sufrir modificaciones derivadas de nuevos requerimientos legales, mejoras de nuestros procesos o de nuestros servicios. Cualquier cambio será publicado en la sección "Aviso de privacidad" de la aplicación y, cuando el cambio sea significativo, te lo notificaremos a través de la aplicación o de tu correo electrónico registrado. La versión vigente indicará siempre su fecha de última actualización.

Al firmar este documento consientes el tratamiento de tus datos personales, incluidos tus datos sensibles de salud, conforme a este aviso.`
  },
  {
    type: 'general',
    title: 'Consentimiento Informado General',
    summary: 'Autorización para recibir atención médica general en el consultorio, conforme a la NOM-004-SSA3-2012 del expediente clínico.',
    content: `CONSENTIMIENTO INFORMADO GENERAL PARA ATENCIÓN MÉDICA EN CONSULTORIO
(conforme a la NOM-004-SSA3-2012 del Expediente Clínico)

1. DECLARACIÓN
Declaro, por mi propio derecho y en pleno uso de mis facultades, que solicito y acepto recibir atención médica general en el consultorio de Farmacia Apolo, y que he recibido información clara, veraz y suficiente sobre la naturaleza de los servicios que se me prestarán. Manifiesto que tuve oportunidad de hacer preguntas y que todas fueron respondidas a mi satisfacción.

2. SERVICIOS COMPRENDIDOS
Este consentimiento comprende la atención médica general ambulatoria, que puede incluir: integración de mi historia clínica y antecedentes; exploración física y toma de signos vitales; valoración, diagnóstico y pronóstico de mi estado de salud; prescripción de medicamentos y solicitud de estudios de gabinete o laboratorio cuando se indique; orientación médica, medidas preventivas y plan de tratamiento; así como la referencia a especialistas o a un nivel de atención superior cuando el médico tratante lo considere necesario.

3. RIESGOS Y BENEFICIOS GENERALES
Entiendo que la atención médica general tiene como beneficio esperado la detección oportuna, el tratamiento y el control de padecimientos comunes. Entiendo también que la práctica médica no es una ciencia exacta: pueden presentarse reacciones adversas a medicamentos, diagnósticos que requieran confirmación con estudios adicionales, o evoluciones no previstas del padecimiento. Me comprometo a informar al médico sobre alergias, medicamentos que tomo, embarazo o sospecha de embarazo, y cualquier otra condición relevante, y a seguir las indicaciones del tratamiento.

4. CONFIDENCIALIDAD Y EXPEDIENTE CLÍNICO
La información de mi atención se integrará a mi expediente clínico, el cual se resguarda conforme a la NOM-004-SSA3-2012 y al Aviso de Privacidad de la Farmacia. Solo el personal de salud autorizado y obligado al secreto profesional tendrá acceso a él.

5. DERECHO A REVOCAR EL CONSENTIMIENTO
Entiendo que puedo revocar este consentimiento en cualquier momento, manifestándolo al médico tratante o al personal de la Farmacia, sin que se leguen efectos retroactivos. La revocación puede implicar la suspensión de la atención médica que dependa de este consentimiento.

Al firmar este documento otorgo mi consentimiento informado para recibir atención médica general en el consultorio de Farmacia Apolo.`
  },
  {
    type: 'teleconsulta',
    title: 'Consentimiento para Teleconsulta',
    summary: 'Autorización para consultas médicas por videollamada, sus alcances, limitaciones y el tratamiento de los datos transmitidos.',
    content: `CONSENTIMIENTO INFORMADO PARA TELECONSULTA

1. NATURALEZA DE LA TELECONSULTA
La teleconsulta es una consulta médica realizada a distancia mediante videollamada, en la que el médico valora mi estado de salud, emite orientación, diagnóstico presuntivo y, cuando procede, receta o plan de tratamiento, sin exploración física directa. Acepto recibir atención por este medio y entiendo que el médico puede determinar, según su criterio profesional, que mi caso requiere atención presencial y canalizarme al consultorio o a otro nivel de atención.

2. LIMITACIONES — NO SUSTITUYE URGENCIAS
Entiendo y acepto que la teleconsulta NO sustituye la atención médica de urgencias ni la exploración física presencial. En caso de una emergencia (dolor torácico, dificultad respiratoria, sangrado abundante, pérdida de conciencia, reacción alérgica grave u otra condición que ponga en riesgo mi vida) debo llamar al 911 o acudir de inmediato al servicio de urgencias más cercano. Entiendo que la calidad de la valoración depende de la información que yo proporcione y de las condiciones técnicas de la conexión (video, audio e internet), y que fallas técnicas pueden interrumpir o limitar la consulta.

3. PRIVACIDAD DE LA VIDEOLLAMADA
Me comprometo a realizar la videollamada desde un lugar privado y seguro, y a informar al médico si hay otras personas presentes de mi lado. La Farmacia y el médico tratante realizarán la consulta desde un espacio que proteja la confidencialidad. La comunicación se realiza a través de canales provistos por la plataforma contratada por la Farmacia.

4. NO GRABACIÓN
Ni la Farmacia ni el médico grabarán la videollamada. De la misma manera, me comprometo a NO grabar, fotografiar ni difundir total o parcialmente la consulta sin autorización expresa del médico tratante. Lo que se documenta es la nota de consulta correspondiente en mi expediente clínico.

5. DATOS TRANSMITIDOS
Entiendo que durante la teleconsulta se transmiten y tratan mis datos de identificación, mi imagen y voz, así como datos sensibles de salud (síntomas, antecedentes, diagnósticos y recetas), conforme al Aviso de Privacidad de la Farmacia, la LFPDPPP y la NOM-004-SSA3-2012. La nota de la teleconsulta se integra a mi expediente clínico con las mismas medidas de confidencialidad.

6. DERECHO A REVOCAR
Puedo revocar este consentimiento en cualquier momento manifestándolo a la Farmacia, sin efectos retroactivos, entendiendo que ello impedirá seguir recibiendo atención por teleconsulta.

Al firmar este documento otorgo mi consentimiento informado para recibir atención médica mediante teleconsulta.`
  }
];
