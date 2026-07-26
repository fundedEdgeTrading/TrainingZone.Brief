# Análisis exhaustivo de faltas de implementación y funcionalidad

> Auditoría del código real (no de los documentos de plan): `src/app/**`,
> `src/lib/**`, `prisma/schema.prisma`, `prisma/seed.ts`, `e2e/**`, `src/proxy.ts`.
> Cada fila apunta al archivo/línea que la respalda. Fecha: 2026-07-25.
>
> Método: (1) recorrido de rutas y server actions; (2) cruce de los 100 identificadores
> `RB-*` definidos en `docs/` contra los 72 citados en el código; (3) cruce de los 42
> modelos de `schema.prisma` contra su uso real en `src/` (modelos que solo aparecen en
> el seed = funcionalidad sin construir); (4) verificación de flujos extremo a extremo
> (alta → cobro → reserva → asistencia → feedback).

**Severidad:** **P0** bloquea un flujo real · **P1** degrada el uso diario · **P2** hueco
notable · **P3** deuda técnica / consistencia.

---

## A. Bloqueantes de flujo (P0)

| # | Área | Qué falta / qué está roto | Evidencia | Impacto |
|---|---|---|---|---|
| A1 | Alta self-service | `/signup` **no está en las rutas públicas** del proxy: un visitante anónimo que pulsa "Da de alta tu gimnasio" en el login es rebotado a `/login`. `/register` sí es pública, pero solo redirige a `/signup` | `src/proxy.ts:12` vs `src/app/login/page.tsx:66`, `src/app/register/page.tsx:7` | El registro de organización es inalcanzable sin sesión previa |
| A2 | Catálogo comercial | **`MembershipPlan` no tiene CRUD**: ni crear, ni editar precio, ni archivar. Solo hay lecturas | sin `membershipPlan.create/update/delete` en todo `src/` | Un gimnasio real no puede dar de alta sus cuotas ni bonos; los planes solo existen si los crea el seed |
| A3 | Feedback dirección | `ClientFeedback` y `TrainerDebrief` **no se escriben nunca desde la app** (solo el seed los puebla). La vista `/feedback` filtra por `trainerDebriefs: { some: {} }` | `src/lib/feedback-queries.ts:81,87`; `prisma/seed.ts:1822-1823` (únicas escrituras) | El módulo estrella de contraste cliente⟷entrenador queda **permanentemente vacío** en una instalación real |
| A4 | Feedback dirección | Las tres acciones del board (**Solicitar feedback**, **Marcar revisado**, **Programar seguimiento**) son *no-ops*: solo insertan una fila de `AuditLog` | `src/app/(app)/feedback/actions.ts:22-48` | Botones que aparentan actuar y no envían, ni marcan estado, ni agendan nada |
| A5 | Cobros | **No hay cobro recurrente**: checkout en `mode: "payment"` (pago puntual) y webhook de la cuenta conectada solo escucha `checkout.session.*` y `account.updated`. Sin `customer.subscription.*`, sin mandato SEPA, sin Bizum, sin dunning ni reintentos (`RB-PAGO-008/009/010/012`) | `src/lib/stripe-checkout.ts:27`; `src/app/api/stripe/webhook/route.ts:44-63` | La "suscripción" vive solo en la BD: **nadie cobra el mes siguiente**. `PaymentMethod.SEPA/BIZUM` existen en el enum sin flujo detrás |
| A6 | Cobros | **Devolución vía Stripe bloqueada por diseño**: si el pago tiene `stripePaymentIntentId`, la acción rechaza. La devolución "local" solo cambia el estado en BD, no mueve dinero | `src/app/(app)/billing/subscription-actions.ts:75-80` | Un cobro por Stripe no se puede devolver desde el producto |
| A7 | Portal del socio | El socio **no puede pagar ni renovar** desde el portal: cuando agota el bono se le devuelve `needsTopUp` y un aviso, sin ningún camino de compra (`RB-PAGO-013`, Customer Portal, no existe) | `src/app/(app)/portal/agenda/actions.ts:80`; `src/app/(app)/portal/agenda/page.tsx:34` | Se corta la reserva sin ofrecer la solución; obliga a intervención manual de recepción |
| A8 | Facturación | Sin **VERI\*FACTU**, sin factura/recibo PDF, sin serie ni rectificativa. `receiptNumber` es una cadena generada (`STRIPE-<id>`) | `src/lib/stripe-checkout.ts:64`; sin ningún generador de PDF en el repo | El gimnasio no puede emitir comprobante conforme; declarado fuera de alcance pero es bloqueante para operar |
| A9 | Autenticación | **Sin recuperación de contraseña** (ni "olvidé mi contraseña", ni reset). SSO Microsoft/Google declarado pero apagado sin credenciales | sin resultados de `forgot|reset` en `src/`; `src/auth.config.ts` | Cualquier usuario que olvide la clave queda fuera y no hay vía de recuperación en producto |
| A10 | Comunicación | **Ningún canal real**: sin WhatsApp/SMS/push; el email cae a `console.log` si no hay SMTP; las notificaciones son server-render sin polling ni realtime (solo se refrescan al navegar) | `src/lib/mailer.ts:41-47`; `src/app/(app)/notification-bell.tsx` (sin `setInterval`/stream) | Alertas de retención, invitaciones de staff, onboarding de socio y avisos **no llegan** al destinatario |
| A11 | Automatización | Todas las reglas temporales (24h sin responsable, pocas sesiones, bono bajo, estancamiento, check-ins, sugerencias de oferta, cancelaciones programadas) dependen de un **cron externo que no está programado**; además, si `JOBS_CRON_SECRET` no está definido, el endpoint queda **abierto sin autenticación** | `src/app/api/jobs/run/route.ts:23` (`if (secret && ...)`), `src/proxy.ts:12` (`/api/jobs` es pública) | Sin scheduler, la capa "inteligente" no se ejecuta nunca; y con la variable sin definir, cualquiera puede dispararla |

