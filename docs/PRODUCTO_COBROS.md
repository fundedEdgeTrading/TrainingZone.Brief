# Producto · Cobros

Todo lo que toca dinero. Reglas numeradas: `RB-PAGO-*`, `RB-VENTA-*`,
`RB-PLAN-*`, `RB-CONNECT-*` en [CRM_REGLAS_NEGOCIO.md](./CRM_REGLAS_NEGOCIO.md).

---

## 1. Los dos planos

El sistema cobra en dos direcciones distintas, y no se mezclan nunca:

| | **Plano 1** | **Plano 2** |
|---|---|---|
| Quién cobra a quién | Apta → gimnasio (licencia del software) | Gimnasio → socio (cuotas y bonos) |
| Dónde nace el dinero | Cuenta de Stripe de **Apta** | Cuenta de Stripe **del gimnasio** |
| Mecanismo | Checkout + suscripción propia | Connect Standard con **cargos directos** (`Stripe-Account: acct_…`) |
| Módulo | `src/lib/platform-billing.ts` | `src/lib/member-billing.ts` |
| Catálogo | `src/lib/platform-plans.ts` | `MembershipPlan` de cada organización |

**Una sola clave secreta en todo el sistema: la de Apta.** Ningún gimnasio
introduce nunca una clave propia. De él solo se guarda el `acct_…`
(`RB-CONNECT-001`): ni clave secreta, ni *webhook secret*.

### 1.1 «Cero comisión sobre tus cobros» es una afirmación comprobada

Con cargos directos el dinero del socio nace en la cuenta del gimnasio, y Apta
solo podría quedarse una parte pidiéndosela a Stripe explícitamente.
`src/lib/platform-fee.test.ts` (HU-ST-28) recorre **todo** el código de
producción —`src/` y `apps/`— y comprueba que no se pide por ninguna de las dos
vías (`application_fee_amount` y `transfer_data` / `on_behalf_of`). La comisión
está **documentada, no activada**: si algún día se activa, el test falla y obliga
a cambiar también la promesa comercial de `/planes`.

---

## 2. Plano 1 · La licencia de Apta

### 2.1 Catálogo

`src/lib/platform-plans.ts` es **solo datos**: no consulta base de datos, no
decide permisos y no habla con Stripe. La política vive en `entitlements.ts` y la
pasarela en `platform-billing.ts`. Añadir o cambiar un tier se hace ahí y en
ningún otro sitio.

El eje de precio es el **número de centros**, nunca el de socios (decisión D-8):
escala con el valor entregado y con nuestro coste, y no penaliza justo lo que
queremos que el gimnasio haga crecer.

| Plan | Precio | Centros | Funcionalidades |
|---|---|---|---|
| **Esencial** | 99 €/mes · 990 €/año | 1 | Solo el núcleo |
| **Avanzado** ⭐ | 129 €/mes · 1.290 €/año | 3 | Las siete, con cupo de 20 generaciones de IA/mes |
| **Élite** | 279 €/mes · 2.790 €/año | 10 | Las siete, IA sin cupo. Por encima de 10 centros, precio a medida |
| **Fundador** | 3.990 € pago único | 3 | Las de Avanzado **sin IA**, a perpetuidad. Oferta limitada con cupo real |

El núcleo que lleva **cualquier** plan (`CORE_FEATURES`): socios y
consentimientos, agenda y asistencia, cobros y morosidad, portal del socio y app
móvil, CRM de leads y anuncios, y organización/centros/personal/RRHH.

Decisiones que explican el reparto:

- La **IA** entra en Avanzado con cupo en vez de reservarse para Élite: es el
  único módulo con coste marginal real (~0,18 $/generación) y ahí es donde tenía
  que gatearse de verdad.
- **Fundador no lleva cupo de IA** a propósito: un cupo mensual dentro de un pago
  único es exactamente como envejecen mal las ofertas de por vida.
- **Élite ya no vende «centros ilimitados»**: ahí es donde vive el coste real de
  soporte.
