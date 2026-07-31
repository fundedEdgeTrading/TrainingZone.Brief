# Reglas de negocio — estado real de implementación y bloqueos

**Fecha del corte:** 2026-07-31 · **Sustituye a:** `ANALISIS_FALTAS_IMPLEMENTACION.md` (desactualizado:
varios de sus P0 se cerraron en los 6 días posteriores a su redacción).

**Método:** tres pasadas independientes de auditoría (leads/perfil/agenda/IA/chat · pagos/RGPD/RRHH/BI/feedback ·
capa comercial Apta/composición corporal/app móvil/UX) que cruzan cada regla `RB-*` de `CRM_REGLAS_NEGOCIO.md` y
`PLAN_IMPLEMENTACION_APTA_COMERCIAL.md` contra el **código real en `HEAD`**, no contra lo que dicen los documentos
de plan. Cada fila cita `archivo:línea`. No se ha confiado en ninguna columna "Estado" de un documento anterior sin
verificarla de nuevo contra el código.

**Leyenda de estado:** ✅ construido y en uso · ⚠️ parcial (existe pero con hueco o desviación) · ❌ no construido.

**Leyenda de bloqueo:** 🔑 credencial/proveedor externo · 📋 decisión de negocio pendiente · 🧱 backlog puro (nadie
lo ha empezado, no depende de nada externo) · 🏛️ decisión de arquitectura ya tomada (diverge del documento a
propósito, no es un olvido).

---

## 0. Resumen ejecutivo

**La imagen ha cambiado mucho en una semana.** `CRM_IMPLEMENTACION_FUNCIONALIDADES.md` describe el CRM interno
(leads, ficha EP/online, agenda autorreservable, IA, RRHH, chat) como prácticamente 0% construido (fases F8–F17
"❌"). Eso ya **no es cierto**: leads, ficha de cliente, agenda EP, RRHH (fichaje, propuestas, panel del
entrenador, ofertas personalizadas, valoración confidencial), BI demográfico/financiero y la infraestructura de
notificaciones/cron están **construidos y en uso**. Del mismo modo, `PLAN_IMPLEMENTACION_APTA_COMERCIAL.md` §6
marca F5 (cobro recurrente) y F6 (autoservicio del socio) como "⏳ Pendiente" — también están **hechas**, con
commits posteriores a esa tabla.

Lo que de verdad queda abierto se concentra en seis bolsas:

| # | Bolsa | Por qué importa |
|---|---|---|
| 1 | **IA real** | Las tres piezas de IA (rutina para casa, agente de programación de staff, recomendación sobre autovaloración) están construidas de punta a punta *excepto* la propia IA: no hay proveedor LLM conectado en ningún punto del repo. `buildMockRoutine` devuelve siempre lo mismo; `aiRecommendation` nunca se escribe; el agente de programación de staff (RB-IA-002) ni siquiera tiene mock — no se ha empezado |
| 2 | **Feedback diferencial cliente↔entrenador** | `ClientFeedback`/`TrainerDebrief` — el tablero que compara la percepción del cliente con la del entrenador — solo lo rellena el seed. Nunca se escribe desde la app real, y los tres botones de acción del tablero son no-ops que solo dejan un `AuditLog`. Sigue siendo el hueco que ya señalaba la auditoría anterior, confirmado de nuevo hoy |
| 3 | **Ciclo de vida de Stripe incompleto** | Congelar/cancelar una suscripción localmente **no cancela nada en Stripe**: Stripe sigue cobrando la tarjeta aunque el sistema diga que está congelada. La devolución local tampoco está bloqueada de forma consistente para pagos recurrentes de Stripe (sí lo está para los puntuales) |
| 4 | **Agenda: lista de espera y ventana de cancelación** | Al cancelar una reserva, nadie de la lista de espera pasa a `BOOKED` automáticamente. No hay ventana mínima de cancelación: un socio puede cancelar segundos antes de clase y recuperar el bono. Ambos confirmados de nuevo contra el código actual |
| 5 | **RGPD operativo** | Sin portabilidad de datos (el socio no puede exportar los suyos), sin revocación de consentimientos tras el alta inicial, sin paginación/filtros/exportación en la vista de auditoría |
| 6 | **Deriva documental** | Varios documentos activamente mienten sobre el estado actual (ver §14). Esto no es un hueco de producto, pero cualquier plan que se apoye en esos documentos sin verificar el código va a perder tiempo redescubriendo trabajo que ya existe |

Fuera de esas seis bolsas, el resto de huecos reales son puntuales y están marcados fila a fila abajo.

---

## 1. CRM de Leads

