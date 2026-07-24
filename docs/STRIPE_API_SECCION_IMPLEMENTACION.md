# TRAINING ZONE — Sección "Stripe API": guía de implementación

**Documento de trabajo interno · v1.0 · guía de implementación (fase de descubrimiento)**
**Origen:** petición de dirección (julio 2026): *"crea una guía de implementación para una
nueva sección, para el rol con más permisos, llamada **Stripe API**. De momento quiero **ver
todas las funcionalidades y datos** que podemos sacar de Stripe. Analiza la API de Stripe y
encuentra lo más interesante para el negocio (Apta)."*

Esta guía define una sección nueva —una **consola de solo lectura** sobre la API de Stripe—
para el rol **`OWNER` (Dirección)**, el de más permisos de la app. El objetivo de esta primera
entrega es **exponer y visualizar** todo lo que Stripe expone por API; las **acciones**
(refund, reintentar, cancelar…) se dejan para una fase posterior (§7), porque "de momento
quiero ver".

> ⚠️ **Antes de escribir código, leer `AGENTS.md`.** Next.js 16 (App Router) + Prisma 7 +
> Tailwind v4. Acceso a datos aislado por `orgId` en `src/lib/*`. La integración Stripe vive
> hoy en `src/lib/stripe.ts` (cliente demo-safe), `src/lib/stripe-checkout.ts` y
> `src/app/api/stripe/webhook/route.ts`. Roles/navegación: `src/lib/rbac.ts` + `src/lib/guard.ts`.
> Primitivas UI: `src/components/ui/*`. SDK instalado: **`stripe@22.3.2`** (ver `package-lock.json`).

**Emparejar con:** `STRIPE_FUNCIONALIDADES_ROI.md` (la estrategia y los KPIs; esta consola es
la **capa de lectura/observabilidad** que hace visible esa "verdad del dinero") y
`FEEDBACK_COBROS_DASHBOARD.md` (F12 cobros / F17 BI).

---

## 0. Contexto y principios (leer antes de nada)

**Qué ya existe (base de partida).**

| Pieza | Estado | Fichero |
|---|---|---|
| Cliente Stripe **demo-safe** (si no hay clave, no revienta) | ✅ | `src/lib/stripe.ts` (`getStripeClient`, `isStripeConfigured`) |
| Checkout puntual + conciliación | ✅ | `src/lib/stripe-checkout.ts` |
| Webhook (checkout completed/expired) | ✅ | `src/app/api/stripe/webhook/route.ts` |
| Ganchos en modelo (`stripeCustomerId`, `Payment.stripe*Id`) | ✅ | `prisma/schema.prisma` |
| Patrón de sección restringida a dirección | ✅ | `src/app/(app)/audit/page.tsx` (`requireRole(["OWNER","PLATFORM_ADMIN"])`) |

**Tres principios que condicionan el diseño de esta sección:**

1. **Cada gimnasio tiene su propia cuenta Stripe** (decisión D-S1, ver `STRIPE_FUNCIONALIDADES_ROI.md`).
   Por tanto la consola muestra **la cuenta del `orgId` en sesión**, no una global. El cliente
   Stripe debe resolverse **por organización** (§6.1), aunque hoy `getStripeClient()` lea aún
   una clave global — esta consola es un buen motivo para hacer esa evolución.
2. **Solo lectura en esta fase.** Todos los endpoints usados son `list` / `retrieve`. Nada de
   `create`/`update`/`delete`. Esto permite operar con una **clave restringida de solo lectura**
   (§6.3) y elimina el riesgo de tocar dinero real sin querer.
3. **Demo-safe siempre.** Sin `STRIPE_SECRET_KEY` (o sin cuenta conectada), cada vista muestra
   un estado "Stripe no conectado" claro, nunca un error — igual que hace hoy
   `stripe-checkout-form.tsx`. La sección se puede construir y mergear **sin la cuenta Stripe**.

---

## 1. La sección: "Stripe API" — rol, navegación y estructura

