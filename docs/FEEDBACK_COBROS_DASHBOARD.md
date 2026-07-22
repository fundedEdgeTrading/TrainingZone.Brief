# TRAINING ZONE — Feedback bidireccional, Gestión de Cobros y Datos de Dashboard

**Documento de trabajo interno · v1.0**
**Origen:** tres peticiones de negocio del cliente (julio 2026):

1. Distinguir el **feedback (debrief) de entrenadores** del **feedback de clientes sobre sus entrenadores**.
2. Ampliar la **vista de cobros** con gestión del ciclo de vida de la suscripción (aplazar, devolver, congelar, producto puntual, cancelación programada, cambio de importe).
3. Añadir nuevos **datos al dashboard** (sexo, edad media/por franjas, mapa de calor por CP, gente por servicio, cómo nos conocieron, % de cierre, servicio más vendido, ranking de clientes).

Este documento **analiza qué de esto ya existe** en el código, define las **reglas de negocio nuevas** (`RB-*`, extendiendo la numeración de `CRM_REGLAS_NEGOCIO.md` v1.1) y traza el **plan de implementación accionable** sobre los ficheros reales del repo. No reescribe reglas existentes: las **referencia**.

> ⚠️ **Antes de escribir código, leer `AGENTS.md`.** Next.js 16 + Prisma 7 + Tailwind v4. El
> acceso a datos se aísla por `orgId` en `src/lib/*`. Estética: `docs/BRANDING.md` /
> `docs/UX_PREMIUM_PLAN.md` (beige/negro, Poppins, sin degradados, tokens `brand-*`). Colores de
> gráfica: `dataviz` + `src/lib/chart-colors.ts` ya existente. Reglas temporales: `src/app/api/jobs/run/route.ts`.

**Convención de marcadores:** 🆕 entidad/campo/módulo nuevo · ➕ extiende algo existente · 🔁 sustituye un mecanismo actual.

**Emparejar con:** `CRM_REGLAS_NEGOCIO.md` (el "qué/porqué") y `CRM_IMPLEMENTACION_FUNCIONALIDADES.md` (el "cómo/dónde", fases F8–F17). Este doc encaja sobre F12 (cobros) y F17 (BI), y cierra el detalle de F14 (feedback) que aquellos dejaban a alto nivel.

---

## 0. Estado real del código (base de partida)

No se parte de cero en ninguno de los tres bloques. Antes de proponer nada, este es el diagnóstico exacto:

### 0.1. Feedback — ya hay **dos** sistemas, sin contrastar

| Pieza | Quién la rellena | Quién la ve | Dónde vive en el código |
|---|---|---|---|
| `SessionDebrief` (G.1 / `RB-RRHH-009`) | **El entrenador** (staff), un toque por asistente desde el Session Brief | Staff / dirección | `prisma/schema.prisma` (model `SessionDebrief`), `src/app/(app)/brief/[id]/actions.ts` (`setDebrief`), `src/lib/brief-queries.ts` |
| `TrainerRating` (F14 / `RB-RRHH-011/012`) | **El cliente**, valora a su entrenador asignado (confidencial) | **Solo dirección** (nunca el entrenador) | `prisma/schema.prisma` (model `TrainerRating`), `src/lib/trainer-rating-access.ts` (`submitTrainerRating`, `getTrainerRatings`, `getTrainerRatingSummary`) |

**Conclusión:** el "vs" que pide el cliente ya está construido como dos flujos ortogonales, pero **ningún documento los pone frente a frente** y hay un hueco (ver `RB-FB-102`): hoy el *debrief* lo rellena el entrenador sobre el cliente; el cliente **no** deja su propia sensación de la sesión. La petición es sobre todo de **clarificación + cerrar el hueco**, no de reconstruir.

### 0.2. Cobros — vista de **solo registro**, sin ciclo de vida

Lo que hay en `src/app/(app)/billing/` y `src/lib/billing-queries.ts`:

- KPIs (cobrado mes, pendientes, fallidos, morosos), lista de pagos filtrable, tabla de morosos.
- **Registro manual** de cobro (`registerManualPayment`) y **checkout Stripe puntual** (`createStripeCheckoutAction` → `stripe-checkout.ts`, `mode: "payment"`).

Los **enums ya soportan** los estados que necesitamos, pero **faltan las acciones** que los produzcan:

| Estado disponible | Definido en | ¿Se usa hoy? |
|---|---|---|
| `SubscriptionStatus.FROZEN` / `CANCELLED` / `EXPIRED` | `schema.prisma` (`enum SubscriptionStatus`) | Solo lectura (el dashboard cuenta congelados). **Ninguna acción los provoca.** |
| `PaymentStatus.REFUNDED` | `schema.prisma` (`enum PaymentStatus`) | Etiqueta en la UI ("Devuelto"). **Ninguna acción marca un pago como devuelto.** |
| `MemberState.FROZEN` / `CANCELLED` / `DELINQUENT` | `schema.prisma` (`enum MemberState`) | Se leen; el freeze/cancel del socio no está cableado a la suscripción. |
| `Subscription.priceCents` / `endDate` / `sessionsRemaining` | `model Subscription` | Se fijan al crear; **no hay UI para modificarlos**. |
| `PlanType.DROP_IN` / `SESSION_PACK` | `enum PlanType` | Existen como catálogo; sirven de base para el "producto de pago puntual". |

> ⚠️ **Matiz técnico clave:** hoy el checkout de Stripe es `mode: "payment"` (cobro **puntual**), no `mode: "subscription"`. La "suscripción" se modela **localmente** (`Subscription`) y cada cobro es un `Payment` puntual. Por tanto, la mayoría de estas features viven **sobre el modelo local** (`Subscription` + generación del siguiente cobro); solo si se migra a **Stripe Billing** real (`mode: "subscription"`) entran en juego `pause_collection`, `cancel_at`, prorrateo y facturas rectificativas. El plan cubre ambos caminos y marca cuál es cuál.

### 0.3. Dashboard — la mitad ya existe

`src/lib/dashboard-queries.ts` + `src/app/(app)/dashboard/page.tsx` + `charts.tsx` ya pintan: ingresos/mes, socios por estado, ocupación por centro/día, no-show, cohortes de retención, ingresos por método, LTV/ticket (`RB-BI-002`), demografía (`getMemberDemographics`: **edad media** ✅, ocupación, % con hijos, % empresarios — `RB-BI-003`) y distribución por CP (`getPostalCodeDistribution`, barras por prefijo — **proxy** del mapa, `RB-LEAD-010`).

