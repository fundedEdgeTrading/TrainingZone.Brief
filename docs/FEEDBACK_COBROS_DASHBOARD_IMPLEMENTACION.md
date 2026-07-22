# TRAINING ZONE — Implementación: Feedback, Cobros y Datos de Dashboard

**Documento de trabajo interno · v1.0**
**Deriva de:** `docs/FEEDBACK_COBROS_DASHBOARD.md` (el "qué/porqué" + `RB-FB-*`/`RB-PAGO-*`/`RB-BI-*`), ya con las **decisiones de negocio D-1 a D-6 cerradas**.

Este documento es el **"cómo"**: fichero por fichero, en el orden en que se debe construir, con las tareas concretas de cada fase (`FB-1`, `FB-2`, `PAGO-1`, `PAGO-2`/`PAGO-2b`, `BI-1`, `BI-2`, `BI-3`). No repite las reglas de negocio (`RB-*`) — se referencian por código.

> ⚠️ **Antes de escribir código, leer `AGENTS.md`.** Next.js 16 + Prisma 7 + Tailwind v4. Acceso a
> datos aislado por `orgId` en `src/lib/*`. Estética: `docs/BRANDING.md` / `docs/UX_PREMIUM_PLAN.md`
> (beige/negro, Poppins, sin degradados, tokens `brand-*`). Colores de gráfica: skill `dataviz` +
> `src/lib/chart-colors.ts`. Reglas temporales: `src/app/api/jobs/run/route.ts`.

---

## 0. Orden de fases y dependencias

```
FB-1 ─┐
BI-1 ─┼─► (alto valor, sin dependencias externas, primero)
      │
PAGO-1 ─► (campos §2 ya migrados)
      │
BI-2 ─► (migración Member.sex/Lead.sex + formularios)
      │
FB-2 ─► (depende del portal, RB-IA-005)
      │
BI-3 ─► (geocodificación CP, riesgo #3)
      │
PAGO-2b ─► BLOQUEADA hasta credenciales Stripe del cliente (D-2)
```

**Prioridad de negocio:** FB-1 y BI-1 primero → PAGO-1 → BI-2 → FB-2 → BI-3 → PAGO-2b (última, depende de un tercero).

---

## FASE FB-1 — Vista "Feedback" de dirección + reporte semanal

**Cierra:** `RB-FB-101/103/104`. **Esfuerzo:** Bajo. **Dependencias:** ninguna (datos ya existen).

### 1.1 `src/lib/brief-queries.ts`
- Añadir `getWeeklyDebriefReport(orgId: string, weekStart: Date)`:
  - Filtra `SessionDebrief` de la semana (`weekStart` a `weekStart + 7d`), `orgId`.
  - Agrupa por `sessionId`/`trainerId`, cuenta ocurrencias de feeling 🟢🟡🔴, incluye notas.
  - Devuelve estructura lista para tabla: `{ trainerId, trainerName, sessions: [{ sessionDate, greenCount, yellowCount, redCount, notes[] }] }`.

### 1.2 `src/lib/trainer-rating-access.ts`
- No se toca la lógica de acceso; solo se **reutiliza** `getTrainerRatingSummary` desde la nueva vista. No consultar `TrainerRating` directamente desde ningún componente nuevo.

### 1.3 Nueva ruta `src/app/(app)/feedback/page.tsx` 🆕
- Server component, `requireRole(["OWNER", "CENTER_DIRECTOR"])`.
- Selector de entrenador (o "todos").
- Layout de dos columnas por entrenador:
  - **Izquierda:** agregados de `SessionDebrief` (vía `brief-queries.getWeeklyDebriefReport` o un rango configurable).
  - **Derecha:** `getTrainerRatingSummary` (confidencial, vía `trainer-rating-access.ts`).
- Bloque superior: reporte semanal (`getWeeklyDebriefReport`) como tabla de solo lectura.
- Añadir entrada de navegación (`src/components/nav` o equivalente) solo visible para `OWNER`/`CENTER_DIRECTOR`.

### 1.4 Tests / verificación
- Confirmar que un usuario `TRAINER` no puede acceder a `/feedback` (redirect/403).
- Confirmar que el entrenador nunca ve su propio `TrainerRating` desde ninguna ruta.

---

