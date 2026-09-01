# Cabeceras de seguridad — por que cada cosa esta como esta

`vercel.json` es JSON y **no admite comentarios**, asi que las razones viven
aca. Si vas a tocar la CSP, lee esto primero.

Auditoria pre-lanzamiento, punto 1. El veredicto era **FUERTE**: CSP completa,
HSTS con preload, `X-Frame-Options: DENY`, `nosniff`, `Permissions-Policy`. Lo
unico pendiente era endurecer `script-src`.

## `'unsafe-inline'` sigue permitido, a proposito

**No se puede quitar hoy, y el motivo no es pereza.**

Las dos formas de reemplazarlo:

**Nonces.** Hay que generar un valor nuevo **por peticion** y escribirlo tanto
en la cabecera como en cada `<script>` del HTML servido. Este sitio es **HTML
estatico en Vercel**: no hay render por peticion donde poner el nonce. Habria
que convertir las cinco paginas en funciones, que es un cambio de arquitectura
entero.

**Hashes.** Alcanzarian si todos los scripts inline se conocieran al construir.
No es el caso: `js/consent.js` **crea elementos `<script>` en tiempo de
ejecucion** cuando el visitante acepta las cookies (asi es como los analytics
quedan bloqueados hasta que hay permiso, punto 7). El contenido de esos scripts
no existe al construir el sitio.

Sacar `'unsafe-inline'` hoy **romperia el banner de cookies**, que es lo que
impide que Google Analytics, PostHog y el session replay de Sentry arranquen sin
permiso. Cambiar una proteccion real y funcionando por una teorica es mal
negocio.

**Cuando si se podria:** el dia que las paginas se sirvan desde una funcion en
vez de como archivos estaticos. Ahi el nonce, junto con `'strict-dynamic'`,
cubriria tambien los scripts que `consent.js` crea.

## La lista de hosts: cada uno tiene que ganarse el lugar

Cada host permitido es una via por la que un tercero comprometido podria
ejecutar codigo en el sitio. El 2026-09-01 se quitaron **cuatro entradas que no
usaba nadie** - verificado por grep sobre todos los `*.html` y `*.js`, cero
apariciones fuera de la propia cabecera:

| Quitado | Por que estaba de mas |
|---|---|
| `api.mapbox.com` | El mapa usa Leaflet con tiles de OpenStreetMap, no Mapbox |
| `*.mapbox.com` | Idem, en `img-src` |
| `www.gstatic.com` | Sin usar |
| `connect.facebook.net` | Es el SDK de Facebook. Lo unico que hay en el repo es un `<a href>` a la pagina, que no carga script |

Quedan 33 entradas, todas con uso verificado. `tests/unit/csp-and-error-reporting.test.js`
falla si alguna de las cuatro vuelve, y **tambien** si se cae una de las que si
hacen falta - sacar de mas rompe la app en silencio y solo se nota cuando un
cliente no puede pagar.

## Antes de agregar un host

1. Confirma que se usa: `grep -rn "el-host" --include=*.html --include=*.js .`
2. Ponelo en la directiva **mas chica** que sirva. Un script no necesita estar
   en `img-src`.
3. Evita los comodines si el subdominio es conocido. `https://*.supabase.co` es
   inevitable (el proyecto vive en un subdominio propio); `https://*.mapbox.com`
   no lo era.
4. Agregalo a la lista `NEEDED` del test, con el motivo.
