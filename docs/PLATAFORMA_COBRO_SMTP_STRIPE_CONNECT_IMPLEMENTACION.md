# APTA — Alta de director, cobro de plataforma, SMTP y Stripe Connect · Guía de implementación

**Documento de implementación · v1.0 · para ejecutarse paso a paso por un agente de codificación (p. ej. Claude Sonnet 5).**

**Objetivo:** dejar cerrado *cómo* se construyen tres piezas que hoy no existen o están a medias:
**(A)** el **cobro de plataforma** (Apta le cobra al director por usar el software) con su alta y ciclo de vida,
**(B)** el **SMTP** transaccional, y **(C)** **Stripe Connect** (cada gimnasio cobra a sus socios en su
propia cuenta). Cada sección se ancla al código real y define reglas de negocio nuevas (`RB-*`).

> ⚠️ **Antes de escribir una sola línea de código, leer `AGENTS.md`.** Este NO es el Next.js de
> siempre: Next.js 16 + Prisma 7 + Tailwind v4, con cambios de API respecto a versiones anteriores.
> Leer la guía relevante en `node_modules/next/dist/docs/` (p. ej. `01-app/02-guides/server-actions.md`,
> `01-app/01-getting-started/07-mutating-data.md`) antes de tocar server actions, formularios o auth.

**Emparejar con:**
- `docs/STRIPE_FUNCIONALIDADES_ROI.md` — la **Parte C (Connect)** de este doc es la fase **F18.0** de
  ese documento (decisión **D-S1**: cada gimnasio, su cuenta Stripe). No lo contradice: lo ejecuta.
- `docs/CRM_REGLAS_NEGOCIO.md` y `docs/FEEDBACK_COBROS_DASHBOARD.md` — el "qué/porqué" del cobro a socios.

---

## 0. La idea que ordena todo: DOS planos de cobro y UNA sola clave secreta

Hay que separar dos planos de cobro que **no** deben mezclarse en el código:

| | **Plano 1 — Apta → gimnasios** (Parte A) | **Plano 2 — gimnasio → socios** (Parte C) |
|---|---|---|
| Qué cobra | La licencia del software (suscripción SaaS) | La cuota del socio |
| Cuenta Stripe | La de **Apta** (plataforma) | La de **cada gimnasio** (cuenta conectada) |
| Quién paga | El director → Apta | El socio → el gimnasio |
| Estado hoy | **No existe** | Cableado como pago puntual con una clave global; falta Connect |

> **Consecuencia clave (y respuesta a "¿el gimnasio mete una API key secret?"): NO.** En toda la
> arquitectura hay **exactamente una clave secreta: la de Apta** (`STRIPE_SECRET_KEY`). Los cobros a
> socios se hacen con **esa misma clave** más la cabecera `Stripe-Account: acct_...` de la cuenta
> conectada del gimnasio (Connect Standard, OAuth de un botón). **Ningún gimnasio introduce jamás una
> clave secreta ni un webhook secret.**

---

## 1. Estado real del código (base de partida)