## FASE BI-1 — Franjas de edad, servicio, canal, % cierre, servicio más vendido, ranking

**Cierra:** `RB-BI-006/007/008/009/010/011`. **Esfuerzo:** Bajo-Medio. **Dependencias:** ninguna (datos ya en modelo).

### 2.1 `src/lib/dashboard-queries.ts` — nuevas queries
Todas filtradas por `orgId`, mismo patrón que `getMemberDemographics`/`getPostalCodeDistribution`:

- **`getAgeBrackets(orgId)`** (`RB-BI-006`): histograma sobre `Member.birthDate`, tramos fijos `[18-25, 25-35, 35-45, 45-55, 55-65, 65+]`. Calcular edad en SQL/JS a partir de `birthDate`, agrupar por tramo.
- **`getMembersByService(orgId)`** (`RB-BI-007`): `groupBy` de `Subscription` (`status = "ACTIVE"`) por `planId`, join con `MembershipPlan` para nombre/importe/tipo.
- **`getAcquisitionChannels(orgId)`** (`RB-BI-008`): `groupBy` de `Lead.channel` (todos los leads, o filtrable por rango de fechas). Cruce opcional con `LeadStatus` para "conversión por canal".
- **`getTopServices(orgId, { orderBy: "count" | "revenue" })`** (`RB-BI-010`): ranking de `MembershipPlan` por nº de `Subscription` creadas en el periodo (default) y por `SUM(Payment.amountCents)` asociado. Devolver ambas métricas siempre; el `orderBy` solo cambia el orden de la lista.
- **`getMemberRanking(orgId, { dimension: "mixed" | "ltv" | "adherence" | "tenure" })`** (`RB-BI-011`): calcula por socio:
  - `ltv` = `SUM(Payment.amountCents WHERE status = "PAID")`.
  - `adherence` = `COUNT(Booking WHERE status = "ATTENDED") / COUNT(Booking total)` en el periodo.
  - `tenure` = `now() - Member.joinedAt`.
  - `mixed` (default) = combinación normalizada (ej. media ponderada 0-100 de las tres, pesos configurables por constante, no hardcode mágico disperso).
  - Devuelve tabla ordenable (todas las columnas), no solo el score compuesto.

### 2.2 `src/lib/leads-queries.ts`
- **`getLeadCloseRate(orgId, { from, to })`** (`RB-BI-009`): tasa `CERRADO` / (`CERRADO` + `NO_CERRADO`) sobre `LeadStatus`, más el desglose del embudo `SIN_CONTACTAR → SEGUIMIENTO → CON_FECHA_VALORACION → CERRADO/NO_CERRADO`. Reexportar desde `dashboard-queries.ts` si conviene mantener un único punto de import en `page.tsx`.

### 2.3 `src/app/(app)/dashboard/charts.tsx`
Seguir skill `dataviz` + `chart-colors.ts`, sin degradados, tokens `brand-*`:
- Donut: `getMembersByService`, `getAcquisitionChannels`.
- Barras horizontales: `getAgeBrackets`, `getMemberRanking` (top N).
- KPI + embudo: `getLeadCloseRate`.
- Barras (doble métrica altas/€): `getTopServices`, con toggle de orden.

### 2.4 `src/app/(app)/dashboard/page.tsx`
- Añadir `Card`/`KpiCard` nuevas en la retícula existente:
  - Banda "demografía": junto a edad media/CP → añadir franjas de edad.
  - Banda "comercial" (nueva): canal de origen, % de cierre, servicio más vendido.
  - Banda "ranking" al final: tabla `getMemberRanking` con selector de dimensión (mixto/LTV/adherencia/antigüedad).

### 2.5 Verificación
- Revisar que todas las queries respetan `orgId` (aislamiento multi-tenant) — comprobar contra el patrón de `getMemberDemographics`.

---

## FASE PAGO-1 — Acciones locales de ciclo de vida de suscripción

**Cierra:** `RB-PAGO-002/004/005/006/007` (todo excepto la parte Stripe de `RB-PAGO-003`). **Esfuerzo:** Medio.

