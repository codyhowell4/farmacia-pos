# Sistema de Gestión de Seguridad de la Información (SGSI)

**Farmacia Apolo — Consultorio y Punto de Venta**
Documento requerido por la NOM-024-SSA3-2012, numeral 6.6.1 (políticas y procedimientos de seguridad de la información para sistemas de expediente clínico electrónico).

- **Alcance:** la plataforma web (React/Vite en Vercel), la base de datos y servicios Supabase (PostgreSQL, Auth, Storage, Edge Functions), y los datos personales y de salud que en ellos se procesan (expediente clínico, recetas, citas, ventas).
- **Responsable del documento:** administrador de la farmacia.
- **Revisión:** anual (ver sección 10).

---

## 1. Objetivo

Proteger la confidencialidad, integridad y disponibilidad de la información de pacientes y de la operación de la farmacia, dando cumplimiento a la NOM-024-SSA3-2012, a la NOM-004-SSA3-2012 (expediente clínico) y a la LFPDPPP en materia de datos personales.

## 2. Roles y responsabilidades

El **grupo de trabajo de seguridad de la información** está integrado, en esta operación de un solo consultorio, por el **administrador de la farmacia** (rol `admin` en el sistema), quien acumula las funciones de responsable de seguridad. Sus obligaciones:

- Alta, baja y modificación de usuarios y roles en el sistema (módulo de administración de usuarios).
- Revisión trimestral de la bitácora `audit_log` y de los accesos registrados.
- Gestión de los respaldos y verificación de su restauración (sección 5).
- Atención y documentación de incidentes de seguridad (sección 9).
- Custodia de las credenciales de servicio (llaves de Supabase, secretos de edge functions) y su rotación.
- Actualización anual de este documento.

Si la operación crece, se podrá designar un segundo responsable (rol `admin` adicional) y un enlace técnico externo; la responsabilidad última permanece en la administración de la farmacia.

## 3. Control de acceso

### 3.1 Modelo de roles

El acceso se rige por el rol asignado en la tabla `profiles`, validado en el cliente por `ProtectedRoute` y, de manera definitiva, en la base de datos por políticas **Row Level Security (RLS)** habilitadas en todas las tablas con aislamiento por `org_id` (función `get_my_org_id()`).

| Rol | Acceso principal |
| --- | --- |
| `admin` | Todo el sistema: configuración, usuarios, reportes, POS, inventario, consultas. |
| `pos` | Punto de venta (`/pos`): ventas, caja, turnos. |
| `inventory` | Inventario (`/inventory`): catálogo, existencias, ajustes. |
| `doctor` | Portal médico: agenda, consultas, expediente clínico, recetas. |
| `secretary` | Recepción: agenda y datos administrativos de pacientes; sin acceso a notas clínicas. |
| `nurse` | Apoyo clínico: signos vitales y datos del expediente según políticas RLS. |
| `customer` | Portal del paciente: sus propias citas, documentos y notificaciones (RLS limita a `customer_id` propio). |

### 3.2 Reglas

- **Privilegio mínimo:** cada usuario recibe el rol estrictamente necesario para su función. Nunca se comparten cuentas.
- **Altas/bajas:** la baja de personal se realiza el mismo día de la separación, desactivando su usuario en el módulo de administración.
- **PIN de aprobación:** operaciones sensibles del POS (cancelaciones, cambios de precio > 10 %) exigen PIN de administrador (`profiles.pin`), además del rol.
- **Funciones privilegiadas:** las edge functions usan la *service role key* únicamente del lado del servidor; ninguna llave privilegiada se expone al navegador (solo `VITE_SUPABASE_ANON_KEY`, protegida por RLS).
- **RLS es obligatoria:** está prohibido deshabilitar RLS en cualquier tabla o crear políticas `using (true)`.

## 4. Autenticación

- La autenticación la provee **Supabase Auth** (correo + contraseña, con hashing y gestión de sesiones del lado del proveedor).
- **Política de contraseñas (recomendada y comunicada al personal):** mínimo 10 caracteres, combinando mayúsculas, minúsculas, números y un símbolo; prohibido reutilizar contraseñas personales; cambio inmediato ante sospecha de compromiso. Configurar en Supabase el umbral mínimo de longitud y, de ser posible, la verificación contra contraseñas filtradas (Have I Been Pwned) en Authentication → Settings.
- **MFA (recomendado):** activar autenticación multifactor (TOTP) en Supabase Auth para todas las cuentas con rol `admin` y `doctor`, por su acceso al expediente clínico completo. (Estado: pendiente de habilitar — hoy la autenticación es usuario + contraseña; la habilitación de TOTP está en la hoja de ruta de seguridad. Mientras tanto se refuerza la política de contraseñas y la revisión trimestral de accesos.)
- **Sesiones:** cierre de sesión al terminar el turno en equipos compartidos del mostrador; los tokens de sesión expiran según la configuración de Supabase Auth.
- **Recuperación:** el restablecimiento de contraseña se realiza únicamente por el flujo de correo de Supabase (`ForgotPasswordPage`/`ResetPasswordPage`); el administrador nunca pide contraseñas al personal.