---

## B. Agenda y asistencia — el corazón operativo (P0/P1)

| # | Área | Qué falta / qué está roto | Evidencia | Impacto |
|---|---|---|---|---|
| B1 | Recurrencia | Las series recurrentes **solo se proyectan visualmente**: hay una única fila `ClassSession` con `recurrence`/`recUntil`, y reservas, aforo, check-in y debrief cuelgan de ella. No se materializan ocurrencias por fecha | `src/lib/agenda-queries.ts:42-60`; `src/app/(app)/agenda/session/[id]/page.tsx:58`; `src/app/(app)/agenda/agenda-utils.ts` (`instanceForWeek`) | Una clase semanal comparte lista de asistentes entre todas sus fechas: la asistencia por día es incorrecta |
| B2 | Recurrencia | El portal del socio lista **solo filas físicas** dentro de la ventana de fechas → las clases recurrentes creadas hace semanas **no aparecen como reservables** | `src/lib/portal-queries.ts:253-264` | El socio no ve la oferta real de clases |
| B3 | Reservas | **La lista de espera no promociona**: al cancelar una reserva nadie pasa de `WAITLISTED` a `BOOKED` ni recibe aviso | `src/app/(app)/portal/agenda/actions.ts:114-142` | Plazas liberadas que se quedan vacías; el aforo no se rellena |
| B4 | Reservas | **Sin ventana mínima de cancelación**: `cancelMyBooking` no comprueba la fecha/hora de la sesión y devuelve la sesión al bono siempre | `src/app/(app)/portal/agenda/actions.ts:118-140` | Un socio puede cancelar después de la clase y recuperar el bono (no-show gratis) |
| B5 | Agenda | Faltan **vista mes**, vista por sala/recurso y edición madura de series (editar "esta ocurrencia" vs "toda la serie"). El calendario es propio (509 líneas) y `react-big-calendar` está instalado **sin usarse** (dependencia muerta) | `src/app/(app)/agenda/agenda-view.tsx` (509 líneas); `package.json` (`react-big-calendar`) sin imports | Superficie de bugs alta en la pantalla donde el staff pasa el día; deps de peso sin uso |
| B6 | Agenda | **`SessionTemplate` está modelado y sembrado pero no se usa en la app**: no hay gestión de horario/plantillas de clases | `prisma/seed.ts:387` es la única escritura; sin lecturas en `src/` | El cuadrante semanal hay que crearlo sesión a sesión |
| B7 | Asistencia | Check-in **100 % manual** (entrenador/recepción marcando). Sin QR en el portal, sin kiosko, sin torno/NFC | `src/app/(app)/agenda/session/[id]/checkin-button.tsx`; sin resultados de `qr|kiosk|nfc` en `src/` | La calidad del dato que alimenta retención y semáforo depende de la disciplina del staff |

---

## C. Gestión de datos, RGPD y administración (P1/P2)

