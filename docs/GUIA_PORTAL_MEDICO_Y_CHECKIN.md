# Guía de uso: Portal Médico y páginas de registro / check-in de pacientes

> Manual para el personal del consultorio (médicos, enfermería, secretarias y recepción).
> Explica cómo usar el **Portal Médico** (`/doctor`) y cómo funcionan las páginas públicas de
> **formularios / consentimiento / registro** para registrar y pasar a un paciente a consulta.

---

# Parte 1 — Portal Médico

## 1.1 Acceso y roles

1. Entra a la aplicación e inicia sesión con tu correo y contraseña.
2. Según tu rol, el sistema te lleva a:
   - **Médico / Admin** → el portal completo (`/doctor`).
   - **Secretaria** → directamente a la pestaña **Citas**.
   - **Enfermera** → Citas, Pacientes e Inventario (el expediente clínico es de solo lectura para enfermería; no puede crear recetas, notas ni justificantes, pero sí **capturar signos vitales**).

Pestañas del portal (barra lateral):

| Pestaña | Quién la ve |
|---|---|
| **Resumen** | Médico, Admin |
| **Citas** | Todos (médico, admin, secretaria, enfermera) |
| **Pacientes** | Médico, Admin, Enfermera |
| **Inventario** | Médico, Admin, Enfermera (solo lectura) |
| **Reportes** | Médico, Admin |
| **Mi perfil** | Todos |

**Importante:** por seguridad, la sesión se cierra sola por inactividad: a los **60 minutos en el portal médico** y a los **30 minutos en el resto del sistema** (caja, inventario y administración).

## 1.2 Iniciar tu turno

En el encabezado hay un botón **Iniciar turno**:

- Al presionarlo verás **"En turno desde HH:MM"** con un punto verde.
- Solo estando en turno apareces como disponible: se habilita la **Fila del consultorio**, los tiempos de espera en la app del paciente y la asignación automática de walk-ins.
- Al terminar, presiona el mismo botón y confirma **"¿Terminar tu turno?"**.
- Si lo olvidas, al presionar **Empezar Consulta** el turno se inicia automáticamente.

## 1.3 La pestaña Citas (tu agenda)

Es la pantalla de trabajo principal. Se **actualiza en vivo**: cuando recepción, la tableta o la app registran un paciente, la cita aparece sola.

- **Filtros:** buscar por nombre de paciente, por estado (Pendiente / Confirmada / En consulta / Completada / Cancelada) y por periodo (**Hoy / Próximos 7 días / Todas**). La lista se agrupa por día.
- **Cada cita muestra:** estado, modalidad (📹 Video / 🏥 Presencial), estado de pago en teleconsultas, ✓ Signos (si enfermería ya capturó signos), **📝 Borrador** (si la consulta tiene una nota en curso con guardado automático — ver 1.4), y para registros de kiosco: la fuente ("Registro en tableta" / "Check-in en línea") y **"✓ Consentimientos firmados"**.

### Fila del consultorio

Estando en turno verás un solo recuadro verde — **"Fila del consultorio (N)"** — sobre la lista. Junta todo lo que puedes atender:

- **Citas sin médico asignado** (incluye todos los registros de tableta/kiosco/app): presiona **Tomar cita** para asignártela directamente.
- **Citas de un médico que no ha iniciado turno:** llevan una **nota amarilla** — "⚠ Cita agendada con Dr(a). X — no ha iniciado turno". El botón **Cubrir** abre una confirmación ("¿Seguro que quieres tomar la cita de este médico?") antes de reasignártela (queda registrado en auditoría). También puedes **Reagendar** o **Cancelar** (requiere motivo; si era cita de membresía, la visita se devuelve automáticamente al paciente).

> Las citas que ya tienen trabajo capturado **no aparecen en la fila**: si una cita está *En consulta* o tiene un **📝 Borrador** (nota en curso esperando el cierre automático de 24 h), se considera en proceso y nadie más puede tomarla. Las citas **Completadas** tampoco aparecen.

> No hay botón de "llamar al siguiente paciente": el flujo es tomar la cita de la fila y llamar al paciente verbalmente en sala de espera.

