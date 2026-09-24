-- Receta-level "Indicaciones": free-text extra instructions that print inside
-- the INDICACIONES box on the receta. The box always prints — blank leaves
-- room for the doctor to hand-write on the printed sheet.
alter table public.prescriptions
  add column if not exists indicaciones text;
