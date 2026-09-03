# RUNBOOK — pedidos de privacidad (acceso y borrado)

Que hacer cuando un cliente escribe pidiendo **una copia de sus datos** o que
**borren todo lo suyo**.

`privacy.html` ya se compromete a las dos cosas, bajo la Privacy Act 1988, y a
**responder dentro de los 30 dias**. Contestar por email es un proceso valido:
la ley australiana no exige un boton de autoservicio. Lo que faltaba hasta el
2026-08-30 no era el boton, era **poder hacerlo**: significaba escribir SQL a
mano sobre una docena de tablas y acordarse de cuales guardan datos personales.

---

## La regla que hace que esto no sea un DELETE

`privacy.html` **tambien** promete guardar los registros de reservas **7 anos**,
por obligacion fiscal australiana.

Leidas rapido, las dos promesas se contradicen. No se contradicen: la respuesta
a "borren todo lo mio" es **anonimizar**, no borrar. El registro financiero
queda con sus fechas e importes - que es lo que exige la ATO - y se le saca
toda la identidad.

**Ningun paso de este runbook borra una fila de `bookings`.** Hay un test que
falla si alguien lo cambia.

---

<!-- BEGIN GENERATED: no edites a mano, sale de api/_privacy.js -->

## Las tablas que guardan datos personales

Salen de `PII_MAP` en `api/_privacy.js`. Son **9**, y estan todas aca:

| Tabla | Se puede borrar la fila | Por que |
|---|---|---|
| `bookings` | **NO** | Financial record. privacy.html commits to 7 years for tax compliance, so the row stays and only the identity is stripped. |
| `profiles` | **NO** | Deleting it would orphan the bookings that must be kept. Anonymised in place instead. |
| `bikes` | si | A bicycle is the client’s property, not a financial record. Nothing requires keeping it. |
| `job_messages` | si | Chat between client and mechanic. No retention obligation. |
| `checkout_attempts` | si | An abandoned checkout. Nothing was charged, nothing to keep. |
| `claims` | **NO** | A claim can become a dispute. Kept as a record, stripped of identity. |
| `waitlist` | si | A request to be told about a slot. No obligation once withdrawn. |
| `newsletter_subscribers` | si | Marketing consent. Withdrawing it is exactly this request. |
| `notifications` | si | Delivered messages. Content can name the person and the address. |

Lo que se sobrescribe queda como `[removed at client request]`. Un NULL seria ambiguo - "nunca hubo nombre" o "se lo quitaron" - y varias de estas columnas son NOT NULL.

## Como sacar el SQL para un cliente concreto

**Desde el panel, que es lo mas facil:** Admin > Clients > el cliente >
**Privacy request**. Ahi salen los dos bloques listos para copiar, ya con
el id y el email de esa persona.

Los bloques de abajo son la misma cosa con datos de ejemplo, para que este
documento sirva aunque el panel no abra.

## 1. "Quiero una copia de todo lo que tienen mio"

```sql
SELECT * FROM bookings WHERE client_id = '00000000-0000-0000-0000-000000000000'::uuid OR client_email = 'cliente@ejemplo.com';
SELECT * FROM profiles WHERE id = '00000000-0000-0000-0000-000000000000'::uuid OR email = 'cliente@ejemplo.com';
SELECT * FROM bikes WHERE client_id = '00000000-0000-0000-0000-000000000000'::uuid;
SELECT * FROM job_messages WHERE booking_id IN (SELECT id FROM bookings WHERE client_id = '00000000-0000-0000-0000-000000000000'::uuid);
SELECT * FROM checkout_attempts WHERE client_id = '00000000-0000-0000-0000-000000000000'::uuid;
SELECT * FROM claims WHERE client_email = 'cliente@ejemplo.com';
SELECT * FROM waitlist WHERE client_id = '00000000-0000-0000-0000-000000000000'::uuid OR client_email = 'cliente@ejemplo.com';
SELECT * FROM newsletter_subscribers WHERE email = 'cliente@ejemplo.com';
SELECT * FROM notifications WHERE user_id = '00000000-0000-0000-0000-000000000000'::uuid;
```

## 2. "Borren todo lo mio"

Se corre **despues** de haberle mandado la copia, y una vez que confirmaste
que es esa persona. No tiene vuelta atras: los valores originales no quedan
guardados en ningun lado.