### 3.1 Migración Prisma
`prisma/schema.prisma`:
```prisma
model Subscription {
  // ... campos actuales ...
  pauseUntil DateTime? // RB-PAGO-004
  cancelAt   DateTime? // RB-PAGO-006
}

model Payment {
  // ... campos actuales ...
  dueDate        DateTime? // RB-PAGO-002
  refundReason   String?   // RB-PAGO-003 (registro local, ver D-2)
  refundedAt     DateTime? // RB-PAGO-003
  stripeRefundId String?   @unique // RB-PAGO-003 — permanece NULL hasta PAGO-2b
}
```
- `npx prisma migrate dev --name subscription_lifecycle_fields`.
- Todos los campos opcionales → sin backfill necesario.

### 3.2 `src/lib/billing-queries.ts`
- Ajustar `getBillingKpis`/`getDelinquentMembers`: excluir de morosidad los `Payment` `PENDING` con `dueDate` futura (`RB-PAGO-002`, B.3.3).
- Añadir helpers de lectura si hacen falta (ej. `getSubscriptionWithPauseInfo`).

### 3.3 `src/app/(app)/billing/actions.ts` (o `subscription-actions.ts` hermano) 🆕
Server actions, todas con `requireRole(["OWNER", "CENTER_DIRECTOR", "RECEPTION"])`, escritura en `AuditLog` (append-only), `revalidatePath("/billing")` + `revalidatePath("/members/[id]")`:

- **`postponePayment(paymentId, newDueDate, reason)`** — `RB-PAGO-002`. Valida `Payment.status === "PENDING"`, setea `dueDate`, registra motivo en `AuditLog`.
- **`refundPayments(paymentIds[], reason)`** — `RB-PAGO-003`, **modo registro local únicamente** (ver D-2/`RB-PAGO-003`🚧): marca `PAID → REFUNDED`, setea `refundReason`/`refundedAt`. Si algún `Payment` fue cobrado vía Stripe (`stripePaymentIntentId` no nulo), **bloquear** con mensaje explícito ("Devolución Stripe no disponible: pendiente de credenciales del cliente — PAGO-2b") en vez de intentar el refund.
- **`freezeSubscription(subscriptionId, { pauseUntil?, reason })`** / **`resumeSubscription(subscriptionId)`** — `RB-PAGO-004`. Cambia `Subscription.status ↔ FROZEN/ACTIVE`, `Member.state ↔ FROZEN/ACTIVE`, detiene/reanuda generación del siguiente cobro.
- **`addOneOffProduct(memberId, { planId | description, priceCents, soldByUserId })`** — `RB-PAGO-005`. Crea `Payment` puntual (o `Subscription` `DROP_IN`/`SESSION_PACK`) reutilizando `stripe-checkout.ts` (`mode: "payment"`) si aplica cobro con tarjeta; atribuye `soldByUserId` (`RB-RRHH-004`).
- **`scheduleCancellation(subscriptionId, cancelAt, reason)`** / **`cancelScheduledCancellation(subscriptionId)`** — `RB-PAGO-006`. Setea/limpia `Subscription.cancelAt`; validar `cancelAt` en el futuro y posterior al próximo cobro.
- **`updateSubscriptionPrice(subscriptionId, newPriceCents, reason)`** — `RB-PAGO-007`. Actualiza `Subscription.priceCents` con efecto desde el próximo ciclo (no retroactivo); registra importe anterior→nuevo en `AuditLog`.

### 3.4 Job de cancelaciones — `src/lib/subscription-jobs.ts` 🆕 + `src/app/api/jobs/run/route.ts`
- `runScheduledCancellationsRule(orgId)`: busca `Subscription` con `cancelAt <= now()` y `status = ACTIVE`, pasa a `CANCELLED` (+ `Member.state = CANCELLED`), limpia `cancelAt`.
- Registrar la regla junto a las demás reglas temporales existentes en `route.ts` (mismo patrón de invocación).

### 3.5 UI — `src/app/(app)/billing/page.tsx` + `src/app/(app)/members/[id]/`
- Bloque "Gestión de suscripción" con las seis acciones como botones → modal de confirmación.
- Acciones destructivas (devolución, cancelación programada) con **doble confirmación** + campo de motivo obligatorio.
- Reutilizar primitivas `src/components/ui/*`, tokens `brand-*`, sin degradados (`docs/BRANDING.md`).

### 3.6 Webhook — `src/app/api/stripe/webhook/`
- No requiere cambios para PAGO-1 (el refund Stripe queda en PAGO-2b). Sí revisar que el webhook actual ignore/no rompa con los nuevos campos (`dueDate`, `pauseUntil`, `cancelAt`) — deben ser transparentes para `reconcileStripeCheckoutCompleted`.

