# RUNBOOK SQL - que scripts hay que correr en Supabase

Escrito el 2026-08-10. Para Diego. No hace falta saber SQL para usarlo: se
copia, se pega, se lee el resultado.

---

## 0. RESULTADO: el 2026-08-10 no faltaba ninguno

> **CADUCADO (2026-09-03).** Este resultado es del 10-ago y desde entonces
> **entraron 16 migraciones nuevas** (de `add-expenses-table.sql` en adelante).
> Ninguna de ellas quedo verificada contra la base por este documento. Algunas
> tienen constancia en otro lado - `fix-availability-blocks.sql` la corrio Diego
> el 16-ago, `referral-credits-spendable.sql` y `enable-realtime-bookings.sql`
> el 27-ago, y que `lock-public-views.sql` esta aplicado lo confirma
> `npm run rls:check` en cada corrida - pero **el resto no tiene constancia de
> nada**. La consulta de la seccion 3 ya las cubre a todas: hay que volver a
> correrla. Hasta entonces, "la base esta al dia" es una suposicion, no un dato.

Diego corrio la consulta de la seccion 3 contra produccion el mismo dia. **Las
30 migraciones dieron `OK`.** Ademas:

- `backfill-referral-codes-2026-07-20.sql`: **0** perfiles sin `referral_code`,
  o sea hecho.
- `add-completion-notifications.sql` (llego despues de escribir esto, del otro
  chat): la columna `bookings.completion_notifications` **existe**.

O sea que los tres que `docs/PENDIENTES.md` daba por pendientes -
`add-address-coordinates.sql` (13.1), `add-guest-bookings.sql` (seccion 14) y
`add-checkout-attempts.sql` (11.2) - **ya estaban corridos**. El documento
estaba desactualizado, no la base.

**Que sigue faltando entonces.** Nada de SQL. Lo que queda son pruebas de
verdad, que la base sola no puede demostrar y que solo puede hacer Diego:

1. Una reserva **sin iniciar sesion** desde el celular, de punta a punta, y
   comprobar que llegan el email al cliente y el WhatsApp a Diego.
2. La pagina de seguimiento de una reserva **nueva**: tiene que mostrar ETA
   (las reservas viejas quedan sin coordenadas para siempre y nunca lo van a
   mostrar).
3. El simulacro de restauracion del backup, en
   [RUNBOOK-BACKUP-RESTORE.md](RUNBOOK-BACKUP-RESTORE.md).

**El resto del documento se conserva** como esta: sirve para la proxima vez, y
para cualquier maquina o proyecto nuevo donde haya que rehacer la base desde
cero. Cuando se agregue una migracion nueva, se agrega una fila a la consulta de
la seccion 3 y se vuelve a correr.

---

## 1. Para que existe este documento

Hay codigo que ya esta en produccion y que **no funciona hasta que alguien
corra un script SQL a mano** en Supabase. Nadie tenia la lista de cuales
faltan, y `docs/PENDIENTES.md` se equivoco antes sobre este tema.

Este documento no adivina. Trae **una consulta** que le pregunta a la base cual
falta, y despues, para cada uno, que hace, que se rompe si no esta, y como se
comprueba que quedo bien.

**Nada de lo que hay aca borra datos.** Todos los scripts son `ADD COLUMN IF NOT
EXISTS`, `CREATE TABLE IF NOT EXISTS` o `CREATE INDEX IF NOT EXISTS`: si la cosa
ya existe, no hacen nada. Correr uno de mas es inofensivo. La unica excepcion
esta marcada en el paso 1 mas abajo, y trae su propio chequeo previo.

### Por que esto no se puede automatizar

Los scripts corren con permisos de dueño de la base. Ni la app ni Claude tienen
esas credenciales, y no deberian tenerlas. Los corre Diego, siempre.

---

## 2. Como se corre una consulta en Supabase

1. Entrar a https://supabase.com/dashboard y elegir el proyecto de Dr. Bike.
2. En la barra de la izquierda, **SQL Editor**.
3. **New query**.
4. Pegar el texto, apretar **Run** (o Ctrl+Enter).
5. El resultado aparece abajo, como una tabla.

Si un boton se llama distinto porque Supabase cambio la interfaz: se busca
"SQL" en el menu de la izquierda, es lo unico que hace falta.

---

## 3. LA CONSULTA. Pegar esto primero

Devuelve una tabla con una fila por migracion. Solo hay que mirar la columna
**estado**: donde diga `>>> FALTA <<<`, hay que correr ese script.