| # | Área | Qué falta / qué está roto | Evidencia | Impacto |
|---|---|---|---|---|
| C1 | Socios | Listado con **tope duro `take: 300` y sin paginación** | `src/lib/members-queries.ts:32` | Un centro con más de 300 socios pierde filas en silencio |
| C2 | Exportación | **No hay ninguna exportación**: ni CSV ni PDF de socios, cobros, dashboard o auditoría (solo existe la *importación* CSV) | sin `text/csv`/`application/pdf` de salida en `src/` | El cliente no puede sacar sus datos ni entregar nada a la gestoría |
| C3 | Auditoría | Vista de **200 registros fijos**, sin filtros, búsqueda, rango de fechas, paginación, exportación ni política de retención | `src/app/(app)/audit/page.tsx:19-22` | El log Art. 9 es inauditable en cuanto crece |
| C4 | RGPD | Sin **baja/anonimización de socio** ni **portabilidad** (exportar sus datos). Los consentimientos solo se firman en el onboarding y **no se pueden revocar ni actualizar** después (la ficha solo los muestra) | `src/app/onboarding/[token]/actions.ts:83-91`; `src/app/(app)/members/[id]/member-forms.tsx:186-188` | Derechos de supresión, portabilidad y retirada de consentimiento no ejercitables desde el producto |
| C5 | Organización | No se puede **editar ni eliminar un centro** (solo su logo), ni **cambiar el rol** de una persona, ni desactivarla/darla de baja (solo quitar su imputación a un centro) | `src/app/(app)/organization/actions.ts:50-181` | La estructura organizativa es prácticamente inmutable tras el alta |
| C6 | Suscripciones | Sin alta/renovación/cambio de plan de un socio existente desde la ficha: solo congelar, reanudar, cambiar precio, producto puntual y cancelación programada. La creación ocurre únicamente al invitar al socio | `src/app/(app)/billing/subscription-actions.ts`; `src/lib/invitations.ts:123-125` | Renovar un bono agotado o migrar de plan exige tocar la BD |
| C7 | Geo/BI | `PostalCodeArea` **solo tiene datos de Zaragoza** (45 líneas sembradas desde `postal-codes-zaragoza.ts`) y no hay UI para gestionarla | `src/lib/postal-codes-zaragoza.ts:1-20`; `src/lib/dashboard-queries.ts:258` | Cualquier cliente fuera de Zaragoza ve el mapa de calor vacío |

---

## D. Inteligencia y diferenciadores a medias (P1/P2)

| # | Área | Qué falta / qué está roto | Evidencia | Impacto |
|---|---|---|---|---|
| D1 | IA | El **agente de programación está mockeado**: `buildMockRoutine` devuelve siempre la misma rutina de 3 días, sin proveedor LLM | `src/lib/workout-programs.ts:12-20` | La "rutina generada por IA" es un texto fijo; el flujo humano sí está bien montado |
| D2 | Valoración de entrenadores | `TrainerRating.strengths` / `improvements` **nunca se rellenan**: el portal solo envía `score`, cuando `RB-FB-103` pide feedback cualitativo | `src/app/(app)/portal/plan/actions.ts:67`; `prisma/schema.prisma:1077-1078` | La parte cualitativa —la que da valor a dirección— es esquema muerto |
| D3 | BI | Falta el bloque financiero completo `RB-BI-012…022`: **MRR, previsión de próximo cobro, impagos, neto y comisiones, ROI de descuentos, conversión prueba→pago, € recuperado**. El dashboard cubre LTV/ticket, demografía, canales, ocupación y ranking | `src/lib/dashboard-queries.ts` (19 queries, ninguna de MRR/neto/impagos) | Dirección no ve la foto financiera que justifica la compra |
| D4 | Cobros/ofertas | `PersonalizedOffer` aprobada **no se materializa** en cupón/descuento real ni se mide (`RB-PAGO-015`, `RB-BI-018`) | `src/app/(app)/offers/actions.ts:30-48` (solo cambia estado) | La oferta se "comunica" a mano; su efecto no es medible |
| D5 | Leads | El **cierre online automático** está marcado en la propia UI como *"Flujo pendiente de implementación"* | `src/app/(app)/leads/new-lead-drawer.tsx:78` | Hueco reconocido: la venta 100 % autoservicio no genera lead cerrado |
| D6 | Reglas | 34 de las 100 reglas `RB-*` documentadas **no aparecen citadas en el código**, concentradas en pagos (`RB-PAGO-008…019`) y BI (`RB-BI-012…022`) | cruce `docs/` ⟷ `src/` | Medida objetiva del hueco entre negocio documentado y producto construido |

---

## E. Calidad, robustez y consistencia (P2/P3)

