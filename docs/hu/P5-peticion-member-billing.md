# P5 → P1 · cambios pedidos en `src/lib/member-billing.ts` (y `src/lib/stripe-checkout.ts`)

> **Para la ventana de merge.** `src/lib/member-billing.ts` es de la pista P1.
> P5 no lo ha tocado. El escenario **"uso"** de **HU-ST-27** —*el checkout admite
> el código y el `Payment` registra el descuento aplicado*— es la mitad de la
> historia que vive dentro del checkout, y aquí está escrita para que se aplique
> mecánicamente, sin tener que reconstruir el razonamiento.
>
> Los otros dos escenarios de HU-ST-27 (alta del cupón en la cuenta conectada con
> espejo en Apta, y la medición por código) **ya están hechos y no dependen de
> esto**: `src/lib/stripe-coupons.ts` y `/billing/cupones`.
>
> **Toda la lógica está escrita y probada** en `src/lib/stripe-coupons.ts`
> (`recordCheckoutDiscount`, `recordInvoiceDiscount`, con sus tests en
> `src/lib/stripe-coupons.test.ts`). Lo que se pide abajo son **cuatro líneas de
> enganche**, ninguna con lógica propia.

Estado actual, para situarse: `Payment` ya tiene `discountAmountCents` y
`couponId` (los dejó S1 en el esquema, que está congelado), y `StripeCoupon` ya
existe como espejo. Hoy **nadie los escribe**, así que la columna está siempre a
`null` y la medición de la pantalla de cupones sale a cero por mucho que se use
un código.

---

## 1 · Habilitar los códigos promocionales en la sesión de checkout

Hoy ninguna de las dos creaciones de checkout de socio los admite: Stripe **no
enseña la casilla "¿Tienes un código promocional?"** salvo que se le pida. Un
gimnasio puede crear el código en su cuenta, repartirlo, y el socio no tiene
dónde teclearlo.

### 1.1 · `createMemberCheckout` (recepción / portal / landing)

```diff
   const checkoutSession = await stripe.checkout.sessions.create(
     {
       mode,
       customer: stripeCustomerId,
       line_items: [{ price: priceResult.priceId, quantity: 1 }],
+      // HU-ST-27: sin esto Stripe no pinta la casilla del código y el cupón
+      // creado en la cuenta conectada es inalcanzable para el socio.
+      // `allow_promotion_codes` y `discounts` son EXCLUYENTES: en cuanto se
+      // quiera aplicar un descuento fijado desde Apta habrá que elegir uno de
+      // los dos, y el que pide la historia es este.
+      allow_promotion_codes: true,
       // HU-ST-09/D-S2: `payment_method_types` NO se fija. […]
```

### 1.2 · `createProspectMemberCheckout` (landing pública `/hazte-socio`)

Mismo cambio, mismo motivo. Es la puerta donde más sentido tiene un código de
captación, y es la que hoy queda fuera:

```diff
   const checkoutSession = await stripe.checkout.sessions.create(
     {
       mode: recurring ? "subscription" : "payment",
       customer_email: email,
       line_items: [{ price: priceResult.priceId, quantity: 1 }],
+      // HU-ST-27, igual que en `createMemberCheckout`.
+      allow_promotion_codes: true,
```

**No toca la clave de idempotencia.** El código lo teclea el socio *dentro* de la
sesión ya creada, así que dos intentos de la misma venta siguen compartiendo
sesión como hasta ahora (HU-ST-04). Tampoco cambia el `Payment` PENDING que se
crea por adelantado: su `amountCents` sigue siendo el precio de catálogo, y lo
corrige la conciliación del punto 2 —que es justo cuando se sabe qué descuento se
aplicó de verdad—.

---

## 2 · Capturar el descuento aplicado al conciliar

Dos puntos, uno por cada forma de cobrar. Los dos son un import y una llamada.

### 2.1 · Bono puntual — `src/lib/stripe-checkout.ts`, `reconcileMemberCheckoutSession`

Es el punto donde el `Payment` pasa a `PAID`. La llamada va **después** del
`update` a `PAID` y **dentro** de la guarda de reentrega que ya existe
(`if (payment.status === "PAID") return;`), así que una redelivery del webhook no
la repite:

```diff
+import { recordCheckoutDiscount } from "@/lib/stripe-coupons";
+
 …
   await prisma.payment.update({
     where: { id: payment.id },
     data: { status: "PAID", stripePaymentIntentId: paymentIntentId, receiptNumber: … },
   });
+
+  // HU-ST-27: cuánto descuento se aplicó y con qué código. Es lo que convierte
+  // "se usó un cupón" en "este código trajo N ventas y X €". Idempotente y sin
+  // efecto si la sesión no llevaba descuento.
+  await recordCheckoutDiscount(orgId, session);
```

`session` es el `Stripe.Checkout.Session` que ya recibe la función: no hace falta
expandir nada ni volver a llamar a Stripe. `total_details.amount_discount` viene
en el propio evento.

### 2.2 · Cuota recurrente — `src/lib/member-billing.ts`, `reconcileMemberInvoicePaid`

Aquí el `Payment` lo crea la propia función. La llamada va justo después, con el
id del `Payment` recién creado:

```diff
+import { recordInvoiceDiscount } from "@/lib/stripe-coupons";
+
 …
   // (donde `reconcileMemberInvoicePaid` crea/actualiza el Payment de la factura)
+  await recordInvoiceDiscount(orgId, invoice, payment.id);
```

Si esa función tiene más de un camino de creación (primera factura vs.
renovación), la llamada va en el punto común por el que pasan todos, con el
`Payment` ya escrito. `recordInvoiceDiscount` no crea nada y calla si el
`Payment` no existe o si la factura no llevaba descuento.

---

## Lo que NO se pide

- **Nada de `application_fee_amount`.** Sigue sin enviarse, y HU-ST-28 lo fija
  con un test estructural (`src/lib/platform-fee.test.ts`) que recorre todas las
  creaciones de checkout. Si al aplicar estos diffs aparece esa clave en alguna
  parte, el test se pone en rojo — y es lo correcto.
- **Nada de `discounts: [...]`** (descuento impuesto desde Apta). Es incompatible
  con `allow_promotion_codes` y no lo pide la historia.
- **Ningún cambio de esquema.** `Payment.discountAmountCents` y `Payment.couponId`
  ya existen.

## Cómo comprobar que quedó bien

`src/lib/stripe-coupons.test.ts` ya cubre la lógica (lectura del descuento del
evento, escritura en el `Payment`, idempotencia ante reentrega, espejo perezoso
de un cupón creado en el Dashboard, aislamiento entre organizaciones). Lo que
falta probar del lado de P1, en sus propios ficheros de test, es el enganche:

1. Las dos creaciones de checkout envían `allow_promotion_codes: true`.
2. Un `checkout.session.completed` con `total_details.amount_discount` deja el
   `Payment` con `discountAmountCents` y `couponId`; el mismo evento reentregado
   no cambia nada (la guarda de `status === "PAID"` ya corta antes).
3. Un `invoice.paid` con `total_discount_amounts` hace lo propio sobre el
   `Payment` de la cuota.

Con esos tres, el escenario "uso" de HU-ST-27 queda cerrado y la pantalla
`/billing/cupones` empieza a enseñar cifras distintas de cero.