**Rol.** `OWNER` (Dirección) — el de más permisos (14 entradas de nav, todos los `can*` de
`rbac.ts`). Se protege con `requireRole(["OWNER"])`. *(Ver decisión D-API-1: valorar añadir
`PLATFORM_ADMIN` para una vista cross-org de Apta.)*

**Navegación** — nueva entrada en `NAV_BY_ROLE.OWNER` (`src/lib/rbac.ts`), sección
"Administración" (junto a Auditoría/Organización):

```ts
// src/lib/rbac.ts — dentro de NAV_BY_ROLE.OWNER
{ href: "/stripe", label: "Stripe API", section: "Administración" },
```

**Estructura de ficheros** (App Router, misma convención que `dashboard/`, `billing/`, `audit/`):

```
src/app/(app)/stripe/
  page.tsx                 Resumen (cuenta + saldo + próximo payout + MRR + últimos eventos)
  layout.tsx               Tabs de la consola (guard requireRole(["OWNER"]) una vez)
  balance/page.tsx         Saldo, balance transactions, payouts (tesorería/neto)
  customers/page.tsx       Clientes + métodos de pago (tarjetas por caducar)
  payments/page.tsx        PaymentIntents, charges, refunds, disputes
  subscriptions/page.tsx   Suscripciones, facturas, próxima factura, schedules
  catalog/page.tsx         Products, prices, coupons/promo codes, payment links
  events/page.tsx          Feed de eventos + salud de webhooks
  reports/page.tsx         Reporting API (informes financieros descargables)
src/lib/stripe-admin-queries.ts   Wrappers de LECTURA por orgId (list/retrieve), demo-safe
```

Cada `page.tsx` es un **Server Component** que llama a `stripe-admin-queries.ts` y pinta con
primitivas de `src/components/ui/*` (`PageHeader`, `TableShell/THead/Th/TRow/Td`, `Badge`,
`EmptyState`, `FilterBar`), exactamente como `audit/page.tsx`.

---

# Parte A — Catálogo: TODO lo que se puede sacar de la API de Stripe

Análisis de la API de Stripe (SDK `stripe@22.3.2`) mapeado a Apta. Columna **"Interés Apta"**:
⭐⭐⭐ imprescindible · ⭐⭐ alto · ⭐ útil / nicho. Todos los endpoints listados son **de lectura**.

## A.1. Cuenta, saldo y tesorería ⭐⭐⭐ (el dinero real)

| Dato Stripe | Endpoint (lectura) | Qué muestra / valor para Apta | Interés |
|---|---|---|---|
| **Account** | `accounts.retrieve()` | Estado de la cuenta del gimnasio: `charges_enabled`, `payouts_enabled`, `requirements` (KYC pendiente), país, divisa, `capabilities` | ⭐⭐⭐ |
| **Balance** | `balance.retrieve()` | Saldo **disponible** y **pendiente** por divisa: cuánto dinero hay ahora mismo | ⭐⭐⭐ |
| **Balance Transactions** | `balanceTransactions.list()` | Cada movimiento con `amount`, **`fee`** y **`net`**: la fuente de la verdad de comisiones y **neto** (alimenta `RB-BI-022`) | ⭐⭐⭐ |
| **Payouts** | `payouts.list()` / `retrieve()` | Transferencias al banco del gimnasio: importe, estado, **`arrival_date`** (cuándo entra) | ⭐⭐⭐ |
| **Payout ↔ cobros** | `balanceTransactions.list({ payout })` | Qué cargos componen cada payout → **conciliación de tesorería** para gestoría | ⭐⭐ |

## A.2. Clientes y métodos de pago ⭐⭐⭐ (prevención de churn)

| Dato Stripe | Endpoint | Qué muestra / valor | Interés |
|---|---|---|---|
| **Customers** | `customers.list()` / `search()` | Clientes de Stripe = socios con `stripeCustomerId`; permite el cruce Stripe↔`Member` | ⭐⭐ |
| **Payment Methods** | `customers.listPaymentMethods()` / `paymentMethods.list()` | Tarjetas/SEPA guardados: marca, `last4`, **`exp_month/exp_year`** → **detectar tarjetas por caducar** y avisar **antes** de que falle el cobro (churn involuntario preventivo) | ⭐⭐⭐ |
| **Mandates (SEPA)** | vía `setupIntents`/`paymentMethod.sepa_debit` | Mandatos de domiciliación activos | ⭐ |
| **Customer balance / credit** | `customers.retrieve()` (`balance`) | Saldo a favor/crédito del cliente | ⭐ |

