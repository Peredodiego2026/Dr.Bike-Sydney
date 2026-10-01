-- La tienda de repuestos LEBYCLE: catalogo cerrado.
--
-- Correr entero en Supabase > SQL Editor. Es idempotente: se puede correr dos
-- veces sin romper nada.
--
-- POR QUE ESTAS TABLAS NO TIENEN NINGUNA POLITICA DE LECTURA
--
-- La primera version de esto era un archivo JSON en el repo, servido como
-- cualquier imagen del sitio. Funcionaba, pero significaba que los precios de
-- compra y de venta de LEBYCLE quedaban publicos en cuanto el sitio se
-- desplegara: cualquiera que mirara el codigo fuente los tenia. El acuerdo con
-- LEBYCLE todavia no esta cerrado y en Australia ya hay un distribuidor
-- (Cycle Motion), asi que no puede estar a la vista.
--
-- Con RLS encendido y CERO politicas, la `anon key` - la que lleva el
-- navegador, la que cualquiera lee del codigo - no puede leer ni una fila. El
-- unico que entra es el servidor con la `service_role key`, que nunca sale de
-- Vercel, y antes de responder comprueba de quien es la sesion (api/shop.js).
--
-- No es un descuido que falten las politicas. Es el mecanismo.

create table if not exists shop_products (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  section     text not null check (section in ('parts','tools','accessories','care','gear')),
  price_from  numeric(10,2) not null,
  price_to    numeric(10,2) not null,
  -- Referencia al bucket privado, nunca una URL: 'shop-photos/shop/<slug>.webp'.
  -- Una URL guardada es una URL que sigue andando cuando se filtra; una
  -- referencia no sirve de nada sin que el servidor la firme.
  photo_ref   text,
  sort_rank   int  not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists shop_variants (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references shop_products(id) on delete cascade,
  sku         text not null unique,
  label       text not null,
  -- El precio que paga el cliente. Es el unico lugar del sistema donde vive:
  -- el carrito del navegador guarda SKU y cantidad, y el importe se recalcula
  -- aca cada vez que se cobra.
  price       numeric(10,2) not null check (price > 0),
  -- Lo que le cuesta a Diego. NUNCA sale de la base: api/shop.js no lo incluye
  -- en la respuesta. Esta aca para los informes de margen de Admin.
  cost        numeric(10,2),
  position    int not null default 0
);

create index if not exists shop_variants_product_idx on shop_variants(product_id);
create index if not exists shop_products_section_idx on shop_products(section) where active;

alter table shop_products enable row level security;
alter table shop_variants enable row level security;

-- Por si alguna vez se corrio una version de esto que si creaba politicas.
drop policy if exists shop_products_read on shop_products;
drop policy if exists shop_variants_read on shop_variants;

-- Y que `anon` no tenga el permiso de tabla aunque RLS se apagara por error.
-- Dos cerrojos distintos: RLS filtra filas, GRANT decide si la tabla existe
-- para ese rol. Apagar uno solo no abre nada.
revoke all on shop_products from anon;
revoke all on shop_variants from anon;
revoke all on shop_products from authenticated;
revoke all on shop_variants from authenticated;

-- ── Como comprobar que quedo cerrado ────────────────────────────────────────
--
-- Esto NO se prueba leyendo el SQL. Se prueba desde afuera, con la anon key,
-- que es lo que tiene cualquiera. En una terminal:
--
--   curl "https://tgpipbloisahufaywhqb.supabase.co/rest/v1/shop_products?select=*" \
--     -H "apikey: <LA_ANON_KEY>"
--
-- Tiene que contestar un error de permisos, NO una lista de productos y NO una
-- lista vacia. Una lista vacia tambien seria sospechosa: querria decir que la
-- tabla se puede consultar y simplemente no devolvio filas.
--
-- La consulta de abajo deja constancia de que las dos tablas quedaron con RLS
-- encendido y sin politicas. Devuelve dos filas, las dos con ok = true.

select
  c.relname                       as tabla,
  c.relrowsecurity                as rls_encendido,
  count(p.polname)                as politicas,
  (c.relrowsecurity and count(p.polname) = 0) as ok
from pg_class c
left join pg_policy p on p.polrelid = c.oid
where c.relname in ('shop_products','shop_variants')
group by c.relname, c.relrowsecurity;
