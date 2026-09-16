# Propuesta — Varias cuentas de Stripe por organización (agrupación libre de centros)

> **Estado: PROPUESTA. No implementada. Requiere decisión del integrador.**
> Toca `prisma/schema.prisma`, **fichero congelado este trimestre**, y matiza una decisión
> cerrada (D-S1 / RB-PAGO-018). Nadie debe empezar a construir esto en su rama hasta que
> el integrador lo apruebe y decida en qué pista entra.

- **Pedido por:** dirección (TrainingZone), septiembre 2026.
- **Origen:** al activar el cobro online se detectó que las tres sedes de TrainingZone
  (La Jota, Puerta Carmen, Santander) liquidarían forzosamente en la misma cuenta bancaria.
- **Lectura previa obligatoria:** `docs/STRIPE_FUNCIONALIDADES_ROI.md` §A.11 (D-S1) y
  `docs/PLATAFORMA_COBRO_SMTP_STRIPE_CONNECT_IMPLEMENTACION.md` Parte C.

---

## 1. Qué se pide

Que una organización pueda tener **más de una cuenta de Stripe conectada**, y que cada centro
se asigne a una de ellas **en cualquier agrupación**:

| Caso | Ejemplo con los 3 centros de TrainingZone |
|---|---|
| Una cuenta por centro | La Jota → cuenta A · Puerta Carmen → cuenta B · Santander → cuenta C |
| Agrupación mixta | La Jota + Puerta Carmen → cuenta A · Santander → cuenta B |
| Una sola cuenta (hoy) | Los tres → cuenta A |

El tercer caso es el comportamiento actual y **debe seguir funcionando sin tocar nada**.

## 2. Qué lo impide hoy

`prisma/schema.prisma:1821-1830` — `StripeAccount.orgId String @unique`: **una** cuenta
conectada por organización, relación 1-a-1 con `Organization` (`schema.prisma:95`).
Todo el Plano 2 resuelve la cuenta a partir de la organización, nunca del centro:
`stripeForOrg(orgId)` e `isStripeConfiguredForOrg(orgId)` en `src/lib/stripe.ts:46-64`.

## 3. Lo que NO cambia (invariantes que la propuesta respeta)

- **RB-CONNECT-001 intacto**: sigue habiendo **una sola clave secreta** en el sistema, la de
  Apta. Ningún centro introduce jamás una clave. Las cuentas se siguen conectando por OAuth
  (Connect Standard) y se sigue guardando solo el `acct_...`.
- **RB-CONNECT-003 intacto**: la vía "pegar secret key" sigue descartada.
- Nunca se borra un `Price`: se archiva. Toda creación lleva clave de idempotencia.
- Ámbito de centro (`isCenterInScope` / `requireApiCenterScope`) en toda lectura y escritura.

Lo único que cambia es **de qué cuelga la cuenta**: de la organización pasa a colgar de un
grupo de centros.

## 4. Por qué es viable (el dato que lo hace posible)

En el momento del cobro, el centro **siempre es conocido**:

- `Member.primaryCenterId` es **obligatorio** (`schema.prisma`, `model Member`) — todo socio
  pertenece a un centro.
- `Subscription.centerId` es **obligatorio** (`model Subscription`) — toda suscripción sabe
  en qué centro se vendió.

No hace falta inventar de dónde sale el centro: ya está en los dos caminos de cobro.

## 5. Modelo propuesto

```prisma
model StripeAccount {
  id             String   @id @default(cuid())
  orgId          String            // ← deja de ser @unique
  accountId      String   @unique  // acct_... (sin cambios)
  label          String?           // "Cuenta La Jota" — para distinguirlas en la UI
  chargesEnabled Boolean  @default(false)
  payoutsEnabled Boolean  @default(false)
  createdAt      DateTime @default(now())

  organization Organization @relation(fields: [orgId], references: [id])
  centers      Center[]

  @@index([orgId])
}

model Center {
  // ...campos actuales...
  stripeAccountId String?
  stripeAccount   StripeAccount? @relation(fields: [stripeAccountId], references: [id])
}
```

