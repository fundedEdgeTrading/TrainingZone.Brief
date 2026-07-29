# APTA — Arquitectura de identidad, alta de cliente y venta en dos planos

**Documento de arquitectura · v1.0 · decisiones abiertas para dirección.**

**Qué resuelve:** el recorrido completo *landing → pago → alta de la empresa → alta de su
gente → que esa empresa venda sus propias cuotas dentro de Apta*, con un único login para
todo el mundo. Propone alternativas por cada eje y recomienda una, con el criterio de
**mínima intrusión** — primero para el usuario final (socio), después para la organización
cliente (el gimnasio), y por último para nosotros.

**Emparejar con:** `docs/PLATAFORMA_COBRO_SMTP_STRIPE_CONNECT_IMPLEMENTACION.md` (los dos
planos de cobro, ya decididos: no se reabren aquí) y `docs/ANALISIS_FALTAS_IMPLEMENTACION.md`
(qué está construido de verdad).

---

## 0. El dilema, descompuesto

Lo que se plantea como un problema son en realidad **cinco preguntas independientes**. Se
enredan porque comparten el email como hilo conductor, pero cada una tiene su propia
solución y se pueden decidir por separado:

| # | Eje | Pregunta | Estado hoy |
|---|---|---|---|
| **E1** | **Identidad** | ¿Un login global para todos? ¿Qué pasa si el mismo email está en dos gimnasios, o es staff y socio a la vez? | ⛔ **Roto por diseño**: `User.email` es único **global** |
| **E2** | **Alta del cliente** | ¿Se paga antes o después de crear la cuenta? ¿Cómo llega el email de bienvenida y a dónde apunta? | 🟡 Construido "cuenta primero"; la landing pide lo contrario |
| **E3** | **Puesta en marcha** | Centros, personal, socios, productos: ¿asistente bloqueante o checklist? | 🟡 Piezas sueltas, sin hilo conductor; **falta CRUD de productos** |
| **E4** | **Venta del gimnasio** | ¿Cómo vende TrainingZone sus cuotas a sus socios *dentro* de Apta? | 🟡 Connect cableado; **falta cobro recurrente y compra del socio** |
| **E5** | **Marca y dominios** | ¿Un host o subdominio por cliente? ¿Los emails al socio los firma Apta o TrainingZone? | 🔴 Sin decidir; los emails salen con marca mezclada |

**E1 es la única decisión verdaderamente estructural.** Las otras cuatro son producto y
fontanería; E1 condiciona el esquema, el JWT y el login, así que se decide primero.

---

## 1. Punto de partida real (verificado en código, no en documentos)

| Pieza | Fichero | Qué hace hoy |
|---|---|---|
| Login | `src/auth.config.ts` | Credentials (bcrypt) → `findUnique({ where: { email } })`. **Un email = un usuario = una org** |
| Sesión | `src/auth.config.ts` (callbacks) | JWT lleva `role`, `orgId`, `centerId`. Todo el aislamiento cuelga de `session.user.orgId` |
| Alta de empresa | `src/app/signup/actions.ts` | Crea `Organization` (`PENDING_PAYMENT`) + `OWNER` con contraseña real + auto-login → `/activar` |
| Muro de pago | `src/app/(app)/layout.tsx`, `src/app/activar/` | Gating por `Organization.platformStatus` |
| Cobro Apta → gimnasio | `src/lib/platform-billing.ts` | Checkout `subscription`/`payment` (lifetime) contra la cuenta de Apta. **Catálogo de planes vacío** (`platform-plans.ts` = `[]`) |
| Cobro gimnasio → socio | `src/lib/stripe-checkout.ts`, `src/lib/stripe.ts` | `stripeForOrg(orgId)` + `Stripe-Account`. **Solo `mode: "payment"`** (pago suelto) |
| Webhook | `src/app/api/stripe/webhook/route.ts` | Rutado correcto plataforma vs. Connect. Connect solo escucha `checkout.session.*` y `account.updated` |
| Invitaciones | `src/lib/invitations.ts`, `src/app/onboarding/[token]/` | Token 7 días → el socio pone contraseña y **se crea su `User`** |
| Productos del gimnasio | `MembershipPlan` | Modelo + lecturas. **Sin crear/editar/archivar en toda la app** |

### Los tres bloqueos concretos que hay hoy entre esto y la visión

