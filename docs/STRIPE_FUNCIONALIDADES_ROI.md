# TRAINING ZONE — Stripe: catálogo de funcionalidades, centralización de datos y ROI

**Documento de trabajo interno · v1.0 · estrategia + plan (todavía sin cuenta Stripe)**
**Origen:** petición de dirección (julio 2026): *"aún no puedo vincular la cuenta ni
obtener el webhook de Stripe, pero quiero un documento con todas las funcionalidades
que pueden encajar en la app teniendo en cuenta lo ya existente y los KPIs. ¿Qué
posibilidades ofrece Stripe? Quiero que nos diferenciemos centralizando datos que
aumenten el ROI del negocio o den información muy potente para la directiva."*

Este documento **no escribe código**. Es el mapa de lo que Stripe puede aportar sobre
lo que **ya está construido**, la lista de reglas de negocio nuevas (`RB-*`, extendiendo
`RB-PAGO-*` y `RB-BI-*`) y el plan por fases (F18+). Cada capacidad se ancla en el
código real y se marca qué necesita Stripe de verdad y qué ya es calculable sin él.

> ⚠️ **Antes de escribir una sola línea de código de esto, leer `AGENTS.md`.** Next.js 16 +
> Prisma 7 + Tailwind v4. El acceso a datos se aísla por `orgId` en `src/lib/*`. La
> integración Stripe vive hoy en `src/lib/stripe.ts`, `src/lib/stripe-checkout.ts` y
> `src/app/api/stripe/webhook/route.ts`. Reglas temporales: `src/app/api/jobs/run/route.ts`.
> Estética/gráficas: `docs/BRANDING.md`, `docs/UX_PREMIUM_PLAN.md`, skill `dataviz`,
> `src/lib/chart-colors.ts`.

**Convención de marcadores:** 🆕 entidad/campo/módulo nuevo · ➕ extiende algo existente ·
🔁 sustituye un mecanismo actual · 🚧 bloqueado hasta tener credenciales/cuenta Stripe · ⏱ regla temporal (job).

**Emparejar con:** `FEEDBACK_COBROS_DASHBOARD.md` (ciclo de vida de cobros, F12, y KPIs de dashboard,
F17), `CRM_REGLAS_NEGOCIO.md` (el "qué/porqué") y `CRM_IMPLEMENTACION_FUNCIONALIDADES.md`
(fases F8–F17). Este doc abre **F18–F25** y extiende `RB-PAGO-008+` / `RB-BI-012+`.

---

## 0. Estado real del código (base de partida)

No se parte de cero. Stripe ya está **cableado como canal de cobro puntual** y el modelo
tiene los ganchos preparados. Diagnóstico exacto antes de proponer nada:

| Pieza | Qué hace hoy | Dónde vive |
|---|---|---|
| Cliente Stripe | Se inicializa solo si hay `STRIPE_SECRET_KEY`; si no, cada acción falla con mensaje claro (no revienta) | `src/lib/stripe.ts` (`getStripeClient`, `isStripeConfigured`) |
| Checkout | **`mode: "payment"` (cobro puntual)** por plan; crea un `Payment` en `PENDING` y devuelve la URL | `src/lib/stripe-checkout.ts` (`createCheckoutSession`) |
| Webhook | Concilia `checkout.session.completed` → `PAID` y `checkout.session.expired` → `FAILED`; cierra/revierte el lead (`RB-LEAD-005`) | `src/app/api/stripe/webhook/route.ts` |
| Modelo | `Member.stripeCustomerId`, `Payment.stripeCheckoutSessionId / stripePaymentIntentId / stripeRefundId`, `PaymentMethod.STRIPE` | `prisma/schema.prisma` |
| UI | Formulario "Cobrar con Stripe" en cobros; si no hay claves, muestra aviso y el cobro manual hace de puente | `src/app/(app)/billing/stripe-checkout-form.tsx` |
| Suscripción | Se modela **localmente** (`Subscription` + `Payment` puntuales), **no** en Stripe Billing | `prisma/schema.prisma` (`model Subscription`), `src/app/(app)/billing/subscription-actions.ts` |
| Refunds | Modelo listo (`refundReason/refundedAt/stripeRefundId`) pero **emisión real 🚧 bloqueada** hasta credenciales (decisión D-2 de `FEEDBACK_COBROS_DASHBOARD.md`) | `RB-PAGO-003` / PAGO-2b |

> ⚠️ **El matiz que lo condiciona todo:** hoy el checkout es **puntual** (`mode: "payment"`),
> no **suscripción** (`mode: "subscription"`). La "cuota recurrente" es una construcción
> **local**: cada mes es un `Payment` nuevo que alguien tiene que originar. Por eso la mayor
> parte del valor de Stripe descrito aquí **no es "conectar la cuenta y ya"**, sino **subir a
> Stripe Billing** (F18) para que el cobro recurrente, el reintento de fallos y la previsión
> los gestione Stripe. Todo lo demás cuelga de esa decisión.

### 0.1. Lo que ya se puede medir SIN Stripe (importante para no sobrevender)

Buena parte de la "información potente para la directiva" **no depende de Stripe**: depende
del modelo local, que ya existe. `src/lib/dashboard-queries.ts` ya calcula ingresos/mes,
LTV y ticket medio (`RB-BI-002`), ranking de socios (`RB-BI-011`), servicio más vendido
(`RB-BI-010`), canal de adquisición con cierre (`RB-BI-008/009`), demografía, cohortes de
retención y ocupación. El `MRR` **normalizado** es calculable **hoy** desde
`Subscription.priceCents` + `status` (ver `RB-BI-012`).