```sql
with
  col as (select table_name t, column_name c, is_nullable n
            from information_schema.columns where table_schema = 'public'),
  tbl as (select table_name t from information_schema.tables
            where table_schema = 'public' and table_type = 'BASE TABLE'),
  vw  as (select table_name v from information_schema.views where table_schema = 'public'),
  idx as (select indexname i from pg_indexes where schemaname = 'public'),
  fn  as (select p.proname f from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
            where ns.nspname = 'public'),
  pol as (select tablename t, policyname p from pg_policies where schemaname = 'public'),
  chk(n, script, que_agrega, ok) as (

  -- ── los tres que se sospechan pendientes ─────────────────────────────────
  select 1, 'add-guest-bookings.sql', 'bookings.user_id acepta NULL (reservas sin cuenta)',
    coalesce((select n = 'YES' from col where t='bookings' and c='user_id'), false)
  union all select 2, 'add-guest-bookings.sql', 'indice bookings_unique_payment_intent',
    exists (select 1 from idx where i = 'bookings_unique_payment_intent')
  union all select 3, 'add-address-coordinates.sql', 'bookings.address_lat + address_lng',
    (select count(*) = 2 from col where t='bookings' and c in ('address_lat','address_lng'))
  union all select 4, 'add-checkout-attempts.sql', 'tabla checkout_attempts',
    exists (select 1 from tbl where t = 'checkout_attempts')

  -- ── el resto, de lo mas nuevo a lo mas viejo ─────────────────────────────
  union all select 10, 'add-reminder-and-noshow-columns.sql', 'bookings.reminder_days_sent + noshow_alert_sent',
    (select count(*) = 2 from col where t='bookings' and c in ('reminder_days_sent','noshow_alert_sent'))
  union all select 11, 'add-client-language.sql', 'profiles.preferred_lang + bookings.client_lang',
    (select count(*) = 2 from col where (t='profiles' and c='preferred_lang') or (t='bookings' and c='client_lang'))
  union all select 12, 'add-card-on-file-columns.sql', 'profiles.stripe_default_payment_method_id + bookings.completion_payment_intent_id',
    (select count(*) = 2 from col where (t='profiles' and c='stripe_default_payment_method_id') or (t='bookings' and c='completion_payment_intent_id'))
  union all select 13, 'add-van-number-to-mechanics.sql', 'escalation_contacts.van_number',
    exists (select 1 from col where t='escalation_contacts' and c='van_number')
  union all select 14, 'add-preferred-mechanic-to-bookings.sql', 'bookings.preferred_mechanic_id',
    exists (select 1 from col where t='bookings' and c='preferred_mechanic_id')
  union all select 15, 'fix-discount-code-enumeration-2026-07-19.sql', 'funcion validate_discount_code',
    exists (select 1 from fn where f = 'validate_discount_code')
  union all select 17, 'harden-security-2026-07-17.sql', 'politicas y funciones de seguridad',
    (exists (select 1 from pol where t='bookings' and p='bookings_select_own_or_admin')
     and exists (select 1 from fn where f='consume_discount_code')
     and exists (select 1 from fn where f='decrement_part_stock'))
  union all select 18, 'create-public-reviews-view.sql', 'vista public_reviews',
    exists (select 1 from vw where v = 'public_reviews')
  union all select 19, 'create-gift-cards-table.sql', 'tabla gift_cards',
    exists (select 1 from tbl where t = 'gift_cards')
  union all select 20, 'add-stripe-events.sql', 'tabla stripe_events',
    exists (select 1 from tbl where t = 'stripe_events')
  union all select 21, 'add-performance-indexes.sql', 'los 5 indices de rendimiento',
    (select count(*) = 5 from idx where i in ('idx_bookings_scheduled_date','idx_bookings_status',
      'idx_bookings_client_date','idx_bookings_mechanic','idx_mechloc_van'))
  union all select 22, 'add-discount-to-bookings.sql', 'bookings.discount_applied + discount_code',
    (select count(*) = 2 from col where t='bookings' and c in ('discount_applied','discount_code'))
  union all select 24, 'referral-credits-spendable.sql', 'columna + las 2 funciones de credito',
    (exists (select 1 from col where t='bookings' and c='referral_credit_applied')
     and exists (select 1 from fn where f='spend_referral_credits')
     and exists (select 1 from fn where f='refund_referral_credits'))
  union all select 23, 'add-cancellation-reason.sql', 'bookings.cancellation_reason',
    exists (select 1 from col where t='bookings' and c='cancellation_reason')
  -- Numerado 16 y no 24: hasta 2026-09-03 esta fila y la de
  -- referral-credits-spendable compartian el numero 24, asi que la tabla salia
  -- con dos filas "#24" distintas y no habia forma de nombrar una sin ambiguedad.
  union all select 16, 'create-van-inventory-table.sql', 'tabla van_inventory',
    exists (select 1 from tbl where t = 'van_inventory')
  union all select 25, 'create-newsletter-table.sql', 'tabla newsletter_subscribers',
    exists (select 1 from tbl where t = 'newsletter_subscribers')
  union all select 26, 'create-bikes-table.sql', 'tabla bikes + bookings.bike_id',
    (exists (select 1 from tbl where t='bikes') and exists (select 1 from col where t='bookings' and c='bike_id'))
  union all select 27, 'add-tracking-token.sql', 'bookings.tracking_token',
    exists (select 1 from col where t='bookings' and c='tracking_token')
  -- Las 5 columnas Y el indice. Mirar solo las columnas daba VERDE con la
  -- migracion a medias: hasta 2026-08-11 la linea 13 del .sql creaba el indice
  -- sobre `service_type`, columna que no existe, y Postgres aborta el script
  -- ahi - los ALTER de arriba aplicaron y el indice y los COMMENT no. Un
  -- chequeo que no mira lo ultimo que hace un script no puede detectar que se
  -- corto por la mitad (docs/PENDIENTES.md 12.28).
  union all select 28, 'add-service-timing-columns.sql', 'las 5 columnas de tiempos + el indice',
    ((select count(*) = 5 from col where t='bookings' and c in ('started_at','completed_at',
      'service_duration_seconds','pre_service_checklist','pre_service_notes'))
     and exists (select 1 from pg_indexes where schemaname='public'
                 and indexname='idx_bookings_service_timing'))
  union all select 29, 'add-service-reminder-column.sql', 'bookings.next_service_reminder_sent',
    exists (select 1 from col where t='bookings' and c='next_service_reminder_sent')
  union all select 30, 'add-mechanic-profile-columns.sql', 'las 5 columnas de perfil del mecanico',
    (select count(*) = 5 from col where t='profiles' and c in ('avatar_url','bio','years_experience','phone','mechanic_zone'))
  union all select 31, 'add-reengagement-to-profiles.sql', 'profiles.reengagement_sent_at',
    exists (select 1 from col where t='profiles' and c='reengagement_sent_at')
  union all select 32, 'add-birthday-to-profiles.sql', 'profiles.birthday + birthday_promo_sent_year',
    (select count(*) = 2 from col where t='profiles' and c in ('birthday','birthday_promo_sent_year'))
  union all select 33, 'add-abandoned-recovery-to-bookings.sql', 'bookings.abandoned_recovery_sent',
    exists (select 1 from col where t='bookings' and c='abandoned_recovery_sent')
  union all select 34, 'add-bookings-rls.sql / harden-bookings-rls.sql', 'RLS encendido en bookings',
    coalesce((select relrowsecurity from pg_class where oid = 'public.bookings'::regclass), false)
  union all select 35, 'add-booking-unique-constraint.sql', 'indice bookings_unique_slot',
    exists (select 1 from idx where i = 'bookings_unique_slot')
  union all select 36, 'migrate-inventory-push.sql', 'tabla parts_inventory + profiles.push_subscription',
    (exists (select 1 from tbl where t='parts_inventory') and exists (select 1 from col where t='profiles' and c='push_subscription'))
  union all select 38, 'add-expenses-table.sql', 'tabla expenses (la que alimenta el P&L)',
    exists (select 1 from tbl where t='expenses')
  union all select 37, 'add-completion-notifications.sql', 'bookings.completion_notifications',
    exists (select 1 from col where t='bookings' and c='completion_notifications')
  union all select 39, 'fix-availability-blocks.sql', 'availability: service_id nullable + indice unico (date,time_slot,van_number)',
    (coalesce((select n = 'YES' from col where t='availability' and c='service_id'), false)
     and exists (select 1 from idx where i = 'availability_date_time_slot_van_number_key'))
  union all select 40, 'add-availability-reason.sql', 'availability.reason',
    exists (select 1 from col where t='availability' and c='reason')
  union all select 41, 'add-availability-rls.sql', 'las 4 policies de admin en availability',
    (select count(*) = 4 from pol where t='availability' and p like 'availability_admin_%')
  union all select 42, 'add-mechanic-locations-admin-select.sql', 'policy de admin en mechanic_locations',
    exists (select 1 from pol where t='mechanic_locations' and p = 'mechanic_locations_admin_select')
  union all select 43, 'add-parts-cost-actual.sql', 'bookings.parts_cost_actual (costo real de repuestos por trabajo)',
    exists (select 1 from col where t='bookings' and c='parts_cost_actual')
  union all select 44, 'add-geo-cache.sql', 'tabla geo_cache (cache de direcciones y rutas)',
    exists (select 1 from tbl where t = 'geo_cache')
  -- Las dos de abajo faltaban en esta consulta hasta 2026-09-03. No son
  -- columnas ni tablas, que es por que se pasaron por alto: una es una
  -- publicacion y la otra son permisos. Ninguna deja rastro en
  -- information_schema.columns, que es donde mira casi todo lo de arriba.
  union all select 45, 'enable-realtime-bookings.sql', 'las 3 tablas en la publicacion supabase_realtime + replica identity full en bookings',
    ((select count(*) = 3 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and tablename in ('bookings','mechanic_locations','job_messages'))
     and coalesce((select relreplident = 'f' from pg_class
                     where oid = 'public.bookings'::regclass), false))
  -- Esta es la unica fila de la tabla que se pone en rojo por algo que SOBRA
  -- en vez de por algo que falta: mide que anon y authenticated NO tengan
  -- permiso de escritura sobre las dos vistas publicas. Con la vista corriendo
  -- con los privilegios de su dueño, un UPDATE ahi escribe en `bookings` sin
  -- que RLS se entere. Fue una fuga real, verificada en produccion el 30-ago.
  union all select 46, 'lock-public-views.sql', 'anon/authenticated sin escritura en las vistas publicas, y public_booking_tracking sin ningun permiso',
    (not exists (select 1 from information_schema.role_table_grants
                   where table_schema = 'public'
                     and table_name in ('public_reviews','public_booking_tracking')
                     and grantee in ('anon','authenticated')
                     and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'))
     and not exists (select 1 from information_schema.role_table_grants
                       where table_schema = 'public'
                         and table_name = 'public_booking_tracking'
                         and grantee in ('anon','authenticated')))
)
select n as "#", script, que_agrega as "que agrega",
       case when ok then 'OK' else '>>> FALTA <<<' end as estado
from chk order by n;
```