- Los `price_…` de Stripe son **variables de entorno** (`priceEnvVar`), no
  código: cambian entre test y live (`RB-PLAN-001`).
- El contador de plazas de Fundador es real, no decorativo: se cuenta contra la
  base antes de cobrar (`remainingFundadorSeats`).
- `priceLabel` es **solo presentación**. Nunca se marca como precio estructurado
  ni se trata como el importe real: el que se cobra lo manda Stripe.

### 2.2 Alta pago-primero

La organización **nace del webhook de Stripe**, no de un formulario: se compra en
`/planes` sin organización previa y el aprovisionamiento
(`src/lib/provisioning.ts`) la crea con su dirección. No existen organizaciones
pre-pago a la espera; lo que existe es `PENDING_PAYMENT` con su muro (`/activar`)
y su purga por TTL, que corre una vez por pasada de cron, fuera del bucle de
organizaciones.

`SUSPENDED` **nunca se purga**: un impago no borra los datos de los socios de
nadie.

---

## 3. Plano 2 · El gimnasio cobra a sus socios

### 3.1 Conectar la cuenta

Un botón, OAuth de Connect Standard (`src/lib/stripe-connect.ts`), con `state =
orgId` para atar el callback a la organización que lo inició. El estado de la
conexión y lo que falta por configurar se resuelve en `stripe-connect-status.ts`
y se enseña en `/organization` y en `/puesta-en-marcha`.

### 3.2 Productos, cuotas y bonos

`MembershipPlan` es el catálogo del centro, espejado en Stripe. Recurrente o de
pago único lo decide `src/lib/plan-recurrence.ts`.

> **Invariante.** Nunca se borra un `Price` de Stripe: **se archiva**. Y toda
> creación contra Stripe lleva clave de idempotencia (`RB-PAGO-022`,
> `src/lib/stripe-idempotency.ts`: cliente, producto, precio, checkout de socio,
> checkout de prospecto, cupón, código promocional, reembolso, nota de crédito,
> reintento de factura).

### 3.3 Checkout del socio

`src/lib/member-billing.ts`, con `mode: "subscription"` y `card + sepa_debit`.
Entrada por el portal, por la app, o pública en `/hazte-socio/[org]/[centro]`.

**El freno del cobro asíncrono** (`RB-PAGO-025`): un adeudo SEPA tarda días en
liquidar y Stripe da la suscripción por activa mucho antes. Por eso existe
`PENDING_CONFIRMATION`: el motor de reservas filtra por `ACTIVE`, así que un
socio con el débito en vuelo **no abre acceso** hasta que llega
`checkout.session.async_payment_succeeded` / `invoice.paid`. Tampoco se le marca
como moroso: no ha impagado nada, todavía no se sabe
(`src/lib/stripe-mandate.ts`).

### 3.4 Preaviso SEPA

El esquema SEPA Core exige preavisar al deudor con **14 días naturales** de
antelación, salvo pacto distinto recogido en las condiciones firmadas. Antes, de
las once plantillas de correo la única de cobro era la de pago fallido, que llega
*después*: el socio se enteraba del cargo por el extracto.

`src/lib/sepa-prenotification.ts` (puro: fechas y decisiones) +
`sepa-prenotification-job.ts` (el envío, disparado por el cron).
`SEPA_PRENOTIFICATION_DAYS` refleja el plazo, y un plazo **más corto** que 14 solo
se aplica si `SEPA_PRENOTIFICATION_AGREED_IN_WRITING="true"` — la variable no es
el pacto, es su reflejo en la máquina. Uno más largo siempre vale: beneficia al
deudor.

### 3.5 Morosidad (dunning)

`src/lib/stripe-dunning.ts`. Abrir y cerrar la morosidad es **una sola puerta**,
compartida por las cuatro vías por las que se entra: factura fallida, adeudo
asíncrono fallido, devolución bancaria y contracargo.

Los **días de gracia son de la organización** y se leen del servidor (decisión
D-S5): ni el número ni el cálculo se escriben en ningún otro sitio
(`graceDeadline`, `graceWindowFor`, `isWithinGraceWindow` en `billing-shared.ts`).

