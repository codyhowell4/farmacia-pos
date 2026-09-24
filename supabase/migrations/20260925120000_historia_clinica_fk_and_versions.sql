-- MIGRATION: historia_clinica — doctor_id FK (display bug) + versioned updates
-- Date: 2026-09-25
--
-- 1) BUGFIX: historia_clinica.doctor_id was created without a foreign key,
--    so the `profiles:doctor_id(full_name)` embed in getHistoriaClinica fails
--    (PostgREST PGRST200 "could not find a relationship"). The portal then
--    shows the historia as "Pendiente" even though the row exists, and
--    retrying the capture hits unique(customer_id) → "Este paciente ya tiene
--    historia clínica". The data was never lost — only the read failed.
--
-- 2) VERSIONING: the historia stays append-only (the
--    historia_clinica_append_only trigger blocking UPDATE/DELETE is
--    untouched) but doctors may now record UPDATES as new versions:
--    unique(customer_id) is dropped in favour of a replaces_id chain +
--    version counter — the same pattern as consulta_notes. Old versions are
--    preserved forever (NOM-024 6.6.2 / LGS 245-255 integrity), the current
--    state is simply the latest version.

alter table public.historia_clinica
  add constraint historia_clinica_doctor_id_fkey
  foreign key (doctor_id) references profiles(id);

-- Version chain (append-only preserved: updates are new rows, never UPDATEs)
alter table public.historia_clinica
  add column if not exists replaces_id uuid references public.historia_clinica(id) on delete set null,
  add column if not exists version integer not null default 1;

-- One row per patient → many versions per patient
alter table public.historia_clinica drop constraint if exists historia_clinica_customer_id_key;

create index if not exists historia_clinica_customer_idx
  on public.historia_clinica (customer_id, created_at desc);