| Regla | Estado | Evidencia | Bloqueo |
|---|---|---|---|
| RB-LEAD-001 (obligatorios bloqueantes) | ✅ | `src/lib/leads-queries.ts:98-103`; `src/app/lead-form/[orgSlug]/[centerSlug]/public-lead-form.tsx:44-113` | — |
| RB-LEAD-002 (alta por teléfono sin email, reset por SMS) | ⚠️ | Lead permite email opcional (`prisma/schema.prisma:992`), pero `Identity.email` sigue `@unique` no-nulo (`schema.prisma:150`); `initiateLeadConversion` bloquea sin email (`leads-queries.ts:204`); reset de contraseña es solo por email (`src/app/recuperar-clave/actions.ts`) | 🔑 necesita proveedor SMS (Twilio/Vonage, ninguno en `.env.example`) + 📋 decisión: rediseñar `Identity` para permitir cuenta con teléfono como identificador primario |
| RB-LEAD-003 (responsable auto/reasignable) | ✅ | `src/app/(app)/leads/actions.ts:43-67` | — |
| RB-LEAD-004 (canal configurable) | ✅ | `LeadChannel` `schema.prisma:959-969`; UI `lead-config-panel.tsx:23-31` | — |
| RB-LEAD-005 (cierre solo con pago confirmado) | ⚠️ | Flujo núcleo hecho: `initiateLeadConversion`→`confirmLeadClosureForMember` disparado desde el webhook de Stripe (`src/lib/stripe-checkout.ts:101`). Pero el cobro manual (efectivo/tarjeta en mostrador) también confirma cierre (`src/app/(app)/billing/actions.ts:16-42`, puente explícito por comentario) y la compra online de autoservicio (`/hazte-socio`) **crea el `Member` sin pasar por `Lead`** — la propia UI lo marca: "Flujo pendiente de implementación" (`src/app/(app)/leads/new-lead-drawer.tsx:76`) | 🧱 crear `Lead(closeType=ONLINE)` en el flujo de `/hazte-socio` antes de crear el `Member` — backlog puro, nadie lo ha empezado |
| RB-LEAD-006 (no se borra, pasa a histórico) | ✅ | `leads-queries.ts:174-181` | — |
| RB-LEAD-007 (traslado de datos lead→member) | ✅ | `leads-queries.ts:239-245` | — |
| RB-LEAD-008 (bitácora) | ✅ | `LeadNote` `schema.prisma:1023-1037`; `leads-queries.ts:183-189` | — |
| RB-LEAD-009 (alerta 24h sin responsable) | ✅ lógica / ⚠️ disparo | `runLeadOwnerAlertRule` `leads-queries.ts:285-314`; wired en `src/app/api/jobs/run/route.ts:18-54` | 🔑 la ruta necesita un llamador cron externo (Vercel Cron u otro) — no hay `vercel.json` ni programación en el repo, así que hoy **no se dispara sola** |
| RB-LEAD-010 (CP + mapa) | ✅ | `Lead.postalCode` con regex 5 dígitos; `src/app/(app)/dashboard/postal-heatmap.tsx` (Leaflet) | 📋 geocodificación limitada a Zaragoza — ver §12 |
| RB-LEAD-011 (motivo de no cierre obligatorio) | ✅ | `leads-queries.ts:174-181`; `NoCloseReason` `schema.prisma:973-983` | — |

---

## 2. Perfil de cliente activo

| Regla | Estado | Evidencia | Bloqueo |
|---|---|---|---|
| RB-PERFIL-001 (EP/grupos/online, secciones condicionales) | ✅ | `getMemberServiceKinds` `src/lib/members-queries.ts:63-95`; `PlanType.ONLINE` `schema.prisma:495` | — |
| RB-PERFIL-002 (entrenador responsable explícito) | ⚠️ | **`Member.trainerId` no existe.** Reemplazado a propósito por un cálculo de "quién le ha entrenado/dirigido recientemente" (`schema.prisma:328-330`, y el mismo patrón se repite en `src/lib/chat.ts:6-10`, `src/lib/workout-programs.ts:33-34`, `src/lib/stall-detection.ts:101-102`, `src/lib/checkin-schedule.ts:73-76`) | 🏛️ pivote de arquitectura consciente, no un olvido — pero **diverge de la decisión §11.4 ya cerrada** ("entrenador individual asignado explícitamente"). Vale la pena una decisión explícita: ¿se re-abre §11.4 y se añade el campo fijo, o se documenta el cambio como nueva decisión? |
| RB-PERFIL-003 (objetivos de salud concretos, catálogo editable) | ✅ | `ClientGoal` `schema.prisma:473-487`; `src/lib/members-queries.ts:161-185` | — |
| RB-PERFIL-004 (Art. 9, acceso restringido) | ⚠️ | Auditado y gateado por consentimiento (`src/lib/health-access.ts:11-45,141-194`) | 🏛️ mismo efecto colateral que RB-PERFIL-002: como no hay entrenador fijo, el acceso se concede a **cualquier `TRAINER` del centro**, no solo al "asignado" |

---

## 3. Agenda y reservas