**La tesis de este doc (§1) es que Stripe no reemplaza esos datos: los hace exactos y les
suma la "verdad del dinero" (cobrado de verdad, fallado, recuperado, comisiones, IVA,
fecha de payout) que hoy no tenemos.** Ahí está la diferenciación.

---

## 1. La tesis: Stripe como "fuente única del dinero" + centralización → ROI

La app ya es la **fuente única de la operación**: asistencia (`Booking`), salud
(`HealthRecord`), retención (`RetentionAlert`), embudo comercial (`Lead`), ofertas
(`PersonalizedOffer`), RRHH y ventas (`soldByUserId`). Lo que le falta es la **fuente única
del dinero real**: qué se cobró de verdad, qué falló, qué se recuperó, cuánto se llevó el
banco, cuánto es IVA, cuándo entra en cuenta.

Hoy ese dato es **manual y aproximado**: `Payment` se rellena a mano o por el checkout
puntual, mezcla métodos (efectivo/Bizum/tarjeta/SEPA) sin conciliación bancaria, y no
distingue bruto de neto. Un negocio de **suscripciones** que no automatiza el cobro
recurrente **pierde dinero por tres sitios a la vez**: cobros que nadie llega a lanzar,
tarjetas que caducan y nadie actualiza, y morosidad que se detecta tarde.

> **Diferenciación (lo que pide dirección):** la mayoría de plataformas de gimnasios tienen,
> por separado, *o* un CRM operativo *o* una pasarela de pago. **El valor está en cruzarlos.**
> Ningún dato de Stripe por sí solo dice "qué canal de captación trae socios que además
> **pagan más tiempo y con menos impagos**"; ningún CRM por sí solo dice "cuánto € recuperé
> automáticamente de tarjetas caducadas". **Nosotros tenemos las dos mitades en la misma base
> multi-tenant** — cruzarlas es el producto.

Las tres palancas de ROI, en una frase cada una (detalle cuantificado en §5):

1. **Recuperar ingreso que hoy se fuga** — reintentos inteligentes + actualización de
   tarjetas caducadas + domiciliación SEPA convierten "impago silencioso" en "cobrado".
2. **Reducir fricción de cobro** — Bizum, wallets y Link suben la conversión de alta y de
   renovación en el mercado español.
3. **Decidir con datos financieros reales** — MRR/NRR, previsión, LTV:CAC por canal y ROI de
   descuentos, todo en el mismo panel que la operación.

---

# Parte A — Catálogo de capacidades de Stripe y su encaje

Tabla-resumen (detalle por bloque debajo). "Encaje" = qué tan directo es sobre lo ya construido.

| # | Capacidad Stripe | Para qué en Training Zone | Encaje | Fase | Regla |
|---|---|---|---|---|---|
| A.1 | **Billing (suscripciones)** `mode:"subscription"` | Cuota recurrente automática (hoy es manual/local) | 🔁 Alto | F18 | `RB-PAGO-008` |
| A.2 | **SEPA Direct Debit** (domiciliación) | Cobro recurrente EU sin tarjeta; ya hay `PaymentMethod.SEPA` | ➕ Alto | F19 | `RB-PAGO-009` |
| A.3 | **Bizum** (método español) | Alta y pago puntual con el método nº1 en España; ya hay `PaymentMethod.BIZUM` | ➕ Alto | F19 | `RB-PAGO-010` |
| A.4 | **Wallets + Link** (Apple/Google Pay, Link) | Menos fricción → más conversión | ➕ Medio | F19 | `RB-PAGO-011` |
| A.5 | **Revenue Recovery** (Smart Retries, dunning, Card Account Updater) | Recuperar cobros fallidos y tarjetas caducadas → **menos churn involuntario** | 🆕 **Muy alto** | F20 | `RB-PAGO-012` |
| A.6 | **Customer Portal** | El socio actualiza tarjeta / ve facturas / pausa desde el portal | 🆕 Alto | F21 | `RB-PAGO-013` |
| A.7 | **Payment Links** | Bonos, eventos, cuotas de alta, regalos: link sin código (compartible por WhatsApp/anuncios) | 🆕 Medio | F21 | `RB-PAGO-014` |
| A.8 | **Coupons / Promotion Codes** | Materializar `PersonalizedOffer` como descuento real y medible | ➕ Alto | F20 | `RB-PAGO-015` |
| A.9 | **Stripe Tax** | IVA automático → neto vs bruto para dirección | 🆕 Medio | F24 | `RB-PAGO-016` |
| A.10 | **Terminal** (TPV presencial) | Cobro con datáfono en recepción, en el mismo libro que el online | 🆕 Medio | F23 | `RB-PAGO-017` |
| A.11 | **Connect** (cuentas conectadas) | Modelo plataforma: cada org (gimnasio) como cuenta conectada de **Apta** | 🆕 Estratégico | F25 | `RB-PAGO-018` |
| A.12 | **Sigma / Data Pipeline / Reporting API** | Ingesta de la verdad financiera para el BI centralizado | 🆕 Alto | F22 | `RB-BI-012+` |
| A.13 | **Radar** (antifraude) | Reglas antifraude y protección de contracargos | 🆕 Bajo | F24 | `RB-PAGO-019` |
| A.14 | **Invoicing** (facturas Stripe) | Factura/recibo con PDF — ⚠️ **ojo VERI\*FACTU** (§A.9) | ➕ Bajo | F24 | `RB-PAGO-016` |
| A.15 | **Entitlements / Billing Meters** | Gating de acceso por plan (biblioteca ONLINE) y cobro por uso (EP por sesión) | 🆕 Bajo | F18 | `RB-PAGO-008` |