Las tres transiciones de estado que produce este motor —impago abierto, impago
cerrado y baja por reintentos agotados— **las escribe `member-lifecycle.ts`**, no
el propio motor: un `update` suelto aquí sería un socio sin motivo de baja, y se
saltaría el enganche de referidos y el disparador de flujos.

### 3.6 Cupones y códigos promocionales

`src/lib/stripe-coupons.ts` (HU-ST-27). El cupón se crea en la cuenta
**conectada del gimnasio**, nunca en la de Apta, y queda espejado en
`StripeCoupon`. El checkout admite el código y el `Payment` registra el descuento
aplicado, que es lo que los hace **medibles**. Pantalla: `/billing/cupones`.

### 3.7 Reembolsos, notas de crédito y disputas

- **Reembolsos** (`/billing/reembolsos`, `src/lib/stripe-refunds.ts`): dirección
  emite la devolución desde Apta, con `assertRefundable` decidiendo qué es
  reembolsable y el ámbito de socio aplicado.
- **Disputas** (`/billing/disputas`, `src/lib/stripe-disputes.ts`): una disputa es
  dinero que **ya salió** de la cuenta del gimnasio y que el banco del socio
  reclama, con una fecha límite dura — pasada sin responder, se pierde sola.
  Hasta HU-ST-21 eso solo se veía entrando al Dashboard de Stripe, es decir: no
  se veía.

### 3.8 Contabilidad

`/billing/contabilidad` + `src/lib/stripe-export.ts` (`RB-BI-023`, decisión
D-S8). Lo que sale es un **extracto de cobros, no una serie de facturación**, y
el propio fichero lo dice en su cabecera. No es adorno: sin esa frase la gestoría
lo trata como libro registro de IVA y le pide a Apta una numeración correlativa
que Apta no emite — **Apta factura solo su licencia al centro (B2B), y el centro
factura al socio con su propio software**.

Gateado por la funcionalidad `exportaciones`.

---

## 4. Webhooks

`src/app/api/stripe/webhook`. Stripe entrega **al menos una vez**: el mismo
evento puede llegar varias veces (reintentos tras un 500, reentregas manuales, un
timeout de red que nos dio por caídos cuando ya habíamos escrito).

`StripeWebhookEvent` es la marca única y transversal (`RB-PAGO-023`): `id` es el
`evt_…` y `processedAt` **solo se escribe cuando el manejador ha terminado bien**.
Un evento que falla a mitad no queda marcado, así que el 500 que devolvemos hace
que Stripe lo reintente y la próxima vez se procese de verdad. Hay además un
*lease* de 60 s para distinguir dos entregas simultáneas del mismo evento
(concurrencia) de un reintento real, que siempre llega con minutos de separación.

La **versión de API de Stripe no es configuración de entorno**: se fija en el
código (`PINNED_STRIPE_API_VERSION` en `src/lib/stripe-api-version.ts`,
`RB-PAGO-021`) para que un `npm update` no la cambie bajo los pies. Si el SDK
instalado declara otra, el arranque lo avisa por log y sigue llamando con la
fijada.

---

## 5. Consola de Stripe para dirección

`/stripe` (HU-ST-24), **solo lectura** y solo `OWNER`.

1. **Acceso**: cada apertura deja una fila en `AuditLog`
   (`STRIPE_CONSOLE_VIEWED`). Se registra la apertura aunque Stripe no conteste:
   lo que se audita es quién miró, no si había datos que enseñar.
2. **Entorno**: el distintivo TEST/LIVE sale del prefijo de la clave.

---

## 6. Modo demo y degradación

Sin `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`, el checkout y el webhook
**degradan con un error controlado** en vez de reventar, y existe un checkout de
demostración (`/demo-checkout`, `src/lib/demo-member-checkout.ts`,
`isDemoModeActive`) para poder recorrer el alta completa sin cuenta de Stripe.
`/demo-checkout` es pública pero `noindex`.
