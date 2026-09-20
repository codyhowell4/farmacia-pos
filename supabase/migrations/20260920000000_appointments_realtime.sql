-- Enable Supabase Realtime on appointments so the doctor portal's citas
-- list updates live (no manual refresh) when anyone books/changes/cancels
-- a cita — recepción, kiosko de consentimiento, customer app, otro doctor.
-- The supabase_realtime publication exists but had no tables in it.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'appointments'
  ) then
    alter publication supabase_realtime add table public.appointments;
  end if;
end $$;
