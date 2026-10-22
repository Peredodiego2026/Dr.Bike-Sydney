-- Triage de la reserva: las respuestas que el cliente da en el paso 1 (marca,
-- modelo, sintoma, velocidades...), para que el mecanico sepa si lleva la pieza
-- correcta ANTES de salir en la van. Hasta hoy esas respuestas se descartaban.
--
-- Correr en Supabase > SQL Editor. Es idempotente: si la columna ya existe, no
-- hace nada, asi que correrlo dos veces es inofensivo. No toca ni borra datos.
--
-- CORRER ESTO ANTES de mergear el PR que hace que el servidor guarde el triage.
-- Ese codigo escribe la columna `triage` en CADA reserva nueva (con NULL si el
-- cliente no contesto, pero la nombra igual), y PostgREST rechaza una escritura
-- que nombra una columna que no existe: sin este script, crear una reserva
-- devuelve 500 y nadie puede reservar.
--
-- QUE GUARDA CADA COLUMNA (todas en public.bookings, todas NULL si el cliente no
-- contesto nada, que es lo normal para las reservas viejas):
--
--   triage            jsonb  Las respuestas, {"brand": "Shimano", "symptom": ...}.
--                            Las claves salen del catalogo js/triage-questions.js
--                            y las filtra el servidor; nada mas llega aca.
--   triage_photo_ref  text   Referencia a la foto del cliente en el bucket
--                            PRIVADO job-photos-private. NO una URL.
--   triage_video_ref  text   Igual, para el video corto de un ruido. Todavia no
--                            lo escribe nada: la columna queda lista para cuando
--                            haya donde subirlo (tambien una referencia).
--
-- POR QUE `triage` ES jsonb Y NO UNA COLUMNA POR PREGUNTA
--   Las preguntas cambian segun la categoria del servicio y van a seguir
--   cambiando. Con una columna por pregunta, cada vez que Diego agrega una hace
--   falta una migracion nueva, y las migraciones aca se corren a mano
--   (docs/RUNBOOK-SQL.md): nadie se acuerda. Con jsonb, agregar una pregunta es
--   editar el catalogo y nada mas.
--
-- POR QUE UNA REFERENCIA Y NO UNA URL
--   Las fotos de los trabajos pasaron a un bucket privado el 30-sep-2026
--   (api/_job-photos.js) justamente porque un link publico que se filtra sigue
--   funcionando para siempre: en un mail reenviado, en el historial del
--   navegador, en un log. Aca se guarda el camino dentro del bucket y quien
--   quiera mostrar la foto se la pide al servidor, que verifica que puede ver
--   esa reserva y firma el camino por una hora.
--
-- QUE NO ENTRA ACA
--   Las columnas de la cola de revision de Diego (estado, fecha y nota de la
--   revision) son de otro entregable y tendran su propio script.

alter table public.bookings
  add column if not exists triage jsonb,
  add column if not exists triage_photo_ref text,
  add column if not exists triage_video_ref text;

comment on column public.bookings.triage is 'Respuestas del cliente a las preguntas del triage (paso 1 de la reserva), como {id_de_pregunta: valor}. Las claves son las de js/triage-questions.js; las filtra el servidor (api/auth.js). NULL = no contesto o es una reserva anterior al triage.';
comment on column public.bookings.triage_photo_ref is 'Referencia (no URL) a la foto del triage en el bucket privado job-photos-private. Se firma al mostrarla, como el resto de las fotos de trabajos (api/_job-photos.js).';
comment on column public.bookings.triage_video_ref is 'Referencia (no URL) al video corto del triage, en un bucket privado. Reservada: todavia nada la escribe.';

-- Comprobacion: una fila, ok = true. Si dice false, falta alguna de las tres o
-- tiene otro tipo del esperado.
select count(*) = 3 as ok
from information_schema.columns
where table_schema = 'public'
  and table_name = 'bookings'
  and (   (column_name = 'triage'           and data_type = 'jsonb')
       or (column_name = 'triage_photo_ref' and data_type = 'text')
       or (column_name = 'triage_video_ref' and data_type = 'text'));