### Acciones por cita (botones de cada fila)

- **Unirse** — entra a la sala de video (teleconsultas).
- **Expediente** — abre el expediente del paciente.
- ✓ **Confirmar** — confirma una cita pendiente.
- **Capturar signos** (ícono de actividad) — signos vitales previos a la consulta (lo usa sobre todo enfermería): Edad, Talla, Peso, Temp, T/A, FC, FR, So2%, Glicemia y Alergias → **Guardar signos**.
- **Empezar Consulta / Continuar consulta** — abre la nota de evolución (ver 1.4).
- **Nota post-consulta** — reabre la nota de una cita completada.
- **Nota rápida** — texto libre (queda en el expediente; no se puede editar ni borrar).
- **Agendar siguiente** — programa la cita de seguimiento (presencial o teleconsulta; las teleconsultas creadas por el personal son de cortesía, sin cargo).
- ⋮ **Editar cita / Eliminar**.

### Crear una cita manualmente

Botón **Nueva cita**: selecciona el **paciente registrado** (obligatorio — "Las recetas son digitales: toda cita requiere un paciente con expediente"), tipo (🏥 Presencial / 📹 Teleconsulta), fecha y hora, estado y notas → **Crear cita**. Las teleconsultas crean la sala de video automáticamente.

## 1.4 La consulta y la nota de evolución (NOM-004)

1. Con la cita confirmada, presiona **Empezar Consulta**. La cita pasa a **En consulta** y se abre la nota de evolución.
2. Llena los campos obligatorios:
   - **Padecimiento actual** *
   - **Exploración física** * (o marca "No se realizó (declarado)")
   - **Resultados de estudios** * (o "Sin resultados de estudios (declarado)")
   - **Signos vitales** * — si enfermería ya los capturó vienen precargados ("precargados por enfermería: …"); o marca "No se tomaron signos (declarado)"
   - **Diagnóstico** * y **Diagnósticos CIE-10** (buscador del catálogo, escribe 2+ letras y selecciona)
   - **Pronóstico** *
   - **Plan / indicación terapéutica** *
   - **Solo teleconsultas (NOM-027):** ubicación declarada del paciente * y la casilla "Verifiqué la identidad del paciente al inicio de la teleconsulta" *.
   - **Receta (opcional):** sección plegable para emitir la receta en el mismo paso.
3. Presiona **Guardar y terminar consulta**. La cita queda **Completada**. Si la consulta incluyó medicamentos, la **vista previa de la receta se abre sola** al terminar (ya firmada si tu e.firma está desbloqueada) para imprimirla o descargar el PDF en el momento.

**¿No alcanzas a terminar la nota? Borrador con guardado automático (24 h):**

- Todo lo que escribes en la consulta se **guarda solo** como **borrador** (también con el botón **Guardar progreso**, que guarda y cierra la ventana).
- Puedes **cerrar la consulta en cualquier momento** — para actualizar la historia clínica, revisar el expediente o atender a otro paciente — y retomarla con **Continuar consulta**: todo queda como lo dejaste. La cita muestra el distintivo **📝 Borrador** en la agenda.
- El borrador **no es parte del expediente legal** hasta que termines la consulta. La NOM-004 exige la nota después de cada atención, así que el borrador **se cierra automáticamente a las 24 horas del primer guardado**: la nota se asienta con lo que haya (las secciones vacías quedan marcadas como "no capturadas al cierre automático" y se completan después como nueva versión) y la cita pasa a Completada. **Los medicamentos del borrador NO se recetan automáticamente** — si el borrador se cierra solo, re-emite la receta manualmente.
- Si el cierre automático falla (por ejemplo, falta la historia clínica de primera vez), la consulta muestra un aviso rojo con el motivo: termínala manualmente.

**Imprimir la receta sin terminar la consulta:** dentro de la sección **Receta (opcional)**, el botón **Guardar e imprimir receta** emite y firma la receta en el momento y abre la vista de impresión, sin cerrar la nota. Ojo: desde ese momento la receta es un documento final (no se puede editar, solo cancelar), y el formulario de medicamentos se limpia para no recetar dos veces lo mismo.