1. **`/signup`, `/activar` y `/verificar-email` no están en `PUBLIC_PATHS`** (`src/proxy.ts:12`).
   Un visitante anónimo que pulse "Da de alta tu gimnasio" acaba en `/login`. **El alta
   self-service es literalmente inalcanzable.** Una línea de código.
2. **`User.email @unique` global** (`prisma/schema.prisma:143`). En el momento en que
   TrainingZone importe un socio cuyo email ya exista en otra organización de Apta —o que
   ya sea staff en la suya— `completeMemberOnboarding` revienta con violación de unicidad
   (`src/app/onboarding/[token]/actions.ts:65`). No es hipotético: los gimnasios de una
   misma ciudad comparten clientela, y una recepcionista suele ser también socia.
3. **`MembershipPlan` sin CRUD.** Un gimnasio real no puede dar de alta sus cuotas ni sus
   bonos: los productos solo existen si los crea el seed. Sin esto, E4 no tiene qué vender.

---

## 2. E1 — Identidad y login global

### El problema en una frase

Hoy `User` mezcla tres cosas: **quién eres** (credencial), **dónde trabajas o entrenas**
(organización) y **qué puedes hacer** (rol). Mientras sean lo mismo, una persona solo puede
existir en un sitio.

### Alternativa A — Statu quo: un email, una organización

No se toca nada. Si un email colisiona, el alta falla y recepción tiene que pedirle otro
correo al socio.

- ✅ Coste cero.
- ❌ **Intrusión máxima donde más duele**: al socio se le pide un email alternativo por un
  motivo que no entiende. La importación CSV de un gimnasio con 400 socios fallará en
  silencio o en bloque el día que dos clientes de Apta compartan clientela.
- ❌ Bloquea "un socio, varios gimnasios de la misma cadena" y "entrenador que además es socio".
- **Veredicto:** descartable. Es una bomba de relojería que estalla con el segundo cliente.

### Alternativa B — Identidad separada de la membresía ← **recomendada**

Se parte `User` en dos: la **credencial es global y única**, la **membresía es por organización**.

```prisma
model Identity {
  id              String    @id @default(cuid())
  email           String    @unique          // único GLOBAL: es la credencial
  passwordHash    String
  emailVerifiedAt DateTime?
  authProvider    String    @default("password")
  memberships     User[]
}

model User {                                  // pasa a significar "membresía en una org"
  id         String  @id @default(cuid())
  identityId String
  orgId      String
  email      String                           // desnormalizado; DEJA de ser @unique global
  role       Role
  centerId   String?
  // ... resto igual
  identity   Identity @relation(fields: [identityId], references: [id])
  @@unique([orgId, email])
}
```

**Lo que NO cambia — y es la clave de por qué esta opción es barata:** todas las consultas
de negocio siguen filtrando por `session.user.orgId`. Los ~40 modelos con `orgId`, el
`lib/rbac.ts`, `lib/guard.ts`, `health-access.ts`, el aislamiento multi-tenant entero: intactos.

**Lo que cambia (≈10 ficheros):**

- `auth.config.ts`: `authorize` resuelve `Identity` por email → bcrypt → lista sus
  membresías. Si hay **una**, entra directo (el 99 % de los casos: nadie nota nada). Si hay
  **varias**, el login muestra un selector *"¿Dónde quieres entrar?"* con logo y nombre de
  cada organización.
- JWT: añade `identityId`; `orgId` pasa a ser la **membresía activa**.
- `user-menu.tsx`: conmutador de organización para quien tenga varias (patrón Slack/Notion).
- `signup/actions.ts`, `invitations.ts`, `onboarding/[token]/actions.ts`, `mobile-auth.ts`,
  `seed.ts`: crean/resuelven `Identity` antes que `User`.
- Migración: `Identity` 1:1 desde los `User` existentes, luego se sustituye el índice único.

**Efecto secundario valioso:** el socio que ya tiene cuenta en otro gimnasio de Apta y es
invitado por TrainingZone **no crea contraseña otra vez** — el email de bienvenida le dice
"ya tienes cuenta en Apta, entra y acepta la invitación". Un clic en vez de un formulario.

