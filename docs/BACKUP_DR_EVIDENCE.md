# Registro de evidencias de respaldo y recuperación (DR)

**Farmacia Apolo — Consultorio y Punto de Venta**
Registro operativo que acompaña a la sección 5 del [SGSI](SGSI.md). Cada fila es una evidencia mostrable a un inspector: quién la generó, cuándo, con qué alcance y con qué resultado.

- **Responsable de llenarlo:** administrador de la farmacia (grupo de trabajo de seguridad, SGSI §2).
- **Cadencias:** verificación de respaldos administrados — mensual; exportación manual — semanal; prueba de restauración — anual.
- **Custodia:** las capturas de pantalla y los archivos exportados referenciados aquí se conservan cifrados fuera de la plataforma (disco cifrado o nube de acceso restringido), junto con una copia de este registro.

---

## 1. Respaldos administrados de Supabase (verificación mensual)

Evidencia de que el panel de Supabase (Database → Backups) muestra respaldos vigentes según el plan contratado. Se adjunta captura del panel y se anota su referencia (nombre de archivo o folio de la carpeta de evidencias).

| Fecha | Referencia de la captura del panel | Resultado | Operador |
| --- | --- | --- | --- |
| 2026-09-18 | — | Registro abierto — primera evidencia pendiente [ORG] | — |
|  |  |  |  |

## 2. Exportación manual semanal

Exportación de las tablas críticas (`appointments`, `consulta_notes`, `prescriptions`, `customers`, `sales`, `medical_history_versions`, más el bucket `patient-documents` cuando contenga documentos) mediante `pg_dump` o copia CSV desde el SQL editor, almacenada cifrada fuera de la plataforma.

| Fecha | Tablas / alcance | Destino (medio cifrado) | Checksum (SHA-256) | Operador |
| --- | --- | --- | --- | --- |
| 2026-09-18 | — | — | Registro abierto — primera evidencia pendiente [ORG] | — |
|  |  |  |  |  |

## 3. Prueba anual de restauración

Restauración de un respaldo en un proyecto de prueba para verificar que el procedimiento funciona de principio a fin (SGSI §5). Se anota el ambiente usado y el resultado observado (tablas verificadas, conteos, incidencias).

| Fecha | Ambiente de la prueba | Resultado | Operador |
| --- | --- | --- | --- |
| 2026-09-18 | — | Registro abierto — primera evidencia pendiente [ORG] | — |
|  |  |  |  |