**Como se lee el resultado:** 41 filas. Las que digan `OK` ya estan hechas y no
hay que tocarlas. Las que digan `>>> FALTA <<<` se corren siguiendo el orden de
la seccion 5, saltando las que dieron OK.

Los numeros de la columna `#` **no son un orden y tienen huecos** (no hay 5 a 9).
Son etiquetas estables: sirven para nombrar una fila en un chat sin ambiguedad,
nada mas. Lo unico que hay que mirar es la columna `estado`.

Falta un script en esa lista a proposito:
`backfill-referral-codes-2026-07-20.sql` no agrega ninguna columna, arregla
datos, asi que se pregunta aparte (y va en su propia consulta para que, si la
columna `referral_code` no existiera, no tire abajo la consulta grande):

```sql
select count(*) as perfiles_sin_codigo_de_referido
from public.profiles where referral_code is null;
```

`0` = hecho. Cualquier otro numero = hay que correr ese script.

Si la consulta entera da error en vez de tabla, copiar el mensaje de error y
pasarlo: significa que algo mas basico no esta como se supone.

### 3.1 Cuatro tablas sin historial de migracion conocido (auditoria 2026-08-23)

`callout_zones`, `waitlist`, `claims` y `notification_log` se usan desde el
codigo (`.from('...')`) pero **no tienen ningun script en `scripts/` que las
cree ni aparecen en la consulta de arriba** - nadie sabe si tienen RLS y
policies como corresponde. No es que esten rotas: es que nunca se verificaron.
Importa porque `availability` era exactamente asi ("siempre se asumio bien") y
en agosto resulto que le faltaban TODAS las policies de admin (items 41-42).