## A.1–A.2 — Stripe Billing: subir la suscripción a Stripe (F18, `RB-PAGO-008`) 🔁

**El cambio de fondo.** Hoy `Subscription` es local y cada cobro mensual es un `Payment` que
alguien origina. Con Billing, Stripe posee la suscripción (`customer` + `subscription` +
`price`) y **emite y cobra la factura sola** cada ciclo; nuestra `Subscription`/`Payment`
pasan a ser el **espejo local alimentado por webhook** (mismo patrón que hoy con
`reconcileStripeCheckoutCompleted`, solo que sobre `invoice.paid` /
`invoice.payment_failed` / `customer.subscription.updated|deleted`).

Lo que Billing regala y hoy tenemos que simular a mano:

- **Ciclo de cobro automático** — desaparece el "¿alguien lanzó la cuota de este mes?".
- **Pausa / cancelación / cambio de importe nativos** — `pause_collection`,
  `cancel_at_period_end`, nuevo `price` con prorrateo. Son exactamente `RB-PAGO-004/006/007`
  que hoy resolvemos en local: pasan a delegarse en Stripe (el campo local sigue existiendo
  como espejo).
- **Trials** — `trial_period_days` mapea al `MemberState.TRIAL` (medible: conversión prueba→pago, `RB-BI-021`).
- **Subscription Schedules** — planes con fases (3 meses a X, luego a Y): habilitan la
  **previsión de ingresos comprometidos** (`RB-BI-017`).
- **Proration** — cambios a mitad de ciclo bien calculados (subidas/bajadas de plan, DUO).

**`RB-PAGO-008`** 🆕🔁 — El cobro recurrente pasa a **Stripe Billing** (`mode:"subscription"`).
`Subscription`/`Payment` se convierten en espejo local conciliado por webhook; las acciones
de ciclo de vida (`RB-PAGO-004/006/007`) se implementan contra la API de Stripe cuando la
suscripción es de Stripe, y en local cuando no (métodos manuales conviven). Idempotente.

**A.2 — SEPA Direct Debit (`RB-PAGO-009`)** ➕. Domiciliación bancaria recurrente: el socio
firma un **mandato** una vez y Stripe cobra cada mes sin tarjeta. Es el método natural de
suscripción en España/EU y evita el churn por caducidad de tarjeta. Ya existe
`PaymentMethod.SEPA` en el enum: hoy es "registro manual"; con Billing pasa a mandato real.
*Caveat:* SEPA es asíncrono (confirmación en días) y con posibilidad de devolución (R-transactions)
— el webhook debe conciliar `payment_intent.processing` → `succeeded`/`payment_failed`.

## A.3–A.4 — Métodos de pago del mercado español (F19, `RB-PAGO-010/011`) ➕

**Bizum (`RB-PAGO-010`).** Stripe soporta **Bizum** como método de pago en España. Es el
método más extendido para pagos rápidos entre particulares y pymes; ofrecerlo en el alta y
en productos puntuales (bonos, eventos) **reduce fricción real** frente a "dame los datos de
la tarjeta". Ya existe `PaymentMethod.BIZUM` — hoy es registro manual; pasaría a ser un
método más del checkout/Payment Link, conciliado por webhook.

**Wallets + Link (`RB-PAGO-011`).** Apple Pay, Google Pay y **Link** (checkout acelerado de
Stripe) autocompletan el pago en un toque. En móvil —donde vive el socio— suben la
conversión de alta y de renovación. Coste de integración: casi nulo si ya se usa Checkout.

> **Por qué esto es ROI y no cosmética:** cada punto de fricción en el alta es una fuga en el
> embudo `Lead → CERRADO` que ya medimos (`RB-BI-009`). Añadir Bizum/wallets es una palanca de
> conversión **medible con el dato que ya tenemos** (tasa de cierre por canal antes/después).

## A.5 — Revenue Recovery: la palanca de ROI nº1 (F20, `RB-PAGO-012`) 🆕

**Aquí está el dinero que hoy se fuga en silencio.** En cualquier negocio de cuotas, un
porcentaje de cobros recurrentes falla **sin que el socio quiera irse**: tarjeta caducada,
saldo puntual, límite. Es el **churn involuntario**, y es recuperable. Stripe Billing incluye:

- **Smart Retries** — reintenta los cobros fallidos en los momentos con más probabilidad de
  éxito (modelo de Stripe), en vez de un reintento fijo.
- **Dunning automático** — emails de "actualiza tu método de pago" con enlace al Customer Portal.
- **Card Account Updater** — actualiza automáticamente números de tarjeta caducados/reemitidos
  con las redes (Visa/Mastercard). Recupera cobros que fallarían sin que nadie toque nada.
- **Adaptive Acceptance / network tokens** — mejora la tasa de autorización (menos falsos rechazos).
- **Retention/cancellation flow** — ofrecer pausa en vez de baja en el momento de cancelar.

**`RB-PAGO-012`** 🆕 — Al conectar Billing, se activa la recuperación de ingresos. El webhook
concilia `invoice.payment_failed` (→ `Payment.FAILED` + candidato a `RetentionAlert`),
`invoice.paid` tras reintento (→ recuperado) y `customer.subscription.deleted` por impago
persistente (→ `CANCELLED`). **El `€ recuperado` se registra y se muestra** (`RB-BI-020`).

> **Cruce que nos diferencia:** un `invoice.payment_failed` **+** una `RetentionAlert` abierta
> del motor G.3 sobre el mismo socio = **máxima prioridad de rescate** para el equipo. Stripe
> recupera la tarjeta; nosotros sabemos, además, que ese socio ya venía bajando su asistencia.
> Ninguna pasarela sola tiene esa segunda mitad.