## A.3. Pagos, devoluciones y disputas ⭐⭐⭐

| Dato Stripe | Endpoint | Qué muestra / valor | Interés |
|---|---|---|---|
| **PaymentIntents** | `paymentIntents.list()` | Intentos de cobro: estado, importe, método, cliente | ⭐⭐ |
| **Charges** | `charges.list()` | Cargos con **`outcome`** (nivel de riesgo de Radar), método, recibo | ⭐⭐ |
| **Refunds** | `refunds.list()` | Devoluciones emitidas (cuando se activen, `RB-PAGO-003`) | ⭐⭐ |
| **Disputes / Chargebacks** | `disputes.list()` | Contracargos: estado, importe, **`evidence_details.due_by`** (plazo para responder) → gestionar y ver **tasa de disputas** | ⭐⭐⭐ |
| **Radar Reviews** | `reviews.list()` | Pagos retenidos para revisión por riesgo | ⭐ |
| **Early Fraud Warnings** | `radar.earlyFraudWarnings.list()` | Avisos tempranos de fraude de las redes | ⭐ |

## A.4. Suscripciones y facturación ⭐⭐⭐ (MRR, previsión, impagos)

| Dato Stripe | Endpoint | Qué muestra / valor | Interés |
|---|---|---|---|
| **Subscriptions** | `subscriptions.list()` | Suscripciones activas/pausadas/canceladas, `status`, `current_period_end`, `items` → **MRR real** y ciclo de vida (base de `RB-BI-012/014`) | ⭐⭐⭐ |
| **Upcoming / preview de factura** | `invoices.createPreview()` *(antes `retrieveUpcoming`)* | **Próximo cobro exacto** de un cliente → previsión (`RB-BI-017`) | ⭐⭐⭐ |
| **Invoices** | `invoices.list()` | Facturas emitidas: `paid`/`open`/`uncollectible`, importe, **PDF alojado** → **impagos** y recibos | ⭐⭐⭐ |
| **Subscription Schedules** | `subscriptionSchedules.list()` | Planes por fases (3 meses a X, luego Y) → **ingreso comprometido** | ⭐⭐ |
| **Credit Notes** | `creditNotes.list()` | Abonos / rectificativas (⚠️ VERI\*FACTU aparte) | ⭐ |
| **Invoice Items** | `invoiceItems.list()` | Líneas sueltas pendientes de facturar | ⭐ |

## A.5. Catálogo, descuentos y enlaces ⭐⭐

| Dato Stripe | Endpoint | Qué muestra / valor | Interés |
|---|---|---|---|
| **Products** | `products.list()` | Catálogo de productos en Stripe (espejo de `MembershipPlan`) | ⭐⭐ |
| **Prices** | `prices.list()` | Tarifas (recurrente/puntual), divisa, intervalo | ⭐⭐ |
| **Coupons** | `coupons.list()` | Descuentos definidos | ⭐⭐ |
| **Promotion Codes** | `promotionCodes.list()` | Códigos y **`times_redeemed`** → **uso real y ROI de ofertas** (`RB-BI-018`, liga con `PersonalizedOffer`) | ⭐⭐⭐ |
| **Payment Links** | `paymentLinks.list()` | Enlaces de pago activos (bonos, eventos, regalos) | ⭐⭐ |
| **Checkout Sessions** | `checkout.sessions.list()` | Sesiones de checkout (ya las creamos hoy) | ⭐⭐ |

## A.6. Observabilidad: eventos y webhooks ⭐⭐⭐ (confianza en la conciliación)