Esta consulta no cambia nada, solo reporta el estado de RLS de las cuatro:

```sql
select
  c.relname as tabla,
  case when c.relrowsecurity then 'RLS ON' else '>>> RLS OFF <<<' end as rls,
  coalesce((select count(*) from pg_policies p
            where p.schemaname = 'public' and p.tablename = c.relname), 0) as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in ('callout_zones','waitlist','claims','notification_log')
order by c.relname;
```

**Como se lee:** una fila por tabla que exista. `RLS OFF` con `0 policies` en
una tabla con datos de clientes (`waitlist`, `claims`, `notification_log`)
significa que cualquiera con la anon key la puede leer entera - pasarlo para
decidir que policies necesita cada una. `callout_zones` es catalogo publico de
precios, `RLS OFF` ahi es menos grave pero igual conviene saberlo. Si una tabla
no aparece en el resultado, es que no existe con ese nombre - avisar cual.

**RESULTADO (Diego lo corrio el 2026-08-23): las cuatro estan bien, no hace
falta ningun script.**

| tabla | rls | policies | veredicto |
|---|---|---|---|
| `callout_zones` | RLS ON | 2 | OK - catalogo publico de precios |
| `waitlist` | RLS ON | 2 | OK |
| `claims` | RLS ON | **0** | **OK, y a proposito** - ver abajo |
| `notification_log` | RLS ON | **0** | **OK, y a proposito** - ver abajo |

`claims` y `notification_log` con RLS ON y **cero policies** parece alarmante
pero es lo correcto: en Postgres, RLS activo sin ninguna policy **niega a
todos**, y el `service_role` key saltea RLS por diseño. Se verifico en el
codigo que a esas dos tablas **solo las toca el servidor**, nunca el navegador:

- `claims`: `api/auth.js` - el insert publico del formulario de reclamo y los
  dos handlers de admin (`handleAdminClaimsList` / `handleAdminClaimsUpdate`,
  ambos detras de `verifyAdminSession`), todos con el service key.
- `notification_log`: `api/send-message.js:39`, un solo insert con service key.

O sea que el 0-policies es lo que mantiene esas tablas cerradas al navegador.
**No agregarles policies**: hacerlo abriria acceso que hoy esta correctamente
denegado. Esto se verifico porque `availability` tenia el mismo perfil
"nadie lo miro nunca" y ahi si faltaban policies de verdad (items 41-42) - aca
el patron resulto sano.

---

## 4. Lo que ya se puede afirmar sin correr nada

Dos cosas se deducen del codigo que hoy funciona en produccion, y sirven para
no perder tiempo:

**a) Todo lo que entra en el alta de una reserva ya existe.** `api/auth.js`
inserta una reserva con esta lista de columnas: `user_id`, `client_id`,
`client_name`, `client_email`, `client_phone`, `service_name`, `service_price`,
`callout_fee`, `scheduled_date`, `scheduled_time`, `address`, `status`,
`van_number`, `preferred_mechanic_id`, `stripe_payment_intent_id`, `bike_id`,
`utm_source`, `utm_medium`, `utm_campaign`, `client_lang`. Supabase rechaza el
alta **entera** si una sola de esas columnas no existe. Como hoy se pueden
crear reservas con cuenta, todas existen. Eso cubre los numeros 11, 13, 14, 26
y 27 de la tabla de arriba.

**b) Faltar una columna no siempre se nota.** Tres lugares del codigo estan
escritos para aguantar la migracion pendiente y no romper nada visible:

- `api/auth.js:2478` pide `address_lat`/`address_lng` en una consulta aparte y,
  si falla, vuelve a pedir sin ellas. La pagina de seguimiento **funciona igual,
  sin ETA**, y solo deja un aviso en los logs.
- `api/stripe-webhook.js:359` consulta `stripe_events` dentro de un `try` vacio.
  Si la tabla no esta, el webhook sigue, pero **pierde la proteccion contra
  procesar el mismo pago dos veces**.
- `js/app.js:1690` registra el intento de checkout y, si falla, solo escribe
  `[checkout_attempts] not recorded` en la consola del navegador.

Por eso "la app anda" no prueba que las migraciones esten. Hay que preguntarle
a la base.

**c) Uno ya esta confirmado por escrito.** El punto 2.2 de `docs/PENDIENTES.md`
dice que Diego corrio `add-card-on-file-columns.sql` contra produccion el 27 de
julio y que las dos columnas existen. Es el numero 12 de la tabla: deberia dar
`OK`. Si diera `FALTA`, algo raro paso y conviene avisar antes de correr nada
mas.

---

## 5. Orden en que se corren, y que se rompe si no

> **Al 2026-08-10 no hay que correr ninguno** (ver seccion 0). Todo lo que sigue
> queda como referencia: para cuando aparezca una migracion nueva, y como
> registro de para que sirve cada una y que se pierde si falta.

El orden importa poco entre migraciones distintas, pero **importa mucho dentro
del paso 1**. La lista va de mayor a menor daño.

### Paso 1 - `scripts/add-guest-bookings.sql` (URGENTE, y con chequeo previo)

**Que hace.** Dos cosas: permite que una reserva no tenga cuenta de usuario
(`bookings.user_id` pasa a aceptar NULL), y crea un indice unico que impide que
un mismo pago genere dos reservas.