- ✅ Cero fricción para el socio, hoy y a futuro.
- ✅ Habilita cadenas y franquicias (un director, varios gimnasios) sin rehacer nada.
- ✅ Prepara SSO por organización (Entra ID de una empresa concreta) sin tocar la membresía.
- ⚠️ Requiere una migración con datos y tocar el login. **Hacerlo ahora cuesta días; hacerlo
  con 5 000 socios cuesta un fin de semana de riesgo.**

### Alternativa C — Identidad externa (Auth0 / Clerk / WorkOS)

Delegar identidad y organizaciones en un proveedor SaaS.

- ✅ Nos ahorra el login, el reset de contraseña (hoy **inexistente**, A9), MFA y SSO.
- ❌ **Precio por usuario activo**: los socios son el grueso del censo (cientos por gimnasio,
  miles en agregado). Pagar por MAU de socio es un coste variable que escala justo con la
  parte del producto que menos margen tiene.
- ❌ Datos de identidad fuera de nuestro control (RGPD, y el producto ya maneja Art. 9).
- 🟡 **Variante sensata:** externalizar **solo el staff B2B** (que son pocos y son quienes
  piden SSO corporativo) y quedarnos la identidad de los socios. Añade complejidad de dos
  sistemas; solo compensa si un cliente grande exige SSO.
- **Veredicto:** no ahora. `Identity` (alt. B) es compatible con migrar a esto más adelante,
  porque ya aísla la credencial del resto del modelo.

### Alternativa D — Un tenant, un espacio de login (subdominio)

`trainingzone.apta.com` con su propio login y su propia cookie.

- ✅ Aísla de raíz el problema del email duplicado y da branding gratis.
- ❌ El socio tiene que **recordar la URL de su gimnasio**; si la olvida, no hay recuperación
  posible sin buscar por email en todos los tenants (que es exactamente el problema que
  intentábamos evitar).
- ❌ Certificados wildcard, DNS por cliente, cookies por subdominio, y la app móvil necesita
  preguntar "¿de qué gimnasio eres?" antes del login.
- **Veredicto:** el branding se consigue más barato (§6) sin pagar este precio.

### Recomendación E1

> **Alternativa B.** Es la única que hace invisible el problema para el socio, y la única
> que no hay que rehacer cuando llegue el segundo cliente, la cadena con tres marcas o el
> entrenador que también entrena allí. El coste está acotado (~10 ficheros) porque **no toca
> el aislamiento por `orgId`**, que es el 95 % del código.
>
> **Ventana de oportunidad:** hacerlo *antes* del primer cliente de pago. Con TrainingZone ya
> operando, la migración pasa a ser una intervención con parada de servicio.

**Reglas de negocio nuevas:**

- `RB-ID-001` — La credencial (email + contraseña) es **global y única**; la membresía
  (organización + rol) es múltiple. Un email nunca es rechazado por "ya existe".
- `RB-ID-002` — Login único en un solo host. Con una membresía se entra directo; con varias,
  selector explícito. Nunca se elige organización por el usuario sin mostrárselo.
- `RB-ID-003` — Invitar a un email que ya es `Identity` **no pide contraseña nueva**: genera
  una membresía pendiente de aceptar.
- `RB-ID-004` — La organización activa vive en el JWT y **toda** consulta de negocio sigue
  filtrando por ella. Cambiar de organización re-emite sesión; jamás se mezclan datos.

---

## 3. E2 — De la landing al alta: ¿pago antes o cuenta antes?

### Alternativa A — Cuenta primero, pago después (lo construido hoy)

`/signup` (nombre, email, contraseña, empresa) → auto-login → muro `/activar` → Stripe.

- ✅ Ya funciona (salvo el bloqueo de `PUBLIC_PATHS`). Permite recuperar al que abandona el
  checkout: la org queda `PENDING_PAYMENT` y se puede reactivar por email.
- ❌ Pide contraseña **antes** de que el comprador haya decidido: un formulario más entre el
  "quiero esto" y el pago. Es donde más se cae en un funnel B2B.

### Alternativa B — Pago primero, cuenta por email ← **recomendada**

La landing lleva directo a **Stripe Checkout** (email + tarjeta + datos fiscales los recoge
Stripe, incluido NIF vía Tax IDs). El webhook `checkout.session.completed` crea
`Organization` en `ACTIVE` + `Identity`/`User` OWNER **sin contraseña** + un token de
activación, y dispara el email de bienvenida. El director pulsa, pone contraseña y aterriza
en la puesta en marcha.