## A.6–A.8 — Autoservicio, Payment Links y cupones (F21/F20)

**Customer Portal (`RB-PAGO-013`)** 🆕. Página alojada por Stripe donde el socio actualiza su
tarjeta, ve sus facturas/recibos, y (según configuremos) pausa o cancela. Encaja en el
**portal del socio** (`src/app/(app)/portal/*`) como enlace "Gestionar mi pago". **ROI por
ahorro de recepción:** cada actualización de tarjeta que hace el socio es una gestión que no
hace el personal — y una causa de impago que se resuelve sin fricción.

**Payment Links (`RB-PAGO-014`)** 🆕. Enlaces de pago sin código para **productos puntuales**:
bono de sesiones extra, cuota de alta, evento/quedada (encaja con `Announcement` categoría
`EVENT`/`PROMO`), tarjeta regalo, material. Compartibles por WhatsApp o dentro de un anuncio.
Es el "producto de pago puntual" (`RB-PAGO-005`) llevado a su forma más simple.

**Coupons / Promotion Codes (`RB-PAGO-015`)** ➕. **La pieza que cierra el círculo de ofertas.**
Hoy `PersonalizedOffer` (F14) describe un descuento ("20% el primer mes") pero el descuento no
se **aplica** ni se **mide** en el cobro. Con cupones de Stripe, una oferta aprobada
(`OfferStatus.APROBADA`) se materializa como `coupon`/`promotion_code` aplicado a la
suscripción — y entonces se puede medir si **ese descuento se paga solo** (`RB-BI-018`:
¿el socio con 20% dto. retiene y alcanza LTV positivo vs. el que no?).

## A.9 — Impuestos y facturación: Stripe Tax + Invoicing (F24) ⚠️

**Stripe Tax (`RB-PAGO-016`)** calcula y aplica el **IVA** automáticamente por línea. Da a
dirección el **neto real** (hoy `Payment.amountCents` es bruto sin desglose). **Invoicing**
genera factura/recibo con PDF alojado.

> ⚠️ **Caveat VERI\*FACTU (no inventar cumplimiento):** la facturación fiscal en España
> (Ley Antifraude / VERI\*FACTU) exige software de facturación **certificado** con registro
> encadenado e inalterable. El README y `FEEDBACK_COBROS_DASHBOARD.md` (D-2/D-3) ya marcan
> VERI\*FACTU **fuera del MVP por diseño**. Stripe Invoicing **no** sustituye por sí solo esa
> obligación fiscal española. Postura de este doc: usar Stripe Tax/Invoicing para el **neto y
> el recibo al socio**, y mantener la **emisión fiscal VERI\*FACTU como dependencia externa
> documentada**, no como algo que resolvemos aquí. Decisión abierta **D-S3** (§Decisiones).

## A.10 — Terminal: unificar el cobro presencial (F23, `RB-PAGO-017`) 🆕

Datáfono de Stripe en recepción: el cobro en persona (hoy `PaymentMethod.CARD`/`CASH`
manual) entra **en el mismo libro** que el online. Ventaja de centralización: un único
`Payment`/conciliación para todo, sin cuadrar la caja del TPV del banco por separado. Encaje
medio (requiere hardware); alto valor de "dato único" para dirección.

## A.11 — Connect: el modelo de plataforma de Apta (F25, `RB-PAGO-018`) 🆕🧭

**La jugada estratégica de largo plazo, alineada con la naturaleza multi-tenant.** La app ya
es multi-tenant (Training Zone, Vitalia... cada una una `Organization`). Con **Stripe Connect**,
**Apta** (la plataforma) puede ser el *platform account* y cada gimnasio una **cuenta
conectada**: cada org cobra a sus socios en **su propia cuenta Stripe**, y Apta puede
(opcionalmente) cobrar una **application fee** por transacción o suscripción.

Esto habilita el modelo de negocio de **Apta como plataforma** (no solo software): ingresos
por uso, onboarding self-service de nuevos gimnasios (F7, hoy fuera de alcance) con su propio
alta de pagos, payouts independientes por org y aislamiento financiero real entre tenants.
Es la decisión más grande del doc — **D-S1** (§Decisiones): *¿Apta cobra a los socios (Connect,
modelo plataforma) o cada gimnasio conecta su cuenta Stripe directa (más simple, sin fee de
plataforma)?* Condiciona todo F18+.

## A.12 — Datos: Sigma, Data Pipeline, Reporting API (F22)

El **backbone de la centralización**. Tres vías para traer la verdad financiera de Stripe a
nuestro BI:

- **Webhooks** (ya los usamos) — tiempo real, evento a evento. Es la vía principal para
  mantener el espejo local (`Payment`/`Subscription`) al día.
- **Reporting API / Balance Transactions** — informes de payouts, comisiones, saldos:
  alimenta el **cash flow y el neto** (`RB-BI-022`).
- **Sigma** (SQL sobre datos Stripe) / **Data Pipeline** (export a almacén) — para análisis
  pesado sin recargar la app.

**Postura:** el espejo por **webhook** es suficiente para todos los KPIs de §Parte C; Sigma/
Pipeline se reservan para conciliación contable fina y auditoría, no para el dashboard diario.

## A.13–A.15 — Radar, Entitlements, Billing Meters (encaje bajo, se anotan por completitud)

- **Radar (`RB-PAGO-019`)** 🆕 — reglas antifraude y gestión de contracargos. Encaje bajo en
  un gimnasio (poco fraude), pero protege el neto. Se activa con Payments, casi sin trabajo.
