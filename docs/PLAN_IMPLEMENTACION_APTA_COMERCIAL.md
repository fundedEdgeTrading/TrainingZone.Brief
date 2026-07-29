# APTA — Plan de implementación ejecutable · Identidad, alta comercial y venta en dos planos

**Documento de implementación · v1.0 · para ejecutarse fase a fase por un agente de codificación.**

Ejecuta las decisiones de `docs/ARQUITECTURA_IDENTIDAD_VENTA_MULTITENANT.md` con las cinco
decisiones de dirección ya cerradas (§1). Es **autosuficiente**: contiene todo lo necesario para
implementar sin volver a leer los documentos de diseño.

> ⚠️ **Leer `AGENTS.md` antes de la primera línea de código.** Next.js 16 + Prisma 7 + Tailwind 4
> tienen APIs distintas a las de versiones anteriores. Consultar la guía concreta de
> `node_modules/next/dist/docs/` **solo** cuando la fase lo indique (§0.3).

---

## 0. Cómo trabajar este documento

### 0.1 Regla de oro

**Una fase = una unidad de trabajo = un commit.** No se empieza una fase sin haber cerrado la
anterior con su criterio de aceptación verde. No se adelanta trabajo de fases posteriores.

### 0.2 Economía de contexto (obligatorio)

Este repo tiene ficheros grandes (`prisma/seed.ts` = 2440 líneas, `prisma/schema.prisma` = 1309).
Leerlos enteros sin necesidad es la principal fuga de contexto. Reglas:

1. **Leer solo los ficheros listados en «Ficheros a leer» de la fase en curso.** Si aparece una
   necesidad no prevista, buscar con `Grep` por símbolo exacto, no leer el fichero completo.
2. **`prisma/seed.ts` y `prisma/schema.prisma` nunca se leen enteros.** Este documento da el
   número de línea o el símbolo exacto de cada punto a tocar; usar `Read` con `offset`/`limit`.
3. **No releer un fichero que se acaba de editar** para comprobar el cambio: `Edit` falla si no
   aplica.
4. **Diffs mínimos.** No reformatear, no reordenar imports, no renombrar lo que no toca la fase,
   no "aprovechar para arreglar" nada que no esté en la fase.
5. **No escribir resúmenes de trabajo en el repo** (nada de `RESUMEN_*.md`, `CHANGELOG` ad-hoc ni
   comentarios narrando el cambio). El commit es el registro.
6. **Comentarios: solo los que explican un *porqué* no evidente**, en la densidad del código
   vecino. El repo comenta decisiones y reglas (`RB-*`), no mecánica.
7. **Verificación por fase:** `npx tsc --noEmit` y `npm run lint` antes de cada commit. Los e2e
   solo cuando la fase lo pida (arrancan servidor y son caros).

### 0.3 Guías de Next.js a consultar (y solo esas)

| Cuándo | Guía |
|---|---|
| Server actions y formularios (F1, F3, F4, F6) | `01-app/02-guides/server-actions.md`, `01-app/01-getting-started/07-mutating-data.md` |
| Route handlers y webhooks (F3, F5) | `01-app/01-getting-started/…/route-handlers` |
| Auth.js v5 con Credentials + `update()` (F1) | documentación de `next-auth@5` en `node_modules/next-auth` |

### 0.4 Convenciones del repo que se respetan

- **Tipo resultado discriminado** en toda server action y servicio: `{ ok: true; … } | { ok: false; error: string }`.
  Nunca lanzar excepciones para errores de negocio esperables.
- **Validación con `zod`** en el borde (server actions, route handlers públicos).
- **Guard clauses** al principio, sin `else` anidado.
- **Aislamiento multi-tenant:** toda consulta de negocio filtra por `orgId` de la sesión. **Ninguna
  fase de este plan cambia esa regla.**
- **Rutas y textos de UI en español**; identificadores de código en inglés.
- **Degradación elegante:** si falta una credencial (Stripe, SMTP), la superficie se explica y
  desaparece; nunca revienta.

---

## 1. Decisiones de dirección (cerradas — no reabrir)

| # | Decisión |
|---|---|
| **D-8** | **Catálogo comercial cerrado** (§1.1). Tres tiers de suscripción + una oferta *lifetime* de lanzamiento. El eje de precio es el **número de centros**; nunca el número de socios. |
| **D-9** | **Solo licencia. Cero comisión.** Apta **no** aplica `application_fee` sobre los cobros del gimnasio ni participa en su contabilidad. Lo que el gimnasio venda a sus socios es suyo íntegro. `RB-VENTA-005`. |
| **D-10** | **Sin prueba gratuita.** `PlatformStatus.TRIALING` queda como valor de enum sin uso (no se elimina: retirar un valor de un enum de Postgres es una migración destructiva sin ganancia). |
| **D-11** | **Multi-organización se soporta técnicamente pero no se anuncia.** Cadenas y franquicias no son argumento comercial ni tienen UI dedicada; el modelo simplemente no lo impide. Sin pantallas de "gestión de grupo". |
| **D-12** | **Apta no factura.** Sin VERI\*FACTU, sin serie ni rectificativa. Cada gimnasio factura con su herramienta. Conectar Stripe desbloquea funcionalidad **dentro** de la app (cobro recurrente, autoservicio del socio, conciliación), que se irá ampliando. `RB-VENTA-006`. |

### 1.1 Catálogo comercial (D-8)

**Eje de precio = centros.** Escala con el valor y con nuestro coste, es trivial de contar
(`Center`) y no penaliza el crecimiento del gimnasio en socios — que es justo lo que queremos que
crezca, porque es lo que le hace quedarse.

| Plan | Centros | Mes | Año (2 meses gratis) | Desbloquea |
|---|---|---|---|---|
| **Esencial** | 1 | **79 €** | **790 €** | Núcleo operativo: socios, agenda, cobros, portal del socio + app móvil, CRM de leads, anuncios, organización y RRHH |
| **Avanzado** ⭐ | hasta 3 | **149 €** | **1.490 €** | Todo Esencial + salud y Semáforo de Aptitud + Session Brief/Debrief, motor de retención, feedback de dirección, BI avanzado, exportaciones y auditoría |
| **Élite** | ilimitados | **279 €** | **2.790 €** | Todo Avanzado + IA de programación de rutinas y soporte prioritario |
| **Fundador (lifetime)** | hasta 3 | — | **3.990 € pago único** | Funcionalidad de **Avanzado**, a perpetuidad, con actualizaciones incluidas. **Sin IA** (§1.3) |

**Qué va en cada tier y por qué:**

- **Esencial** es el tier "me too": hace lo que hace cualquier competidor. Su función es entrar por
  precio y que el gimnasio meta sus datos. No lleva ningún diferenciador.
- **Avanzado** lleva **todo lo que hace a Apta distinta** (G.1 Session Loop, G.2 Semáforo de
  Aptitud, G.3 motor de retención, contraste cliente⟷entrenador, BI). Es el tier al que queremos
  llevar a todo el mundo y el que se marca como recomendado en `/planes`.
