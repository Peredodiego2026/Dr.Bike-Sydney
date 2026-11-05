-- La bio del mecanico en espanol y chino, al lado de la de ingles.
--
-- Hasta hoy `escalation_contacts.bio` era una sola: la que Diego escribe en
-- Admin > Mechanic Profiles, en ingles. La landing, la app y el seguimiento la
-- mostraban tal cual en los tres idiomas, asi que un cliente leyendo en espanol
-- o en chino veia "Proactive! His favourite jobs are..." en ingles.
--
-- Desde ahora, al guardar la bio en el admin, el servidor la traduce con IA y
-- escribe estas dos columnas. Vacias = se muestra la de ingles, nunca una
-- traduccion vieja: el admin las borra cada vez que cambia el texto en ingles.
--
-- Correr en Supabase > SQL Editor. Es idempotente. Sin esto el admin sigue
-- guardando la bio en ingles y la web sigue mostrandola en ingles: no se rompe
-- nada, solo no hay traduccion.

alter table escalation_contacts add column if not exists bio_es text;
alter table escalation_contacts add column if not exists bio_zh text;

-- Comprobacion: una fila, ok = true.
select count(*) = 2 as ok
from information_schema.columns
where table_name = 'escalation_contacts' and column_name in ('bio_es', 'bio_zh');