- **Entitlements** — gating de acceso por plan comprado: p.ej., el plan `ONLINE` desbloquea la
  biblioteca `OnlineWorkout`. Hoy eso se controla en la app; Stripe Entitlements permitiría
  atarlo al `price` comprado. Encaje bajo (ya lo resolvemos en local), se anota como opción.
- **Billing Meters** — cobro por uso: EP cobrado por sesión realmente dirigida
  (`ClassSession.directedByUserId`, F13). Encaje bajo hoy (el modelo es por bono), futurible.

---

# Parte B — Reglas de negocio nuevas y cambios de modelo

## B.1. Familia `RB-PAGO-*` (extiende la de `FEEDBACK_COBROS_DASHBOARD.md`, hoy 001–007)

| Regla | Título | Depende de |
|---|---|---|
| `RB-PAGO-008` 🔁 | Cobro recurrente en **Stripe Billing** (`mode:"subscription"`); `Subscription`/`Payment` como espejo por webhook | Cuenta Stripe, D-S1 |
| `RB-PAGO-009` ➕ | **SEPA Direct Debit** recurrente con mandato | F18 |
| `RB-PAGO-010` ➕ | **Bizum** como método real (checkout / Payment Link) | Cuenta Stripe |
| `RB-PAGO-011` ➕ | **Wallets + Link** (Apple/Google Pay) | Checkout |
| `RB-PAGO-012` 🆕 | **Revenue Recovery**: Smart Retries + dunning + Card Account Updater; conciliación de fallo/recuperación | F18 |
| `RB-PAGO-013` 🆕 | **Customer Portal** de Stripe enlazado desde el portal del socio | F18 |
| `RB-PAGO-014` 🆕 | **Payment Links** para productos puntuales / eventos / regalos | Cuenta Stripe |
| `RB-PAGO-015` ➕ | **Cupones** de Stripe como materialización de `PersonalizedOffer` aprobada | F14 + F18 |
| `RB-PAGO-016` 🆕 | **Stripe Tax** (IVA) + Invoicing para neto y recibo (⚠️ VERI\*FACTU aparte) | D-S3 |
| `RB-PAGO-017` 🆕 | **Terminal** (cobro presencial en el mismo libro) | Hardware |
| `RB-PAGO-018` 🆕🧭 | **Connect**: Apta plataforma / cuentas conectadas por org | D-S1 |
| `RB-PAGO-019` 🆕 | **Radar** antifraude + gestión de contracargos | Payments |

## B.2. Cambios de modelo (Prisma) — mínimos y compatibles hacia atrás

La mayor parte del modelo **ya está** (`stripeCustomerId`, `stripe*Id` en `Payment`). Lo nuevo:

```prisma
model Subscription {
  // ... campos actuales (incluye pauseUntil, cancelAt ya presentes) ...
  stripeSubscriptionId String?  @unique // RB-PAGO-008: suscripción en Stripe Billing (null = cuota local/manual)
  stripePriceId        String?           // RB-PAGO-008: price de Stripe vigente (permite prorrateo/cambios de importe)
  currentPeriodEnd     DateTime?         // RB-PAGO-008: fin de ciclo (espejo del next invoice); base de RB-BI-017 (previsión)
  collectionPaused     Boolean  @default(false) // RB-PAGO-012: pause_collection activo
}

model Payment {
  // ... campos actuales (stripeCheckoutSessionId, stripePaymentIntentId, stripeRefundId ya presentes) ...
  stripeInvoiceId   String?  @unique // RB-PAGO-008: factura de Billing que originó el cobro recurrente
  stripeChargeId    String?           // conciliación fina (refunds/contracargos, RB-PAGO-019)
  amountFeeCents    Int?              // RB-BI-022: comisión de Stripe (neto = amountCents - fee - IVA)
  amountTaxCents    Int?              // RB-PAGO-016: IVA de la línea (Stripe Tax)
  recoveredFromFail Boolean  @default(false) // RB-PAGO-012 / RB-BI-020: cobrado tras reintento (churn involuntario recuperado)
  payoutId          String?           // RB-BI-022: payout de Stripe en el que entró (conciliación de tesorería)
}

model PersonalizedOffer {
  // ... campos actuales ...
  stripeCouponId    String? // RB-PAGO-015: cupón que materializa la oferta aprobada (mide ROI del descuento, RB-BI-018)
}

// 🆕 Opcional (F25/Connect): cuenta Stripe por organización si Apta es plataforma
model StripeAccount {
  id         String   @id @default(cuid())
  orgId      String   @unique
  accountId  String   @unique // acct_... conectado
  chargesEnabled Boolean @default(false)
  payoutsEnabled Boolean @default(false)
  createdAt  DateTime @default(now())
  organization Organization @relation(fields: [orgId], references: [id])
}
```

> Todos los campos son **opcionales** → migración Prisma 7 estándar sin romper datos. `null`
> en `stripeSubscriptionId` significa "cuota local/manual" y el código sigue el camino actual;
> con valor, sigue el camino Stripe Billing. Convivencia limpia de ambos mundos.

---

# Parte C — KPIs nuevos: la "información muy potente para la directiva"

**Familia `RB-BI-*` (extiende la de `FEEDBACK_COBROS_DASHBOARD.md`, hoy 001–011).** Estos son
los indicadores que un negocio de **suscripciones** necesita y que hoy no existen porque el
dashboard mide **caja** (`Payment` sumados), no **recurrencia**. Se marcan cuáles necesitan
Stripe de verdad y cuáles ya son calculables en local.