| Dato Stripe | Endpoint | Qué muestra / valor | Interés |
|---|---|---|---|
| **Events** | `events.list()` | **El log de TODO** lo que pasa en Stripe (últimos ~30 días): cada cobro, fallo, refund, cambio de suscripción → **feed de actividad** y depuración del webhook | ⭐⭐⭐ |
| **Webhook Endpoints** | `webhookEndpoints.list()` | Endpoints configurados y su estado → **salud** de nuestra conciliación (¿está el webhook vivo?) | ⭐⭐ |
| **Event Destinations** *(API v2)* | `v2.core.eventDestinations.list()` | Nuevo modelo de destinos de eventos (thin events) | ⭐ |

## A.7. Impuestos y reporting ⭐⭐

| Dato Stripe | Endpoint | Qué muestra / valor | Interés |
|---|---|---|---|
| **Reporting: Report Types** | `reporting.reportTypes.list()` | Informes disponibles (cambios de saldo, conciliación de payouts, resumen de actividad…) | ⭐⭐ |
| **Reporting: Report Runs** | `reporting.reportRuns.list()` / `create()` | Ejecutar/descargar informes financieros → **para la gestoría** (aunque cree, es acción "segura" de generar informe) | ⭐⭐⭐ |
| **Tax Registrations / Settings** | `tax.registrations.list()`, `tax.settings.retrieve()` | Registros de IVA y configuración fiscal | ⭐ |
| **Tax Transactions** | `tax.transactions` | IVA por transacción → neto vs bruto | ⭐⭐ |
| **Sigma (Scheduled Queries)** | `sigma.scheduledQueryRuns.list()` | Resultados de consultas SQL programadas sobre datos Stripe | ⭐ |
| **Financial Connections** | `financialConnections.accounts.list()` | Cuentas bancarias vinculadas | ⭐ |

## A.8. Connect (multi-cuenta) ⭐⭐ — relevante por D-S1 (cada gimnasio su cuenta)

| Dato Stripe | Endpoint | Qué muestra / valor | Interés |
|---|---|---|---|
| **Account requirements/capabilities** | `accounts.retrieve()` | Si el gimnasio completó el onboarding (KYC), qué falta | ⭐⭐⭐ |
| **Persons** | `accounts.listPersons()` | Titulares/representantes de la cuenta (KYC) | ⭐ |
| **Login Links** | `accounts.createLoginLink()` | Enlace directo al dashboard Stripe del gimnasio (Express) | ⭐⭐ |
| **Application Fees / Transfers** | `applicationFees.list()`, `transfers.list()` | Solo si algún día hubiera fee de plataforma (**descartado por D-S1**); listable por completitud | ⭐ |

## A.9. Encaje bajo (se anotan por completitud, no en esta fase)

`Terminal` (`terminal.readers`, `terminal.locations` — TPV presencial, ⭐⭐ futuro),
`Billing Meters` / `Meter Events` (cobro por uso, EP por sesión — ⭐ futuro),
`Entitlements` (gating de features por plan — ⭐), `Issuing` (emitir tarjetas — ✗),
`Treasury` (banking-as-a-service — ✗), `Identity` (verificación — ✗), `Climate` (✗),
`Files`/`FileLinks` (evidencia de disputas — ⭐ soporte de A.3). **Novedad 2025** a vigilar:
**Scripts & Workflows** de Billing ("motor de ingresos programable") — automatizaciones sobre
objetos de facturación; interesante a futuro para reglas de dunning/ofertas, no en esta fase.

---

# Parte B — Lo MÁS interesante para Apta (la lista corta priorizada)

Si la primera entrega solo pudiera enseñar **8 cosas**, estas — todas de alto valor de negocio
y todas de lectura:

1. **Estado de la cuenta** (`Account.requirements/charges_enabled`) — ¿está el gimnasio listo
   para cobrar? Lo primero que quiere ver dirección al conectar.
2. **Saldo + próximo payout** (`Balance`, `Payouts.arrival_date`) — cuánto dinero hay y **cuándo
   entra en el banco**. Tesorería de un vistazo.
3. **Neto real y comisiones** (`BalanceTransactions.fee/net`) — lo que de verdad se ingresa tras
   comisiones (hoy `Payment.amountCents` es bruto). Alimenta `RB-BI-022`.