| Pieza | Qué hace hoy | Dónde vive |
|---|---|---|
| Alta de organización | Asistente **anónimo** de 5 pasos: crea `Organization` + `OWNER` (contraseña inutilizable + invitación que el owner debe canjear) + centros + personal + socios de una tacada | `src/app/register/*`, `src/app/register/actions.ts` (`registerOrganization`) |
| Cuenta del owner | Se crea con `createStaffWithInvitation` → **NO** queda logueado; tiene que ir a `/onboarding/[token]` | `src/lib/invitations.ts`, `src/app/onboarding/[token]/*` |
| `Organization` | Solo `name`, `slug`, `logoUrl`, `createdAt`. **Sin estado de plataforma, plan ni suscripción** | `prisma/schema.prisma` (`model Organization`) |
| Cliente Stripe | Lee **una `STRIPE_SECRET_KEY` global** (una cuenta para todos); `getStripeClient()` sin `orgId` | `src/lib/stripe.ts` |
| Checkout (socios) | `mode:"payment"` puntual; crea `Payment` PENDING; concilia por webhook | `src/lib/stripe-checkout.ts`, `src/app/api/stripe/webhook/route.ts` |
| Webhook | Verifica firma con `STRIPE_WEBHOOK_SECRET`; maneja `checkout.session.completed` / `.expired` | `src/app/api/stripe/webhook/route.ts` |
| Mailer | SMTP real si hay `SMTP_*`; si no, cae a `console.log`. **Sin cambios de código para encenderlo** | `src/lib/mailer.ts` |
| Cron de reglas | GET protegido por `JOBS_CRON_SECRET`; recorre orgs ejecutando reglas temporales | `src/app/api/jobs/run/route.ts` |
| Layout de la app | `requireSession()` + carga la org (name/logo). **Punto central para el muro de pago** | `src/app/(app)/layout.tsx` |
| Auth | next-auth v5, JWT con `role`/`orgId`/`centerId`; provider `demo` (Credentials, bcrypt). Microsoft/Google declarados y dormidos | `src/auth.config.ts`, `src/auth.ts` |
| Env | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SMTP_*`, `JOBS_CRON_SECRET`, `NEXTAUTH_URL` | `.env.example` |

---

## 2. Decisiones cerradas (de la fase de diseño — no reabrir)

| # | Decisión |
|---|---|
| **D-1** | **Registro de director abierto e identidad-ligera.** No se verifica que sea director de un gimnasio. **El pago es el único muro.** Si paga y no tiene gimnasio, es su problema; sin riesgo para Apta. |
| **D-2** | **Muro de email BLANDO.** La confirmación de email **no bloquea** el login. Es el email **del propio director** (canal de facturación/reset), **no** correos a terceros → no reabre el vector de spam del alta. |
| **D-3** | **Alta pragmática:** el registro crea `Organization` (`PENDING_PAYMENT`) **+** `OWNER` **juntos**, con **contraseña real** y **login automático**, sin el baile de invitación. `User.orgId` sigue siendo obligatorio → **no** hace falta refactor de nullable. |
| **D-4** | **Primer paso adelgazado:** empresa + datos fiscales. Centros/personal/socios se añaden **después** de pagar (pantallas ya existentes: `/organization`, `/members`). |
| **D-5** | **Ciclo de datos = Opción A.** La org `PENDING_PAYMENT` se **conserva** (permite reintento y follow-up) pero con **TTL** (~30 días) tras el cual un job la **purga en duro**. Distinto de una org que sí pagó y luego cayó. |
| **D-6** | **Purga ≠ conservación.** `PENDING_PAYMENT` que nunca se activó → purgable (pre-cliente, sin datos de terceros). `SUSPENDED` (fue `ACTIVE` y dejó de pagar) → **conservar** en solo-lectura + exportación por obligaciones fiscales/RGPD. **Nunca** aplicar el TTL de purga a una org que llegó a operar. |
| **D-7** | **Connect Standard** para el Plano 2 (D-S1 del doc de Stripe): un botón "Conectar con Stripe", OAuth, **cero claves** del gimnasio en Apta. La vía de "pegar la secret key" queda descartada salvo atajo de MVP. |
| **D-8** | **Modelo de precio: decisión de negocio abierta.** El código debe soportar las tres formas (plano / varios tiers con funcionalidades / lifetime) **sin hardcodear** el catálogo (ver A.5). La elección concreta de tiers/precios la cierra dirección. |

---

# Parte A — Cobro de plataforma (Apta → gimnasios)

## A.1 Cambios de modelo (Prisma) — aditivos y compatibles hacia atrás

```prisma
enum PlatformStatus {
  PENDING_PAYMENT // registrada, aún no ha pagado (D-3). No usable (muro). Purgable por TTL (D-5).
  TRIALING        // opcional: acceso durante prueba (si se ofrece trial)
  ACTIVE          // suscripción al día → app usable
  PAST_DUE        // cobro recurrente falló; periodo de gracia antes de suspender
  SUSPENDED       // impago persistente; solo-lectura. NUNCA se purga (D-6)
  CANCELLED       // baja definitiva del cliente
}

model Organization {
  // ... campos actuales (name, slug, logoUrl, createdAt) ...
  platformStatus        PlatformStatus @default(PENDING_PAYMENT)
  platformStatusSince   DateTime       @default(now()) // base del TTL de purga (D-5)
  platformPlan          String?        // código del plan contratado (ver A.5); null hasta pagar
  trialEndsAt           DateTime?      // si se ofrece trial
  currentPeriodEnd      DateTime?      // fin de ciclo (espejo de la suscripción de Stripe)
  // Datos fiscales para la factura (D-4). No verifican "es director", son para facturar.
  taxId                 String?        // NIF/CIF
  billingEmail          String?        // email de facturación (puede ≠ email del owner)
  billingName           String?        // razón social
  // Suscripción en el Stripe DE APTA (Plano 1). Distinto del StripeAccount del gimnasio (Parte C).
  platformStripeCustomerId     String? @unique
  platformStripeSubscriptionId String? @unique
}

