# Paso a producción · Web app con 2 centros de una organización

> **Fecha:** 23-09-2026 · **Objetivo:** producción el **07-10-2026** (14 días naturales)
> **Alcance:** solo la web app (Next.js). La app móvil Expo (`apps/`) queda fuera; sí entran los
> endpoints `/api/mobile/*` que exponen datos, porque se despliegan con la web.
> **Punto de partida:** organización nueva, dos centros desde cero, **sin migrar socios ni
> suscripciones de Stripe** existentes. Base de datos limpia, sin seed.
> **Base:** `main` @ `59347d6`. Auditoría de solo lectura de cuatro agentes (Stripe, alta y CRM,
> agenda y reservas, infraestructura), con los hallazgos críticos verificados a mano.
> Nada de esto se ha ejecutado contra una base real: el repositorio no tenía `node_modules`.

---

## 0 · Resumen ejecutivo

| Área | Estado | Bloquea el lanzamiento |
|---|---|---|
| Alta de organización pagando (`/planes` → webhook → OWNER) | Funciona | — |
| Segundo centro, personal e imputación a centros | Funciona, con fallos menores | **Sí:** un OWNER puede hacerse `PLATFORM_ADMIN` |
| Leads en una organización nueva | **Roto:** no hay canales de origen | Sí |
| Alta de socio, ficha y consentimientos | Parcial | Sí: la valoración borra el consentimiento de imagen |
| Primera valoración (objetivos, profesión, rutina, hábitos) | Funciona | Sí: doble cierre duplica datos |
| Compra en el portal → suscripción mensual en Stripe | Funciona | **Sí:** "Renovar" crea una **segunda** suscripción |
| Renovación mensual → recarga de sesiones | **No existe** | **Sí:** desde el 2.º mes el socio tiene 0 sesiones |
| Adelantar el pago al agotar sesiones (mover la fecha de cobro) | **No existe** | Es un requisito explícito |
| Sesiones EP y de grupo, reserva, lista de espera, cancelación | Funciona en el camino del socio | **Sí:** la reserva EP del staff no descuenta el bono |
| Mover o borrar sesiones recurrentes | **Roto** | Sí: mueve o borra la serie entera y devuelve bonos pasados |
| Infraestructura de producción | Sin declarar | Sí: sin web ni BD en `render.yaml`, fotos en disco efímero, modo demo si falta Stripe |

**Estimación:** unas **50-60 tareas-hora de código**, repartidas en **12 pistas paralelas sin
ficheros compartidos** (§5). Con 9-12 sesiones de Claude Code a la vez, el código queda listo en
5 días laborables y deja una semana para regresión, correcciones y puesta en marcha.

**No hace falta tocar `prisma/schema.prisma` ni `src/lib/rbac.ts`** si se aceptan las
decisiones D1-D4 del §1. Es lo que hace viable el plazo.

---

## 1 · Decisiones de negocio (día 1, antes de escribir código)

| # | Pregunta | Recomendación | Si la respuesta es la otra |
|---|---|---|---|
| **D1** | ¿Los dos centros son de la **misma sociedad (mismo CIF)**? | Sí: una única cuenta Stripe Connect para la organización (el modelo actual) y la caja se separa por `Subscription.centerId` | Con dos CIF entra HU-ST-29 (cambio de esquema, varias semanas). **No llega a 2 semanas** |
| **D2** | ¿La ventana de cancelación es la misma en los dos centros? | Sí: una sola, servida por el servidor (`CANCELLATION_WINDOW_HOURS`, `portal-queries.ts:286`). El cliente no lleva literales | Exige una columna en `Center` → pedírselo al integrador (esquema congelado) |
| **D3** | En la renovación mensual, ¿las sesiones que sobran **se acumulan o se reinician**? | **Se reinician:** asiento `EXPIRY` (−restantes) + `PURCHASE` (+incluidas) | Acumular: solo `PURCHASE`. Es un cambio de una línea en P2 |
| **D4** | Al **adelantar el pago**, ¿se pierden los días que quedaban del periodo? | Sí: `proration_behavior: "none"`. Se cobra el mes entero y el ciclo empieza hoy. Tiene sentido porque ya no le quedan sesiones | Prorratear: `create_prorations`. Es más confuso para el socio |
| **D5** | ¿Adelanto con SEPA? | **Solo con tarjeta.** El adeudo SEPA tarda días y la actualización pendiente de Stripe caduca antes. Con SEPA se ofrece un bono puntual de recarga | — |
| **D6** | ¿Qué productos se venden como recurrentes? | Solo los de tipo `MONTHLY` u `ONLINE` son suscripción (`src/lib/plan-recurrence.ts:13`). Un "EP 8 sesiones/mes" **tiene que crearse como `MONTHLY` con `sessionsIncluded = 8`**. `PERSONAL_TRAINING`, `DUO` y `SESSION_PACK` se cobran una sola vez | Convertir un bono EP en recurrente exige tocar el esquema |
| **D7** | Hazte-socio público (`/hazte-socio`) en el lanzamiento | Desactivado o sin enlazar la primera semana: tiene 3 fallos altos (P3) | — |

---

## 2 · Calendario (14 días)

| Fecha | Qué |
|---|---|
| mié 23-09 | Decisiones D1-D7. Arranque de las 12 pistas (§5). Empieza la infraestructura de staging (P11) y los trámites sin código del §3 (DNS, Brevo, legal) |
| jue 24-09 → mar 29-09 | Pistas en paralelo. Ventana de merge diaria a las 18:00 (`docs/TRABAJO_EN_PARALELO.md`) |
| mié 30-09 | Corte de alcance. Integración completa. Despliegue en **staging** con Stripe en modo test y BD limpia |
| jue 01-10 → vie 02-10 | **Regresión completa** en staging (§4), con el spec E2E nuevo (P12) y a mano por rol |
| sáb 03-10 → lun 05-10 | Corrección de lo que salga de la regresión y segunda pasada solo de lo corregido. En paralelo, configuración de producción: Stripe live, roles de BD y variables (§3) |
| mar 06-10 | Ensayo general en producción con una organización de prueba; después se borra |
| mié 07-10 | **Go-live**: alta real de la organización y de sus dos centros. Hipercuidado de 48 h |

---

## 3 · Checklist de infraestructura y configuración (sin código)

### 3.1 Render
- [ ] Servicio **web** en `frankfurt`, plan de pago (el gratuito se duerme). Build `npm ci && npm run build`, start `npm run start`, `preDeployCommand: npx prisma migrate deploy`. Se declara en `render.yaml` (P11).
- [ ] **Postgres 16** en Frankfurt, plan de pago con backups diarios o PITR.
- [ ] **Roles de BD antes de la primera migración** (si no, el `REVOKE` de `AuditLog` de `prisma/migrations/20260906120000_costuras_servidor_q3/migration.sql:254-268` no protege nada):
  1. Crear el rol `apta_app` (no propietario) y el de mantenimiento, con DELETE sobre `AuditLog` para las purgas.
  2. `ALTER DATABASE … SET apta.app_roles = 'apta_app'`.
  3. `migrate deploy` con el propietario (`DATABASE_MIGRATION_URL`, P11).
  4. La app arranca con `DATABASE_URL` apuntando a `apta_app`.
  5. Comprobar que el plan de Render permite `CREATEROLE`.
- [ ] **Disco persistente** montado en `PROGRESS_PHOTO_DIR` (p. ej. `/var/data/progress-photos`). Si no, las fotos de progreso **se pierden en cada despliegue** (`src/lib/progress-photos.ts:34,59`). Obliga a una sola instancia; es aceptable para dos centros.
- [ ] Un servicio **staging** idéntico con su propia BD y Stripe en modo test.
- [ ] **Nunca** `npm run db:seed`, `prisma migrate dev` ni `migrate reset` contra producción: el seed vacía la base entera (`prisma/seed.ts:3251`).