| Regla / gap | Estado | Evidencia | Bloqueo |
|---|---|---|---|
| RB-AGENDA-001 (visibilidad segmentada EP/grupos) | ✅ | `getBookableSessions` `src/lib/portal-queries.ts:281-326` | — |
| RB-AGENDA-002 (reserva manual EP / franja autorreservable) | ✅ | `saveSession` `src/lib/agenda-queries.ts:66-143`; `createEpSlot:221-248` | — |
| RB-AGENDA-003 (check-in EP y grupo) | ✅ | `src/app/(app)/agenda/session/[id]/actions.ts:39-48` | — |
| RB-AGENDA-004 (entrenador que dirige ≠ asignado) | ✅ | `ClassSession.directedByUserId` `schema.prisma:663`; `setSessionDirector` `agenda-queries.ts:250-256` | — |
| RB-AGENDA-005 (confirmación + recordatorio al reservar) | ⚠️ | "Mis próximas reservas" existe (`src/app/(app)/portal/agenda/upcoming-bookings.tsx`); **no hay notificación de confirmación ni recordatorio**: 0 referencias a "recordatorio"/"reminder" en `src/`, sin plantilla de email de reserva en `src/lib/emails/templates.ts`, `Notification` solo se usa para tareas de staff, nunca hacia el socio | 🧱 backlog — la infraestructura de `/api/jobs/run` ya existe, falta la regla y la plantilla |
| RB-AGENDA-006 (franjas EP las configura el entrenador) | ✅ | `canManageEpSlots` `src/lib/rbac.ts:193-196` | — |
| RB-AGENDA-007 (aforo de grupos) | ✅ | `src/lib/portal-queries.ts:535-644` | — |
| Recurrencia materializada por fecha | ❌ | `prisma/schema.prisma:665-668` documenta explícitamente que las ocurrencias se derivan en lectura y **no** se materializan; `instanceForWeek` en `src/app/(app)/agenda/agenda-utils.ts:96-110` | 🏛️ decisión de diseño deliberada y documentada en el propio schema, no un pendiente accidental — pero sigue significando que la asistencia por fecha de una clase semanal es aproximada |
| Lista de espera → promoción automática | ❌ | `cancelBookingForMember` `src/lib/portal-queries.ts:660-696` y `cancelSessionBooking` (staff) `src/lib/agenda-queries.ts:151-173`: ninguno busca ni asciende un `Booking` `WAITLISTED` de la misma sesión al cancelar | 🧱 backlog puro |
| Ventana mínima de cancelación | ❌ | Único check en `portal-queries.ts:673-675` es que la sesión no haya empezado — no hay antelación mínima exigida | 📋 falta decidir cuántas horas de antelación exigir antes de picar código |
| Vista mes / vista por sala | ❌ | `agenda-view.tsx` (636 líneas) no tiene toggle de vista; calendario propio, sin `react-big-calendar` (se desinstaló en F0) | 🧱 backlog |
| Check-in por QR / kiosko / NFC | ❌ | Check-in sigue siendo el tick manual del staff (`checkin-button.tsx`); sin librería QR en el repo | 🧱 backlog |

---

## 4. Entrenamientos, rutinas y agente de IA

| Regla | Estado | Evidencia | Bloqueo |
|---|---|---|---|
| RB-IA-001 (rutina para casa con confirmación humana) | ⚠️ | Flujo completo `DRAFT→confirmedByUserId→ACTIVE` (`src/lib/workout-programs.ts:24-57`), pero el generador es `buildMockRoutine`: siempre la misma rutina de 3 días, sin llamada externa (`workout-programs.ts:12-19`) | 🔑 necesita un proveedor LLM real — sin `OPENAI_API_KEY`/`ANTHROPIC_API_KEY`/equivalente en `.env.example`, cero SDK de IA en el repo |
| RB-IA-002 (agente de IA de programación, uso staff) | ❌ | `saveSession`/`createEpSlot` son 100% CRUD manual; cero menciones de "IA"/"sugerir" bajo `src/app/(app)/agenda/` | 🔑 mismo bloqueo que RB-IA-001, y además **no tiene ni mock** — no se ha empezado, a diferencia de la rutina para casa |
| RB-IA-003 (entrenador confirma programación IA) | ⚠️ | Mismo flujo que RB-IA-001; "seguimiento continuo" por IA en el chat no existe (`senderKind: "AI"` declarado pero nunca instanciado) | 🔑 mismo bloqueo de proveedor IA |
| RB-IA-004 (progreso visible al cliente) | ✅ | `src/app/(app)/portal/evolucion/page.tsx`, `src/app/(app)/portal/plan/page.tsx:120-204` | — |
| RB-IA-005 (autovaloración + recomendación IA) | ⚠️ | Captura de `SelfAssessment` real (`src/app/(app)/portal/plan/actions.ts:40-75`); `aiRecommendation` existe en el esquema pero **nunca se escribe** desde código, solo aparece como dato de demo en el seed | 🔑 mismo bloqueo de proveedor IA |
| RB-IA-006 (check-in periódico configurable) | ✅ lógica / ⚠️ disparo | `CheckinScheduleConfig` con defaults 30/90 días (`schema.prisma:1157-1179`); `runPeriodicCheckinRule` `src/lib/checkin-schedule.ts:36-105` | 🔑 mismo problema de cron externo que RB-LEAD-009 |
| RB-IA-007 (estancamiento combinado) | ✅ | `src/lib/stall-detection.ts:36-124` — combina autovaloración + `RetentionAlert` + RPE + `ClientGoal`/`MemberProgressEntry`, reutiliza el motor de retención tal como pedía la decisión §11.9 | — |