4. **MRR y ciclo de vida de suscripciones** (`Subscriptions`, `current_period_end`) — la métrica
   madre del negocio de cuotas, con datos reales de Stripe.
5. **Próxima factura por cliente** (`invoices.createPreview`) — previsión exacta del siguiente
   cobro (`RB-BI-017`).
6. **Tarjetas por caducar** (`PaymentMethods.exp_*`) — **prevención** de churn involuntario:
   avisar antes de que falle. Cruza con el motor de retención (G.3).
7. **Impagos y disputas** (`Invoices` `open/uncollectible`, `Disputes.due_by`) — dinero en
   riesgo y plazos legales que no se pueden dejar pasar.
8. **Feed de eventos** (`Events.list`) — confianza: ver en vivo que la conciliación por webhook
   está funcionando, y depurar cuando no.

> **Diferenciación (recordatorio del doc de estrategia):** el valor no es *ver* datos de Stripe
> —eso lo da el propio dashboard de Stripe— sino **cruzarlos con la operación de Apta** en la
> misma pantalla: una tarjeta por caducar **+** una `RetentionAlert` abierta del mismo socio =
> máxima prioridad de rescate. Esta consola es el primer paso (traer el dato); el cruce vive en
> el dashboard (`RB-BI-012…022`).

---

# Parte C — Implementación

## C.1. Capa de datos: `src/lib/stripe-admin-queries.ts` (LECTURA, demo-safe, por orgId)

Wrappers finos sobre el SDK, uno por recurso, todos con el **mismo patrón**: resolver el
cliente del `orgId`, y si no hay Stripe, devolver un estado "no conectado" en vez de fallar.

```ts
// src/lib/stripe-admin-queries.ts  (orientativo — leer AGENTS.md antes de codificar)
import { getStripeClient } from "@/lib/stripe";

export type StripeReadResult<T> =
  | { connected: true; data: T }
  | { connected: false; reason: "not_configured" | "no_account" };

/** Saldo actual de la cuenta del gimnasio (A.1). */
export async function getStripeBalance(orgId: string): Promise<StripeReadResult<import("stripe").Stripe.Balance>> {
  const stripe = getStripeClient(orgId);           // §C.4: resolución por org (D-S1)
  if (!stripe) return { connected: false, reason: "not_configured" };
  const data = await stripe.balance.retrieve();
  return { connected: true, data };
}

/** Últimos movimientos con fee/net (A.1) — paginado acotado, nunca ilimitado. */
export async function listBalanceTransactions(orgId: string, limit = 50) {
  const stripe = getStripeClient(orgId);
  if (!stripe) return { connected: false as const, reason: "not_configured" as const };
  const page = await stripe.balanceTransactions.list({ limit });   // cursor-paginado
  return { connected: true as const, data: page.data, hasMore: page.has_more };
}
```

Repetir el patrón para: `getAccountStatus`, `listPayouts`, `listCustomersWithCards`,
`listSubscriptions`, `previewUpcomingInvoice`, `listInvoices`, `listDisputes`,
`listPromotionCodes`, `listEvents`, `listReportTypes`. **Ninguna** llama a `create/update/delete`
(salvo, opcionalmente, `reporting.reportRuns.create` que solo genera un informe).

## C.2. Páginas: Server Components + primitivas UI existentes

Mismo molde que `audit/page.tsx`. El **guard va una vez en `layout.tsx`** de la sección:

```tsx
// src/app/(app)/stripe/layout.tsx  (orientativo)
import { requireRole } from "@/lib/guard";
export default async function StripeLayout({ children }: { children: React.ReactNode }) {
  await requireRole(["OWNER"]);   // D-API-1: valorar ["OWNER","PLATFORM_ADMIN"]
  return <div className="tz-page space-y-4">{/* tabs + */}{children}</div>;
}
```