**Bloqueos que pueden aparecer antes de guardar (en este orden):**

- **Paciente sin registrar** — si el walk-in llegó sin expediente, primero vincúlalo/regístralo (botón **Registrar paciente**).
- **Consentimientos pendientes** — el paciente debe tener firmados los 4 documentos (ver Parte 2). El diálogo te lleva a la pestaña **Consent.** del expediente para registrarlos en persona.
- **Historia clínica pendiente** — la **primera** nota de evolución de un paciente exige su *historia clínica de primera vez* (NOM-004 6.1): presiona **Capturar historia**, llena Padecimiento actual, Interrogatorio por aparatos y sistemas, Exploración física, Antecedentes y Diagnóstico → **Guardar historia clínica**. Después el guardado de la nota continúa normal.
- **Posible reacción alérgica** — si un medicamento cruza con una alergia registrada verás un aviso rojo: **Volver y corregir** o **Continuar de todas formas** (la omisión queda impresa en la receta y en auditoría).

**Correcciones:** las notas son **inmodificables** (la NOM-004 prohíbe editarlas o borrarlas). Si reabres una cita completada verás el aviso "Nota ya firmada…" y el botón **Guardar nueva versión**: se crea una nueva versión ("Versión 2", "Versión 3"…) conservando la original.

## 1.5 Recetas electrónicas

**Crear:** desde el expediente (pestaña **Recetas** → **Nueva Receta**) o dentro de la consulta.

- Agrega medicamentos con **Agregar medicamento**. Cada uno lleva: **Nombre** * (autocompletado del inventario con existencia en vivo; también puedes escribirlo manual), **Dosis** *, **Vía** *, **Frecuencia** *, Duración y Notas.
- Bloque de signos/antropometría (todos opcionales; las alergias vienen precargadas del historial) y fecha de **Próxima cita**. En la receta impresa/PDF solo aparecen los signos que captures — los que dejes vacíos se omiten.
- **Indicaciones extras (opcional):** instrucciones generales para el paciente ("Evitar grasas", "Tomar después de los alimentos"…). Se imprimen en el recuadro **INDICACIONES** debajo de los medicamentos. El recuadro **siempre se imprime, aunque quede vacío**, para que puedas escribir a mano sobre la hoja impresa si el paciente pregunta después.
- La receta **siempre cabe en media carta**: si el contenido es largo (muchos medicamentos o indicaciones extensas), el pie de página (dirección, horario, contacto) se hace más chico automáticamente y, en casos extremos, también la letra de los medicamentos. Nunca pasa a una segunda hoja.
- **Guardar Receta** → el folio se genera solo: `RX-AAAAMMDD-NNNNN-XXXXXX`.

**Reglas:**

- **Cédula profesional obligatoria** (6–8 dígitos, se captura en **Mi perfil**). Sin cédula no puedes emitir recetas (LGS 42 Bis); se imprime en cada receta.
- Dosis, vía y frecuencia son obligatorias por medicamento.
- **Medicamentos controlados (Grupo II/III) nunca se recetan por vía electrónica:** no aparecen en el autocompletado y el sistema los bloquea al guardar ("Requiere receta foliada COFEPRIS"). Esos se recetan en papel foliado COFEPRIS.

**Firmar con e.firma (FIEL):**

- Configura tu e.firma una sola vez en **Mi perfil** (archivos .cer y .key + contraseña; se valida contra el SAT y la contraseña nunca se guarda).
- En cada sesión, **Desbloquea** tu e.firma con tu contraseña. Si marcas "Mantener desbloqueada durante esta sesión", **las recetas nuevas se firman solas al crearlas**.
- Si no, cada receta se firma con el botón **Firmar** (solo contraseña, o subiendo .cer/.key para una firma única).
- Sin e.firma puedes imprimir y firmar a mano: la receta impresa trae línea de firma y tu cédula.
- Las recetas firmadas muestran el distintivo **"✒️ Firmada"**.