**Nota transversal:** las tres piezas de IA (§4) y la participación de la IA en el chat (§5) comparten **un único
bloqueo real**: no hay proveedor LLM conectado. Resolver eso de una vez (elegir proveedor, añadir credencial,
construir un cliente en `src/lib/`) desbloquea RB-IA-001/002/003/005 y la mitad de RB-CHAT-001 a la vez.

---

## 5. Comunicación (chat)

| Regla | Estado | Evidencia | Bloqueo |
|---|---|---|---|
| RB-CHAT-001 (chat centro↔cliente con visibilidad por rol) | ⚠️ | `Conversation`/`ChatMessage` construidos y en uso; visibilidad correcta para dirección y "entrenador que ha entrenado/dirigido en los últimos 90 días" (`src/lib/chat.ts:12-29`). Dos desviaciones: (1) `RECEPTION` tiene acceso total permanente, fuera de la matriz del §10 original — 📋 decisión de negocio a confirmar; (2) la IA nunca escribe en el chat pese a que `senderKind: "AI"` existe como valor válido — 🔑 mismo bloqueo de proveedor IA que §4 | ver columna |

---

## 6. Pagos y Stripe

| Regla / área | Estado | Evidencia | Bloqueo |
|---|---|---|---|
| RB-PAGO-001 (todo cobro vía Stripe, sin canal manual paralelo) | ⚠️ | El cobro manual (efectivo/tarjeta/transferencia/SEPA en mostrador) **sigue activo** junto a Stripe (`src/app/(app)/billing/actions.ts:12-43`) | 🏛️ puente intencional documentado en el propio código ("mientras no todo cobro pasa por Stripe"), no un olvido |
| Suscripciones recurrentes reales (no solo webhooks) | ✅ | `src/lib/member-billing.ts:126-150` crea `mode: subscription` de verdad, no solo escucha eventos | — |
| RB-PAGO-002 (cierre de lead depende del webhook) | ✅ | `src/lib/stripe-checkout.ts:63-102` | — |
| Devolución local bloqueada para pago puntual de Stripe | ✅ | `src/app/(app)/billing/subscription-actions.ts:72-77` | — |
| Devolución local bloqueada para pago **recurrente** de Stripe | ❌ **inconsistencia** | El mismo guard solo mira `stripePaymentIntentId`; los pagos recurrentes solo tienen `stripeInvoiceId` (`src/lib/member-billing.ts:402-412`), así que **sí se puede** "devolver" localmente un cobro que en Stripe sigue cobrado | 🧱 backlog — es un bug de cobertura del guard existente, no un feature nuevo |
| Devolución real en Stripe (`stripeRefundId`) | ❌ | Campo existe en el esquema (`schema.prisma:775`), nunca se rellena desde ningún sitio | 🔑 necesita credenciales Stripe del cliente en producción (documentado como bloqueada en `FEEDBACK_COBROS_DASHBOARD_IMPLEMENTACION.md:247-266`) |
| **Congelar/cancelar suscripción se refleja en Stripe** | ❌ **riesgo real** | `freezeSubscription` (`src/app/(app)/billing/subscription-actions.ts:95-123`) y `runScheduledCancellationsRule` (`src/lib/subscription-jobs.ts:8-22`) solo tocan la BD local — **cero llamadas** a `stripe.subscriptions.cancel`/`.update` en todo `src/` | 🧱 backlog, pero de los que más importa priorizar: hoy Stripe sigue cobrando la tarjeta de un socio que el sistema muestra como "congelado" |
| SEPA | ⚠️ | Real vía Stripe para planes recurrentes (`member-billing.ts:140,226`); el checkout puntual es solo tarjeta; también existe como método manual local sin validación | — |
| Bizum | ❌ | Excluido a propósito del checkout de Stripe (incompatible con modo suscripción, comentario en `member-billing.ts:77-80`); solo existe como entrada manual libre | 📋 backlog documentado (`STRIPE_FUNCIONALIDADES_ROI.md` F19/RB-PAGO-010), pendiente de decisión de prioridad |
| Dunning (impago → aviso) | ⚠️ | Solo aviso interno a staff en `invoice.payment_failed` (`member-billing.ts:424-482`); no hay email al socio, Stripe Smart Retries es config de panel, no código | 🧱 backlog del email al socio |
| Recibo/factura PDF | ❌ | `receiptNumber` es una cadena secuencial, sin generador de PDF en el repo | 🧱 backlog |
| VERI\*FACTU / facturación certificada | ❌ | Fuera de alcance por decisión previa (D-S3) | 🔑 requiere proveedor certificado externo |
| Texto de `billing/page.tsx` | ❌ desactualizado | Cabecera (`src/app/(app)/billing/page.tsx:40`) sigue diciendo que "la pasarela de pago online queda fuera de esta entrega" aunque el checkout de Stripe ya está en producción en esa misma página | 🧱 deriva documental dentro del propio código, arreglo de una línea |