- ✅ **Un solo formulario antes de pagar, y es el de Stripe.** Máxima conversión.
- ✅ Es literalmente el flujo descrito: *pagar → email de bienvenida con enlace → setup*.
- ✅ Reutiliza casi todo: el token de activación es el `Invitation` que ya existe; la
  activación es `createOwnerAccount` + el `/onboarding/[token]` ya construido.
- ⚠️ **Tres casos que hay que cubrir sí o sí** (son la causa habitual de tickets de soporte):
  1. *"Pagué y no me llegó el email"* → `success_url` = `/activar?session_id=...`, una página
     que muestra el estado y reenvía el enlace. Nunca dejar al comprador ante un "revisa tu correo".
  2. *Webhook duplicado o fuera de orden* → idempotencia por `checkout.session.id` (el patrón
     ya está en `reconcileStripeCheckoutCompleted`).
  3. *El email de pago ya tiene organización* → no se crea otra: se le añade la suscripción a
     la existente, o se le avisa. Con `Identity` (E1) esto es una consulta, no un conflicto.

### Alternativa C — Venta asistida (demo → contrato → alta manual)

Un `PLATFORM_ADMIN` de Apta crea la organización desde un back-office y manda la invitación.

- ✅ Imprescindible para tickets grandes, cadenas y pagos por transferencia/factura.
- ❌ No escala; no sustituye a la venta self-service.
- **Veredicto:** **complementario, no alternativo.** El back-office de Apta hace falta igual
  (soporte, reactivar impagados, alta manual). Que las dos vías desemboquen en el mismo
  `Invitation` de activación.

### Recomendación E2

> **B como camino principal, C como camino asistido, y se conserva A** como entrada desde
> dentro de la app. Los tres terminan en el mismo sitio: una organización creada y un token
> de activación en el correo del director. El "modo lifetime" (compra de por vida) es el mismo
> flujo con `mode: "payment"` y `platformStatus = ACTIVE` sin `currentPeriodEnd`.

**Reglas de negocio:**

- `RB-ALTA-001` — El pago confirmado por webhook es lo único que crea una organización
  operativa. Idempotente por `checkout.session.id`.
- `RB-ALTA-002` — Tras pagar, el comprador **siempre** ve una página con estado y opción de
  reenviar el enlace de activación. El email nunca es el único camino.
- `RB-ALTA-003` — Un pago con un email que ya tiene organización **no** crea una segunda:
  se resuelve contra la existente.

### ⚠️ Nota de arquitecto sobre el "de por vida con actualizaciones"

Vender *lifetime* con actualizaciones incluidas fija un ingreso único contra un coste
recurrente **perpetuo** (hosting, soporte, Stripe, backups, cumplimiento). Con multi-tenant
el coste marginal por cliente es bajo, pero no es cero y no decae. Formas de venderlo sin
que envejezca mal, por orden de menor fricción comercial:

1. **Lifetime = licencia de software; la infraestructura se factura aparte** (una cuota de
   hosting/soporte anual pequeña). Es la fórmula estándar y la que menos sorpresas da.
2. **Lifetime con límites** (nº de centros o socios incluidos; más allá, ampliación).
3. **Lifetime puro**, aceptando el coste como CAC amortizado. Válido si es una oferta de
   lanzamiento **limitada en unidades y en tiempo**, no un producto permanente del catálogo.

El código soporta las tres (`platform-plans.ts` ya modela `interval: "lifetime"` y
`features[]`). **La elección es de dirección y sigue abierta (D-8).**

---

## 4. E3 — Puesta en marcha de la empresa

### Alternativa A — Asistente bloqueante de N pasos

No se entra a la app hasta completar centros → personal → productos → socios.

- ❌ El director que compra un viernes por la noche quiere **ver** lo que ha comprado, no
  rellenar cuatro pantallas. Y no tiene a mano el CSV de socios ni los emails del equipo.
- ❌ Un abandono a mitad deja la organización en un estado raro.

### Alternativa B — Checklist persistente, nada bloqueante ← **recomendada**

Se entra a la app desde el minuto uno, con datos de demo visibles o vacíos elegantes, y un
panel *"Pon en marcha tu gimnasio"* con progreso, siempre accesible y descartable.