### 3.2 Variables de entorno de producción
| Variable | Valor / nota |
|---|---|
| `DATABASE_URL` | Rol `apta_app` |
| `DATABASE_MIGRATION_URL` | Propietario (P11) |
| `DATA_RETENTION_DATABASE_URL` | Rol de mantenimiento |
| `DATA_REGION` | `frankfurt`. Si no coincide, el servidor **no arranca** |
| `AUTH_SECRET` | `openssl rand -base64 48`. Nunca `change-me-in-production` |
| `NEXTAUTH_URL`, `NEXT_PUBLIC_SITE_URL` | `https://<dominio>`. Si faltan, los correos llevan enlaces a `localhost` |
| `PROGRESS_PHOTO_KEY`, `PROGRESS_PHOTO_DIR` | Guardar la clave también fuera de Render. Perderla es perder las fotos |
| `JOBS_CRON_SECRET` | Mismo valor en Render y en GitHub |
| `STRIPE_SECRET_KEY` | `sk_live_…`. **Si falta, se enciende el modo demo en producción** (P1 lo corrige) |
| `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET` | Uno por endpoint |
| `STRIPE_CONNECT_CLIENT_ID` | `ca_…` live |
| `STRIPE_PRICE_*` (6) + `STRIPE_PRICE_FUNDADOR` | Precios de la licencia en live |
| `BREVO_API_KEY`, `BREVO_FROM_EMAIL` | Si faltan, el envío **se simula en silencio** (P1 lo corrige) |
| `EMAIL_POSTAL_ADDRESS` | Dirección real del responsable. El valor por defecto está escrito en el código |
| `CANCELLATION_WINDOW_HOURS` | La ventana acordada en D2 (p. ej. `24`) |
| `SEPA_PRENOTIFICATION_DAYS`, `SEPA_PRENOTIFICATION_AGREED_IN_WRITING` | `14` / `false` salvo pacto firmado |
| `AI_DEMO_ORG_SLUGS` | **`__ninguna__`**. Vacía equivale a `training-zone` (`src/lib/ai/dpa.ts:23`): una organización real con ese slug se saltaría el bloqueo del DPA con datos de salud |
| `AI_DPA_SIGNED_AT` | Vacía hasta que el DPA con Anthropic esté firmado |
| `ANTHROPIC_API_KEY` | Solo si se activa la IA |