---

## 7. RGPD y auditoría

| Área | Estado | Evidencia | Bloqueo |
|---|---|---|---|
| Derecho de supresión (borrado de socio) | ✅ | `src/app/(app)/members/[id]/actions.ts:260-337` (`deleteMember`, cascada completa, bloquea si hay suscripción activa) | — |
| Portabilidad (exportar datos del propio socio) | ❌ | Ninguna ruta/endpoint de exportación en todo `src/` | 🧱 backlog, no documentado en ningún plan revisado |
| Consentimientos — captura inicial | ✅ | `src/app/onboarding/[token]/actions.ts:116-124` | — |
| Consentimientos — revocación posterior al alta | ❌ | Solo se escriben una vez; el panel de staff es de solo lectura (`src/app/(app)/members/[id]/member-data-panel.tsx:262-275`) y el comentario que dice "se firman desde el portal" no corresponde a ninguna pantalla real del portal | 📋 falta decidir el flujo (¿quién puede revocar, con qué efecto sobre servicios activos?) antes de construirlo |
| Auditoría de acceso a salud (Art. 9) | ✅ | `src/lib/health-access.ts:11-45,141-194` | — |
| Vista de auditoría — paginación/filtros/exportación | ❌ | `src/app/(app)/audit/page.tsx:22-27`: `take: 200` fijo, sin `skip`, sin filtros, sin descarga | 🧱 backlog — el log deja de ser auditable en cuanto crece |
| Listado de socios sin paginación | ❌ | `src/lib/members-queries.ts:32`: `take: 300` fijo | 🧱 backlog — un centro de más de 300 socios pierde filas en silencio |
| `ClientFeedback`/`TrainerDebrief` sin `orgId` | ⚠️ | `prisma/schema.prisma:573-588`: aislamiento depende de navegar por `Member`, no de un `orgId` propio, rompiendo la convención del resto del esquema | 🧱 deuda técnica, riesgo si alguna query futura parte del feedback en vez del socio |

---

## 8. Feedback diferencial (cliente ⟷ entrenador)

Este es el bloque que sigue confirmado como el hueco más visible del sistema — es el "módulo estrella" que
compara la percepción del cliente con la del entrenador, y no genera ni un solo dato real hoy.

| Área | Estado | Evidencia | Bloqueo |
|---|---|---|---|
| `ClientFeedback` escrito por la app en ejecución | ❌ | Cero `prisma.clientFeedback.create/update` en `src/`; el único escritor es `prisma/seed.ts:2106-2107` | 🧱 backlog — necesita construir el formulario/flujo de captura |
| `TrainerDebrief` escrito por la app en ejecución | ❌ | Mismo caso: solo el seed | 🧱 backlog |
| Botón "Solicitar feedback" | ❌ no-op | `src/app/(app)/feedback/actions.ts:25-48`: solo escribe `AuditLog`, comentario propio admite "no hay canal real de envío" | 🧱 backlog — necesita el mismo canal de notificación de §3/RB-AGENDA-005 |
| Botón "Marcar revisado" | ❌ no-op | Igual que arriba | 🧱 backlog |
| Botón "Programar seguimiento" | ❌ no-op | Igual que arriba | 🧱 backlog |
| **Mecanismos adyacentes que sí funcionan (no confundir):** `SessionDebrief` (RPE post-sesión), `SelfAssessment` post-sesión del socio, `TrainerRating` confidencial | ✅ | `src/app/(app)/brief/[id]/actions.ts`; `src/app/(app)/portal/agenda/actions.ts:52-76`; `src/lib/trainer-rating-access.ts` | — |

---

## 9. RRHH