**Que se rompe si no esta.** Esto es lo peor de la lista: **se le cobra a
alguien y no queda reserva**. El alta con `user_id: null` es rechazada por la
base, pero el cobro de Stripe ya paso. Es exactamente el incidente del 5 de
agosto (seccion 14 de `docs/PENDIENTES.md`): una clienta pago $20 con Apple Pay
y no hubo reserva, ni email, ni WhatsApp, ni nada en el panel. El paso de
contacto de invitado ya esta en produccion (`js/app.js`), asi que **el camino
que provoca esto esta abierto hoy**.

**ANTES de correrlo, correr esto solo:**

```sql
select stripe_payment_intent_id, count(*)
from bookings
where stripe_payment_intent_id is not null
group by stripe_payment_intent_id
having count(*) > 1;
```

- **0 filas** (lo esperado): seguir, correr el script completo.
- **1 o mas filas**: **PARAR y avisar.** Hay un pago con dos reservas colgadas.
  El indice unico va a fallar al crearse, y ademas hay datos que arreglar
  primero. No borrar nada por cuenta propia.

**Como se verifica despues:**

```sql
select
  (select is_nullable from information_schema.columns
     where table_name='bookings' and column_name='user_id')            as user_id_acepta_null,
  (select count(*) from pg_indexes
     where indexname='bookings_unique_payment_intent')                  as indice_creado;
```

Tiene que dar `YES` y `1`.

**Prueba de verdad (la hace Diego, no automatica):** desde el celular, sin
iniciar sesion, empezar una reserva. Tiene que aparecer la hoja "Where do we
send your booking?", y al terminar tiene que llegar el email de confirmacion y
el WhatsApp al numero de Diego. Hasta que esa prueba no se haga, la reserva sin
cuenta no esta comprobada.

---

### Paso 2 - `scripts/add-checkout-attempts.sql`

**Que hace.** Crea la tabla `checkout_attempts`, donde queda registrado cada
intento de reserva que llego al paso de pago y no termino.

**Que se rompe si no esta.** Dos cosas, las dos silenciosas:

1. El recordatorio de checkout abandonado (`api/send-cron.js`) no encuentra
   nada nunca. Cada persona que abandona a mitad de la reserva se pierde y no
   se le escribe. No hay error visible: la tabla vacia y la tabla inexistente
   se comportan casi igual.
2. La pestaña de analitica del admin no puede mostrar cuantos abandonan.
   `api/auth.js:3392` esta preparado para este caso y devuelve el mensaje
   `Table checkout_attempts does not exist yet - run scripts/add-checkout-attempts.sql`.

**Atajo para saberlo sin la consulta grande:** abrir el panel de admin, ir a
analitica. Si aparece ese texto con el nombre del script, falta correrlo.

**Como se verifica despues:**

```sql
select count(*) as tabla_existe from information_schema.tables
where table_schema='public' and table_name='checkout_attempts';
```

Tiene que dar `1`. Despues, hacer una reserva de prueba hasta la pantalla de
pago y **abandonarla ahi**; al rato:

```sql
select id, created_at, service_name from checkout_attempts order by created_at desc limit 5;
```

Tiene que aparecer esa fila.

---

### Paso 3 - `scripts/add-address-coordinates.sql`

**Que hace.** Agrega `address_lat` y `address_lng` a `bookings`, para que la
direccion del cliente se convierta a coordenadas **una sola vez, en el
servidor**, cuando se crea la reserva.

**Que se rompe si no esta.** Nada visible, y ese es el problema. Es el punto
13.1: la pagina de seguimiento calcula el ETA, y sin estas columnas el codigo
simplemente no muestra ETA. Pero el motivo por el que se hizo la migracion es
de privacidad: la version vieja mandaba **la direccion completa del cliente**
a `nominatim.openstreetmap.org` desde el navegador, en la URL, en cada carga de
la pagina de seguimiento. Los servidores guardan las URLs en sus logs por
defecto.

El codigo nuevo ya esta en produccion y **no** vuelve a mandar la direccion:
prefiere no mostrar ETA. O sea que hoy la privacidad esta bien y la funcion
esta a medias. Correr el script devuelve el ETA.

**Como se verifica despues:**

```sql
select column_name from information_schema.columns
where table_name='bookings' and column_name in ('address_lat','address_lng');
```

Tienen que aparecer las dos filas. Ojo: las reservas **viejas** quedan en NULL
para siempre y nunca van a mostrar ETA. Solo las nuevas. Para comprobar que de
verdad se esta llenando, despues de crear una reserva nueva:

```sql
select id, address_lat, address_lng, created_at
from bookings order by created_at desc limit 3;
```

Si la reserva mas nueva tiene numeros en las dos columnas, funciona.

---

### Paso 4 - las que la consulta marque `>>> FALTA <<<` y no esten arriba

Si alguna de las filas 10 a 36 sale `FALTA`, se corre ese script tal cual esta
en `scripts/`, y se vuelve a correr la consulta de la seccion 3 para confirmar
que paso a `OK`. Resumen de que se pierde en cada caso:

| # | Script | Que deja de andar |
|---|---|---|
| 10 | `add-reminder-and-noshow-columns.sql` | El recordatorio del dia anterior y el aviso de que el cliente no aparecio. El cron los intenta y falla. |
| 12 | `add-card-on-file-columns.sql` | Guardar la tarjeta del cliente para cobrar al terminar el trabajo. |
| 15 | `fix-discount-code-enumeration-2026-07-19.sql` | Los codigos de descuento dejan de validarse (la app llama a una funcion que no existe). Ademas, sin esto cualquiera puede listar todos los codigos. |
| 16 | `backfill-referral-codes-2026-07-20.sql` | Los codigos de referido de los clientes viejos siguen en blanco: quien los use recibe "Invalid referral code". No es una columna, es un arreglo de datos. |
| 17 | `harden-security-2026-07-17.sql` | Seguridad: RLS y funciones. Si falta, hay datos accesibles que no deberian serlo. Correrlo es seguro y se puede repetir. |
| 18 | `create-public-reviews-view.sql` | Las reseñas de la home y la landing no cargan. |
| 19 | `create-gift-cards-table.sql` | Las gift cards (compra y canje). |
| 20 | `add-stripe-events.sql` | La proteccion contra procesar dos veces el mismo aviso de Stripe. Sin esto, un reintento de Stripe puede duplicar efectos. |
| 21 | `add-performance-indexes.sql` | Nada se rompe: el admin y la agenda van mas lentos a medida que crecen las reservas. |
| 22 | `add-discount-to-bookings.sql` | El descuento aplicado no queda guardado en la reserva. |
| 23 | `add-cancellation-reason.sql` | El motivo de cancelacion no se guarda. |
| 24 | `create-van-inventory-table.sql` | El inventario de la van en la app del mecanico. |
| 25 | `create-newsletter-table.sql` | La suscripcion al newsletter. |
| 28 | `add-service-timing-columns.sql` | El checklist previo, los tiempos de servicio y la duracion que sale en la factura. |
| 29 | `add-service-reminder-column.sql` | El recordatorio de "toca el proximo service". |
| 30 | `add-mechanic-profile-columns.sql` | Foto, bio y zona del mecanico. |
| 31 | `add-reengagement-to-profiles.sql` | El email a clientes que hace mucho no vuelven. |
| 32 | `add-birthday-to-profiles.sql` | El email de cumpleaños. |
| 38 | `add-expenses-table.sql` | Los gastos reales. Sin ella el P&L no tiene costos que restar y muestra ingresos, no ganancia. |
| 33 | `add-abandoned-recovery-to-bookings.sql` | La marca de "ya le mande el email de recupero" - sin ella se podria mandar repetido. |
| 34 | `add-bookings-rls.sql` + `harden-bookings-rls.sql` | Seguridad grave: sin RLS, un cliente puede leer las reservas de otro. Si sale FALTA, es lo primero de todo. |
| 35 | `add-booking-unique-constraint.sql` | Dos clientes pueden reservar el mismo horario con la misma van. |
| 36 | `migrate-inventory-push.sql` | Inventario de repuestos y notificaciones push. |
| 39 | `fix-availability-blocks.sql` | El boton Block availability no guarda nada - 42703 en `blocked`, columna que nunca existio. Diego ya lo corrio el 16-ago; se agrega aca para que un entorno nuevo sepa que hace falta. |
| 40 | `add-availability-reason.sql` | Bloquear un horario sigue fallando incluso con el 39 corrido: el campo "Reason" del modal no tiene columna donde caer, 42703 de nuevo pero en `reason`. Encontrado el 16-ago probando el boton en produccion (`docs/PENDIENTES.md` 21.5). |
| 41 | `add-availability-rls.sql` | Con las columnas ya bien, el boton sigue fallando: 403 "new row violates row-level security policy". `availability` nacio semanas despues de `harden-security-2026-07-17.sql` y nunca recibio sus policies de admin, a diferencia de `van_zones`, que usa el mismo patron de escritura desde el navegador. Sin esto, ni Block ni Unblock pueden escribir nunca (`docs/PENDIENTES.md` 21.7). |
| 42 | `add-mechanic-locations-admin-select.sql` | El mapa en vivo de vans del admin (`docs/PENDIENTES.md` 25.6) no muestra ninguna van: `mechanic_locations` solo tiene policy para el cliente con una reserva activa, nunca para el admin. Sin esto el mapa queda vacio para siempre, sin ningun error visible. |
| 44 | `add-geo-cache.sql` | Cache de direcciones y rutas. Sin esto la app **sigue funcionando**, pero cada consulta de cobertura, cada calculo de precio y cada tecla del autocompletado pega contra Nominatim y OSRM, que son servidores publicos gratuitos con limite de 1 consulta por segundo. Con poco volumen no se nota; con volumen empiezan a fallar los calculos de ruta y -esto es lo grave- **falla en silencio**: la cobertura cae a la tabla de zonas y clientes que deberian recibir un precio terminan en la cola manual de WhatsApp sin que nadie sepa por que. |

---

## 6. Chequeo final, despues de correr todo

Volver a pegar la consulta de la seccion 3. **Las 38 filas tienen que decir
`OK`.** Eso es la prueba de que la base quedo como el codigo espera.

Despues, tres pruebas de las de verdad, que la base sola no puede demostrar:

1. **Reserva sin cuenta**, desde el celular, sin iniciar sesion. Tiene que
   llegar el email al cliente y el WhatsApp a Diego.
2. **Pagina de seguimiento** de una reserva nueva: tiene que mostrar el ETA.
3. **Panel de admin, analitica**: no tiene que aparecer el mensaje de
   `checkout_attempts does not exist`.

---

## 7. Correccion a `docs/PENDIENTES.md` 14.7

La tabla del punto 14.7 lista los cuatro pasos como si estuvieran cada uno en su
rama sin mergear. **Ya no es cierto: los cuatro estan en `main` y en
produccion.** Verificado el 2026-08-10 leyendo el codigo:

| Paso | Donde esta en `main` |
|---|---|
| 1. `user_id` nullable + indice unico | `scripts/add-guest-bookings.sql` (el archivo esta; **el SQL puede seguir sin correrse** - es el paso 1 de este runbook) |
| 2. Los datos viajan en el PaymentIntent | metadata `bk_*`, leida en `api/stripe-webhook.js:292` en adelante |
| 3. El webhook crea la reserva | `api/stripe-webhook.js:372`, `case 'payment_intent.succeeded'`; el filtro `shouldCreateBookingFor()` esta en la linea 263 |
| 4. Paso de contacto de invitado | `js/app.js:1429`, la hoja "Where do we send your booking?" |

La distincion que la tabla borraba y que este runbook existe para marcar: **que
el codigo este mergeado no quiere decir que la base este lista.** El paso 1 es
mitad codigo (hecho) y mitad SQL (a confirmar).

---

## 8. Que este documento NO sabe

- **No se cuales ya corriste.** No tengo acceso a tu Supabase. Todo lo que dice
  "FALTA" o "OK" sale de la consulta que corres vos, no de una afirmacion mia.
- **La lista sale de los 31 archivos en `scripts/`.** Si alguna vez corriste SQL
  pegado a mano en el editor y no quedo como archivo en el repo, no esta aca.
- **No verifique que los scripts corran sin error** contra tu base real. Los lei
  y todos usan `IF NOT EXISTS`, pero eso es leer, no correr.
- **Los nombres de los botones de Supabase** pueden haber cambiado desde que se
  escribio esto.

Para probar la restauracion del backup, ver
[RUNBOOK-BACKUP-RESTORE.md](RUNBOOK-BACKUP-RESTORE.md).

---

## 9. Las tres preguntas de la tabla `availability` (2026-08-16)

El boton "Block availability" del admin **nunca guardo nada** (ver
`docs/PENDIENTES.md` seccion 21: escribe una columna `blocked` que no existe,
la columna se llama `available`). Antes de arreglarlo hay que saber tres cosas
de la base, y ninguna se puede averiguar desde el codigo. Se copia esto entero
en el SQL editor de Supabase y se pega el resultado en el chat.

```sql
-- 1. Columnas de `availability`, tipos y valores por defecto.
--    Interesa la fila `available`: si su default es `true`, una fila nueva
--    nace "disponible" y bloquear exige escribir `available = false` a mano.
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'availability'
order by ordinal_position;

-- 2. Indices de la tabla.
--    js/admin.js hace upsert con onConflict 'date,time_slot,van_number'. Si
--    NO aparece un indice UNIQUE sobre esas tres columnas, el upsert va a
--    seguir fallando aunque se corrija el nombre de la columna.
select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'availability';

-- 3. Cuantos bloqueos hay guardados hoy.
--    Se espera 0: el boton nunca escribio. Si sale mas que 0, alguien los
--    cargo por otra via y hay que mirarlos antes de tocar nada.
select count(*) as filas_guardadas from public.availability;
```

### 9.0 RESPONDIDO: Diego lo corrio el 2026-08-16

```
columna  available    true                              | boolean | nullable=YES
columna  date         (sin default)                     | date    | nullable=NO
columna  id           nextval('availability_id_seq')    | bigint  | nullable=NO
columna  service_id   (sin default)                     | text    | nullable=NO
columna  time_slot    (sin default)                     | text    | nullable=NO
columna  van_number   1                                 | integer | nullable=YES

indice   availability_date_service_id_time_slot_van_number_key   CREATE UNIQUE INDEX
indice   availability_pkey                                       CREATE UNIQUE INDEX
indice   idx_availability_date_service                           CREATE INDEX

filas guardadas  availability  0
```

**0 filas** confirma lo que decia la seccion 21: el boton nunca escribio nada.

Lo que no esperabamos: hay **dos bloqueos mas** ademas del nombre de la columna.

1. `service_id` es `text NOT NULL` **sin default**, y `saveBlocks()` no lo manda.
   El insert falla igual aunque se corrija `blocked` -> `available`.
2. El indice unico es sobre **cuatro** columnas -
   `(date, service_id, time_slot, van_number)`, se lee en el nombre que Postgres
   le genero. El `upsert` pide `onConflict: 'date,time_slot,van_number'`, que no
   corresponde a ningun indice unico: PostgREST contesta 42P10.

Y confirmado: `available` nace en `true`, asi que bloquear exige escribir
`available: false` explicito.

### 9.2 Por que esto no se cierra con un parche

La tabla esta disenada **por servicio** (`service_id NOT NULL`, y dentro de la
clave unica). El modal del admin no pregunta por servicio: Diego bloquea *un
horario*, no *un horario de un servicio*. Son dos modelos distintos, y elegir
entre ellos es una decision de producto:

- **A.** Un bloqueo tapa el horario entero. Pide que `service_id` deje de ser
  NOT NULL (o un valor centinela) y rehacer el indice unico. Es lo que la UI
  ya promete hoy.
- **B.** Un bloqueo es por servicio. Hay que agregar el selector al modal, y
  bloquear "las 8:00" pasa a ser una fila por cada servicio del catalogo.

Cualquiera de las dos toca el esquema, asi que va con su propio script en
`scripts/` y su fila en la tabla de la seccion 3.

Aparte del esquema siguen abiertos dos del lado del codigo: el lector
(`api/auth.js`, `handleGetAvailability`) selecciona `time_slot, available`
filtrando solo por `date` - **ignora `service_id` y `van_number`** -, y compara
`time_slot` (`'8:30'`, 24h, media hora) contra las etiquetas de `ALL_SLOTS`
(`'8:00 AM'`), que no coinciden nunca.

Y `unblockDate()` (`js/admin.js`) filtra por `.eq('blocked', true)`, la misma
columna inexistente: **el boton de desbloquear tampoco funciona.**