### 3.7 Seed — `prisma/seed.ts`
- Ampliar con ejemplos: suscripción congelada (`pauseUntil` fijo e indefinido), cobro aplazado (`dueDate`), cancelación programada (`cancelAt`), producto puntual, devolución en modo local (`refundReason`/`refundedAt`, `stripeRefundId = null`).

### 3.8 Verificación
- Confirmar que `getDelinquentMembers` ya no cuenta como moroso un `Payment` aplazado con `dueDate` futura.
- Confirmar `AuditLog` tiene una entrada por cada acción, con `orgId`, `userId`, motivo y valores anterior/nuevo donde aplique.

---

## FASE BI-2 — Campo `sex` + captura + distribución

**Cierra:** `RB-BI-005`. **Esfuerzo:** Bajo. **Dependencias:** migración + formularios.

### 4.1 Migración Prisma
```prisma
model Member {
  // ...
  sex String? // "FEMALE" | "MALE" | "OTHER" | null (prefiere no decir)
}

model Lead {
  // ...
  sex String? // heredado al convertir (RB-LEAD-007)
}
```
- `npx prisma migrate dev --name add_sex_field`.

### 4.2 Captura
- **`src/app/lead-form/...`** (formulario público de lead): añadir campo `sex` (select con opción "Prefiero no decirlo").
- Alta manual de lead (formulario interno equivalente).
- **`src/app/onboarding/[token]`**: mismo campo en el onboarding del socio.

### 4.3 Herencia lead → member
- `leas-queries.ts` → `confirmLeadClosureForMember` (o el helper de conversión equivalente): copiar `Lead.sex → Member.sex`, mismo patrón que `postalCode`/`occupation`/`channel`.

### 4.4 `src/lib/dashboard-queries.ts`
- **`getSexDistribution(orgId)`**: `groupBy` de `Member.sex` (y opcionalmente `Lead.sex`), excluyendo `null` del cálculo de porcentaje pero mostrando "no especificado" como categoría.

### 4.5 `charts.tsx` + `page.tsx`
- Donut de sexo junto al bloque de demografía existente (edad media, ocupación).

---

## FASE FB-2 — Feedback de sesión del cliente (si se confirma, D-1 = sí)

**Cierra:** `RB-FB-102`. **Esfuerzo:** Medio. **Dependencias:** portal (`RB-IA-005`).

### 5.1 Modelo
- **No se crea tabla nueva.** Reutilizar `SelfAssessment` con `kind = "post-sesion"` y `structured = { feeling: "🟢"|"🟡"|"🔴", rpe: number }` + campo de comentario libre existente.

### 5.2 Entrada — `src/app/portal/agenda/...`
- Tras marcar una sesión como completada (o en las siguientes horas), ofrecer un prompt ligero opcional: feeling + RPE percibido + comentario. Debe poder omitirse sin fricción.

### 5.3 Server action
- `submitPostSessionFeedback(bookingId, { feeling, rpe, comment })` en el módulo del portal correspondiente, valida que el `Member` sea el dueño del `Booking`.

### 5.4 Vista de contraste
- En `src/app/(app)/feedback/page.tsx` (FB-1): mostrar el `SelfAssessment kind="post-sesion"` **junto** al `SessionDebrief` de la misma sesión, sin mezclarlo con `TrainerRating` (que sigue su canal confidencial aparte).

---

## FASE BI-3 — Mapa de calor real por CP