| Petición del cliente | Estado hoy | Qué falta |
|---|---|---|
| **Sexo** | ❌ **No existe el campo** en `Member`/`Lead` (solo `ReferenceRange.sex`) | Campo + captura + BI 🆕 |
| **Edad media** | ✅ `getMemberDemographics.avgAge` | Nada (ya está) |
| **Edad por franjas** (25-35, 35-45…) | ❌ | Query de histograma 🆕 |
| **CP con mapa de calor** | ➕ Barras por prefijo de 2 dígitos | Geocodificación CP→coords + mapa real 🆕 (riesgo abierto #3 del plan) |
| **Gente por servicio** | ❌ | `groupBy` de `Subscription` activa por plan 🆕 |
| **Cómo nos han conocido** | ➕ Dato capturado (`Lead.channel`, `LeadChannel`) pero **sin gráfica** en dashboard | Agregación + chart 🆕 |
| **% de cierre / no cierre** | ➕ Datos en `LeadStatus` (`CERRADO`/`NO_CERRADO`), lógica en `leads-queries.ts` | KPI/embudo en dashboard 🆕 |
| **Servicio más vendido** | ❌ | Ranking de planes por contrataciones/ingresos 🆕 |
| **Ranking de cliente** | ❌ | Ranking configurable (LTV/adherencia/antigüedad) 🆕 |

---

# Parte A — Feedback: debrief de entrenadores ⟷ valoración de clientes

**Familia de reglas:** se extiende `RB-RRHH-*` (§8.8/§8.9 de `CRM_REGLAS_NEGOCIO.md`). Para que el "vs" quede explícito y buscable, se agrupan bajo el rótulo **`RB-FB-*`** (feedback), referenciando siempre la regla RRHH de origen.

## A.1. Los dos ejes del feedback (el "vs")

> **Principio rector:** hay **dos flujos de feedback distintos que no deben mezclarse ni en la UI ni en permisos**: uno mira **hacia la sesión/el cliente** (lo produce el entrenador) y otro mira **hacia el entrenador** (lo produce el cliente y es confidencial). Son ejes ortogonales.

| | **Sujeto: la sesión / el cliente** | **Sujeto: el entrenador** |
|---|---|---|
| **Autor: entrenador (staff)** | **Debrief** `SessionDebrief` — `RB-RRHH-009` · feeling 🟢🟡🔴 + RPE + nota, un toque por asistente. *(construido)* | *(N/A — un entrenador no se autoevalúa aquí)* |
| **Autor: cliente** | **Feedback de sesión del cliente** — hoy **NO existe** (hueco, `RB-FB-102`) | **Valoración de entrenador** `TrainerRating` — `RB-RRHH-011/012` · confidencial, solo dirección. *(construido)* |

**`RB-FB-101`** — El **debrief** (`SessionDebrief`) es feedback **del entrenador hacia la sesión**: cómo ha ido cada asistente (esfuerzo/sensación), capturado en <20 s desde el Session Brief. Es visible para el equipo y alimenta el reporte semanal (`RB-RRHH-010`) y las señales de estancamiento/ofertas (`RB-IA-007`, `RB-RRHH-013`). **No** es una valoración del entrenador ni un dato confidencial.

**`RB-FB-102`** 🆕 *(decisión de negocio abierta — ver §Decisiones)* — Hoy la sensación post-sesión la introduce **el entrenador** por cada asistente. Se decide si el **cliente** deja además su **propio** feedback de la sesión (autovaloración 🟢🟡🔴 + RPE percibido + comentario) desde el portal. Encaja con `RB-IA-005` (autovaloración) y da un contraste "cómo lo vio el entrenador vs. cómo lo vivió el cliente" muy potente para retención. **Recomendación:** sí, como extensión de `SelfAssessment` con `kind = "post-sesion"` (no una tabla nueva), opcional y ligera para no romper el "<20 s".

**`RB-FB-103`** — La **valoración de entrenadores** (`TrainerRating`) es feedback **del cliente hacia su entrenador asignado**, cualitativo (fortalezas / áreas de mejora) y cuantitativo (score), **confidencial**: la ve **solo dirección**, nunca el propio entrenador ni sobre sí mismo (`RB-RRHH-012`). Periodicidad configurable por tipo de servicio, default **trimestral** (`RB-RRHH-011`, decisión §11.6). El acceso pasa **siempre** por `src/lib/trainer-rating-access.ts` (matriz invertida respecto a `health-access.ts`).

**`RB-FB-104`** — **Reporte semanal de comentarios** (`RB-RRHH-010`): vista agregada sobre `SessionDebrief` + notas para revisar en equipo. Está **definido pero no construido**; se materializa como vista de solo lectura, no como tabla nueva.

## A.2. Matriz de visibilidad (consolidada)

| Feedback | Autor | Cliente | Entrenador **no** asignado | Entrenador **asignado** | Dirección |
|---|---|---|---|---|---|
| Debrief de sesión (`SessionDebrief`) | Entrenador | No | Sí (es del equipo, `RB-RRHH-010`) | Sí | Sí |
| Feedback de sesión del cliente (`RB-FB-102`, si se aprueba) | Cliente | Escribe/ve el suyo | No | Sí (agregado) | Sí |
| Valoración de entrenador (`TrainerRating`) | Cliente | Escribe, no relee ajenas | **No** | **No (ni sobre sí mismo)** | **Sí — exclusivo** |

## A.3. Implementación

**Estado:** el 80 % está construido. El trabajo real es (a) **una vista de dirección que contraste ambos ejes**, (b) el **reporte semanal** (`RB-FB-104`) y (c), si se aprueba, el **feedback de sesión del cliente** (`RB-FB-102`).

- **A.3.1 — Vista "Feedback" de dirección** ➕. Nueva pestaña (bajo `dashboard` o un `feedback/` propio, rol `OWNER`/`CENTER_DIRECTOR`) que, por entrenador, muestre en dos columnas claramente separadas: *(izq.)* debriefs de sus sesiones (agregado de `SessionDebrief` vía `brief-queries`) y *(dcha.)* su `getTrainerRatingSummary` confidencial. Reutiliza `trainer-rating-access.ts` para el gate — **no** consultar `TrainerRating` directamente.
- **A.3.2 — Reporte semanal (`RB-FB-104`)** 🆕. Query agregada en `brief-queries.ts` (`getWeeklyDebriefReport(orgId, weekStart)`): debriefs de la semana agrupados por sesión/entrenador con conteo de 🟢🟡🔴 y notas. Vista de solo lectura. Sin tabla nueva.
- **A.3.3 — Feedback de sesión del cliente (`RB-FB-102`)** 🆕 *(si se aprueba)*. Reutiliza `SelfAssessment` con `kind = "post-sesion"` y `structured = { feeling, rpe }`; entrada opcional desde el portal (`portal/agenda` tras la sesión). En la vista del entrenador/dirección se muestra **junto** al debrief para el contraste, respetando que el `TrainerRating` sigue por su canal confidencial aparte.

---

# Parte B — Vista de cobros: ciclo de vida de la suscripción

**Familia de reglas:** extiende `RB-PAGO-*` (hoy solo existe `RB-PAGO-001`, Stripe como canal objetivo). Todo esto es **F12** en el plan de implementación.

> **Alcance de negocio:** el modelo es **"trabajo por suscripciones"** (cuota recurrente) **+ productos de pago puntual** encima. Las seis acciones que siguen son las que faltan en la vista de cobros. Todas exigen: rol `OWNER`/`CENTER_DIRECTOR`/`RECEPTION`, quedar en `AuditLog` (append-only) y ser **idempotentes** frente al webhook de Stripe.

## B.1. Reglas nuevas

**`RB-PAGO-002` — Aplazar / posponer el cobro** 🆕. Permite mover la fecha de un cobro pendiente sin marcarlo como fallido ni pasar el socio a `DELINQUENT`. Modelo: el `Payment` en `PENDING` gana una fecha de vencimiento explícita (`dueDate`), y la regla de morosidad (`getBillingKpis`/`getDelinquentMembers`) **respeta el aplazamiento** (no cuenta como moroso hasta pasado `dueDate`). Registra motivo y nueva fecha. *(Sobre Stripe Billing: equivale a mover el `billing_cycle_anchor` / `trial_end` del próximo ciclo.)*

**`RB-PAGO-003` — Devolución del importe (de todos los meses)** 🆕. Marca como `REFUNDED` uno, varios o **todos** los `Payment` `PAID` de un socio/suscripción y, si el cobro fue por Stripe, **emite el refund** vía `PaymentIntent`. Requiere **motivo obligatorio** y confirmación explícita ("devolver N cobros por X €"). ⚠️ **Caveat contable/legal:** en España una devolución implica **factura rectificativa** (VERI\*FACTU, marcado fuera del MVP por diseño — README D3 / plan §5.1). La acción deja el rastro en `AuditLog`; la emisión fiscal rectificativa se documenta como dependencia externa, **no** se inventa aquí. 🚧 **Decisión D-2:** la parte de emisión real del refund contra Stripe (y su reconciliación por webhook) queda **bloqueada hasta que el cliente entregue las credenciales de Stripe**; hasta entonces, `refundPayments` solo puede operar en modo "solo registro local" (marca `REFUNDED` + `refundReason`/`refundedAt`, sin `stripeRefundId`) y debe rechazar/avisar si se intenta sobre un pago cobrado por Stripe.

**`RB-PAGO-004` — Suspender / congelar la cuota** 🆕. Pausa la suscripción: `Subscription.status → FROZEN`, `Member.state → FROZEN`, se **detiene la generación del siguiente cobro** y (opcional) se registra hasta cuándo (`pauseUntil`). Al reanudar, vuelve a `ACTIVE`. Es una **pausa**, no una baja: conserva historial, plan e importe. Los enums `SubscriptionStatus.FROZEN`/`MemberState.FROZEN` **ya existen** — falta solo la acción. *(Sobre Stripe Billing: `pause_collection`.)*

**`RB-PAGO-005` — Producto de pago puntual sobre la suscripción** 🆕. Añade un **cargo único** (bono de sesiones extra, valoración, material, cuota de alta…) que **no** altera la cuota recurrente. Se modela como un `Payment` puntual (con o sin `subscriptionId`) o una `Subscription` de tipo `DROP_IN`/`SESSION_PACK` (que ya existen en `PlanType`). Reutiliza el checkout puntual actual (`stripe-checkout.ts`, `mode: "payment"`) — de hecho es lo que **hoy ya hace** el checkout; la novedad es exponerlo como "añadir producto puntual a este socio" desde la ficha/cobros, atribuido al vendedor (`soldByUserId`, `RB-RRHH-004`).

**`RB-PAGO-006` — Cancelación programada** 🆕. Programa la baja para una fecha futura (fin de ciclo pagado) en vez de cortar en seco: `Subscription.cancelAt = fecha`; la suscripción sigue `ACTIVE` hasta que un job la pasa a `CANCELLED` (y el socio a `CANCELLED`) al llegar la fecha. El disparador es el runner ya existente `src/app/api/jobs/run/route.ts` (nueva regla `runScheduledCancellationsRule`). Debe poder **revertirse** antes de la fecha. *(Sobre Stripe Billing: `cancel_at` / `cancel_at_period_end`.)*

**`RB-PAGO-007` — Modificar el importe de la suscripción** 🆕. Edita `Subscription.priceCents` con **efecto desde el próximo ciclo** (no retroactivo), registrando importe anterior→nuevo y motivo en `AuditLog`. El importe vigente manda sobre el del plan (`MembershipPlan.priceCents`) — permite descuentos/subidas individuales sin tocar el catálogo. *(Sobre Stripe Billing: nuevo `price` + prorrateo configurable.)*

## B.2. Cambios de modelo (Prisma) — Parte B

```prisma
model Subscription {
  // ... campos actuales ...
  pauseUntil DateTime? // RB-PAGO-004: fin previsto de la congelación (null = indefinida)
  cancelAt   DateTime? // RB-PAGO-006: baja programada; un job la ejecuta al llegar la fecha
}

model Payment {
  // ... campos actuales ...
  dueDate       DateTime? // RB-PAGO-002: vencimiento de un cobro PENDING aplazado
  refundReason  String?   // RB-PAGO-003: motivo obligatorio de la devolución
  refundedAt    DateTime? // RB-PAGO-003: sello de la devolución
  stripeRefundId String?  @unique // RB-PAGO-003: id del refund de Stripe si aplica
}
```

> No se añade un enum nuevo: `SubscriptionStatus.FROZEN/CANCELLED` y `PaymentStatus.REFUNDED` ya cubren los estados. Solo se añaden los **campos de metadatos** que hoy faltan. Migración Prisma 7 estándar (`prisma migrate dev`), todos opcionales → compatible hacia atrás.

## B.3. Implementación — Parte B

- **B.3.1 — Server actions** en `src/app/(app)/billing/actions.ts` (o un `subscription-actions.ts` hermano): `postponePayment`, `refundPayments`, `freezeSubscription`/`resumeSubscription`, `addOneOffProduct`, `scheduleCancellation`/`cancelScheduledCancellation`, `updateSubscriptionPrice`. Todas: `requireRole([...])`, escriben `AuditLog`, `revalidatePath("/billing")` + `revalidatePath("/members/[id]")`.
- **B.3.2 — Lógica reutilizable** en `src/lib/billing-queries.ts` (queries) y, para Stripe, en `stripe-checkout.ts`/`stripe.ts` (refund, pause). El webhook (`src/app/api/stripe/webhook/`) debe **reconciliar** refunds/pausas de forma idempotente (mismo patrón que `reconcileStripeCheckoutCompleted`).
- **B.3.3 — Morosidad consciente del aplazamiento**: ajustar `getBillingKpis`/`getDelinquentMembers` (`billing-queries.ts`) para excluir `PENDING` con `dueDate` futura.
- **B.3.4 — UI**: en `src/app/(app)/billing/page.tsx` y en la ficha del socio (`members/[id]`), un bloque "Gestión de suscripción" con las seis acciones (modales de confirmación; las destructivas —devolución, cancelación— con doble confirmación y motivo). Reutilizar primitivas `src/components/ui/*` y tokens de marca.
- **B.3.5 — Job de cancelaciones**: añadir `runScheduledCancellationsRule(orgId)` a `src/lib/` e invocarla en `src/app/api/jobs/run/route.ts` (junto a las demás reglas temporales).
- **B.3.6 — Seed**: ampliar `prisma/seed.ts` con ejemplos (suscripción congelada, cobro aplazado, cancelación programada, producto puntual, devolución) para poder demostrarlo.

---

# Parte C — Datos del dashboard

**Familia de reglas:** extiende `RB-BI-*` (§9) y referencia `RB-LEAD-010` (CP/mapa). Todo esto es **F17** en el plan.

## C.1. Reglas nuevas y upgrades

**`RB-BI-005` — Sexo** 🆕. Distribución por sexo de socios (y opcionalmente leads). **Requiere campo nuevo** `Member.sex` (no existe) — se captura en el onboarding y se hereda del lead al convertir (mismo patrón que `postalCode`/`occupation`/`channel`, `RB-PERFIL`/`RB-LEAD-007`). Dato personal común (no Art. 9 RGPD), opcional y con opción "prefiero no decirlo".

**`RB-BI-006` — Edad por franjas** 🆕. Histograma en tramos (18-25, 25-35, 35-45, 45-55, 55-65, 65+). Deriva de `Member.birthDate` (ya existe; ya se usa para `avgAge`). La **edad media** (petición del cliente) **ya está** (`RB-BI-003`, `getMemberDemographics.avgAge`) — esta regla añade la **distribución**.

**`RB-BI-007` — Gente por servicio** 🆕. Nº de clientes activos por plan/servicio (ej.: *EP 4 sesiones → 20, EP 8 sesiones → 60, Grupos reducidos 8 → 50*). `groupBy` de `Subscription` (`status = ACTIVE`) por `planId`/`plan.type`, con nombre e importe del plan.

**`RB-BI-008` — Cómo nos han conocido** 🆕 *(el dato ya se captura)*. Agregación por canal de origen (`Lead.channel` / `LeadChannel`, `RB-LEAD-004`) — hoy se **recoge** pero no se **grafica** en el dashboard. Reparto de leads/clientes por canal (y, cruzado con cierre, qué canal convierte mejor).

**`RB-BI-009` — Porcentaje de cierre / no cierre** 🆕. Sobre `LeadStatus`: `CERRADO` vs `NO_CERRADO` (y en curso), como tasa y como embudo (`SIN_CONTACTAR → SEGUIMIENTO → CON_FECHA_VALORACION → CERRADO/NO_CERRADO`). La lógica de cierre ya vive en `leads-queries.ts`; falta el indicador agregado en dashboard. Cruzable con `RB-BI-008` (cierre por canal) y con el motivo de no cierre (`NoCloseReason`, `RB-LEAD-011`).

**`RB-BI-010` — Servicio más vendido** 🆕. Ranking de planes por **contrataciones en el periodo** (default) y, secundariamente, por **ingresos**. Deriva de `Subscription`/`Payment`. *(Decisión menor de negocio: ¿"más vendido" = nº de altas o € facturados? Se muestran ambos, orden por defecto = nº de altas.)*

**`RB-BI-011` — Ranking de clientes** 🆕. Top de socios por una métrica configurable. **Default propuesto:** LTV (total pagado, ya calculable desde `Payment`) + adherencia (asistencia real vía `Booking.status = ATTENDED`) + antigüedad (`joinedAt`). Presentado como tabla ordenable. *(Decisión de negocio: dimensión del ranking — ver §Decisiones.)*

**Upgrade `RB-LEAD-010` — CP con mapa de calor** ➕. Hoy `getPostalCodeDistribution` agrupa por prefijo de 2 dígitos y se pinta como **barras** (proxy). El objetivo de negocio (mapa de calor / radios alrededor del centro) requiere **geocodificar CP→coordenadas** — **riesgo abierto #3** del plan (`CRM_IMPLEMENTACION_FUNCIONALIDADES.md §5.3`): decidir proveedor (tabla local España CP→lat/lng vs. servicio externo) por coste y privacidad. Entrega incremental: (1) tabla local de CP españoles → puntos en mapa; (2) intensidad = nº de socios (heat map). La query agregada ya está lista para alimentarlo.

## C.2. Cambios de modelo (Prisma) — Parte C

```prisma
model Member {
  // ... campos actuales ...
  sex String? // RB-BI-005: "FEMALE" | "MALE" | "OTHER" | null (prefiere no decir). String? por
             // consistencia con ReferenceRange.sex; opcional, no Art. 9 RGPD.
}

model Lead {
  // ... campos actuales ...
  sex String? // RB-BI-005: se hereda al convertir (RB-LEAD-007), como postalCode/occupation/channel
}
```

> Solo un campo (`sex`) es genuinamente nuevo; el resto de datos del dashboard **ya están en el modelo** (birthDate, subscriptions, channel, LeadStatus, payments/bookings). La geocodificación del CP es una **tabla/servicio auxiliar**, no un cambio de esquema de negocio.

## C.3. Implementación — Parte C

- **C.3.1 — Queries** en `src/lib/dashboard-queries.ts` (mismo patrón que las existentes): `getSexDistribution` (`RB-BI-005`), `getAgeBrackets` (`RB-BI-006`), `getMembersByService` (`RB-BI-007`), `getAcquisitionChannels` (`RB-BI-008`), `getLeadCloseRate` (`RB-BI-009`, puede vivir en `leads-queries.ts` y reexportarse), `getTopServices` (`RB-BI-010`), `getMemberRanking` (`RB-BI-011`). Todas filtradas por `orgId`.
- **C.3.2 — Gráficas** en `src/app/(app)/dashboard/charts.tsx` con Recharts + `chart-colors.ts` (seguir `dataviz`: donut para sexo/servicio/canal, barras horizontales para franjas de edad y ranking, KPI + embudo para cierre). Nada de degradados; tokens `brand-*`.
- **C.3.3 — Página** `src/app/(app)/dashboard/page.tsx`: añadir las nuevas `Card`/`KpiCard` en la retícula existente, respetando el orden (demografía junto a edad media/CP; comercial —canal, % cierre, servicio más vendido— en su propia banda; ranking al final).
- **C.3.4 — Captura de `sex`**: formulario público de lead (`src/app/lead-form/...`), alta manual de lead y onboarding del socio (`src/app/onboarding/[token]`), con opción "prefiero no decirlo". Herencia lead→member en `confirmLeadClosureForMember`/conversión (`leads-queries.ts`).
- **C.3.5 — Mapa de calor** (`RB-LEAD-010`, fase aparte): tabla local CP→coords + componente de mapa con `react-leaflet`/`leaflet`/`leaflet.heat` (decisión D-6, tiles OpenStreetMap); alimentado por `getPostalCodeDistribution` (ya existe). Planificar por el riesgo abierto #3, no bloquea el resto del dashboard. Detalle técnico en `docs/FEEDBACK_COBROS_DASHBOARD_IMPLEMENTACION.md` §BI-3.

---

## Plan de implementación por fases (resumen accionable)

| Fase | Contenido | Depende de | Esfuerzo | Encaje en plan maestro |
|---|---|---|---|---|
| **FB-1** | Vista "Feedback" de dirección (contraste debrief ⟷ valoración) + reporte semanal `RB-FB-104` | Nada (datos ya existen) | **Bajo** | Cierra F14 |
| **FB-2** | Feedback de sesión del cliente `RB-FB-102` (si se aprueba) vía `SelfAssessment` | Portal (`RB-IA-005`) | Medio | F16 |
| **PAGO-1** | Acciones locales: congelar/reanudar, cancelación programada, cambio de importe, producto puntual, aplazar | Campos §B.2 | **Medio** | F12 |
| **PAGO-2** | Devolución + refund Stripe + reconciliación webhook | PAGO-1, cuenta Stripe | Alto (legal VERI\*FACTU) | F12 / riesgo §5.1 |
| **PAGO-2b** 🚧 | **Bloqueada** hasta credenciales Stripe del cliente (decisión D-2). Mientras tanto, `refundPayments` opera solo en modo registro local (ver `RB-PAGO-003`) | PAGO-2, credenciales Stripe | — | F12 |
| **BI-1** | Franjas de edad, gente por servicio, canal, % cierre, servicio más vendido, ranking | Datos ya en modelo | **Bajo-Medio** | F17 |
| **BI-2** | Campo `sex` + captura + distribución `RB-BI-005` | Migración + formularios | Bajo | F17 |
| **BI-3** | Mapa de calor real por CP `RB-LEAD-010` | Geocodificación (riesgo #3) | Alto | F17 |

**Prioridad de negocio sugerida:** FB-1 y BI-1 primero (alto valor, datos ya existentes, sin dependencias externas) → PAGO-1 → BI-2 → PAGO-2 y BI-3 (dependen de terceros: Stripe/legal, geocodificación).

---

## Decisiones de negocio (cerradas)

| # | Cuestión | Regla | Decisión |
|---|---|---|---|
| D-1 | ¿El **cliente** deja su propio feedback de sesión, además del debrief del entrenador? | `RB-FB-102` | ✅ **Sí**, opcional y ligero, vía `SelfAssessment kind="post-sesion"`. Da el contraste entrenador⟷cliente. |
| D-2 | Devolución "de todos los meses": ¿alcance por defecto = suscripción o socio completo? ¿Emisión de factura rectificativa ahora o luego? | `RB-PAGO-003` | ✅ Por **suscripción**, con opción "todo el socio". La emisión de refund vía Stripe (`PaymentIntent`) y la rectificativa fiscal (VERI\*FACTU) quedan **fuera del MVP**: `RB-PAGO-003`/PAGO-2 no se implementa hasta disponer de credenciales de Stripe del cliente. Se deja preparado el modelo (`refundReason`/`refundedAt`/`stripeRefundId`) pero la acción y el webhook de refund se bloquean tras un flag/feature-gate hasta entonces. |
| D-3 | Congelación: ¿con fecha de fin obligatoria o indefinida hasta reactivar? | `RB-PAGO-004` | ✅ **Ambas**; `pauseUntil` opcional. |
| D-4 | "Servicio más vendido": ¿por nº de altas o por € facturados? | `RB-BI-010` | ✅ Mostrar ambos; **orden por defecto = nº de altas**. |
| D-5 | "Ranking de clientes": ¿dimensión (LTV, adherencia, antigüedad, mixto)? | `RB-BI-011` | ✅ **Mixto** configurable; default LTV + adherencia. |
| D-6 | Mapa de calor: proveedor de geocodificación (tabla local vs. servicio externo) | `RB-LEAD-010` | ✅ **Tabla local** de CP españoles (coste 0, sin fuga de datos). **Librería de mapa:** `react-leaflet` + `leaflet` + `leaflet.heat`, con tiles OpenStreetMap (sin API key, sin coste). Alternativa descartada por sobredimensionada para el volumen de datos: `deck.gl`. Ver `docs/FEEDBACK_COBROS_DASHBOARD_IMPLEMENTACION.md` §BI-3 para el detalle técnico. |

Todas las decisiones D-1 a D-6 están cerradas. El plan de fases (arriba) y el detalle técnico accionable viven en **`docs/FEEDBACK_COBROS_DASHBOARD_IMPLEMENTACION.md`**.

---

## Mapeo a entidades (orientativo)

| Concepto de negocio | Entidad / campo | Estado |
|---|---|---|
| Debrief del entrenador | `SessionDebrief` | ➕ existe, cubre `RB-FB-101` |
| Feedback de sesión del cliente | `SelfAssessment` (`kind="post-sesion"`) | 🆕 si se aprueba `RB-FB-102` |
| Valoración confidencial de entrenador | `TrainerRating` + `trainer-rating-access.ts` | ➕ existe, `RB-FB-103` |
| Reporte semanal de comentarios | Vista agregada sobre `SessionDebrief` | 🆕 sin tabla nueva, `RB-FB-104` |
| Aplazar cobro | `Payment.dueDate` | 🆕 campo |
| Devolución total | `Payment.status=REFUNDED` + `refundReason`/`refundedAt`/`stripeRefundId` | ➕ estado existe, 🆕 metadatos |
| Congelar cuota | `Subscription.status=FROZEN` + `pauseUntil`, `Member.state=FROZEN` | ➕ estados existen, 🆕 `pauseUntil` + acción |
| Producto de pago puntual | `Payment` puntual / `Subscription` `DROP_IN`/`SESSION_PACK` | ➕ existe el patrón, 🆕 exponerlo en cobros |
| Cancelación programada | `Subscription.cancelAt` + job | 🆕 campo + regla temporal |
| Modificar importe suscripción | `Subscription.priceCents` (editable) | ➕ campo existe, 🆕 acción |
| Sexo | `Member.sex` / `Lead.sex` | 🆕 campo |
| Edad media / por franjas | `Member.birthDate` | ➕ media existe, 🆕 franjas |
| Mapa de calor CP | `getPostalCodeDistribution` + geocodificación | ➕ dato existe, 🆕 mapa real |
| Gente por servicio / servicio más vendido | `Subscription` × `MembershipPlan` | 🆕 queries |
| Cómo nos conocieron | `Lead.channel` / `LeadChannel` | ➕ dato existe, 🆕 gráfica |
| % de cierre / no cierre | `LeadStatus` (`CERRADO`/`NO_CERRADO`) | ➕ dato existe, 🆕 indicador |
| Ranking de clientes | `Payment` (LTV) + `Booking` (adherencia) + `Member.joinedAt` | 🆕 query configurable |

---

*Fin del documento. Emparejar con `CRM_REGLAS_NEGOCIO.md` v1.1 (el "qué/porqué") y `CRM_IMPLEMENTACION_FUNCIONALIDADES.md` (fases F8–F17). Este doc detalla el feedback bidireccional (cierra F14), el ciclo de vida de cobros (F12) y los nuevos datos de dashboard (F17), todo anclado en el código ya existente.*