Y en `Organization`: `stripeAccount StripeAccount?` pasa a `stripeAccounts StripeAccount[]`.

Una cuenta, N centros. Cubre los tres casos de la tabla del §1 sin ningún caso especial.

**Migración sin ruptura:** por cada `StripeAccount` existente, asignar `stripeAccountId` a
**todos** los centros de su organización. Una org con una sola cuenta se comporta exactamente
igual que hoy.

## 6. Superficie de impacto en código

Todo lo que hoy resuelve por `orgId` pasa a resolver por `centerId`. Inventario real:

| Fichero | Qué hace hoy |
|---|---|
| `src/lib/stripe.ts:46-64` | `stripeForOrg` / `isStripeConfiguredForOrg` — **el núcleo del cambio** |
| `src/lib/member-billing.ts:117,218,360,413` | checkout y cobros al socio |
| `src/lib/stripe-dunning.ts:376,464,531` | reintentos y morosidad |
| `src/lib/stripe-refunds.ts:177,371` | devoluciones |
| `src/lib/stripe-coupons.ts:99,181` | cupones |
| `src/lib/stripe-catalog.ts:71` | espejo del catálogo |
| `src/lib/billing-shared.ts:225` | resolución sin exigir `chargesEnabled` |
| `src/lib/setup-checklist.ts:52` | checklist de puesta en marcha |
| `src/lib/public-membership-queries.ts:81` | página pública del centro |
| `src/app/(app)/portal/membresia/*.ts` | portal del socio (billing, freeze, subscription) |
| `src/app/(app)/billing/{page,cupones,reembolsos}` | pantallas de dirección |
| `src/app/api/stripe/webhook/route.ts:262` | enrutado `accountId → orgId` |

Propuesta de firmas: `stripeForCenter(centerId)` e `isStripeConfiguredForCenter(centerId)`.
Para las pantallas agregadas de organización (`/billing`), un `orgHasAnyChargingAccount(orgId)`.

### 6.1 Webhook — punto crítico de seguridad

`webhook/route.ts:262` resuelve `accountId → orgId` y aplica la lógica acotada a esa org.
Con varias cuentas por org, resolver `accountId → StripeAccount → centros asignados` y acotar
a **esos centros**, no a la organización entera. Si no, un evento de la cuenta A podría tocar
datos de un centro que cobra en la cuenta B: sería una fuga de ámbito de centro dentro de la
propia organización — exactamente el fallo que más se repite según `AGENTS.md`.

### 6.2 Catálogo espejo — el problema de fondo

`MembershipPlan` cuelga de `orgId`, no del centro, y guarda **un solo** espejo
(`stripeProductId`, `stripePriceId`, `stripeAccountId`, `schema.prisma:749-751`). Pero un
`Price` de Stripe **vive dentro de una cuenta conectada concreta**. Si dos centros de la misma
organización cobran en cuentas distintas, un mismo plan necesita **un espejo por cuenta**.

Dos salidas, a decidir por el integrador:

- **(a) Tabla de espejos** `MembershipPlanStripeMirror (planId, stripeAccountId, productId, priceId)`,
  única por `(planId, stripeAccountId)`. El plan sigue siendo de organización. **Recomendada:**
  menos invasiva y no toca la semántica del catálogo.
- **(b) Planes por centro**: `MembershipPlan.centerId`. Más limpio conceptualmente, pero rompe
  el catálogo compartido y afecta a la app móvil y a las páginas públicas.

### 6.3 `Member.stripeCustomerId` — decisión pendiente

Es `@unique` y global por socio (`schema.prisma:532`), pero un `Customer` vive **dentro de una
cuenta conectada**. Si un socio cambia de centro y el nuevo cobra en otra cuenta, ese customer
no sirve. Hoy `Member.stripeAccountId` ya detecta el desfase e invalida el espejo, pero el
`@unique` impide guardar dos customers para el mismo socio. Si se acepta que un socio solo
compra en su centro principal, puede quedar fuera de alcance; si no, hay que levantar ese
`@unique`.