**Imprimir / PDF:** ícono de impresora → vista previa → **Descargar PDF** o **Imprimir**. La receta firmada incluye un **código QR** que cualquiera puede escanear para verificarla en `app.apolofarmacia.com.mx/verifica`, más un fragmento de firma impreso para verificación manual.

**Estados y cancelación:** Activa / Surtida / Expirada / Cancelada. Para cancelar una receta activa usa el ícono de prohibición (**Cancel receta**) y confirma.

## 1.6 El expediente del paciente (Pacientes → clic en el nombre)

Encabezado: datos de contacto, botón **Justificante** (comprobante de atención: fecha y diagnóstico opcional → **Generar e imprimir**; sugiere **reposo relativo** solo de forma cualitativa — nunca días de descanso cuantificados — y aclara en el propio documento que no es una incapacidad del IMSS; se guarda copia en Adjuntos), botón **Exportar expediente** (PDF completo, NOM-024 6.6.6) y, si faltan datos, la alerta **"Datos NOM-024 incompletos — captura sexo y CURP"**.

Nueve pestañas:

1. **Resumen** — contadores (recetas, citas, compras, notas), aviso rojo de **Alergias** y tarjeta "Información del paciente" con **Editar** (CURP —se valida el dígito verificador—, sexo, entidad de nacimiento, talla, peso, notas).
2. **Historia** — historia clínica de primera vez: **Capturar** la primera vez; después **Ver** la versión vigente y **Actualizar historia** para registrar cambios. Es un **documento vivo versionado**: cada actualización crea una **versión nueva** con autor y fecha, y las **versiones anteriores se conservan** íntegras (botón "Ver versiones anteriores") — la versión original nunca se edita ni se borra (NOM-024). La captura y la actualización tienen **guardado automático de borrador**, así que puedes cerrar la ventana a la mitad y continuar después. Debajo están los antecedentes estructurados: Alergias, Patológicos, No Patológicos, Heredofamiliares, Gineco-Obstétricos, Vacunación y Perinatales. Cada entrada tiene Etiqueta, Estado (Presente/Negado) y Detalle; todo cambio queda en el **Historial de cambios**.
3. **Notas consulta** — las notas de evolución estructuradas, con autor, versión y botón **Exportar CDA** (XML) por nota.
4. **Recetas** — Nueva Receta, Firmar, Imprimir, Cancelar.
5. **Citas** — próximas y anteriores, con las mismas acciones de la agenda.
6. **Compras** — historial de compras del paciente en la farmacia.
7. **Notas** — notas libres (sin editar ni borrar). Los auto-reportes del kiosco muestran el distintivo ámbar **"Auto-reporte de kiosco — identidad por confirmar en recepción"**.
8. **Adjuntos** — subir documentos (Laboratorio / Imagen / Consentimiento / Otro) y verlos.
9. **Consent.** — consentimientos informados: **Nuevo consentimiento** (el texto oficial se carga solo), **Imprimir** (con líneas de firma), ✓ **Marcar firmado** (pide el nombre de quien firma) o ✗ Rechazado. Aquí se regularizan los pacientes que llegan sin firmas completas.

## 1.7 Inventario (solo lectura)

Existencias completas de la farmacia: búsqueda por nombre/indicación/código/departamento, orden (A–Z, más vendido, stock) y filtros **Todos / Agotados / Stock bajo / Caduca en <30 días / Caducados**. Te sirve para recetar solo lo disponible (el autocompletado de la receta ya muestra la existencia).

## 1.8 Reportes

Rango de fechas (por defecto el mes en curso) y verás: **Consultas**, **Recetas emitidas**, **Pacientes únicos atendidos**, **Resultados de citas** (con **% de asistencia**), **Consultas por diagnóstico** (CIE-10) y **Medicamentos más recetados** (top 15).

## 1.9 Mi perfil