```tsx
// src/app/(app)/stripe/balance/page.tsx  (orientativo)
import { getStripeBalance, listPayouts } from "@/lib/stripe-admin-queries";
import { requireRole } from "@/lib/guard";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export default async function StripeBalancePage() {
  const { user } = await requireRole(["OWNER"]);
  const balance = await getStripeBalance(user.orgId);
  if (!balance.connected)
    return <EmptyState title="Stripe no conectado" description="Conecta la cuenta del centro para ver el saldo." />;
  // ...render con TableShell/Badge, formateando cents→€ como en billing
}
```

- **Tabs** de la consola: barra superior con enlaces a las 8 sub-rutas (reutilizar el patrón de
  navegación por pestañas que ya usa la app, o `FilterBar`).
- **Formato**: importes en cents → € con el mismo helper que `billing`; fechas con `date-fns`
  (ya en deps); estados con `Badge` (verde/ámbar/rojo según `status`).
- **Estado vacío / no conectado**: `EmptyState`, copiando el tono de `stripe-checkout-form.tsx`.

## C.3. Registro de acceso (auditoría)

Aunque los datos financieros **no** son Art. 9 RGPD (no van por `health-access.ts`), son
sensibles. **Recomendación (D-API-3):** registrar en `AuditLog` un evento
`STRIPE_CONSOLE_VIEWED` al entrar en la sección (patrón append-only ya existente), para dejar
trazado quién consultó datos de pago. Barato y coherente con la cultura del repo.

## C.4. Resolución del cliente Stripe **por organización** (D-S1)

Hoy `getStripeClient()` lee una `STRIPE_SECRET_KEY` global. Con "cada gimnasio, su Stripe", la
consola debe hablar con la cuenta del `orgId`. Evolución mínima (encaja con el cimiento
**F18.0** del doc de estrategia):

```ts
// src/lib/stripe.ts — evolución (orientativo)
export function getStripeClient(orgId?: string): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;          // clave de plataforma (Connect) o global
  if (!key) return null;
  const base = (stripeClient ??= new Stripe(key, { apiVersion: "2025-XX-XX.<train>" }));
  // Connect: actuar sobre la cuenta del gimnasio con la cabecera Stripe-Account
  // return orgId ? new Stripe(key, { stripeAccount: accountIdOf(orgId) }) : base;
  return base;
}
```

> **Fijar `apiVersion` explícitamente** en el constructor (hoy `new Stripe(key)` usa la versión
> que fija el SDK v22, que puede cambiar al actualizar el paquete). Para una consola que lee
> muchos objetos, conviene **pinnear** la versión para que las formas de respuesta no cambien
> bajo los pies. Confirmar la cadena exacta contra la cuenta al conectar.

## C.5. Buenas prácticas de consumo de la API (obligatorias)

- **Paginación acotada.** Las listas de Stripe son cursor-paginadas (`has_more` +
  `starting_after`, 100/pág. máx). Nunca traer sin límite: `limit` explícito y "cargar más" bajo
  demanda. Para agregados grandes, usar Reporting/Sigma, no barrer listas.
- **Caché corta.** Cachear cada vista unos segundos (`export const revalidate = 30` o
  `unstable_cache`) para no golpear la API en cada render; respeta los **rate limits** de Stripe.
- **Todo en servidor.** Server Components / server actions: la clave secreta **nunca** llega al
  navegador.
- **Live vs Test.** Mostrar un badge "TEST"/"LIVE" según el prefijo de la clave (`sk_test`/
  `sk_live`) para que dirección no confunda datos de prueba con reales.
- **Errores controlados.** Envolver cada llamada; si Stripe devuelve error (permisos, red),
  mostrar aviso en la tarjeta, no romper la página (patrón demo-safe).

---

# Parte D — Plan por fases

