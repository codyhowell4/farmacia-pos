// ============================================================
// js/consentDocs.js - Standard consent documents (content module)
// ============================================================
// The four documents every signed-in user must accept before
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
Última actualización: noviembre 2026 (versión 3)

1. RESPONSABLE DEL TRATAMIENTO DE TUS DATOS
Farmacia Apolo (en adelante "la Farmacia"), con domicilio en Cometa 4, San Antonio Zomeyucan, 53750 Naucalpan de Juárez, Estado de México, México, es la responsable del tratamiento de tus datos personales y de tus datos personales sensibles de salud, conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP), publicada en el Diario Oficial de la Federación el 20 de marzo de 2025, y, en materia de expediente clínico, a la NOM-004-SSA3-2012.

2. DATOS PERSONALES QUE RECABAMOS
Para la prestación de nuestros servicios recabamos: nombre completo, fecha de nacimiento y género; correo electrónico, teléfono y número de membresía; datos de contacto de emergencia; e información de compras y pedidos en la farmacia.
Además, con tu consentimiento expreso, recabamos datos personales sensibles de salud: padecimiento actual, antecedentes y notas de consulta médica; diagnósticos, pronósticos, planes de tratamiento y recetas médicas; signos vitales, alergias, condiciones médicas y medicamentos actuales; los documentos de consentimiento informado que firmes; y los registros de salud que tú captures en la aplicación: peso, altura, presión arterial, glucosa, resultados de laboratorio y estudios, vacunas, medicamentos y recordatorios de toma, metas de salud, pasos y actividad física, sueño, ayuno, registro de alimentos y tu identificación médica de emergencia (tipo de sangre, alergias y condiciones relevantes).
Datos de terceros. Si registras contactos de emergencia (nombre, parentesco y teléfono) o perfiles de familiares, declaras que les informaste de este aviso y que cuentas con su autorización —o con la representación legal, en el caso de menores—. Los datos de tus contactos de emergencia se usan únicamente para comunicarnos con ellos en caso de una emergencia relacionada con tu salud y para mostrarlos en tu identificación médica de emergencia.

3. FINALIDADES DEL TRATAMIENTO
Finalidades primarias (necesarias): prestación de servicios de salud, incluyendo consulta médica general y teleconsulta; integración, resguardo y actualización de tu expediente clínico; registro y seguimiento de los datos de salud que captures en la aplicación y su consulta por el médico que te atienda, como apoyo para tu atención; despacho de medicamentos y gestión de pedidos de farmacia; agenda, recordatorios y seguimiento de citas médicas; y facturación, cobro y administración de tu membresía.
Finalidades secundarias (opcionales): envío de promociones; programa de lealtad Monedas Apolo; y estadísticas internas de mejora del servicio, incluida la medición del uso de la aplicación con Google Analytics (sección 8).
Desde el momento de la recolección puedes negarte a estas finalidades secundarias sin que por ello se te niegue el servicio: al crear tu cuenta o firmar tus documentos de consentimiento, la aplicación muestra una casilla independiente y opcional ("Acepto el uso de mis datos para finalidades secundarias"); si no la marcas, tus datos no se tratarán para finalidades secundarias. También puedes cambiar tu decisión en cualquier momento en la sección "Privacidad y mis datos" de la aplicación o por los medios descritos en la sección 5.
Monedas Apolo requiere, además, que lo actives dentro de la aplicación. Para otorgarte Monedas registramos únicamente que cumpliste una meta (por ejemplo, "meta de pasos" o "medicina a tiempo") y la fecha; no registramos para este programa tus valores de salud ni los nombres de tus medicamentos.

4. TRANSFERENCIAS DE DATOS PERSONALES Y ENCARGADOS
Tus datos personales no serán transferidos a terceros sin tu consentimiento, salvo en los casos previstos por el artículo 36 de la LFPDPPP, incluyendo: (a) profesionales de la salud que participen en tu atención y que están obligados al secreto profesional; (b) autoridades sanitarias competentes cuando así lo exija la legislación aplicable; y (c) proveedores de servicios que actúan como encargados del tratamiento, bajo acuerdos de confidencialidad.
Para operar la aplicación, la Farmacia se auxilia de los siguientes encargados, que tratan tus datos por cuenta del responsable y con las mismas protecciones previstas en este aviso y en la LFPDPPP: Supabase (base de datos y almacenamiento, donde se guardan tu expediente y los registros de salud que captures en la aplicación), Daily.co (plataforma de videoconsulta), Resend (correo electrónico transaccional), Meta Platforms / WhatsApp (mensajería), Stripe (procesamiento de pagos), Cloudflare (hospedaje y red de entrega de contenido) y Google LLC (Google Analytics, medición de uso de la aplicación, solo si aceptaste las finalidades secundarias). Algunos de estos encargados tratan datos en servidores ubicados en Estados Unidos.
Tus datos sensibles de salud se almacenan y tratan conforme a la NOM-004-SSA3-2012 del expediente clínico, viajan cifrados y solo el personal autorizado tiene acceso a ellos.