```sql
BEGIN;

-- bookings: Financial record. privacy.html commits to 7 years for tax compliance, so the row stays and only the identity is stripped.
UPDATE bookings
   SET client_name = '[removed at client request]',
       client_email = '[removed at client request]',
       client_phone = '[removed at client request]',
       address = '[removed at client request]',
       address_lat = NULL,
       address_lng = NULL,
       arrival_pin = NULL,
       notes = NULL,
       mechanic_notes = NULL,
       client_signature_url = NULL,
       photo_before_url = NULL,
       photo_after_url = NULL,
       client_review = NULL
 WHERE client_id = '00000000-0000-0000-0000-000000000000'::uuid
    OR client_email = 'cliente@ejemplo.com';

-- profiles: Deleting it would orphan the bookings that must be kept. Anonymised in place instead.
UPDATE profiles
   SET full_name = '[removed at client request]',
       email = '[removed at client request]',
       phone = '[removed at client request]',
       avatar_url = NULL,
       birthday = NULL,
       push_subscription = NULL
 WHERE id = '00000000-0000-0000-0000-000000000000'::uuid
    OR email = 'cliente@ejemplo.com';

-- bikes: A bicycle is the client’s property, not a financial record. Nothing requires keeping it.
UPDATE bikes
   SET notes = NULL
 WHERE client_id = '00000000-0000-0000-0000-000000000000'::uuid;

-- job_messages: Chat between client and mechanic. No retention obligation.
UPDATE job_messages
   SET message = '[removed at client request]'
 WHERE booking_id IN (SELECT id FROM bookings WHERE client_id = '00000000-0000-0000-0000-000000000000'::uuid);

-- checkout_attempts: An abandoned checkout. Nothing was charged, nothing to keep.
UPDATE checkout_attempts
   SET address = '[removed at client request]'
 WHERE client_id = '00000000-0000-0000-0000-000000000000'::uuid;

-- claims: A claim can become a dispute. Kept as a record, stripped of identity.
UPDATE claims
   SET client_name = '[removed at client request]',
       client_email = '[removed at client request]',
       phone = '[removed at client request]',
       description = '[removed at client request]',
       photo_urls = NULL,
       resolution_notes = NULL
 WHERE client_email = 'cliente@ejemplo.com';

-- waitlist: A request to be told about a slot. No obligation once withdrawn.
UPDATE waitlist
   SET client_name = '[removed at client request]',
       client_email = '[removed at client request]'
 WHERE client_id = '00000000-0000-0000-0000-000000000000'::uuid
    OR client_email = 'cliente@ejemplo.com';

-- newsletter_subscribers: Marketing consent. Withdrawing it is exactly this request.
UPDATE newsletter_subscribers
   SET email = '[removed at client request]'
 WHERE email = 'cliente@ejemplo.com';

-- notifications: Delivered messages. Content can name the person and the address.
UPDATE notifications
   SET body = NULL
 WHERE user_id = '00000000-0000-0000-0000-000000000000'::uuid;

-- Revisa el resultado ANTES de confirmar. Si algo no cuadra: ROLLBACK;
COMMIT;
```

<!-- END GENERATED -->

---

## 3. Cada tanto: ¿aparecio dato personal nuevo sin mapear?

`api/_privacy.js` es la fuente de verdad de donde vive el dato personal. Una
migracion que agregue una columna con un nombre, un telefono o una direccion y
no la agregue ahi crea un dato que **ningun pedido de borrado va a alcanzar**.

Corre esto en Supabase de vez en cuando, y sobre todo despues de una migracion:

```sql
SELECT table_name AS tabla, column_name AS columna, data_type AS tipo
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (column_name ILIKE '%name%'    OR column_name ILIKE '%email%'
    OR column_name ILIKE '%phone%'   OR column_name ILIKE '%address%'
    OR column_name ILIKE '%birthday%' OR column_name ILIKE '%signature%'
    OR column_name ILIKE '%avatar%'  OR column_name ILIKE '%_pin%')
ORDER BY table_name, column_name;
```

Compara la salida con `PII_MAP` y `NOT_PERSONAL` en `api/_privacy.js`.
Cualquier columna que no este en ninguna de las dos listas hay que clasificarla:
o se anonimiza, o se declara no-personal **con el motivo escrito**.

---

## 4. Lo que este runbook NO cubre

- **Supabase Auth.** El registro de `auth.users` (email y hash de contrasena)
  vive fuera de `public` y no lo tocan estas consultas. Para cerrarlo del todo
  hay que borrar el usuario desde **Supabase -> Authentication -> Users**. Es un
  paso manual y a proposito: borrar ahi cascadea.
- **Stripe.** Los pagos quedan en Stripe con su propia retencion. Si el cliente
  lo pide expresamente, se gestiona desde el panel de Stripe.
- **Backups.** El volcado nocturno por email (`?type=backup`) contiene copias
  anteriores a la anonimizacion. Es correcto que sea asi - son registros
  historicos - pero si el pedido es explicito hay que borrar esos correos.
- **Emails ya enviados.** Confirmaciones y facturas que ya salieron no se pueden
  retirar de la casilla del cliente.

Los cuatro se le informan al cliente en la respuesta. Prometer mas de lo que se
puede cumplir es exactamente el problema que este runbook vino a arreglar.