| Regla | KPI | Por qué importa a dirección | ¿Necesita Stripe? |
|---|---|---|---|
| `RB-BI-012` 🆕 | **MRR / ARR** (ingreso recurrente mensual/anual normalizado) | La métrica madre de un negocio de cuotas; hoy solo vemos caja del mes | **No** para el proxy (desde `Subscription.priceCents`+`status`); Stripe lo hace exacto |
| `RB-BI-013` 🆕 | **MRR waterfall**: nuevo / expansión / contracción / churn / reactivación | Explica *por qué* sube o baja el MRR, no solo que cambió | Parcial (local da altas/bajas; Stripe da el detalle limpio) |
| `RB-BI-014` 🆕 | **NRR / GRR** (net & gross revenue retention) | El indicador que mide si la base crece **sin captar** (subidas de plan vs. bajas) | Parcial |
| `RB-BI-015` 🆕 | **Churn involuntario vs voluntario** | Distingue "se fue" de "le falló la tarjeta" — lo segundo es recuperable | **Sí** (`invoice.payment_failed`) |
| `RB-BI-016` 🆕 | **LTV : CAC por canal** | Cruza LTV (Stripe/`Payment`) con coste de captación por canal (`RB-BI-008`) → **dónde invertir marketing** | No (LTV ya lo tenemos; falta meter el coste por canal) |
| `RB-BI-017` 🆕 | **Previsión de ingreso comprometido** (forward MRR) | "¿Cuánto tengo ya asegurado los próximos 3 meses?" desde ciclos/schedules | **Sí** (`currentPeriodEnd` / subscription schedules) |
| `RB-BI-018` 🆕 | **ROI de descuentos/ofertas** | ¿El 20% dto. de `PersonalizedOffer` se paga solo? Retención y LTV del cohortes con/sin cupón | **Sí** (cupón, `RB-PAGO-015`) |
| `RB-BI-019` 🆕 | **Retención por método de pago** | ¿Los de SEPA/tarjeta retienen más que los de efectivo/Bizum? → empuja al método que fideliza | No (ya tenemos `method`); Stripe lo hace fiable |
| `RB-BI-020` 🆕 | **€ recuperado por dunning** | Dinero que Stripe rescató de cobros fallidos — ROI directo y visible | **Sí** (`RB-PAGO-012`) |
| `RB-BI-021` 🆕 | **Conversión prueba → pago** (trial conversion) | Cuántos `TRIAL` pasan a `ACTIVE` de pago; salud del embudo de alta | Parcial (Stripe trials lo hace exacto) |
| `RB-BI-022` 🆕 | **Ingreso neto y conciliación de payouts** | Bruto − comisiones − IVA, y cuándo entra en cuenta → tesorería real | **Sí** (Reporting API / `fee`/`payout`) |

## C.1. Detalle de los tres que más mueven la aguja de dirección

**`RB-BI-012` — MRR/ARR (y por qué se puede empezar HOY).** El MRR es la suma del valor
mensual **normalizado** de las suscripciones activas (una anual cuenta 1/12 al mes). Es
calculable **ya** desde `Subscription` (`status ∈ {ACTIVE, FROZEN?}`, `priceCents`,
periodicidad del `plan.type`) en `src/lib/dashboard-queries.ts`, sin esperar a Stripe. Stripe
Billing lo vuelve exacto (descuentos, prorrateos, impagos) y añade el histórico limpio.
**Recomendación:** entregar el **proxy local de MRR ya** (quick win de dirección) y afinarlo con Stripe en F22.

**`RB-BI-016` — LTV:CAC por canal (el santo grial del ROI de marketing).** Ya tenemos las dos
piezas casi hechas: **LTV** por socio (`getLtvAndTicket`, `getMemberRanking`) y **canal de
adquisición** con cierre (`getAcquisitionChannels`, `RB-BI-008`). Falta **una sola entrada
nueva**: el **coste** por canal (inversión en Instagram Ads, campañas, etc.). Cruzándolos, el
panel responde a la pregunta de negocio de más alto valor: *"¿qué canal me trae socios que
además pagan más meses y con menos impagos, y cuánto me cuesta cada uno?"*. Eso **redirige
presupuesto de marketing con datos**, no por intuición. Requiere una tabla mínima de coste por
canal/mes (🆕 `AcquisitionCost` o campo en `LeadChannel`).

**`RB-BI-020` — € recuperado por dunning (ROI que se ve a simple vista).** Cada vez que Smart
Retries o el Card Account Updater rescatan un cobro fallido, `Payment.recoveredFromFail=true`.
Sumado y mostrado en el dashboard, es la línea que le dice a dirección, en euros, **cuánto ha
puesto Stripe directamente en caja este mes** — el argumento de ROI más limpio de todo el doc.

## C.2. Implementación (cuando toque)

- **Queries** en `src/lib/dashboard-queries.ts` (mismo patrón que las 20+ existentes),
  filtradas por `orgId`: `getMrr`, `getMrrWaterfall`, `getRevenueRetention`,
  `getInvoluntaryChurn`, `getLtvToCac`, `getCommittedRevenue`, `getDiscountRoi`,
  `getRetentionByPaymentMethod`, `getRecoveredRevenue`, `getTrialConversion`, `getNetRevenue`.
- **Gráficas** en `src/app/(app)/dashboard/charts.tsx` con Recharts + `chart-colors.ts`
  (skill `dataviz`): waterfall para `RB-BI-013`, líneas de cohorte para NRR/LTV, barras para
  retención por método, KPI grande + sparkline para MRR y € recuperado. Sin degradados; tokens `brand-*`.