**Cierra:** upgrade `RB-LEAD-010`. **Esfuerzo:** Alto. **Dependencias:** geocodificación (riesgo #3), decisión D-6 (tabla local + `react-leaflet`).

### 6.1 Dependencias
```bash
npm install leaflet react-leaflet leaflet.heat
npm install -D @types/leaflet
```

### 6.2 Tabla local CP → coordenadas
- Nueva tabla/fichero estático `src/lib/postal-codes-es.ts` (o modelo Prisma `PostalCodeGeo` si se prefiere consultar por SQL): `{ postalCode: string, lat: number, lng: number }` para los CP españoles.
- Fuente recomendada: dataset abierto de códigos postales españoles (ine/CartoCiudad o equivalente ya usado en otros proyectos del cliente) — **no** inventar coordenadas ni usar un servicio de pago.
- Documentar la fuente/licencia del dataset en un comentario de cabecera del fichero.

### 6.3 Query
- Reutilizar `getPostalCodeDistribution` (ya existe en `dashboard-queries.ts`) y unir con la tabla CP→coords para obtener `[{ lat, lng, count }]`.

### 6.4 Componente — `src/app/(app)/dashboard/postal-heatmap.tsx` 🆕
- `"use client"` (Leaflet necesita `window`/DOM; importar con `dynamic(() => import(...), { ssr: false })` desde `page.tsx`/`charts.tsx`).
- `MapContainer` de `react-leaflet` con capa de tiles OSM (`https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`, atribución obligatoria visible).
- Capa de heatmap con `leaflet.heat`, alimentada por `[lat, lng, intensidad]` (intensidad = nº de socios).
- Centrar el mapa en la ubicación del centro/gimnasio (coordenada fija de configuración, no hardcodear "mágica" sin nombrar — constante `CENTER_COORDS` documentada).

### 6.5 Notas de producción
- Revisar [política de uso de tile.openstreetmap.org](https://operations.osmfoundation.org/policies/tiles/): en tráfico alto, migrar a un proveedor de tiles gestionado con capa gratuita (MapTiler/Stadia) en vez de pegar directo contra los tiles públicos de OSM.
- Mantener consistencia visual con `dataviz`/`chart-colors.ts` (gradiente de intensidad del heatmap dentro de la paleta de marca, sin colores por defecto de la librería).

### 6.6 Integración en dashboard
- `src/app/(app)/dashboard/page.tsx`: sustituir/complementar las barras actuales de `getPostalCodeDistribution` con el nuevo mapa, en la banda de demografía junto a CP/edad.

---

## FASE PAGO-2b — Devolución vía Stripe (BLOQUEADA)

**Cierra:** parte Stripe de `RB-PAGO-003`. **Estado:** 🚧 **bloqueada por decisión D-2** hasta que el cliente entregue credenciales de Stripe (clave secreta + webhook secret de la cuenta real).

Cuando estén disponibles las credenciales:

### 7.1 `stripe-checkout.ts` / `stripe.ts`
- Añadir función de refund: `stripe.refunds.create({ payment_intent, reason })`, capturar `stripeRefundId`.

### 7.2 `src/app/(app)/billing/actions.ts`
- Extender `refundPayments` para, cuando el `Payment` tenga `stripePaymentIntentId`, invocar el refund real en vez de bloquear con el mensaje de "pendiente de credenciales".

### 7.3 Webhook — `src/app/api/stripe/webhook/`
- Añadir manejo de `charge.refunded` / `payment_intent.refunded`: reconciliar de forma **idempotente** (mismo patrón que `reconcileStripeCheckoutCompleted`), setear `refundedAt`/`stripeRefundId` si no vinieron ya de la acción local.

### 7.4 Factura rectificativa (VERI\*FACTU)
- Fuera de alcance de este documento — se documenta como **dependencia externa** (integración fiscal), no se implementa aquí (README D3 / plan §5.1).

---

## Checklist de verificación transversal (todas las fases)

- [ ] Toda query nueva en `src/lib/*` filtra por `orgId`.
- [ ] Toda server action de escritura usa `requireRole([...])` y registra `AuditLog`.
- [ ] Ninguna vista de `TrainerRating` es accesible por el propio entrenador (gate solo vía `trainer-rating-access.ts`).
- [ ] Gráficas nuevas siguen skill `dataviz` + `chart-colors.ts`: sin degradados, tokens `brand-*`.
- [ ] Migraciones Prisma son aditivas y opcionales (sin romper datos existentes).
- [ ] Acciones idempotentes frente a reintentos del webhook de Stripe (donde aplique).
- [ ] `prisma/seed.ts` actualizado para poder demostrar cada feature nueva en local.

---

*Fin del documento. Complementa `docs/FEEDBACK_COBROS_DASHBOARD.md` (el "qué/porqué" y las reglas `RB-FB-*`/`RB-PAGO-*`/`RB-BI-*`) y encaja sobre `CRM_IMPLEMENTACION_FUNCIONALIDADES.md` (fases F8–F17).*