5. DERECHOS ARCO (ACCESO, RECTIFICACIÓN, CANCELACIÓN Y OPOSICIÓN)
Puedes ejercer tus derechos ARCO desde la sección "Privacidad y mis datos" de la aplicación, enviando una solicitud al correo citas@apolofarmacia.com.mx, o presentándola directamente en nuestro domicilio en Cometa 4, San Antonio Zomeyucan, 53750 Naucalpan de Juárez, Estado de México, México. Tu solicitud debe incluir tu nombre completo, el derecho que deseas ejercer y una descripción clara del dato respecto del cual lo ejerces. La Farmacia responderá en un plazo máximo de 20 días hábiles conforme a la LFPDPPP.
La cancelación de tus datos personales no procederá respecto de la información que deba conservarse para cumplir obligaciones legales — en particular tu expediente clínico, que se conserva al menos 5 años a partir de tu último acto médico conforme a la NOM-004-SSA3-2012 (numeral 5.4). En ese supuesto, tus datos quedarán bloqueados y no se tratarán para finalidad distinta de su conservación, hasta que concluya el plazo legal y proceda su supresión.

6. REVOCACIÓN DEL CONSENTIMIENTO
En cualquier momento puedes revocar el consentimiento que has otorgado para el tratamiento de tus datos personales, incluidos tus datos sensibles de salud, sin que se le atribuyan efectos retroactivos. Para revocarlo, usa la opción "Revocar consentimientos" de la sección "Privacidad y mis datos" de la aplicación, envía tu solicitud al correo citas@apolofarmacia.com.mx o preséntala en nuestro domicilio. Ten en cuenta que la revocación puede implicar que no sea posible seguir prestando los servicios de salud, teleconsulta o farmacia que requieran dichos datos, mismos que se pausarán hasta que firmes los documentos de nuevo.

7. REGISTROS DE SALUD EN LA APLICACIÓN, ALMACENAMIENTO Y NOTIFICACIONES
Los registros de salud que captures en la aplicación (peso, altura, presión arterial, glucosa, resultados de laboratorio y estudios, vacunas, medicamentos y recordatorios, metas, pasos y actividad física, sueño, ayuno, alimentos e identificación médica de emergencia con tus contactos) se guardan en nuestros servidores, asociados a tu cuenta, para que no se pierdan si cambias de teléfono y para que el médico que te atienda pueda consultarlos. Solo tú y el personal de salud autorizado de la Farmacia (médicos y personal clínico, según su función) tienen acceso a ellos. En tu expediente se muestran identificados como "Registrado por el paciente, no verificado", para distinguirlos de las mediciones realizadas por personal de salud; cuando se consultan para tu atención forman parte de tu expediente clínico y se conservan conforme a la sección 5.
Si antes de esta versión guardaste registros únicamente en tu teléfono, al aceptar este aviso la aplicación los enviará a tu cuenta. La aplicación puede conservar una copia temporal en tu dispositivo para funcionar con rapidez; esa copia se borra al cerrar sesión. Cualquier persona con acceso a tu dispositivo con la sesión abierta podría ver tus registros.
Asimismo, si aceptas las notificaciones, la aplicación puede enviarte notificaciones push (recordatorios de citas, de medicamentos y avisos del servicio), cuyo texto puede ser visible en la pantalla de bloqueo de tu dispositivo. Puedes desactivarlas en cualquier momento desde la sección "Notificaciones" de la aplicación o en la configuración de notificaciones de tu navegador o dispositivo.

8. COOKIES Y MEDICIÓN DE USO (GOOGLE ANALYTICS)
La aplicación usa almacenamiento local y cookies propias necesarias para mantener tu sesión y funcionar; no es posible desactivarlas sin dejar de usar la aplicación.
Solo si iniciaste sesión y aceptaste las finalidades secundarias, la aplicación usa además Google Analytics, un servicio de Google LLC que coloca cookies de medición (por ejemplo "_ga") para generar estadísticas de uso. Con él registramos: las pantallas que visitas, los botones que presionas, el tipo de dispositivo y navegador, la fecha y hora, una ubicación aproximada (ciudad o región) derivada de tu conexión, y eventos generales como iniciar sesión, agendar una cita o un chequeo, unirte a la fila, completar una compra (monto, número de productos y su categoría o identificador interno) o ganar y canjear Monedas Apolo. No enviamos a Google tu nombre, correo, teléfono, CURP ni ningún dato de salud (lecturas, medicamentos, ánimo, sueño ni resultados), y no le asignamos un identificador de usuario.
Puedes dejar de ser medido en cualquier momento retirando tu consentimiento para finalidades secundarias en "Privacidad y mis datos"; también puedes borrar o bloquear las cookies desde la configuración de tu navegador. Google trata estos datos como encargado, en servidores que pueden estar fuera de México; puedes consultar cómo los usa en https://policies.google.com/technologies/partner-sites.

