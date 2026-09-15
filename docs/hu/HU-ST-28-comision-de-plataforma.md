# HU-ST-28 · Comisión de plataforma: **documentada, NO activada**

> **Estado: no activada, y no hay bandera que la active.** Este documento existe
> para que esa frase se pueda sostener sin matices, y para que el día que alguien
> decida lo contrario sepa exactamente dónde tocar y qué se le viene encima.
>
> La comprobación no es este texto: es `src/lib/platform-fee.test.ts`, que se
> ejecuta en cada CI y se pone en rojo si aparece una comisión en cualquier
> creación contra Stripe. El texto explica; el test es el que afirma.

## 1 · La decisión

**D-9 (dirección, cerrada):** *solo licencia, cero comisión.* Apta cobra a los
gimnasios una suscripción SaaS (Plano 1) y **no toca el dinero que el gimnasio
cobra a sus socios** (Plano 2). Lo que el gimnasio venda es suyo íntegro.
Referencias: `docs/ARQUITECTURA_IDENTIDAD_VENTA_MULTITENANT.md` (D-9),
`docs/PLAN_IMPLEMENTACION_APTA_COMERCIAL.md` (D-9, `RB-VENTA-005`).

Esto no es una postura moral: es lo que hace que la arquitectura sea la que es.
Apta usa **Connect Standard con cargos directos** (`Stripe-Account: acct_…`), así
que en cada cobro de socio el **comerciante de registro es el gimnasio**: el
dinero nace en su cuenta, la factura es suya, el KYC es suyo, la devolución y el
contracargo son suyos. Apta no aparece en esa cadena.

## 2 · Por qué es el mejor argumento de venta que tenemos (E6-05)

MindBody y Glofox monetizan también por transacción. Un gimnasio que factura
20.000 €/mes en cuotas paga, con un 2 % de comisión de plataforma, **400 €/mes
además de la licencia** — y esa cifra crece justo cuando al gimnasio le va bien.
Apta cobra 99–129 €/mes y ahí se acaba. Por eso `/planes` puede decir **"cero
comisión sobre tus cobros"** en el hero y repetirlo como fila propia de la tabla
comparativa (E6-05), **sin asterisco**: no hay letra pequeña que lo matice porque
no hay comisión, ni siquiera desactivada por configuración.

La coherencia entre el mensaje y el código es lo que HU-ST-28 aporta: E6-05 no
tiene que fiarse de una promesa, tiene un test.

## 3 · Dónde se insertaría, si algún día se activa

Con cargos directos, la **única** forma de que Apta cobre comisión es pedírsela a
Stripe explícitamente. Son cuatro puntos, y ninguno está escrito hoy.

### 3.1 · Cobro puntual (bono) — `createMemberCheckout`, `src/lib/member-billing.ts`

En `mode: "payment"`, la comisión viaja dentro de `payment_intent_data`:

```ts
// NO ESTÁ EN EL CÓDIGO. Es dónde iría.
const checkoutSession = await stripe.checkout.sessions.create(
  {
    mode: "payment",
    line_items: [{ price: priceResult.priceId, quantity: 1 }],
    payment_intent_data: {
      application_fee_amount: Math.round(plan.priceCents * FEE_RATE), // ← aquí
    },
    …
  },
  { stripeAccount: accountId, idempotencyKey: memberCheckoutKey(orgId, memberId, planId) }
);
```

### 3.2 · Cuota recurrente — misma función, rama `mode: "subscription"`

Las suscripciones no admiten `application_fee_amount` (el importe de cada factura
no se conoce por adelantado): se usa un **porcentaje**, dentro de
`subscription_data`:

```ts
// NO ESTÁ EN EL CÓDIGO.
subscription_data: {
  application_fee_percent: 2.0, // ← aquí
  metadata: { orgId, memberId, planId, centerId },
}
```

### 3.3 · Checkout público del prospecto — `createProspectMemberCheckout`

Misma función de la misma pasarela, otra puerta (`/hazte-socio`). Los dos puntos
anteriores se repiten aquí tal cual. **Es el que se olvidaría**, y por eso el test
recorre *todas* las creaciones de checkout y no solo las dos primeras.

### 3.4 · Lo que NO es la vía, y conviene saberlo

- `transfer_data` / `on_behalf_of`: pertenecen a los *destination charges*, otro
  modelo (Apta como comerciante de registro). Cambiarían la arquitectura entera,
  no solo el importe. El test los vigila igual, porque son la otra forma de
  quedarse con parte del dinero.
- El **Plano 1** (`platform-billing.ts`, la licencia que Apta cobra a los
  gimnasios) no es esto: ahí el dinero es de Apta desde el principio y no hay
  comisión que aplicar sobre nada de nadie. Queda fuera de la afirmación de
  E6-05, que habla de *tus cobros* — los del gimnasio.