- **Élite** solo añade lo que tiene **coste marginal real para nosotros** (IA = tokens de LLM) más
  el sinfín de centros.

**Matiz importante de producto:** el **registro** de datos de salud, los consentimientos y su
auditoría RGPD están en **todos los tiers** — son obligación legal, no funcionalidad premium. Lo
que se gatea es la **inteligencia** construida encima (Semáforo automático, Session Brief,
retención, BI). Un gimnasio en Esencial puede guardar y consultar una lesión; lo que no tiene es el
motor que decide qué hacer con ella.

### 1.2 Precios de Stripe: fuera del código

Los `price_…` de Stripe **no se escriben en el código**: cambian entre test y live y son
configuración de entorno. El catálogo (`src/lib/platform-plans.ts`) declara el **nombre de la
variable de entorno**; el precio real se resuelve en ejecución. Un plan sin precio configurado
simplemente no se ofrece.

### 1.3 Forma del lifetime (D-8)

**«Fundador»: oferta de lanzamiento limitada, no producto de catálogo permanente.**

- **Alcance:** funcionalidad de Avanzado, hasta 3 centros, actualizaciones incluidas de por vida.
- **Sin IA a propósito.** La IA es el único módulo con coste variable por uso; regalarla a
  perpetuidad por un pago único es la forma conocida de que una oferta lifetime envejezca mal.
  Un cliente Fundador que quiera IA sube a Élite pagando la diferencia recurrente.
- **Limitada:** ventana temporal y número de unidades. Se controla con
  `PLATFORM_PLAN_FUNDADOR_ENABLED` y un tope `PLATFORM_PLAN_FUNDADOR_MAX_SEATS`; agotado el cupo,
  el plan desaparece de `/planes` sin tocar código.
- **Precio:** 3.990 € ≈ 2,7 años de Avanzado anual. Por debajo de ~2,5 años la oferta destruye
  ingreso recurrente en vez de adelantarlo.
- En base de datos: `platformStatus = ACTIVE` permanente, `currentPeriodEnd = null`, sin dunning.

---

## 2. Inventario de deprecaciones

Código que este plan **elimina**. No se comenta ni se deja "por si acaso": se borra, y el commit
que lo borra explica por qué.

| # | Qué se va | Por qué | Fase |
|---|---|---|---|
| DEP-1 | `react-big-calendar` + `@types/react-big-calendar` (dependencias) | Instaladas y **sin un solo import**; la agenda usa un calendario propio | F0 |
| DEP-2 | `@auth/prisma-adapter` (dependencia) | La estrategia de sesión es JWT; el adapter no se usa en ningún sitio | F0 |
| DEP-3 | `src/app/signup/**` y `src/app/register/**` | El alta pasa a ser pago-primero: la organización nace del webhook, no de un formulario | F3 |
| DEP-4 | `createOwnerAccount()` en `src/lib/invitations.ts` | Sustituida por `provisionOrganization()`, que crea org + identidad + invitación de activación en una transacción | F3 |
| DEP-5 | `runStalePendingOrgPurgeRule()` + `PLATFORM_PENDING_TTL_DAYS` | Sin alta previa al pago no existen organizaciones pre-cliente que purgar. Mantenerla sería un borrado automático de datos sin caso de uso: un riesgo, no una función | F3 |
| DEP-6 | `PlatformFeature.multicentro` | El multicentro deja de ser un interruptor y pasa a ser un **límite numérico** (`maxCenters`) | F2 |
| DEP-7 | `User.passwordHash`, `User.authProvider`, `User.emailVerifiedAt` | Se mueven a `Identity`: son atributos de la credencial, no de la membresía | F1 |
| DEP-8 | `orgHasFeature()` en `platform-plans.ts` | Se traslada a `src/lib/entitlements.ts`. El catálogo son **datos**; los permisos son **política**. Separarlos es la razón de existir de ambos módulos (SRP) | F2 |

**Deriva documental que se corrige (F0):** `docs/PLATAFORMA_COBRO_SMTP_STRIPE_CONNECT_IMPLEMENTACION.md`
describe el alta cuenta-primero (D-3) que este plan invierte. **No se borra** (contiene las
decisiones vigentes de los dos planos de cobro y de Connect): se le añade una nota de cabecera que
remite aquí para las partes A.2/A.3/A.6.

---

## 3. Arquitectura objetivo: módulos y responsabilidades

Cada módulo tiene **una** razón para cambiar (SRP). Las rutas y las server actions **nunca** hablan
con el SDK de Stripe ni con Prisma para lógica de dominio: dependen de estos servicios (DIP).

```
src/lib/
  identity.ts        [F1] credencial: resolver por email, verificar contraseña, crear/enlazar
  platform-plans.ts  [F2] CATÁLOGO (datos puros, sin lógica): tiers, límites, features, env de precios
  entitlements.ts    [F2] POLÍTICA: ¿esta org está operativa? ¿tiene esta feature? ¿le cabe otro centro?
  platform-billing.ts[F2] PASARELA plano 1 (Apta→gimnasio): checkout de licencia
  provisioning.ts    [F3] ALTA: webhook de pago → organización + owner + invitación (idempotente)
  stripe.ts           ⟳   cliente: uno de plataforma, uno por cuenta conectada (ya existe)
  member-billing.ts  [F5] PASARELA plano 2 (gimnasio→socio): precios, suscripciones, portal
  stripe-checkout.ts  ⟳   se adelgaza: pasa a delegar en member-billing
  setup-checklist.ts [F4] estado de puesta en marcha derivado (sin campo persistido)
```

**Reglas estructurales:**

- **OCP** — añadir un tier o cambiar qué desbloquea es editar `platform-plans.ts`. Checkout,
  webhook y gating no se tocan nunca por un cambio de catálogo.
- **DIP** — solo `src/lib/*` importa el SDK de `stripe`. Rutas, páginas y actions importan servicios
  de dominio.
- **Idempotencia** — todo manejador de webhook es reejecutable sin efecto adicional. Se consigue con
  claves únicas en base de datos (`provisioningSessionId`, `stripeCheckoutSessionId`,
  `platformStripeSubscriptionId`), no con banderas en memoria.
- **Un único punto de decisión por regla.** ¿Está operativa la org? `isPlatformOperational()`, en un
  sitio. ¿Tiene esta feature? `orgHasFeature()`, en un sitio. Nunca comparar `platformStatus` a mano
  en una página.

---

# FASES

---

## F0 — Desatasco y limpieza

**Objetivo:** dejar el alta alcanzable y el árbol sin ruido. Sin dependencias. ~30 min.

**Ficheros a leer:** `src/proxy.ts`, `package.json`.

### Cambios