| Paso | Bloquea | Estado en código |
|---|---|---|
| 1. Datos de empresa y fiscales | — | ✅ `Organization` (`taxId`, `billingName`) |
| 2. **Primer centro** | Sí — lo mínimo | ✅ `/organization` |
| 3. **Productos** (cuotas, bonos, EP) | Bloquea vender | ⛔ **`MembershipPlan` sin CRUD — hay que construirlo** |
| 4. Equipo (invitaciones) | — | ✅ `createStaffWithInvitation` |
| 5. Socios (alta o import CSV) | — | ✅ `/members`, `member-import.ts` |
| 6. **Conectar Stripe** | Bloquea cobrar online | ✅ OAuth listo (`stripe-connect.ts`) |
| 7. Logo y marca | — | ✅ `logoUrl` por org y por centro |

Solo el paso 2 es requisito duro (los socios cuelgan de un centro). El 3 y el 6 bloquean
únicamente la acción que dependen de ellos, con degradación explicada — el patrón que ya usa
`isStripeConfiguredForOrg`.

**El único hueco real es el paso 3.** Sin gestión de productos, el gimnasio no tiene nada que
vender ni en el mostrador ni online: es la dependencia dura de todo E4.

### Recomendación E3

> **B.** Checklist derivado del estado real (nada de un campo `setupStep` que se
> desincroniza), y **construir el CRUD de `MembershipPlan` como primera pieza** — es
> prerrequisito de E4.

---

## 5. E4 — Que TrainingZone venda sus cuotas a sus socios dentro de Apta

Este es el segundo plano de cobro y **ya está decidido**: Connect Standard, una cuenta Stripe
por gimnasio, una sola clave secreta (la de Apta) + cabecera `Stripe-Account`. El gimnasio no
introduce jamás una clave. Lo que sigue abierto es **el flujo de venta**, y ahí hay tres
niveles que se pueden entregar por separado.

### Nivel 1 — Cobro asistido por recepción (existe, incompleto)

Recepción elige socio + plan → link de Stripe Checkout. Hoy solo `mode: "payment"`: cobra una
vez y **nadie cobra el mes siguiente**. La "suscripción" vive únicamente en nuestra base de datos.

**Lo que falta para que sea real:**

- `MembershipPlan` necesita `stripeProductId`/`stripePriceId` **en la cuenta conectada**. Una
  suscripción de Stripe exige un `Price` recurrente: no vale el `price_data` inline que se usa
  hoy para pagos sueltos. → helper `ensureStripePrice(plan)` que crea el producto/precio la
  primera vez y lo re-crea al cambiar el importe (los precios de Stripe son inmutables).
- Checkout en `mode: "subscription"` cuando el plan es recurrente.
- Webhook Connect: escuchar `customer.subscription.*`, `invoice.paid`,
  `invoice.payment_failed` → mover `Subscription` y `Payment`, y marcar al socio moroso.
- `Member.stripeCustomerId` ya existe, pero **es relativo a la cuenta conectada**: si el
  gimnasio reconecta otra cuenta de Stripe, hay que invalidarlo. Guardar junto a él el
  `accountId` con el que se creó.

### Nivel 2 — Autoservicio del socio en el portal ← **el que quita más trabajo a todos**

El socio, desde su portal o la app móvil: renueva su bono, compra sesiones sueltas, cambia de
plan y gestiona su tarjeta.

- **Compra**: mismo Checkout, iniciado por el socio, con el catálogo de su gimnasio.
- **Gestión (método de pago, historial, cancelación)**: **Stripe Billing Portal** en la cuenta
  conectada. Es una sesión firmada contra la cuenta del gimnasio: **cero UI que construir,
  cero datos de tarjeta pasando por nosotros.** El mayor retorno por línea escrita de todo
  este documento.
- Cierra el agujero A7: hoy, cuando el socio agota el bono, se le corta la reserva y se le
  dice "habla con recepción". Con esto, compra y sigue.

### Nivel 3 — Página pública de venta del gimnasio

Una página por organización (`apta.app/trainingzone` o el propio dominio del gimnasio) con sus
tarifas, donde **un desconocido compra sin tener cuenta**. El webhook crea el `Member`, la
`Invitation` y el email de bienvenida.

- ✅ Es el "cierre online automático" que la propia UI de leads declara pendiente (D5), y
  convierte a Apta en canal de captación, no solo en gestión.
- ✅ Encaja con el CRM ya construido: el `Lead` se cierra solo al confirmarse el pago.

