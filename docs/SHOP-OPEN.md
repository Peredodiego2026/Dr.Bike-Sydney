# Abrir la tienda LEBYCLE a todo el mundo

Hoy la tienda la ve **una sola cuenta** (peredo.dm@gmail.com). Para abrirla,
Diego dice algo como *"ahora implementalo para todo el mundo"*, y esta es la
lista completa. Esta escrita para que la haga cualquier sesion, sin
investigar.

## Antes de tocar codigo: lo que solo Diego puede confirmar

Si alguna de estas no esta resuelta, **preguntar antes de abrir**. Abrir la
tienda con un plazo de entrega inventado es prometerle algo falso a un
cliente.

- [ ] Plazo de entrega real. Hoy dice `[CONFIRMAR PLAZO DE ENTREGA]` en la
      ficha, el carrito y el pago (grep ese texto).
- [ ] Costo de envio. Hoy se cobra $0 (`shipping = 0` en `api/_shop.js`,
      con un `[CONFIRMAR COSTO DE ENVIO]` al lado).
- [ ] Que LEBYCLE permite revender en Australia (ya hay un distribuidor,
      Cycle Motion).
- [ ] Moneda de la lista mayorista (se calculo como USD a FX 1.4352).
- [ ] Claves de Stripe **reales** en Vercel: `SHOP_STRIPE_SECRET_KEY`
      (`sk_live_...`) y `SHOP_STRIPE_PUBLISHABLE_KEY` (`pk_live_...`). Con las
      de prueba, los pedidos quedan `mode = 'test'` y no se cobra nada. Las dos
      tienen que ser del mismo modo: una de pruebas con una real hace que el
      checkout conteste 503 antes de crear el pedido.
- [ ] `scripts/shop-orders-fulfillment.sql` corrido en Supabase (fila 50 de
      `docs/RUNBOOK-SQL.md`). Sin eso, Admin > Shop Orders lista los pedidos
      pero no los puede pasar a "pedido a LEBYCLE", "enviado" ni "entregado".
- [ ] Un pago que el navegador no llego a confirmar. El pedido pasa a `paid`
      (y salen el WhatsApp y el email) cuando la pagina llama a
      `/api/shop?action=confirm` despues de que Stripe acepta la tarjeta. Si el
      cliente cierra la pestaña justo en ese segundo, Stripe cobro y el pedido
      queda `pending` sin aviso. Hoy se resuelve A MANO: Admin > Shop Orders >
      filtro "Not paid" > "Check with Stripe" (misma decision que el
      navegador, `settleOrder()` en `api/_shop.js`, y salen los mismos
      avisos). Para que sea automatico falta `payment_intent.succeeded` con
      `metadata.kind = 'shop_order'` en `api/stripe-webhook.js` llamando a
      `settleOrder()`. El webhook de hoy ya los ignora (no traen
      `bk_service_name`), asi que no crea reservas falsas.

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