- **Nombre visible para pacientes.**
- **Mi ubicación (zona horaria)** — todas las horas del portal siguen esta zona.
- **Información profesional** — **Cédula profesional** (6–8 dígitos; obligatoria para recetar), especialidad, teléfono.
- **Firma electrónica (e.firma / FIEL)** — subir .cer + .key + contraseña → **Validar y guardar**; luego **Desbloquear/Bloquear** por sesión, reemplazar archivos o eliminar.
- **Mi disponibilidad (video consultas)** — horario semanal (Lun–Dom, hasta 3 ventanas por día) → **Guardar disponibilidad**. De aquí salen los horarios que los pacientes pueden agendar en la app y la asignación automática de walk-ins.

---

# Parte 2 — Registro y check-in de pacientes (formularios / consentimiento / registro)

## 2.1 Mapa de las páginas

Hay **tres puertas de entrada públicas** (no requieren cuenta de staff) y una herramienta interna. Todas terminan en lo mismo: **una cita walk-in confirmada en la agenda del portal médico**.

| Dirección | Página | Para quién |
|---|---|---|
| `formularios.apolofarmacia.com.mx` | **Registro en tableta** (`/registro/`) | Paciente **nuevo** que tiene correo o teléfono (se le crea cuenta de la app). Es la tableta de recepción. |
| `consentimiento.apolofarmacia.com.mx` | **Kiosco de consentimientos** (`/consentimiento/`) | Pacientes **sin correo ni teléfono** (no se crea cuenta), primera vez o que ya han venido. |
| `registro.apolofarmacia.com.mx` | Redirige al **check-in de la app** (`customer-app/?checkin=1`) | Pacientes **que ya tienen cuenta** en la app, desde su propio teléfono. |
| (herramienta interna) Admin → Consentimientos → **"Enviar formularios"** | Envío del enlace de firma (`customer-app/?firma=1`) por WhatsApp/correo | Personal, para pacientes que deben firmar documentos pendientes a distancia. |

> Ojo con los nombres: el subdominio **formularios.** abre la página `/registro/` (la tableta), mientras que el subdominio **registro.** manda al check-in de la app. Cuando alguien diga "los formularios de la tableta", se refiere a `formularios.apolofarmacia.com.mx`.

Todas las páginas comparten reglas de higiene de kiosco: **90 segundos sin tocar la pantalla → se reinicia sola**, y la pantalla de éxito se cierra sola a los **45 segundos** ("Esta pantalla se cerrará en N s por privacidad").

## 2.2 Tableta de recepción — `formularios.apolofarmacia.com.mx` (paciente nuevo CON correo o teléfono)

Un solo formulario en tres tarjetas numeradas:

**1. Datos del paciente**
- **Nombre completo del paciente** *
- **Fecha de nacimiento** * en formato **dd/mm/aaaa** (se ponen las diagonales solas)
- Si la fecha indica **menor de edad**, aparece automáticamente el bloque del tutor:
  - **Nombre completo del padre, madre o tutor** *
  - **Parentesco** * (Padre / Madre / Tutor)
  - La cuenta y los consentimientos quedan **a nombre del tutor**; el expediente es del menor.
- **Correo electrónico** y/o **Teléfono** — se requiere **al menos uno** (con el correo le llega la activación de la app).
- Si no escribe correo, aparece **"Crea una contraseña para la app"** * (mínimo 10 caracteres; entrará con su teléfono y esa contraseña).

**2. Motivo de visita (opcional)** — texto libre ("Ej. dolor de garganta, fiebre desde ayer…").

**3. Documentos de consentimiento** — los 4 documentos (ver 2.5), cada uno desplegable para leerlo completo, con su casilla **"He leído y acepto: \<título\>"**. El botón **"Acepto y registro mi visita"** se habilita hasta marcar las 4.

**Pantalla de éxito:** "✅ ¡Registro completo! — Avisa al personal que ya terminaste. En breve te llamarán para tu consulta." Muestra el nombre registrado, "Consentimientos firmados ✓" y cómo activar su app (correo de activación, o teléfono + contraseña). Botón **"Registrar a otra persona"**.

## 2.3 Kiosco sin cuenta — `consentimiento.apolofarmacia.com.mx` (SIN correo/teléfono, o paciente que regresa)

Pantalla inicial con dos botones grandes:

### A) "🆕 Primera Vez"

