-- ============================================================
-- MIGRATION: Escuela (universidad de egreso) del médico
-- 2026-10-18
--
-- 1. doctor_profiles.escuela — dato editable en Mi Perfil / Admin.
-- 2. prescriptions.doctor_escuela — snapshot impreso en la receta
--    bajo NOMBRE DE DOCTOR / CÉDULA (mismo patrón que
--    doctor_license_number: la receta queda inmutable una vez emitida).
--
-- Ambas columnas son nullable: recetas y perfiles existentes no cambian.
-- Run this in the Supabase SQL Editor (top to bottom).
-- ============================================================

alter table public.doctor_profiles
  add column if not exists escuela text;

alter table public.prescriptions
  add column if not exists doctor_escuela text;

-- Verification
select
  (select count(*) from information_schema.columns
    where table_name = 'doctor_profiles' and column_name = 'escuela') as doctor_profiles_escuela,
  (select count(*) from information_schema.columns
    where table_name = 'prescriptions' and column_name = 'doctor_escuela') as prescriptions_doctor_escuela;