9. CAMBIOS AL AVISO DE PRIVACIDAD
El presente aviso de privacidad puede sufrir modificaciones derivadas de nuevos requerimientos legales, mejoras de nuestros procesos o de nuestros servicios. Cualquier cambio será publicado en la sección "Aviso de privacidad" de la aplicación y, cuando el cambio sea significativo, te lo notificaremos a través de la aplicación o de tu correo electrónico registrado y te pediremos aceptarlo de nuevo. La versión vigente indicará siempre su fecha de última actualización.

Al firmar este documento consientes expresamente el tratamiento de tus datos personales, incluidos tus datos sensibles de salud y los registros de salud que captures en la aplicación, conforme a este aviso.`
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
  },
  {
    type: 'firma_electronica',
    title: 'Consentimiento de Firma Electrónica y Documentos Digitales',
    summary: 'Validez de tu firma electrónica y del envío y resguardo de tus documentos en formato digital (Código de Comercio y NOM-151-SCFI-2016).',
    content: `CONSENTIMIENTO PARA USO DE FIRMA ELECTRÓNICA Y DOCUMENTOS DIGITALES

1. ACEPTACIÓN DE LA FIRMA ELECTRÓNICA
Acepto que, al marcar la casilla de aceptación y registrar mi nombre en la aplicación o en la tableta de la Farmacia, esa acción constituye mi firma electrónica, la cual tiene la misma validez y efectos jurídicos que mi firma autógrafa, conforme a los artículos 89, 89 Bis y 1205 del Código de Comercio y a la Ley de Firma Electrónica Avanzada.

2. MEDIOS DE IDENTIFICACIÓN
Mi firma electrónica queda vinculada a mi cuenta (correo electrónico o teléfono y contraseña), a mi nombre completo, a la fecha y hora exactas de cada firma y a los datos técnicos de la conexión y del dispositivo desde el que firmo (como la dirección IP y el navegador), junto con el contenido íntegro del documento que firmo. Estos elementos permiten atribuirme la firma y acreditar mi voluntad, conforme al artículo 1205 del Código de Comercio.

3. DOCUMENTOS EN FORMATO DIGITAL
Acepto que los avisos de privacidad, consentimientos informados, términos y condiciones, contratos de membresía, recetas, recibos y demás documentos relacionados con los servicios de la Farmacia sean expedidos, enviados, firmados y conservados en formato digital, con la misma validez que su equivalente en papel, conforme a la NOM-004-SSA3-2012 del Expediente Clínico (numeral 5.10) y a la NOM-024-SSA3-2012 del sistema de expediente clínico electrónico.

4. CONSERVACIÓN E INTEGRIDAD
Los documentos firmados se conservan íntegros e inalterables en el expediente clínico electrónico durante al menos 5 años a partir de mi último acto médico, conforme a la NOM-004-SSA3-2012 (numeral 5.4), y bajo los criterios de conservación de mensajes de datos de la NOM-151-SCFI-2016. Cualquier corrección se asienta como un documento nuevo que referencia al original, preservando el historial.

5. ACCESO Y COPIAS
Puedo consultar mis documentos firmados y solicitar copia de ellos en cualquier momento a través de la aplicación, al correo citas@apolofarmacia.com.mx o directamente en el domicilio de la Farmacia, conforme a la NOM-024-SSA3-2012 y a mis derechos ARCO descritos en el Aviso de Privacidad.

6. DATOS PERSONALES
Los datos asociados a mi firma electrónica (mi nombre, mi cuenta y la fecha y hora de cada firma) se tratan conforme al Aviso de Privacidad de la Farmacia y a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares.

7. REVOCACIÓN
Puedo revocar este consentimiento para documentos futuros manifestándolo al correo citas@apolofarmacia.com.mx o en el domicilio de la Farmacia. La revocación no afecta la validez de los documentos firmados con anterioridad y puede implicar que algunos servicios que requieren firma electrónica dejen de estar disponibles.

Al firmar este documento consiento el uso de mi firma electrónica y la generación, envío y conservación de mis documentos en formato digital.`
  }
];