| Regla | Estado | Evidencia | Bloqueo |
|---|---|---|---|
| RB-RRHH-001 (fichaje + firma) | ✅ | `TimeClockEntry.signedAt` `schema.prisma:1070-1087`; `src/app/(app)/rrhh/page.tsx:41-43` | — |
| RB-RRHH-002 (verificación cruzada horas↔sesiones) | ✅ | `src/lib/timeclock-queries.ts` (`crossCheckHours`) | — |
| RB-RRHH-003 (buzón de propuestas) | ✅ | `src/lib/staff-proposals.ts:1-40` | — |
| RB-RRHH-004 (venta atribuida a trabajador) | ⚠️ | `Payment.soldByUserId` se captura en todos los puntos de venta, pero **no hay ranking/vista** que lo explote — `dashboard-queries.ts` no tiene ranking por vendedor | 🧱 backlog — el dato ya existe, falta la vista |
| RB-RRHH-005 (panel del entrenador) | ✅ | `src/app/(app)/trainer/page.tsx` | ⚠️ pero sigue restringido a `requireRole(["TRAINER"])` (`trainer/page.tsx:42`) — dirección no puede ver el panel de su propio equipo, esto ya lo señalaba la auditoría anterior y sigue igual |
| RB-RRHH-006 (alerta pocas sesiones, &lt;2 sem / ≤4 ses.) | ⚠️ | Umbrales correctos (`src/lib/trainer-alerts.ts:8-56`), pero notifica a OWNER/CENTER_DIRECTOR en vez de "al entrenador responsable" — consecuencia directa de que no existe `trainerId` fijo (§2) | 🏛️ mismo pivote de arquitectura que RB-PERFIL-002 |
| RB-RRHH-007 (notificaciones tipo tarea) | ✅ | `src/lib/trainer-alerts.ts:58-89` | — |
| RB-RRHH-008 (3 señales del motor de ofertas) | ⚠️ | Señal automática y manual cubiertas; sin captura estructurada separada de "cualitativo preguntado al entrenador" más allá del campo de texto libre | 🧱 hueco menor, no bloqueado |
| RB-RRHH-009 (RPE post-sesión) | ✅ | Ya existía (`SessionDebrief`) | — |
| RB-RRHH-010 (reporte semanal agregado) | ✅ | `src/app/(app)/feedback/debriefs-semanales/page.tsx` | — |
| RB-RRHH-011 (valoración de entrenadores, trimestral configurable) | ✅ | `src/lib/checkin-schedule.ts:9-102`; `src/lib/trainer-rating-access.ts:43-70` | — |
| RB-RRHH-012 (confidencial, solo dirección) | ✅ | `src/lib/trainer-rating-access.ts:1-33` (matriz invertida, nunca accesible al propio entrenador) | — |
| RB-RRHH-013 (aprobación obligatoria de ofertas) | ✅ | `src/app/(app)/offers/actions.ts:1-46`; máquina de estados completa `SUGERIDA→PENDIENTE_DIRECCION→APROBADA/RECHAZADA→COMUNICADA` | — |

---

## 10. BI / Analítica para dirección

| Regla | Estado | Evidencia |
|---|---|---|
| RB-BI-001 (ocupación, sesiones/semana) | ✅ | `src/lib/dashboard-queries.ts:66-128` |
| RB-BI-002 (LTV, ticket medio) | ✅ | `dashboard-queries.ts:162-171` |
| RB-BI-003 (demográficos: edad, ocupación, % hijos, % empresarios) | ✅ | `dashboard-queries.ts:176-212` |
| RB-BI-004 (objetivos agregados) | ✅ | `dashboard-queries.ts:215-235` |
| Mapa de calor por CP | ✅ (mecanismo) / ⚠️ (datos) | `dashboard-queries.ts:258-296`, join real contra `PostalCodeArea` — ver §12 sobre el alcance geográfico |
| Extras no pedidos por los documentos (distribución por sexo, franjas de edad, ranking por canal/servicio/socio) | ✅ | `dashboard-queries.ts:298-483` |

Este bloque es, junto con RRHH, el que más ha avanzado desde la última auditoría: prácticamente todo lo que
`CRM_IMPLEMENTACION_FUNCIONALIDADES.md` daba por no-empezado (`RB-BI-002/003/004`) ya está construido.

---

## 11. Capa comercial "Apta" (identidad multi-tenant, planes, venta a gimnasios)