## 5. Respaldos y recuperación

- **Respaldos administrados:** Supabase realiza respaldos automáticos de la base de datos según el plan contratado. El administrador verifica mensualmente en el panel (Database → Backups) que los respaldos existen y conoce el procedimiento de restauración.
- **Exportación semanal (recomendada):** cada semana el administrador genera y conserva una exportación de las tablas críticas (`appointments`, `consulta_notes`, `prescriptions`, `customers`, `sales`, `medical_history_versions`) mediante `pg_dump` o copia CSV desde el SQL editor, almacenada cifrada fuera de la plataforma (p. ej. disco cifrado o almacenamiento en la nube con acceso restringido). Esto garantiza portabilidad y cumplimiento de retención aunque el servicio se interrumpa.
- **Prueba de restauración:** al menos una vez al año se restaura un respaldo en un proyecto de prueba para verificar que el procedimiento funciona; se registra fecha y resultado en la bitácora del SGSI.
- **Archivos adjuntos:** el bucket `patient-documents` (Storage) se incluye en la exportación semanal cuando contenga documentos de pacientes.

## 6. Retención y conservación del expediente

- Conforme a la **NOM-004-SSA3-2012, numeral 5.4**, el expediente clínico se conserva **mínimo 5 años contados a partir de la fecha del último acto médico** de cada paciente. Transcurrido ese plazo, la disposición final se realiza conforme a la normativa aplicable (LFPDPPP y su reglamento), documentándose.
- En la práctica del sistema: **no se eliminan** registros de `consulta_notes`, `medical_notes`, `prescriptions`, `consent_documents`, `medical_history_versions` ni `customer_documents` durante la operación normal. Cualquier depuración de datos se aprueba por escrito por el administrador verificando la fecha del último acto médico.
- Los respaldos y exportaciones (sección 5) preservan la información durante el plazo de retención aunque la cuenta de Supabase cambie.

## 7. Trazabilidad y auditoría

- **`audit_log`:** bitácora inmutable de acciones sensibles (ventas, cancelaciones, ajustes de inventario, gestión de usuarios). Es de solo inserción; nadie edita ni borra registros. El administrador la revisa trimestralmente.
- **`consulta_notes` (append-only):** las notas de evolución clínica no se modifican; las correcciones se asientan como notas nuevas referenciando a la original, preservando la historia del expediente conforme a la NOM-004.
- **`medical_notes` (append-only):** las notas clínicas de texto libre —incluidos los auto-reportes generados en el kiosco— están protegidas contra modificación y borrado por un trigger de base de datos; cualquier corrección se asienta como una nota nueva.
- **`medical_history_versions`:** cada cambio del antecedente/historia clínica genera una versión nueva con fecha y autor; nunca se sobrescribe una versión anterior.
- **`notification_queue`:** conserva el resultado (`sent`/`failed`/`skipped`, con `error` y `sent_at`) de cada notificación a pacientes, como evidencia de los avisos enviados.
- **Firmas:** las recetas firmadas electrónicamente conservan `signed_payload`, `signature`, certificado y fecha en `prescriptions` (NOM-024, firma electrónica avanzada). La custodia de la e.firma del médico se describe en la sección 8.
- Toda consulta de estos registros con fines de auditoría se realiza con la cuenta personal del revisor, nunca con la *service role key*.

## 8. Custodia de la e.firma (FIEL) del médico

- El médico carga a la plataforma sus archivos de e.firma (FIEL) emitidos por el SAT: el certificado público (`.cer`) y la llave privada (`.key`). La llave privada permanece **cifrada con la contraseña del propio médico** en todo momento.
- La contraseña de la e.firma se conserva **únicamente en la sesión del navegador** del médico (`sessionStorage`); **nunca se persiste del lado del servidor** ni se asienta en base de datos, bitácoras o almacenamiento persistente.
- Al momento de firmar, la edge function `sign-document` descifra la llave privada **en memoria**, con la contraseña proporcionada en esa sesión, y la descarta al concluir la operación.
- En el documento firmado (receta, justificante o nota) se almacenan el payload firmado (`signed_payload`), la firma (`signature`) y el número de serie del certificado del firmante, lo que permite su verificación posterior, incluida la pública en `/verifica/`.