### La alternativa que conviene descartar (y por qué)

**Que Apta cobre y liquide** (*destination charges*, Apta como comerciante de registro):
permitiría cobrar comisión por transacción, pero nos convierte en responsables del cobro, el
KYC, las devoluciones y los contracargos de cientos de gimnasios, con las obligaciones
fiscales que eso arrastra. **No compensa.** Y no hace falta para monetizar: con Connect
Standard se puede aplicar una `application_fee` sobre cada cobro sin cambiar la arquitectura,
si algún día se quiere ese modelo de ingresos.

### Nota sobre métodos de pago en España

Para **cuotas recurrentes**, lo natural es **SEPA Direct Debit** (domiciliación con mandato) y
tarjeta. **Bizum en Stripe está pensado para pagos únicos, no para suscripciones recurrentes**
— conviene confirmarlo contra la documentación vigente antes de prometerlo, porque el enum
`PaymentMethod.BIZUM` ya existe en el esquema sin flujo detrás y es exactamente el tipo de
cosa que un gimnasio da por hecha.

### Recomendación E4

> **Nivel 1 → 2 → 3, en ese orden.** El 1 es la deuda que hace falta pagar (sin cobro
> recurrente no hay producto que vender). El 2 es el que más fricción quita —al socio y a
> recepción— y el que más se apoya en piezas de Stripe ya hechas. El 3 es crecimiento y puede
> esperar al segundo cliente.

**Reglas de negocio:**

- `RB-VENTA-001` — Todo cobro a un socio ocurre en la cuenta conectada del gimnasio. Apta
  nunca es intermediaria del dinero.
- `RB-VENTA-002` — Un `MembershipPlan` recurrente tiene su `Price` en la cuenta conectada; al
  cambiar el importe se crea uno nuevo y **las suscripciones vigentes conservan el anterior**.
- `RB-VENTA-003` — La gestión de método de pago y bajas del socio se delega en el Billing
  Portal de Stripe. Apta no almacena ni muestra datos de tarjeta.
- `RB-VENTA-004` — Si el gimnasio no tiene Stripe conectado, las superficies de venta
  desaparecen con explicación; nunca fallan.

---

## 6. E5 — Marca, dominios y emails

**Dominios (recomendado):** un solo host de aplicación (`app.apta.com`) para todo el mundo —
directores, staff y socios—, más la landing comercial (`apta.com`) y, opcionalmente, páginas
públicas de venta por cliente en ruta (`app.apta.com/trainingzone`). Subdominio por cliente
solo si un cliente grande lo exige y lo paga.

**Emails — decisión que sí percibe el socio.** El socio de TrainingZone no ha comprado Apta:
ha comprado TrainingZone. Sus correos de bienvenida, recibos y avisos deben **verse como de su
gimnasio**:

- `From: TrainingZone <no-reply@apta.app>` con `Reply-To` del gimnasio, logo y colores de la
  organización (`Organization.logoUrl` ya existe y las plantillas ya lo aceptan).
- Apta aparece discretamente al pie ("con tecnología de Apta").
- Los correos de **facturación de plataforma** (Apta → director) sí van con marca Apta: ahí el
  cliente es el director.
- A futuro, dominio de envío propio del cliente (DKIM delegado) como opción premium.

- `RB-MARCA-001` — Toda comunicación dirigida a un socio lleva la marca de su organización;
  solo las de plataforma llevan la de Apta.

---

## 7. Comparativa: intrusión frente a coste

Escala 1 (nada intrusivo) a 5 (muy intrusivo).

| Eje | Opción | Socio | Gimnasio | Coste | Veredicto |
|---|---|---|---|---|---|
| E1 | A — statu quo | **5** | 4 | 1 | Descartar |
| E1 | **B — Identity + membresías** | **1** | 1 | 3 | ✅ **Recomendada** |
| E1 | C — identidad externa | 2 | 2 | 3 + coste/MAU | Más adelante, si acaso |
| E1 | D — subdominio por tenant | 4 | 2 | 4 | Descartar |
| E2 | A — cuenta primero | — | 3 | 0 (hecho) | Conservar como entrada secundaria |
| E2 | **B — pago primero** | — | **1** | 2 | ✅ **Recomendada** |
| E2 | C — venta asistida | — | 1 | 2 | Complementaria (hace falta igual) |
| E3 | A — asistente bloqueante | — | 4 | 2 | Descartar |
| E3 | **B — checklist** | — | **1** | 2 | ✅ **Recomendada** |
| E4 | N1 — cobro asistido | 3 | 2 | 3 | Deuda a pagar primero |
| E4 | **N2 — autoservicio + Billing Portal** | **1** | 1 | 2 | ✅ **Mayor retorno** |
| E4 | N3 — página pública de venta | 1 | 1 | 3 | Crecimiento |
| E4 | Apta como comerciante | 1 | 1 | 5 + riesgo | Descartar |

