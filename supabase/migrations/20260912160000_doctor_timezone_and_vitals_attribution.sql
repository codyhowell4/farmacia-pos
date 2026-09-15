-- Doctor-local time display + nurse vitals attribution.

-- 1. Doctor's local timezone (selected in Mi Perfil or Admin → Usuarios).
--    Drives all times shown in the doctor portal (citas, HOY grouping).
alter table public.profiles add column if not exists timezone text;

-- 2. Who captured the pre-consulta vitals (attribution in the expediente).
alter table public.appointments add column if not exists nurse_vitals_by uuid references public.profiles(id);
