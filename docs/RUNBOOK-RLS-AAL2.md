# RUNBOOK RLS + AAL2 - la otra mitad del hallazgo 1

Escrito el 2026-09-04. Para Diego. **Nada de esto se corre solo, y no hay que
correrlo hoy.** Se lee entero primero.

---

## 0. Por que existe, en una frase

El PR #414 cerro las 14 rutas del servidor. **El panel de admin casi no las
usa**: lee Supabase directo desde el navegador, y las reglas de permisos de la
base miran unicamente si sos admin, **nunca si pasaste por el codigo del
autenticador**.

### Y eso no es una sospecha

Dos datos de produccion del 04-sep:

1. Entraste al panel, lo usaste, y los logs tenian **cero** renglones
   `[admin-aal]`. Abrir el tablero no llama a ninguna ruta del servidor
   (`docs/PENDIENTES.md` 98).
2. Cuando por fin salio uno, dijo:

   ```
   [admin-aal] {"verdict":"aal2","aal":"aal2","amr":["totp","password"]}
   ```

   Eso contesta la pregunta que faltaba: **el acceso que da el autenticador SI
   trae el dato del nivel, y SI vale `aal2`.** Sin esa confirmacion, nada de
   este documento se podia escribir sin riesgo de dejarte afuera.

Todas las reglas de la base dicen hoy lo mismo:

```sql
exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
```

Un acceso conseguido solo con la contrasena - el que el servidor entrega
**antes** del codigo - pasa esas reglas enteras.

---

## 1. POR QUE ESTO ES MAS PELIGROSO QUE UN DEPLOY

Un deploy malo se deshace con **Instant Rollback** en Vercel, un click.

**Un cambio de reglas en la base no tiene ese boton.** Si algo sale mal, la
unica salida es correr otro SQL - y si lo que se rompio es tu acceso al panel,
lo corres igual desde Supabase, que es otra cuenta. Por eso:

- **Cada paso trae su reversion escrita ARRIBA del paso, no al final.**
- **Cada paso se prueba antes del siguiente.**
- Si un paso falla, se revierte ESE paso y se para. No se sigue.
- Nada de esto se corre con el panel cerrado: tenelo abierto en otra pestana
  para probar despues de cada paso.

---

## 2. La idea, sin SQL

En vez de reescribir las reglas que ya existen - que es donde se rompen las
cosas - se **agrega una regla extra** por tabla, de las que se suman con "Y".
Las reglas viejas quedan intactas.

La regla extra dice, en castellano:

> Dejo pasar si tu acceso NO dice explicitamente que es de nivel 1,
> **o** si esta cuenta no tiene el autenticador configurado.

Las dos mitades importan:

- **"NO dice explicitamente nivel 1"** en vez de "dice nivel 2": si algun dia el
  dato no viniera, la regla deja pasar en vez de cerrar todo. Fallar abierto es
  a proposito - es la misma decision del PR #414.
- **"o no tiene el autenticador configurado"**: si no lo tuvieras, exigirte el
  codigo te dejaria sin poder ni configurarlo. Es la misma regla condicional
  del codigo, escrita otra vez en la base.

Deshacerlo es borrar la regla extra. La de siempre sigue ahi, intacta.

**El servidor no se ve afectado por nada de esto:** usa la service key, que se
saltea las reglas por completo. Esto solo cambia lo que el NAVEGADOR puede leer.

---

## 3. PASO 1 - crear la funcion, sin tocar ninguna regla

**Riesgo: ninguno.** Crea una funcion y no la usa nadie todavia.

### Reversion del paso 1

```sql
drop function if exists public.has_second_factor();
```

### El paso 1

```sql
create or replace function public.has_second_factor()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $func$
  select coalesce(
    -- Pasa si el nivel NO es explicitamente aal1...
    (auth.jwt() ->> 'aal') is distinct from 'aal1'
    -- ...o si esta cuenta no tiene un segundo factor verificado, en cuyo caso
    -- exigirselo la dejaria sin poder configurarlo.
    or not exists (
      select 1 from auth.mfa_factors f
      where f.user_id = auth.uid() and f.status = 'verified'
    ),
    true  -- ante cualquier duda, dejar pasar
  );
$func$;

grant execute on function public.has_second_factor() to authenticated, anon;

comment on function public.has_second_factor() is
  'Audit finding 1 (2026-09-04). Mirrors api/_admin-aal.js: demand aal2 only from an account that already has a verified factor, and fail open on a missing claim.';
```

### Comprobacion del paso 1 - HACERLA, no saltearla

Correr esto **en el SQL Editor de Supabase**:

```sql
select public.has_second_factor() as resultado;
```

- **Tiene que devolver `true`.** El SQL Editor corre como dueno de la base, sin
  sesion de usuario, asi que `auth.jwt()` es nulo y la funcion cae en el
  "dejar pasar". Ver `true` prueba que **la funcion no explota y falla
  abierto**, que es justo lo que hay que probar antes de que decida nada.
- Si devuelve error, la reversion de arriba y parar. Lo mas probable es que sea
  el `search_path` o los permisos sobre `auth.mfa_factors`.

---

## 4. PASO 2 - una sola tabla, la menos riesgosa

`availability` son los bloqueos de agenda. Desde el navegador la toca **solo el
panel**: el cliente ve horarios libres a traves del servidor, no de esta tabla.
Si algo sale mal, se rompe una pantalla del panel, no una reserva.

### Reversion del paso 2

```sql
drop policy if exists availability_requires_second_factor on public.availability;
```

### El paso 2