- **Ingesta** en `src/app/api/stripe/webhook/route.ts`: ampliar el `switch` a `invoice.paid`,
  `invoice.payment_failed`, `customer.subscription.updated|deleted`, `charge.refunded`,
  `payout.paid`; cada handler concilia el espejo local de forma **idempotente** (patrón actual).
- **Job** en `src/app/api/jobs/run/route.ts`: regla ⏱ que recalcula agregados pesados
  (MRR histórico, cohortes) fuera del render, junto a las reglas temporales ya existentes.

---

# Parte D — Arquitectura de centralización (cómo aterriza el dato de Stripe)

El principio ya está probado en el repo (`reconcileStripeCheckoutCompleted`): **Stripe es la
autoridad del dinero, nuestra BD es el espejo consultable**, y el webhook es el puente. Se
generaliza:

```
                    ┌───────────── Stripe (autoridad del dinero) ─────────────┐
                    │  Billing · Payments · Tax · Terminal · Connect · Radar   │
                    └───────────────┬───────────────────────┬─────────────────┘
              webhooks (tiempo real)│                        │ Reporting API / Sigma (batch)
                                    ▼                        ▼
        src/app/api/stripe/webhook/route.ts        conciliación contable / auditoría
                                    │
             concilia IDEMPOTENTE el espejo local (orgId-aware)
                                    ▼
     Payment · Subscription · Member.stripeCustomerId · PersonalizedOffer.stripeCouponId
                                    │
        ┌───────────────────────────┴───────────────────────────┐
        ▼ (verdad del dinero)                    ▼ (verdad de la operación, YA existe)
  MRR/NRR/neto/recuperado            Booking · HealthRecord · RetentionAlert · Lead · soldByUserId
        └───────────────────────────┬───────────────────────────┘
                                    ▼
              BI cruzado (dashboard-queries) = el producto diferencial
```

**Reglas de la casa que se respetan sí o sí:**

- **Aislamiento por `orgId`** — cada objeto de Stripe lleva `orgId` en `metadata` (ya se hace
  en `createCheckoutSession`), y el webhook nunca escribe fuera del tenant que originó el evento.
- **Idempotencia** — todo handler tolera reintentos de Stripe (buscar por `stripe*Id` único
  antes de crear). Es el patrón actual, se mantiene.
- **Auditoría** — las acciones sensibles (refund, cancelación, cambio de importe) dejan
  `AuditLog` append-only, igual que hoy.
- **Verificación de firma** — el webhook ya valida `stripe-signature` con `STRIPE_WEBHOOK_SECRET`;
  no se relaja.

---

# Parte E — ROI: palancas, cómo se miden y orden de ataque

Las magnitudes son **rangos ilustrativos de referencia del sector** para dimensionar, **no
promesas**: se validan con los datos reales de Training Zone en cuanto haya un mes de Billing.
Lo importante es que **cada palanca es medible con un KPI concreto de la Parte C**.

| Palanca | Mecanismo Stripe | Se mide con | Orden de magnitud típico* |
|---|---|---|---|
| **Recuperar churn involuntario** | Smart Retries + Card Account Updater + SEPA | `RB-BI-020` (€ recuperado), `RB-BI-015` | Recuperar una fracción relevante de los cobros recurrentes que fallan cada mes |
| **Menos fricción en el alta** | Bizum + wallets + Link | `RB-BI-009` (cierre por canal, antes/después) | Uplift de conversión de alta en móvil |
| **Ahorro de recepción** | Customer Portal (autoservicio) | Nº de gestiones de pago que ya no hace el staff | Horas/mes de recepción liberadas |
| **Descuentos que se pagan solos** | Coupons ligados a `PersonalizedOffer` | `RB-BI-018` (LTV cohorte con/sin dto.) | Deja de regalarse margen en ofertas que no retienen |
| **Redirigir marketing** | (dato) LTV:CAC por canal | `RB-BI-016` | Reasignar gasto del canal caro al rentable |
| **Decisión financiera** | Reporting API (neto/payouts) | `RB-BI-022`, `RB-BI-012/014/017` | Menos sorpresas de tesorería; previsión fiable |

\* *Placeholders de dimensionamiento. Sustituir por los números reales tras el primer mes de datos Stripe.*

**Orden de ataque recomendado (máximo ROI / mínima dependencia primero):**

1. **Quick win sin Stripe:** MRR proxy local (`RB-BI-012`) + LTV:CAC por canal (`RB-BI-016`,
   solo falta el coste por canal). Da a dirección dos indicadores potentes **ya**, mientras se
   consigue la cuenta Stripe.
2. **F18 (Billing) + F20 (Revenue Recovery):** en cuanto haya cuenta, subir la suscripción a
   Stripe y encender la recuperación de ingresos — la palanca nº1.
3. **F19 (Bizum/SEPA/wallets):** fricción de cobro, palanca de conversión.
4. **F21 (Portal + Payment Links + cupones) y F22 (BI financiero completo).**
5. **F23/F24/F25 (Terminal, Tax/Invoicing, Connect):** según estrategia (D-S1) y hardware.

---

## Plan por fases (resumen accionable)

