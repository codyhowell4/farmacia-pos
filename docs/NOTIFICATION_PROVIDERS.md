# Proveedores de notificaciones / Notification providers

Guía para activar el envío real de correos y WhatsApp desde la edge function
`send-notifications`. **Hasta que se configuren los secretos, las filas de
`notification_queue` se marcan como `skipped` con `error = 'provider not
configured'` — es un no-op inofensivo, no un fallo.**

Guide to enabling real email/WhatsApp delivery from the `send-notifications`
edge function. **Until the secrets are set, `notification_queue` rows are
marked `skipped` with `error = 'provider not configured'` — a harmless
no-op, not a failure.**

## 1. Secretos de la edge function / Edge function secrets

| Secreto | Para qué / Purpose |
| --- | --- |
| `RESEND_API_KEY` | API key de [Resend](https://resend.com) para el canal `email`. Si falta, los emails se marcan `skipped`. |
| `EMAIL_FROM` | Remitente. Configurado: `Farmacia Apolo <citas@apolofarmacia.com.mx>`. El dominio (`apolofarmacia.com.mx`) está verificado en Resend. |
| `WHATSAPP_TOKEN` | Token permanente de la WhatsApp Cloud API (Meta). Cubre los canales `whatsapp` y `sms`. Si falta, esas filas se marcan `skipped`. |
| `WHATSAPP_PHONE_ID` | *Phone number ID* de Meta (no el número visible; el ID del panel de Meta). |
| `CRON_SECRET` | Opcional pero recomendado. Si existe, la función exige el header `x-cron-secret` con este valor. Genera uno aleatorio (`openssl rand -hex 32`). |

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` ya están disponibles en el
runtime de Supabase; no hay que configurarlos.

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided by the Supabase
runtime; do not set them manually.

## 2. Configurar los secretos / Setting the secrets

```bash
supabase secrets set RESEND_API_KEY=re_xxxxxxxx
supabase secrets set EMAIL_FROM="Farmacia Apolo <citas@farmaciaapolo.com>"
supabase secrets set WHATSAPP_TOKEN=EAAxxxxxxxx
supabase secrets set WHATSAPP_PHONE_ID=123456789012345
supabase secrets set CRON_SECRET=<valor-aleatorio>
```

Verifica con `supabase secrets list` (muestra nombres, no valores).

Nota WhatsApp: los mensajes de texto libre solo se entregan dentro de la
ventana de 24 h de servicio al cliente de Meta. Fuera de esa ventana se
requiere una plantilla pre-aprobada (`type: 'template'` en el mismo
endpoint); ajusta `sendWhatsApp` en `supabase/functions/send-notifications/index.ts`
si el caso de uso lo exige.

WhatsApp note: free-form text only delivers inside Meta's 24h
customer-service window; outside it you need a pre-approved template
message (same endpoint, `type: 'template'`).

## 3. Desplegar la función / Deploy

```bash
supabase functions deploy send-notifications
```

La función no exige JWT de usuario (la invoca pg_cron). Añade a
`supabase/config.toml`:

The function must not require a user JWT (it is invoked by pg_cron). Add to
`supabase/config.toml`:

```toml
[functions.send-notifications]
verify_jwt = false
```

## 4. Programar pg_cron (cada 5 minutos) / Schedule pg_cron (every 5 min)

Requiere las extensiones `pg_cron` y `pg_net` (actívalas en Dashboard →
Database → Extensions). Ejecuta en el SQL editor:

Requires the `pg_cron` and `pg_net` extensions (Dashboard → Database →
Extensions). Run in the SQL editor:

```sql
select cron.schedule(
  'send-notifications',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://ieinjhonepkudxxpmuly.supabase.co/functions/v1/send-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'TU_CRON_SECRET'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

- Sustituye `TU_CRON_SECRET` por el valor configurado en el paso 2. Si no
  usas `CRON_SECRET`, omite ese header.
- Ajusta la URL si el project ref cambia.
- Para quitar el job: `select cron.unschedule('send-notifications');`

Replace `TU_CRON_SECRET` with the value from step 2 (omit the header if you
don't use `CRON_SECRET`). To remove the job:
`select cron.unschedule('send-notifications');`

## 5. Verificar / Verify

Estado de la cola (staff con rol en la org puede hacer SELECT por RLS;
como service role desde el SQL editor):

Queue status (staff can SELECT via RLS; or as service role in the SQL
editor):

```sql
select status, count(*) from notification_queue group by status;

select id, channel, template, recipient, status, error, scheduled_for, sent_at
from notification_queue
order by created_at desc
limit 20;
```

Prueba manual sin esperar al cron (desde tu máquina):

Manual run without waiting for cron:

```bash
curl -X POST \
  https://ieinjhonepkudxxpmuly.supabase.co/functions/v1/send-notifications \
  -H 'Content-Type: application/json' \
  -H 'x-cron-secret: TU_CRON_SECRET' \
  -d '{}'
# → {"processed":N,"sent":N,"skipped":N,"failed":N}
```

Flujo esperado de extremo a extremo: crear una cita con cliente registrado
→ el trigger encola confirmación (email + whatsapp) y recordatorio 24 h
(email) → el cron las procesa → `status = 'sent'` (o `skipped` si falta el
secreto del canal, `failed` con el mensaje si el proveedor rechaza; las
filas `failed` quedan en la tabla para revisión/reintento).

Expected end-to-end flow: create an appointment for a registered customer →
the trigger enqueues a confirmation (email + whatsapp) and a 24h reminder
(email) → cron drains them → `status = 'sent'` (or `skipped` when the
channel's secret is missing, `failed` with the provider message otherwise;
`failed` rows stay in the table for review/retry).
