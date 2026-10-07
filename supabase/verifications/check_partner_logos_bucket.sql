-- verify partner-logos bucket + policies exist in production
select id, name, public, created_at from storage.buckets where id = 'partner-logos';

select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and (qual ilike '%partner-logos%' or with_check ilike '%partner-logos%');

select count(*) as objs from storage.objects where bucket_id = 'partner-logos';