Formulario **"1. Datos del paciente"**:
- **Nombre completo del paciente** *
- **Fecha de nacimiento (dd/mm/aaaa)** *
- **Sexo** * (Mujer / Hombre)
- **CURP (opcional)** — 18 caracteres; el sistema valida el dígito verificador, así que un CURP mal escrito se rechaza ("CURP inválido").
- Si es **menor de edad**, aparece el bloque del tutor: nombre completo *, parentesco * y **últimos 4 dígitos de la INE** de quien firma *.

Después, **"2. Documentos de consentimiento"** (los mismos 4, aceptados por el tutor si es menor) → **"Acepto y registro mi visita"**.

Éxito: "¡Registro completo!" + **"🩺 Doctor asignado: \<nombre\>"** + botón **"🖨️ Imprimir mi copia de los consentimientos"** (la copia del paciente que pide la NOM-004; imprime los 4 documentos con los datos del firmante). **No se crea cuenta de app.**

### B) "🔁 Ya he venido antes"

1. Llena **"Buscar mi expediente"** con nombre completo y fecha de nacimiento.
2. El sistema busca el expediente (tolera acentos y variantes del nombre, p. ej. "Juan Pérez" vs "Juan Antonio Pérez", pero nunca con otra fecha de nacimiento). Tres resultados posibles:
   - **Encontrado con consentimientos al corriente** → pasa directo a las preguntas de check-in (con el aviso "El personal confirmará tu identidad en recepción antes de la consulta").
   - **Encontrado pero faltan firmas** → primero firma los documentos pendientes, luego las preguntas.
   - **No encontrado** → lo manda al registro de Primera Vez conservando lo que ya escribió ("No encontramos un expediente con ese nombre y fecha de nacimiento. Completa tu registro como paciente nuevo").
3. **Preguntas de check-in:**
   1. ¿Cuál es el motivo de tu visita? *
   2. ¿Qué síntomas tienes? *
   3. ¿Desde cuándo tienes estos síntomas? (Hoy / 1-3 días / 4-7 días / Más de una semana)
   4. ¿Tomas algún medicamento actualmente? (opcional)
   5. ¿Tienes alergias conocidas? (opcional)
4. **"Hacer check-in"** → "¡Check-in listo!" + doctor asignado + botón de impresión (si firmó documentos en esa sesión).

## 2.4 Check-in desde la app del paciente — `registro.apolofarmacia.com.mx`

Para el paciente que **ya tiene cuenta** y hace check-in desde su propio teléfono (por ejemplo, ya en sala de espera):

1. Abre el enlace (o la app) e inicia sesión. Si le faltaran firmas, primero pasa por la pantalla de firma (la app no deja avanzar sin los 4 documentos).
2. Ve **"🩺 Check-in — Hola, \<nombre\>"** y contesta las **mismas 5 preguntas** del kiosco (sus alergias ya vienen precargadas de su historial).
3. **"Hacer check-in"** → "✅ ¡Check-in listo! — El doctor (\<nombre\>) ya puede ver tu información. Avisa al personal que ya hiciste check-in."

## 2.5 Los 4 documentos de consentimiento y cómo se "firma"

En **todas** las páginas se firman los mismos 4 documentos:

1. **Aviso de Privacidad** (LFPDPPP / NOM-004)
2. **Consentimiento Informado General** (NOM-004-SSA3-2012)
3. **Consentimiento para Teleconsulta**
4. **Consentimiento de Firma Electrónica y Documentos Digitales**

**Cómo se firma:** no hay firma manuscrita ni almohadilla de firma. El paciente (o el tutor) lee cada documento y **marca la casilla "He leído y acepto"**; esa acción, junto con su nombre registrado, **es su firma electrónica** (así lo establece el propio documento de firma electrónica). Cada firma se guarda con nombre del firmante, fecha y hora, IP y dispositivo; en menores se guarda además el parentesco y los últimos 4 de la INE del tutor. El texto que se almacena es siempre la versión oficial vigente en el servidor, por lo que lo que firmó el paciente es demostrable después.

