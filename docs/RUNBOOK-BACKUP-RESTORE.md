# Probar que el backup restaura - simulacro

Escrito el 2026-08-10. Para Diego. Lo corre Diego, no Claude: son sus
credenciales de Supabase.

---

## 1. Por que hay que hacer esto

El backup nocturno anda: todas las noches a las 02:00 de Sydney, un GitHub
Action deja `schema.sql`, `data.sql` y `roles.sql` en el repo privado
[`Dr.Bike-Sydney-backups`](https://github.com/Peredodiego2026/Dr.Bike-Sydney-backups).
Eso esta verificado (punto 1.2 de `docs/PENDIENTES.md`).

Lo que **no** esta verificado es que ese dump se pueda volver a cargar. Un
backup que nunca se restauro no es un backup: es un archivo grande del que se
asume algo. Las formas tipicas de fallar son aburridas y silenciosas: falta una
extension, el orden de las tablas rompe una foreign key, los roles no existen
en el proyecto nuevo, el dump quedo truncado. Ninguna se nota hasta el dia que
hace falta.

Este simulacro tarda alrededor de una hora la primera vez.

## 2. Regla que no se rompe: produccion no se toca

Todo pasa en un **proyecto de Supabase nuevo y separado**, que se crea para esto
y se borra al final. En ningun paso de este documento se escribe en la base de
produccion. Si en algun momento una instruccion parece pedir eso, esta mal
escrita: parar y preguntar.

Antes de empezar, dos precauciones:

- No tener abierta la pestaña de produccion en el mismo navegador, o al menos
  no en la ventana donde se va a trabajar. La forma real de arruinar esto es
  pegar el dump en la pestaña equivocada.
- Al proyecto nuevo ponerle un nombre que no deje dudas: **`drbike-restore-test`**.

---

## 3. Preparacion: bajar el backup

1. Entrar a https://github.com/Peredodiego2026/Dr.Bike-Sydney-backups
2. Confirmar que el ultimo commit es **de anoche**. Si es de hace varios dias,
   el Action se rompio y eso es un problema aparte que hay que mirar primero.
3. Boton verde **Code** -> **Download ZIP**. Descomprimir.
4. Adentro tienen que estar los tres archivos: `schema.sql`, `data.sql` y
   `roles.sql`. Mirar el tamaño: el schema ronda los 47 KB y los datos los
   386 KB (medidas del 2026-08-03; van a ser algo mas grandes ahora). Si
   `data.sql` pesa unos pocos KB, el dump salio vacio y el simulacro no tiene
   sentido: eso ya es un hallazgo, y hay que avisarlo.

Nota para elegir el camino del paso 5: si tenes instalado `psql` (viene con
PostgreSQL) el proceso es mucho mas comodo. Si no, se puede hacer todo por el
editor SQL del navegador, con una molestia: los archivos grandes hay que
pegarlos por partes.

---

## 4. Crear el proyecto de prueba

1. https://supabase.com/dashboard -> **New project**.
2. Organizacion: la misma de siempre. Plan **Free** (este proyecto vive una
   hora).
3. Nombre: **`drbike-restore-test`**.
4. Region: la misma que produccion, para que la comparacion sea justa.
5. **Database password**: generar una y guardarla en el gestor de contraseñas.
   Se necesita en el paso 5A. No es la de produccion y no tiene que parecerse.
6. Esperar a que termine de crearse (1 a 2 minutos).

---

## 5. Cargar el dump

### 5A. Con `psql` (recomendado)

En el proyecto **de prueba**: **Project Settings** -> **Database** ->
**Connection string** -> pestaña **URI**. Copiar. Es algo del estilo
`postgresql://postgres:[TU-PASSWORD]@db.xxxx.supabase.co:5432/postgres`, y hay
que reemplazar `[TU-PASSWORD]` por la del paso 4.5.

Despues, parado en la carpeta donde se descomprimio el backup:

```bash
psql "PEGAR_ACA_LA_URI" -v ON_ERROR_STOP=0 -f roles.sql
```

```bash
psql "PEGAR_ACA_LA_URI" -v ON_ERROR_STOP=0 -f schema.sql
```

```bash
psql "PEGAR_ACA_LA_URI" -v ON_ERROR_STOP=0 -f data.sql
```

En ese orden: roles, schema, datos. `ON_ERROR_STOP=0` es a proposito - se quiere
que siga y muestre **todos** los errores, no que se frene en el primero.

Es normal ver algunos errores de tipo `role "supabase_admin" already exists` o
`extension already exists`: el proyecto nuevo ya viene con parte de eso puesto.
**No** es normal ver `syntax error`, `relation does not exist` al cargar los
datos, o `violates foreign key constraint`. Copiar cualquiera de esos y
guardarlos: son el resultado del simulacro.

### 5B. Sin `psql`, por el navegador

En el proyecto **de prueba** (verificar el nombre arriba a la izquierda antes de
tocar nada): **SQL Editor** -> **New query** -> pegar el contenido de
`schema.sql` -> **Run**. Despues lo mismo con `data.sql`.

`roles.sql` se puede saltear en este camino: sirve para permisos, y el simulacro
igual comprueba lo que importa, que es que los datos vuelvan.

El editor no acepta archivos enormes de una. Si se queja, hay que abrir el `.sql`
con un editor de texto y pegarlo en dos o tres tandas, cortando **siempre
despues de un `;`** y nunca en medio de una sentencia.

---

## 6. Las cuatro cosas que se miran

Estas son las que deciden si el backup sirve. Se corren **en el proyecto de
prueba**, en el SQL Editor.

### 6.1 Existe el servicio "E-Bike Service"

Es el que Diego creo el 01-ago, o sea que solo esta si el dump es de la base
viva y actual.

```sql
select name, price, category from public.services where name ilike '%e-bike%';
```

Esperado: al menos una fila, con su precio.

### 6.2 Los conteos cuadran con produccion

```sql
select 'services' as tabla, count(*) from public.services
union all select 'van_zones',  count(*) from public.van_zones
union all select 'profiles',   count(*) from public.profiles
union all select 'bookings',   count(*) from public.bookings
union all select 'bikes',      count(*) from public.bikes
union all select 'auth.users', count(*) from auth.users;
```

Referencia del dump del 2026-08-03: `services` 33, `van_zones` 48, `auth.users`
12, `profiles` 11, `bikes` 4. Hoy van a ser iguales o mas.

La comparacion que vale es contra **produccion ahora**: correr exactamente la
misma consulta en el proyecto de produccion (es solo lectura, no escribe nada) y
poner los dos resultados uno al lado del otro. Diferencia de una o dos filas en
`bookings` o `profiles` es normal: el dump es de las 02:00 y desde entonces
pudo entrar algo. **Una tabla en 0 cuando produccion tiene cientos es una falla
del backup**, y es justamente lo que este simulacro existe para encontrar.

### 6.3 Las reservas trajeron sus datos, no filas vacias

Contar filas no alcanza: una fila puede estar y venir hueca.

```sql
select id, client_name, client_email, service_name, service_price,
       scheduled_date, status, stripe_payment_intent_id
from public.bookings
order by created_at desc
limit 5;
```

Esperado: cinco reservas con nombre, email, servicio, precio y fecha llenos.
Si aparecen columnas en NULL que en produccion tienen valor, el dump perdio
datos.

### 6.4 Los perfiles siguen atados a sus usuarios

Es la union que mas facil se rompe al restaurar, porque `auth.users` y
`public.profiles` viven en esquemas distintos y se dumpean por separado.

```sql
select count(*) as perfiles_huerfanos
from public.profiles p
left join auth.users u on u.id = p.id
where u.id is null;
```

Esperado: **0**. Cualquier numero mayor que cero significa que restaurar el
backup dejaria clientes sin poder entrar a su cuenta.

### Extra, si sobra tiempo: las policies de RLS

El dump del 2026-08-03 traia 39.

```sql
select count(*) as policies from pg_policies where schemaname = 'public';
```

Un numero parecido a 39 esta bien. Un `0` querria decir que se restauraron los
datos pero **sin la seguridad**: la base quedaria abierta. Vale la pena saberlo.

---

## 7. Anotar el resultado

Antes de borrar nada, escribir tres lineas, aunque haya salido todo bien:

- Fecha del simulacro y de que commit del repo de backups salio el dump.
- Los conteos de 6.2, prueba al lado de produccion.
- Cualquier error del paso 5 que no fuera "already exists".

Va como seccion nueva al final de `docs/PENDIENTES.md`, y con eso el punto 1.2
pasa de "backup no probado" a "backup probado el <fecha>". Ese es el entregable
real del simulacro: sin la anotacion, dentro de tres meses nadie va a saber que
se hizo.

---

## 8. Borrar el proyecto de prueba

**Hacerlo el mismo dia.** Ese proyecto tiene los emails, telefonos y direcciones
de todos los clientes. Cuantos menos lugares lo tengan, mejor.

1. Confirmar tres veces que arriba a la izquierda dice **`drbike-restore-test`**
   y no el nombre del proyecto de produccion.
2. **Project Settings** -> **General** -> abajo del todo, **Delete project**.
3. Supabase pide escribir el nombre del proyecto a mano. Es la ultima red de
   seguridad: si lo que pide escribir no es `drbike-restore-test`, **parar**,
   estas en el proyecto equivocado.

Tambien borrar de la computadora la carpeta que se descomprimio en el paso 3, y
vaciar la papelera.

---

## 9. Cada cuanto repetirlo

Una vez cada tres meses, y ademas cada vez que se agregue una tabla nueva.
Proximo: **noviembre de 2026**.

---

## 10. Que este documento NO garantiza

- **No lo ejecute yo.** No tengo acceso a la cuenta de Supabase de Diego ni al
  repo privado de backups. Todo lo de aca sale de leer el punto 1.2 de
  `docs/PENDIENTES.md` y de como funciona `pg_dump`/`psql`, no de una corrida.
- **Los nombres de los botones de Supabase** (`New project`, `Connection
  string`, `Delete project`) son los del panel tal como estaba documentado en
  agosto de 2026. Si alguno cambio, la idea sigue siendo la misma.
- **No se cuanto pesa el dump de hoy.** Los tamaños del paso 3 son los del
  2026-08-03. Si `data.sql` creciera muchisimo, el camino 5B (navegador) puede
  volverse impracticable y habria que usar `psql`.
- **Los conteos de referencia** (33/48/12/11/4) son del dump del 2026-08-03, no
  de produccion hoy. Por eso el paso 6.2 pide correr la misma consulta en
  produccion y comparar, en vez de confiar en esos numeros.