**Decisión y aceptación de riesgo.** La custodia en el servidor de la llave privada cifrada es una desviación pragmática respecto del principio estricto de la Ley de Firma Electrónica Avanzada sobre el «control exclusivo de los datos de creación de la firma» por parte del firmante. La organización **acepta este riesgo de forma consciente y documentada**, con las siguientes mitigaciones: (i) la llave permanece **siempre cifrada en reposo**; (ii) la contraseña **nunca se almacena** del lado del servidor; (iii) todo evento de firma queda auditado en la bitácora (acción `RECETA_SIGN`); y (iv) el procedimiento de revocación consiste en que el médico revoque su FIEL ante el SAT y cargue una nueva en la plataforma. Cada médico suscribe la autorización interna de custodia reproducida en el **Anexo A** de este documento.

## 9. Gestión de incidentes de seguridad

Se considera incidente, entre otros: acceso no autorizado o sospechado, filtrado o pérdida de credenciales, robo/extravío de equipo con sesión abierta, envío erróneo de datos de un paciente a un tercero, o indisponibilidad prolongada del servicio.

**Procedimiento:**

1. **Contención inmediata:** desactivar el usuario o rotar la llave comprometida (`supabase secrets` / panel de Supabase); cerrar sesiones activas desde Supabase Auth.
2. **Notificación:** informar al administrador (responsable del grupo de seguridad) el mismo día del descubrimiento.
3. **Registro:** documentar en la bitácora del SGSI: fecha, descripción, datos y pacientes potencialmente afectados, causa, acciones tomadas.
4. **Evaluación:** determinar si hubo afectación a datos personales o de salud. De ser así, valorar la notificación a los titulares y, en su caso, a la autoridad conforme a la LFPDPPP.
5. **Lecciones aprendidas:** ajustar controles (roles, políticas RLS, secretos, capacitación) y reflejar los cambios en la siguiente revisión de este documento.

## 10. Revisión del documento

- Este documento se **revisa al menos una vez al año**, y además cuando ocurra: un incidente de seguridad relevante, un cambio de plataforma o proveedor, la incorporación de nuevos módulos o roles, o un cambio normativo.
- La revisión la realiza el administrador (grupo de trabajo de seguridad) y queda asentada en la tabla de control de versiones.
- Todo el personal con acceso al sistema debe conocer las secciones 3, 4 y 9 como parte de su incorporación.

## 11. Control de versiones del documento

| Versión | Fecha | Autor / Revisor | Descripción del cambio |
| --- | --- | --- | --- |
| 1.0 | 2025-XX-XX | Administrador de la farmacia | Emisión inicial del SGSI. |
| 1.1 | 2026-09-15 | Administrador de la farmacia | Se aclara el estado del MFA (pendiente de habilitar, §4); `medical_notes` se añade a las listas de conservación y append-only (§6, §7); nueva sección 8 de custodia de la e.firma (FIEL) del médico con decisión y aceptación de riesgo, y Anexo A (autorización interna de custodia). |
|  |  |  |  |

---

## Anexo A — Autorización interna de custodia de e.firma

*(Formato imprimible; una copia firmada se conserva en el expediente del SGSI.)*

**AUTORIZACIÓN INTERNA DE CUSTODIA DE E.FIRMA (FIEL)**

Por medio del presente documento, el (la) médico(a):

**Nombre:** ______________________________________________

**Cédula profesional:** ____________________________________

**autoriza** a **Farmacia Apolo** a custodiar, en los servidores de la plataforma, su llave privada de e.firma (FIEL) **cifrada**, con la única finalidad de generar la firma electrónica de recetas, justificantes y notas médicas a través de la plataforma.

El (la) médico(a) declara conocer y aceptar que:

1. Su llave privada permanece cifrada en reposo con su contraseña personal de e.firma.
2. **La contraseña de su e.firma nunca se almacena en el servidor**; se conserva únicamente en la sesión de su navegador mientras utiliza la plataforma.
3. Cada firma generada queda registrada en la bitácora de auditoría de la plataforma.
4. Puede **revocar esta autorización en cualquier momento**, mediante aviso por escrito al Responsable de Seguridad de la Información; asimismo, puede revocar su FIEL ante el SAT y cargar una nueva en la plataforma.

**El (la) médico(a)**

**Nombre:** ______________________________________________

**Firma:** _______________________________________________

**Responsable de Seguridad de la Información — Farmacia Apolo**

**Nombre:** ______________________________________________

**Firma:** _______________________________________________

**Lugar:** Ciudad de México (o ______________)   **Fecha:** ______ / ______ / __________
