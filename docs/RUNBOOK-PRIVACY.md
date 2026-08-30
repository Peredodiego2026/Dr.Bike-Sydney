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

## 1. "Quiero una copia de todo lo que tienen sobre mi"

```bash
node scripts/privacy-runbook.mjs --export --email cliente@ejemplo.com
```

Imprime una consulta por tabla. Corre cada una en **Supabase -> SQL Editor** y
usa el boton **Export** para bajar el resultado.

**Una consulta que devuelve 0 filas tambien se informa.** "No tenemos nada tuyo
en X" es parte de la respuesta, no algo que se omite.

Mandale al cliente el conjunto completo por email. Plazo: 30 dias. Sin cargo,
salvo que el pedido implique un esfuerzo desproporcionado (ver `privacy.html`).

---

## 2. "Borren todo lo mio"

**Primero corre el export del punto 1 y guardalo.** Despues de anonimizar no
hay vuelta atras, y el cliente puede pedir su copia despues.

```bash
node scripts/privacy-runbook.mjs --forget --email cliente@ejemplo.com
```

o, si tenes el id del perfil:

```bash
node scripts/privacy-runbook.mjs --forget --id 73c5409b-6298-43b4-9aa6-6ac2a0716c40
```

Imprime un bloque que **empieza con `BEGIN;` y termina con `-- COMMIT;`
comentado**, a proposito:

1. Pega todo y corre hasta el `BEGIN`.
2. Mira los conteos de filas afectadas. ¿Tienen sentido? Un cliente con 2
   reservas no deberia tocar 40 filas.
3. Si algo no cuadra: `ROLLBACK;` y avisa.
4. Si esta bien: descomenta `COMMIT;` y corrélo.

El script **no se conecta a la base**. Solo imprime SQL para que lo revises. Un
endpoint HTTP que anonimiza un cliente esta a un bug de autenticacion de dejar
sin datos a alguien real, sin deshacer.

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