```sql
create policy availability_requires_second_factor on public.availability
  as restrictive
  for all
  to authenticated
  using (public.has_second_factor())
  with check (public.has_second_factor());
```

`as restrictive` es lo que hace que se sume con "Y" a las reglas que ya estan,
en vez de agregar un permiso nuevo.

### Comprobacion del paso 2 - HACERLA

En el panel, **con la sesion que ya tenes abierta**:

1. Abrir la agenda / disponibilidad. Los bloqueos se tienen que seguir viendo.
2. Crear un bloqueo de prueba y borrarlo.

Si algo de eso falla: correr la reversion del paso 2 y avisame. **No seguir al
paso 3.**

---

## 5. PASO 3 - el resto del panel

Solo despues de que el paso 2 haya andado. Una por una, probando entre medio.

### Reversion del paso 3 (todas juntas)

```sql
drop policy if exists mechanic_locations_requires_second_factor on public.mechanic_locations;
drop policy if exists discount_codes_requires_second_factor on public.discount_codes;
drop policy if exists van_zones_requires_second_factor on public.van_zones;
```

### El paso 3

```sql
create policy mechanic_locations_requires_second_factor on public.mechanic_locations
  as restrictive for all to authenticated
  using (public.has_second_factor()) with check (public.has_second_factor());

create policy discount_codes_requires_second_factor on public.discount_codes
  as restrictive for all to authenticated
  using (public.has_second_factor()) with check (public.has_second_factor());

create policy van_zones_requires_second_factor on public.van_zones
  as restrictive for all to authenticated
  using (public.has_second_factor()) with check (public.has_second_factor());
```

### Comprobacion del paso 3 - HACERLA

En el panel: **Mapa de vans**, **Codigos de descuento** (ver la lista y crear
uno de prueba), **Zonas**. Y en la app de cliente, desde el celular: que la
pantalla de seguimiento siga mostrando el mapa del mecanico.

Ese ultimo importa: `mechanic_locations` y `van_zones` **tambien las lee un
cliente comun**. Un cliente no tiene el autenticador configurado, asi que la
funcion lo deja pasar - pero eso hay que **verlo**, no suponerlo.

---

## 6. PASO 4 - `bookings`, la ultima y la mas delicada

`bookings` es la tabla con los nombres, telefonos y direcciones. Es el premio
del atacante, y es tambien la que usa **cada cliente** para ver sus propias
reservas. Un error aca no rompe el panel: rompe la app.

**No correr este paso el mismo dia que los anteriores.** Dejar pasar un dia con
los pasos 2 y 3 andando.

### Reversion del paso 4

```sql
drop policy if exists bookings_requires_second_factor on public.bookings;
```

### El paso 4

```sql
create policy bookings_requires_second_factor on public.bookings
  as restrictive for all to authenticated
  using (public.has_second_factor()) with check (public.has_second_factor());
```

### Comprobacion del paso 4 - la mas importante de todas

**Desde el celular, con una cuenta de cliente de verdad (no la de admin):**

1. Iniciar sesion y ver "Mis reservas". Tienen que aparecer.
2. Hacer una reserva de punta a punta.

**Y despues, en el panel:**

3. Ver la lista de reservas del dia.
4. Abrir una reserva y cambiarle algo.

Si el cliente no ve sus reservas: **reversion del paso 4, inmediatamente.** Eso
significaria que la funcion no esta dejando pasar a alguien sin autenticador, y
es un problema mio, no tuyo.

---

## 7. Como se comprueba que esto sirvio de algo

Sin esto, cualquiera con tu contrasena saca el acceso de la pestana de red,
cierra el cartel del codigo, y lee la base entera desde el navegador.

Con esto, ese mismo acceso deja de ver `bookings`.

No hay forma honesta de probarlo sin hacer exactamente eso, asi que la prueba
queda para vos si alguna vez la queres hacer: abrir el panel, cortar el login
en el paso del codigo, sacar el acceso de la pestana de red y pedir la lista de
reservas con el. Antes devolvia todo; despues tiene que devolver vacio.

---

## 8. Lo que este documento NO resuelve

- **El bucket `job-photos` sigue publico.** Las fotos de trabajos, de perfil de
  mecanicos y de resenas se ven con solo tener el link. Es un proyecto aparte
  (`docs/PENDIENTES.md` 100).
- **`ADMIN_REQUIRE_AAL2` sigue apagado.** Es la otra mitad, la del servidor, y
  se enciende con una variable en Vercel - ver `docs/PENDIENTES.md` 96. Las dos
  mitades son independientes: se pueden encender en cualquier orden, y conviene
  no encenderlas el mismo dia.

---

## 9. Lo que NO se puede verificar desde el repo

Las reglas que hay en produccion **no tienen por que ser las de
`scripts/*.sql`**. Este documento lee los nombres de tabla de ahi, pero las
politicas restrictivas que agrega **no dependen de los nombres de las reglas
viejas** - por eso el enfoque es agregar en vez de reescribir: no hace falta
saber como se llama la regla de al lado para que esto funcione.

Lo unico que si conviene mirar antes, para saber contra que se esta sumando:

```sql
select tablename, policyname, permissive, roles, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('availability','mechanic_locations','discount_codes','van_zones','bookings')
order by tablename, policyname;
```

Despues de aplicar los pasos, la misma consulta tiene que mostrar las nuevas
con `permissive = RESTRICTIVE`. Si alguna aparece como `PERMISSIVE`, se
escribio mal y **no esta restringiendo nada**: se borra y se vuelve a crear con
el `as restrictive`.
