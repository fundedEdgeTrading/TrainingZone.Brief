# Revisión completa: web app y app móvil

**Fecha:** 6 de septiembre de 2026 · **Repositorio:** `fundedEdgeTrading/TrainingZone.Brief` · **Rama:** `claude/web-mobile-app-review-eqc051`

Revisión encargada sobre las dos superficies del producto, realizada por once agentes asesores especializados (coherencia funcional, SEO, UI/UX, Stripe, cartografía, cumplimiento normativo, socio, entrenador, negocio, QA y seguridad). Buena parte de los hallazgos **no son lectura de código**: se levantó Postgres, se sembró la demo, se arrancó la aplicación, se ejecutaron las suites de pruebas y se ejercitó la API móvil con tokens reales de cada rol. Donde un dato está medido, se dice; donde es una inferencia, también.

## Las dos apps de un vistazo

| | Web app | App móvil |
|---|---|---|
| Stack | Next.js 16 (App Router), Prisma 7, Auth.js v5, Tailwind 4 | Expo 57 / React Native 0.86, expo-router, TanStack Query |
| Código | ~68.800 líneas, 483 ficheros | ~14.900 líneas, 86 ficheros |
| Superficie | 58 páginas · 62 route handlers (52 de ellos son la API móvil) | 30 pantallas · 5 pestañas por rol · **8 roles** |
| Modelo de datos | 52 modelos Prisma, 1.825 líneas de esquema | — (consume `/api/mobile/v1`) |
| Pruebas | 219 unitarios ✅ · 26 specs Playwright · `tsc` y lint ✅ | `typecheck` y lint ✅ · **0 tests** |
| Nota de usabilidad | **6,4 / 10** | **6,9 / 10** |
| Publicable | sí | **no**: sin `bundleIdentifier`, sin `package`, sin `eas.json` |

**Todas las comprobaciones automáticas pasan**: `tsc --noEmit` sin errores, ESLint sin avisos, 219/219 unitarios, `expo lint` y `tsc` de la app móvil limpios, y el subconjunto ejecutado de Playwright 7/7. **Los 32 fallos de QA de este informe son cosas que las pruebas actuales no cubren**, y eso es la conclusión más importante del capítulo 8.

## Cómo leer este informe

Cada capítulo responde a uno de los puntos del encargo y va **separado por app** donde tiene sentido. Los capítulos 5 (Stripe), 6 (mapa) y 7 (cumplimiento) son transversales por naturaleza, pero también distinguen web y móvil dentro. El capítulo 9 reordena todo en un único plan priorizado: si solo se va a leer una cosa, que sea esa.

Dos hallazgos aparecieron **por duplicado y de forma independiente** —el auditor de seguridad y el de QA llegaron a los mismos dos agujeros de aislamiento por caminos distintos—, lo que sube bastante la confianza en ellos.

## Índice