1. **`src/proxy.ts:12`** — `PUBLIC_PATHS` pasa a:
   ```ts
   const PUBLIC_PATHS = [
     "/login", "/onboarding", "/lead-form", "/planes", "/activar",
     "/verificar-email", "/recuperar-clave", "/servicio-no-disponible",
     "/api/jobs", "/api/stripe", "/api/checkout",
   ];
   ```
   `/register` sale (se borra en F3); `/signup` no entra (nunca llega a existir públicamente).
   El comentario existente sobre `"/lead-form"` vs `"/leads"` se mantiene.

2. **DEP-1 / DEP-2** — desinstalar:
   ```bash
   npm uninstall react-big-calendar @types/react-big-calendar @auth/prisma-adapter
   ```
   Verificar antes con `Grep` que no hay imports (a día de hoy no los hay).

3. **`src/app/api/jobs/run/route.ts`** — el endpoint queda **abierto** si `JOBS_CRON_SECRET` no está
   definido (`if (secret && …)`). Invertir: **sin secreto configurado, responder 503**. Un cron
   público es una superficie de ataque gratuita.

4. **Nota de cabecera** en `docs/PLATAFORMA_COBRO_SMTP_STRIPE_CONNECT_IMPLEMENTACION.md` remitiendo
   a este plan para A.2/A.3/A.6 (alta y purga).

### Aceptación

- `npx tsc --noEmit` y `npm run lint` limpios.
- `npm run build` compila sin las tres dependencias.

**Commit:** `Desatasca el alta pública y elimina dependencias sin uso`

---

## F1 — Identidad separada de la membresía

**Objetivo:** un email = una credencial global; una persona = N membresías. Es la fase estructural:
hacerla ahora cuesta días, hacerla con clientes en producción cuesta una parada de servicio.

**Ficheros a leer:** `src/auth.config.ts`, `src/auth.ts`, `src/lib/invitations.ts`,
`src/app/onboarding/[token]/actions.ts`, `src/app/login/page.tsx`,
`src/app/api/mobile/v1/auth/login/route.ts`, `src/lib/email-verification.ts`,
`src/app/(app)/user-menu.tsx`, `src/app/(app)/organization/actions.ts` (solo la función
`createStaff*`, ~línea 95-130). De `prisma/schema.prisma`, **solo** líneas 128-217 (`Role`, `User`,
`Invitation`).

### F1.1 Modelo

```prisma
/// Credencial de acceso: única GLOBAL. Separada de la membresía (User) para
/// que una misma persona pueda pertenecer a varias organizaciones —o ser
/// staff y socia a la vez— sin colisionar por email (RB-ID-001).
model Identity {
  id              String    @id @default(cuid())
  email           String    @unique
  passwordHash    String
  emailVerifiedAt DateTime?
  authProvider    String    @default("password") // "password" | "microsoft-entra-id" | "google"
  createdAt       DateTime  @default(now())

  memberships User[]
}

model User {
  // ... campos actuales MENOS passwordHash / authProvider / emailVerifiedAt (DEP-7)
  identityId String
  identity   Identity @relation(fields: [identityId], references: [id], onDelete: Cascade)

  @@unique([orgId, email]) // sustituye al @unique global de email
  @@index([identityId])
  @@index([orgId])
}
```

### F1.2 Migración con datos

Crear `prisma/migrations/<timestamp>_identity_membership/migration.sql` a mano (hay backfill: no
vale `migrate dev` a secas). El truco de reutilizar `User.id` como `Identity.id` hace el backfill
trivial y sin tabla de correspondencia:

```sql
CREATE TABLE "Identity" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "emailVerifiedAt" TIMESTAMP(3),
  "authProvider" TEXT NOT NULL DEFAULT 'password',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Identity_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Identity_email_key" ON "Identity"("email");

-- Hoy User.email ya es único global: el backfill 1:1 no puede colisionar.
INSERT INTO "Identity" ("id","email","passwordHash","emailVerifiedAt","authProvider","createdAt")
SELECT "id","email","passwordHash","emailVerifiedAt",
       CASE WHEN "authProvider" = 'demo' THEN 'password' ELSE "authProvider" END,
       "createdAt"
FROM "User";

ALTER TABLE "User" ADD COLUMN "identityId" TEXT;
UPDATE "User" SET "identityId" = "id";
ALTER TABLE "User" ALTER COLUMN "identityId" SET NOT NULL;
ALTER TABLE "User" ADD CONSTRAINT "User_identityId_fkey"
  FOREIGN KEY ("identityId") REFERENCES "Identity"("id") ON DELETE CASCADE;

DROP INDEX "User_email_key";
CREATE UNIQUE INDEX "User_orgId_email_key" ON "User"("orgId","email");
CREATE INDEX "User_identityId_idx" ON "User"("identityId");

ALTER TABLE "User" DROP COLUMN "passwordHash";
ALTER TABLE "User" DROP COLUMN "emailVerifiedAt";
ALTER TABLE "User" DROP COLUMN "authProvider";
```

### F1.3 `src/lib/identity.ts` (nuevo)

Único módulo que sabe de contraseñas. Nadie más llama a `bcrypt`.

```ts
export type Membership = { userId: string; orgId: string; orgName: string;
                           orgLogoUrl: string | null; role: Role; centerId: string | null };

/** Credenciales válidas → membresías de esa identidad. Error genérico si no (no filtrar si el email existe). */
export async function authenticate(email: string, password: string):
  Promise<{ ok: true; identityId: string; memberships: Membership[] } | { ok: false }>;

/** Crea la identidad o devuelve la existente. Usar SIEMPRE dentro de transacción al dar de alta gente. */
export async function ensureIdentity(tx: Tx, params: { email: string; passwordHash?: string }): Promise<Identity>;

export async function setPassword(identityId: string, plain: string): Promise<void>;
export async function membershipsFor(identityId: string): Promise<Membership[]>;
/** ¿Esta identidad tiene membresía en esta org? Guarda del conmutador (RB-ID-004). */
export async function membershipIn(identityId: string, orgId: string): Promise<Membership | null>;
```

Constante compartida: `const BCRYPT_ROUNDS = 10`.

**Identidad sin contraseña:** al invitar a alguien nuevo, `ensureIdentity` crea la fila con un hash
aleatorio inutilizable (patrón `unusablePasswordHash` que ya existe en `invitations.ts`; moverlo
aquí). La contraseña real se fija al canjear la invitación.

### F1.4 Login

**`src/auth.config.ts`** — `authorize` acepta un tercer campo `orgId` (opcional):

```ts
async authorize(credentials) {
  const { email, password, orgId } = credentials as {...};
  if (!email || !password) return null;
  const result = await authenticate(email, password);
  if (!result.ok) return null;
  const chosen = orgId
    ? result.memberships.find((m) => m.orgId === orgId)
    : result.memberships.length === 1 ? result.memberships[0] : null;
  if (!chosen) return null;                        // ambiguo sin elección explícita → no se adivina
  return { id: chosen.userId, name, email, image, role: chosen.role,
           orgId: chosen.orgId, centerId: chosen.centerId, identityId: result.identityId };
}
```