| # | Área | Qué falta / qué está roto | Evidencia | Impacto |
|---|---|---|---|---|
| E1 | Tests | **Cero tests unitarios** y **sin CI**: solo 6 specs e2e de Playwright y no hay `.github/` | `e2e/*.spec.ts` (6 archivos); sin `.github`; sin `vitest`/`jest` en `package.json` | La lógica crítica (aforo, bonos, retención, cobros) no tiene red de seguridad |
| E2 | Robustez UI | **Sin `error.tsx`, `global-error.tsx` ni `not-found.tsx`** en ninguna ruta; `loading.tsx` solo en 8 de ~25 rutas (faltan leads, offers, feedback, health, audit, organization, rrhh, anuncios) | `find src -name "error.tsx"` → 0 | Cualquier excepción de servidor muestra la pantalla genérica de Next, sin recuperación |
| E3 | Multi-tenant | `ClientFeedback` y `TrainerDebrief` **no llevan `orgId`** (el aislamiento depende de navegar por `Member`), rompiendo la convención del resto del esquema | `prisma/schema.prisma:520-555` | Riesgo de fuga si alguna futura consulta parte del feedback en vez del socio |
| E4 | RBAC | `/trainer` está restringido a `TRAINER` (dirección no puede ver el panel de su equipo); reglas de aptitud y rangos de composición son **solo `OWNER`** aunque `CENTER_DIRECTOR`/`TRAINER` sí pueden ver salud; `HR_MANAGER` no tiene panel de control | `src/app/(app)/trainer/page.tsx:25`; `health/*/page.tsx` (`requireRole(["OWNER"])`); `src/lib/rbac.ts` (NAV) | Supervisión y configuración clínica quedan cuelladas de botella en un único rol |
| E5 | UX | Plan UX premium a medias: `agenda-view` no usa ninguna primitiva de `src/components/ui/*`, `billing`/`retention` apenas dos; móvil de staff mínimo (`mobile-nav.tsx`), drag-and-drop no táctil; sin PWA/instalable ni app nativa (solo plan) | `docs/UX_PREMIUM_PLAN.md`; `src/app/(app)/mobile-nav.tsx`; sin `manifest.json` ni service worker | Dos generaciones visuales conviviendo; el equipo operativo trabaja en la peor |
| E6 | Puesta en marcha | Ninguna variable de entorno operativa está resuelta en este entorno: SMTP, `STRIPE_*`, `JOBS_CRON_SECRET`, SSO | `.env.example` (18 claves, todas de ejemplo) | La instalación "encendida" es trabajo pendiente aparte del código |
| E7 | Documentación | Deriva doc⟷código en ambos sentidos: `RB-FB-104` se declara "no construido" pero `/feedback/debriefs-semanales` existe; `MVP_PILOTO_GIMNASIO_ANALISIS.md` §3.4 dice que el mapa está hardcodeado cuando ya se resuelve por tabla `PostalCodeArea` | `src/app/(app)/feedback/debriefs-semanales/page.tsx`; `src/lib/dashboard-queries.ts:258` | Los documentos de estado no son fiables como fuente de verdad |

---

## Resumen por severidad

| Severidad | Nº | Concentración |
|---|---|---|
| **P0** — bloquea un flujo real | 13 | Cobro recurrente y devoluciones, alta self-service inaccesible, feedback sin captura, comunicación y cron apagados, recurrencia de agenda |
| **P1** — degrada el uso diario | 12 | Lista de espera, cancelaciones, catálogo de planes, paginación de socios, exportaciones, ciclo de vida de suscripción |
| **P2** — hueco notable | 11 | BI financiero, RGPD operativo, administración de organización, geo fuera de Zaragoza, UX/móvil |
| **P3** — deuda | 6 | Tests/CI, límites de error, `orgId` faltante, dependencias muertas, deriva documental |

## Los tres arreglos de mayor retorno inmediato

1. **A1** — añadir `/signup`, `/verificar-email` y `/activar` a `PUBLIC_PATHS` (`src/proxy.ts:12`): una línea, desbloquea el alta self-service completa.
2. **A3+A4** — construir la captura de `ClientFeedback` (portal) y `TrainerDebrief` (post-sesión del entrenador), y convertir las tres acciones del board en algo con efecto: sin esto, el módulo diferencial solo funciona con datos de demo.
3. **B1+B2+B3** — materializar ocurrencias recurrentes y promocionar la lista de espera: es donde la agenda deja de contar la verdad sobre asistencia y aforo.
