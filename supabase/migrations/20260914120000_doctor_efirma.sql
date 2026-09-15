-- Doctor e.firma (FIEL) file storage for automatic receta signing.
-- The .key file stays encrypted with the doctor's own SAT password (PKCS#8);
-- the password itself is never stored in the database — it lives only in the
-- doctor's browser session. efirma_cert_serial is informational (Mi perfil).
alter table public.doctor_profiles
  add column if not exists efirma_cer_base64 text,
  add column if not exists efirma_key_base64 text,
  add column if not exists efirma_cert_serial text;