---

## 8. Orden de ejecución propuesto

| Fase | Contenido | Depende de | Por qué ahí |
|---|---|---|---|
| **F-0** | `/signup`, `/activar`, `/verificar-email` a `PUBLIC_PATHS` | — | Una línea. Hoy el alta es inalcanzable |
| **F-1** | **E1: `Identity` + membresías + selector de organización** | — | **Antes del primer cliente de pago.** Después es una migración con parada |
| **F-2** | Catálogo de planes de plataforma (`platform-plans.ts` está vacío) + precios en Stripe | Decisión D-8 de dirección | Sin esto no se puede cobrar nada, ni siquiera con el código hecho |
| **F-3** | **E2: checkout desde la landing + activación por email** (+ back-office mínimo de Apta) | F-1, F-2 | El recorrido comercial completo |
| **F-4** | **E3: CRUD de `MembershipPlan`** + checklist de puesta en marcha | F-3 | Prerrequisito duro de la venta del gimnasio |
| **F-5** | **E4 nivel 1**: precios en cuenta conectada, `mode: "subscription"`, webhooks de suscripción | F-4 | Aquí el gimnasio cobra de verdad, mes a mes |
| **F-6** | **E4 nivel 2**: compra y renovación desde el portal + Billing Portal | F-5 | El salto de calidad percibida, con poco código |
| **F-7** | E5 (marca en emails) + E4 nivel 3 (página pública de venta) | F-6 | Pulido y crecimiento |

**Se puede empezar hoy por F-0, F-1 y F-4 sin credenciales de Stripe.** F-2, F-3, F-5 y F-6
requieren la cuenta de Apta con Connect activado.

### Recordatorio incómodo pero necesario

Hay dos huecos fuera de este documento que **bloquean un piloto real** y conviene no
descubrirlos con el cliente dentro (ambos catalogados en `ANALISIS_FALTAS_IMPLEMENTACION.md`):

- **No existe recuperación de contraseña** (A9). Con login global y cientos de socios, es la
  primera incidencia de soporte que va a llegar. F-1 es el momento natural de resolverlo,
  porque toca exactamente el mismo código.
- **Las reglas automáticas dependen de un cron que no está programado**, y si
  `JOBS_CRON_SECRET` no está definido el endpoint queda **abierto sin autenticación** (A11).

---

## 9. Decisiones de dirección — **cerradas**

Resueltas el 2026-07-29. El detalle ejecutable vive en
`docs/PLAN_IMPLEMENTACION_APTA_COMERCIAL.md` §1, que es a partir de aquí la fuente de verdad.

| # | Decisión |
|---|---|
| **D-8** | Tres tiers por número de **centros** (Esencial 79 €/mes · Avanzado 149 € · Élite 279 €, con año a 10 meses) + **Fundador**, lifetime de lanzamiento limitado a 3.990 € con funcionalidad de Avanzado y **sin IA**. Los diferenciadores (salud/aptitud, retención, feedback, BI) van en Avanzado; Élite solo añade lo que tiene coste marginal real |
| **D-9** | **Solo licencia, cero comisión.** Sin `application_fee`. Lo que el gimnasio vende a sus socios es íntegramente suyo |
| **D-10** | **Sin prueba gratuita.** `TRIALING` queda sin uso |
| **D-11** | Multi-organización **se soporta técnicamente pero no se anuncia**: sin UI de cadenas ni franquicias |
| **D-12** | **Apta no factura.** Cada gimnasio con su herramienta; conectar Stripe desbloquea funcionalidad dentro de la app |

---

*Documento de arquitectura: propone y compara, no implementa. Las decisiones ya cerradas de
los dos planos de cobro viven en `PLATAFORMA_COBRO_SMTP_STRIPE_CONNECT_IMPLEMENTACION.md` y no
se reabren aquí.*