- La **comisión de Stripe** (la del ~1,5 % + 0,25 € que cobra la pasarela) no es
  de Apta, se la lleva Stripe, y el gimnasio ya la ve desglosada en cada cobro
  (`Payment.feeAmountCents`, HU-ST-23). "Cero comisión sobre tus cobros" se
  refiere a la de Apta, y el desglose de HU-ST-23 es justamente lo que evita que
  eso se lea como un engaño.
- La **app móvil no crea nada en Stripe**: abre en el navegador la URL de
  checkout que devuelve la web. No hay "espejo móvil" que pueda activar una
  comisión por su cuenta, y el test lo comprueba recorriendo también `apps/`.

## 4 · Qué implicaciones fiscales tendría

Esto es lo que convierte "activar la comisión" en un proyecto y no en una línea.

### 4.1 · Deja de ser un ingreso único y pasa a ser un ingreso por cliente

Hoy Apta emite **una factura de licencia** a cada gimnasio, con IVA español al
21 %, importe conocido de antemano y periodicidad fija. La comisión es otra cosa:
un ingreso **variable, devengado transacción a transacción**, que Stripe retiene
automáticamente y liquida a Apta por separado. Hay que:

- **Facturarla.** La `application_fee` que Stripe transfiere **no es una
  factura**: es un movimiento de dinero. Apta seguiría obligada a emitir factura
  al gimnasio por ese servicio, con su base imponible y su IVA — y ahora mensual,
  variable y calculada a partir de datos que viven en Stripe, no en Apta.
- **Cuadrarla.** El importe facturado tiene que cuadrar con lo efectivamente
  retenido, cobro a cobro, incluidas las devoluciones (ver 4.3).

### 4.2 · IVA: cambia la regla de localización

La licencia se factura a un cliente español: IVA 21 %, sin más. La comisión es un
**servicio prestado por vía electrónica a un empresario**, así que se rige por la
regla general de B2B (art. 69.Uno.1º LIVA):

- Gimnasio en España → 21 %, como ahora.
- Gimnasio en otro Estado miembro con NIF-IVA válido → **inversión del sujeto
  pasivo**, factura sin IVA, y obligación de **declaración recapitulativa
  (modelo 349)** y de validar el NIF-IVA en VIES.
- Gimnasio fuera de la UE → no sujeto, con sus propias reglas de justificación.

Hoy nada de esto aplica porque no hay comisión. El día que la haya, aplica
**aunque el gimnasio sea español**, porque obliga a construir el circuito completo
para poder vender fuera.

### 4.3 · Devoluciones y contracargos: la comisión no vuelve sola

Cuando el gimnasio devuelve un cobro, `refund_application_fee` **es `false` por
defecto**: Apta se quedaría con la comisión de una venta que se deshizo. Eso es
un abono que emitir y un litigio comercial esperando a pasar. En un contracargo,
además, el importe disputado y la tasa de Stripe se le cargan al gimnasio; la
comisión de Apta, si no se devuelve explícitamente, no. Hay que decidirlo,
implementarlo y **facturar la rectificativa** correspondiente.

### 4.4 · VERI\*FACTU

El proyecto ya deja fuera la facturación certificada (`/billing` lo dice en su
propia cabecera). Un ingreso recurrente variable por cliente entra de lleno en el
ámbito del reglamento de sistemas informáticos de facturación: activar la
comisión **adelanta esa deuda**, no la esquiva.

### 4.5 · Lo contractual, que va antes que lo fiscal

Las condiciones firmadas con los gimnasios y la página de planes dicen hoy "cero
comisión". Activar una comisión es una **modificación sustancial del contrato**:
preaviso, aceptación expresa y derecho de resolución. No es un despliegue.

## 5 · Lo que este documento NO deja

- **No hay bandera de configuración.** Ni variable de entorno, ni columna, ni
  constante a `0` esperando a subirse. La historia dice "documentada, NO
  activada" y eso es literal: una bandera a `false` es una comisión activada que
  todavía no se ha encendido, y convertiría "cero comisión" en "cero comisión por
  ahora". `src/lib/platform-fee.test.ts` lo comprueba también en `.env.example`.
- **No hay código muerto.** Los fragmentos de la sección 3 viven en este
  documento, en markdown, precisamente para que no existan en `src/`.

## 6 · Cómo se comprueba

`src/lib/platform-fee.test.ts`, en cada CI:

1. Ninguna creación de checkout —ni de PaymentIntent, ni de Subscription— envía
   `application_fee_amount` ni `application_fee_percent`.
2. Ninguna envía `transfer_data` ni `on_behalf_of` (la otra vía).
3. Ninguna de esas claves aparece en `src/` ni en `apps/` fuera de un comentario.
4. No existe variable de entorno de comisión en `.env.example` ni leída desde el
   código.
5. Este documento sigue existiendo y sigue diciendo que no está activada — para
   que borrarlo sin sustituirlo también ponga CI en rojo.