**Copia para el paciente (NOM-004 10.1):** tras firmar en el kiosco puede imprimir su copia con el botón **"🖨️ Imprimir mi copia de los consentimientos"**, o pedirla al personal en cualquier momento.

## 2.6 Qué pasa detrás del mostrador (resultado de cualquier check-in)

Sin importar por cuál página entró el paciente:

1. Se crea (o reutiliza) su **expediente** — nunca se duplica: el sistema reutiliza el registro si coinciden nombre + fecha de nacimiento, y solo vincula correo/teléfono existentes si la identidad coincide.
2. Se crea una **cita walk-in confirmada** (presencial, "sin cita previa") que **aparece de inmediato en la pestaña Citas del portal médico**, con la fuente ("Registro en tableta" / "Check-in en línea"), el motivo/síntomas capturados y **"✓ Consentimientos firmados"**.
3. Se **asigna automáticamente un doctor**: el médico activo cuyo horario de disponibilidad cubre esa hora (si ninguno cubre, el primer médico activo). El nombre del doctor asignado se muestra al paciente en la pantalla de éxito.
4. Se crea una **nota médica de auto-reporte** en el expediente con el prefijo *"[Auto-reporte del cliente — tableta en tienda · identidad por confirmar en recepción]"*, que el médico verá con el distintivo ámbar correspondiente.

## 2.7 Qué debe hacer recepción

1. **Orientar al paciente a la página correcta:**
   - ¿Nuevo y tiene correo/teléfono? → tableta en `formularios.apolofarmacia.com.mx`.
   - ¿Sin correo/teléfono, o no quiere cuenta? → kiosco `consentimiento.apolofarmacia.com.mx` → Primera Vez.
   - ¿Ya lo atendimos antes? → kiosco → "Ya he venido antes", o desde su app.
   - ¿Tiene app? → puede hacer check-in desde su teléfono (`registro.apolofarmacia.com.mx`).
2. **Verificar la identidad verbalmente antes de la consulta** (nombre y fecha de nacimiento; en menores, que quien lo acompaña sea el tutor registrado). Las propias pantallas y el portal lo recuerdan: *"identidad por confirmar en recepción"*.
3. Si el paciente **imprimió su copia** de consentimientos, entréguela y listo.
4. Si alguien **no encontró su expediente** en "Ya he venido antes": verifique la fecha de nacimiento (causa #1 de "no encontrado"); si persiste, que se registre como Primera Vez — el sistema fusiona por nombre+fecha y no duplica el expediente.
5. Si un paciente ya atendido **tiene firmas pendientes**, use **Admin → Consentimientos → "Enviar formularios"**: busque al cliente, y envíe el mensaje pre-redactado con el enlace de firma por **WhatsApp**, **correo** o **cópielo** para mandarlo por donde prefiera. El paciente firma desde su casa y crea su cuenta en el mismo paso.
6. **Menores de edad:** siempre debe estar presente padre, madre o tutor; los consentimientos los acepta el tutor (con parentesco y, en el kiosco, últimos 4 de su INE). La cuenta de la app, si aplica, queda a nombre del tutor.

## 2.8 Problemas frecuentes

- **"CURP inválido"** — el CURP es opcional; si lo capturan, debe estar completo y correcto (se valida el dígito verificador). Si no lo tiene a la mano, déjelo vacío.
- **"No encontramos un expediente…"** — casi siempre es la fecha de nacimiento o una variante grande del nombre. Regístrelo como Primera Vez; no se duplica el expediente.
- **La pantalla se reinició sola** — es el temporizador de privacidad (90 s sin uso / 45 s en la pantalla de éxito). Vuelva a empezar.
- **Mensajes de "demasiados intentos"** — las páginas tienen límite de uso por IP para evitar abuso (búsquedas y registros por minuto). Espere unos minutos y reintente.
- **El paciente no aparece en Citas** — confirme que llegó a la pantalla de éxito ("¡Registro completo!" / "¡Check-in listo!"). La agenda se actualiza sola; no hace falta recargar.
- **En la tableta, el aviso de error dice "tres documentos"** — es un detalle de redacción conocido: son **cuatro** casillas las que hay que marcar.