| Fase | Contenido | Depende de | Esfuerzo | Regla |
|---|---|---|---|---|
| **F18** | Stripe Billing: suscripción nativa + espejo por webhook; ciclo de vida delegado (pausa/cancel/importe) | Cuenta Stripe, **D-S1** | Alto | `RB-PAGO-008` |
| **F19** | Métodos España: SEPA recurrente, Bizum, wallets + Link | F18 (SEPA), cuenta (resto) | Medio | `RB-PAGO-009/010/011` |
| **F20** | Revenue Recovery (retries, dunning, Card Updater) + cupones de oferta | F18 | Medio | `RB-PAGO-012/015` |
| **F21** | Customer Portal + Payment Links (autoservicio y productos puntuales) | F18 | Bajo-Medio | `RB-PAGO-013/014` |
| **F22** | BI financiero: MRR/NRR/waterfall/forecast/neto/recuperado/LTV:CAC | F18 (datos) | Medio | `RB-BI-012…022` |
| **F23** | Terminal (cobro presencial en el mismo libro) | Hardware | Medio | `RB-PAGO-017` |
| **F24** | Stripe Tax + Invoicing (neto/recibo) — ⚠️ VERI\*FACTU aparte | **D-S3** | Medio | `RB-PAGO-016/019` |
| **F25** 🧭 | Connect: Apta plataforma / cuentas conectadas por org | **D-S1** | Alto | `RB-PAGO-018` |

**Quick wins que NO esperan a la cuenta Stripe:** MRR proxy local (`RB-BI-012`) y LTV:CAC por
canal (`RB-BI-016`) — se pueden construir sobre el modelo actual y dan valor de dirección desde ya.

---

## Decisiones de negocio (ABIERTAS — necesitan la palabra de dirección)

| # | Cuestión | Regla | Por qué importa |
|---|---|---|---|
| **D-S1** | **¿Apta cobra a los socios como plataforma (Connect, con application fee) o cada gimnasio conecta su cuenta Stripe directa (sin fee de plataforma)?** | `RB-PAGO-018` | Es la decisión raíz: condiciona el modelo de negocio de Apta y toda F18+. Connect = ingreso por transacción y self-service de tenants; directo = más simple y rápido. |
| **D-S2** | ¿Método de suscripción por defecto: **tarjeta**, **SEPA** o ambos ofrecidos? | `RB-PAGO-008/009` | SEPA reduce churn por caducidad pero es asíncrono; tarjeta es inmediata pero caduca. Afecta a churn involuntario. |
| **D-S3** | Facturación fiscal: ¿usamos Stripe Tax/Invoicing solo para **neto y recibo**, y VERI\*FACTU se resuelve con software fiscal externo certificado? | `RB-PAGO-016` | Cumplimiento legal español. Recomendación del doc: **sí**, no reinventar VERI\*FACTU aquí. |
| **D-S4** | ¿Materializamos `PersonalizedOffer` como **cupón real de Stripe** para poder medir su ROI? | `RB-PAGO-015` / `RB-BI-018` | Cierra el círculo "oferta → descuento aplicado → ¿retuvo?". Recomendación: sí. |
| **D-S5** | ¿Se necesita la **entrada de coste por canal** (marketing) para activar LTV:CAC? ¿Quién la mantiene? | `RB-BI-016` | Sin el coste, LTV:CAC queda a medias. Es una entrada manual mensual mínima con altísimo retorno de decisión. |

> Estas decisiones son **estratégicas**, no técnicas: por eso quedan abiertas para dirección.
> Todo lo demás del doc es plan de implementación una vez tomadas.

---

## Mapeo a entidades (orientativo)

| Concepto de negocio | Entidad / campo | Estado |
|---|---|---|
| Cobro recurrente automático | `Subscription.stripeSubscriptionId` + webhook `invoice.*` | 🆕 campo + handlers |
| Domiciliación SEPA / Bizum / wallets | `PaymentMethod.SEPA/BIZUM` (existen) + método de checkout | ➕ enum existe, 🆕 flujo real |
| Recuperación de cobro fallido | `Payment.recoveredFromFail` + Smart Retries/Card Updater | 🆕 campo + Billing |
| Autoservicio de pago del socio | Customer Portal enlazado desde `portal/*` | 🆕 enlace |
| Producto puntual / evento / regalo | Payment Link + `Payment` puntual (patrón `RB-PAGO-005` existe) | ➕ patrón existe, 🆕 link |
| Oferta como descuento medible | `PersonalizedOffer.stripeCouponId` | 🆕 campo, cierra F14 |
| IVA / neto | `Payment.amountTaxCents` + `amountFeeCents` (Stripe Tax/Reporting) | 🆕 campos |
| MRR / ARR | `Subscription.priceCents`+`status` (proxy) → Stripe Billing (exacto) | 🆕 query, base local existe |
| LTV : CAC por canal | `getLtvAndTicket` + `getAcquisitionChannels` (existen) + coste por canal | ➕ LTV/canal existen, 🆕 coste |
| Churn involuntario / € recuperado | webhook `invoice.payment_failed`/`paid` + `recoveredFromFail` | 🆕 handlers + KPI |
| Previsión de ingreso | `Subscription.currentPeriodEnd` / subscription schedules | 🆕 campo + query |
| Tesorería / payouts | `Payment.payoutId` + Reporting API | 🆕 conciliación |
| Modelo plataforma Apta | `StripeAccount` (por org) + Connect | 🆕 opcional (D-S1) |

---

*Fin del documento. Es estrategia + plan: no toca código y no requiere la cuenta Stripe para
escribirse, pero deja todo anclado en el repo real para ejecutar en cuanto lleguen las
credenciales y se cierren D-S1…D-S5. Emparejar con `FEEDBACK_COBROS_DASHBOARD.md` (F12 cobros /
F17 BI), `CRM_REGLAS_NEGOCIO.md` (el "qué/porqué") y `CRM_IMPLEMENTACION_FUNCIONALIDADES.md`
(fases F8–F17). Este doc abre F18–F25 y extiende `RB-PAGO-008+` / `RB-BI-012+`.*
