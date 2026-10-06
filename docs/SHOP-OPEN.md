# Abrir la tienda LEBYCLE a todo el mundo

Hoy la tienda la ve **una sola cuenta** (peredo.dm@gmail.com). Para abrirla,
Diego dice algo como *"ahora implementalo para todo el mundo"*, y esta es la
lista completa. Esta escrita para que la haga cualquier sesion, sin
investigar.

## Antes de tocar codigo: lo que solo Diego puede confirmar

Si alguna de estas no esta resuelta, **preguntar antes de abrir**. Abrir la
tienda con un plazo de entrega inventado es prometerle algo falso a un
cliente.

- [x] Plazo de entrega y costo de envio reales, cargados en Admin > Shop
      Products > Shop settings. Hecho el 2026-10-06: envio $13.95, gratis
      desde $130, entrega en 7-14 dias habiles (sale de comparar AusPost y
      CouriersPlease por zona de Sydney). Si alguna vez se borran, la tienda
      vuelve a decir `[CONFIRMAR PLAZO DE ENTREGA]` y el envio pasa a $0.
- [x] `scripts/shop-ship-surcharge.sql` corrido en Supabase (fila 52 de
      `docs/RUNBOOK-SQL.md`). Agrega el recargo de envio por producto pesado
      (`shop_products.ship_surcharge`), que se cobra siempre, aun sobre los
      $130. Hecho el 2026-10-06 (ok = true), con 7 pesados cargados:
      Repair Workstation Unit $55, Repair Stand $40, Bicycle Floor Stand y
      Hub Bearing Press Set $25, Bicycle Wheelset $20, las dos horquillas $15.
      Se cambian desde Admin > Shop Products, campo "Extra shipping".
- [ ] Que LEBYCLE permite revender en Australia (ya hay un distribuidor,
      Cycle Motion).
- [ ] Moneda de la lista mayorista (se calculo como USD a FX 1.4352).
- [ ] Claves de Stripe **reales** en Vercel: `SHOP_STRIPE_SECRET_KEY`
      (`sk_live_...`) y `SHOP_STRIPE_PUBLISHABLE_KEY` (`pk_live_...`). Con las
      de prueba, los pedidos quedan `mode = 'test'` y no se cobra nada. Las dos
      tienen que ser del mismo modo: una de pruebas con una real hace que el
      checkout conteste 503 antes de crear el pedido.
- [x] `scripts/shop-orders-fulfillment.sql` corrido en Supabase (fila 50 de
      `docs/RUNBOOK-SQL.md`). Sin eso, Admin > Shop Orders lista los pedidos
      pero no los puede pasar a "pedido a LEBYCLE", "enviado" ni "entregado".
      Hecho el 2026-10-04 (ok = true).
- [x] `scripts/shop-catalog-admin.sql` corrido en Supabase (fila 51 de
      `docs/RUNBOOK-SQL.md`). Agrega descripcion, stock, destacados, fotos
      extra y `shop_settings`. Sin eso la tienda anda igual, pero Admin >
      Shop Products no puede guardar. Hecho el 2026-10-05 (ok = true).
- [ ] El aviso de Stripe para pagos que el navegador no llego a confirmar
      (cliente que cierra la pestaña justo despues de pagar). El codigo ya
      esta: `api/stripe-webhook.js` manda `payment_intent.succeeded` de un
      pedido de la tienda a `settleOrder()`. Falta registrarlo en Stripe, en
      el MISMO modo que las claves de la tienda: Developers > Webhooks > Add
      endpoint, `https://drbikesydney.com.au/api/stripe-webhook`, evento
      `payment_intent.succeeded`, y su secreto (`whsec_...`) en Vercel como
      `SHOP_STRIPE_WEBHOOK_SECRET` + Redeploy. Con claves live de la misma
      cuenta del negocio, el webhook que ya existe lo cubre. Mientras tanto:
      Admin > Shop Orders > "Not paid" > "Check with Stripe".

## El interruptor (dos lineas, una palabra cada una)

1. `js/shop.js` -> `export const SHOP_IS_PUBLIC = true;`
   Decide si se dibujan el tab Shop, la franja del inicio y el enlace del
   menu.
2. `api/_shop.js` -> `export const SHOP_IS_PUBLIC = true;`
   Decide si el servidor entrega el catalogo. Este es el permiso de verdad.

`tests/unit/shop-switch.test.js` falla si los dos no coinciden, y ejecuta una
copia del servidor con `true` para comprobar que la tienda se abre de verdad.

Con la tienda abierta, **ver** no pide sesion; **comprar** si (un pedido
tiene que ser de alguien). El costo mayorista no viaja nunca, abierta o
cerrada: `cost` no se selecciona en ningun lado.

## Lo que acompana al interruptor

3. `shop.html`: sacar `<meta name="robots" content="noindex, nofollow">` si
   Google la tiene que encontrar, y agregar `/shop.html` a `sitemap.xml`.
   Mientras la tienda sea privada el test exige el noindex; abierta, no.
4. `sw.js`: subir `CACHE_STATIC`. `js/shop.js` se importa sin `?v=`, asi que
   sin esto quien ya visito el sitio no ve la tienda hasta mucho despues.
5. `npm run check` y `npx vitest run tests/unit/` en verde, PR, y despues del
   merge comprobar en produccion con una cuenta que NO sea la de Diego.

## Como comprobar que quedo abierta (despues del deploy, ~2 min)

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://drbikesydney.com.au/api/shop
```

Cerrada contesta `404`. Abierta contesta `200`.