**Callback `jwt`** — añadir `identityId` y soportar el cambio de organización:

```ts
async jwt({ token, user, trigger, session }) {
  if (user) { /* … + token.identityId = user.identityId */ }
  // RB-ID-004: cambiar de organización re-emite el token contra una membresía VERIFICADA en servidor.
  if (trigger === "update" && typeof session?.orgId === "string") {
    const m = await membershipIn(token.identityId as string, session.orgId);
    if (m) { token.sub = m.userId; token.orgId = m.orgId; token.role = m.role; token.centerId = m.centerId; }
  }
  return token;
}
```
El `session` callback expone `identityId` igual que hoy expone `orgId`. Ampliar la declaración de
tipos de `next-auth` donde ya se amplía `role`/`orgId`.

**`src/app/login/page.tsx`** — dos pasos, sin pantalla intermedia salvo que haga falta:

1. Server action `resolveLoginTargets(email, password)` → `{ ok: true; orgs: [{id,name,logoUrl}] }`
   o `{ ok: false }` **genérico** (no revelar si el email existe: sería un oráculo de cuentas).
2. Si `orgs.length === 1` → `signIn("demo", { email, password, orgId })` directo. **El 99 % de los
   usuarios no ve ningún cambio.**
3. Si `orgs.length > 1` → selector con nombre y logo de cada organización → `signIn` con el elegido.

**`src/app/(app)/user-menu.tsx`** — conmutador de organización **solo si hay más de una** membresía
(D-11: sin UI de "grupo", solo este selector discreto). Llama a `update({ orgId })` de
`next-auth/react` y refresca.

### F1.5 Recuperación de contraseña (nuevo, imprescindible)

Con login global y cientos de socios, "he olvidado la contraseña" es la primera incidencia de
soporte que va a llegar y **hoy no tiene solución en producto**. Se resuelve aquí porque es el mismo
código.

- Reutilizar el patrón HMAC de `src/lib/email-verification.ts` (token firmado con `AUTH_SECRET`,
  sin tabla nueva), con `exp` de 1 hora y un `purpose: "reset"` dentro de la firma para que un token
  de verificación no sirva de reset.