### 3.3 Stripe (cuenta de Apta, modo live)
- [ ] Productos y precios de la licencia (plano 1) → `STRIPE_PRICE_*`.
- [ ] Connect: activar **Standard OAuth**, redirect `https://<dominio>/api/stripe/connect/callback`.
- [ ] **Webhook de plataforma** → `https://<dominio>/api/stripe/webhook`: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed` y `customer.subscription.deleted`.
- [ ] **Webhook de cuentas conectadas** → la misma URL, con los eventos:
  - `checkout.session.completed`, `.expired`, `.async_payment_succeeded`, `.async_payment_failed`
  - `customer.subscription.created`, `.updated`, `.deleted`
  - `invoice.paid`, `invoice.payment_failed`, `invoice.upcoming`
  - `charge.refunded`, `charge.dispute.created`, `.updated`, `.closed`
  - `credit_note.created`, `.updated`, `.voided`
  - `payout.paid`, `payout.failed`
  - `mandate.updated`, `account.updated`, `account.application.deauthorized`
  - `customer.source.expiring`, `payment_method.automatically_updated`
- [ ] En la **cuenta conectada del gimnasio**: reintentos de Billing (Smart Retries), SEPA activado, datos fiscales y descriptor. La configuración del Billing Portal la crea P5 por API.

### 3.4 DNS, correo, GitHub y legal
- [ ] Dominio en Render (el certificado es automático). HSTS con `preload` ya activo (`src/lib/security-headers.ts:68`): **todos** los subdominios deben servir HTTPS.
- [ ] Brevo: dominio remitente verificado (SPF con `include` de Brevo, DKIM y DMARC con `p=none` como mínimo).
- [ ] GitHub → Actions: `vars.APP_URL` y `secrets.JOBS_CRON_SECRET`. `jobs-cron.yml` (05:00 UTC) y `flujos-cron.yml` (7, 11, 15 y 19 UTC).
- [ ] Protección de `main`: `verify` y `e2e-pago` obligatorios.
- [ ] Legal: cerrar los borradores `docs/legal/05`, `06` y `07` (responsable del tratamiento real) y firmar los DPA con Render, Brevo y Stripe (y Anthropic, si hay IA). La EIPD (`docs/legal/10`) es obligatoria con datos de salud. Lo revisa el agente `cumplimiento-normativo`, pero **lo firma una persona**.
- [ ] Monitorización: Sentry UE (P1 añade `/api/health`) y un comprobador de disponibilidad sobre `/api/health`.

---

## 4 · Guion de regresión completa (staging, 01-10 → 02-10)

Se ejecuta en **staging con BD vacía y Stripe en modo test**, nunca contra la BD de demo. Cada
paso tiene su resultado esperado; lo marcado con 🤖 lo cubre el spec nuevo de P12, y el resto se
comprueba a mano con los tres perfiles en tres navegadores. Tarjetas de prueba:
`4242 4242 4242 4242` (OK), `4000 0025 0000 3155` (3DS) y `4000 0000 0000 0341` (falla al renovar).
Para simular meses se usan **Stripe Test Clocks** en la cuenta conectada.

### 4.1 Organización y centros (OWNER)
| # | Paso | Esperado |
|---|---|---|
| O1 🤖 | `/planes` → Avanzado (3 centros) → Checkout de test | El webhook crea la organización `ACTIVE` y el OWNER, y llega el email de activación (Brevo real en staging) |
| O2 🤖 | Activar la cuenta (`/onboarding/[token]`) → `/puesta-en-marcha` | Checklist visible, con "Canales de lead" ya resuelto (P10) |
| O3 🤖 | Crear el **Centro A** y el **Centro B** (horario, teléfono, aforo por defecto, perfil público) | Dos centros. El cuarto se bloquea por el plan |
| O4 | Conectar Stripe (OAuth de test) | `chargesEnabled`. Estado en `/organization`. El `state` lleva nonce (P5) |
| O5 | Catálogo: crear "Mensual EP 8" (`MONTHLY`, 8 sesiones, 160 €), "Mensual Grupo 12" (`MONTHLY`, 12) y "Bono 5 EP" (`PERSONAL_TRAINING`, puntual) | Product y Price en la cuenta conectada. Cambiar el importe archiva el Price anterior y **no** lo borra |
| O6 | Intentar crear un usuario con rol `PLATFORM_ADMIN` llamando a la server action | **Rechazado** (P7) |

### 4.2 Equipo (OWNER / RRHH)
| # | Paso | Esperado |
|---|---|---|
| E1 🤖 | Alta de Entrenador 1 (Centro A), Entrenador 2 (A y B) y Director de centro B | Invitaciones enviadas; si Brevo falla, **error visible** (P1). Imputación atómica (P7) |
| E2 🤖 | Activar las tres cuentas | Cada una ve **solo** su ámbito. El Entrenador 2 cambia de centro |
| E3 | Reenviar una invitación caducada | Existe el botón y funciona (P7) |
| E4 | Director B intenta abrir socios o agenda del Centro A por URL | 404 o redirección. Sin fuga |

### 4.3 Leads (director, recepción, público)
| # | Paso | Esperado |
|---|---|---|
| L1 🤖 | Lead manual en A, con canal "Instagram" | Guardado. Los canales existen por defecto (P10) |
| L2 🤖 | Formulario público `/lead-form/<org>/<centro-b>` | Lead en B. Canal validado. Una organización suspendida no recibe leads |
| L3 | Mover por el pipeline, asignar responsable, archivar como NO_CERRADO con motivo | Motivos por defecto disponibles |
| L4 🤖 | **Convertir** el lead en socio | Socio con fecha de nacimiento, objetivos y consentimiento de marketing del lead. **Se envía la bienvenida** (P10) |
| L5 | "Cerrado directamente" sin pago | El lead **no** pasa a CERRADO ni libera la recompensa del referido hasta que haya pago (RB-LEAD-005, P10) |

### 4.4 Socio: alta y ficha completa (recepción o director)
| # | Paso | Esperado |
|---|---|---|
| S1 🤖 | Alta de socio en A: nombre, email, teléfono, nacimiento, centro y foto | Invitación al portal enviada |
| S2 🤖 | El socio completa `/onboarding/[token]`: contraseña, consentimientos de contrato, salud, imagen y marketing | El servidor **exige** el de salud (P8). Todo queda en `AuditLog` |
| S3 | Ficha → datos: dirección, CP, profesión (`occupation`), contacto de emergencia, IBAN o método de pago | Se guarda. Un entrenador **no** puede cambiar el email ni la fecha de nacimiento (P8) |
| S4 | Salud: lesión en HOMBRO derecho | Solo con consentimiento. Si falla, error visible, no un `ok` falso (P8). `AuditLog` de lectura |
| S5 | Recepción abre la ficha | **No** ve salud: el acceso devuelve `null`, no un error |

### 4.5 Primera valoración (entrenador + socio)
| # | Paso | Esperado |
|---|---|---|
| V1 🤖 | Existe la valoración INITIAL (una sola, aunque corran a la vez el cron y el onboarding, P8) | — |
| V2 🤖 | El socio rellena su parte (`/portal/valoracion` o `/formulario/[token]`): objetivos, profesión, rutina, días/semana, sueño, estrés, energía y actividad | Guardado |
| V3 🤖 | El entrenador cierra la valoración en `members/[id]/valoraciones`: PAR-Q, medidas, peso y marcas | Se propaga a HealthRecord, ClientGoal, peso y marcas. **El consentimiento de imagen del socio se mantiene** (P8) |
| V4 | Doble clic en "Cerrar valoración" | No duplica peso, marcas ni objetivos (P8) |

### 4.6 Compra, suscripción y adelanto de pago (socio, Stripe test)
| # | Paso | Esperado |
|---|---|---|
| C1 🤖 | Socio → `/portal/membresia` → compra "Mensual EP 8" con 4242 | Checkout `mode=subscription`. En Stripe (cuenta conectada): Customer y Subscription mensual con `metadata.centerId = A`. En la app: `Subscription ACTIVE`, 8 sesiones, asiento `PURCHASE +8` |
| C2 | Vuelve a pulsar "Comprar" o "Renovar" mientras tiene la suscripción viva | **No** se crea una segunda suscripción: se ofrece "Adelantar renovación" (P2, P4) |
| C3 | Pagar con SEPA | Estado `PENDING_CONFIRMATION`: no puede reservar hasta `invoice.paid` |
| C4 🤖 | Consumir las 8 sesiones (reservar y asistir) | Saldo 0. La reserva siguiente se bloquea con "sin sesiones" |
| C5 🤖 | **Adelantar renovación** (tarjeta) | En Stripe, la suscripción queda con `billing_cycle_anchor = ahora` y una factura cobrada en el acto. En la app: `Payment PAID`, `EXPIRY 0` + `PURCHASE +8`, `endDate` = hoy + 1 mes y **la fecha del próximo cobro visible** en el portal |
| C6 | Adelantar con 3DS (`…3155`) | Redirige a la factura alojada. Si no se autentica, la suscripción **no cambia** |
| C7 | Adelantar dos veces en el mismo ciclo | La segunda se rechaza |
| C8 🤖 | Test Clock +1 mes → renovación automática | `invoice.paid` (`subscription_cycle`) → recarga según D3, **una sola vez** aunque el evento llegue repetido |
| C9 | Test Clock con tarjeta `…0341` | `Payment FAILED` y morosidad abierta. La reserva se bloquea según los días de gracia. Al pagar se cierra |
| C10 | Congelar la cuota | `PAUSED` se mantiene tras el `customer.subscription.updated` (P2) |
| C11 | Baja a fin de periodo desde el Billing Portal | `cancelAt` sincronizado en la app (P2) |
| C12 | Recepción vende "Bono 5 EP" en B | `Payment` y bono con `centerId = B` (P2) |

### 4.7 Sesiones y reservas (director, entrenador, socio)
| # | Paso | Esperado |
|---|---|---|
| R1 🤖 | Director crea en A: EP puntual (1 plaza, Entrenador 1), grupo reducido semanal (4 plazas) y clase de grupo semanal (10 plazas). En B, un grupo semanal con el Entrenador 2 | Visible en `/agenda`. Una sesión sin entrenador **también** se ve (P6) |
| R2 🤖 | El socio reserva el grupo semanal | −1 sesión, asiento `BOOKING` **con `bookingId`** (P9) |
| R3 🤖 | Grupo lleno → el siguiente socio queda en lista de espera → se cancela una plaza | Reclamo atómico. Aviso de hueco |
| R4 | El socio cancela **dentro** de la ventana | +1, asiento `CANCELLATION` |
| R5 | El socio cancela **fuera** de la ventana | Sin devolución. El texto sale de la ventana del servidor |
| R6 🤖 | El staff reserva al socio en una EP ya ocupada | **Rechazado** por aforo. En una libre, **descuenta** el bono y corta al moroso (P6) |
| R7 | Un entrenador cancela una reserva de ayer | **Sin** devolución: misma ventana que el socio (P6) |
| R8 | Arrastrar **una** ocurrencia de una serie | Pregunta el alcance. "Solo esta" no mueve la serie ni deja reservas huérfanas (P6) |
| R9 | Borrar una ocurrencia con reservas pasadas sin marcar | Alcance "solo este día". Devuelve **solo** las reservas futuras (P6) |
| R10 🤖 | El entrenador pasa lista (ATTENDED o NO_SHOW con motivo) | Transiciones válidas. CANCELLED y WAITLISTED **nunca** pasan a ATTENDED |
| R11 | Debrief en `/brief/[id]` sobre un NO_SHOW con devolución | Vuelve a descontar al pasar a ATTENDED (P9) |
| R12 | `/trainer`: semáforo de un socio con lesión de HOMBRO | El mismo color que en el brief, y **sin** la descripción clínica (P9) |
| R13 | Recordatorios | "Mañana entrenas" solo el día anterior; con menos de 2 h, solo el de 2 h (P9) |
| R14 | Check-in de una sesión de la semana que viene | Rechazado (P6) |
| R15 | Entrenador de A pide `/api/mobile/v1/agenda` | Solo aparecen socios de su centro (P9) |

### 4.8 Transversal
| # | Paso | Esperado |
|---|---|---|
| X1 | Aislamiento: con 2 organizaciones en staging, cada una solo ve lo suyo por URL, acción y API | — |
| X2 | Rutas gateadas por plan: `FEATURE_BY_ROUTE` sin huecos (el test de unidad pasa) | — |
| X3 | `/cookies` actualizada con la cookie del nonce de OAuth (P5) | Sin banner: sigue siendo técnica |
| X4 | `curl -I /demo-checkout` en producción | Redirige; no hay modo demo |
| X5 | Log de arranque | `[E10-07] Región de datos verificada` |
| X6 | `jobs-cron` y `flujos-cron` lanzados a mano | HTTP 200. El secreto por `?secret=` se rechaza |

---

## 5 · Trabajo de código en paralelo

### 5.1 Mapa de pistas

Cada pista es **dueña exclusiva** de sus ficheros. Ninguna toca `prisma/schema.prisma` ni
`src/lib/rbac.ts`. Las dependencias entre pistas son de contrato (una función con una firma
acordada), no de fichero.

| Pista | Rama | Agente | Prioridad | Ficheros propios |
|---|---|---|---|---|
| P1 Endurecimiento de producción | `pista/prod-hardening` | `devops-cicd` | P0 | `src/instrumentation.ts`, `src/lib/platform-plans.ts` (solo `isDemoModeActive`), `src/app/login/*`, `src/app/demo-checkout/*`, `src/app/api/jobs/run/route.ts`, `src/app/api/flujos/cron/route.ts`, `src/lib/ai/dpa.ts`, `src/lib/mailer.ts`, `src/auth.config.ts` (solo el rótulo), `src/app/api/health/route.ts` (nuevo), `src/lib/public-paths.ts`, `.env.example` |
| P2 Reconciliadores Stripe y guarda anti-doble suscripción | `pista/stripe-renovacion` | `stripe-pagos` | P0 | `src/lib/member-billing.ts`, `src/lib/stripe-renewal.ts` (nuevo), `src/lib/subscriptions.ts`, `src/lib/stripe-idempotency.ts`, `src/app/(app)/billing/actions.ts`, `src/app/(app)/portal/membresia/actions.ts` |
| P3 Checkout completado y hazte-socio | `pista/stripe-checkout` | `stripe-pagos` | P1 | `src/lib/stripe-checkout.ts`, `src/app/api/stripe/webhook/route.ts` |
| P4 Adelanto de renovación | `pista/stripe-adelanto` | `stripe-pagos` | P0 | `src/lib/stripe-advance-renewal.ts` (nuevo), `src/app/(app)/portal/membresia/page.tsx`, `renewal-modal.tsx`, `purchase-plan-button.tsx`, `advance-actions.ts` (nuevo) |
| P5 Catálogo, Connect y Billing Portal | `pista/stripe-connect` | `stripe-pagos` | P1 | `src/lib/stripe-catalog.ts`, `src/lib/stripe-connect.ts`, `src/app/api/stripe/connect/**`, `src/lib/stripe-portal-config.ts` (nuevo), `src/app/cookies/*` |
| P6 Agenda del staff | `pista/agenda-staff` | `fullstack-next` | P0 | `src/lib/agenda-queries.ts`, `src/lib/session-deletion.ts`, `src/app/(app)/agenda/**` |
| P7 Permisos, personal y back-office | `pista/permisos-personal` | `fullstack-next` + revisión de `ciberseguridad` | P0 | `src/app/(app)/organization/actions.ts` y su UI de personal, `src/app/api/mobile/v1/staff/route.ts`, `src/app/(app)/apta/**` |
| P8 Ficha, onboarding y valoraciones | `pista/ficha-valoracion` | `fullstack-next` | P0 | `src/app/(app)/members/[id]/actions.ts`, `src/app/onboarding/[token]/**`, `src/lib/assessments/save.ts`, `src/app/(app)/members/[id]/valoraciones/**`, `src/lib/member-first-session-queries.ts`, `src/lib/member-forms.ts` |
| P9 Reservas del socio, debrief, semáforo y recordatorios | `pista/reservas-debrief` | `fullstack-next` | P1 | `src/lib/portal-queries.ts`, `src/lib/session-ledger.ts`, `src/lib/session-debrief.ts`, `src/lib/booking-transitions*.ts`, `src/lib/attendee-discard.ts`, `src/lib/trainer-panel-queries.ts`, `src/app/(app)/trainer/pending-panel.tsx`, `src/lib/health-access.ts`, `src/app/api/mobile/v1/agenda/route.ts`, `src/lib/session-reminders.ts`, `src/lib/emails/templates.ts` |
| P10 Leads y alta de organización | `pista/leads-alta` | `fullstack-next` | P0 | `src/lib/leads-queries.ts`, `src/app/(app)/leads/actions.ts`, `src/app/lead-form/**`, `src/lib/public-lead-queries.ts`, `src/lib/provisioning.ts`, `src/lib/setup-checklist.ts`, `src/app/activar/page.tsx`, `src/app/onboarding/[token]/page.tsx` (solo el texto de caducidad), `src/lib/member-welcome.ts` (nuevo) |
| P11 Infra como código y arranque | `pista/infra-prod` | `devops-cicd` | P0 | `render.yaml`, `prisma.config.ts`, `scripts/bootstrap-plataforma.ts` (nuevo), `.github/workflows/*`, `docs/OPERACIONES.md` |
| P12 Spec de regresión de organización nueva | `pista/e2e-org-nueva` | `qa-senior` (redacta) + `fullstack-next` (escribe) | P1 | `e2e/regresion-org-nueva.spec.ts` (nuevo), `e2e/fixtures/org-nueva/**` (nuevo) |

> **Solapes controlados:**
> - `onboarding/[token]/page.tsx` es de P8. P10 solo cambia un literal: lo deja a P8 si ya está abierto.
> - `mailer.ts` (P1) cambia su tipo de retorno. Los llamadores de otras pistas solo empiezan a leerlo cuando P1 esté en `main`.
> - `member-welcome.ts` es nuevo (P10). P8 lo puede usar después del merge.

### 5.2 Orden de merge
`P11 → P1 → P5 → P2 → P3 → P4 → P7 → P10 → P8 → P6 → P9 → P12`.
Las que más dependencias producen van primero. P4 depende de la recarga de P2 y P12 de todas.

### 5.3 Cabecera común (va al principio de cada prompt)

Cada prompt de abajo empieza por `[Pega aquí la cabecera común]`: sustitúyelo por este bloque tal cual.

```text
Trabajas en el repo TrainingZone.Brief (Next.js 16, React 19, Prisma 7, Auth.js, Stripe).
Antes de nada lee AGENTS.md (invariantes del trimestre) y la guía de Next en
node_modules/next/dist/docs/ para cualquier API de Next que toques.
Reglas:
- Crea la rama indicada desde origin/main y trabaja SOLO en los ficheros listados como
  tuyos. Si necesitas otro fichero, para y dilo; no lo edites.
- NO toques prisma/schema.prisma ni src/lib/rbac.ts (congelados).
- Respeta las invariantes: ámbito de centro (isCenterInScope / requireApiCenterScope),
  salud solo vía health-access.ts con AuditLog, todo movimiento de sessionsRemaining
  escribe SessionLedger, assertBookingTransition, Stripe con clave de idempotencia y
  archivar en vez de borrar, ventana de cancelación leída del servidor.
- Cada bug corregido lleva un test unitario (node:test en *.test.ts junto al fichero)
  que falla antes del arreglo y pasa después.
- Valida con: npm run lint && npx tsc --noEmit && npm run test:unit, y SOLO los specs
  de Playwright citados. Nunca la suite completa.
- Commits pequeños en español, uno por hallazgo, con el ID (p. ej. "QA-RES-01: …").
  Push a tu rama. No abras PR salvo que te lo pida.
- Al terminar: lista de IDs cerrados, los que no y por qué, y cómo lo has probado.
```

---

### P1 · Endurecimiento de producción

```text
[Pega aquí la cabecera común]
Rama: pista/prod-hardening. Usa el agente devops-cicd.
Ficheros tuyos: src/instrumentation.ts, src/lib/platform-plans.ts (solo isDemoModeActive y
lo que lo alimenta), src/app/login/*, src/app/demo-checkout/**, src/app/api/jobs/run/route.ts,
src/app/api/flujos/cron/route.ts, src/lib/ai/dpa.ts, src/lib/mailer.ts, src/auth.config.ts
(solo textos), src/app/api/health/route.ts (nuevo), src/lib/public-paths.ts, .env.example.

Tareas:
1. PROD-01 · Modo demo explícito. Hoy "falta STRIPE_SECRET_KEY" = modo demo
   (platform-plans.ts:274): en producción abre /demo-checkout (crea organizaciones gratis),
   /demo-checkout/socio (regala bonos) y el panel de usuarios demo del login
   (login/page.tsx:14, login-form.tsx:11-64). Introduce DEMO_MODE=true|false.
   isDemoModeActive() = DEMO_MODE==="true" && NODE_ENV!=="production" || (DEMO_MODE==="true"
   && ALLOW_DEMO_IN_PRODUCTION==="true"). Por defecto, apagado.
2. PROD-02 · Arranque fail-fast en producción (instrumentation.ts, junto a la comprobación de
   DATA_REGION). Aborta si faltan o son débiles: AUTH_SECRET (<32 chars o
   "change-me-in-production"), STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
   STRIPE_CONNECT_WEBHOOK_SECRET, STRIPE_CONNECT_CLIENT_ID, BREVO_API_KEY, BREVO_FROM_EMAIL,
   PROGRESS_PHOTO_KEY, PROGRESS_PHOTO_DIR, JOBS_CRON_SECRET y NEXT_PUBLIC_SITE_URL (https).
   Que la función sea pura y testeable (recibe env) y tenga test.
3. PROD-03 · mailer.ts: sendMail devuelve {ok:true,id} | {ok:false,error}. En producción sin
   clave o con error de Brevo, NO simula: devuelve ok:false y deja un log de error. En
   desarrollo mantiene la simulación. No cambies los llamadores (es de otras pistas); deja
   compatibilidad para quien ignore el retorno.
4. PROD-04 · Quita la aceptación de ?secret= en /api/jobs/run (route.ts:40) y
   /api/flujos/cron (route.ts:38). Solo la cabecera x-cron-secret, con comparación de tiempo
   constante. Test.
5. PROD-05 · ai/dpa.ts:23,39-41: si AI_DEMO_ORG_SLUGS está vacía en producción, la lista es
   vacía, no ["training-zone"]. Test.
6. PROD-06 · /api/health: 200 con {ok, db:"up"} tras un SELECT 1 (timeout de 2 s), sin
   secretos ni versiones. Añádelo a public-paths.ts.
7. PROD-07 · Rótulo del proveedor Credentials: "Email y contraseña", no "demo"
   (auth.config.ts:26-28). Comprueba si hay límite de intentos de login; si no lo hay,
   infórmalo sin implementarlo.
8. PROD-08 · .env.example: documenta DEMO_MODE, AI_DPA_SIGNED_AT, AI_DEMO_ORG_SLUGS,
   FREEZE_MAX_DAYS_PER_YEAR, FREEZE_MIN_NOTICE_DAYS, AUTH_URL, SMTP_FROM, PROGRESS_PHOTO_DIR y
   DATABASE_MIGRATION_URL, con su porqué, como las demás.
Specs de Playwright: login-identidad.spec.ts.
```

### P2 · Reconciliadores de Stripe y guarda anti-doble suscripción

```text
[Pega aquí la cabecera común]
Rama: pista/stripe-renovacion. Usa el agente stripe-pagos.
Ficheros tuyos: src/lib/member-billing.ts, src/lib/stripe-renewal.ts (nuevo),
src/lib/subscriptions.ts, src/lib/stripe-idempotency.ts, src/app/(app)/billing/actions.ts,
src/app/(app)/portal/membresia/actions.ts.
Decisión de negocio D3: en la renovación las sesiones sobrantes SE REINICIAN (asiento EXPIRY
por el saldo restante + PURCHASE por plan.sessionsIncluded). Déjalo en una constante
RENEWAL_CARRYOVER = false para poder cambiarlo.

Tareas:
1. STR-01 (crítico) · invoice.paid (member-billing.ts:578-670) no recarga sesiones ni escribe
   SessionLedger: un MONTHLY de 8 sesiones se queda a 0 desde el 2.º mes. Crea
   src/lib/stripe-renewal.ts con refillOnRenewal(tx, {subscriptionId, invoiceId,
   billingReason}). Se aplica cuando billing_reason ∈ {subscription_cycle,
   subscription_update} (NO subscription_create, que ya cubre el alta). Va en la MISMA
   transacción que el Payment y es idempotente por stripeInvoiceId: si el Payment de esa
   factura ya existía, no se vuelve a recargar. Actualiza endDate con el period_end de la
   línea. Tests: renovación normal, evento repetido, subscription_update (el adelanto de P4)
   y carryover.
   CONTRATO con P4: el adelanto de pago genera invoice.paid con billing_reason
   "subscription_update", y debe recargar exactamente igual que un ciclo.
2. STR-02 (crítico) · No hay guarda contra una segunda suscripción recurrente viva: "Renovar"
   (portal/membresia/page.tsx:394-407) abre otro checkout y el socio paga dos veces al mes.
   En createMemberCheckout (member-billing.ts:172-293), si el plan es recurrente
   (isRecurring) y el socio ya tiene una Subscription recurrente ACTIVE,
   PENDING_CONFIRMATION o PAUSED con stripeSubscriptionId, devuelve
   {ok:false, code:"ALREADY_SUBSCRIBED"}. Aplícalo en todas las entradas que llaman aquí
   (portal, recepción en billing/actions.ts y móvil).
3. STR-03 · member-billing.ts:559: la suscripción recurrente usa member.primaryCenterId e
   ignora metadata.centerId. Usa metadata.centerId si pertenece a la org (isCenterInScope o
   una comprobación por orgId), y si no, primaryCenterId.
4. STR-04 · member-billing.ts:526: customer.subscription.updated pisa PAUSED con ACTIVE (con
   pause_collection Stripe mantiene status active). Si pause_collection != null → PAUSED.
5. STR-05 · Sincroniza cancel_at_period_end/cancel_at → Subscription.cancelAt, y
   pause_collection, desde customer.subscription.updated (bajas pedidas en el Billing Portal).
6. STR-06 · Idempotencia: memberCheckoutKey (stripe-idempotency.ts:113-115) debe incluir el
   origen (portal|reception|mobile|public) y el centerId. Y la productKey del camino perezoso
   (member-billing.ts:131-134) no puede coincidir con la de stripe-catalog.ts:151-154 si los
   parámetros son distintos: usa otro prefijo o, mejor, delega en la función del catálogo si
   P5 ya la ha exportado (ensurePlanPriceForAccount). Si no, deja un TODO(P5).
7. STR-07 · Venta en recepción (billing/actions.ts:83): pasa el centerId del centro elegido,
   validado con el ámbito del usuario.
8. STR-08 · subscriptions.ts:104-146: la Subscription y el SessionLedger se crean con prisma
   y no con tx. Haz que reciban tx y sean atómicos.
Specs de Playwright: alta-socio-bonos.spec.ts, billing-dashboard.spec.ts.
```

### P3 · Checkout completado y hazte-socio

```text
[Pega aquí la cabecera común]
Rama: pista/stripe-checkout. Usa el agente stripe-pagos.
Ficheros tuyos: src/lib/stripe-checkout.ts y src/app/api/stripe/webhook/route.ts (solo la
línea que llama a reconcileConnectCheckoutCompleted, ~102).

Tareas:
1. CHK-01 · stripe-checkout.ts:78-98: el Payment pasa a PAID antes de crear el bono y fuera de
   transacción. Si falla entre medias, la reentrega de Stripe sale por la guarda de :78 y el
   socio queda cobrado y sin bono. Mete Payment PAID + bono + SessionLedger en una sola
   transacción. La guarda de idempotencia comprueba que el bono exista, no solo el Payment.
2. CHK-02 · stripe-checkout.ts:209-213 y route.ts:102: el alta desde la landing se traga los
   errores y la ruta ignora el resultado, así que se pierden altas pagadas (RB-PAGO-002).
   Propaga {ok:false} y que la ruta devuelva 500 para que Stripe reintente.
3. CHK-03 · stripe-checkout.ts:149-172: los socios que nacen en la landing no guardan
   stripeCustomerId ni stripeAccountId. Guárdalos (el Billing Portal y la siguiente compra lo
   necesitan).
4. CHK-04 · Un socio de /hazte-socio que paga nace en TRIAL (confirmLeadClosureForMember solo
   actúa si hay lead). Si el pago está confirmado, ACTIVE; si es SEPA en vuelo,
   PENDING_CONFIRMATION (RB-PAGO-025). Si el checkout recoge la fecha de nacimiento, aplica
   evaluateAgeAdmission; si no la recoge, infórmalo.
Tests unitarios de cada caso con dobles de Stripe. Sin specs de Playwright (el flujo real se
prueba en staging con stripe listen).
```

### P4 · Adelanto de renovación (mover la fecha del pago recurrente)

```text
[Pega aquí la cabecera común]
Rama: pista/stripe-adelanto. Usa el agente stripe-pagos.
Ficheros tuyos: src/lib/stripe-advance-renewal.ts (nuevo) y su test,
src/app/(app)/portal/membresia/advance-actions.ts (nuevo), src/app/(app)/portal/membresia/page.tsx,
renewal-modal.tsx y purchase-plan-button.tsx.
Decisiones: D4 (se pierde lo que queda del periodo: proration_behavior "none"), D5 (solo
tarjeta; con SEPA se ofrece un bono puntual).

Requisito: cuando al socio se le acaban las sesiones de su cuota mensual antes de la
renovación, puede adelantar el pago. Se cobra ya el mes siguiente y la fecha del cobro
recurrente de Stripe pasa a ser hoy (el siguiente, dentro de un mes).

Tareas:
1. ADV-01 · advanceRenewal({orgId, memberId, subscriptionId}):
   - Precondiciones: la Subscription es del socio y de la org, recurrente, ACTIVE, con
     stripeSubscriptionId, sin cancelAt, y método de pago por defecto de tarjeta. Si no, un
     error tipado.
   - Llamada en la cuenta conectada (stripeForOrg), con clave de idempotencia
     "advance:<orgId>:<stripeSubId>:<current_period_start>:v1" (una por ciclo):
     stripe.subscriptions.update(subId, {billing_cycle_anchor:"now",
     proration_behavior:"none", payment_behavior:"pending_if_incomplete",
     metadata:{advanceRenewalAt:<iso>}}, {stripeAccount, idempotencyKey}).
   - VERIFICA en la documentación de Stripe (versión fijada en stripe-api-version.ts) que
     pending_if_incomplete admite billing_cycle_anchor en esta versión. Si no, usa
     payment_behavior "error_if_incomplete" y documenta la diferencia.
   - Si latest_invoice.payment_intent requiere acción (3DS), devuelve la hosted_invoice_url
     para redirigir.
   - NO toques sessionsRemaining aquí: la recarga la hace invoice.paid con billing_reason
     "subscription_update" en P2 (refillOnRenewal). Si P2 aún no está en main, desarrolla
     contra ese contrato y déjalo escrito en el commit.
   - Deja AuditLog MEMBER_ADVANCE_RENEWAL.
2. ADV-02 · UI en /portal/membresia: con una cuota recurrente viva, el botón "Renovar" ya no
   abre un checkout nuevo. Muestra "Adelantar renovación" cuando sessionsRemaining == 0 (o
   siempre, con confirmación), con un modal que diga el importe, que el cobro es ahora, la
   nueva fecha del próximo cobro y que se pierden los días restantes. La fecha del próximo
   cobro se lee de Stripe o de Subscription.endDate, nunca se calcula en el cliente.
3. ADV-03 · Tests: happy path, 3DS, doble clic (idempotencia), SEPA rechazado, cuota
   cancelada rechazada y socio de otra org rechazado.
Paridad móvil (POST /api/mobile/v1/portal/billing/advance): fuera de alcance, deja una nota.
Spec de Playwright: portal.spec.ts (sin romperlo).
```

### P5 · Catálogo, Connect y Billing Portal

```text
[Pega aquí la cabecera común]
Rama: pista/stripe-connect. Usa el agente stripe-pagos y pide revisión a ciberseguridad.
Ficheros tuyos: src/lib/stripe-catalog.ts, src/lib/stripe-connect.ts,
src/app/api/stripe/connect/**, src/lib/stripe-portal-config.ts (nuevo), src/app/cookies/*.

Tareas:
1. CON-01 (seguridad) · stripe-connect.ts:26: state = orgId no es un nonce, así que hay CSRF
   de OAuth (un atacante conecta la org de la víctima a SU cuenta y desvía los cobros).
   Genera un nonce aleatorio, guárdalo en una cookie httpOnly, Secure, SameSite=Lax, de
   10 min y firmada con AUTH_SECRET, junto al orgId. El callback valida el nonce, que la org
   coincida con la del usuario de la sesión y canManageOrg, y borra la cookie.
   Añade la cookie al inventario de /cookies (es técnica: sin banner).
2. CON-02 · Configuración del Billing Portal por API en la cuenta conectada al completar la
   conexión (y de forma idempotente si falta): actualizar el método de pago, ver facturas y
   cancelar A FIN DE PERIODO; sin cambio de plan ni cantidades. Idempotencia en la creación.
   Si ya existe una default, no la pises.
3. CON-03 · stripe-catalog.ts:187-199: si el importe va A→B→A en 24 h, priceKey devuelve el
   Price A ya archivado y el checkout falla. Incluye en la clave el id del Price anterior o
   una versión.
4. CON-04 · Exporta ensurePlanPriceForAccount(orgId, planId) como única puerta para obtener
   el Price activo de un plan, con archivado del anterior. P2 la usará desde member-billing.
Tests unitarios. Spec de Playwright: productos-y-setup.spec.ts.
```

### P6 · Agenda del staff

```text
[Pega aquí la cabecera común]
Rama: pista/agenda-staff. Usa el agente fullstack-next.
Ficheros tuyos: src/lib/agenda-queries.ts, src/lib/session-deletion.ts, src/app/(app)/agenda/**
(incluidos session-actions.ts, session-dialog.tsx, agenda-view.tsx, session-scope-dialog.tsx,
page.tsx, session/[id]/actions.ts).

Tareas:
1. QA-RES-01 · agenda-queries.ts:356-371 (saveSession) y :1033-1037 (createEpSlot) crean la
   reserva EP con prisma.booking.create directo: no descuenta el bono, no deja SessionLedger,
   no corta al moroso y no mira el aforo (dos socios en una EP de 1 plaza). Reserva mediante
   bookSessionForMemberAsStaff (session-booking.ts), dentro de la misma transacción. Si falla
   (sin saldo, lleno, moroso), la sesión no se guarda a medias y el error llega a la UI.
2. QA-RES-02 · cancelSessionBooking (:382-449) devuelve siempre el bono, aunque sea fuera de
   ventana o de una sesión pasada. Aplica la misma ventana que el socio
   (canCancelWithoutPenalty, leída del servidor) y bloquea las sesiones ya empezadas salvo
   para roles con canAdjustSessionBalance (usa el helper existente, no toques rbac.ts).
3. QA-RES-03 · rescheduleSession (:964-983): arrastrar una ocurrencia de una serie mueve la
   serie y deja reservas huérfanas. Al soltar una ocurrencia de una serie, abre
   session-scope-dialog y envíalo por saveSession con scope (single = excepción de esa
   ocurrencia con sus reservas; future; all).
4. QA-RES-05 · deleteSession (:847-930) y planSessionDeletion (session-deletion.ts:66-82):
   añade scope (single|future|all). Solo se devuelve el bono de las reservas de ocurrencias
   FUTURAS; el aviso de cancelación solo a esas. Las pasadas no se tocan.
5. QA-RES-08 (parte staff) · agenda-queries.ts:642: crea la reserva antes y pasa su bookingId
   a chargeSession, en la misma transacción.
6. QA-RES-11 · agenda/page.tsx:67 descarta las sesiones sin trainerId. Píntalas en una fila o
   columna "Sin entrenador".
7. QA-RES-12 · session/[id]/actions.ts:60-106: el check-in no admite ocurrencias futuras (más
   de X minutos antes del inicio; usa la zona del centro).
Tests unitarios de cada punto. Specs: agenda-ep.spec.ts, agenda-reserva-staff.spec.ts,
agenda-sesiones-periodicas.spec.ts. Añade casos a esos specs para 1, 3 y 4.
```

### P7 · Permisos, personal y back-office

```text
[Pega aquí la cabecera común]
Rama: pista/permisos-personal. Usa fullstack-next y, al terminar, pide revisión a ciberseguridad.
Ficheros tuyos: src/app/(app)/organization/actions.ts y los componentes de personal de
/organization, src/app/api/mobile/v1/staff/route.ts, src/app/(app)/apta/**.

Tareas:
1. QA-ALTA-01 (CRÍTICO) · organization/actions.ts:29-37 incluye PLATFORM_ADMIN en STAFF_ROLES,
   y la guarda de :327 y :421 lo deja pasar a un OWNER, porque canManageOrg("OWNER") es true.
   Un OWNER puede crear o ascender a PLATFORM_ADMIN y entrar en /apta (ve todas las orgs y
   crea orgs ACTIVE sin pagar). Arreglo:
   a) quita PLATFORM_ADMIN de STAFF_ROLES en web y en móvil (staff/route.ts:17,23,115);
   b) solo un PLATFORM_ADMIN puede asignar PLATFORM_ADMIN;
   c) /apta (page y actions) exige además que el usuario pertenezca a la organización de
      plataforma (la que marque el bootstrap de P11; acuerda con P11 la marca o el slug y
      léelo de una env PLATFORM_ORG_SLUG).
   Tests de cada puerta.
2. QA-ALTA-11 · Crear el usuario y su CenterMembership en una transacción (:358-367 y
   móvil :135-141).
3. QA-ALTA-10 (parte personal) · Botón "Reenviar invitación" para el personal pendiente:
   invalida la anterior y crea otra. Muestra el error si el correo falla (sendMail devuelve
   ok:false cuando P1 esté en main; hasta entonces, trátalo como opcional).
4. QA-ALTA-18 · canAddCenter + createCenter (:163-166) en una transacción serializable o con
   un lock por org, para que no haya carrera sobre el límite de centros.
Spec de Playwright: alta-completa-gimnasio.spec.ts (solo esta).
```

### P8 · Ficha del socio, onboarding y primera valoración

```text
[Pega aquí la cabecera común]
Rama: pista/ficha-valoracion. Usa el agente fullstack-next.
Ficheros tuyos: src/app/(app)/members/[id]/actions.ts, src/app/onboarding/[token]/**,
src/lib/assessments/save.ts, src/app/(app)/members/[id]/valoraciones/**,
src/lib/member-first-session-queries.ts, src/lib/member-forms.ts.

Tareas:
1. QA-ALTA-05 · Cerrar la valoración borra el consentimiento de imagen (save.ts:163-170;
   assessment-form.tsx:240 con useState(false)). La valoración solo puede ESCRIBIR true; la
   retirada va por consent-access. Nunca pongas consentImagesAt a null. El formulario se
   inicializa con member.consentImages.
2. QA-ALTA-14 · Doble cierre (save.ts:147-157): update condicional
   (where {id, completedAt:null}) y, si count==0, sal sin propagar. ensureInitialAssessment
   (member-first-session-queries.ts:29-38): evita dos INITIAL con un advisory lock por
   memberId (pg_advisory_xact_lock), no con un índice (el esquema está congelado).
3. QA-ALTA-07 · addHealthRecord (members/[id]/actions.ts:119-138 y :167-176) devuelve ok:true
   aunque createHealthRecord diga forbidden o no_consent. Propaga el resultado.
4. QA-ALTA-08 · updateMemberData (:260-341):
   - exige canManageMembers para los datos administrativos; el entrenador solo edita lo
     deportivo;
   - cambiar el email actualiza la identidad y la Invitation pendiente (o se bloquea con un
     mensaje si ya hay identidad activa: elige lo más seguro y documéntalo);
   - cambiar la fecha de nacimiento vuelve a pasar evaluateAgeAdmission y el tutor.
5. QA-ALTA-09 · Onboarding: si la identidad ya tiene contraseña, el formulario no la pide y
   usa "entra con tu contraseña". El servidor exige consentHealth (hoy solo el cliente,
   :87). consentContract no se marca true sin la casilla. setPassword y usedAt van en la
   misma transacción. En completeStaffOnboarding (:46) no sobrescribas la contraseña de una
   identidad existente (RB-ID-003).
6. QA-ALTA-21 · submitForLead (member-forms.ts:880) solo rellena los goals que falten, no los
   sustituye.
7. Verifica que la valoración inicial recoge profesión (Member.occupation), objetivos,
   rutina (días/semana, actividad) y hábitos (sueño, estrés, energía), y que se ven en la
   ficha. Si falta la profesión en la parte del socio, añádela al formulario como pregunta
   que escribe en Member.occupation.
Specs: formulario-alta.spec.ts, valoraciones-config.spec.ts.
```

### P9 · Reservas del socio, debrief, semáforo y recordatorios

```text
[Pega aquí la cabecera común]
Rama: pista/reservas-debrief. Usa el agente fullstack-next.
Ficheros tuyos: src/lib/portal-queries.ts, src/lib/session-ledger.ts, src/lib/session-debrief.ts,
src/lib/booking-transitions.ts, src/lib/booking-transitions-writes.test.ts,
src/lib/attendee-discard.ts, src/lib/trainer-panel-queries.ts,
src/app/(app)/trainer/pending-panel.tsx, src/lib/health-access.ts,
src/app/api/mobile/v1/agenda/route.ts, src/lib/session-reminders.ts, src/lib/emails/templates.ts.

Tareas:
1. QA-RES-04 · session-debrief.ts:98-107 y :163-170: el debrief pasa NO_SHOW a ATTENDED con
   un update directo y conserva la devolución (+1). Si el estado es NO_SHOW, pasa primero por
   clearBookingNoShow (asiento CORRECTION y noShowRefunded=false) en la misma transacción.
   Test.
2. QA-RES-08 (portal) · portal-queries.ts:748: crea la reserva primero y cobra con su
   bookingId. Igual al reclamar desde la lista de espera.
3. QA-RES-09 · Unifica la lista de puntos de escritura de reservas en booking-transitions.ts.
   Haz que la cancelación del portal y el descarte (attendee-discard.ts) llamen a
   checkBookingTransition. Reescribe booking-transitions-writes.test.ts para que ejercite
   las funciones que escriben, no solo la tabla.
4. QA-RES-13 · Comentario obsoleto en attendee-discard.ts:9.
5. QA-RES-06 · trainer-panel-queries.ts:239-257,491 calcula el semáforo con rule.injuryZone
   (deprecado) e ignora zoneCode/side. Usa resolveAptitude + conditionLabel, como el brief.
   Quita record.description del panel; si hace falta un detalle clínico, que pase por
   health-access.ts (getClinicalDetailForMember) con AuditLog.
6. QA-RES-07 · mobile/v1/agenda/route.ts:52 lista socios de toda la org. Usa
   listMembersBookableInCenter(orgId, centerId, "EP") con el centro validado por
   requireApiCenterScope.
7. QA-RES-10 · session-reminders.ts:167-170: "Mañana entrenas" llega el mismo día. Con menos
   de 2 h, solo la variante 2H; la de 24H solo si la sesión es mañana en la zona del centro.
   templates.ts:835-858: el texto de la ventana sale del valor del servidor, no de "24h" fijo.
Specs: portal-reservas.spec.ts, no-show-motivo.spec.ts, trainer-panel.spec.ts,
mobile-agenda-scope.spec.ts.
```

### P10 · Leads y alta de organización

```text
[Pega aquí la cabecera común]
Rama: pista/leads-alta. Usa el agente fullstack-next.
Ficheros tuyos: src/lib/leads-queries.ts, src/app/(app)/leads/actions.ts, src/app/lead-form/**,
src/lib/public-lead-queries.ts, src/lib/provisioning.ts, src/lib/setup-checklist.ts,
src/app/activar/page.tsx, src/lib/member-welcome.ts (nuevo).

Tareas:
1. QA-ALTA-02 (bloqueante) · Una org nueva no tiene LeadChannel ni NoCloseReason: solo los
   crea prisma/seed.ts:1847,1852. El formulario público tiene un select obligatorio vacío y
   createLead exige canal. En provisioning.ts, en la misma transacción que la org, crea los
   canales por defecto (Instagram, Facebook, Google, Web, Referido, Paso por el centro,
   Teléfono, Otro) y los motivos de no cierre por defecto (Precio, Horario, Distancia, Se va
   a otro centro, No responde, Otro). Que sea idempotente. Añade un paso "Canales de
   captación" a setup-checklist.ts.
2. QA-ALTA-03 · leads-queries.ts:276-283: "Cerrado directamente" llama a
   confirmLeadClosureForMember sin pago (incumple RB-LEAD-005) y libera la recompensa del
   referido. Quita esa llamada: el lead queda en conversión hasta el pago. Y valida el email
   duplicado ANTES de lead.create (hoy cada reintento deja un duplicado).
3. QA-ALTA-04 · Convertir un lead no envía la bienvenida. Crea
   src/lib/member-welcome.ts#sendMemberWelcome(memberId) (invitación + render + sendMail,
   devolviendo el resultado) y úsalo en la conversión.
4. QA-ALTA-06 · La conversión (:352-368) no pasa birthDate, goals ni el consentimiento de
   marketing (con su AuditLog de origen). Pásalos; con birthDate aplica la política de
   menores.
5. QA-ALTA-19 · convertLeadAction (leads/actions.ts:121): valida closeType con zod.
   assignLeadOwner (:289): el responsable tiene que ser personal de la org.
6. QA-ALTA-20 · lead-form actions (:24,28): valida canal (activo y de la org) y sexo; rechaza
   si la org no está ACTIVE (platformStatus).
7. QA-ALTA-13 · provisioning.ts:125-131: si el email ya dirige una org, el alta por pago le
   cambia el plan sin autenticar. Crea una org nueva o bloquéalo con un aviso a soporte;
   nunca pises platformStripeSubscriptionId.
8. QA-ALTA-16/17 · setup-checklist.ts:50 cuenta a los MEMBER y a las bajas en "Tu equipo".
   Cambia los textos "Apta" de activar/page.tsx:17,147 por la marca vigente
   (docs/BRANDING.md).
Specs: leads.spec.ts, referidos.spec.ts, alta-comercial.spec.ts.
```

### P11 · Infraestructura como código y arranque sin seed

```text
[Pega aquí la cabecera común]
Rama: pista/infra-prod. Usa el agente devops-cicd.
Ficheros tuyos: render.yaml, prisma.config.ts, scripts/bootstrap-plataforma.ts (nuevo),
.github/workflows/*, docs/OPERACIONES.md.

Tareas:
1. INF-01 · render.yaml: servicio web (frankfurt, plan de pago, npm ci && npm run build,
   npm run start, preDeployCommand: npx prisma migrate deploy, healthCheckPath /api/health,
   disco persistente montado en /var/data con PROGRESS_PHOTO_DIR=/var/data/progress-photos),
   Postgres 16 en frankfurt con backups y todas las env como sync:false. Mismo blueprint
   para staging con otro nombre. El cron de Render queda inactivo (se usan los workflows).
2. INF-02 · prisma.config.ts: usa DATABASE_MIGRATION_URL para migrar si existe (si no,
   DATABASE_URL). Documenta en OPERACIONES.md el orden de roles de §3.1 del informe
   docs/PASO_A_PRODUCCION_2_CENTROS.md, con el SQL exacto.
3. INF-03 · scripts/bootstrap-plataforma.ts: idempotente, SIN seed. Crea la org de plataforma
   (slug de PLATFORM_ORG_SLUG) y un PLATFORM_ADMIN con invitación por email (sin contraseña
   en claro). Se niega a ejecutarse si detecta datos demo o si NODE_ENV!=="production" sin
   --force. Añade el script "bootstrap:plataforma" a package.json (solo esa línea).
4. INF-04 · CI (e2e.yml): paso explícito npx tsc --noEmit; un job que haga
   prisma migrate deploy sobre una BD VACÍA sin seed y arranque la app contra /api/health;
   npm audit --audit-level=high (sin fallar el build el primer día: informa).
5. INF-05 · OPERACIONES.md §7: runbook de despliegue y de rollback (una migración a medias no
   se deshace sola: restaurar el backup).
No ejecutes Playwright.
```

### P12 · Spec de regresión de una organización nueva

```text
[Pega aquí la cabecera común]
Rama: pista/e2e-org-nueva. Usa qa-senior para diseñar los casos y fullstack-next para
escribirlos.
Ficheros tuyos: e2e/regresion-org-nueva.spec.ts (nuevo), e2e/fixtures/org-nueva/** (nuevo).

Objetivo: automatizar los pasos marcados con 🤖 en el §4 de
docs/PASO_A_PRODUCCION_2_CENTROS.md, en orden, como un recorrido serial
(test.describe.serial) que parte de una BD SIN seed. Organización nueva por /planes en modo
Stripe test (o /demo-checkout si DEMO_MODE=true en staging) → 2 centros → 3 miembros del
equipo → leads (manual y público) → conversión → socio con ficha completa → onboarding →
valoración inicial → compra de un MONTHLY → consumo de sesiones → adelanto → reservas
(grupo, lista de espera y EP del staff) → asistencia.
Reglas:
- El spec se SALTA si no está E2E_CLEAN_DB=true, para no correr nunca contra la BD de demo.
- Los emails se leen de un buzón de pruebas o de un endpoint solo de test, si existe (si no,
  del log del mailer en modo simulación). No añadas endpoints nuevos a src/ sin pedirlo.
- Las partes de Stripe que exigen el webhook real (C1, C5, C8) van en un test aparte,
  etiquetado @stripe, que usa stripe listen + Test Clocks; documenta en la cabecera cómo
  lanzarlo.
- Sin test.skip condicionales por datos del seed ni .catch(() => false): si algo no está,
  el test falla.
Ejecuta SOLO este spec, contra la BD de staging o local limpia. Nunca la suite completa.
```

### Prompt del integrador (ventana de merge diaria)

```text
Eres el integrador del lote "paso a producción 2 centros". Lee
docs/PASO_A_PRODUCCION_2_CENTROS.md §5 y docs/TRABAJO_EN_PARALELO.md.
Mezcla en main, con merge --no-ff y nunca rebase, en este orden, solo las ramas que existan:
P11 pista/infra-prod, P1 pista/prod-hardening, P5 pista/stripe-connect,
P2 pista/stripe-renovacion, P3 pista/stripe-checkout, P4 pista/stripe-adelanto,
P7 pista/permisos-personal, P10 pista/leads-alta, P8 pista/ficha-valoracion,
P6 pista/agenda-staff, P9 pista/reservas-debrief, P12 pista/e2e-org-nueva.
Si hay un conflicto, para y dime los ficheros y qué pista se ha salido de los suyos.
Después: npm run lint && npx tsc --noEmit && npm run test:unit. Si algo falla, identifica la
pista culpable con git log y dímelo; no lo arregles tú.
Revisa que ningún commit toque prisma/schema.prisma ni src/lib/rbac.ts.
Push a main. Solo en la última ventana del día: npx playwright test.
Al final: una tabla con las pistas mezcladas, los IDs cerrados y los pendientes.
```

### Prompt de regresión en staging (01-10 → 02-10)

```text
Usa el agente qa-senior. Tienes acceso de lectura al repo y a la URL de staging <URL> (Stripe
en modo test, BD limpia). Ejecuta el §4 de docs/PASO_A_PRODUCCION_2_CENTROS.md paso a paso:
1) lanza e2e/regresion-org-nueva.spec.ts con E2E_CLEAN_DB=true contra staging;
2) para cada paso sin 🤖, sigue el guion con Playwright en modo interactivo o a mano y deja
   evidencia (captura o respuesta);
3) en Stripe (test), comprueba C1, C5 y C8 en la cuenta conectada: suscripción,
   billing_cycle_anchor, facturas y metadata.centerId.
Devuelve una tabla con cada ID (O1…X6), OK/KO y la evidencia, y para cada KO un hallazgo
reproducible con fichero:línea y la pista (P1-P12) a la que pertenece el arreglo, más un
prompt listo para pegar con la cabecera común de §5.3.
No arregles nada.
```

---

## 6 · Hallazgos por gravedad (referencia)

| ID | Gravedad | Dónde | Pista |
|---|---|---|---|
| QA-ALTA-01 | **Crítico** | Un OWNER se da `PLATFORM_ADMIN` · `organization/actions.ts:29-37,327,421` | P7 |
| STR-01 | **Crítico** | La renovación no recarga sesiones · `member-billing.ts:578-670` | P2 |
| STR-02 | **Crítico** | Doble suscripción al "Renovar" · `member-billing.ts:172-293` | P2 |
| PROD-01 | **Crítico** | Modo demo si falta la clave de Stripe · `platform-plans.ts:274` | P1 |
| ADV (requisito) | **Bloqueante** | No existe el adelanto de pago | P4 |
| QA-ALTA-02 | Alto | La org nueva no tiene canales de lead | P10 |
| QA-ALTA-03/04/05 | Alto | Cierre sin pago, sin bienvenida, consentimiento de imagen borrado | P10/P8 |
| QA-RES-01…06 | Alto | EP del staff sin cobro, cancelación sin ventana, series, debrief, semáforo | P6/P9 |
| CHK-01/02/03 | Alto | Checkout: cobrado sin bono, errores tragados, sin Customer | P3 |
| STR-03/04 | Alto | Centro ignorado, congelación deshecha | P2 |
| CON-01 | Alto (seg.) | CSRF en OAuth de Connect | P5 |
| INF (fotos) | Alto | Fotos en disco efímero | P11 / §3.1 |
| PROD-03 | Alto | El correo falla en silencio en producción | P1 |
| Resto (QA-ALTA-06…21, QA-RES-07…13, STR-05…08, CON-02…04) | Medio/Bajo | — | según tabla |

## 7 · Fuera de alcance (conscientemente)

- **Cuenta Stripe por centro (HU-ST-29):** solo si D1 = CIF distintos. En ese caso, el plazo de 2 semanas no se sostiene.
- **Ventana de cancelación y zona horaria por centro:** requiere esquema. Con D2 se usa un único valor del servidor.
- **Tipo de sesión "valoración"** propio: hoy se usa una EP con el flag `isTrial`. Suficiente para el lanzamiento.
- **"Cancelar esta clase" conservando la sesión** (`ClassSession.status = CANCELLED`): hoy solo se borra. Con P6 el borrado con alcance "solo este día" cubre el caso.
- **App móvil** y paridad del adelanto de pago en `/api/mobile/*`.
- **CSP sin `'unsafe-inline'`**, rate limiting de login, staging permanente con datos: siguiente iteración.