| Fase / regla | Estado | Evidencia | Bloqueo |
|---|---|---|---|
| F0 (desatasco) | ✅ | — | — |
| F1 (identidad separada de membresía + recuperación de contraseña) | ✅ | `prisma/schema.prisma:148-162`; `src/app/recuperar-clave/*` | — |
| F2 (catálogo + entitlements) | ✅ | `src/lib/platform-plans.ts`; `src/lib/entitlements.ts:20-60` | — |
| F3 (alta pago-primero) | ✅ | `src/lib/provisioning.ts` | — |
| F4 (CRUD `MembershipPlan` + checklist) | ✅ | `src/app/(app)/organization/actions.ts:246,262,294` | — |
| **F5 (cobro recurrente gimnasio→socio)** | ✅ — **`PLAN_IMPLEMENTACION_APTA_COMERCIAL.md` §6 sigue diciendo "⏳ Pendiente", desactualizado** | `src/lib/member-billing.ts` (482 líneas); commit `4b177ae` | — |
| **F6 (autoservicio del socio)** | ✅ — **mismo documento desactualizado** | `src/app/(app)/portal/comprar/actions.ts`; `src/app/gestionar-suscripcion/[token]/*`; commit `fbc6115` | — |
| Landing pública de alta (D1, fuera de la tabla F0-F8 pero de la misma tanda) | ✅ | `src/app/hazte-socio/[orgSlug]/[centerSlug]/*`; commit `5d08e2f` | — |
| F7 (marca del cliente en comunicaciones) | ✅ | `src/lib/mailer.ts:23-58` | — |
| **F8 (back-office `/apta` para `PLATFORM_ADMIN`)** | ❌ | No existe `src/app/apta` ni equivalente; `PLATFORM_ADMIN` solo aparece como rol permitido en pantallas existentes, sin pantalla propia | 🧱 backlog — marcado como opcional en el propio plan ("solo si sobra margen"), no bloqueado por nada externo |
| RB-ID/ALTA/PLAN/VENTA/MARCA (18 reglas, §4 del plan) | ✅ todas | Verificadas una a una contra código | — |

---

## 12. Composición corporal (Tanita)

| Área | Estado | Evidencia | Bloqueo |
|---|---|---|---|
| Modelo + captura manual | ✅ | `prisma/schema.prisma:408-420` (`MemberProgressEntry`) | — |
| Separación consentimiento salud/imagen | ✅ | `src/app/(app)/members/[id]/actions.ts:401,414,458` | — |
| Rangos de referencia configurables | ✅ | `ReferenceRange` `schema.prisma:429-432`; `src/lib/reference-ranges.ts` | — |
| Gráficas de evolución (ficha + portal) | ✅ | `src/app/(app)/members/[id]/composition-chart.tsx`; `src/app/(app)/portal/evolucion/page.tsx` | — |
| Señal de estancamiento por composición | ✅ | `src/lib/stall-detection.ts:12-90` | — |
| Importación por texto pegado (MyTanita) | ✅ | `src/lib/tanita-parse.ts` | — |
| Objetivos y BI agregado desde composición | ❌ | Sin `ClientGoal` derivado de métricas de composición ni agregados en `dashboard-queries.ts` | 🧱 backlog, depende de acumular más histórico primero (según el propio doc) |
| API Tanita Health Connect (integración directa con báscula) | ❌ | Sin código | 🔑 depende de disponibilidad/credenciales del proveedor Tanita — no está en manos del equipo |

---

## 13. App móvil nativa (Expo)

| Fase | Estado | Evidencia | Bloqueo |
|---|---|---|---|
| F0 (API JSON + auth por token) | ✅, más amplia que el plan | `src/app/api/mobile/v1/**` (26 route handlers) | — |
| F1 (scaffold Expo + auth + design system) | ✅ | `apps/mobile/` | — |
| F2 (portal del socio) | ✅ | `apps/mobile/src/app/(tabs)/*` | — |
| F3 (subconjunto staff) | ⚠️ | Agenda del día, brief, panel entrenador/dirección, anuncios y organización sí; **faltan** ficha de socio, leads rápidos y fichaje en móvil | 🧱 backlog — `apps/mobile/README.md` dice "F3 pendiente" pero está desactualizado, ya cubre buena parte |
| F4 (push/biometría/cámara/offline) | ❌ | Sin `expo-notifications`/`expo-local-authentication`/`expo-camera`; sin tabla `DeviceToken` | 🔑 push necesita credenciales APNs/FCM; el resto es backlog |
| F5 (publicación en tiendas) | ❌ | Sin `eas.json`; iconos/splash siguen siendo los de plantilla de Expo | 🔑 requiere cuentas Apple Developer / Google Play Console del cliente |

---

## 14. Deriva documental detectada

Estos documentos afirman cosas que el código ya contradice. No son huecos de producto — son el motivo por el que
convenía refrescar el análisis antes de planificar nada:

| Documento | Afirmación desactualizada |
|---|---|
| `CRM_IMPLEMENTACION_FUNCIONALIDADES.md` | Columna "Estado hoy" marca como ❌ prácticamente todo lo de leads, agenda EP, RRHH y BI — la mayoría ya está construido (ver §1, §3, §9, §10) |
| `PLAN_IMPLEMENTACION_APTA_COMERCIAL.md` §6 | F5 y F6 siguen como "⏳ Pendiente" pese a commits posteriores que las completan (`4b177ae`, `fbc6115`) |
| `apps/mobile/README.md` | F3 marcada como pendiente sin reflejar los commits que ya cubren buena parte |
| `MVP_PILOTO_GIMNASIO_ANALISIS.md` | Su "P0-1: solo pago puntual" es anterior a F5/F6/D1 |
| `src/app/(app)/billing/page.tsx:40` (texto en la propia UI, no un doc, pero mismo problema) | Sigue diciendo que la pasarela de pago online "queda fuera de esta entrega" con el checkout de Stripe ya en producción en esa página |