### 9.3 El `max-rows` del proyecto ya no bloquea nada

Estaba anotado como pendiente ("Supabase > Settings > API > Max rows"). **Dejo
de hacer falta**: el panel ya no cuenta filas recibidas para sacar totales.
Clientes pide los tres contadores con `count: 'exact', head: true` (los cuenta
la base, no llega ni una fila) y Analytics compara contra el conteo real en vez
de contra el `.limit()` que pidio. Sea cual sea el tope, los numeros son
ciertos y el aviso de "se leyeron solo N de M" aparece cuando corresponde.

Sigue siendo util saberlo por rendimiento, pero ya no hay ningun numero en
pantalla que dependa de ese valor.

## 10. `referral-credits-spendable.sql` (26-ago-2026)

**Sin correr esto, el credito por recomendacion se sigue sin poder gastar.**

`handleApplyReferral()` acredita a las dos partes de una recomendacion, y hasta
esta migracion **nada restaba ese numero nunca**. Las unicas dos escrituras a
`referral_credits` en todo el repo eran incrementos. El cliente compartia su
codigo, veia "Credits earned $30" en su perfil, y en la caja el dinero no
existia.

Agrega `bookings.referral_credit_applied` y dos funciones,
`spend_referral_credits()` y `refund_referral_credits()`.

**El codigo no se rompe si todavia no la corriste.** Ninguna consulta nombra la
columna nueva salvo la de cancelacion, que la pide aparte y sobrevive a que
falte; el gasto en la reserva loguea y sigue. Simplemente el credito no se
descuenta hasta que corras el archivo.


## 11. `lock-public-views.sql` (30-ago-2026) — URGENTE

**Es la unica migracion de esta lista que tapa un agujero abierto ahora mismo.**
Las demas agregan una funcionalidad que falta; esta cierra la direccion de los
clientes, que hasta que se corra la puede leer cualquiera.

Verificado contra produccion el 30-ago-2026, sin ninguna credencial mas que la
anon key que la propia pagina publica:

```
GET  /rest/v1/public_booking_tracking?select=*   -> 200, cada reserva con su tracking_token
POST /api/auth?role=public-track {tracking_token} -> 200, direccion + arrival_pin + GPS
PATCH /rest/v1/public_reviews?id=eq.<uuid>        -> 204, escritura anonima sobre bookings
```

Causa raiz: una vista de Postgres corre con los privilegios de su **dueno**, y
Supabase le da a `anon` **todos** los privilegios sobre los objetos nuevos de
`public`. Las dos vistas se crearon owner-privileged a proposito para poder
mostrar una porcion filtrada de `bookings`; el efecto no buscado fue que las
escrituras tambien esquivan RLS, y que la vista de tracking publicaba la
credencial que `api/auth.js` trata como prueba de propiedad.

`api/auth.js` no tiene nada que arreglar. El codigo era correcto y la base lo
contradecia — motivo por el cual el guard vive en dos lugares:
`tests/unit/public-views-locked.test.js` (en CI, lee los .sql) y
`scripts/rls-check.mjs` (`npm run rls:check`, pega contra la base real).

**El codigo no se rompe si todavia no la corriste** — al reves: hoy la app
anda, y correrla no cambia nada de lo que el usuario ve. Nada en el repo
consulta `public_booking_tracking` (grepeado entero), y `public_reviews`
conserva el `GRANT SELECT` del que dependen `index.html:2232` y
`js/landing-inline.js:614` para los testimonios.

**Como saber que quedo bien:** el archivo termina con un `SELECT` que lista las
vistas y sus permisos. Tiene que decir `public_booking_tracking ->
(no public access)` y `public_reviews -> SELECT`. Cualquier otra cosa, o
cualquier otra vista con un permiso de escritura, sigue abierta. Despues corre
`npm run rls:check` desde el repo: tiene que salir en verde y con exit 0.

---

## 12. `check-mechanic-pin-columns.sql` (31-ago-2026, corregido el 03-sep)

**Este documento decia que habia PINs legibles en la base. Era falso.**

La version anterior de esta seccion mandaba correr un script para limpiar una
columna `pin` en texto plano en `escalation_contacts`. Diego lo corrio el
03-sep y fallo en la primera consulta:

```
ERROR: 42703: column "pin" does not exist
```

**Esa columna no existe.** Nunca hubo PINs legibles. El unico dato del PIN que
guarda la base es `pin_hash`, que es de una via.

**De donde salio el error.** Lo escribi leyendo `api/auth.js`, que consultaba
`c.pin` como camino alternativo, en vez de preguntarle a la base. Es
exactamente el error que este documento existe para evitar: el codigo mergeado
no prueba lo que hay en la base.

**Lo que destapo, y si era un problema de verdad.** Al no existir la columna,
`handleAdminSetMechanicPin` la nombraba igual al guardar (`pin: null`), y
PostgREST rechaza una escritura que menciona una columna inexistente. O sea que
el boton **Reset PIN devolvia error 500 para todos**. Arreglado en el mismo PR.

**El script que queda es de solo lectura** y no cambia nada. Sirve para dos
cosas:

1. Confirmar que las columnas del PIN son las que se esperan (solo `pin_hash`).
   Si alguna vez aparece una columna `pin`, **eso si** es un problema y hay que
   migrar los valores a `pin_hash` y borrarla.
2. Ver que contactos no tienen PIN puesto, o sea que no pueden entrar a
   `mechanic.html`. Se arregla desde
   **Settings > Notification Numbers > editar el contacto > Reset PIN**.

**Ojo con la ruta:** el PIN NO esta en "Mechanic Profile" (esa pantalla es la
ficha que ve el cliente: foto, bio, rating). Esta en Settings.