1. [Código y funcionalidades redundantes o repetidas](#1-código-y-funcionalidades-redundantes-o-repetidas)
2. [Recomendaciones de los agentes asesores](#2-recomendaciones-de-los-agentes-asesores) — socio · entrenador · negocio · seguridad
3. [Carencias para posicionamiento SEO](#3-carencias-para-posicionamiento-seo)
4. [Nivel de User Friendly](#4-nivel-de-user-friendly)
5. [Stripe: estado real, historias de usuario, pasos y requisitos](#5-stripe-estado-real-historias-de-usuario-pasos-y-requisitos)
6. [Mejora del mapa de Leaflet](#6-mejora-del-mapa-de-leaflet)
7. [Revisión de cumplimiento normativo](#7-revisión-de-cumplimiento-normativo-clientes-y-trabajadores)
8. [QA: regresión, permisos y cobertura de pruebas](#8-qa-regresión-permisos-y-cobertura-de-pruebas)
9. [Plan priorizado](#9-plan-priorizado)

## Los ocho hallazgos que hay que mirar hoy

1. **El semáforo de aptitud se apaga en silencio.** La regla casa por igualdad de texto exacto (`brief-queries.ts:88`) entre dos campos libres, y la valoración escribe la zona **sin lado** mientras el catálogo está lateralizado: de las ocho zonas de dolor que puede marcar un socio, **solo dos encuentran regla**. El resto sale como "Sin restricciones". Y **el móvil ni siquiera pinta las condiciones sin regla** —hipertensión, embarazo, cirugías— aunque el servidor se las manda. *(§2.2)*
2. **Borrar una sesión quema el bono de todos los socios apuntados.** Verificado: reserva descuenta (5 → 4), se borra la sesión, **el bono se queda en 4**. Sin devolución, sin aviso y sin `AuditLog`. Es pérdida de dinero del socio a escala de clase entera. *(§8.1 W-02)*
3. **Congelar o cancelar una suscripción no la para en Stripe.** Ninguna acción del ciclo de vida llega a la pasarela: **se sigue cobrando a quien has dado de baja**. Y cambiar de plan abre una segunda suscripción sin cancelar la primera. *(§5.1)*
4. **Un socio no puede darse de baja ni ver lo que paga.** Para cancelar hay que cerrar sesión e ir a la página pública donde el gimnasio vende altas a pedir un enlace por email. La pantalla "Mi membresía" **no muestra el precio de la cuota**. *(§2.1)*
5. **Dos fugas de aislamiento entre centros, demostradas end-to-end**: el Session Brief entrega **lesiones y adaptaciones** de socios de otro centro (y lo audita como lectura legítima), y la agenda móvil permite **crear, renombrar y borrar sesiones** de un centro ajeno — que además, por el punto 2, quema los bonos de sus socios. *(§2.4, §8)*
6. **El muro de pago se salta por URL, y el módulo caro no está gateado en ningún sitio.** Las rutas hijas de los módulos premium no llaman a `requireFeature`, la API móvil **no comprueba el plan en ninguna ruta**, y `ia_programacion` —el único con coste marginal real, ~0,18 $ por generación— no aparece en `FEATURE_BY_ROUTE`. *(§8, §1.2)*
7. **El formulario público de leads capta datos de salud sin base jurídica**, sin capa informativa y con `consentSignedAt` estampado automáticamente. Y **no existe contrato de encargado del tratamiento** entre Apta y el centro. *(§7)*
8. **Un debrief resucita una reserva cancelada a "Asistió".** Verificado: reserva cancelada con el bono ya devuelto pasa a `ATTENDED`, ocupa aforo y cuenta como asistencia gratis en adherencia, retención y KPIs. En los cuatro puntos de escritura, ninguno valida el estado de partida. *(§8 W-03/M-06)*

## 1. Código y funcionalidades redundantes o repetidas

> **Método**: este capítulo no es lectura de código a secas. Se levantó Postgres, se sembró la demo con `prisma/seed.ts`, se arrancó `next dev` y se consultó la API móvil autenticándose con los usuarios demo reales. **Todos los números de esta sección están medidos, no inferidos.**

### 1.1 WEB APP

#### Callejones sin salida y flujos huérfanos

**W-01 · ALTO — "Tu rutina para casa": el socio la pide, nadie puede confirmarla, y el botón se bloquea para siempre.**
`portal/evolucion/page.tsx:192` pinta la tarjeta y `workout-request-button.tsx:19` promete *"tu entrenador la confirmará pronto"*. `src/lib/workout-programs.ts:29` crea el `WorkoutProgram` en `DRAFT` y `:39-42` notifica a dirección. **La pantalla que confirma no existe montada en ningún sitio**: `WorkoutProgramList` (`members/[id]/workout-panel.tsx:11`) y `confirmWorkoutProgramAction` se retiraron de la ficha el 23-08-2026 y no se remontaron — `grep -rn "WorkoutProgramList"` devuelve **una sola referencia: su propia definición**. Remate: `page.tsx:36` deshabilita el botón si hay una en `DRAFT`, y como nadie puede sacarla de ahí, **el socio pierde la funcionalidad de forma permanente tras el primer clic**. Y la notificación lleva a `/members/{id}`, ficha que ya no tiene esa pestaña: el director aterriza sin nada que hacer.
*Recomendación*: eliminar la tarjeta + `RequestWorkoutButton` + `requestWorkoutProgram` (coherente con la decisión documentada), o remontar `WorkoutProgramList`. Lo que no puede quedarse es el emisor vivo y el receptor apagado.

**W-02 · ALTO — El chat del socio dice "responde al instante" y nadie puede leerlo.**
`portal/layout.tsx:61` monta `FloatingChat` en todas las pantallas y `floating-chat.tsx:145` rotula literalmente **"En línea · responde al instante"**. **Ningún componente del lado del personal lee la conversación**: `StaffChatThread` está exportado y sin montar, `src/lib/chat.ts` no crea ninguna `Notification` (0 coincidencias de `otification` en el fichero), y la app móvil no tiene chat. Además `portal/chat/actions.ts:18` revalida `/portal/chat`, una ruta que solo es un `redirect`.
*Mínimo inmediato*: quitar la promesa "responde al instante".

**W-03 · ALTO — `/hazte-socio` y `/lead-form` no tienen puerta de entrada en todo el producto.**
`grep -rn "hazte-socio\|lead-form"` fuera de sus propias carpetas devuelve **solo** el allowlist del middleware (`public-paths.ts:14,17`) y dos comentarios. La "Puesta en marcha" (`setup-checklist.ts:37-88`) tiene 7 pasos y **ninguno enseña la URL pública del centro**; `/organization` recoge el `slug` (`:265`) y jamás lo devuelve como enlace. **El embudo comercial completo solo es alcanzable si el gimnasio construye la URL a mano.**
*Recomendación*: paso 8 en el checklist y bloque "Tus enlaces públicos" en Organización → Centros, con copiar-al-portapapeles. **Es una línea de UI que desbloquea el embudo entero.**

**W-04 · MEDIO — Dos landings públicas por centro con resultados incompatibles.**
`/lead-form/...` crea `Lead` sin cobro; `/hazte-socio/...` crea `Member` + `Subscription` + `Invitation` **sin crear ningún `Lead`**. Pero `initiateLeadConversion` (`leads-queries.ts:250`) contempla `closeType: "ONLINE"` — *"cierre online: lo genera la plataforma sin contacto previo"* —, y **ese camino no lo alimenta nadie**. Efecto: `getLeadCloseRate` y `getLeadCloseTypeBreakdown` **nunca ven las ventas online**: la tasa de cierre del panel de dirección está sesgada por construcción.

#### Lógica de negocio duplicada

**W-05 · ALTO — Cinco sitios crean `Subscription`, con reglas de saldo distintas.**

| Sitio | `sessionsRemaining` | `status` |
|---|---|---|
| `invitations.ts:109` (alta con bonos) | `plan.sessionsIncluded ?? null` | `ACTIVE` |
| `members/[id]/actions.ts:360` (`addSubscription`) | `plan.sessionsIncluded ?? null` | `ACTIVE` |
| `stripe-checkout.ts:86` (webhook, bono puntual) | `plan.sessionsIncluded ?? null` | `ACTIVE` |
| `members/import-actions.ts:121` (CSV) | solo si `SESSION_PACK` | por defecto |
| `member-billing.ts:364` (webhook recurrente) | **no lo pone** | de Stripe |

El propio código lo admite (`members/[id]/actions.ts:334-336`: *"no se ha extraído a un módulo compartido para no crear una abstracción de una sola llamada"*). **Ya son cinco llamadas.** Y el caso 5 es un bug de negocio: `bonoUsage` (`session-balance.ts:76`) devuelve `null` (= **ilimitado**) cuando `sessionsRemaining == null`, así que **un plan `MONTHLY` con `sessionsIncluded: 8` comprado por Stripe queda ilimitado**, mientras el mismo plan vendido en recepción queda topado a 8. (En la semilla no hay ningún plan `MONTHLY`, así que este camino **nunca se ha ejercitado**.)
*Recomendación*: `createSubscriptionFromPlan(tx, {...})` en `src/lib/subscriptions.ts` como fuente única del contrato `priceCents / sessionsIncluded / sessionsRemaining`.

**W-06 · MEDIO — Tres escritores de `SessionDebrief`, dos con criterio de `feeling` incompatible.** `brief/[id]/actions.ts:12` (web, solo 🟢🟡🔴), `api/mobile/v1/trainer/brief/[id]/debrief/route.ts:12` (copia literal, comentada como *"espejo"*), y `api/mobile/v1/trainer/sessions/[id]/feedback/route.ts:119` (8 ejes 1-10, que **deriva** `feeling` con `feelingFor()`). `feeling` tiene dos fuentes de verdad: un entrenador puntúa 8 ejes en la app (media 8,5 → `GREEN`), luego toca 🔴 en la web, y queda `feeling: RED` con `technique: 9, progress: 9`. **Nadie reconcilia.**

**W-07 · MEDIO — `/agenda/session/[id]` y `/brief/[id]`: dos rosters de la misma sesión, para los mismos roles, uno de pago.** Mismo `requireRole`, mismo `sessionId`, dos consultas distintas; el check-in/no-show vive en una y el debrief en la otra, y **`/brief` está gateado por plan** (`rbac.ts:85`) mientras `/agenda/session/[id]` no. Y `trainer/pending-panel.tsx:77` manda los *"debriefs pendientes"* a `/agenda/session`, **la pantalla que no tiene el formulario de debrief**. Consecuencia: **en plan Esencial el entrenador no tiene dónde registrar el 🟢🟡🔴 en la web.**
*Recomendación*: fusionar en `/agenda/session/[id]` como fuente única, con salud y debrief gateados *dentro* de la pantalla — que es la política que `rbac.ts:73-83` ya declara para `/dashboard`.

**W-08 · MEDIO — `SERVICE_LABEL` redefinido siete veces, con cuatro nombres para lo mismo.** `session-booking.ts:31` (canónico), `(app)/layout.tsx:21`, `portal/agenda/page.tsx:20`, `portal/membresia/page.tsx:24`, **`members/[id]/bonos-panel.tsx:46` (que dice `Personal Training` y `Grupos`)**, `hazte-socio/.../page.tsx:14` y `members/members-filters.ts:30` — más `BALANCE_LABEL` en la app móvil (`agenda.tsx:29`), que es la octava. **El socio ve "Entrenamiento personal" en su portal y recepción ve "Personal Training" en su ficha, para el mismo bono.**

**W-09 · BAJO — Wrapper y stubs redundantes.** `createCheckoutSession` (`stripe-checkout.ts:20`) es una línea que llama a `createMemberCheckout`, con un solo consumidor. `/portal/plan`, `/portal/comprar` y `/portal/chat` tienen **doble redirect** (308 en `next.config.ts:9-10` **y** un `page.tsx` con `redirect()`), así que los `page.tsx` son inalcanzables. Y `rbac.ts:403-405` sigue declarando `OFF_NAV_TITLES` para esas tres rutas muertas.

**W-10 · BAJO — Código aparcado que sigue exportado.** Fichajes (`TimeClockWidget`, `clockIn/Out/signEntry`, `crossCheckHours` con **0 consumidores**, modelo `TimeClockEntry`), chat de staff (`StaffChatThread`, `chat-actions.ts`, `canAccessMemberChat`) y rutinas (`workout-panel.tsx`, `workout-actions.ts`).

> **Dos premisas del encargo que hay que corregir**: `(app)/_perfil/` **no es una ruta duplicada** — es una carpeta privada de Next (prefijo `_`) sin `page.tsx`, que exporta `ThemeCard` y `updateMyThemeAction` compartidos por `/mi-perfil` y `/portal/perfil`. Está bien factorizada. Y `/demo-checkout` **no** duplica `/hazte-socio`: es el sustituto del checkout de **plataforma** (Apta → gimnasio) cuando Stripe no está configurado, otro plano de negocio; ambos caminos convergen correctamente en `provisionOrganization`.

### 1.2 APP MÓVIL (y la API `/api/mobile/v1`)

#### Divergencias graves web ↔ móvil

**M-01 · ALTO — La API móvil no aplica el gateo por plan. Verificado en ejecución.**
`api/mobile/v1/_lib/api-session.ts:33-38` solo comprueba `isPlatformOperational`. **Nunca llama a `orgHasFeature`**, y no hay una sola referencia a `requireFeature` en toda `src/app/api/mobile/`.
Prueba ejecutada: con la organización demo en `platformPlan = 'esencial_mes'` (`features: []`, sin `salud_aptitud`) y el token de `entrenador@trainingzone.es`:
```
GET /api/mobile/v1/trainer/brief                  → 200, lista completa de sesiones
GET /api/mobile/v1/trainer/members?filter=alerts  → 200, {"light":"RED","zone":"rodilla derecha", ...}
```
En web esas mismas dos cosas redirigen a `/planes?feature=salud_aptitud`. **Session Brief, semáforo de aptitud, zona de lesión, rangos de composición y feedback 1-10 son gratis desde la app para clientes que no los han comprado.** Es una fuga de ingresos directa.
*Recomendación*: `requireApiFeature(claims, feature)` en `_lib/api-session.ts` aplicado a `/trainer/brief*`, `/trainer/members*`, `/trainer/sessions/[id]/feedback` y `/mesocycles*`, más un `FEATURE_BY_ROUTE` móvil para que no se pueda montar una ruta nueva sin declarar su gate.

**M-02 · ALTO — Sacar a alguien de una sesión: dos reglas opuestas según desde dónde lo hagas.**

| | Web → "Cancelar reserva" | Móvil → "Descartar asistente" |
|---|---|---|
| Función | `cancelSessionBooking` (`agenda-queries.ts:362`) | `discardAttendeeAsStaff` + `trainerDiscardEffect` (`attendee-discard.ts:53`) |
| Devuelve el bono | **siempre** (`:397-402`) | **solo con >24 h**, salvo override |
| Deja `AuditLog` | no | sí |

Misma persona, misma operación, economía opuesta — **y la web es la ruta fácil: para regalar una sesión dentro de las 24 h basta con abrirla desde el navegador en vez de desde la app.** `attendee-discard.ts:1-21` documenta la regla como distinta de la cancelación del **socio**, pero nadie la comparó con la del **staff**, que es la que colisiona.

**M-03 · ALTO — El no-show no existe en la app, y eso rompe cuatro cosas aguas abajo.** `markBookingNoShow`/`clearBookingNoShow` (RB-RES-009: motivo obligatorio + decisión explícita de devolución) tienen un único consumidor, `(app)/agenda/session/[id]/actions.ts:123,81`. **No hay endpoint móvil.** Un entrenador que trabaje solo desde la app: (1) marca asistencia implícitamente al guardar el debrief, (2) deja en `BOOKED` para siempre a quien no apareció, (3) **nunca dispara la alerta de 3 faltas seguidas a dirección** (`no-show-alerts.ts`), y (4) falsea `getNoShowRate` y la línea "No presentada" del historial.

**M-04 · ALTO — El panel de dirección cuenta distinto en cada app. Medido sobre la misma organización, el mismo día.**

| Métrica | Web `/dashboard` | Móvil `/dashboard` | Origen de la divergencia |
|---|---|---|---|
| Socios activos | 49 | 49 | ✔ coincide |
| Ingresos del mes | 15 €, ↓96,8 % "vs. agosto a esta fecha" | 15 €, `deltaPct: -99,6` | web prorratea al mismo día del mes; móvil compara contra **agosto entero** (`_lib/dashboard.ts:59-61`) |
| **Morosos** | **8** | **9** | web = `Member.state = 'DELINQUENT'` (`dashboard-queries.ts:851`); móvil = `count(distinct memberId)` de `Payment` en `PENDING\|FAILED` **sin ventana temporal** (`_lib/dashboard.ts:69-71`) |
| Ocupación / asistencia | "Ocupación media **7 %**" (asistentes/aforo) | "Asistencia media **91 %**" (asistidas/(asistidas+faltas)) | dos métricas distintas, **ambas presentadas como *la* salud de la agenda** |

SQL de contraste: `Member.state = DELINQUENT` → **8**; `count(distinct memberId)` de pagos pendientes/fallidos → **9**. Además `_lib/dashboard.ts:26` cuenta bajas con `cancelledAt: { gte: monthStart }` **sin cota superior**: una baja programada a futuro ya cuenta como baja del mes.
*Recomendación*: borrar `_lib/dashboard.ts` (79 líneas) y servir `getKpiTiles()` + `getRevenueSeries()`. Si el móvil necesita otra forma, que sea **otro nombre**, no el mismo con otro número.

**M-05 · ALTO — Editar un producto desde la app rompe el espejo de Stripe y salta la regla "archivar, nunca borrar".**

| | Web `/organization` | Móvil `/products` |
|---|---|---|
| Tipo de plan | `type` explícito, 6 valores | `serviceKind` de 3 → `planTypeFor`. **`DROP_IN` y `DUO` son inalcanzables**, y editar uno lo convierte silenciosamente en `SESSION_PACK` |
| `description` / `imageUrl` | **no existen en el formulario** | sí |
| Cambio de precio | invalida `stripePriceId` (`:457-460`) | **no lo invalida** (`[id]/route.ts:37-50`) |
| Borrado | archivar (`active=false`), *"Archivar, nunca borrar (RB-VENTA-002)"* | `prisma.membershipPlan.delete()` (`:74`) |

Dos consecuencias reales: **(1) dinero** — subir el precio desde la app deja `stripePriceId` apuntando al precio viejo, `ensureStripePrice` lo devuelve tal cual porque la cuenta conectada coincide, **y todos los checkouts siguientes cobran el importe anterior**; **(2) contenido de venta** — `description` e `imageUrl` son lo que ve el socio en el catálogo del móvil **y en `/hazte-socio`**, y un gimnasio que solo use la web **no puede rellenarlos nunca**.

**M-06 · ALTO — "Historial de consumo": el libro mayor del bono no cuadra consigo mismo. Verificado.**
Respuesta real de `GET /api/mobile/v1/portal/consumption` para `socio@trainingzone.es`: `balances` dice `"used":5,"remaining":7,"total":12`; `summary` dice `{"spent":0,"returned":0,"noShow":9}`; y `movements` tiene **2 líneas, ambas "Alta de <plan>"**. En la **misma pantalla**: la tarjeta dice "5 gastadas de 12", el resumen dice "0 gastadas" y "9 no presentadas", y el listado que promete *"aquí aparece cada sesión gastada y cada devolución"* (`consumo.tsx:105`) **no tiene ni una línea de consumo**.
Causa: `consumption/route.ts:75` hace `delta: b.subscriptionId ? -1 : 0` y `:126` filtra `delta !== 0` — y **1.458 de 1.458 `ATTENDED` y 155 de 155 `NO_SHOW` tienen `subscriptionId = NULL`** (verificado por SQL): la reserva pierde el vínculo con el bono al cancelarse y el histórico nunca lo tuvo, así que **todo movimiento de consumo se filtra**. Además `spent` y `noShow` salen del mismo array y se contradicen por construcción, y las devoluciones se leen **solo** de `AuditLog` con `BOOKING_DISCARDED*`, que únicamente escribe el descarte móvil: **las devoluciones por web y por el propio socio no aparecen nunca**.
*Recomendación*: o se introduce un `SessionLedger` real (una fila por movimiento, con signo y motivo), o se retira la pantalla. **Tal como está promete una contabilidad que el modelo de datos no puede sostener.**

#### Promesas incumplidas de la app

**M-07 · MEDIO — La ventana de cancelación dice 12 h; el servidor aplica 24 h.** `portal-queries.ts:271` fija `DEFAULT_CANCEL_WINDOW_HOURS = 24` configurable por entorno; la web la interpola, la app la **hardcodea a 12 en tres sitios** (`agenda.tsx:371-372`, `sesiones.tsx:61`, `index.tsx:72`) aunque el servidor ya le manda `canCancelFreely` resuelto. `attendee-discard.ts:9` ya lo documenta como conocido.

**M-08 · MEDIO — El checkout móvil llama "/mes" a bonos de sesiones.** `onboarding/planes.tsx:163` pinta **`/mes`** sin condición alguna, y el catálogo sembrado es todo `SESSION_PACK`/`PERSONAL_TRAINING`: "40 €/mes" para un bono de 4 sesiones que caduca a 30 días. `pago.tsx:92-94` muestra *"Siguiente cobro {hoy+1 mes}"* para ese mismo bono no recurrente. **La web lo hace bien** con `isRecurring(plan.type)` (`hazte-socio/.../page.tsx:24-27`), y **el dato ya viaja**: `ProductItem.planType` está en la respuesta y no se usa. Y `pago.tsx:104` remite a *"Mi membresía"*, pantalla que **no existe en la app**.

#### Endpoints y pantallas redundantes

**M-09 · MEDIO — Dos endpoints de checkout de socio, uno muerto.** `POST /api/mobile/v1/checkout` y `POST /api/mobile/v1/portal/billing/checkout` hacen lo mismo y difieren **solo** en el manejo del error. Recorridos los 51 endpoints móviles contra `queries.ts` + `auth-context.tsx`, **los únicos dos sin consumidor** son `POST /portal/billing/checkout` y `POST /portal/billing/portal`.

**M-10 · MEDIO — El bono del socio está repartido en cuatro pantallas y dos endpoints que lo calculan por caminos distintos.** `mas.tsx:187-218` (tarjeta con anillo + "Ver consumo" + "Ampliar"), `mas.tsx:233-240` (dos filas más, una al **mismo destino** que el botón de arriba), `bonos.tsx` (`/portal/memberships`) y `consumo.tsx` (`/portal/consumption`, que **vuelve a devolver `balances`** calculados por suscripción mientras el otro los calcula agregando por `serviceKind`). **La web resuelve todo esto en una sola pantalla**, `/portal/membresia`.

**M-11 · MEDIO — La app reimplementa a mano el RBAC y el esquema del servidor.** `auth/routes.ts:133-158` redefine cinco predicados de `rbac.ts` (el comentario los llama *"espejo"*), y **ya hay una asimetría**: `canManageCenterCapacity` incluye `OWNER`, así que `mas.tsx:86` muestra "Aforo de clases" a dirección de organización, que en web **no tiene esa entrada** por decisión deliberada. Y `api/types.ts` son **938 líneas escritas a mano** que reproducen enums de Prisma y las formas de respuesta de 51 endpoints, sin nada que las valide. Un nombre ya divergió: `types.ts:837` define `LeadStage` con los valores del enum Prisma **`LeadStatus`**, que es el que usa el propio endpoint móvil.

**M-12 · MEDIO — "Qué abre este aviso": dos resolutores parcialmente disjuntos.**

| `entityType` | Web `notification-bell.tsx:18-24` | Móvil `notificaciones.tsx:44-64` |
|---|---|---|
| `Lead` | `/leads/{id}` | `/leads` (**se descarta el id**) |
| `Member` | `/members/{id}` | `/mis-socios` (lista, y **pantalla de entrenador**: recepción y dirección caen fuera de su rol) |
| `MemberNoShowStreak` | `/members/{id}` | **sin acción** |
| `Booking` / `ClassSession` | **sin enlace** | `/sesiones` o `/panel` |
| `Subscription` / `Payment` | **sin enlace** | `/consumo` (solo socio) |

**M-13 · MEDIO — La app tiene una pestaña "Feedback" que no es el "Feedback" de la web.** Hay **cuatro** cosas llamadas feedback/debrief con tres escalas incompatibles: `SessionDebrief` (🟢🟡🔴 + 8 ejes), `TrainerDebrief` (9 dims 0-10, **solo web**), `ClientFeedback` (las mismas 9 dims) y `SelfAssessment` post-sesión (🟢🟡🔴 + rpe). Los **8 ejes solo se pueden rellenar desde el móvil**; el **debrief mensual solo desde la web** — y su payload viaja al móvil sin que `TrainerPanelResponse` lo declare siquiera: **payload muerto y funcionalidad inalcanzable**. Además hay ejes con dos nombres (`adher`/`adherence`, `prog`/`progress`, `esf`/`rpe`).

**M-14 · BAJO — El muro de compra del socio solo tiene una salida: cerrar sesión.** `(tabs)/_layout.tsx:107` redirige de forma permanente a `/onboarding/planes` si `!hasActiveMembership`; si el gimnasio no tiene Stripe Connect, `/checkout` responde `mode: "manual"` y la pantalla dice *"Habla con recepción"*. El único escape es "Cerrar sesión".

**M-15 · BAJO — Divergencias menores.** "Añadir al calendario" (`utils/calendar-link.ts:14`) no tiene equivalente en el portal web. `utils/format.ts` reimplementa 15 helpers de fecha/moneda que en web viven en `src/lib/date-utils.ts` — aquí la duplicación **es defendible** (el móvil no puede importar código con `prisma` en el grafo), pero conviene mover las partes puras a un módulo sin dependencias y compartirlo.

### 1.3 Qué tocar primero

1. **M-01** — gatear la API móvil por plan. Fuga de ingresos, y se arregla con un helper y cinco líneas por ruta.
2. **W-01 / W-02** — cerrar o quitar los dos flujos que el socio inicia y nadie recibe. Son promesas rotas visibles.
3. **M-05** — `saveMembershipPlan()` compartido: **hay un cobro con precio obsoleto esperando a ocurrir**.
4. **M-02 + M-03** — unificar la salida de un asistente y llevar el no-show al móvil.
5. **M-04** — un único `dashboard-queries.ts`; borrar `_lib/dashboard.ts`.
6. **W-05** — `createSubscriptionFromPlan()`: cinco copias, una de ellas regala sesiones ilimitadas.
7. **M-06** — decidir si el libro mayor del bono es un producto real (necesita tabla) o se retira.
8. **W-03** — enseñar las URLs públicas del centro en la puesta en marcha.

**Refactors de bajo riesgo y alto orden**: W-08 (`SERVICE_LABEL` único), M-09 (borrar `portal/billing/`), W-09 (borrar wrapper y `OFF_NAV_TITLES` muertos), M-07 (ventana de cancelación desde el servidor).

## 2. Recomendaciones de los agentes asesores

Cuatro miradas sobre el mismo producto: quien paga la cuota, quien está en la sala, quien tiene que venderlo y quien intenta romperlo. Las recomendaciones de SEO, usabilidad, Stripe, mapa y cumplimiento tienen capítulo propio más adelante.

Donde los cuatro coinciden, conviene hacer caso: **el semáforo de aptitud no es fiable, el ciclo de vida del cobro no llega a Stripe, y el socio no puede gestionar su propio dinero.**

### 2.1 El socio que paga la cuota

#### WEB — Portal del socio

**Lo que está bien y no hay que romper**: el bloque *"Transparencia · lo que adapta tu entrenador"* (`portal/page.tsx:120`) — que el socio vea escrito que su hombro está contemplado es lo que diferencia esto de un calendario; `/portal/evolucion`, honesto y sin infantilismos (peso, % graso, músculo, cintura, fotos, comparador, objetivos); el texto del modal de cancelación fuera de plazo, clarísimo; el chat flotante presente en todas las pantallas del portal (`layout.tsx:60`), que es la alternativa real al WhatsApp con el entrenador; y la descarga de datos.

**Lo que está mal repartido.** Los cuatro KPI de la home son "Sesiones este mes / este año / Total histórico / Tu mejor mes" (`portal/page.tsx:80-93`). **Ninguno es el saldo del bono**, que vive en `BonoCard` del sidebar (`sidebar.tsx:494`) — y el sidebar en móvil es un cajón detrás de la hamburguesa (`lg:translate-x-0`, `sidebar.tsx:222`). En el móvil, que es donde el socio está el 90 % de las veces, **su saldo no está en la primera pantalla**. Lo mismo con la próxima sesión: solo aparece como texto pequeño pegado al item de menú (`layout.tsx:27-38,82-84`). La tarjeta "Tu plan" dice el nombre del plan y "Al corriente de pago", pero no cuántas sesiones quedan ni cuándo caducan.

**Antes de pagar faltan cuatro cosas.** En `hazte-socio/[orgSlug]/[centerSlug]/page.tsx`: no se dice cuánto **dura** el bono (los días de validez existen y el móvil sí los enseña), ni cuándo se cobra ni si se renueva solo, no hay una línea de política de cancelación de clases, y no hay casilla de condiciones. Para 300 € eso es poco.

**Justo después de pagar, un muro sin salida.** `portal/first-session-wall.tsx` es pantalla completa cuya única salida es cerrar sesión (línea 105): pide 7 campos —nacimiento, teléfono, CP, dirección, ciudad, provincia, contacto de emergencia (`src/lib/member-first-session.ts:30-38`)— y después la valoración inicial. El propio comentario del código dice que el CP es para *"el mapa de calor por barrios del cuadro de mando"*: **se está bloqueando la reserva para alimentar el panel de dirección**. Y el teléfono ya se dio en el checkout.

**La política de cancelación llega tarde.** No aparece en `agenda/session-card.tsx` ni en ningún sitio antes de reservar; se descubre al intentar cancelar, en el modal de `booking-button.tsx:157-173`. La app nativa **sí** avisa antes de confirmar. Esto es literalmente una reclamación en recepción.

**La lista de espera enseña un puesto falso.** `upcoming-bookings.tsx:55` pinta "Lista de espera · nº 2", pero la posición se escribe una sola vez al apuntarse (`src/lib/portal-queries.ts:728`) y **nunca se renumera**: si el nº 1 se borra, el nº 2 lo sigue siendo para siempre. Y no hay promoción automática: `src/lib/session-vacancy-notify.ts` manda **un email a toda la lista a la vez** y la plaza es de quien la pinche antes. Se enseña un puesto de cola donde no hay cola. Mejor no poner número que poner uno falso.

**Darse de baja: patrón oscuro de manual.** El menú de cuenta (`account-menu.tsx:29-36`) tiene Mi perfil, Datos de salud, Notificaciones, Cerrar sesión — **no hay "gestionar suscripción" ni "darme de baja"**. "Mi membresía" (`portal/membresia/page.tsx`) es solo escaparate de compra; su propio comentario (líneas 55-58) reconoce: *"El socio no ve aquí lo que lleva gastado: ni historial de pagos ni el precio de su cuota/bono en curso"*. **En la pantalla llamada "Mi membresía" no aparece cuánto pagas.** `/baja` es solo baja de correos publicitarios (`src/app/baja/page.tsx`): el nombre engaña. El portal de facturación de Stripe existe (`createMemberBillingPortalSession`) pero **el portal no enlaza a él en ningún sitio**: el único camino es cerrar sesión, ir a la página pública de captación y pedir un enlace mágico por email (`hazte-socio/…:126-133`). Para cancelar hay que volver a la página donde el gimnasio vende altas. Esto no es un descuido de UX: en varios estados de EEUU sería directamente ilegal.

**Qué mejorar (web)**: saldo y próxima sesión en la home (sustituir "Total histórico" y "Tu mejor mes"); política de cancelación en la tarjeta de la clase; filtro de día + modalidad en `/portal/agenda` como el móvil (hoy son 7 días en lista continua: con 6 clases/día son 42 tarjetas al pulgar); quitar o arreglar el número de lista de espera; y adelgazar el muro de alta a lo que de verdad bloquea.

**Qué falta (web)**: historial de movimientos del bono ("−1 el 3/9, +1 devuelta, +10 renovación") — la app lo tiene en `/consumo`, la web no, y es *el* documento con el que se discute un saldo raro; recibos, precio de la cuota y fecha del próximo cobro (hoy es decisión explícita ocultarlo, `src/lib/rbac.ts:175`); botón de gestionar suscripción y baja; **congelar el bono** (agosto, lesión) — existe en el sistema (`pauseUntil`, `FROZEN`) pero solo lo toca el staff, y para un socio español esto pesa más que media app; historial de asistencia.

**Qué sobra (web)**: la valoración de sesión pedida **tres veces** (`getPendingSessionFeedback` alimenta `PostSessionFeedbackPrompts` en `/portal/agenda`, `PendingSessionsRating` en `/portal/membresia` y un badge en el menú); "Tu mejor mes" y "Total histórico"; **"Adherencia %" y "Racha"** en el hero de Mi membresía — son KPI de retención del gimnasio, no del socio: un 62 % de adherencia en la pantalla donde te venden bonos se lee como reproche; la felicitación de cumpleaños a pantalla completa (`birthday-greeting.tsx`) y el confeti al reservar (`useCelebrate`).

**Toques por semana (web, con el pulgar)**

| Lo que hago cada semana | Hoy | Debería ser |
|---|---|---|
| Reservar | 2 + mucho scroll | 2, con filtro de día |
| Ver mi próxima hora | 1-2 (abrir cajón) | 0, en la home |
| Cancelar | 2-3 | está bien |
| Ver mi bono | 2 (cajón o Agenda) | 0, en la home |
| Ver por qué se gastó una sesión | imposible | 2 |

Cuatro items de menú es lo correcto: **el problema no es la profundidad, es qué hay en la primera pantalla.**

#### MÓVIL — App nativa

**Lo que está bien**: `(tabs)/index.tsx` pone cuenta atrás a la próxima sesión, nombre, hora, sala, foto del entrenador, botones "Al calendario" y "Cancelar", y **debajo el saldo de bonos**. Cero toques para las dos cosas que más se miran — mejor que la web y que la mayoría de apps de gimnasio del mercado. `(tabs)/agenda.tsx` tiene tira de días, chips Personal/Grupo, barra de aforo y una hoja de confirmación que dice **"Bono: Personal · quedarán 3"** antes de confirmar. Exactamente lo que hay que ver antes de gastar una sesión.

**1. La app miente con la ventana de cancelación.** Tres pantallas dicen **12 horas** a pelo: `(tabs)/index.tsx:74`, `(tabs)/sesiones.tsx:61`, `(tabs)/agenda.tsx:370-372`. El servidor manda **24 h** por defecto y configurable por entorno (`src/lib/portal-queries.ts:271,286`; `CANCELLATION_WINDOW_HOURS`). El socio cancela 18 h antes creyendo que es gratis y pierde la sesión. El dato **ni siquiera viaja en la API**: `UpcomingBooking` (`apps/mobile/src/api/types.ts:87-107`) trae `canCancelFreely` pero no las horas. Si el centro cambia la variable, la app no se entera.

**2. El checkout se inventa la fecha de cobro.** `apps/mobile/src/app/onboarding/pago.tsx:40-41,94`: `nextCharge = hoy + 1 mes` calculado **en el móvil**, para cualquier producto, incluido un bono de 10 sesiones que no se renueva jamás. Y en `onboarding/planes.tsx:163` el precio lleva **"/mes" fijo en el código**: un bono de 300 € se anuncia como "300 €/mes".

**3. Promesa comercial inventada por la app.** *"Sin contrato de permanencia · cancela cuando quieras"* está escrito a fuego en `planes.tsx:96` para todos los planes de todos los centros, sin que el producto lo declare. Y encima **no se puede cancelar desde la app**: `(tabs)/perfil.tsx` solo tiene nombre, "Mi evolución", "Mis bonos" y Cerrar sesión. El endpoint del portal de pagos existe (`src/app/api/mobile/v1/portal/billing/portal/route.ts`) y **ninguna pantalla lo llama**. La propia pantalla de pago remite a "Mi membresía" (línea 105), **pantalla que no existe en la app**.

**4. No hay notificaciones push. Ninguna.** `expo-notifications` no está en el proyecto. El aviso de plaza liberada va solo por email, y **los recordatorios de sesión no existen en ningún canal**: en `src/lib/emails/templates.ts` hay bienvenida, verificación, plaza liberada, cumpleaños, pago fallido y valoración, pero ni un "mañana a las 19:00 entrenas". Para una app cuya regla es "si no cancelas 24 h antes pierdes la sesión", **no avisar es cobrar por el olvido**. Es lo que más dinero y más socios cuesta.

**5. "Renueva el 3 de octubre" cuando en realidad caduca.** `(tabs)/bonos.tsx:105` pinta `renewsAt` (que es `endDate`) siempre como "Renueva el X", y `endDate` es la caducidad en un bono y el fin de período en una cuota: dos cosas opuestas con la misma etiqueta. Además `MembershipItem` trae `cancelAt` y `pauseUntil` **y la pantalla no los pinta nunca**: si has pedido la baja y tu cuota termina el 31, la app sigue diciendo "Activo · Renovación automática".

**6. Sin bono vivo, la app te encierra.** `needsMembershipGate` (`apps/mobile/src/auth/routes.ts:119-121`) redirige al catálogo y las tabs no cargan: no puedes ver tu historial, ni tus medidas, ni escribir al centro. Solo comprar o cerrar sesión. Para alguien que lleva cuatro años pagando, es un portazo.

**7. No hay chat en la app**, cuando la web sí lo tiene en todas las pantallas. Es justo al revés de lo que hace falta: al móvil es donde se escribe.

**8. No se puede editar nada de la ficha** ni ver consentimientos ni elegir qué correos recibir desde la app (todo eso solo en `portal/perfil` web).

**Qué sobra (móvil)**: la pestaña "Bonos"/"Consumo" duplicada en Más y en Perfil apuntando a lo mismo; y el badge **"Más elegido"** puesto automáticamente al primer producto de la lista (`featured ?? products[0]`, `planes.tsx:37`) — inventarse un "más elegido" es de las cosas que, cuando se notan, hacen desconfiar del resto.

#### Top 10 de fricciones por probabilidad de causar baja

1. **No poder darse de baja ni ver el método de pago desde dentro** (web: hay que salir a la página pública de captación; app: solo "cerrar sesión"). Causa baja *y* mala reseña.
2. **Ventana de cancelación mal escrita en la app (12 h) frente a la real (24 h)**.
3. **Cero recordatorios de sesión** con penalización por no avisar.
4. **No saber qué se paga ni cuándo**: "Mi membresía" sin precio ni recibos, y un "siguiente cobro" inventado en la app.
5. **Lista de espera con puesto falso y aviso solo por email**.
6. **Sin libro de movimientos del bono en web**: no se puede saber por qué se gastó una sesión.
7. **Muro bloqueante de 7 campos + cuestionario justo después de pagar**, sin poder posponerlo.
8. **No se puede congelar** el bono por verano o lesión sin pasar por recepción.
9. **Sin bono activo, la app deja fuera de todo** menos del catálogo.
10. **Ruido acumulado**: misma valoración en tres sitios, confeti, cumpleaños a pantalla completa, modal de renovación que reaparece cada vez que baja el contador (`membresia/renewal-modal.tsx:46`). Cada uno es pequeño; sumados, el socio silencia la app y deja de enterarse de lo que sí importa.

### 2.2 El entrenador veterano de sala

#### WEB APP

**Lo que está bien**: `/brief/[id]` está bien planteado — ordena por rojo, ámbar, verde (`src/app/(app)/brief/[id]/page.tsx:38-40`) y el debrief es un toque que además marca asistencia (`brief/[id]/actions.ts:31-42`). Y los ficheros de `src/lib/ai/methodology/` **están escritos por alguien que sabe**: "cero cardio pasivo", "el ejercicio nunca va pelado", "la inestabilidad no es la base", "fuera el repertorio de fisio", "no infradosificar", y la regla de marcar supuestos en vez de inventar. Eso se firma.

**1. CRÍTICO — El semáforo se apaga solo, en silencio.** La regla de aptitud casa por **igualdad de texto exacto**: `src/lib/brief-queries.ts:88` → `aptitudeRules.filter(r => r.injuryZone === c.zone)`. Las dos puntas son texto libre (`members/[id]/member-forms.tsx:60` y `health/aptitude-rules/create-rule-form.tsx:31`, mismo placeholder "hombro derecho"). "Hombro derecho", "hombro dcho" y "hombro der." no encienden nada.
Y peor: la valoración inicial escribe la zona **sin lado** (`src/lib/assessments/schemas.ts:294-303`: `HOMBRO → "hombro"`), mientras el catálogo de partida está lateralizado (`prisma/seed.ts:311-323`: "hombro derecho", "rodilla derecha"…). **De las ocho zonas de dolor que puede marcar la valoración, solo dos ("zona lumbar" y "cervicales") encuentran regla con el seed.** El socio marca dolor de hombro y rodilla, y el martes el Session Brief lo pinta como **"Sin restricciones"**. Nadie ve un error. Ese es el caso en el que un entrenador manda un press militar a un manguito rotador.

**2. CRÍTICO — Lo que no tiene zona no enciende luz nunca.** Hipertensión, diabetes, cardiovascular, cirugías, medicación y embarazo se guardan con `zone: null` (`src/lib/assessments/save.ts:52-65`), y sin zona no hay regla que casar. **El semáforo de aptitud es hoy un semáforo musculoesquelético y se vende como semáforo de aptitud.** En la sala eso es al revés de lo que importa: la rodilla se ve cojear, la tensión no.

**3. El brief da historial clínico, no adaptaciones.** `brief/[id]/brief-card.tsx:99-101` imprime la descripción cruda de cada condición sin zona: nombres de medicamentos, cirugías y patologías, literalmente, en una tarjeta abierta en la sala con seis personas alrededor. Es dato del Art. 9 en una pantalla pública de facto, y rompe la regla básica: el entrenador lee adaptaciones, no historiales.

**4. Tres sistemas de feedback para la misma persona.** `SessionDebrief` verde/ámbar/rojo (web), ocho ejes de 1-10 (móvil) y **encima** un feedback mensual de nueve deslizadores con nota obligatoria (`trainer/feedback/[memberId]/debrief-form.tsx:12-22`, bloqueante en `:74-78`, `DEFAULT_DIMS` ya a 7 en `:24-34`). Con 30 socios de EP son **270 deslizadores y 30 textos al mes**. El primer martes que se intente usar, el entrenador los deja todos en 7, escribe "va bien" y envía. A las dos semanas el dato es ruido, y dirección estará decidiendo sobre "Nutrición: 7" que nadie ha medido. Además dos de esas dimensiones —"Bienestar físico: ¿libre de dolores?" y "Nutrición"— son juicios sobre salud y alimentación que al entrenador no le corresponde puntuar.

**5. Rangos de composición corporal indefendibles.** `src/lib/reference-ranges.ts:17-22`: `bodyFatPct: { min: 8, max: 19 }` **unisex y sin edad**, `bodyWaterPct: { min: 50, max: 65 }`. Son los rangos del informe Tanita de **un hombre de 28 años** (`docs/COMPOSICION_CORPORAL_TANITA.md:19`) convertidos en el defecto de toda la aplicación — y es el defecto que se usa mientras dirección no cree filas, o sea siempre. Una mujer de 52 años con un 29 % de grasa (perfectamente normal) sale marcada `critical` (`statusForValue:65-73`) en su ficha **y en `portal/evolucion`**. Poner una etiqueta roja de salud a una socia sana es la forma más rápida de perderla. Y "Edad metabólica" (`src/lib/composition-view.ts:48`) es marketing de fabricante de básculas: en una ficha con membrete del centro parece un dato clínico.

**6. La valoración no valora movimiento.** `src/lib/assessments/schemas.ts:133-153`: constantes, perfil, experiencia, screening y marcas. De los siete patrones básicos que **la propia metodología exige** (`src/lib/ai/methodology/04-reglas-programacion.md:1-8`) no se evalúa **ninguno**. Lo más cercano es `experiencia.tecnicaBasicos: BAJA|MEDIA|ALTA` (`:101`), una autopercepción. Y las marcas son un catálogo cerrado de cuatro (`schemas.ts:62-67`): dominadas, flexiones, plancha y circuito de agilidad. Ni bisagra, ni sentadilla, ni empuje horizontal, ni movilidad de tobillo u hombro, ni carga de referencia.

**7. La revisión no vuelve a preguntar por lesiones.** `reviewAssessmentSchema` (`:155-168`) no lleva screening ni zonas de dolor: una lumbalgia que aparece en el mes 4 solo entra si alguien la teclea a mano en Salud.

**8. Mesociclos: metodología buena, contenedor no.**
- `Mesocycle` **no tiene fecha de inicio** (`prisma/schema.prisma:1720-1745`): no hay forma de saber en qué semana está el socio. Sin eso no hay periodización, solo un documento.
- Sin descarga, sin RIR/RPE objetivo, sin progresión semana a semana: cada fase describe "la semana tipo" (`src/lib/ai/mesocycle-prompt.ts:14-16`). Una fase de 4 semanas es cuatro veces la misma semana.
- Hitos en texto libre JSON (`schema.prisma:1731`), sin enlace al re-test ni a `PerformanceMetric`. Nadie comprueba si el hito de la semana 6 se cumplió.
- **No hay registro de ejecución.** `MesocycleExercise.load` es carga *planificada* (`schema.prisma:1816`). No existe modelo de serie realizada, kilos ni RM. **Cero historial de cargas**: un entrenador serio no se fía de un sistema que propone progresar sin saber con cuánto entrenó el socio la semana pasada.
- **No sirve para grupo reducido**: el mesociclo cuelga de `memberId`, y el grueso del negocio son grupos de 4-8.

**9. La promesa de seudonimización no se cumple.** `mesociclos/panel.tsx:94-98` dice literalmente *"La IA recibe… Nunca nombre, DNI, teléfono ni email"*, pero **no existe ningún filtro de texto libre** (`scrubIdentifiers` no está en `src/`). Van sin filtrar `HealthRecord.description`, `cierre.notasEntrenador`, `screening.lesionesActuales` y `ClientGoal.label`. La propia documentación lo reconoce (`docs/GUIA_AGENTE_GENERADOR_ENTRENAMIENTOS.md:344`). Un entrenador que escriba "María dice que el hombro…" está mandando el nombre, después de que la pantalla le prometiera que no.

#### APP MÓVIL

**Lo que está bien**: el "Hoy" del entrenador (`apps/mobile/src/app/(tabs)/panel.tsx:252-269`) pone la sesión en curso arriba con **sus dos acciones reales** (Pasar lista y Brief) en vez de un "ver sesión" genérico; y el brief separa "Requieren atención" de "Sin restricciones" con la adaptación literal en la tarjeta (`brief/[id].tsx:220-227`).

**1. CRÍTICO — El móvil no enseña las condiciones sin regla.** El endpoint manda `conditions` por el cable (`src/app/api/mobile/v1/trainer/brief/[id]/route.ts:45`) y `BriefRosterEntry` las tipa (`apps/mobile/src/api/types.ts:278`), pero **la pantalla no las pinta en ningún sitio**: solo recorre `matchedRules` (`brief/[id].tsx:220-227`). Sumado al fallo 2 del bloque web: *un socio con hipertensión declarada, o una socia embarazada, aparece en el móvil del entrenador en la lista compacta **"Sin restricciones"**, sin una sola línea de texto.* En la web al menos se imprime el texto crudo; en el móvil no aparece nada — y el móvil es el dispositivo que se lleva en la mano en la sala. **Es el defecto número uno de todo el producto y se arregla en veinte líneas.**

**2. No se puede marcar un no-show desde el móvil. En absoluto.** No existe en toda `apps/mobile/src`. La única forma es abrir la web (`agenda/session/[id]/page.tsx:178-190`, `NoShowButton`). El no-show es una de las cuatro cosas que se hacen treinta veces al día, mueve el bono del socio y es motivo de conversación en recepción. Lo que sí hay es "Descartar asistente" (`staff-agenda.tsx:887-889`), que es otra cosa: cancela la reserva.

**3. Desmarcar una asistencia miente.** `brief/[id].tsx:184-199` y `CompactRow:246-254`: al volver a tocar el check el estado local se pone a `null` y **no se manda nada al servidor** (`if (!next) return;`). La reserva sigue en `ATTENDED` y el debrief sigue guardado. Marcas a Ana por error, quitas el check, la pantalla dice "no asistió" y la base de datos dice que sí: **Ana pierde su sesión del bono.** Y al recargar, el check vuelve.

**4. El "debrief" del móvil no es un debrief.** `(tabs)/feedback/[id].tsx:26-35`: RPE, técnica, actitud, energía, movilidad, dolor, adherencia, progreso, de 1 a 10, uno por socio. Para un grupo de seis son **48 puntuaciones**, con barra dorada solo al completar los ocho (`:114-117`) y contador de 48 h en la cabecera (`:200-202`). En la sala, con seis esperando y 90 segundos, esto no se rellena ni el primer día. Lo que pasará: se rellena el RPE y la app deduce el color con `feelingFor` (`src/app/api/mobile/v1/trainer/sessions/[id]/feedback/route.ts:38-44`), que con la media a `null` devuelve **AMBER** — o sea, **rellenar solo el RPE deja al socio marcado "regular" para siempre**. Y el color sale de promediar técnica, actitud, energía, movilidad, adherencia, progreso y dolor invertido (`src/app/api/mobile/v1/_lib/calendar.ts:39-55`): promediar movilidad con actitud no significa nada, es un número que parece riguroso y no lo es.
Además hay **dos gramáticas distintas para lo mismo**: en la web el debrief es Bien/Regular/Mal (`brief-card.tsx:110`); en el móvil es un check que guarda GREEN a secas (`:186-188`) y el matiz vive en otra pantalla. El mismo entrenador registra cosas no comparables según el día.

**5. La ficha del socio en el móvil no lleva lo que se consulta antes de entrenar.** `mis-socios/[id].tsx` tiene Sesiones, Plan, Salud y Notas, pero la pestaña Salud enseña **una sola condición** —la peor— porque el backend colapsa a un único `aptitude` (`src/lib/trainer-members-queries.ts:86-101`). Y no hay valoraciones, ni composición corporal, ni historial de marcas.

**6. No hay comunicación con el socio en la app.** Cero: no hay chat en `apps/mobile/src`. La web sí lo tiene (`portal/chat`, modelos `Conversation`/`ChatMessage`). El entrenador que está en la sala no puede escribir a nadie desde su herramienta de trabajo, así que escribe por WhatsApp desde su móvil personal, con su número, y el día que se va se lleva la conversación y al socio. **Ese es el riesgo estructural del modelo español y la app lo está dejando pasar.**

**7. Detalle pequeño con coste real**: en `panel.tsx:100` el botón "Rellenar" abre siempre `pendingDebriefs[0]`, mientras el texto de abajo habla de "la más antigua", que es `[length-1]` (`:108`). El botón lleva a una sesión distinta de la que la tarjeta acaba de decir que corre prisa.

**Toques del entrenador, hoy**

| Acción | Toques |
|---|---|
| Ver quién viene ahora | 0 (spotlight) |
| Abrir el brief de la sesión en curso | 1 |
| Marcar asistencia de un socio | 1 por socio |
| Dejar el debrief real | 1 + 8 deslizadores + navegar |
| **Marcar un no-show** | **imposible** |
| Ver la ficha de un socio del roster | no hay enlace desde el brief |

#### Cómo lo haría un entrenador

- **Zonas cerradas, ya.** `HealthRecord.zone` y `AptitudeRule.injuryZone` dejan de ser texto libre: enum compartido con **lateralidad como campo aparte** (`hombro` + `derecho|izquierdo|bilateral`); la regla sin lado cubre los dos. Y en la pantalla de reglas, un contador: *"esta regla afecta hoy a 0 socios"* — si sale 0 en una zona con lesiones registradas, está mal escrita y se ve al instante.
- **Semáforo por condición, no solo por zona.** Segundo tipo de regla `condition → luz + adaptación`, con catálogo de partida para hipertensión, diabetes, embarazo y posparto, obesidad, cardiovascular y postoperatorio. Y **por defecto ámbar, no verde**, para cualquier condición sin regla: en la sala, "no lo sé" nunca puede pintarse igual que "no hay nada".
- **El brief deja de imprimir descripciones clínicas**: bajo el nombre solo la traducción ("Evitar empuje vertical — sustituir por landmine press"); la descripción cruda a un toque más, con su auditoría.
- **Un único canal de feedback.** Muere el mensual de nueve deslizadores. Queda el debrief de sesión: verde/ámbar/rojo + una frase opcional, **con el color puesto por el dedo, no promediado**. Lo que dirección necesita se calcula de ahí más asistencia y bonos. La divergencia entrenador/socio ya se puede sacar contrastando con `getWeeklyClientFeedback` (`src/lib/brief-queries.ts:196`).
- **Rangos neutrales por sexo y edad, o ninguno.** Sin fila configurada, el valor se muestra **sin semáforo**. Fuera "Edad metabólica" de la ficha del socio. El % graso, como tendencia contra la medición anterior, que es lo único defendible sin normativa poblacional.
- **La valoración incorpora movimiento**: siete patrones con tres opciones (*ejecuta / ejecuta con regresión / no ejecuta*) más nota corta — siete toques y treinta segundos con el socio delante; tres chequeos de movilidad (tobillo, cadera, hombro), pasa/no pasa; y kilos de referencia por patrón, con fecha.
- **El mesociclo gana `startDate`, semana en curso y `deload: boolean` en `MesocyclePhase`**, con regla dura: una fase de más de 3 semanas exige declarar dónde está la descarga o cómo progresa. Y la carga del ejercicio principal se registra en el debrief de EP.

#### Riesgo profesional (web y móvil)

1. **El falso verde.** Un socio declara dolor de hombro en la valoración, firma su PAR-Q, y el brief lo pinta sin restricciones porque "hombro" no casa con "hombro derecho". Si se lesiona, **el centro tiene documentado que sabía de la lesión y programó igual.** Eso no lo defiende nadie.
2. **El brief del móvil oculta condiciones declaradas** (`conditions` llega al dispositivo y no se renderiza): el entrenador ve "Sin restricciones" sobre una socia embarazada o un hipertenso y programa un circuito metabólico.
3. **El perfil "Rehabilitación"** (`src/lib/ai/methodology/perfiles/rehabilitacion.md`) está bien escrito, pero **un centro de entrenamiento personal en España no rehabilita: adapta y deriva.** Faltan dos cosas obligatorias: campo de derivación (a quién, cuándo, qué dijo) y **bloqueo** — sin alta o informe registrado, el perfil no se puede aprobar. Y el texto que ve el entrenador debe decir "adaptación bajo supervisión médica", no "recuperar la zona".
4. **Puntuar dolor de 1 a 10** en el historial del socio y agregarlo en informes de dirección es empezar una anamnesis sin serlo. Si se queda, el eje "Dolor" pasa a binario ("¿ha referido dolor hoy? sí/no + zona") y dispara la propuesta de derivación.

#### Lo que falta y merece la pena (por orden)

1. Normalizar zonas y añadir reglas por condición. Sin esto, lo demás da igual.
2. No-show en el móvil, y que desmarcar desmarque de verdad.
3. Registro de cargas: kilos del ejercicio principal en el debrief de EP.
4. **Plantillas de sesión reutilizables para grupo reducido**, con columna de regresión y progresión por ejercicio. Hoy `SessionTemplate` (`prisma/schema.prisma:720-742`) es solo un horario —nombre, día, hora, aforo— **sin contenido**, y el 70 % del negocio es grupo.
5. Derivación a fisio como registro de primera clase, con bloqueo del perfil Rehabilitación sin ella.
6. Chat en el móvil del entrenador.
7. El "registro de rotación" que enlaza `SessionDebrief` con el día del mesociclo, **ya diseñado** en `docs/GUIA_AGENTE_GENERADOR_ENTRENAMIENTOS.md:352-358` y no construido (no existe `mesocycleDayId`). Es lo que convierte el mesociclo de documento en plan vivo.

**Humo, o al menos no ahora**: el feedback mensual de nueve dimensiones (fuera entero); "Edad metabólica" y el análisis segmental Tanita en la ficha; los ocho ejes con plazo de 48 h; y el control de material/inventario — se pide siempre y no lo usa nadie. Lo que sí hace falta es mucho más barato: **una lista de material por centro y por sala que reciba el generador de mesociclos** (hoy no recibe nada de material, `src/lib/health-access.ts:355-368`), para que no programe kettlebell de 32 kg en un centro donde no la hay.

### 2.3 Negocio y producto (Apta como SaaS, TrainingZone como piloto)

#### WEB APP — qué sobra

1. **La rutina de IA falsa que ve el socio. ELIMINAR hoy.** `portal/evolucion/workout-request-button.tsx` deja al socio pedir una rutina; llega a `src/lib/workout-programs.ts:12`, `buildMockRoutine`, que devuelve **siempre las mismas tres sesiones** (Lunes/Miércoles/Viernes, "Movilidad 10'…"). El comentario del propio fichero lo admite. Está en producción, visible para el socio, y además notifica a dirección para que confirme una rutina inventada. **El segundo socio que la pida descubre el truco.** Y encima duplica el generador real que sí existe (`src/lib/ai/mesocycle-generator.ts`). Coste de quitarlo: una hora.
2. **Biblioteca de entrenamientos online (`PlanType.ONLINE`). ELIMINAR del catálogo vendible.** `src/lib/online-queries.ts` lee `OnlineWorkout`; los únicos escritores del repo son `prisma/seed.ts:2858` y su `deleteMany`. **No hay ninguna pantalla para dar de alta un vídeo.** Un gimnasio puede crear y vender un plan ONLINE y no puede entregarlo.
3. **`/aforo` como entrada de menú. FUSIONAR en Organización → Centros.** `(app)/aforo/page.tsx` es un formulario que edita **un entero por centro**, y ocupa entrada de menú para `CENTER_DIRECTOR` (`rbac.ts:131`) y `TRAINER_ADMIN` (`:160`). `docs/MODULOS_APARCADOS.md` afirma literalmente que el aforo "lo edita en Organización → Centros": **el código contradice al documento.**
4. **Chat centro↔socio. APARCAR.** `portal/chat` + `src/lib/chat.ts`. Verificado: **cero push, cero WhatsApp, y ninguna plantilla de "mensaje nuevo" en `src/lib/emails/templates.ts`**. Un buzón del que nadie se entera crea expectativa de respuesta y la incumple: es peor que no tenerlo. Además `RECEPTION` ve todos los chats de forma permanente.
5. **Fichajes. DECIDIR: o vuelve con fecha, o se borra.** Aparcado en agosto; tres meses después siguen vivos `TimeClockEntry`, `src/lib/timeclock-queries.ts` y `TimeClockWidget` exportado (`rrhh/rrhh-client.tsx:15`). Un módulo aparcado indefinidamente paga peaje en cada migración y en cada auditoría de permisos. Y **el control horario en España es obligación legal** (RD-ley 8/2019): o se hace bien y se vende, o se borra. A medias es lo peor de los dos mundos.
6. **`/mapa-barrios` como módulo de primer nivel. FUSIONAR en el panel.** No se elimina —dirección lo pidió y sirve para decidir inversión publicitaria—, pero es una pantalla completa, cuatro módulos de `lib` y una entrada de menú para algo que se mira una vez al trimestre.
7. **`/feedback`. RECORTAR a 3 dimensiones.** Sí tiene captura real (`src/lib/feedback-capture.ts:81,106`), pero son **9 dimensiones por los dos lados, mensualmente, por cada socio de EP** (`:19-29`), repartidas en cuatro pantallas. Pregunta sin contestar en ningún documento: *¿cuántos entrenadores rellenan 9 sliders al mes por socio en un centro real?* Recortar a satisfacción / progreso / adherencia y **medir la tasa de cumplimentación antes de tocar una línea más**.
8. **`/tareas`. CONGELAR (coste hundido, no borrar).** Es un Trello completo: tablero, lista, histórico, filtros, drawer, dos módulos de lib, e2e propio y pestaña en móvil. Ningún director cambia de software por un gestor de tareas: usan WhatsApp. No se borra porque las alertas del cron aterrizan ahí como `Notification kind TASK`. Cero inversión adicional, y **fuera de `/planes` y de la demo**.
9. **`/anuncios`.** Solo lectura in-app: un tablón que solo ve quien ya ha entrado. No lo defiendas en una demo.
10. **`/demo-checkout`. Fecha de caducidad.** Ruta **pública** que da de alta organizaciones sin cobrar; el propio comentario (`:24-29`) admite que ya se coló una vez un lifetime gratis por URL directa. Correcto como degradación, **tiene que morir el día que Stripe esté vivo**.

#### WEB APP — qué falta

**Para el piloto (dinero real):**
- **P0-1 — Congelar o cancelar una suscripción NO la para en Stripe.** Ver el capítulo de Stripe: es un defecto, no una feature. **Bloquea cualquier piloto que maneje dinero.**
- **P0-2 — Ejecutar el ciclo Connect completo contra cuentas de prueba reales** con test clocks: alta, `invoice.paid`, `payment_failed`, reintento, SEPA, cancelación. Media jornada, obligatoria.
- **P0-3 — Un canal que el mercado español use de verdad.** `whatsapp` y `twilio` **no aparecen ni una vez** fuera de `docs/`. Versión mínima que da el 80 %: **no** integres la API de WhatsApp Business (verificación de negocio, plantillas aprobadas, coste por conversación). Botón "abrir WhatsApp" con `wa.me/` y mensaje pre-redactado desde tres sitios: alerta de retención, recibo fallido y lead sin responder. **Días, no semanas, y cero infraestructura.**
- **P0-4 — Migración del socio que ya paga. Decisión de dirección, no de ingeniería.** `src/lib/member-import.ts` trae socios por CSV pero **no trae mandatos SEPA ni suscripciones vivas**. TrainingZone tiene socios cobrando hoy en otro sistema: o se les hace re-firmar el mandato (fricción real, algunas bajas) o hay que verificar la portabilidad **antes** de prometer fecha.

**Para vender a terceros:**
- **Back-office `/apta`**: no existe; `PLATFORM_ADMIN` no tiene ni una pantalla propia. Con dos clientes te apañas con SQL; con diez, no. Y sin **alta asistida** no puedes vender con transferencia o factura, que es como se cierra la mitad de la venta B2B pequeña en España.
- **Geografía genérica**: `src/lib/postal-codes.ts` cubre Zaragoza y Santander. El tercer cliente en Valencia ve el mapa degradado por provincia.
- **Exportación de socios y de cobros**: hay export de auditoría, de datos RGPD del socio y de un ranking del panel, pero **no de socios ni de cobros para la gestoría** — y la feature `exportaciones` **se cobra** en el plan Avanzado (`src/lib/platform-plans.ts:59`). Estáis cobrando por algo que casi no existe, y es la primera objeción de cualquier dueño: *"¿puedo sacar mis datos?"*.
- **Paginación**: `src/lib/members-queries.ts:32` tiene `take: 300` fijo. Un centro con 320 socios **pierde 20 filas en silencio**.
- **Recibo en PDF**: `receiptNumber` es una cadena secuencial sin generador. No hablo de VERI\*FACTU: hablo del justificante que pide el socio que paga 70 € al mes.
- **Ventana mínima de cancelación de reserva**: la lista de espera sí se resolvió (`session-vacancy-notify.ts` avisa y `portal-queries.ts:651` deja reclamar), pero **no hay antelación mínima**: un socio cancela un minuto antes y recupera la sesión. Lo detectan la primera semana; falta una decisión de dirección.

#### WEB APP — qué mejorar

- **Agenda**: `agenda/agenda-view.tsx`, 636 líneas de calendario propio, sin vista mes ni por sala. Es donde recepción y entrenadores pasan ocho horas. **No la reescribas**: añade vista mes y blíndala con tests. Una reescritura es un mes que no tienes.
- **El foso depende del check-in, y el check-in es un tick manual.** El Semáforo, el Session Brief y el motor de retención valen lo que valgan los datos de asistencia, y hoy los mete el staff a mano. **No hay ninguna librería de QR en el repo.** Versión del 20 %: QR estático por sesión en la pantalla de la sala, el socio lo escanea desde el portal. Sin torno, sin hardware.
- **`/trainer` sigue restringido a `TRAINER`**: dirección no puede ver el panel de su propio equipo. Es un bug de negocio — el director paga precisamente por saber cómo va su gente.
- **Consentimientos irrevocables**: se escriben en el alta y el panel de staff es de solo lectura. Un socio que quiere retirar el consentimiento de imágenes **hoy no puede**. Es RGPD, no es opcional.
- **`billing/page.tsx:40`** sigue diciendo que la pasarela de pago online "queda fuera de esta entrega" **con el checkout de Stripe ya en esa misma página**. Un cliente lo lee.

#### WEB APP — navegabilidad y encaje

**El menú refleja cómo se construyó el software, no cómo trabaja un centro.** `rbac.ts:106-123`: el OWNER tiene **15 entradas** en cuatro secciones. El roadmap se marcó bajarlo a 13; `MODULOS_APARCADOS.md` admite que se quedó en 14 y argumenta que ninguna es prescindible — **ese argumento es el síntoma**: se está optimizando "que cada pantalla tenga puerta", no "que el director encuentre lo que busca".

Cinco de esas quince son **configuración disfrazada de módulo**: `/aforo`, `/health/aptitude-rules`, `/health/reference-ranges`, `/organization/valoraciones`, `/puesta-en-marcha`.

| Sección propuesta | Qué contiene | Cuándo se abre |
|---|---|---|
| **Hoy** | Agenda, Session Brief, check-in, tareas del día | 7:00, lo primero |
| **Socios** | Fichas, salud, valoraciones, mesociclos, retención | Antes de cada sesión |
| **Dinero** | Cobros, morosidad, productos y planes, MRR | Día 1 y día 15 |
| **Crecer** | Leads, anuncios, mapa de barrios (como panel) | Semanal |
| **Ajustes** | Organización, centros + aforo, reglas, rangos, valoraciones, puesta en marcha, RRHH, auditoría | Una vez al año |

De 15 entradas a 5. Criterio: **¿se toca al menos una vez por semana? Si no, es Ajustes.** Un acierto que sí hay que preservar: la ficha del socio ya unificó once pestañas en cinco secciones — ese mismo criterio va al menú.

#### APP MÓVIL — la parte incómoda

**La app no es "el portal del socio en nativo". Es un segundo cliente completo del producto entero.** `apps/mobile/src/auth/routes.ts:50-66` declara pestañas para **los ocho roles**, con 53 route handlers detrás. Se ha construido una app nativa para que **el soporte de Apta** administre organizaciones desde el móvil y para que **RRHH** gestione plantilla desde el móvil.

Qué sobra, concreto:
1. **`PLATFORM_ADMIN` en la app** (`:63`). Sois vosotros, tenéis portátil. Fuera, y con él `/api/mobile/v1/admin/*`.
2. **`HR_MANAGER` en la app** (`:65`). Nadie da de alta personal desde el móvil. Fuera, y con él `/api/mobile/v1/staff/*`.
3. **`OWNER` y `CENTER_DIRECTOR` completos.** El director mira KPIs desde el móvil, sí; da de alta productos y personal desde el escritorio. Recortar a **panel + socios en lectura + avisos**.
4. **La matriz de permisos duplicada** (`:133-168`, "espejo de src/lib/rbac.ts"). **Dos fuentes de verdad para permisos** es la clase de duplicado que termina con un entrenador viendo un dato de salud que no le toca. Debe venir del servidor en `/me`.
5. **La app está marcada como TrainingZone, no como Apta.** `app.json`: `"name": "Training Zone"`, `"slug": "trainingzone-mobile"`, `"scheme": "trainingzone"`, **sin sección `ios`** y **sin `eas.json`**. Traducción: **esta app no se puede publicar hoy en ninguna tienda**, y si se publicara sería la app de un cliente, no un producto de Apta. **Es una decisión estratégica tomada por omisión, en un fichero de configuración.**

**Qué falta (móvil):** `eas.json`, build de producción y cuentas de tienda · **decidir la marca**: ¿una app Apta multi-tenant donde el socio elige su gimnasio, o una app por cliente? La primera es un producto; la segunda es un servicio de alta de 2.000-4.000 € por cliente y una release por cada uno cada vez que Apple cambia algo — y hoy `app.json` dice que habéis elegido la segunda · **push**: `expo-notifications` no está en el `package.json`, no hay tabla `DeviceToken`. **Una app sin push es una web peor**: el push es literalmente la única razón técnica por la que una app nativa gana a una PWA en este negocio.

**Riesgo de revisión en App Store**: `(tabs)/_layout.tsx:107` — sin bono vivo el socio **no entra a la app** y se le redirige a comprar, con un checkout que no pasa por IAP. Los servicios presenciales pueden ir fuera de IAP; el contenido online (la biblioteca de vídeos) **no**.

**Qué mejorar (móvil):** es **online puro**, sin caché offline — el socio en el sótano del gimnasio sin cobertura no ve su reserva, y ese es el escenario de uso literal · sin biometría (`expo-local-authentication` ausente): contraseña cada vez que caduca el token · sin cámara (`expo-camera` ausente), que es justo lo que resolvería el check-in por QR · **la paridad web↔móvil es un impuesto permanente**: cada regla nueva se escribe dos veces, server action y route handler.

**Navegabilidad (móvil):** ironía del proyecto — **la navegación móvil está mejor pensada que la web**. Cinco pestañas por rol elegidas por frecuencia, "Más" como índice real con contadores, `backBehavior="history"` con tres párrafos de razonamiento. Se ha diseñado con más cuidado la navegación del que no paga que la del que paga. Aquí no hay que reorganizar: **hay que recortar el alcance, de ocho roles a dos**.

#### Modelo de negocio

Catálogo actual (`src/lib/platform-plans.ts`): Esencial 79 €, Avanzado 149 €, Élite 279 €, Fundador 3.990 € lifetime, eje = centros.

**Lo que está bien y no se toca**: el eje por centros (no penalizáis lo que queréis que crezca) y la **cero comisión sobre los cobros del gimnasio**. Ese segundo punto es un argumento de venta enorme contra MindBody y Glofox **y no lo estáis usando**: ponedlo en `/planes` en grande — *"tu dinero es tuyo, íntegro. No tocamos ni un céntimo de lo que cobras a tus socios."* Es la frase más vendedora del producto y hoy está escondida en un documento interno.

**Lo que está mal:**
1. **Esencial a 79 € es un error de diseño comercial.** El propio plan lo admite: "es el tier me-too, no lleva ningún diferenciador". Vendéis por 79 € lo mismo que la competencia, sin vuestro foso, y creáis un tier que hay que mantener para siempre para un cliente que no os va a recomendar nunca. Un centro de EP español con 80 socios a 60 € factura 4.800 €/mes: 149 € es el **3,1 %**. **Matar Esencial, o subirlo a 99 € y bajar Avanzado a 129 €** — hoy hay 70 € de distancia entre tiers, que es una excusa perfecta para quedarse abajo; con 30 € casi todo el mundo sube.
2. **Élite a 279 € no tiene sentido económico.** Lo único que añade es IA (0,18 $ por mesociclo: cien al mes son 18 $) y **centros ilimitados**, que es justo donde está vuestro coste real de soporte. **Estáis cobrando 130 € de margen sobre 17 € de coste y regalando lo caro.** Élite pasa a "hasta 10 centros"; por encima, precio a medida. Y **la IA baja a Avanzado con cupo** (20 mesociclos/mes): es vuestro mejor gancho de demo y hoy está escondido en el tier que nadie compra.
3. **Fundador está bien razonado** (2,7 años de Avanzado anual, sin IA, con cupo e interruptor). Es el instrumento correcto para financiar los primeros clientes: **úsalo ya, con cupo real de 15 y fecha de cierre pública.** Un lifetime sin fecha no vende — la escasez es el producto.
4. **Por socio activo: nunca.** Ya está decidido y es correcto.

**Gancho vs. coste hundido, para la landing:**
- *Gancho*: Semáforo de Aptitud + Session Brief (la trazabilidad entrenador↔socio que MindBody, Trainerize y Glofox no atan), motor de retención, cero comisión, mesociclos con IA en la demo.
- *Coste hundido — pagado, no se toca más, no aparece en `/planes`*: tareas, anuncios, chat, biblioteca online, fichajes, mapa de barrios, app nativa para ocho roles. **Cada línea de más en la tabla comparativa diluye el mensaje.**

**Papel de la app nativa: hoy es un lastre.** 53 endpoints paralelos, permisos duplicados, sin push, sin `eas.json`, con la marca de un cliente y con riesgo de rechazo en tienda. Sin push no aporta nada sobre una PWA. Pero la respuesta honesta no es "PWA y ya": en iOS la PWA sigue sin push fiable ni instalación digna, y en EEUU la app propia es requisito de venta. **Decisión en dos tiempos:**
- *Ahora (España, piloto y primeros 10 clientes)*: **PWA**. El portal ya es responsive y es lo mejor construido del producto; manifest + service worker + install prompt son días. **Congelar la app nativa: ni una pantalla más.**
- *Cuando haya 10 clientes de pago o el primer cliente de EEUU*: **una única app Apta multi-tenant**, dos roles (socio y entrenador), con push, `eas.json` y cuentas de tienda **de Apta**, no del cliente. Marca blanca por cliente solo como upsell de Élite, con precio de alta y contrato de mantenimiento.
- *Si te niegas a congelar*: entonces recorta a dos roles y mete push. Una app de entrenador con el brief y el debrief en el bolsillo sí tiene tesis. Una app de RRHH no la tiene ninguna.

#### Riesgos de negocio

| # | Riesgo | Por qué |
|---|---|---|
| R1 | **Cobro fantasma tras congelar** | `billing/subscription-actions.ts:123`. Legal y reputacional. Bloqueante |
| R2 | **Stripe Connect nunca ejecutado en real** | Todo el plano 2 escrito y sin probar. Fallará con dinero de un socio |
| R3 | **Cliente único disfrazado de producto** | `postal-codes.ts` (2 ciudades), `app.json` ("Training Zone"), `src/lib/ai/methodology/` (la metodología de UN centro) |
| R4 | **Sin el canal que usa el mercado** | WhatsApp: cero líneas en todo el repo |
| R5 | **Superficie insostenible** | 114 módulos en `src/lib`, 39 rutas web, 53 endpoints móviles, 22 pantallas nativas — más de lo que un equipo pequeño mantiene mientras vende |
| R6 | **DPA con Anthropic sin firmar** | Datos del Art. 9 a un tercero sin Art. 28. No es teórico |
| R7 | **Fundador rebajado destruye MRR** | A 2.500 € financiáis el producto con vuestro propio ingreso futuro |
| R8 | **Rechazo en App Store** | Gate de compra en `(tabs)/_layout.tsx:107` |
| R9 | **Estacionalidad** | Si el piloto arranca en agosto, ocupación y retención mienten |
| R10 | **Deriva documental** | Ya se ha planificado dos veces sobre información falsa (F5/F6 marcadas pendientes estando hechas) |

#### Las 10 preguntas incómodas antes de escribir otra línea

1. ¿Cuántos gimnasios que **no** sean TrainingZone han visto una demo, y cuántos han dicho un precio en voz alta?
2. **¿TrainingZone paga la licencia?** Si es socio o inversor y no paga, no es un cliente: es un laboratorio, y todo lo que pida es un favor, no producto.
3. ¿Quién soporta esto un martes a las 8:00 cuando recepción no puede cobrar? Sin respuesta, no se vende a terceros.
4. ¿Objetivo a 12 meses: 5, 20 o 100 clientes? Cada número exige un producto distinto (5 → servicio a medida; 100 → self-service y back-office obligatorios).
5. **¿España o EEUU?** Lo construido es 100 % España: SEPA, Bizum, CP españoles, textos RGPD, VERI\*FACTU. Entrar en EEUU no es traducir, es otro producto.
6. ¿Cuántas **horas de persona** cuesta migrar un gimnasio vivo con 150 socios cobrando? Si son más de ocho, el coste de adquisición se come el precio de Esencial en el primer mes.
7. **¿La metodología de `src/lib/ai/methodology/` es de Apta o de TrainingZone?** Si es de TrainingZone, ¿con qué derecho la vendéis al centro de al lado? Por escrito, ahora.
8. ¿Está firmado el DPA con Anthropic? Sí o no. Si es no, la IA no toca datos de un socio real, ni en piloto.
9. ¿Cuántos entrenadores de TrainingZone han rellenado un debrief **esta semana** sin que nadie se lo recordara? Ese número decide si el foso existe o es una hipótesis vuestra.
10. **¿Qué se apaga?** Si la respuesta es "nada", el próximo trimestre se va en mantener tareas, chat, anuncios, fichajes, biblioteca online y una app de ocho roles, en vez de vender.

#### Los próximos 10 movimientos

| # | Movimiento | Impacto | Esfuerzo |
|---|---|---|---|
| 1 | **Espejar en Stripe congelar y cancelar suscripción** | Crítico | 1-2 d |
| 2 | **Ciclo Stripe Connect completo en test** (test clocks, SEPA, fallo, reintento, cancelación) | Crítico | 3-5 d |
| 3 | **Apagar lo que promete y no cumple**: rutina IA mock, plan/biblioteca ONLINE, chat sin notificación | Alto | 1 d |
| 4 | **WhatsApp `wa.me` con mensaje pre-escrito** desde retención, impago y lead | Alto | 2-3 d |
| 5 | **Congelar la app nativa + PWA del portal** | Alto | 3-5 d |
| 6 | **Reempaquetar precios** (matar/subir Esencial, IA con cupo en Avanzado, Élite hasta 10 centros, Fundador con cupo y fecha) | Alto | Nulo (decisión) |
| 7 | **Menú a 5 secciones** | Medio-Alto | 2-3 d |
| 8 | **Exportación CSV de socios y cobros** | Medio-Alto | 2 d |
| 9 | **Ventana mínima de cancelación + QR de check-in** | Medio-Alto | 5-8 d |
| 10 | **Back-office `/apta` mínimo** (listar organizaciones, reenviar activación, alta asistida) | Medio | 5 d |

**Explícitamente NO ahora**, aunque duela: reescribir la agenda, vista por sala, VERI\*FACTU, Stripe Terminal, Bizum, fichajes, más BI, más pantallas móviles, más dimensiones de feedback.

> **Nota sobre la documentación**: `docs/REGLAS_NEGOCIO_ESTADO_IMPLEMENTACION.md` está desfasado en tres puntos verificados contra código (lista de espera, feedback diferencial y tests unitarios: los tres **sí** están construidos), y `docs/MVP_PILOTO_GIMNASIO_ANALISIS.md` sigue desfasado más allá de su nota de cabecera. Antes de la próxima jornada de planificación, alguien tiene que pasar dos horas cerrando esas filas o volveréis a planificar sobre información falsa por tercera vez.

### 2.4 Seguridad

> **Método**: verificación **dinámica** contra la app local con la base sembrada, usando tokens móviles reales de distintos roles. Los PoC ejecutados quedaron revertidos en la base de datos.

#### WEB APP

**SEC-01 · ALTO — El Session Brief no aplica ámbito de centro: dirección de centro lee datos de salud de socios de otros centros.**
`brief-queries.ts:22-84` (`getSessionBrief`) filtra la sesión **solo por `orgId`** y autoriza con `canViewSessionDebrief`, que devuelve `true` para `OWNER`/`CENTER_DIRECTOR` **sobre cualquier sesión de la organización**, sin cruzar el centro. `center-scope.ts` documenta explícitamente que un director de centro no debe ver *"el expediente completo (salud incluida) de un socio de otro centro"*, y la ficha de socio sí lo aplica con `isMemberInScope` — **el brief no**.
*Explotación verificada end-to-end*: `CENTER_DIRECTOR` de "La Jota" → el índice de Session Brief le lista sesiones de todos los centros → abre una de "Puerta del Carmen" → recibe `canSeeHealth: true` y el roster con `conditions` y `matchedRules`. **Se obtuvo la lesión "rodilla derecha, esguince leve" de un socio de otro centro**, igual por web (`/brief/[id]`) que por API móvil.
*Arreglo*: en `getSessionBrief`, resolver el `centerId` de la sesión y comprobar `isCenterInScope(actor, centerId)`; si falla, devolver `null`. **Aplica a la vez a web y móvil porque ambas comparten esta función.**

**SEC-02 · MEDIO — `confirmDemoCheckoutAction` no comprueba `isDemoModeActive()`: alta de organización operativa sin pago.**
`demo-checkout/actions.ts:21-43`. La **página** redirige a `/planes` si Stripe está configurado, pero **la server action que la respalda no repite esa comprobación** — y una server action es un endpoint por sí misma, registrada en el build aunque la página redirija. Llama a `provisionDemoOrganization`, que crea una `Organization` con `platformStatus: "ACTIVE"` **sin cobrar nada**, saltándose el checkout del plano 1.
*Confianza media*: la falta de guarda está confirmada por lectura; el PoC exacto no se reprodujo por la codificación de argumentos ligados de la server action, pero el hueco lógico es real. *Arreglo*: `if (!isDemoModeActive()) return { ok: false, ... }` en la primera línea.

**SEC-03 · MEDIO — Sin cabeceras de seguridad HTTP.** Verificado con `curl -D -` contra `/login`: `next.config.ts` no define `async headers()` y **no se emite ninguna** — sin `X-Frame-Options`/CSP `frame-ancestors` la app es enmarcable (clickjacking sobre acciones autenticadas), sin HSTS queda expuesta a downgrade, y sin CSP no hay defensa en profundidad frente a XSS. En toda la superficie, incluidas pantallas con datos de salud y de pago.

**SEC-04 · BAJO — Sin rate limiting ni protección de fuerza bruta en login.** Verificado: **12 intentos fallidos consecutivos contra `/api/mobile/v1/auth/login` se procesan todos (401)**, sin bloqueo, retardo progresivo ni captcha; la misma ausencia en el login web. El coste bcrypt (10) es la única barrera. Agravante: **los emails de staff siguen un patrón predecible** (`rol.centro@org`).

#### APP MÓVIL Y API MÓVIL

**SEC-05 · ALTO — Los endpoints de agenda móvil no aplican ámbito de centro: crear/editar/borrar sesiones de otro centro.**
`api/mobile/v1/agenda/sessions/route.ts:27-60` (POST) y `.../[id]/route.ts:34-82` (PATCH/DELETE) solo comprueban `canManageEpSlots(role)` + `orgId`. `saveSession` valida que el **entrenador asignado** esté imputado al centro, pero **nunca comprueba que el actor lo esté**. El espejo web (`agenda/session-actions.ts:34,42-44,123-125`) sí exige `requireCenterRole` sobre el centro de origen **y** el de destino: **la API móvil es el "espejo olvidado" que se saltó esa guarda.**
*Explotación verificada con dos cuentas distintas*: una entrenadora imputada solo a "La Jota" **creó una sesión nueva en Puerta del Carmen** (`{"ok":true,…}`), **renombró una sesión existente de ese centro a "AUDIT-HIJACKED"** y **borró la que había creado** — todo con 200. Su propio `GET /agenda` solo lista "La Jota", confirmando que el centro está fuera de su ámbito.
*Arreglo*: comprobar `isCenterInScope(actor, centerId)` sobre destino y origen (vía `getSessionCenterId`) antes de llamar a `saveSession`/`deleteSession` — **igual que ya hacen los endpoints hermanos** `agenda/ep-slots`, `agenda/sessions/[id]/bookings` y `capacity`.

**SEC-06 · BAJO — Fallback de URL en claro para desarrollo.** `apps/mobile/src/api/client.ts:22-34` compone `http://` (no HTTPS). Aceptable en local, pero **un despliegue mal configurado mandaría tokens Bearer por HTTP**. Validar en arranque que `API_URL` empieza por `https://` fuera de `__DEV__`. *(Coincide con CN-28 del capítulo de cumplimiento.)*

#### Verificado y correcto

- **Aislamiento por token en la API móvil**: `orgId`/`centerId`/`role` salen siempre del JWT firmado, **nunca de parámetros del cliente**; `requireApiRole` añade el gate de `platformStatus`, espejo del layout web.
- **IDOR sobre recursos de socio**: `requireMember` resuelve la ficha desde `claims.sub`, nunca de un `memberId` del cliente; `cancelBookingForMember`/`bookSessionForMember` acotan por `memberId` propio; `submitSessionRatingAction` valida la propiedad; notificaciones y tareas se resuelven por `recipientUserId`; el `member-calendar` del socio no arrastra `feedbackAvg` confidencial.
- **Datos de salud**: todas las lecturas pasan por `health-access.ts`, `brief-queries.ts`, `trainer-panel-queries.ts` o `trainer-members-queries.ts` con `canViewHealthData` + `AuditLog`; la ficha móvil de dirección no expone salud; el briefing a la IA está seudonimizado y gateado por `consentAI` + `consentHealth`. **Excepción: SEC-01** (falta el ámbito de centro, no el gate de rol).
- **Tokens móviles**: access HS256 de 15 min; refresh opaco (`randomBytes(32)`, hasheado SHA-256 en BD) con rotación atómica vía `updateMany` condicional y **detección de reuso que revoca toda la familia**; `logout` revoca; una baja de plantilla invalida en el refresh; almacenados en `expo-secure-store`, nunca `AsyncStorage`.
- **Tokens de URL**: `invitations.ts` usa `crypto.randomBytes(32)` con caducidad y `usedAt` de un solo uso; `email-verification.ts` firma HMAC-SHA256 con `AUTH_SECRET`, con **`purpose` dentro de la firma** (evita cruce de propósitos), TTL por tipo y comparación en tiempo constante. La baja de un clic (RFC 8058) responde 200 uniforme sin filtrar existencia.
- **Enumeración de usuarios**: `authenticate` compara siempre contra un `DUMMY_PASSWORD_HASH` (tiempo constante); login y recuperación responden idéntico exista o no la cuenta.
- **Stripe**: webhook verifica firma con `constructEvent`; rutado plataforma/Connect por `event.account`; `resolveConnectOrgId` mapea `acct_` → `orgId` local; idempotencia por `Payment.status`/`provisioningSessionId`; 500 para forzar reintento; el callback de Connect ata `state` a `session.user.orgId` **y** exige `canManageOrg`; **los importes salen del `MembershipPlan` en BD, nunca del cliente**.
- **Jobs**: `/api/jobs/run` falla cerrado (503 sin secreto, verificado), compara con `timingSafeEqual` y aísla cada regla por org.
- **Center-scope en el resto de la API móvil**: `members`, `leads`, `staff`, `capacity`, `ep-slots`, `agenda/sessions/[id]/bookings`, `mesocycles` y `tasks` aplican correctamente `isMemberInScope`/`isCenterInScope`/`centerScopeFor` (verificado que `bookings` de un centro ajeno devuelve 404).
- **Inyección**: sin SQL crudo interpolado — los dos `$queryRaw` (`SELECT … FOR UPDATE`) usan parámetros; el export CSV de auditoría **neutraliza fórmulas** (`=`,`+`,`-`,`@`); sin `dangerouslySetInnerHTML`. Único `target="_blank"` sin `rel` en `online-library.tsx` (bajo: el destino es una URL de la propia org).
- **Secretos**: `.env` en `.gitignore` y no versionado (`git ls-files` solo muestra `.env.example` con placeholders); `render.yaml` y workflows usan `sync:false`/secrets. **Sin claves reales en el repo.**

#### Refuerzos recomendados

1. **Unificar el gate de centro en `getSessionBrief`** para que web y móvil no puedan divergir de nuevo.
2. **El patrón "espejo móvil" es el fallo repetido.** SEC-05 confirma que los handlers móviles que envuelven funciones de dominio deben replicar *todas* las guardas del server action web, no solo el predicado de rol. Introducir un `requireApiCenterScope(claims, centerId)` **obligatorio en cada escritura con `centerId`**.
3. **`npm audit`**: 2 vulnerabilidades (1 alta) por `mysql2` arrastrado transitivamente por `prisma`. El proyecto usa `@prisma/adapter-pg`, así que **`mysql2` no se ejecuta**, pero conviene fijar un `override` o actualizar Prisma cuando haya fix no disruptivo.
4. **Logs**: `mailer.ts:46-48` vuelca el **HTML completo del email** al log en modo no configurado. Evitarlo en producción.
5. **Rotación de `AUTH_SECRET`**: firma la cookie de sesión, los access tokens móviles **y** los tokens HMAC de email. Documentar que su rotación invalida las tres cosas a la vez.

## 3. Carencias para posicionamiento SEO

> Aviso de alcance: `node_modules/` está vacío en el entorno de revisión, así que no se
> ha podido ejecutar `npm run build` ni Lighthouse. Todo lo que sigue está anclado a
> lectura de código; las cifras de bundle quedan pendientes de una pasada con dependencias.

### 3.0 Quick wins (menos de un día, impacto desproporcionado)

| # | Acción | Fichero | Por qué primero |
|---|---|---|---|
| 1 | Excluir `robots.txt` y `sitemap.xml` del matcher del proxy | `src/proxy.ts:62` | Hoy cualquier `robots.ts`/`sitemap.ts` **redirige a `/login`**. Sin esto, el resto del bloque es inútil |
| 2 | Crear `src/app/robots.ts` con `disallow` de lo privado y de los tokens | no existe | 39 páginas privadas y 6 rutas con token sin ninguna señal de no-indexación |
| 3 | `metadataBase` + `openGraph` por defecto en el layout raíz | `src/app/layout.tsx:18-21` | Todo enlace compartido sale hoy sin tarjeta |
| 4 | `generateMetadata` en las dos páginas de centro | `hazte-socio/.../page.tsx:12`, `lead-form/.../page.tsx:7` | Todos los centros comparten hoy el mismo `<title>`: canibalización garantizada |
| 5 | Bajar `<h1>Elige tu plan</h1>` a `<h2>` | `src/app/planes/page.tsx:71` | Hay dos H1 en `/planes`. `e2e/planes-gateo.spec.ts:9` no comprueba el nivel: no se rompe |
| 6 | Decidir el nombre público en un único módulo | `src/app/layout.tsx:19` vs `src/components/apta-logo.tsx` | El logo dice "Apta", el `<title>` dice "TRAINING ZONE": Google indexa dos marcas |
| 7 | `noindex` en `/demo-checkout` y `/hazte-socio/gracias` | `demo-checkout/page.tsx:8`, `gracias/page.tsx:4` | Páginas de pago de prueba y de conversión, hoy indexables |

### 3.1 WEB APP

**A.1 · CRÍTICO — El proxy secuestraría `robots.txt` y `sitemap.xml`.**
`src/proxy.ts:62` — el matcher `"/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp)$).*)"` no excluye `.txt` ni `.xml`, y `src/lib/public-paths.ts:11-39` no los lista. Resultado: `NextResponse.redirect("/login?callbackUrl=/robots.txt")` (`src/proxy.ts:40-44`). Googlebot pide `robots.txt` antes de rastrear nada; un 307 a `/login` se interpreta como "no disponible" y puede suspender el rastreo del host. **Hay que arreglarlo antes de escribir los ficheros, no después.** Añadir `sitemap.xml|robots.txt` al matcher y ambas rutas a `PUBLIC_PATHS`.

**A.2 · CRÍTICO — No existe `robots.ts`: 39 páginas privadas sin señal de no-indexación.**
`grep -rn "robots\|noindex" src/` no devuelve nada. El único freno es el redirect. Eso evita servir contenido pero no evita que Google **descubra e indexe la URL** ("Indexada aunque bloqueada"), y `/login?callbackUrl=…` genera infinitas variantes que diluyen presupuesto de rastreo. Acción: `src/app/robots.ts` derivado de `PUBLIC_PATHS`, más `robots: { index: false, follow: false }` en el `metadata` de `src/app/(app)/layout.tsx` — cubre las 39 de golpe.

**A.3 · CRÍTICO — Seis rutas públicas con token firmado en la URL, sin `noindex`.**
`/onboarding/[token]`, `/verificar-email/[token]`, `/recuperar-clave/[token]`, `/gestionar-suscripcion/[token]`, `/preferencias/[token]`, `/baja/[token]` — todas en `PUBLIC_PATHS` (`src/lib/public-paths.ts:11-39`), ninguna con `robots`. Viajan en el pie de todos los correos transaccionales. Un `/gestionar-suscripcion/<token>` indexado es acceso sin contraseña al método de pago de una persona expuesto en la SERP: **es un incidente de datos personales, no solo un problema de SEO.** Acción: `robots: { index: false, follow: false, nocache: true }` en las seis + `Disallow` + `<meta name="referrer" content="no-referrer">` para que el token no se filtre en el `Referer`.

**A.4 · CRÍTICO — Las páginas de centro comparten `<title>` literal.**
`hazte-socio/[orgSlug]/[centerSlug]/page.tsx:12` → `title: "Hazte socio · Training Zone"`; `lead-form/[orgSlug]/[centerSlug]/page.tsx:7` → `"Únete · Training Zone"`. Son `metadata` estáticos pese a que `ctx.center.name` está disponible en el render. Cien centros = cien URLs con título idéntico y cuerpo idéntico salvo el `<h1>`: Google los agrupa y **elige una sola canónica**; las demás desaparecen. La propuesta de valor "cada centro con su página" hoy no existe funcionalmente. Acción: `generateMetadata` con `title`/`description`/`canonical`/`openGraph` por centro.

**A.5 · CRÍTICO — Las queries públicas no traen NAP.**
`src/lib/public-membership-queries.ts:21-24` y `src/lib/public-lead-queries.ts:11-14` hacen `select: { id, name }`, cuando `prisma/schema.prisma:91-108` **sí tiene** `address`, `lat`, `lng`, `timezone`. Y no existen en el modelo: `phone`, `openingHours`, `city`, `postalCode`, `neighborhood`, `description`, ni flag de publicación. Una página de "entrenamiento personal en Zaragoza" sin dirección, teléfono, horario ni texto propio no tiene nada que Google case con intención local. Acción en dos tiempos: (1) ampliar el `select` y pintar dirección + mapa; (2) migración de `Center` con `phone`, `city`, `postalCode`, `neighborhood`, `description @db.Text`, `openingHours Json?`, `publicPage Boolean @default(false)`. **`description` es el campo que decide si esto posiciona**: sin párrafo propio por centro, la plantilla compartida sigue siendo contenido duplicado aunque cambies el `title`.

**A.6 · ALTO — Cero datos estructurados.** `grep -rn "application/ld+json\|schema.org" src/ apps/` no devuelve nada. Se pierde: `LocalBusiness`/`SportsActivityLocation` por centro, `FAQPage` en `/planes` (las 5 preguntas **ya están escritas** en `src/app/planes/faq.tsx:4-57`), `Organization` y `SoftwareApplication`. Genera el `FAQPage` desde el array `FAQS`, no a mano, o se desincronizan.
*Cuidado con `Offer`*: `src/lib/platform-plans.ts:38` documenta que `priceLabel` es "solo presentación: el importe real lo manda Stripe". Marcar `price` desde esa etiqueta es publicar un precio que puede no coincidir con el cobro — riesgo de acción manual por datos estructurados engañosos. Emitir `Offer` sin `price` hasta que haya importe canónico. Y emitir `LocalBusiness` **solo** si `address` y `lat/lng` no son nulos: marcado incompleto es peor que ausente.

**A.7 · ALTO — No existe `sitemap.ts` y las páginas de centro son huérfanas.**
Ninguna página pública tiene `generateStaticParams`, y no hay ningún índice interno que enlace a los centros: si el gimnasio no las enlaza desde su web, Google no llega jamás. El `sitemap.ts` debe filtrar por `Organization.platformStatus` (`prisma/schema.prisma:36`) y por el futuro `Center.publicPage` — sin ese filtro publicarías gimnasios que no han pagado y organizaciones de prueba. `/lead-form/` **no** va al sitemap (ver A.9).

**A.8 · ALTO — El layout raíz no tiene `metadataBase`, `openGraph`, `twitter` ni canonical.**
`src/app/layout.tsx:18-21` son cuatro líneas: `title: "TRAINING ZONE"` y una `description`. Sin `metadataBase`, cualquier `openGraph.images` relativa se resuelve mal. Sin OG, cada enlace compartido sale como texto plano — y en venta B2B a dueños de gimnasio la recomendación ocurre por mensajería. Y "TRAINING ZONE" no contiene ninguna palabra clave: es una marca desconocida ocupando los 60 caracteres más valiosos. Acción: crear `src/lib/site.ts` con `BRAND` y `publicOrigin()` (hoy `NEXTAUTH_URL` está duplicado en 5 módulos: `email-verification.ts:95`, `invitations.ts:18`, `member-billing.ts:16`, `platform-billing.ts:14`, `stripe-connect.ts:10`) y usar `title: { default, template: "%s · Apta" }`. Con eso, un cambio de marca es **una línea**; hoy "Training Zone" está incrustado en 4 títulos públicos más una docena de remitentes de email.

**A.9 · ALTO — `/hazte-socio` y `/lead-form` compiten por la misma intención, sin canonical.**
Mismo `[orgSlug]/[centerSlug]`, mismo bloque de cabecera (comparar `hazte-socio/…:46-57` con `lead-form/…:21-32`), ninguna declara `alternates.canonical`. Google elegirá probablemente `/lead-form` — la que el gimnasio embebe y por tanto la que recibe enlaces — y el usuario aterrizará en un formulario en vez de en la página con precios. Acción: `/hazte-socio` es la canónica; en `/lead-form` poner `alternates.canonical` apuntando a ella + `robots: { index: false, follow: true }`.

**A.10 · ALTO — 86 KB de pantallas de demostración al cliente en la landing.**
`src/app/planes/tour-screens.tsx` son **85.911 bytes** de fuente, importados desde `tour-stage.tsx:19` que es `"use client"`; `tour-stage.tsx` son otros 22 KB. ~108 KB de JS antes de poder pulsar "Ver planes", en la página donde se decide la conversión B2B.
*Nota positiva*: Leaflet y Recharts **no** tocan ninguna ruta pública — solo `(app)/mapa-barrios`, `(app)/dashboard`, `(app)/members`, `(app)/portal/activity-chart.tsx` y `src/components/single-metric-chart.tsx`. Ese riesgo no existe.
Acción: `dynamic(() => import("./tour-stage"), { ssr: false })` con póster de **exactamente** las mismas dimensiones (si no, cambias TBT por CLS), o carga por intersección.

**A.11 · ALTO — Cero analítica, cero Search Console, cero eventos de conversión.**
`grep -rni "gtag|googletagmanager|analytics|plausible|posthog|umami|fbq|@vercel/analytics"` no devuelve nada. Cualquier trabajo de SEO sin Search Console es opinión. Acción: `metadata.verification.google`, analítica sin cookies (Plausible/Umami, o GA4 con Consent Mode) para no arrastrar banner en la landing, y eventos en el `submit` de `/api/checkout` (`planes/page.tsx:193`), el checkout de centro (`hazte-socio/…:74`) y el lead form.

**A.12 · MEDIO — Dos H1 en `/planes`.** `planes/hero.tsx:20` y `planes/page.tsx:71`. (Los dos `<h1>` de `activar/page.tsx:62` y `:113` **sí son correctos**: ramas de `return` mutuamente excluyentes.) Además el H1 del hero no lleva la consulta principal, y el eyebrow de `hero.tsx:17-19` la duplicaría.

**A.13 · MEDIO — No hay ninguna página de captación.** Inventario completo de páginas públicas indexables: `/planes`, `/privacidad` y las dos plantillas de centro. **Cuatro URLs** contra Trainingym, Mindbody, Virtuagym, Glofox y AimHarder, todos con blogs de cientos de artículos. Por orden de retorno: (1) páginas por funcionalidad — el contenido **ya está escrito** en `FEATURE_LABEL`/`CORE_FEATURES` de `src/lib/platform-plans.ts`; (2) páginas por vertical (box/CrossFit, EP, pilates) — el hero ya nombra los tres; (3) índice `/centros` y `/centros/[ciudad]`, que además resuelve la orfandad de A.7; (4) blog, al final.

**A.14 · MEDIO — Sin `next/image` en ninguna página pública.** Logos dinámicos como `<img>` sin dimensiones en `hazte-socio/…:49` y `lead-form/…:24` → CLS justo encima del H1. Y `logoUrl` es una URL arbitraria por organización: un gimnasio puede subir un PNG de 3 MB y hundir el LCP de su propia página. Requiere `images.remotePatterns` en `next.config.ts` (hoy solo tiene `redirects`). *Bien resuelto*: la fuente ya usa `next/font/google` con `display: "swap"` (`layout.tsx:15`).

**A.15 · MEDIO — Los testimonios son inventados con nombre y cargo.** `src/app/planes/testimonials.tsx:4-23`: tres citas atribuidas a personas y empresas concretas; el propio comentario de cabecera reconoce que son inventadas, y el único descargo es un subtítulo genérico *debajo* (línea 32). La Ley 3/1991 de competencia desleal, tras la Directiva Ómnibus (RDL 24/2021), exige medidas razonables para verificar que las reseñas proceden de clientes reales. Y en SEO es una señal directa contra E-E-A-T. Dos salidas, sin término medio: retirar la sección, o desatribuir por completo con un rótulo inequívoco **encima**.

**A.16 · MEDIO — Las páginas de centro no se cachean.** Sin `revalidate` ni `generateStaticParams`, y con dos consultas secuenciales en `public-membership-queries.ts:15-25` más `getActiveMembershipPlans` e `isStripeConfiguredForOrg`. Acción: `revalidate = 600` + `revalidateTag`. **No repliques esto en `/planes`**: su `force-dynamic` (`planes/page.tsx:20`) está justificado; ahí lo correcto es extraer el bloque de precios a `<Suspense>` y dejar estático hero, tour, FAQ y testimonios.

**A.17 · BAJO** — Sin `manifest.ts`, sin `opengraph-image.tsx`, sin `not-found.tsx` propio (aunque `notFound()` se invoca en `hazte-socio/…:39` y `lead-form/…:16`). `favicon.ico` sí existe. Conviene además borrar los cinco SVG de plantilla de Next que quedan en `public/`.

**A.18 · BAJO** — `lang="es"` fijo en `layout.tsx:39`, correcto hoy. Pasaría a crítico el día que se venda en Latinoamérica.

### 3.2 APP MÓVIL (ASO)

**B.1 · CRÍTICO — `app.json` no tiene identificadores de tienda: no se puede publicar.**
`apps/mobile/app.json` **no tiene bloque `ios` en absoluto**, ni `android.package`, ni `ios.bundleIdentifier`, ni `description`, ni `privacy`. Tampoco existe `apps/mobile/eas.json`. Sin eso no hay build firmada, ni TestFlight, ni ficha. Hoy hay **cero** presencia en tiendas, y la ficha es un índice de búsqueda propio.
**Decisión que hay que tomar ya:** `bundleIdentifier` y `package` son **inmutables tras la primera subida**. Como "Apta" es provisional, o se cierra el nombre antes de publicar, o se elige un identificador neutro de empresa. Es la única pieza del repo donde el nombre queda cementado de forma irreversible.

**B.2 · CRÍTICO — Sin App Links / Universal Links.**
`expo-linking` está en dependencias pero solo se usa para `Linking.openURL("tel:…")` (`(tabs)/leads.tsx:62`, `(tabs)/mis-socios/[id].tsx:146`). El único esquema es `"scheme": "trainingzone"` (`app.json:7`) — privado, no verificable, y con el nombre viejo. No hay `apple-app-site-association` ni `assetlinks.json` en `public/`. Consecuencias: un socio que recibe `…/portal/agenda` por correo abre el navegador aunque tenga la app; Google no puede indexar contenido de la app ni mostrar "Abrir en la aplicación"; y se pierde la atribución web → instalación.
**Ojo:** `src/proxy.ts:62` tampoco excluye `/.well-known/*` → redirigiría la verificación a `/login` y fallaría **en silencio**. Es exactamente la misma raíz que A.1.

**B.3 · ALTO — La ficha de tienda no tiene contenido.**
`app.json:2-3`: `name: "Training Zone"`, `slug: "trainingzone-mobile"`, sin `description`. En `apps/mobile/assets/images/` solo hay iconos: **ni una captura de pantalla**. El título de la ficha es el factor de posicionamiento más fuerte de ambas tiendas y "Training Zone" a secas no contiene una sola palabra que nadie busque — además de chocar con la marca "Apta" de la web. Las capturas son el factor número uno de conversión ficha → instalación.
Copy propuesto: nombre `Apta · Tu gimnasio` (30 car.), subtítulo `Reserva, bonos y tu progreso`, descripción breve Play `Reserva tus sesiones, consulta tus bonos y sigue tu progreso. Sin llamar al centro.`, y palabras clave `gimnasio,entrenador,reservas,bono,clases,fitness,crossfit,box,pilates,entrenamiento,agenda`.

**B.4 · ALTO — No hay página web que alimente a la app ni enlaces a las tiendas.**
`src/app/planes/hero.tsx:25` promete "portal del socio y app móvil incluidos desde el primer día", pero no existe `/app`, ni botones de tienda, ni smart banner, y las páginas de centro no la mencionan. Sin tráfico web hacia la ficha, la app parte de cero dentro de la tienda. Acción: página `/app` con capturas, botones y JSON-LD `MobileApplication`; `<meta name="apple-itunes-app">` en el layout; botones de tienda en la página de centro, que es donde está el socio real.

**B.5 · MEDIO — Sin OTA updates ni política de privacidad enlazable.**
`expo-updates` no está en `apps/mobile/package.json` pese a que `docs/APP_MOVIL_NATIVA_PLAN.md:297` lo da por planificado. `src/app/privacidad/page.tsx` existe y es pública, pero no se referencia desde `app.json` ni desde ninguna pantalla. **Ambas tiendas rechazan la ficha sin URL de política de privacidad**, y los cuestionarios *App Privacy* / *Data safety* tienen que declarar los datos de salud que la app maneja: declararlos mal es motivo de retirada.

### 3.3 Palabras clave objetivo

> No se han podido verificar volúmenes de búsqueda. Lo que sigue son intenciones y
> prioridades razonadas, **no cifras**; validar en Search Console o Keyword Planner
> antes de comprometer copy.

| Página | Consulta principal | Intención | Por qué esa |
|---|---|---|---|
| `/planes` | `software gestión gimnasio` | Comercial | Consulta de cabecera; copada por Trainingym/Mindbody y directorios. No se gana pronto, pero fija H1 y `title` |
| `/planes` (sec.) | `programa para gestionar gimnasio pequeño` | Comercial, cola larga | Cualifica el segmento real de Apta (`maxCenters` en `platform-plans.ts`); mejor conversión |
| `/software-para-boxes-crossfit` | `software para box de crossfit` | Comercial | El hero ya nombra "box"; competencia menor y ticket alto |
| `/software-entrenamiento-personal` | `app para entrenadores personales` | Comercial | El diferencial de Apta (aptitud, valoraciones) encaja mejor aquí que en la genérica |
| `/software-gimnasio/reservas` | `app reservas gimnasio socios` | Comercial informacional | Contenido ya escrito en `CORE_FEATURES` |
| `/hazte-socio/[org]/[center]` | `entrenamiento personal {ciudad}` / `{barrio}` | Local transaccional | Única consulta que esta página puede ganar, y solo si A.5 aporta dirección, barrio y texto propio |
| `/hazte-socio/…` (sec.) | `grupos reducidos {barrio}` | Local transaccional | El repo ya distingue `EP`/`GROUP`/`ONLINE` (`hazte-socio/…:14-18`) |
| Ficha de tienda | `reservar clases gimnasio` | Navegacional | El socio busca "la app de mi gimnasio" |

### 3.4 Lo que depende de fuera del repo

| Qué | Paso concreto | Bloquea |
|---|---|---|
| **Dominio público definitivo** | Registrar y fijar `NEXT_PUBLIC_SITE_URL` en `render.yaml` (hoy solo hay `APP_URL`, línea 45). Sin origen canónico no hay `metadataBase`, ni canonical, ni sitemap | A.7, A.8, B.2 |
| **Nombre comercial** | Cerrar "Apta" o su sustituto **antes** de la primera subida: los identificadores son irreversibles | B.1 |
| **Google Search Console** | Verificar dominio por DNS TXT, enviar sitemap, revisar Cobertura semanalmente | A.11 |
| **Google Business Profile por centro** | Lo crea y verifica **el gimnasio**, no vosotros (postal o vídeo en el local). Sin GBP no hay paquete local ni Maps, y el JSON-LD rinde la mitad. Meter "reclama tu ficha de Google" como paso de `(app)/puesta-en-marcha`, con la instrucción de que NAP coincida **carácter a carácter** | A.6 |
| **Cuentas de desarrollador** | Apple 99 $/año + Google Play 25 $ único (ya identificado en `docs/APP_MOVIL_NATIVA_PLAN.md:288-289`) | B.1, B.3 |
| **Capturas de tienda** | 6-8 por plataforma, en los tamaños obligatorios. No existen en el repo | B.3 |
| **Enlaces entrantes** | Alta en Capterra ES, SoftwareDoIt y GetApp: ocupan la SERP de "software gimnasio" y son la vía más rápida a visibilidad | A.13 |
| **Testimonios reales** | Consentimiento por escrito de 3 clientes piloto. Hasta entonces, aplicar A.15 | A.15 |

### 3.5 Cómo se mide

- **Semana 0 (línea base)** — con `npm ci`: `npm run build` y anotar el *First Load JS* de `/planes` (hoy contaminado por los ~108 KB de `tour-*`). Lighthouse móvil de `/planes` y de una página de centro.
- **Semana 1 (tras los quick wins)** — `curl -s localhost:3000/robots.txt` **no** debe ser un 307; ningún `<loc>` del sitemap debe contener `/portal`, `/dashboard`, `/lead-form` ni token alguno; pasar el JSON-LD por el Rich Results Test y validator.schema.org antes de darlo por bueno.
- **Mes 1** — GSC con datos: URLs indexadas (objetivo 100 % de las públicas, 0 % de `(app)` y de rutas con token), impresiones y posición media de `/planes`.
- **Mes 3 (punto de decisión)** — clics orgánicos a `/planes`, conversión landing → checkout, nº de páginas de centro con impresiones > 0. Si las páginas de centro siguen a cero, el diagnóstico es A.5: falta contenido propio, no metadatos.
- **Mes 6** — instalaciones desde búsqueda en tienda vs. desde web, y conversión de la ficha.

## 4. Nivel de User Friendly

### 4.1 WEB APP — **6,4 / 10**

| Dimensión | Nota | Justificación |
|---|---|---|
| Navegabilidad y arquitectura de información | **7,0** | Nav por rol bien razonada y agrupada, pero sin migas y con rutas de 3 niveles sin vuelta ni título propio |
| Claridad por rol | **8,0** | Cada rol ve poco y pertinente; se enturbia en Organización/RRHH y en Admin de plataforma |
| Consistencia visual y de marca | **8,0** | Sistema de tokens serio, dos temas reales; lo rompen 81 hex sueltos en TSX y tres gradientes de oro a mano |
| Estados vacío / carga / error | **5,0** | **Cero `error.tsx` en toda la app**; 22 rutas sin `loading.tsx`; el feedback vive solo en un toast que no se anuncia |
| Formularios | **5,0** | 221 `<Field>` y 5 `htmlFor`; 0 `aria-invalid`; el `Select` con `required` no valida nada; 11 campos para captar un lead |
| Accesibilidad (WCAG 2.2 AA) | **4,0** | Fallos estructurales: sin `h1`, sin salto al contenido, foco que entra en menús cerrados, gris de apoyo por debajo de 4,5:1 |
| Responsive / tablet | **7,5** | Tarjetas bajo 640, variante `short`, columnas que se retiran en `xl`; falla el tramo 768–1023 y el cambio tabla→tarjetas parpadea |
| Motion y percepción de rendimiento | **8,0** | Vocabulario de movimiento muy trabajado y `prefers-reduced-motion` global; la barra de ruta llega tarde |

> **Lectura**: producto muy pensado en el nivel de *diseño* y flojo en el nivel de *contrato*. Lo que un usuario con ratón y vista ve es notable; lo que ocurre cuando algo falla, cuando se navega con teclado o con lector de pantalla, es aprobado raspado. **La EAA no la pasa hoy.**

**Lo que está bien y no hay que romper**: `src/lib/rbac.ts` es el mejor fichero del repo (navegación, gateo por plan y permisos juntos y comentados; `defaultRouteForRole:373` evita el bucle de redirección). El tema oscuro resuelto en el HTML del servidor (`layout.tsx:34-41`) sin destello. `DataTable` degrada a tarjetas bajo 640 px sin duplicar DOM (`data-table.tsx:63-81`) y mantiene el `toolbar` sin filas para poder deshacer un filtro (`:197-204`).

#### Los 10 problemas más graves (web)

1. **No existe ni un solo `error.tsx` en toda la aplicación.** 0 `error.tsx`, 0 `global-error.tsx`, 0 `not-found.tsx`. Cualquier excepción en un Server Component deja al usuario en la pantalla genérica de Next: sin marca, sin explicación y **sin salida** — el layout también cae, así que no hay ni sidebar ni header. Recepción con alguien delante se queda mirando "Application error". *Arreglo*: `error.tsx` en `(app)/` con `EmptyState` crítico, `reset()` y vuelta a `defaultRouteForRole`; más uno propio en `dashboard`, `members/[id]`, `agenda` y `billing`.
2. **Las etiquetas de formulario no están asociadas a ningún campo.** `src/components/ui/field.tsx:40`: el `<label>` es *hermano* de `{children}`, sin `htmlFor`. **221 usos de `<Field>` frente a 5 `htmlFor` en todo `src/`**: para un lector de pantalla, prácticamente todos los campos están sin nombre, y hacer clic en la etiqueta no enfoca. Falla 1.3.1, 3.3.2 y 4.1.2. *Arreglo*: `useId()` en `Field` + `htmlFor` + inyección al hijo, con `aria-describedby` y `aria-invalid`. **Un fichero arregla 221 sitios.**
3. **Los drawers cerrados siguen en el DOM y capturan el foco.** `drawer.tsx:45` hace `if (!mounted) return null;` sin comprobar `open`: el panel se pinta siempre y solo se aparta con `translate-x-full` (`:63-65`). En `/members`, un usuario de teclado tabula desde la tabla y cae dentro del formulario invisible de "Nuevo socio", que además tiene `role="dialog" aria-modal="true"`. 16 usos de `<Drawer>`. Lo mismo con el sidebar móvil (`sidebar.tsx:218-225`). *Arreglo*: `inert` cuando `!open`, foco inicial, trampa de foco y devolución al disparador.
4. **El título de la página no es un encabezado, y 12 pantallas ponen un segundo.** `header.tsx:79-85` pinta el título de ruta en un `<div>`: el documento **no tiene `h1`**. Y `trainer/page.tsx:89`, `members/[id]/page.tsx:1175`, `puesta-en-marcha/page.tsx:23`, `portal/evolucion/page.tsx:57`… se pintan el suyo, duplicando. *Arreglo*: `<h1>` en el header, bajar los 12 a `<h2>`, y añadir enlace "Saltar al contenido" — hoy hay que tabular por los 15 items del sidebar en cada carga.
5. **El gris de apoyo de la marca no cumple contraste y se usa en todas partes.** `globals.css:27,46` — `--color-muted` `#8A8574` mide **3,69:1 sobre blanco**, 3,25:1 sobre hueso y **2,79:1 sobre arena**. Es el color de cabeceras de tabla, subtítulos, `hint` de campos y descripciones de `EmptyState`. Y `--color-faint` `#A8A296` (`:28`), color de los *placeholder* (`field.tsx:21`) y del "Sin resultados", mide **2,54:1**. *Arreglo*: `--color-muted` ≈ `#6E6A5C` y `--color-faint` ≈ `#7C7768`; en oscuro subir `#7B7566` a ≈ `#8F8879`. Y `--color-gold` sobre `--color-gold-bg` da 3,93:1: la `Badge` dorada no cumple a 11 px.
6. **Un `Select` marcado como `required` no valida nada.** `field.tsx:384` usa `<input type="hidden" … required>`, y los `hidden` están **excluidos de la validación de restricciones** del HTML. En `new-lead-drawer.tsx:113` (Centro) y `:143` (Canal) se envía el formulario vacío, se hace el viaje al servidor y el fallo vuelve como toast rojo genérico, sin marcar el campo culpable.
7. **Los toasts no se anuncian y son el único canal de resultado.** `toast.tsx:109-113`: el contenedor es `role="region"` y el `role="status"` va en cada toast *insertado después* — las regiones vivas deben existir en el DOM antes de recibir contenido, así que NVDA/JAWS típicamente no lo leen; y los errores usan `status` (polite) en vez de `alert`. Combinado con `action-form.tsx:49`, donde el error de una server action se muestra *solo* como toast: **un usuario ciego guarda un formulario y no recibe ninguna señal de si funcionó.** Además, 4200 ms fijos incumplen 2.2.1.
8. **Captar un lead en recepción cuesta 11 campos obligatorios.** `leads/new-lead-drawer.tsx:97-170`: nombre, apellidos, teléfono, CP, centro, ocupación, canal, objetivos y —línea 165— "Lesiones / patologías" con el hint *'Obligatorio, escribe "ninguna" si no aplica'*. Eso es un formulario de admisión, no una captura de lead, y quien lo rellena tiene a alguien esperando de pie. *Arreglo*: dos pasos (nombre, teléfono, centro, canal / el resto diferible), y sustituir el campo de lesiones por un select.
9. **Las tablas no informan de su orden ni tienen encabezados semánticos.** `data-table.tsx:276-320`: `<th>` sin `scope="col"`, **0 `aria-sort` en todo `src/`**, y el estado del orden se cuenta solo con una flecha de 10 px al 25 % de opacidad. Segundo problema: la **paginación es de cliente** (`:184-186`), o sea que el servidor envía las 500 filas y el navegador ordena y corta.
10. **La primera pantalla del producto enseña un panel de acceso demo y dos botones muertos.** `login/login-form.tsx:271-296` lista usuarios demo con inicio a un clic y la contraseña compartida impresa en un `<code>`; y `:183-201` deja "Continuar con Microsoft" y "Continuar con Google" permanentemente `disabled`, con la explicación escondida en un `title` que no se ve ni con teclado ni en táctil. Para un producto que se vende como premium multi-tenant es la peor primera impresión posible.

#### Deuda visual (web, para después)

22 rutas sin `loading.tsx` (`aforo`, `anuncios`, `rrhh`, `mi-perfil`, `health/*`, `portal/evolucion`, `portal/chat`, `brief/[id]`, `agenda/session/[id]`…) · 81 hex en JSX, concentrados en `_perfil/theme-card.tsx` (20), `planes/tour-screens.tsx` (16), `dashboard/postal-heatmap.tsx` (11) · el gradiente de oro triplicado a mano (`sidebar.tsx:71-72`, `data-table.tsx:313`, `route-progress.tsx:22`) existiendo la utilidad `.tz-gold-bar` · `confirm-dialog.tsx:69` usa `bg-[rgba(20,20,18,.55)]` existiendo `--color-scrim` · `PARENT_ROUTE` (`rbac.ts:414`) solo cubre `/mapa-barrios`: `members/[id]/valoraciones/[assessmentId]` y `.../mesociclos/[mesocycleId]` no tienen vuelta y se titulan "Socios" · el cambio tabla→tarjetas se resuelve en cliente, así que en móvil el primer pintado es la tabla ancha · `RouteProgress` se rearma con `usePathname`, que cambia **al terminar** la navegación: la barra celebra una carga que ya ocurrió · **entre 768 y 1023 px —tablet en vertical, que es como la sostiene un entrenador— no hay navegación persistente**, solo hamburguesa.

### 4.2 APP MÓVIL — **6,9 / 10**

| Dimensión | Nota | Justificación |
|---|---|---|
| Navegabilidad y arquitectura de información | **7,5** | Cinco pestañas por rol, "Más" como índice real con contadores, `backBehavior="history"` bien argumentado; se cae en dos roles |
| Claridad por rol | **7,5** | El entrenador y el socio tienen su app; dirección y soporte quedan a medias |
| Consistencia visual y de marca | **7,5** | Tokens portados con criterio; sin control de tema, rótulos de rol divergentes y otra familia de iconos |
| Estados vacío / carga / error | **8,0** | Cobertura sistemática (31 de 33 pantallas); solo `mas` y `perfil` sin estado de carga |
| Formularios | **6,0** | `Sheet` con `KeyboardAvoidingView` bien resuelto; el campo no tiene nombre accesible ni validación inline |
| Accesibilidad (WCAG 2.2 AA) | **4,5** | 70 `accessibilityRole` es buen punto de partida, pero la barra de pestañas no contrasta y no hay encabezados |
| Densidad y uso a una mano | **7,0** | Aire, una acción por pantalla, `hitSlop` en 16 sitios; botones `sm` de 36 px y textos de 9,5 px lo bajan |
| Motion y percepción de rendimiento | **7,0** | El motion es lo mejor de las dos apps (9); el rendimiento de listas largas lo hunde (5) |

> **Lectura**: mejor producto que la web en experiencia percibida —más enfocada, estados resueltos, motion notable— y peor en dos cosas concretas y muy caras: contraste de la navegación principal y virtualización de listas.

**Lo que está bien**: `theme/motion.ts` es documentación ejecutable, con `useReducedMotion()` conectado a `AccessibilityInfo` con suscripción viva — mejor que la web. `api/client.ts:38-66` traduce **todo** fallo de red a un mensaje en castellano con timeout de 12 s: un usuario nunca ve "Network request failed"; **esto debería copiarlo la web**. Y `_layout.tsx:131` con `backBehavior="history"` es una decisión que se toma después de ver a alguien perderse.

#### Los 10 problemas más graves (móvil)

1. **La barra de pestañas no se lee en piel clara.** `(tabs)/_layout.tsx:146-147`: activo `theme.gold` `#C8AB72` = **2,20:1** sobre blanco; inactivo `theme.textFaint` `#A8A296` = **2,54:1**. Ni el 3:1 de componente ni el 4,5:1 de texto. En oscuro, `#6E6A5E` sobre la barra da ~2,7:1: también falla. **La navegación principal es ilegible al sol, que es donde se usa.** *Arreglo*: el token correcto ya existe — `theme.goldText` (`theme.ts:112`); e inactivo con `theme.textMuted`. Y subir `tabBarLabelStyle.fontSize` de 9,5 (`:172`) a 11.
2. **Cero listas virtualizadas: 0 `FlatList` en toda la app.** `ScreenContainer.tsx:97-113` monta todo en un `ScrollView`, y `socios/index.tsx:41-48` acumula páginas con `flatMap` + `onEndReached` dentro de ese mismo `ScrollView`. Un centro con 500 socios = 500 tarjetas vivas con sus `Animated.Value`. En gama media eso se lee como "la app va mal". *Arreglo*: variante de `ScreenContainer` sobre `FlatList` y migrar `socios/index`, `mis-socios/index`, `leads` y `consumo`; y desactivar `FadeInUp` a partir del sexto elemento.
3. **Los campos no tienen nombre accesible.** `Field.tsx:44`: la etiqueta es un `<Text>` suelto y el `<TextInput>` de `:65` no recibe `accessibilityLabel`. En RN no hay asociación implícita: VoiceOver y TalkBack anuncian "campo de texto" a secas. 24 usos, incluido el login.
4. **El toast nunca se anuncia y no se puede leer con calma.** `Toast.tsx:56-66`: `pointerEvents="none"`, sin `accessibilityLiveRegion`, sin `announceForAccessibility`, y temporizador fijo de 2800 ms (`:20`). Es el **único** acuse de recibo de reservar, cancelar, guardar un debrief o descartar un lead.
5. **Ninguna pantalla declara encabezados.** `ScreenHeader.tsx:24` y `:38` son `<Text>` planos; **0 `accessibilityRole="header"` en toda la app**. Sin encabezados, el rotor de VoiceOver no funciona y la única forma de moverse por la ficha de socio es barrer elemento a elemento. *Arreglo*: **dos líneas, efecto en las 33 pantallas.**
6. **La app no obedece a `User.theme`: siempre oscura.** `theme.ts:186-189` decide solo con `useColorScheme()`, y `perfil.tsx` no ofrece ningún control. La misma persona pone "claro" en el portátil y el móvil le sigue saliendo oscuro; quien necesita piel clara por sensibilidad al contraste solo puede cambiar el ajuste de todo el sistema operativo.
7. **Dirección de organización no tiene la agenda en su navegación.** `auth/routes.ts:57` da a `OWNER` dashboard/socios/productos/organizacion/mas, y `mas.tsx:75-89` no incluye baldosa de agenda para ese rol: la única puerta es un botón secundario dentro del panel (`dashboard.tsx:157`). Dirección **de centro** sí la tiene como pestaña (`:58`). Además `PLATFORM_ADMIN` no cumple ninguna condición de baldosa, así que su "Más" pinta **una rejilla vacía**.
8. **La tipografía es demasiado pequeña y no se ha probado escalada.** `typography.ts`: `badge` 9,5 px, `legend` 9,5, `kpiLabel` 10, `kicker` 10,5; etiqueta de pestaña 9,5 y contador 9. Y **0 apariciones de `allowFontScaling`/`maxFontSizeMultiplier`** conviviendo con alturas fijas (`Button` `HEIGHT.sm = 36`, `iconWrapper` 22 px, `tabBarHeight: 58`): el texto se recorta en cuanto alguien sube el tamaño de letra. WCAG 1.4.4 exige 200 %.
9. **Objetivos táctiles por debajo de 44 px.** `Button.tsx:50` `HEIGHT: { sm: 36, md: 46, lg: 54 }` sin `hitSlop`, **existiendo `layout.touchMin = 44` declarado y no usado** (`theme.ts:162`). El `sm` es el de las acciones de tarjeta, que son las que se pulsan de pie y con las manos ocupadas. 71 pulsables, 16 `hitSlop`.
10. **"Más" y "Perfil" cargan sin ningún estado.** `mas.tsx` no tiene `isLoading`: las baldosas se pintan con contadores a 0 (`:66-68`) y saltan al valor real al llegar la respuesta. Un contador que pone "0 tareas" y medio segundo después "7" es peor que un esqueleto: el usuario ya ha decidido que no tiene nada que hacer.

#### Deuda visual (móvil)

39 hex y 15 `rgba()` sueltos (`Button.tsx` 9, `Field.tsx` 6, `login.tsx` 6, `staff-agenda.tsx` 5) — muchos son paletas "sobre tinta" legítimas, pero deberían ser tokens `onInk.*`, que ya existen parcialmente (`theme.ts:81-88`) · `Toast.tsx:93`: `width: 7, height: 7, borderRadius: 4` no es un círculo · cuatro `LinearGradient` con arrays locales en vez de `theme.heroGradient` · `Sheet.tsx:102` usa `<Modal>` sin `accessibilityViewIsModal`: en iOS VoiceOver puede alcanzar el contenido de detrás.

### 4.3 Qué falta para que se sientan un único producto

Hoy comparten paleta y tipografía, pero **divergen en las tres capas que el usuario nota**: cómo se llaman las cosas, qué puede hacer en cada sitio y qué aspecto tiene el mismo objeto.

1. **Un solo diccionario de rótulos, generado, no copiado.** `ROLE_LABEL` está escrito dos veces con textos distintos (`perfil.tsx:27-35` dice "Dirección" y "Administración"; `src/lib/rbac.ts:382-391` dice "Dirección de organización" y "Admin plataforma"). Y la web llama "Organización" a lo que la app llama "Equipo" (`_layout.tsx:70`), mientras los productos viven dentro de `/organization` en web y tienen pestaña propia en la app. **Un director que usa las dos aprende dos mapas.**
2. **Una sola matriz de permisos, con la nativa como espejo verificado.** `apps/mobile/src/auth/routes.ts:133-167` reimplementa a mano `canManageCenterCapacity`, `canAssignTasks`, `canManageLeads`, `canManageEpSlots` y `canManageAnnouncements`. Hoy coinciden; en cuanto una cambie, la app enseñará un botón que el servidor rechaza con 403 — que es **exactamente el bug que el comentario de `routes.ts:59-62` cuenta que ya ocurrió**. Extraer los predicados a un módulo compartido (basta con tipar `Role` como unión literal en vez de importarlo de `@prisma/client`), o como mínimo un test que compare las dos tablas.
3. **Una sola familia de iconos.** `src/components/nav-icons.tsx` nombra por dominio (`panel`, `socios`, `agenda`, `cobros`); `apps/mobile/src/components/Icon.tsx` por forma (`activity`, `users`, `calendar`, `wallet`), con geometrías distintas. La misma "Agenda" se dibuja de dos maneras. Los trazos del móvil están mejor construidos: exportarlos como datos de path y consumirlos en ambas superficies.
4. **Paridad de capacidades donde el rol la espera.** Recepción tiene "Cobros" en la web (`rbac.ts:170`) y nada equivalente en la app; dirección de organización tiene Agenda en la web y no en la barra. Regla explícita: *toda entrada de menú de un rol en la web existe en la app, como pestaña o como baldosa de "Más"*.
5. **Un solo contrato de estados.** La app tiene carga, vacío y error en 31 de 33 pantallas; la web no tiene ni un `error.tsx`. El mensaje de red de `api/client.ts:60-64` es exactamente lo que debería decir la web: copiarlo a los `error.tsx` que hay que crear es la forma más barata de que las dos suenen igual.
6. **Una preferencia de tema, no dos.** `User.theme` debe mandar en las dos superficies, con "Sistema" como tercera opción.
7. **Un umbral de contraste común.** Los mismos tokens fallan en las dos (`#8A8574`/`#A8A296` en web; `#A8A296`/`#6E6A5E`/`#C8AB72` en móvil). Corregirlos **en el mismo cambio**, con las parejas fondo/texto documentadas junto al token.

### 4.4 Orden de ataque de usabilidad

1. `error.tsx` en la web (bloqueante: hoy hay pantallas sin salida).
2. `Field` con `htmlFor` + `aria-invalid` + `aria-describedby`, web y nativa — **un fichero cada una, 245 sitios**.
3. Contraste de los tokens gris/oro en las dos superficies, y tint de la barra de pestañas.
4. `inert` y trampa de foco en `Drawer` y `Sidebar`.
5. `<h1>` en el header + enlace de salto al contenido.
6. `FlatList` en las cuatro listas largas de la app nativa.

Del 1 al 5 son cambios pequeños y localizados que suben la nota de accesibilidad de la web de 4,0 a un 7 largo. El 6 es el único que pide trabajo de verdad.

> **Aviso metodológico**: esta auditoría es de código, con contrastes calculados por fórmula WCAG sobre 31 parejas token/fondo. **No se han probado los tres anchos ni los dos temas en navegador real**, ni con `prefers-reduced-motion` activado. Conviene una pasada de dispositivo antes de priorizar. Además, los arreglos 2, 3, 4 y 9 del bloque web tocan selectores de `e2e/leads.spec.ts`, `e2e/alta-socio-bonos.spec.ts`, `e2e/plantilla-crud.spec.ts` y `e2e/members-bonos-calendario.spec.ts`.

## 5. Stripe: estado real, historias de usuario, pasos y requisitos

> **Método**: `docs.stripe.com` está bloqueado por el proxy de este entorno, así que las afirmaciones sobre formas de la API se han verificado contra el SDK instalado (`node_modules/stripe` **22.5.0**, API fijada `2026-07-29.dahlia`), que es la fuente exacta para esta versión. Lo que depende de política comercial de Stripe (disponibilidad de Bizum/SEPA, plazos) queda marcado como *confirmar en docs*.

### 5.1 Estado actual real

**Superficie de escritura contra Stripe en todo el sistema: 8 llamadas.**

| Llamada | Fichero | Plano |
|---|---|---|
| `oauth.token`, `accounts.retrieve` | `stripe-connect.ts:36,50,76` | Connect |
| `checkout.sessions.create`, `customers.create` | `platform-billing.ts:50,84,93` | 1 (Apta → gimnasios) |
| `products.create`, `prices.create`, `customers.create`, `checkout.sessions.create`, `billingPortal.sessions.create` | `member-billing.ts:56,58,123,140,226,264` | 2 (gimnasio → socios) |

**No existe ni una sola llamada** a `subscriptions.update/cancel`, `refunds.create`, `invoices.*`, `prices.update`, `products.update`, `balance`, `payouts`, `disputes`, `creditNotes` ni `subscriptionSchedules`. Es decir: **todo el ciclo de vida posterior a la venta está desconectado de Stripe.**

#### Lo que SÍ está implementado de verdad

*Plano 1*: catálogo como dato con resolución de `price_…` por entorno (`platform-plans.ts:62-139`); checkout de licencia sin org previa con `tax_id_collection` (`platform-billing.ts:26-63`); checkout de renovación (`:66-104`); alta de organización desde webhook, idempotente por `provisioningSessionId` (`provisioning.ts:75-185`); muro de pago por `platformStatus` (`(app)/layout.tsx:58-69`, `guard.ts:28-40`).

*Plano 2*: **Connect Standard OAuth completo**, con `state = orgId` **más** verificación contra la sesión y `canManageOrg` (`api/stripe/connect/callback/route.ts:18-51`) — esto está bien hecho; espejo perezoso `MembershipPlan` → Product/Price con invalidación por cambio de cuenta (`member-billing.ts:40-74`); checkout subscription/payment según `isRecurring()`; checkout anónimo de prospecto desde landing (`:194-249`, `stripe-checkout.ts:112-213`); Billing Portal de la cuenta conectada (`:256-270`); reconciliadores con aislamiento por `orgId` y reintento explícito ante orden no garantizado (`:332-380`, `:393-469`, `:553-623`); dunning con email al socio una vez por factura (marca en `AuditLog`), aviso idempotente a recepción, `Member.state = DELINQUENT` y resolución al cobrar; rutado único de webhook por `event.account` con 500 en fallo; **7 tests unitarios reales de reconciliadores contra BD** (`member-billing.test.ts:110-220`).

#### Lo que está SIMULADO

`/demo-checkout` sustituye el checkout de **licencia** sin `STRIPE_SECRET_KEY` y da de alta la org sin cobrar (correctamente protegido, con el cupo Fundador re-verificado). **No hay equivalente demo para el plano 2**: sin Stripe, el socio simplemente no puede comprar. `mode: "manual"` en móvil (`api/mobile/v1/checkout/route.ts:42-45`) es honesto pero deja el cobro fuera del sistema. La "devolución" (`billing/subscription-actions.ts:62-99`) es marcar `REFUNDED` en local, y **bloquea** si el pago vino de Stripe; `Payment.stripeRefundId` sigue siempre NULL. `receiptNumber` es un correlativo `TZ-2000+` calculado con `count()`: **no es una factura fiscal**.

#### Lo que está A MEDIAS (la categoría más peligrosa)

**a) El ciclo de vida de la suscripción es 100 % local y NO se propaga a Stripe.**

| Acción de negocio | Escribe en local | Escribe en Stripe |
|---|---|---|
| Congelar (`subscription-actions.ts:102-131`) | `FROZEN` + `Member.FROZEN` | **nada** → Stripe sigue cobrando cada mes |
| Cancelación programada (`:182-205`) + job (`subscription-jobs.ts:8-22`) | `CANCELLED` | **nada** → Stripe sigue cobrando indefinidamente |
| Cambiar importe (`:223-245`) | `priceCents` | **nada** → se sigue cobrando el importe viejo |
| Reanudar (`:134-149`) | `ACTIVE` | **nada** |

**Un socio dado de baja en Apta sigue siendo cargado por Stripe. Es el riesgo operativo nº 1 del estado actual.**

**b) Cambio de plan = segunda suscripción, sin cancelar la primera.** `createMemberCheckout` (`:140-155`) siempre abre una suscripción nueva y nada cancela la anterior → **doble cobro**. Lo mismo en el plano 1: `applyPlanChangeFromCheckout` (`provisioning.ts:229-243`) sobrescribe `platformStripeSubscriptionId` y **abandona** la anterior, que sigue facturando.

**c) Catálogo: el espejo es de ida y a medias.** Web: al cambiar precio invalida `stripePriceId` (correcto). **Móvil: NO** — `PATCH /api/mobile/v1/products/[id]` cambia `priceCents` sin tocar `stripePriceId` (`:37-49`) → **se sigue vendiendo al precio antiguo**. Además `name`/`description`/`imageUrl` nunca se propagan al Product, archivar no pone `active:false` en Stripe, y el `DELETE` móvil deja Product/Price huérfanos.

**d) SEPA está declarado pero no soportado.** `payment_method_types: recurring ? ["card","sepa_debit"] : ["card"]` (`:145`,`:231`), pero **sin ningún manejo de su asincronía**: no se escuchan `checkout.session.async_payment_succeeded/failed`, ni `payment_intent.processing`, ni eventos de mandato, ni devoluciones bancarias. **Un débito SEPA que se devuelve a las semanas no produce ningún efecto en Apta hoy.**

**e) `Member.state = DELINQUENT` no corta el acceso.** El motor de reservas filtra por `Subscription.status === "ACTIVE"` (`session-balance.ts:30,50`), no por `Member.state`. Y `FROZEN` está **sobrecargado**: significa a la vez "congelado en agosto" y "no ha pagado".

**f) La consola "Stripe API" de dirección: 0 % implementada.** No existe `src/app/(app)/stripe/`. Todo `docs/STRIPE_API_SECCION_IMPLEMENTACION.md` está sin construir.

#### Bugs confirmados (no son "pendientes", están rotos hoy)

- **BUG-1 · CRÍTICO — El webhook de plataforma no concilia nada.** `api/stripe/webhook/route.ts:157-160` y `:178-181` leen `invoice.subscription` como campo de primer nivel; verificado en el SDK instalado: **`Invoice` ya no tiene `subscription` de primer nivel** en `2026-07-29.dahlia` (vive en `invoice.parent.subscription_details.subscription`). `subscriptionId` sale siempre `null` → `break` inmediato → `invoice.paid` **nunca renueva** `platformStatus`/`currentPeriodEnd`, y `invoice.payment_failed` **nunca pone `PAST_DUE`**: *un gimnasio que deja de pagar la licencia conserva el acceso para siempre*. El plano 2 ya lo tiene resuelto (`resolveInvoiceSubscriptionId`); el plano 1 se quedó con el shape legado.
- **BUG-2 · `currentPeriodEnd` nunca se escribe.** `periodEndFrom` (`provisioning.ts:64-73`) lee `subscription.current_period_end`, campo que en esta API **ya no existe** en `Subscription` (se movió a `items.data[].current_period_end`); y `session.subscription` llega como string sin expandir, así que la rama ni se ejecuta.
- **BUG-3 · CRÍTICO — Con un solo `STRIPE_WEBHOOK_SECRET` no pueden funcionar los dos planos.** Un endpoint del Dashboard escucha eventos *de tu cuenta* **o** *de cuentas conectadas*, y cada uno tiene su propio signing secret. El código verifica con un único secreto (`:24`,`:35`) → **uno de los dos flujos devolverá siempre 400 "Firma inválida"**. `.env.example:30-35` ya anticipa `STRIPE_CONNECT_WEBHOOK_SECRET`, pero **el código no lo lee**. Bloquea la puesta en producción.
- **BUG-4 · `apiVersion` sin fijar.** `new Stripe(key)` (`stripe.ts:20`) usa la que traiga el SDK, declarado como `^22.3.2`. Un `npm update` puede cambiar la versión de API bajo los pies — **exactamente el mecanismo que ya produjo BUG-1**.
- **BUG-5 · Cero claves de idempotencia.** `grep idempotencyKey src/` → **0 resultados**. Todas las creaciones pueden duplicarse ante reintento de red.
- **BUG-6 · `checkout.session.expired` escribe sin resolver `orgId`** (`:82-86`), saltándose `resolveConnectOrgId`. Mitigado por el `@unique` de `stripeCheckoutSessionId`, pero rompe la frontera de aislamiento declarada.
- **BUG-7 · `createMemberCheckout` no filtra planes archivados.** El endpoint móvil lo compensa a mano; la web no: **un plan `active:false` sigue siendo vendible desde recepción/portal web**.

#### Lo que falta por completo

Onboarding Connect con KYC visible · prorrateo · pausa real (`pause_collection`) · preaviso (`invoice.upcoming`) · reembolsos reales · notas de crédito · disputas · payouts/conciliación · cupones · Payment Links · Stripe Tax · Terminal · consola de lectura · deduplicación por `event.id` · manejo de `account.application.deauthorized`. (`application_fee` está descartado por decisión de negocio, correctamente.)

### 5.2 Historias de usuario

Numeración `RB-*` propuesta verificada como libre (máximos actuales: `RB-PAGO-019`, `RB-CONNECT-003`, `RB-VENTA-006`, `RB-PLAT-007`).

#### FASE 0 — Saneamiento (bloqueante, antes de tocar dinero real) · ≈1 sprint

**HU-ST-01 · Un webhook que verifica las dos firmas** — `S` · regla `RB-PAGO-020`
```gherkin
Escenario: evento de plataforma
  Dado STRIPE_WEBHOOK_SECRET y STRIPE_CONNECT_WEBHOOK_SECRET configurados
  Cuando llega un evento firmado con el secreto de plataforma
  Entonces se verifica con ese secreto y se enruta a handlePlatformEvent
Escenario: evento de cuenta conectada
  Cuando llega un evento firmado con el secreto de Connect
  Entonces se verifica con ese secreto y se enruta a handleConnectEvent
Escenario: firma que no valida con ninguno
  Entonces responde 400 y no escribe nada en la base de datos
Escenario: solo un secreto configurado
  Entonces sigue funcionando con ese (compatible hacia atrás)
```

**HU-ST-02 · Plano 1 conciliado contra la API vigente** — `S` · dep. HU-ST-01 · corrige `RB-PLAT-004`
```gherkin
Escenario: renovación cobrada
  Dado un invoice.paid de plataforma con parent.subscription_details.subscription
  Entonces la organización queda ACTIVE y currentPeriodEnd se actualiza al fin de periodo del item
Escenario: impago de licencia
  Dado un invoice.payment_failed de plataforma
  Entonces la organización pasa a PAST_DUE
Escenario: cuenta pinneada a una versión antigua
  Dado un invoice con el campo legado subscription
  Entonces se resuelve igual (se comprueban ambos shapes)
Escenario: reentrega del mismo evento
  Entonces el estado final es idéntico y no se duplica nada
```
Extrae `resolveInvoiceSubscriptionId` de `member-billing.ts` a un módulo compartido.

**HU-ST-03 · Versión de API fijada y auditada** — `S` · regla `RB-PAGO-021`. `getStripeClient` construye con `apiVersion` explícita, documentada en `.env.example`; el arranque avisa por log si el SDK trae otra.

**HU-ST-04 · Idempotencia en toda creación** — `M` · regla `RB-PAGO-022`
```gherkin
Escenario: checkout de socio
  Cuando createMemberCheckout se ejecuta dos veces con el mismo (orgId, memberId, planId, ventana de 10 min)
  Entonces Stripe devuelve la misma sesión y no se crean dos Payment PENDING
Escenario: espejo de precio
  Cuando ensureStripePrice corre en paralelo dos veces para el mismo plan
  Entonces se crea un único Product y un único Price
Escenario: clave documentada
  Entonces cada clave sigue el patrón <recurso>:<orgId>:<entidad>:<versión> y está listada en el doc
```

**HU-ST-05 · Deduplicación de eventos por `event.id`** — `M` · modelo nuevo `StripeWebhookEvent` · regla `RB-PAGO-023`
```gherkin
Escenario: primera entrega
  Entonces se inserta StripeWebhookEvent(id, type, account, processedAt) y se procesa
Escenario: reentrega
  Entonces se responde 200 sin reprocesar
Escenario: fallo durante el procesado
  Entonces NO queda marcado como procesado y se responde 500 para que Stripe reintente
```

**HU-ST-06 · Desconexión de la cuenta conectada** — `S` · regla `RB-CONNECT-004`
```gherkin
Escenario: deauthorize
  Dado account.application.deauthorized de una cuenta conocida
  Entonces StripeAccount queda chargesEnabled=false y payoutsEnabled=false
  Y la UI vuelve a "Conecta tu Stripe para cobrar"
  Y no se borra el acct_ ni el espejo de precios (histórico intacto)
Escenario: cuenta desconocida
  Entonces se descarta sin escribir
```

#### FASE 1 — MVP de cobro: Connect, catálogo y venta · ≈1,5 sprints

**HU-ST-07 · Onboarding de Connect con estado de KYC a la vista** — `M` · dep. HU-ST-06
```gherkin
Escenario: sin conectar
  Entonces veo "Conectar cobros con Stripe" y el checklist marca el paso pendiente
Escenario: conectado con requisitos pendientes
  Dado chargesEnabled=false
  Entonces veo requirements.currently_due traducidos y un enlace para completarlos
  Y no se muestra ningún botón de cobro a socios
Escenario: conectado y operativo
  Entonces veo chargesEnabled y payoutsEnabled en verde y la fecha del próximo payout
Escenario: Connect no configurado en el entorno
  Entonces se explica que falta STRIPE_CONNECT_CLIENT_ID, sin botón muerto
```

**HU-ST-08 · CRUD de productos con sincronización real a Stripe** — `L` · dep. HU-ST-04 · cierra BUG-7 y la divergencia móvil
```gherkin
Escenario: alta de producto
  Entonces se crea Product y Price en la cuenta conectada con idempotencia
  Y stripeProductId/stripePriceId/stripeAccountId quedan guardados
Escenario: cambio de precio
  Entonces se crea un Price NUEVO, el anterior se marca active:false pero NO se borra
  Y las Subscription vivas siguen cobrando el importe anterior hasta migrarse explícitamente
  Y se registra el cambio en AuditLog con importe anterior y nuevo
Escenario: cambio de nombre, descripción o foto
  Entonces se actualiza el Product de Stripe (no genera precio nuevo)
Escenario: ocultar producto
  Entonces active=false en Apta y en Stripe; quien lo tiene contratado sigue igual
Escenario: sin Stripe conectado
  Entonces el producto se crea solo en Apta, marcado "pendiente de sincronizar"
Escenario: paridad móvil
  Cuando cambio el precio desde PATCH /api/mobile/v1/products/[id]
  Entonces se aplica exactamente la misma regla que en la web
```
Regla nueva `RB-VENTA-007`: **nunca borrar un Price; archivar.**

**HU-ST-09 · Venta de bono puntual con los métodos del mercado español** — `M` · dep. HU-ST-08
```gherkin
Escenario: bono puntual
  Dado un plan SESSION_PACK/DROP_IN/DUO/PERSONAL_TRAINING
  Entonces el checkout se abre en mode:"payment" y ofrece los métodos habilitados en la cuenta conectada
Escenario: cuota recurrente
  Entonces se abre en mode:"subscription" y NUNCA ofrece Bizum
Escenario: método no disponible en la cuenta del gimnasio
  Entonces simplemente no aparece; el checkout no falla
```
*Ojo*: hoy `member-billing.ts:145` fija `payment_method_types` a mano, lo que además **desactiva Link y wallets**.

**HU-ST-10 · Reglas de las tiendas en la app nativa** — `M` · dep. HU-ST-09
```gherkin
Escenario: bono o cuota presencial
  Entonces se abre Stripe Checkout en el navegador del sistema (nunca en un WebView propio)
  Y no se guarda ningún dato de tarjeta en la app ni en nuestro servidor
Escenario: plan ONLINE (biblioteca de vídeo consumida dentro de la app)
  Entonces NO se ofrece compra desde la app hasta cerrar la decisión D-N3
Escenario: vuelta del navegador
  Entonces la app relee /me y desbloquea el acceso solo si el webhook ya confirmó el cobro
```
La base actual es correcta: `onboarding/pago.tsx:43-60` ya usa `WebBrowser.openBrowserAsync`. **Hallazgo**: `PlanType.ONLINE` es contenido digital consumido en la app → cae potencialmente bajo IAP obligatorio; los planes presenciales quedan exentos.

**HU-ST-11 · Modo demo también en el plano 2** — `S` · regla `RB-PAGO-024`. Espejo de `/demo-checkout` para la compra del socio.

#### FASE 2 — Recurrencia y ciclo de vida · ≈2 sprints

**HU-ST-12 · SEPA Direct Debit con mandato** — `L` · dep. HU-ST-09, HU-ST-05 · reglas `RB-PAGO-009` + `RB-PAGO-025`
```gherkin
Escenario: alta con SEPA
  Entonces Stripe recoge IBAN y mandato, y Apta guarda referencia de mandato y últimos 4 del IBAN
  Y el socio recibe la confirmación de mandato exigida por el esquema SEPA
Escenario: primer cobro asíncrono
  Entonces la Subscription queda "pendiente de confirmación" y NO se abre acceso a reservas
  Y al llegar checkout.session.async_payment_succeeded / invoice.paid se activa
Escenario: fallo asíncrono
  Entonces el Payment queda FAILED y arranca el dunning
Escenario: devolución bancaria posterior (R-transaction)
  Dado charge.refunded o charge.dispute.created sobre un cobro SEPA ya conciliado
  Entonces el Payment vuelve a FAILED/REFUNDED, el socio pasa a DELINQUENT y se avisa a recepción
```
`RB-PAGO-025`: **un cobro asíncrono no da acceso hasta liquidar.**

**HU-ST-13 · Cambio de plan con prorrateo, sin doble suscripción** — `L` · cierra el doble cobro
```gherkin
Escenario: subida de plan a mitad de mes
  Entonces se actualiza el ITEM de la suscripción existente (no se crea otra)
  Y Stripe emite la factura de prorrateo y el webhook la concilia como Payment
Escenario: bajada de plan
  Entonces el cambio se aplica al próximo ciclo, con proration_behavior según la política elegida
Escenario: socio sin suscripción viva
  Entonces se abre un checkout nuevo (comportamiento actual)
Escenario: previsualización
  Entonces antes de confirmar se muestra el importe exacto que se va a cobrar hoy
```

**HU-ST-14 · Congelación real (agosto existe)** — `M` · **requiere separar `FROZEN` (impago) de `PAUSED` (voluntaria)** · reglas `RB-PAGO-004` + `RB-PAGO-026`
```gherkin
Escenario: congelar con fecha de fin
  Entonces la suscripción de Stripe queda con pause_collection y se programa la reanudación
  Y en Apta el estado es PAUSED (nuevo, distinto de FROZEN por impago)
Escenario: congelar indefinidamente
  Entonces pause_collection sin fecha; recepción puede reanudar en cualquier momento
Escenario: reanudar
  Entonces se retira pause_collection y el próximo ciclo se cobra con normalidad
Escenario: sin Stripe conectado
  Entonces se congela solo en local y se avisa de que el cobro externo no se ha detenido
```

**HU-ST-15 · Baja a fin de periodo vs. inmediata** — `M` · corrige `subscription-actions.ts:182-205` y `subscription-jobs.ts:8-22`
```gherkin
Escenario: baja a fin de periodo (por defecto)
  Entonces cancel_at_period_end=true; la suscripción sigue ACTIVE hasta el fin de ciclo
  Y al llegar customer.subscription.deleted pasa a CANCELLED en Apta
Escenario: baja inmediata con devolución
  Entonces se cancela ya y se ofrece el reembolso prorrateado, con motivo obligatorio
Escenario: revertir una baja programada
  Entonces se retira cancel_at_period_end antes de la fecha
Escenario: el job local ya no cancela por su cuenta
  Entonces runScheduledCancellationsRule solo cubre bonos sin suscripción de Stripe
```

**HU-ST-16 · Preaviso de cobro** — `S` · regla `RB-PAGO-027`
```gherkin
Escenario: preaviso
  Dado invoice.upcoming a X días del cargo
  Entonces el socio recibe un email con importe, fecha y método de pago
  Y se envía una sola vez por factura (marca en AuditLog, patrón de sendDunningNoticeOnce)
Escenario: SEPA
  Entonces el preaviso respeta el plazo mínimo del esquema de domiciliación
Escenario: el socio ha desactivado avisos comerciales
  Entonces igualmente lo recibe: es correo de servicio, sin unsubscribe
```

**HU-ST-17 · Cambio de titular / método de pago sin llamar por teléfono** — `M` · la lib ya existe
```gherkin
Escenario: desde el portal web con sesión
  Entonces hay un botón "Gestionar mi pago" que abre el Billing Portal de la cuenta conectada
Escenario: desde la app
  Entonces el mismo botón usa /api/mobile/v1/portal/billing/portal y abre el navegador del sistema
Escenario: cambio de método
  Entonces el siguiente cobro usa el método nuevo sin intervención de recepción
Escenario: socio sin cliente de Stripe
  Entonces se explica que aún no tiene pago online y se le remite a su centro
```
**Hoy el portal web NO tiene este botón**: solo se llega por el enlace mágico del email de impago.

#### FASE 3 — Morosidad y dunning · ≈1,5 sprints

**HU-ST-18 · Dunning con corte de acceso explícito** — `M` · dep. HU-ST-14 · reglas `RB-PAGO-012` + `RB-PAGO-028`
```gherkin
Escenario: primer fallo
  Entonces Payment FAILED, Member DELINQUENT, email al socio con enlace de arreglo, tarea a recepción
  Y el socio TODAVÍA puede reservar durante el periodo de gracia configurable
Escenario: fin del periodo de gracia
  Entonces se corta la reserva de nuevas sesiones y se le explica el motivo al entrar
Escenario: cobro recuperado
  Entonces vuelve a ACTIVE, el aviso se resuelve y el acceso se restablece
Escenario: agotados los reintentos (unpaid)
  Entonces la suscripción pasa a CANCELLED y el socio a baja, con registro en AuditLog
Escenario: el socio está congelado voluntariamente
  Entonces no aparece en la lista de morosos
```

**HU-ST-19 · Pantalla de recuperación para el socio** — `S`. Ya existe la base (`/gestionar-suscripcion/[token]`); falta el **reintento explícito de la factura pendiente** sin esperar al siguiente reintento de Stripe.

**HU-ST-20 · Reembolsos reales y notas de crédito** — `L` · **desbloquea** `subscription-actions.ts:79-84`
```gherkin
Escenario: devolución total de un cobro Stripe
  Entonces se emite el refund en la cuenta conectada con idempotencia y motivo obligatorio
  Y al llegar charge.refunded el Payment pasa a REFUNDED con stripeRefundId
Escenario: devolución parcial
  Entonces se admite un importe menor y el Payment refleja el importe devuelto
Escenario: cuota prorrateada al darse de baja
  Entonces se calcula con la previsualización de Stripe y se devuelve ese importe
Escenario: nota de crédito sobre una factura de suscripción
  Entonces se emite creditNote y queda enlazada al Payment
Escenario: pago en efectivo
  Entonces sigue el flujo local actual, sin llamar a Stripe
Escenario: doble clic
  Entonces no se emiten dos refunds (misma clave de idempotencia)
```

**HU-ST-21 · Disputas y contracargos visibles** — `M`. `charge.dispute.created` → tarea para dirección con importe y `evidence_details.due_by`; aportar evidencia **no** se delega en esta fase (enlace al Dashboard).

**HU-ST-22 · Tarjetas por caducar** — `S` · dep. HU-ST-17, HU-ST-24.

#### FASE 4 — Contabilidad, consola e informes · ≈2 sprints

**HU-ST-23 · Neto real, comisiones y payouts** — `M`. El `Payment` guarda bruto, comisión y neto desde el balance transaction; vista de payouts con `arrival_date` y qué cobros lo componen.
**HU-ST-24 · Consola de lectura de Stripe para dirección** — `L`. `/stripe` solo `OWNER`, con registro en `AuditLog`, distintivo TEST/LIVE según el prefijo de la clave, listas cursor-paginadas y degradación por tarjeta ante error de Stripe.
**HU-ST-25 · Exportación contable para la gestoría** — `M` · regla `RB-BI-023`. CSV mensual con fecha, socio, concepto, bruto, comisión, neto, método, id de Stripe y payout asociado; **la suma de netos del periodo debe coincidir con la suma de payouts liquidados**; devoluciones en negativo con su motivo.
**HU-ST-26 · Informes financieros de Stripe bajo demanda** — `S`.
**HU-ST-27 · Cupones y códigos promocionales medibles** — `M` · dep. HU-ST-08.
**HU-ST-28 · Comisión de plataforma documentada, NO activada** — `S`. Por defecto **no** se envía `application_fee_amount` (Apta no toca el dinero del gimnasio); se documenta dónde se insertaría y qué implicaciones fiscales tendría.

### 5.3 Pasos y requisitos previos del negocio

#### Cuenta y verificación (bloquea todo)
1. **Cuenta Stripe de Apta** con la entidad jurídica real: CIF, domicilio fiscal, actividad (SaaS), IBAN de la sociedad.
2. **Verificación de identidad del representante** (KYC de la plataforma). Sin esto no hay modo live.
3. **Activar Stripe Connect** en Dashboard → Connect. Elegir tipo de cuenta (ver D-N1).
4. **Perfil de plataforma de Connect**: nombre público, logo, colores, URL, email de soporte. Es lo que ve el gimnasio en la pantalla de OAuth.
5. **Registrar la aplicación OAuth** y anotar el `client_id` (`ca_…`) → `STRIPE_CONNECT_CLIENT_ID`.
6. **Dar de alta las redirect URI exactas**: `https://<dominio>/api/stripe/connect/callback`, **una por entorno** (producción, staging y `http://localhost:3000`). **Si no coincide carácter a carácter, el OAuth falla.**
7. **Alta de los 7 precios de licencia** en la cuenta de Apta → los 7 `STRIPE_PRICE_*`. **Uno por entorno**: test y live son distintos.

#### Métodos de pago y configuración de cobro
8. **Activar SEPA Direct Debit** en la cuenta de Apta (plano 1) y comprobar elegibilidad en las conectadas. **Con Connect Standard, cada gimnasio activa sus propios métodos**: hay que documentárselo en el onboarding.
9. **Bizum**: verificar disponibilidad y confirmar que sigue limitado a pago único (decide D-N2).
10. **Apple Pay / Google Pay / Link**: verificar el dominio, sirviendo el fichero de verificación desde producción.
11. **`statement descriptor`**: definir el de Apta y **explicar al gimnasio que el suyo lo configura él**. Un descriptor irreconocible es la primera causa de contracargo *"no reconozco este cargo"*.
12. **Reglas de dunning en el Dashboard** (Billing → Revenue Recovery): reintentos, ventana y qué pasa al agotarlos (`cancel` vs `unpaid`). **El mapeo de estados del código depende de esta elección**: hay que fijarla antes de HU-ST-18.
13. **Smart Retries y Card Account Updater**: activar — reducen churn involuntario sin escribir código.

#### Legal y cumplimiento
14. **Política de reembolsos** escrita y publicada: plazos, prorrateo sí/no, quién autoriza. Es requisito de Stripe y defensa ante disputas.
15. **Condiciones de servicio y política de privacidad** públicas y enlazadas desde el checkout.
16. **SCA/PSD2 y 3DS**: Checkout lo gestiona; documentar que **cualquier cobro fuera de Checkout (MIT, reintentos) requiere el mandato/`off_session` correcto**.
17. **IVA**: decidir si los servicios del gimnasio van exentos o al tipo general (asesoría fiscal). Si se activa Stripe Tax, registrar las obligaciones por país.
18. **VERI\*FACTU / Ley Antifraude**: **no lo resuelve Stripe.** Apta hoy no factura y emite un `receiptNumber` que **no es una factura fiscal**. Antes de producción hay que decidir si Apta emite factura (→ software certificado, registro encadenado, remisión a AEAT) o si el gimnasio factura con su software y Apta solo entrega el recibo de Stripe. **Es un bloqueante legal, no técnico.**
19. **DPA de Stripe firmado** y **contrato de encargado del tratamiento Apta ⟷ gimnasio**. Registrar Stripe en el registro de actividades y en la política de privacidad.
20. **Con Connect Standard el gimnasio acepta los términos de Stripe directamente**: dejar por escrito quién responde de qué frente al socio (reembolsos, disputas, atención).

#### Variables de entorno

| Variable | Plano | Estado hoy |
|---|---|---|
| `STRIPE_SECRET_KEY` | 1 y 2 | declarada |
| `STRIPE_WEBHOOK_SECRET` | 1 | declarada |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | 2 | **documentada pero NO leída por el código** → BUG-3 |
| `STRIPE_CONNECT_CLIENT_ID` | Connect | declarada |
| `STRIPE_PRICE_*` ×7 | 1 | declaradas |
| `NEXTAUTH_URL` | ambos | **crítica**: base de `success_url`, `cancel_url` y del `redirect_uri` de OAuth. Si apunta a localhost en producción, **el OAuth y las vueltas de checkout se rompen** |
| `STRIPE_API_VERSION` | ambos | **a introducir** (HU-ST-03) |

#### Entornos y webhooks

**Cuatro endpoints** (2 por entorno): producción-plataforma y producción-Connect comparten URL (`/api/stripe/webhook`) pero son endpoints distintos en el Dashboard, cada uno con su secreto; ídem en test/staging.

*Eventos a activar (plataforma)*: `checkout.session.completed`, `checkout.session.expired`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.created/updated/deleted`.

*Eventos a activar (cuentas conectadas)*: `account.updated`, `account.application.deauthorized`, `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `customer.subscription.created/updated/deleted/paused/resumed/trial_will_end`, `invoice.paid`, `invoice.payment_failed`, `invoice.payment_action_required`, `invoice.upcoming`, `invoice.finalized`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`, `payment_method.attached`, `payment_method.detached`, `payout.paid`, `payout.failed`.

> De esa lista, **hoy solo se consumen 7 en Connect y 4 en plataforma — y 2 de los 4 de plataforma están rotos por BUG-1.**

#### Pruebas obligatorias antes de producción

```bash
npx tsc --noEmit && npm run lint && npm run test:unit && npm run build
npm run test:e2e -- planes-gateo.spec.ts alta-comercial.spec.ts billing-dashboard.spec.ts
stripe listen --forward-to localhost:3000/api/stripe/webhook
stripe listen --forward-connect-to localhost:3000/api/stripe/webhook
stripe trigger invoice.payment_failed
stripe events resend evt_...   # misma entrega dos veces: verifica idempotencia
```

Caminos a recorrer a mano: **sin claves** (modo demo) · **org sin Stripe conectado** (degradación en web, landing y `mode:"manual"` móvil) · **onboarding incompleto** (`chargesEnabled:false`) · **camino feliz tarjeta** (alta desde landing → `Member` nace en webhook → email → suscripción y primer `Payment`) · **camino feliz SEPA** (pendiente → confirmación asíncrona → activación) · **impago** (email + tarea + `DELINQUENT`, y reversión al recuperar) · **orden invertido** (entregar `invoice.paid` **antes** de `customer.subscription.created` → 500 → reintento → conciliado; ya cubierto por test unitario) · **reconexión de otra cuenta de Stripe** (el espejo se invalida y no se cobra en la cuenta equivocada).

#### Checklist de puesta en producción

- [ ] Cuenta de Apta verificada y en live; Connect activo con branding y `client_id` de producción
- [ ] Redirect URI de producción registrada y probada
- [ ] Los 7 `price_…` **de live** creados y en el entorno
- [ ] `NEXTAUTH_URL` = dominio de producción
- [ ] **Los dos** secretos de webhook configurados y verificados con un evento real de cada plano
- [ ] `apiVersion` fijada y `package.json` con versión **exacta** del SDK (no `^`)
- [ ] BUG-1 y BUG-2 corregidos y verificados con `stripe trigger`
- [ ] Política de reembolsos y condiciones publicadas y enlazadas
- [ ] Decisión VERI\*FACTU cerrada por escrito
- [ ] DPA firmado y contrato de encargado con los centros piloto
- [ ] Reglas de dunning configuradas y **coherentes con el mapeo de estados del código**
- [ ] Un centro piloto completa el OAuth, ve `chargesEnabled` y hace **un cobro real de 1 € con devolución posterior**
- [ ] Alertas de fallo de webhook y monitorización de 5xx en `/api/stripe/webhook`
- [ ] Runbook escrito: qué hacer si el webhook cae, cómo reenviar eventos, a quién llamar

### 5.4 Riesgos y decisiones abiertas

| # | Riesgo | Gravedad | Evidencia |
|---|---|---|---|
| R1 | **Se cobra a socios dados de baja o congelados** | **Crítico** | `subscription-actions.ts:102-205`, `subscription-jobs.ts:8-22` |
| R2 | **Doble cobro al cambiar de plan** (socio y gimnasio) | **Crítico** | `member-billing.ts:140`, `provisioning.ts:229-243` |
| R3 | **Uno de los dos planos de webhook no valida firma** → eventos perdidos en silencio | **Crítico, bloqueante** | `webhook/route.ts:24` |
| R4 | **Un gimnasio que deja de pagar la licencia mantiene el acceso** | Alto | BUG-1 |
| R5 | **El precio cambiado desde la app nativa no se aplica** | Alto | `products/[id]/route.ts:37-49` |
| R6 | **SEPA ofrecido sin manejar su asincronía ni sus devoluciones**: acceso concedido sobre dinero que puede no llegar | Alto | `member-billing.ts:145` sin handlers async |
| R7 | **Sin idempotencia**: un reintento de red duplica cobros o precios | Medio-alto | 0 `idempotencyKey` |
| R8 | **Reembolsos imposibles desde Apta** — justo lo contrario del objetivo de producto | Medio-alto | `subscription-actions.ts:79-84` |
| R9 | **Disputas invisibles**: el plazo de respuesta vence sin que nadie se entere | Medio-alto | sin handler |
| R10 | **`FROZEN` sobrecargado** | Medio | `member-billing.ts:292-309` |
| R11 | **Plan `ONLINE` vendido desde la app** puede violar la política de IAP de Apple | Medio | `onboarding/pago.tsx` + `PlanType.ONLINE` |
| R12 | **`receiptNumber` presentado como recibo, sin valor fiscal** | Medio | `payments.ts:11-30` |
| R13 | **Versión de API no fijada** | Medio | `stripe.ts:20` |

#### Decisiones que hay que cerrar antes de empezar

| # | Cuestión | Quién | Recomendación |
|---|---|---|---|
| **D-N1** | **Standard vs Express** para las cuentas de los centros | Dirección | Mantener **Standard**: coherente con "Apta no toca el dinero" y ya construido. Asumir que **el gimnasio activa sus propios métodos de pago** y documentarlo |
| **D-N2** | **Bizum en bonos puntuales**, hoy prohibido por una regla que solo se justifica en recurrente | Dirección + cobros | Permitirlo **solo** en `mode:"payment"`, con la restricción en `isRecurring()` y no en una lista global |
| **D-N3** | **Plan `ONLINE` e IAP** | Dirección + legal | Corto plazo: **no vender `ONLINE` desde la app**. Medio plazo: IAP (15-30 %) o biblioteca solo por web |
| **D-N4** | **Política de prorrateo** al cambiar de plan | Dirección | Subida: prorrateo inmediato. Bajada: al próximo ciclo. Fijarlo antes de HU-ST-13 |
| **D-N5** | **Periodo de gracia de morosidad** | Dirección de centro | 7 días, configurable por organización. **Sin decisión, HU-ST-18 no se puede escribir** |
| **D-N6** | **Qué pasa al agotar los reintentos**: `cancel` o `unpaid` | Dirección | `cancel`: menos ambigüedad. Configurar en Dashboard **y** en el código a la vez |
| **D-N7** | **Quién atiende al socio en un reembolso o disputa** | Dirección | Desde Apta (es el objetivo de producto), lo que exige HU-ST-20 y HU-ST-21 |
| **D-S2** | Método por defecto de la cuota | Dirección | Ambos, con SEPA destacado: menos churn involuntario |
| **D-S3** | **VERI\*FACTU: ¿Apta factura o no?** | Dirección + cumplimiento | Apta **no factura**; Stripe emite el recibo y el gimnasio factura con su software certificado. Ponerlo en el contrato. **Bloqueante para live** |
| **D-S4** | ¿`PersonalizedOffer` como cupón real de Stripe? | Dirección | Sí (HU-ST-27), fase 4 |
| **D-API-2** | ¿Clave restringida de solo lectura para la consola? | Técnico | Sí. Decidirlo antes de HU-ST-24 |

## 6. Mejora del mapa de Leaflet

> El mapa vive solo en la **web app** (`(app)/mapa-barrios` y la tarjeta del panel). En la app móvil **no hay ningún mapa**: no hay `react-native-maps` ni WebView en `apps/mobile/package.json`.

### 6.1 Resumen

El mapa está **bien construido a nivel de ingeniería** (Leaflet fuera de React, geometría creada una vez por ciudad, recoloreado por `setStyle`, módulos puros con tests) y **flojo a nivel cartográfico y de accesibilidad**. Los tres problemas más graves no son de rendimiento —hoy mueve 31 polígonos y ~5 KB de payload— sino de **veracidad del dato**:

1. La clasificación de color es de **intervalo igual sobre min–max**, y con la distribución real de socios **11 de 19 barrios caen en el mismo escalón**: el mapa parece plano cuando no lo es.
2. Los recuentos **no filtran estado del socio ni del lead**: un socio de baja cuenta como cliente, y un lead `CERRADO` cuenta a la vez como lead *y* como el socio en que se convirtió. **La métrica "Conversión" está sesgada por construcción.**
3. Sin centros con coordenadas, **2 de las 6 métricas (Distancia y Oportunidad) devuelven 0 para todos los barrios** y se pintan como un mapa uniforme sin decir que no significan nada.

Dato de contexto importante: **no existe ningún GeoJSON en el repositorio**. Toda la geometría se **sintetiza en el navegador** con `tessellate()`.

### 6.2 Diagnóstico

| Capa | Fichero | Qué hace |
|---|---|---|
| Server Component | `mapa-barrios/page.tsx:14-33` | `requireRole` → `centerScopeFor` → `getPostalCodeMapData` → `groupBarriosByCity`; `EmptyState` si no hay ciudades |
| Vista cliente | `barrio-map-view.tsx:43-324` | Estado de UI, memos de color/valor/prioridad/ranking, tarjetas flotantes |
| Loader | `barrio-map-loader.tsx:11-14` | `dynamic(..., { ssr: false })` con placeholder. Correcto |
| Mapa | `barrio-map.tsx:57-390` | Leaflet imperativo, con `map.remove()`, `observer.disconnect()` y limpieza de refs (`:259-268`) y `ResizeObserver` para el contenedor a 0×0 (`:250`) |

**Cómo se cargan los geodatos: no se cargan, se calculan en el cliente.** `PostalCodeArea` guarda **un punto por CP**, no un contorno (`prisma/schema.prisma:137-142`); la tabla se siembra desde `src/lib/postal-codes.ts` con **19 barrios de Zaragoza + 12 de Santander = 31 filas**; y el polígono se genera con `tessellate()` (`barrio-map.tsx:277` → `barrio-geometry.ts:133-157`): Voronoi por recorte de semiplanos, recortado al casco convexo inflado un 26 %. **Tamaño de los "GeoJSON": 0 bytes.** El payload real son ~164 B por barrio ⇒ **~5,1 KB** para las 31 filas. El coste real es el bundle de Leaflet (~145 KB min / ~42 KB gz + CSS), cargado por `dynamic`.

**Agregación**: una sola consulta SQL cruda (`dashboard-queries.ts:363-395`) con derivados en `:414-443` — `conv = round(members / max(1, members+leads) × 100)`, `trend` de 90 d vs. 90 d previos acotado a ±200, `dist` por haversine al centro más cercano, `opp = (leads + members×0,35) × min(1, km/2,6)`.

**Escala de color** (`barrio-map.ts:74-131`): rampa secuencial de 7 escalones (hueso → oro → terracota) y divergente de 7 para Tendencia, con extremos de la **ciudad activa** y `colorForValue` haciendo `ramp[round(t×6)]` — intervalo igual.

**Capa de calor del panel** (`dashboard/postal-heatmap.tsx:166-208`): `L.heatLayer` con `radius: 34, blur: 26` más un marcador `divIcon` por CP escalado por `sqrt(v/maxV)`.

### 6.3 Problemas concretos

#### Corrección cartográfica y del dato (lo más grave)

- **C1 · Clasificación por intervalo igual sobre distribución sesgada.** Con una distribución realista `[0,0,1,1,2,2,3,3,4,5,5,6,7,8,9,11,14,22,64]` el reparto medido es: escalón 0 → **11 barrios**, escalón 1 → 6, escalón 2 → 1, escalones 3-5 → 0, escalón 6 → 1. **Un solo barrio dominante achata la escala entera.** Es el problema clásico que resuelven cuantiles o Jenks.
- **C2 · Valores absolutos sin normalizar.** Un barrio de 40.000 habitantes con 20 socios sale más oscuro que uno de 6.000 con 15, cuando la penetración del segundo es 5× mayor. Para "dónde captar" y "dónde abrir centro" la magnitud correcta es **socios por 1.000 habitantes**, y **no existe el dato de población en el modelo**.
- **C3 · Los recuentos no filtran estado.** `Member`: se cuentan todos los estados, incluidos `CANCELLED`, `FROZEN` y `PROSPECT` (`dashboard-queries.ts:383` solo excluye `postalCode IS NULL`) — un barrio con fuga masiva sigue pintándose oscuro. `Lead`: se cuentan todos los estados, incluidos los `CERRADO` con `convertedMemberId`, así que **la misma persona se cuenta como lead y como socio** y la etiqueta "leads sin convertir" (`barrio-map.ts:55`) es falsa.
- **C4 · Distancia y Oportunidad mienten sin centros situados.** `dist: nearest?.km ?? 0` (`:419`) y `opp: nearest ? … : 0` (`:436-441`) con `Center.lat/lng` opcionales: el mapa pinta **toda la ciudad a 0,0 km**. La tarjeta de foco lo advierte; el mapa, la leyenda y el ranking, no.
- **C5 · El mapa ignora el periodo del panel.** `getPostalCodeMapData` recibe `DashboardOpts` (con `range`) y **nunca lo usa**; `/mapa-barrios` ni siquiera lee `searchParams`. El mapa es siempre acumulado histórico, no comparable con el resto del panel, y su estado **no es enlazable ni compartible** —a diferencia de `/dashboard`, cuyo estado vive en la URL por decisión explícita.
- **C6 · Socios que desaparecen sin aviso.** El `FROM "PostalCodeArea"` descarta cualquier CP que no esté entre las 31 filas sembradas: un socio de Madrid con CP `28001` no sale en ningún sitio, y `postalCityLabel` con su degradación a provincia (`postal-codes.ts:93-100`) es **código muerto para el mapa**. No hay contador de "N socios sin CP / fuera de cobertura": **el mapa no dice cuánta gente no está enseñando.**
- **C7 · La correspondencia CP→barrio es un "mejor esfuerzo" reconocido** (`postal-codes.ts:5-13`: *"no fuente oficial… coordenadas aproximadas"*), y encima **la geometría es Voronoi, no barrio real**. Son dos aproximaciones encadenadas y la leyenda solo advierte de la segunda.
- **C8 · Inconsistencia de métrica**: `groupBarriosByCity` usa `Math.hypot` sobre grados (`barrio-map.ts:192`) mientras el resto del módulo usa haversine.

#### Color y accesibilidad cromática

**La rampa secuencial está bien**: L\* monótona `94,2 → 87,3 → 78,8 → 71,3 → 58,6 → 45,5 → 33,9`. Una rampa monótona en claridad es intrínsecamente segura para daltonismo. **Bien hecho.**

**La divergente no.** Los pares simétricos tienen prácticamente la misma claridad: `#8a3420` vs `#4b5a22` → **ΔL\* 1,9**; `#ad6844` vs `#7a8c42` → 4,4; `#d0a578` vs `#a8b57e` → **0,8**. La única señal que separa "crece" de "se apaga" es el eje a\* (+35,5 rojo vs −15,4 verde), **exactamente el eje que pierden protanopes y deuteranopes (~8 % de los hombres)**: para ese usuario la métrica Tendencia es ilegible sobre el plano.

**Contraste de las etiquetas sobre el relleno.** `globals.css:828-851` fija el nombre a `#1d1d1c` y la cifra a `#5b5748` **independientemente del escalón**:

| relleno | nombre | cifra |
|---|---|---|
| `#f2eee4` (escalón 0) | 14,56 | 6,25 |
| `#b5834b` (escalón 4) | 5,07 | **2,18** |
| `#8a3420` (escalón 6) | **2,08** | **1,12** |

El halo hueso lo rescata visualmente, pero un halo no es contraste medible. Lo llamativo: **`readableMetricInk()` ya resuelve exactamente este problema** (`barrio-map.ts:88-90`) y solo se usa en la tarjeta de foco, nunca en las etiquetas del mapa.

**Modo oscuro, dos fallos reales**: (1) `readableMetricInk` devuelve el literal `#1d1d1c` (`:80`), y en tema oscuro `--color-brand-card` es `#24231f`, así que la cifra grande de la tarjeta de foco queda a **1,07:1 — invisible** (en claro es 16,87:1); (2) `.tz-barrio-map .leaflet-tile` (`globals.css:806-808`, especificidad 0-2-0) no tiene variante oscura y **gana** `[data-theme="dark"] .tz-map .leaflet-tile` (`:766-768`, 0-3-0), así que en oscuro el mapa de barrios usa el filtro invertido pensado para la tarjeta del panel.

#### Rendimiento

**Hoy no hay problema, y conviene decirlo antes de optimizar.** 31 polígonos, ~177 vértices, ~5 KB. `L.svg()` con `padding: 0.6` es la elección correcta a esta escala: da hover nativo y la transición CSS de `fill-opacity`. **Cambiar a `L.canvas()` ahora sería prematuro**, rompería esa transición y rompería el selector del e2e (`e2e/mapa-barrios.spec.ts:24,82` cuenta `.leaflet-overlay-pane path`).

Los acantilados están más adelante:
- **P1 · `tessellate()` es O(n²) y corre síncrono en el hilo principal**, en cada cambio de ciudad. Benchmark en Node (un navegador de gama media será 2-3× peor): 19 barrios → 2,6 ms · 100 → 4,0 ms · 300 → 14,7 ms · 600 → 39,4 ms · **1.200 → 150,4 ms** · **2.500 → 603,1 ms**. Umbral práctico ~500-800 barrios; los ~11.000 CP de España serían inutilizables (y ~1,8 MB de payload).
- **P2 · Cada hover repinta los 19 polígonos y remide todas las cajas.** `setHovered` → re-render de `BarrioMapView` entero → `setStyle` × 19 → `layoutLabels()`, que hace `getBoundingClientRect` sobre todos los overlays, marcadores y `<b>`/`<i>` de todas las etiquetas: **~50-60 lecturas de layout forzadas por movimiento del puntero entre celdas**. Con 19 se aguanta; con 200 es jank garantizado.
- **P3 · Teselas sin afinar**: sin `updateWhenIdle`, `updateWhenZooming`, `keepBuffer` ni `maxNativeZoom`, y con un filtro CSS de 5-6 funciones sobre `.leaflet-tile` que fuerza composición de cada tesela.
- **P4 · `react-leaflet@5` está en `dependencies` y no se importa en ningún sitio.** Dependencia muerta.

#### UX

| # | Problema | Evidencia |
|---|---|---|
| U1 | **Sin buscador de barrio.** Con 19 hay scroll; con 100 el ranking es inservible | `barrio-map-view.tsx:227-268` |
| U2 | **Sin filtros.** Ni periodo, ni estado del socio, ni canal, ni servicio: la única segmentación es la ciudad | `page.tsx:14`, C5 |
| U3 | **Sin comparación temporal** más allá de un `trend` acotado a ±200 %, sin serie | `dashboard-queries.ts:456-461` |
| U4 | **Sin tooltip sobre el polígono**: toda la información vive en la tarjeta de foco, que es `hidden lg:flex` | `barrio-map.tsx` sin `bindTooltip` |
| U5 | **Bajo 1024 px se pierden ranking y tarjeta de foco; bajo 768 px se pierden además leyenda y selector de ciudad.** Queda **un mapa de colores sin escala**. Está documentado como fuera de alcance, pero un mapa sin leyenda no es un mapa degradado: es un mapa incorrecto | `barrio-map-view.tsx:102,169,273` |
| U6 | **Interacción dependiente de hover**: en táctil `mouseover` dispara al tocar y `mouseout` no llega nunca — el barrio se queda "señalado" indefinidamente | `barrio-map.tsx:300-301` |
| U7 | **Sin control de capas ni exportación**; `walkMinutes`, `showCenters` y `cellOpacity` son constantes de módulo | `barrio-map-view.tsx:28-30` |
| U8 | **Sin `maxBounds`**: se puede arrastrar hasta el Atlántico | `barrio-map.tsx:217-225` |
| U9 | **El anillo de "15 min andando" es un círculo de radio 1.170 m** (78 m/min × 15): ignora el río, las vías y las cuestas — en Zaragoza cruza el Ebro como si nada, y la leyenda lo llama "15 min andando" sin matizar | `barrio-map.tsx:10, 321-329` |

#### Accesibilidad

- **A1 · Sin alternativa tabular.** El ranking es la alternativa de facto, pero es `hidden lg:flex` y es una lista de `<button>`, no una tabla con encabezados. **Bajo 1024 px no hay ninguna vía no cartográfica al dato.**
- **A2 · Sin acceso por teclado al mapa**: los polígonos son `<path>` con handlers de ratón, no focusables, sin `role`/`tabindex`; el contenedor sin `aria-label`.
- **A3 · Sin región viva**: al cambiar el foco la tarjeta se actualiza en silencio para un lector de pantalla.
- **A4 · `prefers-reduced-motion` no llega a los vuelos**: el bloque de `globals.css:1273-1281` anula animaciones **CSS**, pero `map.panTo(..., {duration: 0.6})` y `map.flyTo(..., {duration: 0.9})` son animación JS de Leaflet y siguen ejecutándose.
- **A5 · Objetivos táctiles por debajo de 44 px**: métricas ≈35 px, `MapButton` ≈34 px, botones de ciudad ≈31 px.

#### Geocodificación

**No existe.** No hay proveedor, ni caché, ni columna de coordenadas para personas. `Member.address` y `Lead` no tienen dirección estructurada geocodificable: el único ancla es `postalCode`. `Center.lat/lng` **se teclean a mano en el alta** y **no hay pantalla para corregirlas después**: un dedo gordo en un signo mueve el centro de continente y con él `dist` y `opp` de todos los barrios, sin ninguna validación de rango.

Precisión efectiva: **todas las personas de un CP colapsan al mismo punto**, y ese punto es un centroide aproximado a ojo. El "mapa de calor" del panel no es un mapa de densidad de personas: es un **desenfoque gaussiano de 31 puntos idénticos**, con `radius`/`blur` en **píxeles de pantalla fijos** que no se recalculan al hacer zoom — la misma mancha significa 1 km a un zoom y 200 m a otro. Es un mapa de calor mal calibrado en sentido estricto.

### 6.4 Mejoras priorizadas

*Esfuerzo en días-persona.*

#### CRÍTICO

- **M1 · Filtrar estado de socio y de lead en la agregación · ≈0,5 d.** En `dashboard-queries.ts:374-385`: `AND state NOT IN ('CANCELLED','PROSPECT')` y `AND "convertedMemberId" IS NULL AND status <> 'CERRADO'`. Exponerlo como opción (`memberStates?`) para que "fuga" pueda pedir lo contrario. Rehacer los tests de `barrio-map.test.ts` que asumen la fórmula de `conv`. **Sin esto, las métricas 3 y 6 no son defendibles ante dirección.**
- **M2 · Clasificación por cuantiles (o Jenks) · ≈1 d.** Función pura `classify(values, kind, classes)` + `colorForValueClassified`: cuantiles para `members`/`leads`/`opp` (sesgadas), intervalo igual para `conv` y `dist` (ya acotadas), divergente simétrica para `trend`. **La leyenda debe pasar de dos etiquetas min/max a los 7 cortes**, porque con cuantiles los escalones no son equidistantes y una leyenda de dos extremos mentiría. Test: la distribución sesgada debe repartirse ~3/3/3/3/3/2/2 en vez de 11/6/1/0/0/0/1.
- **M3 · Honestidad cuando no hay centros situados · ≈0,5 d.** `dist` y `opp` pasan a `number | null`; con `null`, deshabilitar esas dos pastillas con `title` explicativo y pintar gris neutro de "sin dato" con entrada propia en la leyenda. Añadir validación de rango en el alta de centro (`lat ∈ [-90,90]`, aviso si el punto cae a más de X km del resto) y edición de coordenadas para centros ya creados.
- **M4 · Vista tabla accesible sincronizada · ≈1,5 d.** Un `<table>` real con `<caption>` que declare fuente y aproximaciones, `<th scope="col">` ordenables y **las seis métricas a la vez**, siempre en el DOM, visible por defecto bajo `lg`. Más `role="application"` + `aria-label` en el contenedor y un `aria-live="polite"` que anuncie el barrio en foco. **Arregla de paso U5 y A1-A3.**

#### ALTO

- **M5 · GeoJSON/TopoJSON real de barrios · ≈2-3 d.** La mejora que más precisión aporta por menos código: la vista ya trabaja sobre anillos. Fuente: secciones censales del INE o los portales de datos abiertos municipales (Zaragoza y Santander los publican); CartoCiudad para CP↔portal. Preproceso offline con **mapshaper** (`-simplify 8% keep-shapes -o format=topojson quantization=1e5`, que equivale a los 5 decimales ≈1 m). Almacenamiento: columna `PostalCodeArea.ring Json?` o fichero estático servido por `GET /api/geo/[ciudad]` con `revalidate` largo — **nunca mandar al cliente ciudades que no se están mirando**. Cliente: `topojson-client.feature()` (~7 KB gz) sustituyendo `tessellate(points)`; **`tessellate()` se conserva como respaldo** para ciudades sin geometría publicada, con la nota de la leyenda condicionada. Presupuesto: ≤80 KB gz por ciudad. **Efecto colateral: elimina P1 de golpe.**
- **M6 · Filtros de periodo y estado, con el estado en la URL · ≈1,5 d.** Replicar el patrón de `dashboard/params.ts`: `/mapa-barrios?ciudad=&metrica=&range=&estado=&centerId=`, propagar `range` (hoy se recibe y se ignora) y encadenarlo desde el enlace del panel manteniendo su `prefetch={false}`. *"Leads de este trimestre"* es una pregunta distinta de *"leads desde siempre"*, y hoy solo se puede hacer la segunda.
- **M7 · Cobertura y honestidad del dato · ≈1 d.** Dos `COUNT` más de socios/leads **sin CP** y **fuera de `PostalCodeArea`**, mostrados como pie de leyenda: *"Se representan 412 de 468 socios: 31 sin código postal y 25 en zonas fuera de cobertura."* Y ampliar `GEOMETRY_NOTE` para que declare **las dos** aproximaciones.
- **M8 · Contraste, daltonismo y modo oscuro · ≈1 d.** Usar `readableMetricInk()` también en el mapa (escalones 0-3 → tinta oscura, 4-6 → tinta hueso): el peor contraste sube de 1,12:1 a >7:1. `RAMP_FALLBACK_INK` deja de ser literal y pasa a `var(--color-brand-text)`. Divergente: separar las claridades de los dos brazos **y** añadir redundancia no cromática (patrón SVG o `dashArray` distinto en los negativos) — regla: **ningún par simétrico con ΔL\* < 12**. Y `[data-theme="dark"] .tz-barrio-map .leaflet-tile` propio.
- **M9 · `prefers-reduced-motion` en los vuelos y objetivos táctiles · ≈0,5 d.** `reduce ? map.setView(ll, z, {animate:false}) : map.panTo(...)`. Subir métricas, ciudades y `MapButton` a `min-h-11`. **Ojo**: cambia la caja que `layoutLabels` siembra como ocupada, así que hay que revisar el e2e y las colisiones.
- **M10 · Interacción táctil · ≈0,5 d.** Detectar `(pointer: coarse)` y usar solo `click` como conmutador de foco (segundo toque = desfocar). Añadir `bindTooltip` al polígono.

#### MEDIO

- **M11 · Buscador de barrio · ≈1 d** (combobox accesible, patrón APG). Pasa a Alto con geometría real y cientos de barrios.
- **M12 · Tooltip rico con mini-sparkline · ≈2 d.** Requiere dato nuevo: 6 buckets mensuales de altas por CP (~31×6 filas, ~1,5 KB). El sparkline como `<polyline>` SVG en línea — **nada de montar Recharts dentro de un popup de Leaflet**.
- **M13 · Isócronas reales · ≈2-3 d.** Sustituir el círculo por un polígono de isócrona (OpenRouteService, Mapbox o Valhalla propio), con **caché en base de datos** (`CenterIsochrone { centerId, mode, minutes, geometry, fetchedAt }`), invalidación solo al mover el centro, y **degradación al círculo actual** sin clave de servicio — con la leyenda diciendo cuál se está viendo. Es la diferencia entre un área de captación creíble y una circunferencia.
- **M14 · Recalibrar el mapa de calor del panel · ≈1 d.** Recalcular `radius`/`blur` en metros→píxeles en cada `zoomend` y ponderar por `value`. **Alternativa más honesta y más barata**: sustituir el `heatLayer` por círculos proporcionales en metros (`L.circle`), que no fingen una densidad continua que no se tiene.
- **M15 · Controles: capas y exportación · ≈1,5 d.** Panel de capas que convierta `WALK_MINUTES`/`SHOW_CENTERS`/`CELL_OPACITY` en estado de URL. Exportar CSV reutilizando el patrón probado de `dashboard/export-ranking-button.tsx` (`;` + BOM para Excel español), más útil para dirección que un PNG. Para imagen: `leaflet-image` no soporta `divIcon`, así que la vía es `html-to-image` **incluyendo la leyenda y el pie de aproximaciones** — un PNG del mapa sin su leyenda es exactamente el mapa que miente.
- **M16 · Preparar el rendimiento antes de que llegue el volumen · ≈1 d.** `preferCanvas: true` + `L.canvas()` **solo cuando `points.length > 200`** (por debajo seguir en SVG); `simplifyFactor: 1.0`; `updateWhenIdle: true`, `updateWhenZooming: false`, `keepBuffer: 4`; `maxBounds` con `maxBoundsViscosity: 0.7`. Y desacoplar `layoutLabels` del `paint` de hover con `requestAnimationFrame` + debounce, acotando el `querySelectorAll` al contenedor. **Medir antes y después** con el Performance panel (nº de "Forced reflow" durante un barrido), no a ojo.
- **M17 · Normalización por población · ≈2 d + gestión del dato.** `PostalCodeArea.population Int?` (INE) y métrica "Penetración (socios / 1.000 hab.)". Es lo que convierte *"dónde tengo más socios"* en *"dónde tengo margen"*.

#### BAJO

- **M18** Quitar `react-leaflet` de `package.json` (no se importa en ningún fichero). **M19** Unificar la distancia de `groupBarriosByCity:192` con `haversineKm`. **M20 · Basemap de marca propio · ≈2-4 d**: el filtro CSS sobre teselas ajenas es un apaño que cuesta composición por tesela; un estilo vectorial propio (Protomaps autoalojado o MapTiler) da control real y modo oscuro nativo. **Condición**: mantener la atribución, respetar límites de peticiones, y **degradar a fondo neutro sin romper** — hoy CARTO se usa sin clave y **sin plan de degradación**: si limita, el mapa se queda en blanco sin explicación; un `tileerror` con nota "fondo cartográfico no disponible" es media hora. **M21 · App nativa**: cuando llegue, decidir antes entre `react-native-maps` (nativo, mejor gesto, requiere clave) y WebView con este mismo Leaflet (reutiliza `barrio-map.ts` entero). Los módulos puros son reutilizables en cualquiera de las dos vías: **esa es la mayor ventaja de cómo está separado hoy**.

### 6.5 Valor de negocio

| Decisión que debería permitir | Qué hace falta | Estado |
|---|---|---|
| **Dónde repartir el presupuesto de captación** | Leads y conversión por barrio, por periodo y por canal, normalizados por población | Parcial: **acumulados históricos** (C5), **contaminados por leads cerrados** (C3) y **sin normalizar** (C2) |
| **Dónde abrir el próximo centro** | Penetración baja + leads altos + lejos de un centro, con isócrona real y población | Existe `opp`, pero su fórmula está **sin validar con negocio**, usa línea recta y **devuelve 0 sin centros situados** |
| **Qué barrios tienen fuga** | Bajas por barrio y periodo | **No se puede responder.** `Member.cancelledAt` existe (`schema.prisma:351`) y **no se usa en el mapa**; `trend` mide altas, no bajas |
| **Dónde reforzar horarios / poner un entrenador** | Cruce de barrio con centro asignado y ocupación | No existe |
| **Si una campaña funcionó** | Comparación entre dos periodos sobre el mismo plano | No existe |

**Datos que faltan, por orden de valor:** (1) **bajas por barrio y periodo** — `Member.cancelledAt` **ya está guardado**, así que es la de mejor relación valor/coste; (2) estado del socio en la agregación (M1); (3) población por barrio (M17); (4) coordenadas fiables de centros, geocodificadas con validación y caché — geocodificar direcciones de **socios** es otra decisión, más delicada: si se hace, **agregando en servidor** y enviando al cliente solo la celda, nunca un punto por persona; (5) **ingreso/LTV por barrio** — hoy el mapa cuenta cabezas, y *"dónde está mi facturación"* y *"dónde están mis socios"* no son el mismo mapa; (6) canal de captación por barrio (`Lead.channel`), que responde *"qué canal funciona en qué barrio"*.

**Orden sugerido:** Sprint 1 (credibilidad del dato) M1+M2+M3+M7 ≈3 d · Sprint 2 (usable por todos) M4+M8+M9+M10 ≈3,5 d · Sprint 3 (precisión) M5+M6 ≈4 d · Sprint 4 (negocio) métrica de fuga desde `cancelledAt`, M13, M17.

> **Nota de verificación**: M2, M8, M9 y M15 tocan el DOM o las cajas que `layoutLabels` usa para resolver colisiones, así que obligan a revisar `e2e/mapa-barrios.spec.ts` (cuenta `.leaflet-overlay-pane path` en `:24` y `:82`); **M4, al sustituir la lista de botones por una tabla, rompe el selector `span.tz-nums` de `:51`**.

## 7. Revisión de cumplimiento normativo (clientes y trabajadores)

> **Lectura de conjunto**: el proyecto tiene una arquitectura de protección de datos *muy por encima* de lo habitual en el sector — punto único de acceso a salud, auditoría real, consentimiento versionado y granular, oposición a la IA que funciona de verdad, y gestión de correo impecable. **Los incumplimientos no están en el diseño de la protección: están en los bordes** — el formulario público que nadie revisó, la pestaña que se olvidó de gatear, el ciclo de vida del dato que nunca se cerró, y toda la capa documental que no existe. Es un patrón sano: el núcleo aguanta y lo que falta se cierra sin rediseñar nada.

### 7.1 WEB APP — socios (clientes)

**CN-01 · CRÍTICO — El formulario público de leads capta datos de salud sin base jurídica ni información previa.**
`lead-form/[orgSlug]/[centerSlug]/public-lead-form.tsx:111-113` pide *"¿Alguna lesión, enfermedad o patología?"* como campo **`required`**, junto a nombre, apellidos, teléfono, email, CP, ocupación, sexo e hijos. **No hay casilla de consentimiento, ni texto informativo, ni enlace a `/privacidad`.** Y `health-access.ts:100-138` crea el `HealthRecord` con `consentSignedAt: new Date()` — es decir, **se estampa la firma de un consentimiento que nadie ha prestado**. Arts. 9.2.a, 13 y 7 RGPD; art. 6 LOPDGDD. Es el hallazgo con la relación coste/exposición más desfavorable del repositorio: el art. 83.5 lo sitúa en el tramo alto y el 83.2.g agrava por la categoría del dato.
*Acción*: capa informativa + casilla separada no premarcada + `consentSignedAt` solo si se marca. **Y minimizar**: sustituir el texto libre por un booleano y llevar el detalle a la valoración presencial, que es donde se hace el screening real con el entrenador delante.

**CN-02 · CRÍTICO — Recepción ve composición corporal y fotos de progreso, sin permiso y sin auditoría.**
La matriz excluye a recepción de los datos de salud (`rbac.ts:220-224`), y `members/[id]/page.tsx` gatea la sección "Salud" (`:606-618`) y las valoraciones (`:930`) — pero **la sección `evolucion` (`:984-1126`) no lleva ningún gate**, y `members-queries.ts:137` carga `progressEntries` dentro del `include`, **sin pasar por `health-access.ts` y sin escribir en `AuditLog`**. Resultado: recepción ve `bodyFatPct`, `visceralFatRating`, `bmi`, `metabolicAge`, `muscleMassKg`, la evolución gráfica y **las fotos frontal/perfil/espalda** de cualquier socio de su ámbito, **sin dejar rastro**. Contradice literalmente el comentario de `prisma/schema.prisma:458`: *"Dato Art. 9 RGPD (RB-PERFIL-004): mismo tratamiento que HealthRecord"*.
**Es la brecha de datos de salud más probable del sistema, y la que peor se defiende: el propio repositorio documenta la regla que incumple.**

**CN-03 · ALTO — El consentimiento de datos de salud se impone como obligatorio: no es libre.**
`onboarding/[token]/onboarding-form.tsx:36-40` etiqueta el bloque como `"Obligatorio ✱"` y `:87` bloquea el alta (`consents.health && consents.contract`). **El socio no puede terminar el onboarding sin ceder sus datos de salud**, mientras `/privacidad` le promete que puede oponerse. Arts. 4.11, 7.4 y 9.2.a. Riesgo: **invalidez retroactiva del consentimiento del art. 9 para toda la base de socios.**
*Dos vías legítimas*: (1) desbloquear el alta sin `consentHealth` y degradar el servicio de forma proporcionada — el código **ya soporta este camino** (`createHealthRecord` devuelve `no_consent`, existe `canUseClinicalDataForAI`); (2) cambiar de base jurídica al art. 9.2.h, lo que exige profesional sanitario o supervisión — improbable en un centro de EP. **La vía 1 es la coherente con el resto del diseño.**

**CN-04 · ALTO — No existe política de conservación ni ningún mecanismo de supresión automática.** `api/jobs/run/route.ts:70-87` ejecuta once reglas y **ninguna de retención**. No se purga: `Invitation` caducadas (el índice `@@index([expiresAt])` existe **y nadie lo usa**), `MobileRefreshToken` revocados, `AuditLog` (crece indefinidamente con `memberId` y metadatos con nombre y email), datos de ex-socios (`Member.cancelledAt` no dispara nada: **un socio de baja en 2019 conserva íntegras lesiones, fotos y bioimpedancia**), y organizaciones en `PENDING_PAYMENT` (el esquema **anuncia el TTL** en `:20,37` y no está implementado). *Nota: `src/lib/retention.ts` es el motor de retención de **socios** (churn), no de datos.*
*Acción*: tabla de plazos (propuesta de partida: contractual y de cobro 6 años art. 30 CCom / 4 años art. 66 LGT; salud, relación + 5 años art. 1964 CC; fotos, borrado a la baja; `AuditLog` 2-3 años; leads no convertidos 12 meses; fichajes 4 años art. 34.9 ET) + `runDataRetentionRule(orgId)` + anonimización de ex-socios.

**CN-05 · ALTO — La supresión del socio destruye los cobros, que son de conservación obligatoria — y la UI dice lo contrario.**
`members/[id]/actions.ts:426` ejecuta `tx.payment.deleteMany({ where: { memberId } })` y `:434` borra los `HealthRecord`. Mientras tanto, el diálogo que ve dirección (`member-data-panel.tsx:417`) afirma: *"RGPD: los datos de salud y los pagos emitidos se conservan anonimizados por obligación legal."* **Es falso: nada se anonimiza, se borra.** Doble riesgo — ante la **AEAT**, destrucción de justificantes dentro del plazo de prescripción (art. 200 LGT); ante el socio y la AEPD, un texto en pantalla que describe un tratamiento que no ocurre. *Regla general: **un texto legal que el código incumple es peor que no tenerlo.***

**CN-06 · ALTO — La política de privacidad no cumple el art. 13.** `/privacidad` reutiliza `CONSENT_TEXT` más dos bloques. **Faltan**: NIF y domicilio postal del responsable; DPD o declaración de que no procede; **base jurídica por cada tratamiento** (hoy todo se presenta como consentimiento, cuando agenda, cobros y portal son ejecución de contrato); **destinatarios** (no se nombra a Stripe, Anthropic, Brevo ni Render); transferencias internacionales y sus garantías; plazos de conservación; derecho a retirar el consentimiento; derecho a reclamar ante la AEPD; y existencia o no de decisiones automatizadas. Es un incumplimiento verificable **en treinta segundos desde el navegador**.

**CN-07 · ALTO — Contratación a distancia: falta toda la información precontractual y el desistimiento.** `hazte-socio/.../page.tsx:74-123` es un contrato a distancia con consumidor y no contiene: identidad del empresario con NIF y teléfono; **precio total con impuestos** (`:114` pinta el importe sin mención de IVA); duración, condiciones de resolución y **renovación automática** (los planes `MONTHLY`/`ONLINE` se cobran de forma recurrente y **en ningún sitio se dice**); **derecho de desistimiento de 14 días** ni el formulario del Anexo A; casilla de condiciones; ni botón con etiqueta inequívoca de obligación de pago (dice `Contratar`, art. 98.2). Tampoco hay **confirmación en soporte duradero** (art. 98.7): no existe plantilla de confirmación de contratación. `/planes` **tampoco tiene aviso legal ni condiciones en el pie**, lo que incumple el art. 10 LSSI aunque el cliente sea empresa.
*Riesgo práctico más grave que la multa*: **si no se informa del desistimiento, el plazo se amplía a 12 meses** (art. 105 TRLGDCU) — cualquier socio puede deshacer el contrato durante un año.

**CN-08 · ALTO — La seudonimización que promete el consentimiento no está garantizada en el código.** `consent.ts:26` promete: *"Estos datos se transmiten seudonimizados: no incluyen mi nombre, DNI, dirección ni datos de contacto"*, y `ai/mesocycle-prompt.ts:82-84` lo da por hecho. **No es cierto**: `health-access.ts:544-557` incorpora al briefing texto libre sin filtrar (`perfil.motivacionReal`, `screening.medicacion`, `screening.cirugias`, `screening.lesionesActuales`, `cierre.notasEntrenador`), más `ClientGoal.label` y la petición en crudo de `refineMesocyclePlan`. Basta que un entrenador escriba *"María se queja del hombro desde que su hijo Pablo nació"*. **El riesgo no es la salida en sí** (Anthropic es encargado y el trayecto está auditado en `MESOCYCLE_AI_INPUT_READ`) **sino prometer una garantía técnica que no se aplica**: eso convierte un tratamiento defendible en uno desleal.
*Elegir una, no las dos a medias*: (1) filtro de identificadores sobre todo texto libre antes de `buildMesocycleBriefing` + aviso en la UI; (2) ajustar el texto y **subir `CONSENT_VERSION`**. La 1 es la correcta; la 2 es el mínimo honesto.

**CN-09 · MEDIO — El registro de accesos a datos de salud está detrás de un muro de pago.** `rbac.ts:88` mapea `"/audit": "exportaciones"` y `audit/page.tsx:66` exige `requireFeature("exportaciones")`. **Un cliente en plan Esencial no puede consultar quién ha accedido a los datos de salud de sus socios**, pese a que el `AuditLog` se escribe igualmente. El responsable del tratamiento es **el gimnasio**: ante un requerimiento no puede acreditar el control de accesos porque su proveedor se lo vendió como premium. Es defendible que la *exportación masiva* sea de pago; **no lo es que lo sea el acceso a la propia traza**.

**CN-10 · MEDIO — Datos clínicos duplicados fuera del punto único de lectura.** `Mesocycle.safetyCriteria` y `Mesocycle.aiConversation` (`schema.prisma:1729-1732`, que contiene el briefing íntegro con la sección "Screening clínico") se leen desde `mesocycle-queries.ts` **sin pasar por `health-access.ts` y sin escribir en `AuditLog`**. El control por rol sí coincide, pero se pierde la trazabilidad. Igual con `SessionDebrief.pain`.

**CN-11 · MEDIO — La exportación de datos del socio está incompleta y no deja traza.** Faltan `consentAI` (el bloque lista cuatro de los cinco consentimientos), `Assessment` (**donde vive el grueso del dato clínico declarado**), `PerformanceMetric`, `Mesocycle`, `SessionDebrief` y el `AuditLog` de accesos a sus propios datos. `MemberNote` se excluye a propósito, y el razonamiento es correcto **para el art. 20** (portabilidad) — pero **el art. 15 sí alcanza a las notas**. Y `api/portal/export-data/route.ts` **no escribe ninguna entrada en `AuditLog`**: el ejercicio de un derecho no queda registrado.

**CN-12 · MEDIO — Menores de edad: no se contempla en absoluto.** No hay ninguna comprobación de edad en ningún flujo; `Member.birthDate` es opcional y nunca se valida; **el alta pública ni siquiera pide fecha de nacimiento**; `Lead` tampoco la tiene; y no existe campo para el consentimiento del tutor. En España el umbral es **14 años** (art. 7 LOPDGDD). Un centro de EP capta menores con normalidad (adolescentes derivados, deporte de base), y **un consentimiento de datos de salud prestado por un menor de 14 años es nulo**.

**CN-13 · MEDIO — Domiciliación SEPA sin preaviso al deudor.** El esquema SEPA Core exige **pre-notificación con al menos 14 días naturales** salvo pacto distinto. `member-billing.ts:145,231` habilita `sepa_debit`, pero **no existe ninguna plantilla de preaviso de cargo**: de las once plantillas de `emails/templates.ts`, la única de cobro es `renderPaymentFailedEmail`, **posterior al fallo**. Tampoco se informa del plazo de devolución de 8 semanas.

**CN-14 · MEDIO — Facturación e IVA.** Decisión consciente y bien documentada: Apta no factura, cada gimnasio factura con su herramienta, y `receiptNumber` (`payments.ts:12-20`) **no es una serie de facturación y no debe presentarse como tal**. Hueco de modelo: `Payment.amountCents` y `MembershipPlan.priceCents` **no tienen desglose de base imponible/cuota ni tipo**, así que si entra facturación hay migración.
*Calendario verificado a 6/9/2026*: **VERI\*FACTU aplazado por el RDL 15/2025 a 1 de enero de 2027** (Impuesto sobre Sociedades) y 1 de julio de 2027 para el resto — **ya no aplica en 2026**. **Factura electrónica B2B**: el RD 238/2026 se publicó el 31/3/2026; la Orden Ministerial entra en vigor el **1 de octubre de 2026** y desde ahí corren 12 meses (>8 M€) o 24 meses (el resto) → obligatoriedad efectiva **entre finales de 2027 y 2028**, y **solo entre empresarios**: el cobro del gimnasio a un socio consumidor queda fuera.
*Nota importante*: la **exención de servicios deportivos del art. 20.Uno.13º LIVA solo alcanza a entidades de carácter social**; una S.L. con ánimo de lucro **tributa al 21 %**.

**CN-15 · BAJO — Cookies: hoy correcto.** **No hay banner y no hace falta**: las únicas cookies son la de sesión de Auth.js y `tz` (zona horaria), ambas técnicas. Verificado: **cero analítica, cero GTM, cero píxeles** en todo `src/`. *Acción*: página `/cookies` con el inventario para poder acreditarlo, y una nota en `AGENTS.md` — cualquier PR que añada analítica debe traer CMP con "rechazar todo" al mismo nivel visual que "aceptar".

**CN-16 · BAJO — Fotos de progreso corporal como data URL sin cifrado.** `members/[id]/actions.ts:554` y `apps/mobile/src/utils/pick-image.ts:37` guardan `data:image/jpeg;base64,...` en columnas de texto de Postgres. Son fotos frontal/perfil/espalda, habitualmente en ropa interior. **Un volcado de base de datos las entrega legibles.** `schema.prisma:919-924` ya reconoce que el esquema `health.*` cifrado está pendiente (ADR-005).

**CN-17 · BAJO — Accesibilidad (EAA / Ley 11/2023): sin declaración ni evidencia.** Exigible **desde el 28 de junio de 2025** para servicios digitales de consumo (norma técnica EN 301 549 / WCAG 2.1 AA; régimen sancionador vía RDL 1/2013, y el RD 143/2026 ya ha creado la unidad de vigilancia). **Exención relevante**: el art. 3 exime a microempresas (≤10 trabajadores y ≤2 M€) — Training Zone probablemente entra; **Apta como SaaS, no necesariamente**, y el cliente B2B se lo va a preguntar. Ver el capítulo 4 para el detalle técnico de los incumplimientos.

### 7.2 WEB APP — trabajadores

**CN-18 · ALTO — No hay registro de jornada operativo: el módulo está aparcado.** El modelo (`schema.prisma:1297-1314`) y la lógica (`timeclock-queries.ts:18-41`) existen, pero **el widget está desmontado** — `rrhh/rrhh-client.tsx:12-14` lo dice literalmente. **La app no ofrece registro de jornada** (art. 34.9 ET, RDL 8/2019), y el centro tiene que llevarlo por otro medio. Y si se reactivase tal cual **no cumpliría del todo**: `TimeClockEntry` admite **una sola entrada y una sola salida por día**, lo que no permite pausas ni jornadas partidas —habituales con turno de mañana y tarde— y no distingue ordinarias de extraordinarias.
*Calendario verificado*: hoy rige el RDL 8/2019 — el registro debe ser fiable, **no necesariamente digital**. El RD que impondría formato digital e inalterable con acceso remoto de la ITSS **no está aprobado**: fue devuelto con dictamen desfavorable del Consejo de Estado y su aprobación se ha reprogramado a **septiembre de 2026**, sin garantía de plazo. Conviene diseñar ya pensando en él.
*Acción inmediata (documental)*: **decir por escrito al cliente que Apta no presta hoy esta función.** Es una responsabilidad que no puede quedar implícita.

**CN-19 · ALTO — Control de la actividad del trabajador sin información previa.** `timeclock-queries.ts:61-95` (`crossCheckHours`) cruza las horas fichadas de cada trabajador con las sesiones que consta que dirigió y devuelve la desviación en minutos, **nominalmente, a dirección**. `ClassSession.directedByUserId` existe precisamente para esa verificación. **No existe ningún documento de información al trabajador en el repositorio**, y el art. 89.1 LOPDGDD exige informar **previa y expresamente** a la plantilla y a la RLT. Riesgo doble: AEPD, y **nulidad de la prueba** en un despido disciplinario apoyado en estos datos (doctrina constante del TC y del TS).

**CN-20 · ALTO — Al entrenador se le niega el acceso a sus propias valoraciones.** `rbac.ts:352-355`: *"valoraciones de entrenadores: EXCLUSIVO dirección, nunca el propio entrenador"*. El diseño está bien argumentado **desde RRHH**, pero la valoración que un socio hace de un entrenador **es dato personal del entrenador**: si ejerce el art. 15 hay que dársela (score, fortalezas, mejoras), seudonimizando solo **quién** la escribió — el art. 15.4 permite proteger la identidad del tercero, no negar el contenido. **Hoy no hay ningún camino, ni siquiera manual.** Especialmente probable si las valoraciones se usan en una decisión laboral, que es para lo que existen (y entonces, art. 64.4.d ET: información a la RLT).

**CN-21 · MEDIO — Ranking nominal de ventas y perfilado de rendimiento.** `rrhh/page.tsx:57-91` publica un ranking nominal por importe vendido, **con medallas**, visible para dirección y RRHH. El tratamiento tiene base legítima, pero la forma —ranking, gamificación, comparación entre compañeros— entra en el terreno de la dignidad del art. 20.3 ET y requiere información previa e idealmente consulta a la RLT.

**CN-22 · MEDIO — Ámbito de acceso de RRHH sin acotar.** `rbac.ts:240-242` da a `HR_MANAGER` alcance sobre toda la organización, mientras `CENTER_DIRECTOR` sí está acotado por `staffScopeFilter`. Irrelevante en un cliente de un centro; relevante en una cadena. *Correcto en cambio*: `HR_MANAGER` **no** ve datos de salud ni valoraciones de entrenadores.

**CN-23 · MEDIO — La auditoría es buena, pero no es suficiente como medida del art. 32.**
*Lo que funciona*: `health-access.ts` es un punto único real y `trainer-members-queries.ts:103-112` audita también el camino móvil; recepción, RRHH y admin reciben `null`, nunca un error que revele si existen registros. Es un diseño correcto.
*Lo que falta*: **el `AuditLog` es append-only por convención, no por construcción** — `schema.prisma:1068-1085` no tiene trigger, ni RLS, ni encadenado hash, y de hecho `members/[id]/actions.ts:461` ya ejecuta `tx.auditLog.updateMany(...)`. **Un log que quien es auditado puede modificar no sostiene una impugnación.** Más los huecos de CN-02, CN-10 y CN-11. Y `MemberNote` se lee sin consentimiento ni registro: el comentario advierte con acierto que *"no debe usarse como historial clínico encubierto"*, **pero no hay nada que lo impida** — y en la práctica es donde acaban las observaciones clínicas.
*Acción*: `REVOKE UPDATE, DELETE ON "AuditLog"` para el rol de aplicación en la migración de producción.

**CN-24 · BAJO — Desconexión digital, política de dispositivos, canal de denuncias y plan de igualdad.** Ninguno de los cuatro existe. **La app móvil de staff es exactamente el vector que el art. 88 LOPDGDD pretende regular**: envía trabajo al móvil personal del entrenador fuera de jornada. La Ley 2/2023 y el plan de igualdad se activan a partir de 50 trabajadores (revisar anualmente); **la política de desconexión digital es exigible con cualquier plantilla.**

### 7.3 APP MÓVIL

**CN-25 · ALTO — No hay borrado de cuenta desde la app.** `(tabs)/perfil.tsx:83-102` ofrece únicamente "Mi evolución", "Mis bonos" y "Cerrar sesión"; **y tampoco lo hay en la web para el socio** (`deleteMember` es exclusivo de dirección). No es normativa española, es **contractual con las tiendas y bloqueante para publicar**: App Store Review Guideline **5.1.1(v)** (borrado iniciable desde la app, no solo suspensión) y la política de Google Play (ruta in-app **y** URL web accesible desde la ficha).
*Acción*: puede resolverse como **solicitud verificada al centro** en vez de borrado inmediato, siempre que se cumpla el plazo del art. 12.3 RGPD (un mes) y se informe de qué se conserva por obligación legal.

**CN-26 · ALTO — La app no informa de nada.** Ninguna pantalla enlaza a `/privacidad`, a condiciones, ni permite gestionar consentimientos: todo vive en la web. Y la app **muestra composición corporal y fotos de progreso** (`(tabs)/evolucion.tsx:198-231`, con `PhotoRow` renderizando frontal/lateral/espalda) **sin ninguna capa informativa** — solo comprueba `consentHealth`/`consentImages` para decidir qué pinta, que es correcto pero no informa. *La API y la lógica ya existen* (`updateMyConsentAction`): es cablear la UI.

**CN-27 · ALTO — `app.json` sin manifiesto de privacidad ni identificadores.** No hay `ios.privacyManifests`, ni `ios.bundleIdentifier`, ni `android.package`; y **`expo-secure-store` no figura en `plugins`** pese a usarse. Apple exige `PrivacyInfo.xcprivacy` con `NSPrivacyAccessedAPITypes` desde mayo de 2024, más las Privacy Nutrition Labels; Google exige el Data Safety form. **Las etiquetas tendrán que declarar "Health & Fitness" y "Sensitive Info"** — categorías que Apple examina con más detalle y que obligan a que la política de privacidad las cubra explícitamente.

**CN-28 · MEDIO — Fallback de API en HTTP claro.** `apps/mobile/src/api/client.ts:22-34`: `devApiUrlFallback()` construye `http://…` y `API_URL` cae ahí si faltan `EXPO_PUBLIC_API_URL` y `extra.apiUrl`. **En un build de producción con la variable mal configurada, la app enviaría credenciales y datos de salud en claro.** *Arreglo de dos líneas*: que el fallback solo se aplique con `__DEV__ === true` y que un build de producción sin la variable **falle en tiempo de build**.

**CN-29 · BAJO — SecureStore sin política de accesibilidad explícita.** `setItemAsync` sin opciones: en iOS la entrada puede incluirse en copias de seguridad y sincronizarse. Pasar `{ keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY }`.

**Verificado correcto en la app**: tokens en `expo-secure-store` (Keychain/Keystore), nunca `AsyncStorage`, con access token de 15 min, refresh opaco de 30 días, **rotación en cada uso y detección de reuso que revoca toda la familia**, y `updateMany` condicional que resuelve la carrera · los textos de permiso de `app.json:36-37` describen con exactitud el uso real (el socio no sube fotos desde la app; **si eso cambia, los textos deben cambiar con ello**) · los datos de salud en la app de entrenador pasan por `getTrainerMemberDetail` con `canViewHealthData` + `AuditLog`, igual que en web · los mesociclos **no se exponen al socio** ni en portal ni en app, lo que reduce mucho la superficie del art. 22.

### 7.4 Transversal: organización y documentación

**CN-30 · CRÍTICO — No existe contrato de encargado del tratamiento entre Apta y el centro.** Apta trata datos de salud de los socios por cuenta del gimnasio: **es encargado del tratamiento, sin discusión**. Y **no hay ningún punto del flujo en que el gimnasio firme nada**: `platform-billing.ts:50-59` crea la sesión de Checkout **sin `consent_collection.terms_of_service`**; la organización nace del webhook de pago sin aceptación de condiciones ni de encargo; y `onboarding-form.tsx:97-98` solo hace que el `OWNER` cree contraseña. **Tampoco hay autorización de subencargados** (art. 28.2/28.4) para Anthropic, Stripe, Brevo, Render y Expo, ni lista publicada. Sin DPA, el tratamiento es ilícito **para ambas partes** — y es un bloqueante comercial absoluto: **ningún cliente B2B con asesoría propia firma un SaaS que trata datos del art. 9 sin DPA.**

**CN-31 · ALTO — Transferencias internacionales sin evaluar ni declarar.**

| Proveedor | Dato que sale | Estado |
|---|---|---|
| **Anthropic** | Edad, sexo, objetivos, métricas, **criterios clínicos y texto libre** | EEUU. Sin DPA acreditado, sin declarar |
| **Stripe** | Nombre, email, teléfono, datos de pago, mandato SEPA | IE + tratamiento en EEUU. Sin declarar |
| **Brevo** | Email, nombre, contenido de los correos | Francia (UE). Sin declarar |
| **Render** | **Toda la base de datos, incluida `HealthRecord`** | Región **a verificar**. Sin declarar |
| **Expo / EAS** | Build; potencialmente OTA updates | EEUU. Sin declarar |
| **Microsoft / Google** | Email, identificador | Sin declarar |

Ninguno aparece en `/privacidad`. La combinación "datos del art. 9 + proveedor en EEUU + sin declarar + sin garantía documentada" se sanciona sin margen de discusión.
*La acción de mayor rendimiento de toda esta lista*: **verificar la región de despliegue de Render** — si la base de datos con `HealthRecord` está en Oregón, es una transferencia internacional de datos de salud, y **trasladarla a Frankfurt elimina el problema de raíz**.

**CN-32 · ALTO — Sin registro de actividades, sin EIPD, sin DPD designado, sin procedimiento de brechas.** Ninguno de los cuatro existe. **La excepción de <250 empleados del art. 30 no aplica cuando se tratan datos del art. 9.** La EIPD es prácticamente segura para **Apta** (SaaS multi-tenant, tratamiento sistemático de datos de salud de un número creciente de interesados, más IA sobre esos datos) y discutible para un centro individual por escala. Sobre el DPD hay que **tomar la decisión por escrito aunque la conclusión sea "no procede"**: el art. 30 obliga a poder acreditar el análisis. Y no hay procedimiento de brechas, ni plantilla de notificación, ni registro interno de incidentes (art. 33.5) — **con datos del art. 9 y CN-02 abierto, es el hueco que más duele si algo pasa**. Son, además, **los cuatro documentos que se piden en el primer requerimiento de una inspección, antes de mirar una sola línea de código.**
*Idea de doble uso*: Apta debería entregar a sus clientes una **plantilla de registro de actividades precumplimentada**. Es a la vez cumplimiento y argumento de venta.

**CN-33 · ALTO — Reglamento de IA: obligaciones ya exigibles.**
*Calendario verificado a 6/9/2026*: **art. 4 (alfabetización en IA) aplicable desde el 2/2/2025** — alcanza a proveedores **y a responsables del despliegue**. **Art. 50 (transparencia) aplicable desde el 2/8/2026: ya está en vigor** — obliga a informar de la interacción con IA y a marcar el contenido generado. **Alto riesgo retrasado** por el Digital Omnibus (Reglamento (UE) 2026/1744): Anexo III a 2/12/2027, Anexo I a 2/8/2028. Sanciones hasta 35 M€/7 % (prohibidas) y 15 M€/3 % (resto, transparencia incluida).
*Clasificación razonada*: el generador de mesociclos **no encaja en ningún supuesto del Anexo III** (no es empleo, ni educación reglada, ni crédito, ni servicios esenciales, ni dispositivo médico), y el semáforo de aptitud es **determinista, no IA**, según el propio comentario del esquema. Conclusión: **riesgo limitado**, arts. 4 y 50. *Conviene no precipitarse ante el ruido comercial de este mercado.*
*Atenúa mucho el riesgo* que el mesociclo **no se expone al socio** y que existe aprobación humana previa (`approveMesocycle`) — **verificado: aquí el código sí cumple lo que el texto promete**.
*Acción*: documento de clasificación (una página, pero hay que tenerla) + marca **"Propuesta generada con IA · revisada por [entrenador]"** visible + constancia de la formación del art. 4 + revisar la clasificación si alguna vez el mesociclo llega al socio sin revisión humana, que reabriría también el art. 22 RGPD.

**Art. 22 RGPD — decisiones automatizadas.** Verificado: **no hay decisión automatizada con efectos jurídicos o significativos** sobre el socio. El mesociclo nace `DRAFT`, requiere aprobación humana explícita y no se expone al interesado; las alertas de retención generan avisos internos, no decisiones; el semáforo es una regla determinista mantenida por el director técnico. **La arquitectura está bien planteada aquí y conviene no perderlo.**

### 7.5 Correcto y verificado (para que no se reinvente)

1. **Punto único de acceso a salud** (`health-access.ts`), con `canViewHealthData`/`canEditHealthData` y `AuditLog` en todas las rutas; los roles sin autorización reciben `null`, **nunca un error que revele si existen registros**. Mejor que la mayoría de productos del sector.
2. **Consentimiento versionado y granular**: `CONSENT_VERSION`, `needsReconsent`, y cinco consentimientos independientes con marca de tiempo. El re-consentimiento no bloquea el acceso, y decir "no" a la IA se guarda como respuesta válida.
3. **La oposición a la IA es real, no decorativa**: `canUseClinicalDataForAI` exige `consentAI && consentHealth`, y `getMesocycleBriefingForMember` toma la vía sin datos clínicos avisando al modelo de que el plan nace incompleto. **Sin trampas.**
4. **Revisión humana previa**: `DRAFT → APPROVED` con `approvedByUserId`. Coincide con lo prometido en el consentimiento.
5. **Retirada de consentimientos desde el portal**, tan fácil como darlos (art. 7.3), con auditoría `CONSENT_GRANTED`/`CONSENT_REVOKED`.
6. **Gestión de correo ejemplar**: doble capa (baja global + interruptor por tipo), con la decisión —correcta y bien argumentada— de guardar **fecha y no booleano** porque es la prueba del ejercicio del art. 21; enlace de baja y preferencias en el pie de todo correo prescindible; cabeceras `List-Unsubscribe`/`List-Unsubscribe-Post` **RFC 8058**; y separación limpia entre transaccional y prescindible. **Cumple el art. 21 LSSI y el art. 21 RGPD sin fisuras**, con cuatro vías equivalentes, todas auditadas.
7. **Marketing con consentimiento previo**: `consentMarketing` por defecto `false`, casilla no premarcada, y `canSendMemberEmail` como única puerta de salida.
8. **No hay cookies que consentir** (verificado en todo `src/`).
9. **Disciplina en la propagación de datos de salud**: `retention.ts:95-104` documenta explícitamente por qué **no** replica la causa clínica en la alerta de retención (viaja a pantallas donde llega recepción). Es exactamente el criterio correcto.
10. **Aislamiento multi-tenant**: `orgId` en toda tabla de negocio, `memberIsInScope` con `notFound()` en vez de error —desde fuera del ámbito la ficha **no existe**—, replicado en la API móvil.
11. **Autenticación móvil**: rotación con detección de reuso, reclamación atómica, hash SHA-256, nunca el token en claro.
12. **Cron protegido y falla cerrado**, con comparación en tiempo constante.
13. **Baja de trabajador que respeta la conservación obligatoria**: si hay huella se desactiva; solo se borra la fila cuando no hay nada que conservar.
14. **Confidencialidad del debrief de sesión**: `TRAINER_ADMIN` no hereda por rol lo que otro entrenador escribe de su sesión.

### 7.6 Pendiente de validación jurídica externa

Todo lo siguiente son **borradores pendientes**, en la misma línea que ya marca `consent.ts:20-22`: política de privacidad completa y su versión para la app · condiciones generales de contratación del socio, información precontractual y modelo de desistimiento · condiciones del servicio Apta ↔ centro y **Anexo de Encargo del Tratamiento** con lista de subencargados · reescritura del párrafo de seudonimización si se elige la vía 2 de CN-08 (**obliga a subir `CONSENT_VERSION`**) · tabla de plazos de conservación · cláusula informativa laboral · política de desconexión digital y de uso de dispositivos · decisión motivada sobre DPD y EIPD · análisis del umbral de microempresa de la Ley 11/2023 para Apta y para Training Zone · tratamiento de menores.

*Las horquillas sancionadoras del art. 40 LISOS (CN-18) y del régimen autonómico de consumo de Aragón (CN-07) deben confirmarse con la asesoría laboral y de consumo: son normas modificadas varias veces desde 2021.*

### 7.7 Plan de cumplimiento priorizado

**Fase 0 — Antes de cualquier despliegue con socios reales (bloqueantes)**

| # | Acción | Tipo | Esfuerzo |
|---|---|---|---|
| CN-01 | Consentimiento + capa informativa en `/lead-form`; minimizar `healthNote` | Producto | 1 día |
| CN-02 | Gatear `MemberProgressEntry` por `health-access.ts` y filtrar la sección `evolucion` | Producto | 1 día |
| CN-30 | DPA Apta ↔ centro + aceptación registrada en el checkout | Documental + producto | 2 sem. (jurídico) |
| CN-31 | Verificar y, si procede, mover la región de Render a la UE | Técnico | 1-2 días |
| CN-06 | Política de privacidad completa | Documental | 2 sem. (jurídico) |
| CN-07 | Información precontractual, condiciones, aviso legal y pie legal | Documental + producto | 2-3 sem. |

**Fase 1 — Primer trimestre**: CN-32 (registro de actividades, procedimiento de brechas, EIPD, análisis DPD) · CN-04 (plazos + `runDataRetentionRule` + anonimización) · CN-05 (disociar `Payment`; corregir el texto del diálogo) · CN-03 (desbloquear el onboarding — **decisión de dirección primero**) · CN-08 (filtro de identificadores o ajuste del texto) · CN-19 (cláusula laboral firmada) · CN-25/26/27 (borrado de cuenta, enlaces legales y consentimientos en la app; `app.json` y privacy manifest).

**Fase 2 — Segundo trimestre**: CN-09 (sacar `/audit` del muro de pago) · CN-11 (completar el export, separar art. 15 de art. 20) · CN-12 (edad y tutores) · CN-13 (preaviso SEPA) · CN-20 (acceso del entrenador a sus valoraciones) · CN-23 (`REVOKE UPDATE, DELETE` + huecos de traza) · CN-33 (clasificación AI Act, marca de contenido generado, formación) · CN-28/29 (HTTPS forzado; `keychainAccessible`).

**Fase 3 — Segundo semestre / seguimiento**: CN-18 (reactivar el registro de jornada con pausas, inmutabilidad y acceso del trabajador — **vigilar el RD pendiente**) · CN-16 (ADR-005: esquema `health.*` cifrado, fotos fuera de la BD) · CN-14 (desglose de IVA; preparar VERI\*FACTU con horizonte **enero 2027**) · CN-17 (auditoría EN 301 549 y declaración) · CN-24 (desconexión digital; revisión anual del umbral de 50) · CN-15 (`/cookies` + regla en `AGENTS.md`) · CN-21/22.

## 8. QA: regresión, permisos y cobertura de pruebas

### 8.0 Qué se ejecutó de verdad

| Comprobación | Resultado |
|---|---|
| `npx prisma generate` | ✅ (imprescindible: sin él `tsc` da ~200 errores falsos) |
| `npx tsc --noEmit` (web) | ✅ **0 errores** |
| `npm run lint` (ESLint 9) | ✅ sin avisos |
| `npm run test:unit` | ✅ **219/219** |
| `apps/mobile` → `npm ci` + `npm run typecheck` | ✅ **0 errores** |
| `apps/mobile` → `expo lint` | ✅ sin avisos |
| Playwright (subconjunto agenda/reservas) | ✅ **7/7** (`agenda-reserva-staff`, `no-show-motivo`, `portal-reservas`, 2,3 min) |
| Suite Playwright completa | ⛔ **no ejecutada**: muta la BD de demo y habría contaminado las reproducciones dinámicas en curso |
| Verificación dinámica | ✅ `next dev` + `curl` contra `/api/mobile/v1/**` con usuarios demo + `psql` de lectura |

> **Ninguna comprobación automática falla.** Todo lo que sigue son fallos que **las pruebas actuales no cubren** — y esa es la conclusión más importante del capítulo.
>
> *Higiene de datos*: para reproducir W-02 se consumió y devolvió una sesión del bono de un socio de la demo; **queda restaurada**. Las sesiones creadas en pruebas se borraron. Quedan filas legítimas de `AuditLog` generadas por las lecturas de prueba.

### 8.1 WEB APP

**W-01 · BLOQUEANTE — El Session Brief filtra datos de salud (Art. 9) de socios de otros centros.**
`rbac.ts:364-371` (`canViewSessionDebrief`) devuelve `true` para `OWNER`/`CENTER_DIRECTOR` ante **cualquier** sesión de la organización, sin mirar el centro; `brief-queries.ts:23-83` solo filtra por `orgId`; y el índice `/brief` tampoco acota (`ownSessionsWhere` solo se aplica a `TRAINER`/`TRAINER_ADMIN`). El resto de la app **sí** acota (`agenda/session/[id]/page.tsx:45` usa `requireCenterRole`, `/members/[id]` usa `memberIsInScope`).
*Reproducción verificada*: `direccion.lajota@trainingzone.es` (director **solo** de La Jota) → `GET /trainer/brief` devuelve **43 sesiones: 20 de La Jota, 11 de Santander, 12 de Puerta del Carmen** → abrir una de Santander responde `200` con `canSeeHealth: true` y el roster completo:
```json
{"member":{"firstName":"Jarvis","lastName":"Mayert Connelly","state":"DELINQUENT"},
 "conditions":[{"zone":"cervicales","description":"Lesión: cervicales, molestia crónica","type":"INJURY"}],
 "matchedRules":[{"blockArea":"Carga sobre cabeza","light":"AMBER","adaptation":"Reducir rango, vigilar técnica"}]}
```
Idéntico en la web. **Y queda auditado como lectura legítima.** *(Coincide con SEC-01 del capítulo 2.4, encontrado de forma independiente.)*

**W-02 · ALTA — Borrar una sesión quema el bono de todos los socios apuntados, sin devolución ni aviso.**
`agenda-queries.ts:694-703` (`deleteSession`):
```ts
await prisma.sessionDebrief.deleteMany({ where: { booking: { sessionId } } });
await prisma.booking.deleteMany({ where: { sessionId } });   // ← ni refund ni notificación
await prisma.classSession.delete({ where: { id: sessionId } });
```
*Reproducción verificada (con restauración)*: bono a 5 → reserva de staff → **4** (descuento correcto) → el entrenador borra la sesión → **sigue en 4**. La reserva desaparece y el socio no recibe nada. **Ni siquiera queda `AuditLog`** — a diferencia de `discardAttendeeAsStaff`, que sí audita cada descarte. *Impacto*: pérdida de dinero del socio **a escala de clase entera**, y el descuadre solo se ve semanas después al agotarse el bono.

**W-03 · ALTA — El debrief y el check-in resucitan reservas CANCELADAS y de LISTA DE ESPERA a "Asistió".**
`brief/[id]/actions.ts:37-41` y `agenda/session/[id]/actions.ts:75` (`const newStatus = booking.status === "ATTENDED" ? "BOOKED" : "ATTENDED"`, **sin filtrar el estado de partida**). *Reproducción verificada*: reserva → cancelación (`CANCELLED`, `subscriptionId = null`, bono devuelto) → `POST /trainer/brief/<id>/debrief` con ese `bookingId` → `{"saved":true}` → en BD: `status = ATTENDED`, `subscriptionId = NULL`, `checkedInAt` puesto.
*Esperado*: solo se puntúa una reserva viva — `markBookingNoShow` **sí** lo hace (`agenda-queries.ts:617`). *Real*: una reserva cancelada, o una de lista de espera que nunca ocupó plaza ni pagó, pasa a `ATTENDED`, **ocupa aforo** (`OCCUPYING_STATUSES`) y cuenta como asistencia gratis en adherencia, retención, KPIs y feedback. **Ninguna de las tres vías (web, brief, móvil) valida el estado.**

**W-04 · ALTA — `/feedback` y `/feedback/debriefs-semanales` no aplican ámbito de centro.** `feedback-queries.ts:87-92,210-213` filtran solo por `orgId` — `centerId` es **un facet elegido por el usuario, no una frontera** —, `getMemberFeedbackDetail(orgId, id)` no recibe ámbito, y `getWeeklyDebriefReport(orgId, weekStart)` tampoco. Dirección de un centro lee las **notas confidenciales del debrief mensual** y las dimensiones de socios y entrenadores de los otros centros.

**W-05 · ALTA — Las rutas hijas de los módulos premium no pasan por `requireFeature`: el muro de pago se salta por URL.** `FEATURE_BY_ROUTE` (`rbac.ts:72-89`) solo declara `/brief`, `/feedback`, `/health/*` y `/audit`; pero `brief/[id]/page.tsx`, `feedback/[id]/page.tsx` y `feedback/debriefs-semanales/page.tsx` **no llaman a `requireFeature`**. Con plan Esencial, `/brief` redirige a `/planes` pero `/brief/<sessionId>?d=…` —**el enlace que la propia app pinta** desde `agenda/session/[id]/page.tsx:100`— responde 200 con el semáforo completo. El comentario de `brief/page.tsx:13-14` dice literalmente *"Sin esto, la URL directa se saltaría el filtro del menú"*: **eso es exactamente lo que ocurre un nivel más abajo.**

**W-06 · ALTA — `ia_programacion` —el único módulo con coste marginal real— no está gateado en ningún sitio.** `platform-plans.ts:21` lo comenta como *"rutinas por IA — único módulo con coste marginal real"*, y está ausente de `FEATURE_BY_ROUTE`; ni `members/[id]/mesociclos/actions.ts:25` ni el endpoint móvil lo comprueban. `grep -rn "orgHasFeature\|requireFeature" src` → **6 llamadas, ninguna con `ia_programacion`**. Solo `retencion` tiene gateo en motor. **Cualquier organización en Esencial o Avanzado genera y refina mesociclos** (~0,18 $ de API por generación, facturados a Apta).

**W-07 · ALTA — El selector "Socio" de la agenda ofrece toda la organización y permite reservarles plaza.** `members-queries.ts:117-123` filtra solo por `orgId`, y la escritura (`agenda-queries.ts:198-201`) también. *Verificado*: `entrenador@trainingzone.es` (La Jota + Puerta del Carmen) recibe `centers: ["La Jota","Puerta del Carmen"]` (correcto) y **`members: 49`** — el total de la organización, **incluidos los 34 de Santander**. Existe el criterio correcto justo al lado: `listMembersBookableForSession` (`:424-449`) sí acota por centro y modalidad.

**W-08 · MEDIA — Los KPIs de ocupación y no-show del panel no cuadran con sesiones periódicas.** `dashboard-queries.ts:93-107`, `:110-133` y `:136-159` filtran por `ClassSession.date`, que en una serie recurrente es **solo la fecha base**, y cuentan las reservas de la fila entera sin acotar por `occurrenceDate` — mientras el resto de la app usa `expandOccurrences`. Consecuencias: una serie creada hace 6 meses **no cuenta nunca**; una cuya fecha base sí cae en la ventana aporta su `capacity` **una vez** y **todas** sus reservas históricas → **ocupación por encima del 100 %**; y `getOccupancyByWeekday` imputa una serie "todos los laborables" **a un solo día**. *Latente en la demo* (`recurrence NONE: 3677`, cero recurrentes), pero la funcionalidad existe y está cubierta por e2e.

**W-09 · MEDIA — El portal decide "cancelable sin penalización" con la zona horaria del cliente; el servidor decide con la del centro.** `timezone.ts:20-22` prioriza la cookie `tz` y `portal-queries.ts:372,401,421-423` calculan `canCancelFreely` con ella, mientras la escritura (`:621-622`, `:763-767`) usa siempre `cls.center.timezone` — **con un desfase de hasta ~26 h que el propio comentario advierte**. Un socio con el navegador en otra zona ve el distintivo "sin penalización" y al cancelar recibe `forfeited: true`.

**W-10 · MEDIA — `RB-RES-008` documentada como "el centro no opera en domingo", pero el código ya no lo aplica.** `agenda-utils.ts:62-64`: `isOperatingDay` → `weekdayIdx(d) < 7` = **siempre `true`**, mientras `CRM_REGLAS_NEGOCIO.md:368-376` sigue afirmando que se rechaza. `portal-queries.ts:610-612` conserva la comprobación, muerta. **Quien lea el doc para diseñar un cambio partirá de una premisa falsa.**

**W-11 · MEDIA — El aforo por defecto del centro no tiene tope en la web y desactiva el máximo global.** `aforo/actions.ts:23-26` solo valida `capacity >= 1` y el input no tiene `max`; `agenda-queries.ts:208-220` usa `center.defaultGroupCapacity ?? MAX_GROUP_CAPACITY`, así que **poner 500 convierte 500 en el techo** y se salta `MAX_GROUP_CAPACITY = 30`. El endpoint móvil equivalente **sí** valida.

**W-12 · MEDIA — La alerta de tres faltas se manda a toda la dirección de la organización, no a la del centro.** `no-show-alerts.ts:36-43` selecciona `role: { in: ["OWNER","CENTER_DIRECTOR"] }` **sin centro**, mientras `CRM_REGLAS_NEGOCIO.md:388-391` dice *"dirección **del centro**"*. El **nombre y apellidos del socio** cruza la frontera de centro.

**W-13 · MEDIA — `moveSessionAction` no valida el formato de hora que `saveSessionAction` sí valida.** `session-actions.ts:238-259` acepta `startTime`/`endTime` como string libre y los escribe tal cual: un cliente que llame a la acción directamente puede dejar `"NaN:NaN"` en `ClassSession` — **justo el fallo que el comentario de la línea 68 dice haber cerrado**.

**W-14 · BAJA — Las posiciones de la lista de espera nunca se renumeran.** `portal-queries.ts:720-728` escribe `waitlistedCount + 1` una sola vez; **no hay ninguna renumeración en el repo**. A (1), B (2), A cancela, C entra → C obtiene **también la 2**.

**W-15 · BAJA — Cancelar una reserva de una sesión ya pasada dispara el email de "se ha liberado una plaza".** `cancelSessionBooking` no comprueba que la sesión sea futura, así que limpiar el roster de una clase antigua **manda correo a todos los socios con bono de esa modalidad** ofreciéndoles una plaza en una sesión que ya ocurrió. `cancelBookingForMember` sí bloquea el pasado; la vía de staff no.

**W-16 · BAJA — `RB-PAGO-008` da el ajuste de saldo al ENTRENADOR; el código se lo quita.** El cambio fue deliberado (roadmap 22-08) y hasta hay un e2e que prueba que un entrenador normal **no** puede — pero el documento de reglas nunca se actualizó.

**W-17 · BAJA — "Error del centro" cuenta como falta del socio para la alerta de tres faltas.** `no-show.ts:42`: `NO_SHOW_REASONS_WITHOUT_NOTICE = ["FORGOT", "OUR_ERROR"]`. Una sesión mal agendada **por el centro** suma a la racha que abre una tarea comercial contra el cliente: dirección recibe *"Fulano: 3 faltas seguidas sin avisar"* cuando **las tres las provocó el centro**. Código y doc coinciden; la regla resultante es absurda.

**W-18 · BAJA — `getHealthRecordsForMember` no acota por `orgId`** (`health-access.ts:36-40`). Los dos llamantes actuales sí validan la pertenencia, así que **no es explotable hoy** — pero es la última barrera de un dato del Art. 9 y no la aplica.

### 8.2 APP MÓVIL Y API `/api/mobile/v1`

**M-01 · BLOQUEANTE — Crear, editar y borrar sesiones de CUALQUIER centro de la organización.** `agenda/sessions/route.ts:27-60` (POST), `[id]/route.ts:34-72` (PATCH) y `:74-85` (DELETE) solo comprueban rol + `canManageEpSlots`. **Ninguna llama a `isCenterInScope`** — a diferencia de sus hermanas del mismo árbol (`bookings/route.ts:21-31`, `ep-slots/route.ts:54`, `capacity/route.ts:119`) y de la web, donde `saveSessionAction` comprueba **dos** centros.
*Reproducción verificada con limpieza posterior*, con token de un TRAINER imputado a La Jota y Puerta del Carmen (**no** a Santander):
```
PATCH  /agenda/sessions/321d00d2-…              → {"ok":true}   (sesión de Santander renombrada a "QA-PWNED")
POST   /agenda/sessions {centerId: Santander}   → {"ok":true,"data":{"id":"cmtpjpwcb…"}}
DELETE /agenda/sessions/cmtpjpwcb…              → {"ok":true,"data":{"deleted":true}}
```
**Es el ataque más barato del sistema**: cualquier entrenador con la app puede vaciar la agenda de otro centro — y, por W-02, **quemar de paso los bonos de sus socios**. *(Coincide con SEC-05, encontrado de forma independiente.)*

**M-02 · ALTA — Recepción recibe la media del debrief confidencial del entrenador (incluye dolor y movilidad).** La corrección de QA-PORTAL-01 introdujo `includeDebrief` para no mandárselo al socio, pero las rutas de staff lo piden con `true` para un `STAFF_ROLES` **que incluye recepción** — a quien `canViewSessionDebrief` y `canViewHealthData` excluyen explícitamente. `debriefAverage` promedia `technique`, `attitude`, `energy`, **`mobility`** y **`pain`** (invertido), entre otros. La cabecera del propio fichero afirma *"Nada de datos de salud"*. *Verificado*: la clave `feedbackAvg` está en el contrato que recibe recepción; con el seed actual sale `null` porque nadie ha puntuado ejes todavía, **pero la ruta de escritura está viva**.

**M-03 · ALTA — La API móvil no comprueba el plan contratado en ninguna ruta.** QA-COBROS-05 se corrigió **a medias**: `requireApiRole` añadió `assertPlatformOperational` (estado de plataforma) pero **no** `orgHasFeature`. `grep -rn "orgHasFeature\|requireFeature" src/app/api/` devuelve **solo** `api/audit/export/route.ts`. Resultado: `trainer/brief/*`, `trainer/sessions/[id]/feedback`, `trainer/members/[id]/mesocycles` y `admin/dashboard` están abiertos a cualquier plan. **La app nativa es la puerta de atrás del catálogo comercial.**

**M-04 · ALTA — `GET /api/mobile/v1/staff` devuelve la plantilla completa de la organización a dirección de centro.** `staff/route.ts:25-50` usa `where: { orgId, role: { not: "MEMBER" }, deactivatedAt: null }` sin `staffScopeWhere`, que la web sí aplica. *Verificado*: dirección de La Jota recibe **28 personas, incluidas las 8 de Santander**, con email, rol e imputaciones. Las escrituras sí están acotadas: **es fuga de lectura, no de escritura**. Y hay un e2e que prueba justamente *"dirección de centro gestiona su plantilla y solo la suya"* — en la web.

**M-05 · ALTA — La app dice "cancelación gratuita hasta 12 h antes" y el servidor aplica 24 h.** `agenda.tsx:371-372`, `sesiones.tsx:61`, `index.tsx:74`. El **booleano** `canCancelFreely` viene del servidor y es correcto; el **número** está escrito a mano y es el equivocado. Un socio con una clase dentro de 18 h lee *"estás dentro de las 12 h previas"* — cuando faltan 18 — y si cancela pierde la sesión creyendo que se pasó por poco. La divergencia **está documentada como un hecho** en `attendee-discard.ts:8-9`.

**M-06 · ALTA — El debrief y el feedback móviles marcan "Asistió" sobre cualquier reserva, incluidas las canceladas.** `trainer/brief/[id]/debrief/route.ts:40-43` y `trainer/sessions/[id]/feedback/route.ts:147-155`. Es la vía por la que se reprodujo W-03; se documenta aparte porque son **dos handlers distintos** y la corrección hay que aplicarla en los **cuatro** puntos de escritura.

**M-07 · MEDIA — El índice de Session Brief móvil enseña a `TRAINER_ADMIN` toda la organización; la web solo lo suyo.** `trainer/brief/route.ts:24` condiciona a `claims.role === "TRAINER"`, la web a `TRAINER || TRAINER_ADMIN`. El detalle sí corta (404), así que queda **una lista de tarjetas muertas más el nombre del entrenador y el centro de cada sesión ajena**.

**M-08 · MEDIA — La misma operación devuelve el bono en la web y lo consume en la app.** `cancelSessionBooking` **siempre** hace `increment: 1`; `discardAttendeeAsStaff` dentro de las 24 h **consume** la sesión. La app tiene **dos endpoints para el mismo gesto con efectos opuestos**, la web solo el que siempre devuelve, y ninguna pantalla web ofrece la ventana. Un socio sacado del grupo a última hora pierde o conserva la sesión **según por dónde entre el trabajador**. Además `TRAINER_DISCARD_WINDOW_HOURS = 24` está codificado mientras la del socio es configurable: subirla a 48 desalinea las dos reglas **en silencio**. *(No está en `CRM_REGLAS_NEGOCIO.md`: `RB-AGENDA-008` solo describe la conducta de la web.)*

**M-09 · MEDIA — La hoja de reserva anuncia "quedarán N−1" también cuando la reserva va a la lista de espera.** `agenda.tsx:317` calcula `remainingAfter` siempre, y `:355-363` lo pinta aunque el kicker ya diga "LISTA DE ESPERA" — que **no descuenta bono** (`consumesSession: false`). *Extra*: `remainingAfter` sale del saldo **agregado por modalidad**, no del bono del centro que se va a cargar de verdad.

**M-10 · MEDIA — `PATCH /capacity` usa un tope fijo de 30 e ignora el aforo por defecto del centro; y no comprueba que la sesión sea de grupo.** (a) Una sesión creada en la web con más de 30 plazas (posible por W-11) **no se puede tocar desde el móvil**; (b) el GET filtra a `GROUP` pero **el PATCH acepta cualquier `sessionId`**, así que se puede poner aforo 12 a una franja de EP que la web fuerza a 1 — y esa franja pasa a admitir 12 reservas.

**M-11 · MEDIA — El panel de dirección móvil y el web dan cifras distintas.** Dos divergencias: **(1) ámbito** — el móvil acota a `claims.centerId` (el centro **base** del token), la web resuelve con `centerScopeFor`, que incluye los `CenterMembership`: una dirección imputada a dos centros ve **un centro en la app y dos en la web**; **(2) asistencia** — el móvil agrupa por `Booking.occurrenceDate` (**correcto**), la web filtra por `ClassSession.date` (W-08). *(Coincide con M-04 del capítulo 1, medido allí como 8 vs. 9 morosos.)*

**M-12 · BAJA — `/me`, `/notifications` y `/notifications/[id]/read` se saltan la comprobación de plataforma activa**: usan `requireApiSession` en vez de `requireApiRole`, y `assertPlatformOperational` solo vive dentro del segundo. **Una organización suspendida por impago sigue sirviendo y resolviendo notificaciones desde la app.**

**M-13 · BAJA — Una reserva en lista de espera se muestra como "Reservada".** `sesiones.tsx:177` colapsa `BOOKED` y `WAITLISTED` en la misma etiqueta; hay un `Badge "En espera"` aparte, pero **en el calendario de la ficha que ve el staff no hay distintivo alguno**: un socio en espera parece tener plaza.

**M-14 · BAJA — `POST /agenda/sessions` no valida la hora ni la fecha; la web sí.** El endpoint de EP (`ep-slots/route.ts:47`) sí valida con `TIME_RE`. Compartir `isValidHHMM` entre las tres superficies.

### 8.3 Cobertura de pruebas

#### Lo que hay hoy

**Unitarios (26 ficheros, 219 casos)**: muy sólidos en la lógica **pura** — `session-balance` (10), `session-series` (12), `no-show` (8), `attendee-discard` (8), `health-status` (12), `date-utils` (9), `tasks-queries` (17), `staff-scope` (7). **`agenda-booking.test.ts` (11) es el mejor fichero de test del repo**: monta su propia organización contra Postgres real y cubre descuento/devolución de bono, saldo que no baja de cero, no sobreventa, aviso a la lista de espera y **la carrera de dos avisados reclamando a la vez**.

**E2E (26 specs)**: camino feliz de agenda EP/grupo, series periódicas, reserva de staff, no-show con motivo, portal de reservas, bonos, alta comercial completa, plantilla, tareas, leads, gateo de planes.

#### Por qué han pasado los 32 hallazgos

**Ninguno de ellos toca una línea probada.** Los huecos, por riesgo:

1. **Ámbito de centro fuera de socios y cobros.** `staff-scope.test.ts` prueba el filtro de plantilla y nada más. **No hay ni un caso** que verifique que un `CENTER_DIRECTOR` recibe 404 en `/brief/<sesión ajena>`, `/feedback/<socio ajeno>` o `PATCH /agenda/sessions/<sesión ajena>` (W-01, W-04, W-07, M-01, M-04).
2. **`deleteSession`: cero cobertura**, ni unitaria ni e2e. Es la operación más destructiva de la agenda (W-02).
3. **Máquina de estados de `Booking`**: ningún caso comprueba que `CANCELLED`/`WAITLISTED` **no** pueden pasar a `ATTENDED` (W-03, M-06).
4. **Ventana de cancelación con penalización (RB-RES-005)**: `attendee-discard.test.ts` prueba la ventana **del entrenador**; la del **socio** no tiene ni un caso — y `e2e/portal-reservas.spec.ts:314` la menciona en un comentario y **la esquiva a propósito**.
5. **Gateo por plan**: `e2e/planes-gateo.spec.ts` solo prueba el **camino positivo**. No hay ningún caso con plan Esencial contra una ruta premium — **por eso W-05 y W-06 pasaron**.
6. **Paridad web↔móvil**: **cero tests de la API móvil**, ni Playwright ni `node:test`. Todo el bloque 8.2 se encontró leyendo y con `curl`.
7. **Ocupación con series recurrentes en el dashboard**: se prueba la rejilla, nadie prueba los KPIs (W-08).
8. **Zonas horarias en decisiones de negocio**: se prueban las funciones, nadie prueba que la decisión use la zona del **centro** y no la cookie (W-09).

#### Casos que faltan

*Unitarios (`node:test`, patrón `agenda-booking.test.ts` con fixture propia):*

| # | Fichero | Caso |
|---|---|---|
| U1 | `agenda-delete.test.ts` | borrar una sesión con reservas devuelve el bono a cada socio y deja `AuditLog` |
| U2 | `booking-state-machine.test.ts` | `setDebrief`/`toggleCheckIn`/feedback móvil **no** mueven `CANCELLED` ni `WAITLISTED` a `ATTENDED` |
| U3 | `portal-cancel-window.test.ts` | a `ventana + 1 min` devuelve el bono; a `−1 min` lo consume con `forfeited: true`; la lista de espera nunca reembolsa |
| U4 | `portal-cancel-window.test.ts` | la ventana se mide con `Center.timezone`, no con la cookie: mismo veredicto con `tz=America/Lima` |
| U5 | `brief-scope.test.ts` | `getSessionBrief` devuelve `null` fuera del ámbito de centro |
| U6 | `feedback-scope.test.ts` | `listMemberFeedback`/`getWeeklyDebriefReport` respetan `centerScopeFor` |
| U7 | `dashboard-occupancy.test.ts` | una serie semanal de 8 semanas con aforo 10 da ocupación por ocurrencia, no >100 % |
| U8 | `waitlist-positions.test.ts` | tras una baja en la cola, las posiciones ni se duplican ni dejan hueco |
| U9 | `entitlements.test.ts` | `orgHasFeature("ia_programacion")` es `false` en Esencial/Avanzado y la generación se rechaza **antes** de llamar a Anthropic |
| U10 | `no-show-alerts.test.ts` | la alerta de 3 faltas solo llega a la dirección del centro del socio |

*E2E / API (Playwright con `request.newContext()` contra `/api/mobile/v1`):*

| # | Spec | Caso |
|---|---|---|
| E1 | `mobile-agenda-scope.spec.ts` | un TRAINER de La Jota recibe 404 en POST/PATCH/DELETE de sesiones de Santander |
| E2 | `mobile-staff-scope.spec.ts` | `GET /staff` como dirección de La Jota no incluye personal de Santander |
| E3 | `mobile-health-scope.spec.ts` | recepción no recibe `feedbackAvg` en la ficha ni en el calendario |
| E4 | `brief-scope.spec.ts` | dirección de La Jota no ve sesiones de Santander en `/brief` ni las abre por URL |
| E5 | `planes-gateo.spec.ts` (ampliar) | con plan Esencial, las tres rutas hijas redirigen a `/planes`, y el endpoint móvil de brief responde 402/403 |
| E6 | `agenda-borrado.spec.ts` | tras borrar una sesión con 3 reservas, los 3 socios recuperan su sesión |
| E7 | `portal-cancelacion-tardia.spec.ts` | el socio cancela dentro de la ventana: la UI avisa **con el número real** y el bono baja |
| E8 | `mobile-parity.spec.ts` | reservar/cancelar la misma clase por web y por API produce el mismo estado y el mismo saldo |

### 8.4 Verificado y correcto

- **El núcleo de reserva es sólido**: lock `FOR UPDATE`, relectura del saldo dentro de la transacción, descuento condicional (`sessionsRemaining > 0` dentro del propio `UPDATE`), reclamo atómico de plaza de la lista de espera, y `StaffBookingError` lanzado **dentro** de la transacción para no confirmar un cobro sin reserva. Sin fallos.
- **RB-RES-009 (no-show)**: motivo obligatorio validado contra el enum, devolución cerrada sobre `noShowRefunded` (no se puede devolver dos veces), rectificación que vuelve a descontar sin dejar el bono en negativo.
- **Zonas horarias**: `zonedTimeToInstant` con doble pasada resuelve los cambios de hora; `isBirthdayOn` cubre el 29 de febrero; `addMonthsClamped` cubre el día 31.
- **Correcciones previas confirmadas como cerradas**: QA-PORTAL-01, QA-CRM-09, QA-MESO-02, y QA-COBROS-05 **solo parcialmente** (estado de plataforma sí, plan no → M-03).
- **`/api/jobs/run`**: falla cerrado sin secreto, comparación en tiempo constante, aislamiento por regla y organización, 207 con el detalle de fallos.
- **Mesociclos**: no se exponen al socio en **ningún** endpoint; límite 4-12 semanas idéntico en acción web, formulario y endpoint móvil.
- **Descarte de asistente móvil**: ámbito de centro correcto, permiso de override decidido por el token y **nunca** por el cuerpo, y todo el efecto en `AuditLog`.

## 9. Plan priorizado

Los once informes coinciden en más de lo que discrepan. Ordenados por lo que rompe primero.

### Bloque 0 — Bloqueantes antes de tocar dinero real o socios reales

| # | Acción | De dónde sale | Esfuerzo |
|---|---|---|---|
| 0.1 | **Pintar en el móvil las condiciones sin regla** y poner **ámbar por defecto** a toda condición sin regla asignada | §2.2 (riesgo profesional) | ~20 líneas |
| 0.2 | **Cerrar las zonas de lesión a un enum** con lateralidad como campo aparte, y contador *"esta regla afecta hoy a N socios"* en la pantalla de reglas | §2.2 | 2-3 d |
| 0.3 | **Espejar en Stripe congelar, cancelar y cambiar de importe**; y cambio de plan que actualice el ítem en vez de abrir una suscripción nueva | §5.1 (a, b), §2.3 | 3-5 d |
| 0.4 | **Los dos secretos de webhook** (BUG-3) y **plano 1 conciliado contra la API vigente** (BUG-1, BUG-2) | §5.1 | 1-2 d |
| 0.5 | **`isCenterInScope` en `getSessionBrief`** y en los tres handlers de agenda móvil (SEC-01, SEC-05) | §2.4 | 1 d |
| 0.6 | **Gatear la API móvil por plan** (`requireApiFeature` + `FEATURE_BY_ROUTE` móvil) | §1.2 M-01 | 1 d |
| 0.7 | **Consentimiento + capa informativa en `/lead-form`**, y minimizar el campo de salud a un booleano | §7 CN-01 | 1 d |
| 0.8 | **Gatear `MemberProgressEntry`** por `health-access.ts` y filtrar la sección `evolucion` para recepción | §7 CN-02 | 1 d |
| 0.9 | **Verificar la región de despliegue de Render** y moverla a la UE si está fuera | §7 CN-31 | 1-2 d |
| 0.10 | **`error.tsx` en `(app)/`** y en las cuatro rutas que más consultas arrastran | §4 | 0,5 d |
| 0.11 | **`saveMembershipPlan()` compartido**: el precio cambiado desde la app no invalida `stripePriceId` | §1.2 M-05 | 1 d |
| 0.12 | **Devolver el bono al borrar una sesión** (hoy se queman todos, sin aviso ni auditoría) | §8 W-02 | 0,5 d |
| 0.13 | **Máquina de estados de `Booking`**: `CANCELLED`/`WAITLISTED` no pueden pasar a `ATTENDED` — en los **cuatro** puntos de escritura | §8 W-03, M-06 | 0,5 d |
| 0.14 | **`requireFeature` en las rutas hijas** de los módulos premium, y gatear **`ia_programacion`** antes de llamar a la API de Claude | §8 W-05, W-06 | 1 d |
| 0.15 | **Ámbito de centro en `/feedback`, `/feedback/[id]`, `debriefs-semanales`, `GET /staff` móvil y el selector de socio de la agenda** | §8 W-04, W-07, M-04 | 1-2 d |
| 0.16 | **`feedbackAvg` fuera de las respuestas a recepción** (promedia dolor y movilidad) | §8 M-02 | 0,5 d |
| 0.17 | **DPA Apta ↔ centro** y **política de privacidad completa** | §7 CN-30, CN-06 | 2-4 sem. (jurídico) |

### Bloque 1 — Lo que promete y no cumple (barato de quitar, caro de dejar)

| # | Acción | De dónde |
|---|---|---|
| 1.1 | Apagar la **rutina de IA falsa** del portal (`buildMockRoutine` devuelve siempre las mismas tres sesiones, y el botón se bloquea para siempre tras el primer clic) | §1.1 W-01, §2.3 |
| 1.2 | Quitar el **"responde al instante"** del chat, o remontar `StaffChatThread` y darle notificación | §1.1 W-02 |
| 1.3 | Retirar el plan/biblioteca **ONLINE** del catálogo vendible: no hay pantalla para subir un vídeo | §2.3 |
| 1.4 | **Ventana de cancelación desde el servidor**: la app dice 12 h y el servidor aplica 24 h, en tres pantallas | §1.2 M-07, §2.1 |
| 1.5 | **"/mes" y "siguiente cobro" derivados de `isRecurring(planType)`**: el dato ya viaja y no se usa | §1.2 M-08 |
| 1.6 | Quitar el **número falso de lista de espera** (no se renumera y no hay promoción), o hacerlo real | §2.1 |
| 1.7 | Quitar el badge **"Más elegido"** automático al primer producto y los **testimonios inventados con nombre y cargo** | §2.1, §3 A.15 |
| 1.8 | Corregir el texto del diálogo de borrado de socio, que promete una anonimización que no ocurre | §7 CN-05 |
| 1.9 | No mandar el email de "se ha liberado una plaza" al limpiar el roster de una **sesión ya pasada** | §8 W-15 |
| 1.10 | Sacar `OUR_ERROR` de las faltas que suman a la racha: hoy dirección recibe *"3 faltas sin avisar"* de un socio al que **el centro** citó mal | §8 W-17 |
| 1.11 | Alinear la documentación con el código: `RB-RES-008` (domingo), `RB-PAGO-008` (quién ajusta saldo) y `RB-AGENDA-009` (ventana de descarte, hoy sin documentar) | §8 W-10, W-16, M-08 |

### Bloque 2 — Lo que el socio nota cada semana

| # | Acción |
|---|---|
| 2.1 | **Gestionar suscripción y darse de baja desde dentro** del portal y de la app (el endpoint ya existe y ninguna pantalla lo llama) |
| 2.2 | **Precio de la cuota, próximo cobro y recibos** en "Mi membresía" |
| 2.3 | **Recordatorios de sesión** (24 h y 2 h antes). Sin push, al menos por email: hoy **no existe plantilla de recordatorio en ningún canal**, y la regla penaliza no avisar |
| 2.4 | **Saldo del bono y próxima sesión en la primera pantalla** de la web (hoy viven en un cajón detrás de la hamburguesa en móvil) |
| 2.5 | **Política de cancelación en la tarjeta de la clase**, antes de reservar |
| 2.6 | **Congelar el bono** desde el portal (existe en el modelo, solo lo toca el staff) |
| 2.7 | Adelgazar el **muro de alta de 7 campos** justo después de pagar |
| 2.8 | Dejar entrar a la app **sin bono vivo**, en modo lectura |

### Bloque 3 — Lo que el entrenador necesita para trabajar

| # | Acción |
|---|---|
| 3.1 | **No-show en el móvil** (motivo + decisión de devolución), y que **desmarcar desmarque de verdad** (hoy el estado local se pone a `null` y no se manda nada al servidor: el socio pierde la sesión) |
| 3.2 | **Un único canal de debrief**: verde/ámbar/rojo con el color puesto por el dedo, no promediado. Los ocho ejes salen del flujo de sala y pasan a valoración periódica desde la ficha |
| 3.3 | **Matar el feedback mensual de nueve deslizadores** (270 deslizadores al mes con 30 socios) |
| 3.4 | **Rangos de composición neutros por sexo y edad, o ninguno**: hoy el defecto son los de un hombre de 28 años y marcan `critical` a una mujer de 52 con un 29 % de grasa, **en su propio portal** |
| 3.5 | **La valoración incorpora movimiento**: siete patrones ejecuta/regresión/no ejecuta, tres chequeos de movilidad, y kilos de referencia por patrón |
| 3.6 | **`startDate` y `deload` en el mesociclo**, y registro de la carga del ejercicio principal en el debrief de EP |
| 3.7 | **Derivación a fisio como registro de primera clase**, con bloqueo del perfil Rehabilitación sin alta o informe |
| 3.8 | **Cumplir la promesa de seudonimización** (filtro de identificadores sobre el texto libre) o ajustar el texto y subir `CONSENT_VERSION` |

### Bloque 4 — Producto y negocio

| # | Acción |
|---|---|
| 4.1 | **Reempaquetar precios**: matar o subir Esencial, IA con cupo en Avanzado, Élite hasta 10 centros, Fundador con cupo real y fecha pública. **Coste cero, mueve ingresos el mismo día** |
| 4.2 | **Poner "cero comisión sobre tus cobros" en grande en `/planes`**: es la frase más vendedora del producto y está escondida en un documento interno |
| 4.3 | **Menú a 5 secciones** (Hoy / Socios / Dinero / Crecer / Ajustes). Hoy el OWNER tiene 15 entradas, cinco de ellas configuración disfrazada de módulo |
| 4.4 | **WhatsApp `wa.me`** con mensaje pre-escrito desde retención, impago y lead. Días, no semanas, y cero infraestructura |
| 4.5 | **Decidir sobre la app nativa**: congelarla y hacer PWA del portal, o recortarla a dos roles (socio y entrenador) y meter push. **Una app de RRHH no tiene tesis** |
| 4.6 | **Exportación CSV de socios y cobros**: se cobra en el plan Avanzado y no existe |
| 4.7 | **Enseñar las URLs públicas del centro** en la puesta en marcha: hoy el embudo comercial completo solo es alcanzable escribiendo la URL a mano |
| 4.8 | **Ventana mínima de cancelación + QR de check-in**: el foso (semáforo, brief, retención) vale lo que valgan los datos de asistencia, y hoy los mete el staff a mano |

### Bloque 5 — SEO, accesibilidad y mapa

| # | Acción |
|---|---|
| 5.1 | **Excluir `robots.txt`, `sitemap.xml` y `/.well-known/*` del matcher del proxy**, y crear `robots.ts` + `sitemap.ts`. Hoy `robots.txt` redirigiría a `/login` |
| 5.2 | **`noindex` en las seis rutas con token firmado**: un `/gestionar-suscripcion/<token>` indexado es acceso sin contraseña al método de pago de una persona |
| 5.3 | **`generateMetadata` por centro** + NAP en el modelo (`phone`, `city`, `postalCode`, `description`, `publicPage`). Sin texto propio por centro, la plantilla compartida sigue siendo contenido duplicado |
| 5.4 | **`metadataBase` + OG + `src/lib/site.ts`**: hoy "Training Zone" está incrustado en 4 títulos públicos y una docena de remitentes |
| 5.5 | **`Field` con `htmlFor`/`aria-invalid`/`aria-describedby`** en web y móvil: **un fichero cada una, 245 sitios** |
| 5.6 | **Contraste de los tokens gris/oro** en las dos superficies y tint de la barra de pestañas (hoy 2,20:1 sobre blanco) |
| 5.7 | **`inert` y trampa de foco** en `Drawer` y `Sidebar`; `<h1>` real en el header; enlace de salto al contenido |
| 5.8 | **Mapa: filtrar estado de socio y de lead, clasificar por cuantiles, y ser honesto sin centros situados.** Sin esto, tres de las seis métricas no son defendibles ante dirección |
| 5.9 | **`FlatList` en las cuatro listas largas** de la app nativa |
| 5.10 | **Analítica y Search Console**: hoy no se mide nada, y cualquier trabajo de SEO sin GSC es opinión |

### Bloque 6 — Cerrar los huecos de prueba que dejaron pasar todo esto

Ninguno de los 32 fallos de QA toca una línea probada. Los diez casos unitarios (U1-U10) y los ocho E2E/API (E1-E8) del §8.3 están especificados y listos para escribir. Los cuatro que más valor tienen por sí solos:

| # | Caso | Qué cierra |
|---|---|---|
| 6.1 | `mobile-agenda-scope.spec.ts` — un TRAINER de un centro recibe 404 en POST/PATCH/DELETE de sesiones de otro | M-01, la fuga más barata de explotar |
| 6.2 | `agenda-delete.test.ts` — borrar una sesión con reservas devuelve el bono a cada socio | W-02, hoy con **cero cobertura** |
| 6.3 | `booking-state-machine.test.ts` — las transiciones prohibidas se rechazan | W-03/M-06 |
| 6.4 | `planes-gateo.spec.ts` ampliado con el **camino negativo** (hoy solo prueba el positivo) | W-05, W-06, M-03 |

Y una regla estructural: **cero tests de la API móvil hoy**. Mientras no exista al menos un spec por familia de endpoints, la paridad web↔móvil seguirá rompiéndose en silencio — es el origen de nueve de los hallazgos de este informe.

### Deuda de mantenimiento que conviene saldar de paso

`SERVICE_LABEL` está definido **ocho veces** con cuatro nombres distintos para lo mismo · `createSubscriptionFromPlan()` compartido (cinco copias, una regala sesiones ilimitadas) · borrar `_lib/dashboard.ts` y servir los KPI canónicos (hoy web y móvil dan **8 y 9 morosos** para la misma organización) · borrar `api/mobile/v1/portal/billing/` (sin consumidor) · `react-leaflet` en `dependencies` sin importarse en ningún fichero · los cinco SVG de plantilla de Next en `public/` · `OFF_NAV_TITLES` de tres rutas muertas · `override` para `mysql2` (vulnerabilidad alta, arrastrada por Prisma y **no ejecutada** al usar el adaptador de Postgres).

### Lo que explícitamente NO hay que hacer ahora

Reescribir la agenda · vista por sala · VERI\*FACTU (aplazado a enero de 2027) · Stripe Terminal · reactivar fichajes · más BI · más pantallas móviles · más dimensiones de feedback · basemap propio · isócronas reales.