model User {
  // ... campos actuales ...
  emailVerifiedAt DateTime? // D-2: confirmación blanda del email del director (no bloquea login)
}
```

> Todos los campos nuevos son **opcionales / con default** → migración Prisma 7 estándar sin romper
> datos existentes (las orgs sembradas quedan en `PENDING_PAYMENT`; el seed debe ponerlas en `ACTIVE`,
> ver A.7). Migración: `npx prisma migrate dev --name platform_billing`.

## A.2 Alta pragmática del director (registro)

**Sustituye** el asistente anónimo actual por un registro cuenta-primero. Recomendado: nueva ruta
`src/app/signup/*` (y dejar `/register` redirigiendo a ella, o reescribir `/register`), y actualizar
el enlace de `src/app/login/page.tsx` ("Registrar organización →").

Flujo del server action (`src/app/signup/actions.ts`, `"use server"`):

1. Validar: nombre, email, contraseña (mín. 8), nombre de empresa. `zod` como en el resto del repo.
2. Comprobar colisión de email:
   - Si existe un `User` cuya org está en `PENDING_PAYMENT` → **reanudar** (D-5): no error "ya existe";
     redirigir al checkout / paywall de esa org.
   - Si existe un `User` de una org activa → error "ya hay una cuenta con ese email, inicia sesión".
3. En una `prisma.$transaction`:
   - `Organization` con `platformStatus: "PENDING_PAYMENT"`, `taxId`/`billingName` si se dieron.
   - `Center`: **no** obligatorio aquí (D-4). Se añaden después.
   - `User` OWNER con **contraseña real** (`bcrypt.hash`), `emailVerifiedAt: null`. **No** crear
     `Invitation` para el owner (a diferencia de `createStaffWithInvitation`). Añadir un helper
     `createOwnerAccount(tx, { orgId, name, email, passwordHash })` en `src/lib/invitations.ts`.
4. **Login automático:** tras la transacción, iniciar sesión con el provider `demo`:
   `await signIn("demo", { email, password, redirect: false })` (importado de `@/auth`). La `authorize`
   de `src/auth.config.ts` compara bcrypt → funciona sin tocar auth. **Leer la guía de next-auth v5
   antes** (server actions + `signIn`).
5. Emitir el email de verificación (D-2, ver Parte B) — **no bloqueante**.
6. `redirect("/activar")` (el muro/checkout, A.3).

> **`User.orgId` sigue obligatorio (D-3):** como org y owner se crean juntos, nunca hay un usuario sin
> org. No tocar la nullabilidad de `orgId` (sería un refactor de todas las queries aisladas por tenant).
> Si algún día se quiere "un login para varios gimnasios", ESO sí requeriría `orgId` nullable — fuera de alcance.

## A.3 Muro de pago (gating por `platformStatus`)

Punto central: **`src/app/(app)/layout.tsx`** (ya carga la org). Extender el `select` a `platformStatus`
y aplicar el muro:

- Si `platformStatus ∈ {ACTIVE, TRIALING}` → acceso normal.
- Si no:
  - Rol de **staff** (todo lo que no sea `MEMBER`) → `redirect("/activar")`.
  - Rol `MEMBER` → pantalla "servicio no disponible temporalmente" (una org `PENDING_PAYMENT` aún no
    tiene socios; el caso real de socios bloqueados es `SUSPENDED`, ver D-6).
- `PLATFORM_ADMIN` (soporte de Apta) **exento** del muro: debe poder entrar a gestionar cualquier org.

Nueva ruta **`src/app/activar/page.tsx`**: fuera del grupo `(app)` (sin sidebar), muestra el estado
(`PENDING_PAYMENT` / `PAST_DUE` / `SUSPENDED`) y el CTA de pago (A.4). Helper sugerido
`requirePlatformActive(session)` en `src/lib/guard.ts` para reutilizar fuera del layout si hace falta.

## A.4 Cobro real (Stripe de Apta)

Nuevo `src/lib/platform-billing.ts` (espejo de `stripe-checkout.ts`, pero contra la cuenta de Apta —
**sin** `Stripe-Account`, ya que aquí cobra Apta):

- `createPlatformCheckoutSession(orgId, planCode)`:
  - `mode: "subscription"` para cuota recurrente, o `mode: "payment"` si el plan es **lifetime** (A.5).
  - `customer` = crear/recuperar `platformStripeCustomerId` de la org; `metadata: { orgId, planCode }`.
  - `success_url` → `/activar?checkout=success`; `cancel_url` → `/activar?checkout=cancelled`.
- Server action `createPlatformCheckoutAction` (en `activar/actions.ts`), guardado con `requireRole(["OWNER"])`.

**Webhook** (`src/app/api/stripe/webhook/route.ts`): ampliar el `switch`. **Distinguir plano 1 vs plano 2:**
los eventos de **cuentas conectadas** (Parte C) llegan con `event.account` presente; los de **plataforma**
(Apta) llegan **sin** `event.account`. Rutar en consecuencia:

- Plataforma (`event.account` ausente), sobre `metadata.orgId`:
  - `checkout.session.completed` / `invoice.paid` → `platformStatus = ACTIVE`, guardar
    `platformStripeSubscriptionId`, `currentPeriodEnd`, `platformPlan`.
  - `invoice.payment_failed` → `PAST_DUE`.
  - `customer.subscription.deleted` → `SUSPENDED` (impago persistente) o `CANCELLED` (baja voluntaria).
  - Conciliación **idempotente** (buscar por `platformStripeSubscriptionId` antes de escribir), como el patrón actual.
- Conectadas (`event.account` presente) → lógica de socios (Parte C).

**Env:** `STRIPE_SECRET_KEY` = clave secreta **de Apta** (la única del sistema, ver §0). Documentarlo en
`.env.example`. Si se separan los webhooks de plataforma y de Connect, añadir
`STRIPE_CONNECT_WEBHOOK_SECRET`; si se usa un único endpoint, un solo secret vale.

## A.5 Modelo de precio (soportar las tres formas sin hardcodear — D-8)

El código no debe fijar precios; debe fijar el **mecanismo**. Catálogo de planes como **dato**, no
hardcode (misma filosofía que `LeadChannel`/`AptitudeRule`): tabla `PlatformPlan` o, para empezar, un
fichero `src/lib/platform-plans.ts` con `{ code, name, stripePriceId, interval: "month"|"year"|"lifetime", features: string[] }`.

- **Plano** (una cuota): un solo `PlatformPlan` activo. `platformPlan` casi decorativo.
- **Varios tiers con funcionalidades** (⚠️ el que se ramifica): varios `PlatformPlan`, cada uno con su
  `features[]`. Añadir un helper **`orgHasFeature(org, feature): boolean`** y **gatear** en la app las
  funciones premium por ese helper (no solo por `platformStatus`). Definir un tipo `PlatformFeature`
  (unión de strings) para las capacidades gateables (p. ej. `"ia_programacion"`, `"bi_avanzado"`,
  `"multicentro"`). Enumerar qué desbloquea cada tier es **decisión de dirección** (D-8): dejar el
  catálogo vacío/configurable, no inventarlo aquí.
- **Lifetime** (pago único): `interval: "lifetime"` → checkout `mode: "payment"`; al confirmarse,
  `platformStatus = ACTIVE` **permanente**, sin `currentPeriodEnd` ni dunning.

## A.6 Ciclo de vida de datos (Opción A) — purga por TTL

Nueva regla en el cron. En `src/lib/platform-billing.ts`:

- `runStalePendingOrgPurgeRule()`: busca orgs con `platformStatus = "PENDING_PAYMENT"` y
  `platformStatusSince < now - TTL_DÍAS` (p. ej. 30, configurable por env `PLATFORM_PENDING_TTL_DAYS`).
  **Borra en duro** org + owner (+ cascada de lo que cuelgue, que en pre-pago es casi nada). Opcional:
  email de aviso 3 días antes (re-enganche) si `emailVerifiedAt` no es null.
- **Salvaguarda crítica (D-6):** el `where` debe exigir `platformStatus = "PENDING_PAYMENT"`. **Jamás**
  purgar `SUSPENDED`/`CANCELLED` (esas fueron clientes de pago: conservar por fiscal/RGPD, solo-lectura + export).

Enganchar en `src/app/api/jobs/run/route.ts` (fuera del bucle por-org, es global): añadir al `summary`
un `purgedPendingOrgs += await runStalePendingOrgPurgeRule()`.

## A.7 Reglas de negocio (Parte A)

- **`RB-PLAT-001`** — El acceso a la app se gatea por `Organization.platformStatus`; solo `ACTIVE`/`TRIALING`
  dan operativa (A.3). `PLATFORM_ADMIN` exento.
- **`RB-PLAT-002`** — El registro crea org `PENDING_PAYMENT` + OWNER con contraseña real y auto-login (D-3).
- **`RB-PLAT-003`** — Reintento y reanudación: reregistro con email de una org `PENDING_PAYMENT` → reanuda, no error.
- **`RB-PLAT-004`** — La confirmación de pago (webhook de plataforma) es lo único que pasa a `ACTIVE` (D-1). Idempotente.
- **`RB-PLAT-005`** — TTL de purga de `PENDING_PAYMENT` (Opción A, D-5); nunca aplica a `SUSPENDED`/`CANCELLED` (D-6).
- **`RB-PLAT-006`** — El catálogo de planes es dato configurable, no hardcode; funciones premium gateadas por `orgHasFeature` (A.5).
- **`RB-PLAT-007`** — Seed: las orgs de demo nacen `ACTIVE` para no chocar con el muro.

---

# Parte B — SMTP transaccional

## B.1 Encenderlo es SOLO configuración (cero código)

`src/lib/mailer.ts` ya lee `SMTP_HOST/PORT/SECURE/USER/PASSWORD/FROM` y, si faltan, cae a `console.log`.
Para producción, rellenar esas variables (Resend, SES, Postmark, Sendgrid, servidor propio) en el entorno
de despliegue. Verificar también `NEXTAUTH_URL` (base de los enlaces que van en los emails, ver
`onboardingUrlFor` en `src/lib/invitations.ts`).

## B.2 Confirmación de email del director (muro blando, D-2)

Es lo único de la Parte B que necesita código nuevo:

- Añadir `User.emailVerifiedAt` (ya en A.1).
- **Token sin tabla (recomendado):** enlace firmado con HMAC de `AUTH_SECRET`
  (`token = base64url(userId + exp) + "." + hmac`). Evita una tabla nueva. Alternativa: modelo
  `EmailVerification` si se prefiere revocable.
- Ruta `src/app/verificar-email/[token]/route.ts` (o page): valida el token/exp/HMAC y pone
  `emailVerifiedAt = now()`. Enlace inválido/caducado → mensaje claro + opción de reenviar.
- Plantilla en `src/lib/emails/templates.ts` (`renderVerifyEmail`, reutilizar el `shell` existente).
- Enviar desde el alta (A.2, paso 5) y ofrecer "reenviar" desde `/activar`.
- **No bloquea el login** (D-2). Opcional: exigir `emailVerifiedAt` antes de lanzar el checkout de pago
  (para asegurar canal de facturación) — decisión menor, dejar como flag.

## B.3 Qué depende de que el SMTP esté encendido

Confirmación de email del director (B.2), aviso "completa tu pago" (A.6), recibos/facturas, e invitaciones
de personal/socios (ya existentes, `renderStaffInviteEmail`/`renderMemberWelcomeEmail`). **Gap conocido:**
no hay reset de contraseña (ni por email ni por SMS) — anotado, fuera de alcance de este doc.

## B.4 Entregabilidad (no es código, pero condiciona que funcione)

Configurar SPF/DKIM/DMARC del dominio remitente y un `SMTP_FROM` real, o las verificaciones y recibos caen
en spam. Probar primero con el fallback de `console.log` (SMTP vacío) para no depender del correo en local/CI.

- **`RB-SMTP-001`** — El envío es best-effort: si el SMTP falla, `mailer.ts` loguea y no rompe el flujo
  (comportamiento actual, mantener). La verificación de email es blanda: su ausencia no bloquea el uso.

---

# Parte C — Stripe Connect (gimnasio → socios) · = F18.0 de `STRIPE_FUNCIONALIDADES_ROI.md`

> Esta parte **ejecuta** la decisión **D-S1** y el modelo `StripeAccount` ya descritos en
> `docs/STRIPE_FUNCIONALIDADES_ROI.md` (§A.11, §B.2). Leer esa sección primero: aquí va el "cómo" accionable.

## C.1 Modelo (Prisma)

```prisma
// La cuenta Stripe es un dato POR organización (D-S1), no global. Reemplaza el uso de la clave global
// para cobrar a socios. Sigue habiendo UNA sola clave secreta (la de Apta): aquí solo se guarda el id
// de la cuenta conectada, nunca una clave del gimnasio.
model StripeAccount {
  id             String   @id @default(cuid())
  orgId          String   @unique
  accountId      String   @unique // acct_... conectado por el gimnasio (Connect Standard, OAuth)
  chargesEnabled Boolean  @default(false) // el gimnasio completó el onboarding de Stripe
  payoutsEnabled Boolean  @default(false)
  createdAt      DateTime @default(now())
  organization   Organization @relation(fields: [orgId], references: [id])
}
```
(Añadir la relación inversa `stripeAccount StripeAccount?` en `model Organization`.)

## C.2 `getStripeClient()` pasa a ser consciente del tenant

Refactor de `src/lib/stripe.ts`:

- El cliente se construye **siempre** con la clave de **Apta** (`STRIPE_SECRET_KEY`).
- Para operaciones **de socios**, pasar las request options `{ stripeAccount: acct }` resuelto desde
  `StripeAccount.accountId` de esa `orgId`. Firma sugerida: `getStripeClient()` (plataforma, sin cuenta)
  y un helper `stripeForOrg(orgId)` que devuelve `{ stripe, stripeAccount }` o falla si la org no ha conectado.
- Actualizar los call sites de cobro a socios (`src/lib/stripe-checkout.ts` `createCheckoutSession`) para
  pasar `orgId` y ejecutar contra la cuenta conectada. `isStripeConfigured()` pasa a ser **por org**
  (¿tiene `StripeAccount.chargesEnabled`?), extendiendo la degradación elegante actual.

> **Punto de seguridad (repetir en el PR):** el gimnasio **no** introduce ninguna clave. La única clave
> secreta del sistema es la de Apta; los cobros a socios son esa clave + `Stripe-Account`.

## C.3 "Conectar con Stripe" (OAuth Standard) — el botón

- Nueva lib `src/lib/stripe-connect.ts`: `buildConnectOAuthUrl(orgId)` y `exchangeOAuthCode(code)`.
- Ruta `src/app/api/stripe/connect/callback/route.ts`: recibe el `code` de Stripe, lo intercambia por el
  `stripe_user_id` (`acct_...`), hace `upsert` de `StripeAccount` y refresca `chargesEnabled/payoutsEnabled`
  (con `stripe.accounts.retrieve`). Redirige a los ajustes de cobro con éxito/error.
- Botón "Conectar cobros con Stripe" en ajustes de organización, dentro del **checklist de puesta en
  marcha** post-activación (ver C.5). Requiere `requireRole(["OWNER","CENTER_DIRECTOR"])`.
- **Cuándo (respuesta a la pregunta de negocio):** NO en la venta. Es un paso de configuración del gimnasio
  **ya activo** (`platformStatus = ACTIVE`), **bloqueante solo del primer cobro a un socio**, no del uso de Apta.

## C.4 Webhook: rutar por cuenta conectada

En `src/app/api/stripe/webhook/route.ts`, los eventos de Connect llegan con `event.account` presente.
Resolver la `orgId` a partir de `StripeAccount.accountId = event.account` y aplicar la lógica de socios ya
existente (`reconcileStripeCheckoutCompleted`, etc.), **acotada a esa org**. Los eventos sin `event.account`
son de plataforma (Parte A.4). Mantener verificación de firma e idempotencia.

## C.5 Gating y checklist

- Mientras `StripeAccount` no exista o `chargesEnabled = false`, las UIs de cobro a socios muestran
  "Conecta tu Stripe para cobrar" en vez del botón (extender el patrón actual de `isStripeConfigured()`).
- Checklist post-activación (nueva pieza de UI en `/organization` o dashboard): centros ✓, personal ✓,
  **conectar Stripe ✓**. Puramente guía; no bloquea el resto de la app.

## C.6 Reglas de negocio (Parte C) — alinear con el doc de Stripe

- **`RB-PAGO-018`** (ya en `STRIPE_FUNCIONALIDADES_ROI.md`) — Connect Standard, una cuenta por gimnasio,
  sin application fee; `getStripeClient` resuelve por `orgId`. Este doc es su ejecución.
- **`RB-CONNECT-001`** — El gimnasio conecta vía OAuth (un botón). Apta guarda solo `acct_...`, nunca una
  clave secreta ni un webhook secret del gimnasio.
- **`RB-CONNECT-002`** — Cobrar a socios requiere `StripeAccount.chargesEnabled`; si no, degradación elegante.
- **`RB-CONNECT-003`** — La vía "pegar secret key por org" queda **descartada** (D-7); solo como atajo de
  MVP documentado si dirección lo pide explícitamente.

---

# Parte D — Plan por fases (orden recomendado y dependencias)

| Fase | Contenido | ¿Necesita credenciales? | Esfuerzo |
|---|---|---|---|
| **P0** | **SMTP** encendido (solo env) + verificación de email del director (B.2) | SMTP real (o `console.log` en local) | Bajo |
| **P1** | **Modelo `Organization` de plataforma (A.1) + alta pragmática `/signup` (A.2) + muro `/activar` (A.3) + purga por TTL (A.6)** | **No** (probable con flips manuales de estado) | Medio |
| **P2** | **Cobro real de plataforma** (A.4): checkout suscripción/lifetime + handlers de webhook de plataforma | Cuenta Stripe de **Apta** | Medio |
| **P3** | **Modelo de precio** (A.5): catálogo + `orgHasFeature` + gating si hay tiers | Depende de D-8 (dirección) | Bajo-Medio |
| **P4** | **Stripe Connect por gimnasio** (Parte C, = F18.0): `StripeAccount` + `getStripeClient(orgId)` + OAuth + rutado de webhook | Cuenta de plataforma de Apta + Connect activado | Alto |

> **P1 es construible y testeable HOY** sin cuenta Stripe: estados, muro, alta y purga se prueban con
> flips manuales de `platformStatus`. El cobro real (P2) se enchufa cuando lleguen las credenciales, igual
> que hoy el checkout de socios degrada con `isStripeConfigured()`. Ser honesto en la UI sobre qué está
> "en espera de credenciales".

---

# Parte E — Mapeo a entidades (orientativo)

| Concepto | Entidad / campo | Estado |
|---|---|---|
| Estado de suscripción del gimnasio a Apta | `Organization.platformStatus` (+ `platformStatusSince`, `currentPeriodEnd`) | 🆕 campos |
| Plan/tier contratado | `Organization.platformPlan` + catálogo `PlatformPlan`/`platform-plans.ts` | 🆕 |
| Datos de facturación | `Organization.taxId/billingEmail/billingName` | 🆕 campos |
| Suscripción en Stripe de Apta | `Organization.platformStripeCustomerId/SubscriptionId` | 🆕 campos |
| Alta de director | `/signup` + `createOwnerAccount` (owner con contraseña real, sin invitación) | 🆕 / ➕ |
| Muro de pago | Guard en `src/app/(app)/layout.tsx` + ruta `/activar` | 🆕 |
| Purga de pre-clientes | `runStalePendingOrgPurgeRule` en `src/app/api/jobs/run/route.ts` | 🆕 |
| Confirmación de email | `User.emailVerifiedAt` + `/verificar-email/[token]` + token HMAC | 🆕 |
| Cuenta Stripe del gimnasio | `StripeAccount` (por org) + Connect OAuth | 🆕 (= F18.0) |
| Cliente Stripe por tenant | `getStripeClient` / `stripeForOrg(orgId)` con `Stripe-Account` | 🔁 refactor de `src/lib/stripe.ts` |

---

## Notas de testing

- E2E con Playwright ya existe (`e2e/*.spec.ts`, `playwright.config.ts`). Añadir specs para: alta →
  muro `/activar`; reanudación de `PENDING_PAYMENT`; purga por TTL (con fecha manipulada); degradación de
  cobro sin `StripeAccount`.
- Emails: probar con SMTP vacío (fallback `console.log`) para no depender del correo en CI.
- Stripe: usar claves de test y el CLI de Stripe para reenviar webhooks; conciliación idempotente
  verificable reenviando el mismo evento dos veces.
- Antes de cada bloque de código: releer la guía relevante de `node_modules/next/dist/docs/` (AGENTS.md).

---

*Fin del documento. Es guía de implementación: define el cómo, no cierra el modelo de precio (D-8, decisión
de dirección) ni requiere las credenciales para escribirse. Emparejar con `STRIPE_FUNCIONALIDADES_ROI.md`
(Parte C = F18.0) y `CRM_REGLAS_NEGOCIO.md`.*