- Rutas: `/recuperar-clave` (pide email) y `/recuperar-clave/[token]` (fija contraseña).
- **Respuesta siempre idéntica** exista o no el email ("si hay una cuenta, te hemos enviado un
  enlace"): mismo motivo que en F1.4.
- Plantilla `renderPasswordResetEmail` en `src/lib/emails/templates.ts`, reutilizando el `shell`.

### F1.6 Puntos de creación de usuario a migrar

Son cinco, todos conocidos:

| Punto | Cambio |
|---|---|
| `src/lib/invitations.ts:50` `createOwnerAccount` | Se borra en F3 (DEP-4). Aquí solo adaptarla a `identityId` |
| `src/lib/invitations.ts:69` `createStaffWithInvitation` | `ensureIdentity` → `user.create({ identityId })`. **Si la identidad ya existe, no falla**: se le añade membresía |
| `src/app/onboarding/[token]/actions.ts:65` (socio) | Igual. Si la identidad ya tenía contraseña, el formulario **no la pide**: solo consentimientos |
| `prisma/seed.ts:297` (`createMany`) y `:572` | Crear `Identity` antes; el seed usa `demo1234` para todas |
| `src/app/api/mobile/v1/auth/login/route.ts:20` | `authenticate()`; si hay varias membresías, `409` con la lista para que la app pregunte |

### Aceptación (F1)

- `npm run db:seed` reconstruye sin errores; los usuarios demo entran con `demo1234`.
- Un email con **una** membresía entra directo, sin selector.
- Crear manualmente una segunda membresía para el mismo email → al entrar aparece el selector, y el
  conmutador del menú cambia de organización **sin volver a pedir contraseña**.
- Invitar como socio de la organización B un email que ya es socio en la A: **el alta no falla** y
  el canje no vuelve a pedir contraseña.
- Reset de contraseña completo de extremo a extremo (con SMTP vacío, leyendo el enlace del log).
- E2E nuevo `e2e/login-identidad.spec.ts`: login simple, login ambiguo con selector, reset.

**Commit:** `Separa la credencial (Identity) de la membresía en organización`

---

## F2 — Catálogo comercial y permisos por plan

**Objetivo:** que exista algo que vender y un único punto donde se decide qué desbloquea.

**Ficheros a leer:** `src/lib/platform-plans.ts`, `src/lib/guard.ts`, `src/app/(app)/layout.tsx`,
`src/lib/rbac.ts` (solo `NAV_BY_ROLE`, líneas 1-120), `.env.example`.

### F2.1 `src/lib/platform-plans.ts` — solo datos

```ts
export type PlatformFeature =
  | "salud_aptitud"       // HealthRecord avanzado, Semáforo, Session Brief/Debrief
  | "retencion"           // motor de retención y alertas
  | "feedback_direccion"  // contraste cliente ⟷ entrenador
  | "bi_avanzado"         // panel de control completo
  | "exportaciones"       // exportar datos y auditoría avanzada
  | "ia_programacion";    // rutinas por IA (único módulo con coste marginal real)

export type PlatformPlan = {
  code: "esencial_mes" | "esencial_ano" | "avanzado_mes" | "avanzado_ano"
      | "elite_mes" | "elite_ano" | "fundador";
  tier: "esencial" | "avanzado" | "elite" | "fundador";
  name: string;
  interval: "month" | "year" | "lifetime";
  priceLabel: string;          // solo presentación; la verdad del importe está en Stripe
  maxCenters: number | null;   // null = sin límite (DEP-6: sustituye a la feature "multicentro")
  features: PlatformFeature[];
  priceEnvVar: string;         // §1.2 — el price_… nunca vive en el código
  recommended?: boolean;
};
```

Catálogo exacto (§1.1). Las features de Avanzado son
`["salud_aptitud","retencion","feedback_direccion","bi_avanzado","exportaciones"]`; Élite añade
`"ia_programacion"`; **Fundador = las de Avanzado** (sin IA, §1.3); Esencial `[]`.

Helpers de catálogo (puros, sin Prisma, sin IO):
`getPlatformPlan(code)`, `listPurchasablePlans()` (excluye los que no tienen precio resuelto en
entorno, y excluye Fundador si `PLATFORM_PLAN_FUNDADOR_ENABLED !== "true"`),
`resolveStripePriceId(plan)`.

### F2.2 `src/lib/entitlements.ts` (nuevo) — solo política

```ts
export function isPlatformOperational(status: PlatformStatus): boolean;   // ACTIVE | TRIALING
export function orgHasFeature(org: OrgEntitlementFields, f: PlatformFeature): boolean;
export function centerLimitFor(org: OrgEntitlementFields): number | null;
export async function canAddCenter(orgId: string): Promise<{ ok: true } | { ok: false; error: string }>;
/** Guarda de página: exige sesión + org operativa + feature. Redirige a /planes?feature=… si falta. */
export async function requireFeature(f: PlatformFeature): Promise<Session>;
```

`OrgEntitlementFields = Pick<Organization, "platformPlan" | "platformStatus">` — la firma mínima
(ISP): quien llame no necesita cargar la organización entera.

`orgHasFeature` sale de `platform-plans.ts` (DEP-8). `requirePlatformActive` en `guard.ts` pasa a
delegar en `isPlatformOperational` en vez de comparar estados a mano; igual el `layout.tsx` de
`(app)`. **Una regla, un sitio.**

### F2.3 Aplicar el gating

Dos puntos, no más:

1. **Navegación** — `src/lib/rbac.ts`: cada `NavItem` admite `feature?: PlatformFeature`. El
   sidebar filtra por `orgHasFeature`. Lo no contratado **no se enseña**.
   Mapa: `/health/*` y `/brief` → `salud_aptitud`; `/retention` → `retencion`; `/feedback` →
   `feedback_direccion`; `/dashboard` → `bi_avanzado`; `/audit` → `exportaciones`.
2. **Página** — cada ruta gateada empieza con `await requireFeature("…")`. Sin esto, la URL directa
   se salta el filtro del menú.

**Regla explícita:** el gating **nunca** oculta datos ya guardados por el gimnasio ni bloquea la
exportación de sus propios datos. Bajar de tier deja de mostrar analítica; no secuestra información.

### F2.4 Página pública `/planes`

Server component público que renderiza `listPurchasablePlans()`. Conmutador mes/año, Avanzado
marcado como recomendado, Fundador con su aviso de oferta limitada, y una tabla comparativa
derivada de `features` (nada escrito a mano: si se añade un tier, la tabla se actualiza sola).
El CTA apunta a `/api/checkout` (F3). Si no hay precios configurados, la página lo dice con
franqueza en vez de mostrar botones muertos.

### F2.5 `.env.example`

```bash
STRIPE_PRICE_ESENCIAL_MES=""
STRIPE_PRICE_ESENCIAL_ANO=""
STRIPE_PRICE_AVANZADO_MES=""
STRIPE_PRICE_AVANZADO_ANO=""
STRIPE_PRICE_ELITE_MES=""
STRIPE_PRICE_ELITE_ANO=""
STRIPE_PRICE_FUNDADOR=""
PLATFORM_PLAN_FUNDADOR_ENABLED="false"
PLATFORM_PLAN_FUNDADOR_MAX_SEATS="25"
```
Retirar `PLATFORM_PENDING_TTL_DAYS` (DEP-5, se consuma en F3).

### Aceptación (F2)

- `/planes` accesible sin sesión y coherente con o sin precios configurados.
- Con el seed (`platformPlan` nulo) nada premium aparece en el menú; asignando `avanzado_ano` a la
  organización, aparece salud, retención, feedback, panel y auditoría, y no aparece IA.
- Entrar por URL directa a `/retention` sin la feature redirige a `/planes?feature=retencion`.
- **El seed pone `platformPlan: "elite_ano"`** a las dos organizaciones demo, para que la demo siga
  enseñando el producto completo.

**Commit:** `Define el catálogo comercial y el gating por plan contratado`

---

## F3 — Alta pago-primero: checkout público y activación por email

**Objetivo:** el recorrido real — landing → Stripe → email de bienvenida → contraseña → puesta en
marcha — sin ningún formulario nuestro antes de pagar.

**Ficheros a leer:** `src/lib/platform-billing.ts`, `src/app/api/stripe/webhook/route.ts`,
`src/app/activar/page.tsx`, `src/app/activar/actions.ts`, `src/lib/invitations.ts`,
`src/lib/emails/templates.ts`, `src/app/onboarding/[token]/page.tsx`.

### F3.1 Modelo

```prisma
model Organization {
  // ...
  /// Idempotencia del alta (RB-ALTA-001): la sesión de checkout que dio origen a esta
  /// organización. Un reenvío del webhook encuentra la fila y no crea una segunda.
  provisioningSessionId String? @unique
}

enum InvitationType {
  STAFF
  MEMBER
  OWNER   // activación del director tras el pago
}
```

> Postgres permite `ALTER TYPE … ADD VALUE` dentro de la migración, pero el valor nuevo no puede
> usarse en esa misma transacción. Como aquí solo se declara y se usa en ejecución, no hay problema.

### F3.2 Checkout público

`src/app/api/checkout/route.ts` (POST, público, sin sesión):

- Valida `planCode` con `zod` contra `listPurchasablePlans()`. Plan desconocido o no comprable → 400.
- Delega en `createLicenseCheckoutSession(planCode)` de `platform-billing.ts`:
  - `mode: plan.interval === "lifetime" ? "payment" : "subscription"`.
  - `customer_creation: "always"`, `tax_id_collection: { enabled: true }`,
    `billing_address_collection: "required"` — **los datos fiscales los recoge Stripe**, no nosotros
    (D-12: no facturamos, solo necesitamos que Stripe pueda emitir su recibo).
  - `metadata: { planCode }`. **Sin `orgId`**: la organización todavía no existe. Es lo que
    distingue el alta de una renovación.
  - `success_url: /activar?session_id={CHECKOUT_SESSION_ID}`, `cancel_url: /planes?checkout=cancelado`.
- Si Stripe no está configurado, 503 con mensaje claro (degradación elegante).
- **Cupo de Fundador:** antes de crear la sesión, si el plan es `fundador`, contar organizaciones con
  ese `platformPlan` y rechazar si se alcanzó `PLATFORM_PLAN_FUNDADOR_MAX_SEATS`.

### F3.3 `src/lib/provisioning.ts` (nuevo)

```ts
/** RB-ALTA-001: crea la organización operativa a partir de un pago confirmado. Idempotente. */
export async function provisionOrganizationFromCheckout(session: Stripe.Checkout.Session):
  Promise<{ created: boolean; orgId: string }>;
```

Algoritmo:

1. `findUnique({ provisioningSessionId: session.id })` → si existe, `{ created: false }`. **Sin
   efectos secundarios: ni un email de más.**
2. Email del comprador: `customer_details.email`. Sin email → registrar y salir (no se puede
   activar a nadie; el pago se resuelve por soporte).
3. **Si ese email ya tiene una membresía OWNER en una organización existente** → no se crea otra
   (RB-ALTA-003): se actualiza esa organización (plan, suscripción, `ACTIVE`) y se avisa por email.
4. En una `$transaction`:
   - `Organization` con `platformStatus: "ACTIVE"`, `platformPlan`, ids de Stripe,
     `currentPeriodEnd` (null si lifetime), `provisioningSessionId`, `billingEmail`, `billingName` y
     `taxId` de `customer_details`, y `slug` único derivado del nombre fiscal (o del email).
   - `ensureIdentity` (sin contraseña utilizable) + `User` OWNER.
   - `Invitation` tipo `OWNER`, caducidad **14 días** (más holgada que los 7 del staff: es el único
     camino de acceso del comprador).
5. Fuera de la transacción, best-effort: email de bienvenida `renderWelcomeOwnerEmail` con el enlace
   de activación. Un fallo de SMTP **no** revierte el alta — para eso está el reenvío de F3.4.

### F3.4 `/activar` reescrita

Pública y con tres modos:

- **`?session_id=…` sin sesión** (vuelta de Stripe): confirma el pago, muestra a qué email se ha
  enviado el enlace y ofrece **reenviarlo**. Si el webhook aún no ha llegado, muestra "estamos
  confirmando tu pago" y reintenta — `RB-ALTA-002: el comprador nunca se queda ante un "revisa tu
  correo" sin salida`.
- **Con sesión y organización no operativa** (`PAST_DUE`, `SUSPENDED`, `CANCELLED`): estado y
  recuperación. Para `PAST_DUE`/`SUSPENDED` el CTA correcto es el **Billing Portal de la cuenta de
  Apta** (`stripe.billingPortal.sessions.create` sobre `platformStripeCustomerId`) para que
  actualicen la tarjeta: cero UI nuestra y arreglan el impago solos.
- **Con sesión y organización operativa** → `redirect("/puesta-en-marcha")`.

Se conserva el reenvío de verificación de email ya existente.

### F3.5 Canje de la invitación OWNER

`/onboarding/[token]` gana la rama `OWNER`: pide contraseña (y solo eso), llama a `setPassword`,
marca la invitación usada, hace `signIn` y redirige a **`/puesta-en-marcha`**. Reutiliza el
componente de la rama `STAFF`; no duplicar formulario.

### F3.6 Webhook: rutar el alta

En `handlePlatformEvent`, `checkout.session.completed`:

```ts
const orgId = session.metadata?.orgId;
if (!orgId) await provisionOrganizationFromCheckout(session);  // alta nueva
else        await applyPlanChange(orgId, session);             // renovación / cambio de plan
```
El resto de manejadores (`invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`)
se mantienen tal cual: ya son correctos e idempotentes.

### F3.7 Deprecaciones de esta fase

Borrar `src/app/signup/**`, `src/app/register/**` (DEP-3), `createOwnerAccount` (DEP-4),
`runStalePendingOrgPurgeRule` + su llamada en `src/app/api/jobs/run/route.ts` + la variable de
entorno (DEP-5). Actualizar el enlace del login: "Registrar organización →" pasa a apuntar a
`/planes` con el texto **"Ver planes →"**.

### Aceptación (F3)

- Con Stripe en modo test y el CLI reenviando eventos: comprar en `/planes` → llega el email → el
  enlace fija contraseña → aterriza en `/puesta-en-marcha` con la organización `ACTIVE`.
- **Reenviar el mismo evento dos veces no crea una segunda organización ni un segundo email.**
- `success_url` antes de que llegue el webhook muestra el estado de espera y se resuelve solo.
- Comprar con un email que ya es OWNER actualiza el plan de su organización, no duplica.
- E2E `e2e/alta-comercial.spec.ts` con el webhook simulado (POST firmado), sin depender de la red.

**Commit:** `Invierte el alta a pago-primero con activación por email`

---

## F4 — Productos del gimnasio y puesta en marcha

**Objetivo:** que el gimnasio pueda dar de alta lo que vende. Es prerrequisito duro de F5.

**Ficheros a leer:** `src/lib/members-queries.ts` (solo `listMembershipPlans`, ~línea 186),
`src/app/(app)/organization/actions.ts`, `src/app/(app)/organization/page.tsx`.

### F4.1 CRUD de `MembershipPlan`

Sección **Productos** dentro de `/organization` (no una ruta nueva: es configuración de la
organización). Rol `OWNER` y `CENTER_DIRECTOR`.

- **Crear / editar:** nombre, tipo (`PlanType`), precio, sesiones incluidas, validez.
- **Archivar, nunca borrar:** `active = false`. Un plan tiene `Subscription` colgando; borrarlo
  rompería el histórico de cobros. Los archivados desaparecen de los selectores de venta y siguen
  visibles en el histórico.
- **El precio de un plan con suscripciones vivas no se edita en caliente:** editar el importe crea
  la necesidad de un precio nuevo en Stripe (F5) y las suscripciones vigentes conservan el anterior
  (`RB-VENTA-002`). En esta fase basta con avisarlo en la UI.
- `zod` para la validación; precio en céntimos, entero, `> 0`.

### F4.2 Límite de centros

`createCenter` (`organization/actions.ts:50`) empieza con `canAddCenter(orgId)`. Al alcanzar el
límite del plan, el mensaje es concreto y ofrece la salida: *"Tu plan Avanzado incluye 3 centros.
Para añadir más, cambia a Élite."* con enlace a `/planes`.

### F4.3 Checklist de puesta en marcha

`src/lib/setup-checklist.ts` — **estado derivado, nunca persistido** (un `setupStep` en base de
datos se desincroniza el primer día):

```ts
export type SetupStep = { id: string; label: string; done: boolean; href: string; blocking: boolean };
export async function getSetupChecklist(orgId: string): Promise<SetupStep[]>;
```

Pasos: datos fiscales · **primer centro** (`blocking`) · productos · equipo · socios · conectar
Stripe · logo. `done` sale de contar filas.

Ruta `/puesta-en-marcha` dentro de `(app)`, con progreso. En el dashboard, un aviso discreto
mientras queden pasos, **descartable** y que desaparece solo al completarse. **Nada bloquea la
navegación**: se entra a la app desde el minuto uno.

### Aceptación (F4)

- Crear, editar y archivar un plan; el archivado desaparece de los selectores de venta y el
  histórico de cobros que lo referencia sigue intacto.
- Con `platformPlan = "esencial_mes"` (1 centro), crear el segundo centro se rechaza con el mensaje
  y el enlace.
- La checklist refleja el estado real y se completa sola al ir dando de alta cosas.
- E2E `e2e/productos-y-setup.spec.ts`.

**Commit:** `Añade gestión de productos y checklist de puesta en marcha`

---

## F5 — Cobro recurrente del gimnasio a sus socios

**Objetivo:** que la suscripción del socio se cobre de verdad cada mes. Hoy el checkout es
`mode: "payment"`: cobra una vez y **nadie cobra el mes siguiente**.

**Ficheros a leer:** `src/lib/stripe.ts`, `src/lib/stripe-checkout.ts`,
`src/app/api/stripe/webhook/route.ts`, `src/lib/stripe-connect.ts`,
`src/app/(app)/billing/subscription-actions.ts`. De `schema.prisma`, **solo** líneas 455-517
(`MembershipPlan`, `Subscription`) y 670-726 (`Payment`).

### F5.1 Modelo

```prisma
model MembershipPlan {
  // ...
  /// Producto/precio espejo en la cuenta CONECTADA del gimnasio. Los precios de Stripe son
  /// inmutables: cambiar el importe crea uno nuevo y las suscripciones vivas conservan el
  /// anterior (RB-VENTA-002). `stripeAccountId` permite invalidar todo si el gimnasio
  /// reconecta otra cuenta.
  stripeProductId String?
  stripePriceId   String?
  stripeAccountId String?
}

model Member {
  // stripeCustomerId ya existe; se le añade la cuenta en la que vive
  stripeAccountId String?
}

model Subscription {
  // ...
  stripeSubscriptionId String? @unique
}
```

### F5.2 `src/lib/member-billing.ts` (nuevo)

Concentra el plano 2. `stripe-checkout.ts` se adelgaza y pasa a delegar aquí (conservando sus
exports actuales para no tocar los call sites: cambio interno, no de interfaz).

```ts
/** Crea/recupera producto y precio en la cuenta conectada. Recrea si cambió el importe o la cuenta. */
export async function ensureStripePrice(orgId: string, planId: string):
  Promise<{ ok: true; priceId: string } | { ok: false; error: string }>;

/** Recurrente (MONTHLY, ONLINE) → mode "subscription"; puntual (SESSION_PACK, DROP_IN, …) → "payment". */
export function isRecurring(type: PlanType): boolean;

export async function createMemberCheckout(params: {
  orgId: string; memberId: string; planId: string; soldByUserId?: string;
  origin: "staff" | "portal";
}): Promise<CheckoutResult>;

/** Autoservicio del socio: tarjeta, historial y baja, en la cuenta del gimnasio (F6). */
export async function createMemberBillingPortalSession(orgId: string, memberId: string):
  Promise<{ ok: true; url: string } | { ok: false; error: string }>;
```

**`ensureStripePrice`** es idempotente y perezoso: si `stripePriceId` existe, `stripeAccountId`
coincide con la cuenta actual y el importe del precio remoto es el mismo, lo devuelve; si no, crea
producto y/o precio nuevos y actualiza el plan. Nunca borra el precio anterior (hay suscripciones
vivas colgando).

**Cliente de Stripe del socio:** `Member.stripeCustomerId` se crea en la cuenta conectada la primera
vez y se guarda junto a `stripeAccountId`. Si el gimnasio reconecta otra cuenta, ambos se invalidan
(`refreshStripeAccountStatus` en `stripe-connect.ts` es el sitio: si el `accountId` cambia, limpiar
los espejos de planes y socios de esa organización).

### F5.3 Webhook de cuenta conectada

Ampliar `handleConnectEvent` (hoy solo `checkout.session.*` y `account.updated`). Resolver siempre
`orgId` desde `StripeAccount.accountId = event.account` y **acotar toda escritura a esa
organización** — es la frontera de aislamiento del plano 2.

| Evento | Efecto |
|---|---|
| `customer.subscription.created` / `.updated` | Alta o actualización de `Subscription` (fechas, estado, `stripeSubscriptionId`) |
| `customer.subscription.deleted` | `Subscription.status = CANCELLED` |
| `invoice.paid` | `Payment` `PAID` (idempotente por id de factura) + extender periodo + socio a `ACTIVE` |
| `invoice.payment_failed` | `Payment` `FAILED` + socio a `MOROSO` + notificación a recepción |

**Idempotencia:** clave única por objeto de Stripe antes de escribir, como ya hace
`reconcileStripeCheckoutCompleted`. Añadir `Payment.stripeInvoiceId String? @unique`.

### F5.4 Métodos de pago

`payment_method_types: ["card", "sepa_debit"]` para lo recurrente. **Bizum no entra en suscripciones
recurrentes** (está pensado para pagos únicos): dejarlo solo en cobros puntuales y **verificarlo
contra la documentación vigente de Stripe antes de ofrecerlo en la UI**. El valor
`PaymentMethod.BIZUM` ya existe en el enum sin flujo detrás; no prometer en la interfaz lo que no
esté comprobado.

### Aceptación (F5)

- Con una cuenta conectada de prueba: vender un plan mensual crea suscripción en Stripe y en la base
  de datos; el CLI de Stripe reenviando `invoice.paid` genera el `Payment` del periodo siguiente.
- Un `invoice.payment_failed` deja al socio moroso y notifica.
- Editar el precio de un plan con suscripciones vivas: las existentes mantienen su importe, las
  nuevas cogen el nuevo.
- Reenviar cualquier evento dos veces no duplica pagos ni suscripciones.
- Sin Stripe conectado, todas las superficies de venta degradan con explicación.

**Commit:** `Implementa el cobro recurrente del gimnasio a sus socios`

---

## F6 — Autoservicio del socio

**Objetivo:** que el socio renueve, compre y gestione su pago solo. Cierra el agujero de hoy: al
agotar el bono se le corta la reserva y se le dice que hable con recepción.

**Ficheros a leer:** `src/app/(app)/portal/agenda/actions.ts`, `src/app/(app)/portal/agenda/page.tsx`,
`src/lib/portal-queries.ts` (solo lo relativo a bono/`needsTopUp`).

### Cambios

1. **Ruta `/portal/comprar`**: catálogo de planes activos del gimnasio del socio → `createMemberCheckout`
   con `origin: "portal"`.
2. **Donde hoy se devuelve `needsTopUp`**, ofrecer el camino: *"Te quedan 0 sesiones — Recargar
   bono"* enlazando a la compra. El corte deja de ser un callejón sin salida.
3. **Gestión de pago**: botón "Gestionar mi suscripción" → `createMemberBillingPortalSession`.
   Método de pago, facturas y baja los gestiona **Stripe**. Cero UI nuestra, cero datos de tarjeta
   pasando por Apta. Es la mayor cantidad de producto por línea escrita de todo el plan.
4. **App móvil**: `POST /api/mobile/v1/portal/billing/portal` y `…/checkout` devolviendo la URL para
   abrir en navegador externo. **No** incrustar el checkout en un WebView.

### Aceptación (F6)

- Un socio con bono agotado compra desde el portal y puede reservar inmediatamente después.
- El botón de gestión abre el Billing Portal de la cuenta del gimnasio, no la de Apta.
- Sin Stripe conectado, la sección de compra no aparece y el aviso de bono agotado vuelve a remitir
  a recepción.

**Commit:** `Permite al socio comprar y gestionar su suscripción desde el portal`

---

## F7 — Marca del cliente en las comunicaciones

**Objetivo:** el socio de TrainingZone no ha comprado Apta. Sus emails deben parecer de su gimnasio.

**Ficheros a leer:** `src/lib/mailer.ts`, `src/lib/emails/templates.ts`.

### Cambios

- `sendMail` acepta `fromName` y `replyTo`. Remitente: `TrainingZone <no-reply@…>` con `Reply-To`
  del centro o de la organización.
- El `shell` de las plantillas recibe `brand: { name, logoUrl, accent }` resuelto desde la
  organización (`Organization.logoUrl`, con el de Apta como respaldo — la cascada ya existe en el
  NavBar). Pie discreto: *"con tecnología de Apta"*.
- **Los emails de plataforma** (activación, verificación, facturación de la licencia) mantienen
  marca Apta: ahí el cliente es el director. `RB-MARCA-001`.

### Aceptación (F7)

Bienvenida de socio, invitación de staff y aviso de cobro salen con nombre y logo de la organización;
activación y verificación del director, con los de Apta. Con SMTP vacío se comprueba en el log.

**Commit:** `Aplica la marca de cada organización a sus comunicaciones`

---

## F8 — Back-office de Apta (opcional, solo si sobra margen)

Ruta `/apta` para `PLATFORM_ADMIN` (el rol ya existe y hoy no tiene ninguna pantalla): listado de
organizaciones con estado, plan y centros; reenviar activación; suspender/reactivar a mano; alta
asistida (organización + invitación OWNER sin pasar por checkout, para ventas con factura o
transferencia). Es la única vía prevista para crear una organización en `PENDING_PAYMENT` tras F3.

**Toda acción deja traza en `AuditLog`.** Si se implementa suplantación de usuario para soporte,
**auditar cada entrada** y no permitirla nunca sobre datos de salud.

---

## 4. Reglas de negocio nuevas

| ID | Regla |
|---|---|
| `RB-ID-001` | La credencial (email + contraseña) es única global; la membresía (organización + rol) es múltiple. Un email nunca se rechaza por "ya existe" |
| `RB-ID-002` | Login único. Con una membresía se entra directo; con varias, selector explícito. Nunca se elige organización por el usuario |
| `RB-ID-003` | Invitar a un email que ya es identidad no pide contraseña nueva: añade membresía |
| `RB-ID-004` | La organización activa vive en el JWT y se verifica en servidor al conmutar. Toda consulta sigue filtrando por ella |
| `RB-ID-005` | Login y recuperación de contraseña responden igual exista o no el email (no son oráculo de cuentas) |
| `RB-ALTA-001` | Solo un pago confirmado por webhook crea una organización operativa. Idempotente por `provisioningSessionId` |
| `RB-ALTA-002` | Tras pagar, el comprador siempre ve estado y opción de reenviar el enlace. El email nunca es el único camino |
| `RB-ALTA-003` | Un pago con un email que ya es OWNER actualiza su organización; no crea una segunda |
| `RB-PLAN-001` | El catálogo es dato (`platform-plans.ts`); los identificadores de precio viven en el entorno, nunca en el código |
| `RB-PLAN-002` | El límite de centros es del plan y se comprueba al crear el centro, con la salida indicada |
| `RB-PLAN-003` | El gating oculta analítica, nunca datos propios del gimnasio ni su exportación |
| `RB-VENTA-001` | Todo cobro a un socio ocurre en la cuenta conectada del gimnasio |
| `RB-VENTA-002` | Cambiar el importe de un plan crea un precio nuevo; las suscripciones vivas conservan el anterior |
| `RB-VENTA-003` | La gestión de método de pago y bajas del socio se delega en el Billing Portal de Stripe. Apta no almacena datos de tarjeta |
| `RB-VENTA-004` | Sin Stripe conectado, las superficies de venta desaparecen con explicación; nunca fallan |
| `RB-VENTA-005` | **Apta no aplica comisión** sobre los cobros del gimnasio ni interviene en su contabilidad (D-9) |
| `RB-VENTA-006` | **Apta no emite facturas** (D-12). Conectar Stripe desbloquea funcionalidad interna, no facturación fiscal |
| `RB-MARCA-001` | Toda comunicación a un socio lleva la marca de su organización; solo las de plataforma llevan la de Apta |

---

## 5. Validación final (tras F7)

Antes del push final. **Con el seed recién ejecutado.**

**Estático:** `npx tsc --noEmit`, `npm run lint`, `npm run build` — los tres limpios.

**Suite e2e:** `npm run test:e2e` — las 6 specs existentes en verde **más** las nuevas
(`login-identidad`, `alta-comercial`, `productos-y-setup`).

**Recorridos manuales, por casuística:**

| Área | Casos |
|---|---|
| Identidad | login con una membresía · con varias (selector) · conmutar organización · credenciales malas (mensaje genérico) · reset completo · reset con token caducado y con token de otro propósito |
| Alta | compra de cada plan (mes/año/lifetime) · webhook duplicado · `success_url` antes del webhook · email ya OWNER · cupo de Fundador agotado · checkout cancelado |
| Activación | canje del enlace · enlace caducado · enlace ya usado · reenvío |
| Planes | organización sin plan (nada premium) · Esencial · Avanzado · Élite · Fundador (sin IA) · URL directa a ruta gateada |
| Centros | crear dentro del límite · alcanzar el límite · plan ilimitado |
| Productos | crear · editar · archivar · plan archivado fuera de los selectores y presente en el histórico |
| Cobro socio | recurrente y puntual · `invoice.paid` · `invoice.payment_failed` · cambio de importe con suscripciones vivas · evento duplicado · sin Stripe conectado |
| Portal | compra · recarga de bono agotado · Billing Portal · app móvil |
| Multi-tenant | **con dos organizaciones sembradas, comprobar que ninguna lista, panel, agenda, cobro o email cruza datos entre ellas.** Es la comprobación que no se puede omitir |
| RGPD | lectura de datos de salud deja traza en `AuditLog` · recepción sigue sin ver salud |
| Degradación | sin `STRIPE_SECRET_KEY` · sin cuenta conectada · sin SMTP: la app funciona y las superficies afectadas se explican |

**Regresión mínima:** agenda (crear sesión, reservar, check-in, debrief), leads (alta → cierre),
socios (alta, importación CSV, ficha), panel de control, app móvil (login, agenda, notificaciones).

---

## 6. Orden, dependencias y estado de credenciales

| Fase | Depende de | ¿Necesita Stripe real? |
|---|---|---|
| F0 | — | No |
| F1 | — | No |
| F2 | F1 | No (precios en test cuando existan) |
| F3 | F2 | **Sí** — cuenta de Apta + CLI de Stripe para webhooks |
| F4 | F3 | No |
| F5 | F4 | **Sí** — Connect activado + cuenta conectada de prueba |
| F6 | F5 | Sí |
| F7 | — (independiente) | No |
| F8 | F3 | No |

**F0, F1, F2, F4 y F7 se construyen y prueban sin ninguna credencial.** F3, F5 y F6 necesitan la
cuenta de Stripe de Apta con Connect activo; hasta entonces se implementan con webhooks simulados
(petición firmada al endpoint) y se dejan honestamente marcadas como pendientes de credenciales en
la interfaz, siguiendo el patrón de degradación que ya usa el repo.

---

*Fin del plan. Contiene las decisiones cerradas, el inventario de deprecaciones y el detalle de cada
fase. Cualquier duda que aparezca durante la implementación y no esté resuelta aquí se anota y se
pregunta: no se resuelve inventando producto.*