### 6.4 UI y permisos

- La tarjeta "Cobros a socios" (`src/app/(app)/organization/stripe-connect-card.tsx`) pasa de
  un botón único a una lista: cuentas conectadas, qué centros usa cada una, "Conectar otra
  cuenta" y asignación de centros. Cada asignación es una escritura con `centerId` → pasa por
  `isCenterInScope`.
- **Pregunta abierta para dirección:** hoy solo `OWNER`/`PLATFORM_ADMIN` pueden conectar
  (`canManageOrg`, `src/lib/rbac.ts:341-343`; el callback lo revalida en
  `api/stripe/connect/callback/route.ts:23-26`). Con cuentas por centro tiene sentido que un
  `CENTER_DIRECTOR` conecte **la de su centro**. Eso toca `src/lib/rbac.ts`, **también
  congelado** → decisión aparte, no la doy por supuesta en esta propuesta.

## 7. Decisión y reglas que habría que abrir

| Id | Contenido |
|---|---|
| **D-S2** | Matiza D-S1: la cuenta Stripe cuelga de un **grupo de centros**, no de la organización. Una org puede tener N cuentas; cada centro se asigna exactamente a una. Sigue siendo Connect Standard y una sola clave secreta (RB-CONNECT-001 intacto). |
| **RB-CONNECT-004** | Todo cobro a socio resuelve la cuenta conectada por el **centro** (`Member.primaryCenterId` / `Subscription.centerId`), nunca por la organización. |
| **RB-CONNECT-005** | Un evento de webhook de la cuenta `acct_X` solo puede afectar a los centros asignados a `acct_X`. Nunca a la organización entera. |
| **RB-CONNECT-006** | El espejo de catálogo es por `(plan, cuenta conectada)`. Un plan vendido en centros con cuentas distintas tiene un `Price` por cuenta. Nunca se borra un `Price`: se archiva. |

## 8. Fases sugeridas

| Fase | Contenido | Riesgo |
|---|---|---|
| **F1** | Schema + migración (todos los centros a la cuenta existente) + `stripeForCenter`/`isStripeConfiguredForCenter` con los ~20 call sites. Sin UI nueva: comportamiento idéntico al actual. | Medio |
| **F2** | Webhook acotado a centros (RB-CONNECT-005) + tests de que un evento de A no toca centros de B. | **Alto** (seguridad) |
| **F3** | Espejo de catálogo por cuenta (opción (a) o (b) del §6.2). | Alto |
| **F4** | UI de varias cuentas y asignación de centros en `/organization`. | Bajo |
| **F5** | (Opcional, decisión aparte) `CENTER_DIRECTOR` conecta la cuenta de su centro — toca `rbac.ts`. | Medio |

F1 y F2 son inseparables: dejar F2 para después abre la fuga de ámbito descrita en §6.1.

## 9. Lo que hace falta del integrador

1. **Descongelar `prisma/schema.prisma`** para este cambio, o asignarlo a la pista que ya lo
   tenga abierto. Con nueve pistas en paralelo, este cambio no puede hacerse a ciegas.
2. **Cerrar §6.2** (espejo de catálogo): opción (a) o (b).
3. **Cerrar §6.3** (`Member.stripeCustomerId` único): ¿se levanta o se asume un solo centro por socio?
4. **Decidir §6.4/F5**: ¿el director de centro conecta su propia cuenta? (tocaría `rbac.ts`, también congelado).
5. Decidir si entra este trimestre o se aparca en `docs/MODULOS_APARCADOS.md`.

> **Nota operativa, independiente de esto:** el cobro online de TrainingZone sigue apagado
> hasta que se carguen `STRIPE_SECRET_KEY` y `STRIPE_CONNECT_CLIENT_ID` en el entorno de
> producción. Esta propuesta no desbloquea eso; son dos cosas distintas.
