# RUNBOOK SQL - que scripts hay que correr en Supabase

Escrito el 2026-08-10. Para Diego. No hace falta saber SQL para usarlo: se
copia, se pega, se lee el resultado.

---

## 0. RESULTADO: el 2026-08-10 no faltaba ninguno

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
  union all select 23, 'add-cancellation-reason.sql', 'bookings.cancellation_reason',
    exists (select 1 from col where t='bookings' and c='cancellation_reason')
  union all select 24, 'create-van-inventory-table.sql', 'tabla van_inventory',
    exists (select 1 from tbl where t = 'van_inventory')
  union all select 25, 'create-newsletter-table.sql', 'tabla newsletter_subscribers',
    exists (select 1 from tbl where t = 'newsletter_subscribers')
  union all select 26, 'create-bikes-table.sql', 'tabla bikes + bookings.bike_id',
    (exists (select 1 from tbl where t='bikes') and exists (select 1 from col where t='bookings' and c='bike_id'))
  union all select 27, 'add-tracking-token.sql', 'bookings.tracking_token',
    exists (select 1 from col where t='bookings' and c='tracking_token')
  union all select 28, 'add-service-timing-columns.sql', 'las 5 columnas de tiempos de servicio',
    (select count(*) = 5 from col where t='bookings' and c in ('started_at','completed_at',
      'service_duration_seconds','pre_service_checklist','pre_service_notes'))
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
  union all select 37, 'add-completion-notifications.sql', 'bookings.completion_notifications',
    exists (select 1 from col where t='bookings' and c='completion_notifications')
)
select n as "#", script, que_agrega as "que agrega",
       case when ok then 'OK' else '>>> FALTA <<<' end as estado
from chk order by n;
```

**Como se lee el resultado:** 31 filas. Las que digan `OK` ya estan hechas y no
hay que tocarlas. Las que digan `>>> FALTA <<<` se corren siguiendo el orden de
la seccion 5, saltando las que dieron OK.

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
| 33 | `add-abandoned-recovery-to-bookings.sql` | La marca de "ya le mande el email de recupero" - sin ella se podria mandar repetido. |
| 34 | `add-bookings-rls.sql` + `harden-bookings-rls.sql` | Seguridad grave: sin RLS, un cliente puede leer las reservas de otro. Si sale FALTA, es lo primero de todo. |
| 35 | `add-booking-unique-constraint.sql` | Dos clientes pueden reservar el mismo horario con la misma van. |
| 36 | `migrate-inventory-push.sql` | Inventario de repuestos y notificaciones push. |

---

## 6. Chequeo final, despues de correr todo

Volver a pegar la consulta de la seccion 3. **Las 31 filas tienen que decir
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