| Fase | Contenido | Depende de | Esfuerzo |
|---|---|---|---|
| **S-API-1** *(esta entrega — solo lectura)* | Sección + guard + nav + `stripe-admin-queries.ts`; vistas **Resumen, Saldo/Payouts, Suscripciones, Clientes/Tarjetas, Eventos** | Nada (demo-safe; funciona sin cuenta) | Medio |
| **S-API-2** *(más lectura)* | Vistas **Pagos/Disputas, Catálogo/Cupones, Facturas/Impagos, Reporting** (descarga de informes) | S-API-1 | Medio |
| **S-API-3** *(acciones — fuera de "de momento ver")* | Botones con efecto: reintentar factura, emitir refund (`RB-PAGO-003`), pausar/cancelar suscripción, enviar enlace de actualización de tarjeta, reenviar recibo. Cada uno: `requireRole`, `AuditLog`, doble confirmación, idempotente | S-API-1/2, cuenta Stripe, credenciales | Alto |
| **S-API-4** | Resolución **por org** real (Connect) + clave restringida read-only + badge live/test | Cimiento F18.0 (D-S1) | Medio |

**Recomendación:** entregar **S-API-1 ya** (aporta valor de dirección y se construye sin la
cuenta, en modo demo-safe), y encadenar S-API-2. Las **acciones** (S-API-3) esperan a tener la
cuenta y a decidir el alcance, respetando el "de momento quiero ver".

---

## Decisiones abiertas

| # | Cuestión | Recomendación |
|---|---|---|
| **D-API-1** | ¿Rol: solo `OWNER`, o también `PLATFORM_ADMIN` con vista **cross-org** (Apta ve todos los gimnasios)? | Empezar **`OWNER`** (su propia cuenta). Añadir `PLATFORM_ADMIN` cuando exista la resolución por org (S-API-4). |
| **D-API-2** | ¿Clave **restringida de solo lectura** dedicada para la consola, en vez de la clave completa? | **Sí** — mínimo privilegio; la consola solo hace `list/retrieve`. |
| **D-API-3** | ¿Registrar el acceso a la consola en `AuditLog` (`STRIPE_CONSOLE_VIEWED`)? | **Sí** — barato y coherente con el repo. |
| **D-API-4** | ¿Mostrar datos **live** desde el principio o empezar en **test**? | Empezar en **test** al conectar; badge visible. Pasar a live tras validar. |
| **D-API-5** | ¿Incluir ya la vista **Reporting** (genera informes = `create`) pese a ser "solo lectura"? | Sí: generar un informe es una acción **segura** (no mueve dinero) y es de altísimo valor para gestoría. |

---

## Mapeo rápido (concepto → recurso Stripe → dónde vive en Apta)

| Quiero ver… | Recurso / endpoint Stripe | Vista de la consola | KPI que alimenta |
|---|---|---|---|
| Si el gimnasio puede cobrar | `accounts.retrieve` | Resumen | — |
| Cuánto dinero hay y cuándo entra | `balance.retrieve`, `payouts.list` | Saldo/Payouts | Tesorería |
| Neto real y comisiones | `balanceTransactions.list` | Saldo | `RB-BI-022` |
| MRR y suscripciones | `subscriptions.list` | Suscripciones | `RB-BI-012/014` |
| Próximo cobro de un socio | `invoices.createPreview` | Suscripciones | `RB-BI-017` |
| Tarjetas por caducar | `paymentMethods.list` (`exp_*`) | Clientes/Tarjetas | churn involuntario |
| Impagos | `invoices.list` (`open/uncollectible`) | Facturas | `RB-BI-015` |
| Contracargos y plazos | `disputes.list` | Pagos/Disputas | tasa de disputas |
| Uso de descuentos | `promotionCodes.list` | Catálogo | `RB-BI-018` |
| Que la conciliación funciona | `events.list`, `webhookEndpoints.list` | Eventos | observabilidad |
| Informes para la gestoría | `reporting.reportRuns` | Reporting | conciliación contable |

---

*Fin del documento. Guía de implementación de la sección **"Stripe API"** (consola de lectura
para `OWNER`), fase de descubrimiento: primero **ver** todo lo que Stripe expone; las acciones
llegan en S-API-3. Se construye en modo **demo-safe** sin necesidad de la cuenta Stripe.
Emparejar con `STRIPE_FUNCIONALIDADES_ROI.md` (estrategia, KPIs y la decisión D-S1 de cuenta
por gimnasio) y `FEEDBACK_COBROS_DASHBOARD.md` (F12/F17).*