**Recomendación:** cuando se cierre cada fase de las que quedan pendientes en este documento, actualizar la fila
correspondiente aquí mismo en el mismo commit — es la única forma de que no vuelva a pasar.

---

## 15. Todos los bloqueos, agrupados por tipo

Para responder directamente a "qué falta y por qué no está hecho":

### 🔑 Necesitan credencial o proveedor externo (nadie puede desbloquearlos solo escribiendo código)
- Proveedor LLM/IA real → desbloquea RB-IA-001/002/003/005 y la mitad de RB-CHAT-001 de una sola vez.
- Proveedor SMS (Twilio/Vonage) → RB-LEAD-002 (reset por SMS, cuenta solo-teléfono).
- Cron externo (Vercel Cron u otro) apuntando a `/api/jobs/run` → RB-LEAD-009, RB-IA-006, y cualquier regla temporal futura.
- Credenciales Stripe de producción del cliente → devoluciones reales (`stripeRefundId`).
- Proveedor certificado VERI\*FACTU → facturación fiscal.
- Credenciales APNs/FCM → notificaciones push nativas.
- Cuentas Apple Developer / Google Play Console del cliente → publicación de la app móvil.
- Disponibilidad/API del proveedor Tanita → integración directa con báscula (Health Connect).

### 📋 Pendientes de una decisión de negocio (se puede construir en cuanto alguien decide)
- Ventana mínima de cancelación de reserva: ¿cuántas horas de antelación?
- Flujo de revocación de consentimientos: ¿qué pasa con los servicios activos si el socio revoca?
- ¿`RECEPTION` debe seguir viendo todos los chats, o se restringe a la matriz original del §10?
- Fuente de datos geográfica fuera de Zaragoza (¿tabla editable por dirección, o import externo?).
- Prioridad de Bizum como método de pago (documentado, no descartado).
- Re-abrir o no la decisión §11.4 (entrenador fijo asignado) dado el pivote a "entrenador derivado".

### 🧱 Backlog puro (sin bloqueo externo — solo falta el tiempo de ingeniería)
- Lista de espera: promoción automática a `BOOKED` al cancelar.
- Espejar en Stripe la congelación/cancelación de una suscripción (**el de mayor riesgo real de esta lista**).
- Corregir el guard de devolución local para que también cubra pagos recurrentes de Stripe.
- Feedback diferencial: construir la captura real de `ClientFeedback`/`TrainerDebrief` y los tres botones del tablero.
- Confirmación + recordatorio de reserva (email/notificación al socio).
- Lead online (`/hazte-socio`) creando un `Lead(closeType=ONLINE)` antes del `Member`.
- Ranking de ventas por trabajador (el dato `soldByUserId` ya existe, falta la vista).
- Portabilidad de datos del socio (exportación RGPD).
- Auditoría: paginación, filtros, exportación.
- Listado de socios: quitar el tope duro de 300 sin paginar.
- Dunning: email de impago al socio (hoy solo hay aviso interno a staff).
- Recibo/factura en PDF.
- Back-office `/apta` para `PLATFORM_ADMIN` (F8, opcional).
- Vista mes / vista por sala en agenda.
- Check-in por QR/kiosko/NFC.
- WhatsApp / push / tiempo real para notificaciones (hoy todo es render de servidor sin polling).
- Objetivos y BI agregado derivados de composición corporal.
- Exportaciones CSV reales de socios/cobros (la feature comercial "exportaciones" hoy solo gatea `/audit`).
- Tests unitarios y CI (`.github/`): siguen sin existir; la suite e2e sí ha crecido de 6 a 13 specs.
- `error.tsx`/`global-error.tsx`/`not-found.tsx`: siguen sin existir en ninguna ruta.
- Editar/eliminar un centro más allá del logo, cambiar el rol de una persona desde la organización.
- `/trainer` sigue restringido solo a `TRAINER`: dirección no puede ver el panel de su propio equipo.

### 🏛️ Decisiones de arquitectura ya tomadas (divergen del documento a propósito, no son huecos)
- `Member.trainerId` no existe: sustituido por "entrenador derivado de la actividad reciente". Afecta en cascada a RB-PERFIL-002/004, RB-RRHH-006, RB-IA-003/005/007 y RB-CHAT-001.
- Recurrencia de agenda no materializada en filas por fecha: documentado en el propio `schema.prisma`.
- Canal de cobro manual conviviendo con Stripe: puente intencional mientras no todo el cobro pasa por Stripe.

---

*Fin del documento. Cuando se cierre cualquiera de las filas ⚠️/❌ de arriba, actualizar esa fila en el mismo
commit que el cambio — el objetivo de este documento es no repetir la deriva de §14 dentro de un año.*
