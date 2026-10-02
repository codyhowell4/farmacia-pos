-- Verify the NOM-004 first-visit historia gate against real data:
-- for each customer with completed consultas, do consulta_notes / historia_clinica
-- rows actually exist? (2nd-visit gate fires only when BOTH are missing.)

-- 1) Recent consulta notes
select 'consulta_notes' as section, id::text, customer_id::text, appointment_id::text, created_at::text
from consulta_notes order by created_at desc limit 10;

-- 2) Recent historias
select 'historia_clinica' as section, id::text, customer_id::text, doctor_id::text, created_at::text
from historia_clinica order by created_at desc limit 10;

-- 3) Customers with completed appointments: notes + historia counts
select c.full_name, c.id as customer_id, c.created_at::date as registered,
  (select count(*) from appointments a where a.customer_id = c.id and a.status = 'completed') as completed_appts,
  (select count(*) from consulta_notes cn where cn.customer_id = c.id) as consulta_notes,
  (select count(*) from historia_clinica h where h.customer_id = c.id) as historias
from customers c
where exists (select 1 from appointments a where a.customer_id = c.id and a.status = 'completed')
order by c.created_at desc
limit 40;

-- 4) Possible duplicate customer records (same normalized name + DOB)
select lower(trim(c.full_name)) as norm_name, c.date_of_birth, count(*) as records,
  string_agg(c.id::text, ', ') as ids
from customers c
where c.date_of_birth is not null
group by 1, 2
having count(*) > 1
order by 3 desc
limit 20;

-- 5) Appointments completed but with NO consulta note (draft-only or never saved?)
select a.id, a.customer_id, c.full_name, a.status, a.appointment_date::text, a.consulta_ended_at::text
from appointments a
left join customers c on c.id = a.customer_id
where a.status = 'completed'
  and a.customer_id is not null
  and not exists (select 1 from consulta_notes cn where cn.appointment_id = a.id)
order by a.appointment_date desc
limit 20;
