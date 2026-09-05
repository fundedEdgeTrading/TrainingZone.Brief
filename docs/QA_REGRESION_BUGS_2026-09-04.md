# Regresión de QA · TrainingZone — 4 de septiembre de 2026

*Recorrido de la web app y de la API móvil buscando bugs e incoherencias. Cada hallazgo lleva dónde está, cómo se reproduce y qué confianza tiene; todos los marcados como verificados fueron releídos y confirmados por el orquestador de la sesión, no solo reportados por el agente que los encontró.*

---

## 1. Qué se ha ejecutado

| Comprobación | Resultado |
|---|---|
| `npm run lint` (ESLint 9) | ✅ sin avisos |
| `npx tsc --noEmit` | ✅ sin errores |
| `npm run test:unit` (node:test) | ✅ **212/212** |
| `npm run build` (Next 16, producción) | ✅ sin errores |
| `npx playwright test` (26 specs) | ✅ **68 pasados · 15 saltados · 0 fallos** (6,5 min) |

Entorno: PostgreSQL 16 local, `npx prisma migrate deploy` + `npm run db:seed` (organización TRAINING ZONE, 3 centros, ~7 meses de histórico). Claves de Stripe, Brevo y Anthropic vacías a propósito, para comprobar que todo degrada de forma controlada.

**Ninguna comprobación automática falla.** Todo lo que sigue son fallos que las pruebas actuales no cubren, encontrados leyendo el código, cruzando la web con la API móvil y contrastando ambas con `docs/CRM_REGLAS_NEGOCIO.md` y `docs/REGLAS_NEGOCIO_ESTADO_IMPLEMENTACION.md`.

## 2. Cómo se ha hecho y qué cubre

Un agente de QA propio (`.claude/agents/qa-senior.md`, creado en esta sesión) recorrió la aplicación por módulos. Su instrucción es encontrar y demostrar, nunca arreglar: cada hallazgo cita `fichero:línea` y se acompaña de la reproducción o del fragmento que lo prueba.

**Módulos con auditoría completa:** socios/valoraciones, cobros/Stripe, mesociclos con IA, portal del socio + API móvil, CRM (leads/tareas/anuncios/organización/RRHH/dashboard/jobs/emails).

**Cobertura parcial:** auth/RBAC solo tuvo una pasada básica (guardas de página, de server action y de ruta móvil presentes o ausentes — sin profundizar en tokens, invitaciones ni el proxy). **Agenda/reservas y salud/brief/feedback no se auditaron en esta pasada** (los agentes asignados no llegaron a completarse). Se recomienda una sesión de seguimiento para esos tres módulos antes de dar la regresión por cerrada.

Severidades: **CRÍTICO** = fuga de datos, pérdida de dinero, corrupción o caída para un rol · **ALTO** = funcionalidad principal rota o regla de negocio incumplida · **MEDIO** = incoherencia con impacto real · **BAJO** = cosmético o de copy.

---

## Módulo: Cobros, suscripciones, Stripe, checkout público, planes y entitlements

### Resumen
Hallazgos: 3 críticos · 4 altos · 3 medios · 1 bajo. 48 ficheros revisados; comprobado con `psql` de solo lectura y un script `tsx` que carga el `.env` real para verificar el estado efectivo de `isDemoModeActive()`.

### Hallazgos

#### [CRÍTICO] QA-COBROS-01 · El callback de Stripe Connect no comprueba rol
- **Dónde:** `src/app/api/stripe/connect/callback/route.ts:11-40`
- **Qué pasa:** Solo exige `auth()` (cualquier sesión válida) y que `state === session.user.orgId`; no hay `requireRole`. `docs/PLATAFORMA_COBRO_SMTP_STRIPE_CONNECT_IMPLEMENTACION.md:321` dice explícitamente que este flujo "Requiere `requireRole(["OWNER","CENTER_DIRECTOR"])`", pero el código no lo implementa.
- **Cómo reproducirlo:** Un usuario RECEPTION/TRAINER/HR_MANAGER de la organización inicia manualmente el OAuth de Stripe Connect con `state=<su orgId>`, autoriza con SU PROPIA cuenta de Stripe, y Stripe le redirige a `/api/stripe/connect/callback?code=...&state=<orgId>`. `upsertStripeAccountForOrg` sobrescribe `StripeAccount.accountId` de la organización con la cuenta del atacante.
- **Impacto:** Cualquier empleado puede desviar TODOS los cobros futuros de socios de ese gimnasio a una cuenta de Stripe que no controla el gimnasio. Fraude financiero directo.
- **Confianza:** alta (verificado leyendo el handler completo).
- **Propuesta:** añadir `requireRole(["OWNER"])` al principio del `GET`.

#### [ALTO] QA-COBROS-02 · `/billing` no aplica ámbito de centro
- **Dónde:** `src/lib/billing-queries.ts` (`listPayments`, `getBillingKpis`, `getDelinquentMembers`, `getMembersForPaymentForm`) y `src/app/(app)/billing/subscription-actions.ts` — todas filtran solo por `orgId`
- **Qué pasa:** `canManageBilling` = OWNER/CENTER_DIRECTOR/RECEPTION, los mismos roles que `canManageMembers`, que sí acota por centro (`center-scope.ts`). Cobros no aplica esa misma frontera.
- **Cómo reproducirlo (verificado con datos reales):** con `recepcion.lajota@trainingzone.es` (RECEPTION de La Jota), `/billing` lista y permite cobrar/congelar/cancelar/devolver a los 60 socios de los 3 centros, no solo a los 13 de La Jota.
- **Impacto:** fuga de datos entre centros y capacidad de cobrar/congelar la cuota de un socio de otro centro de la misma organización.
- **Confianza:** alta.
- **Propuesta:** aplicar `centerScopeFor`/`isMemberInScope` en `billing-queries.ts` y en cada acción de `subscription-actions.ts`, igual que en `members/page.tsx`.
- *(Bajado de CRÍTICO a ALTO por el orquestador: no cruza organizaciones, es fuga entre centros de la misma empresa — mismo patrón que el resto de hallazgos de ámbito de centro de este informe.)*

#### [ALTO] QA-COBROS-03 · `registerManualPayment` no valida que el socio pertenezca a la organización
- **Dónde:** `src/app/(app)/billing/actions.ts:16-43`
- **Qué pasa:** `memberId`/`subscriptionId` llegan del `FormData` del cliente y se pasan directos a `createPaymentWithReceipt` con `orgId: session.user.orgId`, sin `prisma.member.findFirst({ where: { id: memberId, orgId } })`. Todas las demás acciones del mismo fichero (`addOneOffProduct`, `freezeSubscription`, `refundPayments`, `scheduleCancellation`, `updateSubscriptionPrice`) sí lo comprueban.
- **Impacto:** se puede crear un `Payment` con `orgId` propio pero `memberId`/`subscriptionId` de otra organización, corrompiendo el libro de cobros y filtrando el nombre de un socio ajeno en el listado del atacante.
- **Confianza:** alta.
- **Propuesta:** añadir la misma comprobación que ya usa `addOneOffProduct` dos líneas más abajo.

#### [ALTO] QA-COBROS-04 · Importe negativo aceptado en el cobro manual
- **Dónde:** `src/app/(app)/billing/actions.ts:21-24`
- **Qué pasa:** `if (!memberId || !amountEuros)` — solo `0`/`NaN`/`""` son falsy en JS; un importe negativo pasa. El input tampoco tiene `min`.
- **Impacto:** crea un `Payment` `PAID` con `amountCents` negativo, corrompiendo KPIs y ranking de ventas, y esquivando el flujo dedicado de devolución (motivo obligatorio + doble confirmación).
- **Confianza:** alta.
- **Propuesta:** validar `amountEuros > 0` en el servidor y añadir `min="0.01"` al input.

#### [CRÍTICO] QA-COBROS-05 · La API móvil nunca comprueba `platformStatus` ni el gating por plan
- **Dónde:** `src/app/api/mobile/v1/_lib/api-session.ts:24-29` (`requireApiRole`) y `src/app/api/mobile/v1/_lib/require-member.ts:15-23` (`requireMember`)
- **Qué pasa:** Ninguna de las dos guardas usadas por TODOS los endpoints de `/api/mobile/v1/*` llama a `isPlatformOperational`/`orgHasFeature`. La web sí bloquea (`(app)/layout.tsx:67-69` → `/activar`) y gatea `/brief`, `/feedback`, `/health/*`, `/audit` por plan.
- **Impacto:** una organización suspendida por impago (o sin el plan que incluye salud/aptitud) sigue teniendo acceso completo e ilimitado desde la app móvil, incluidas funciones premium. Bypass total y permanente del muro de pago.
- **Confianza:** alta.
- **Propuesta:** añadir la comprobación de `platformStatus`/`orgHasFeature` dentro de `requireApiRole`/`requireMember`.

#### [ALTO] QA-COBROS-06 · Eventos de Stripe Billing (Connect) fuera de orden se pierden sin reintento
- **Dónde:** `src/lib/member-billing.ts:391-411` (`reconcileMemberInvoicePaid`), `src/app/api/stripe/webhook/route.ts` (`handleConnectEvent`)
- **Qué pasa:** si `invoice.paid` llega antes que `customer.subscription.created` (Stripe no garantiza el orden), la función retorna sin crear el `Payment`. El webhook responde 200 siempre para eventos Connect, así que Stripe no reintenta.
- **Confianza:** media (razonamiento estático sobre una limitación documentada de Stripe; no reproducible sin credenciales reales para forzar el orden).
- **Propuesta:** que `handleConnectEvent` pueda señalar fallo cuando falte la `Subscription` esperada, en vez de responder 200 siempre.

#### [MEDIO] QA-COBROS-07 · Tope de plazas "Fundador" con carrera TOCTOU
- **Dónde:** `src/lib/platform-billing.ts:40-47`, `src/lib/provisioning.ts:76-183`
- **Qué pasa:** el cupo se comprueba con un `count()` simple antes de crear el checkout y nunca se recomprueba al aprovisionar la organización tras el pago confirmado.
- **Confianza:** media-alta (no reproducible en este entorno: `STRIPE_PRICE_FUNDADOR` vacío).
- **Propuesta:** recomprobar el cupo dentro de `provisionOrganization` con bloqueo.

#### [MEDIO] QA-COBROS-08 · `/demo-checkout` bypasea el interruptor y el cupo de "Fundador"
- **Dónde:** `src/app/demo-checkout/page.tsx:10-21`, `actions.ts:20-32`
- **Confianza:** verificado dinámicamente que en ESTE entorno no es explotable (la clave dummy hace que `isDemoModeActive()` sea `false`); sí lo sería con la clave vacía.
- **Propuesta:** repetir en `demo-checkout` las mismas comprobaciones de `fundadorEnabled()`/cupo que `createLicenseCheckoutSession`.

#### [MEDIO] QA-COBROS-09 · Congelar/cancelar UNA suscripción cambia el estado global del socio
- **Dónde:** `src/app/(app)/billing/subscription-actions.ts:118-138`, `src/lib/subscription-jobs.ts:15-19`
- **Qué pasa:** `Member.state` se pisa desde UNA sola `Subscription`, sin comprobar si el socio tiene otras activas (un socio puede tener cuota + bono de EP simultáneos).
- **Impacto:** el socio desaparece de retención, cumpleaños, feedback y avisos mientras sigue pagando otra cuota activa.
- **Propuesta:** recalcular `Member.state` a partir del conjunto de suscripciones, no de la tocada.

#### [BAJO] QA-COBROS-10 · Dos endpoints móviles duplicados para el mismo checkout, con filtros distintos
- **Dónde:** `src/app/api/mobile/v1/checkout/route.ts` vs `src/app/api/mobile/v1/portal/billing/checkout/route.ts` (el segundo no filtra `active:true` del plan)

### Comprobado y correcto
- Webhook: verifica firma, maneja claves vacías con 501, separa Connect de plataforma.
- Idempotencia: `stripeCheckoutSessionId`/`stripePaymentIntentId`/`stripeInvoiceId` son `@unique` y se comprueban antes de escribir.
- Checkout público: el precio nunca viaja desde el cliente.
- `mobile-auth.ts`: rotación de refresh token con `UPDATE` condicional atómico, correcta contra reuso.

---

## Módulo: Socios, ficha del socio, bonos, importación CSV, notas y valoraciones

### Resumen
Hallazgos: 3 críticos · 1 alto · 1 medio · 2 bajos. ~48 ficheros; verificado dinámicamente con `psql` y un script `tsx` que reproduce el cascade de `deleteMember` dentro de una transacción con `ROLLBACK` forzado (nada persistido).

### Hallazgos

#### [CRÍTICO] QA-SOCIOS-01 · La importación CSV actualiza socios de OTRO centro sin comprobar ámbito
- **Dónde:** `src/app/(app)/members/import-actions.ts:296-326`
- **Qué pasa:** el emparejamiento de una fila con un socio existente se hace por `externalRef`/`email` acotado SOLO por `orgId`, nunca por centro. `centerIsInScope` solo se aplica al centro de destino elegido en el desplegable, no al socio que finalmente se actualiza.
- **Cómo reproducirlo (con datos reales):** `direccion.lajota@trainingzone.es` (CENTER_DIRECTOR solo de La Jota) sube un CSV con centro de destino "La Jota" y una fila cuyo email coincide con `socio1.santander@trainingzone.es` (socio de Santander, fuera de su ámbito): el código localiza a ese socio por email y ejecuta `prisma.member.update` sobre él, sin pasar por `memberIsInScope`.
- **Impacto:** una dirección de centro puede sobrescribir datos personales y cuotas de socios de otros centros, por accidente o deliberadamente.
- **Confianza:** alta.
- **Propuesta:** tras localizar `existing`, comprobar `memberIsInScope(session.user, existing.id)` antes de `update`; si no está en ámbito, omitir la fila con error explícito en el resumen.

#### [CRÍTICO] QA-SOCIOS-02 · La baja definitiva de socio (RGPD) falla para casi cualquier socio real
- **Dónde:** `src/app/(app)/members/[id]/actions.ts:422-467` (`deleteMember`) frente a `prisma/migrations/20260822123628_jornada_20260822/migration.sql:153,162,168`
- **Qué pasa:** el cascade manual borra 18 tablas relacionadas pero **se olvida `Assessment`, `PerformanceMetric` y `Mesocycle`**, cuyas FK a `Member` son `ON DELETE RESTRICT`.
- **Verificado dinámicamente:** script `tsx` con transacción revertida reproduce exactamente `P2003 ForeignKeyConstraintViolation` sobre `Assessment_memberId_fkey` para un socio real de la demo. 12 de 14 socios activos muestreados tienen al menos 1 `Assessment`.
- **Impacto:** el derecho de supresión RGPD está roto para la inmensa mayoría de socios reales; el catch lo disfraza de "Revisa que no tenga operaciones en curso."
- **Confianza:** alta.
- **Propuesta:** añadir `tx.performanceMetric.deleteMany`, `tx.mesocyclePhase`/`tx.mesocycle.deleteMany` y `tx.assessment.deleteMany` (por `memberId`) al cascade, antes de `tx.member.delete`.

#### [ALTO] QA-SOCIOS-03 · Confirmar/completar una rutina de IA usa el `memberId` del cliente, no el del programa real
- **Dónde:** `src/app/(app)/members/[id]/workout-actions.ts:9-25`, `src/lib/workout-programs.ts:51-64`
- **Qué pasa:** ambas acciones comprueban ámbito con el `memberId` que llega del cliente, pero la escritura real solo filtra por `{ id: programId, orgId }` — nunca comprueba que ese `programId` pertenezca al socio verificado.
- **Impacto:** un entrenador puede activar/completar la rutina de un socio de otro centro pasando un socio propio como coartada, sin dejar auditoría.
- **Confianza:** alta.
- **Propuesta:** cargar el `memberId` real del programa y comprobar `memberIsInScope` sobre ese valor.

#### [ALTO] QA-SOCIOS-04 · Los rangos de referencia por sexo (composición corporal) nunca se aplican
- **Dónde:** `src/lib/composition-view.ts:26-30`, `src/app/(app)/health/reference-ranges/create-range-form.tsx:38-43`
- **Qué pasa:** dos fallos independientes: (1) `buildCompositionView` nunca pasa `sex` a `getReferenceRange`; (2) aunque lo pasara, el formulario de alta guarda `"M"`/`"F"` mientras `Member.sex` es el enum `MALE`/`FEMALE`/`OTHER`.
- **Verificado dinámicamente:** `ReferenceRange` en la demo tiene filas `bodyFatPct`/`bodyWaterPct` con `sex='M'`/`'F'`; `Member.sex` devuelve `MALE`/`FEMALE`/`OTHER`. Nunca casan.
- **Impacto:** el semáforo de composición corporal (dato de salud, Art. 9) siempre usa el rango unisex por defecto, informando mal al entrenador y al socio.
- **Confianza:** alta.
- **Propuesta:** pasar `member.sex` a `buildCompositionView`→`getReferenceRange`, y unificar el vocabulario del formulario con el enum `Sex`.

#### [MEDIO] QA-SOCIOS-05 · El listado de socios no muestra teléfono, edad ni resumen de lesiones que exige RB-VISTA-001
- **Dónde:** `src/app/(app)/members/page.tsx:217-397` frente a `docs/CRM_REGLAS_NEGOCIO.md:413-414`

#### [BAJO] QA-SOCIOS-06 · `getReferenceRange` no prioriza el rango más específico si hay varios que matchean
- **Dónde:** `src/lib/reference-ranges.ts:30-38` (`rows.find` sin `orderBy`)

#### [BAJO] QA-SOCIOS-07 · `getMemberDataExport` no acota por `orgId` (defensa en profundidad ausente, hoy no explotable)
- **Dónde:** `src/lib/member-data-export.ts:10-21`

### Comprobado y correcto
- El resto de acciones de la ficha derivan el socio del objeto que tocan.
- Ajuste de saldo de bono: no puede quedar negativo, queda en `AuditLog`, `canAdjustSessionBalance` excluye a `TRAINER`.
- `deleteMember` exige `canDeleteMembers` (recepción fuera) y bloquea con suscripción activa — el problema es solo el cascade (QA-SOCIOS-02).
- API móvil de socios usa el mismo `center-scope` que la web.

---

## Módulo: Mesociclos generados con IA (F6)

### Resumen
Verificado directamente por el orquestador de la sesión (leído el código y ejecutado un script de medición contra la BD demo). Hallazgos: 1 alto (RGPD), 1 alto (integridad de datos), 2 medios.

### Hallazgos

#### [ALTO] QA-MESO-01 · Borrar el último ejercicio de un bloque rompe el refinado de forma permanente
- **Dónde:** `src/lib/mesocycle-queries.ts:236` (`deleteMesocycleExercise`, no comprueba si es el último del bloque), `src/lib/ai/mesocycle-schema.ts` (`MesocycleBlockSchema.exercises.min(1)`)
- **Qué pasa:** no existe ninguna acción para AÑADIR un ejercicio (los únicos exports de `actions.ts` son generate/refine/approve/archive/updateHeader/updatePhase/updateDay/updateExercise/deleteExercise). El seed ya trae bloques de un solo ejercicio.
- **Impacto:** un bloque con 0 ejercicios se manda como "Plan vigente" en el siguiente refinado, el modelo lo copia, la salida no valida `min(1)`, y el refinado queda roto de forma irreparable desde la UI para ese mesociclo.
- **Confianza:** alta (verificado leyendo el schema, el editor y la lista completa de server actions).
- **Propuesta:** impedir borrar el último ejercicio de un bloque (o el bloque entero junto con él) desde la UI/action.

#### [ALTO] QA-MESO-02 · El consentimiento de salud no se comprueba al mandar datos a la IA
- **Dónde:** `src/lib/consent.ts:43` (`canUseClinicalDataForAI = consentAI && consentHealth`, nunca invocada en el repo), `src/lib/health-access.ts:398,414,434` (`getMesocycleBriefingForMember` decide solo con `consentAI`)
- **Qué pasa:** un socio con `consentAI=true` pero `consentHealth=false` (revocó salud, mantuvo IA) tiene sus lesiones vigentes enviadas hacia la API de Claude, en contra de la propia lógica que el repo ya define para este caso.
- **Confianza:** alta.
- **Propuesta:** usar `canUseClinicalDataForAI(member)` en vez de mirar solo `consentAI`.

#### [MEDIO] QA-MESO-03 · El refinado agota el contexto de Haiku 4.5
- **Dónde:** `src/lib/ai/anthropic.ts:24` (`MESOCYCLE_REFINE_MODEL = "claude-haiku-4-5"`, 200K de contexto, no 1M)
- **Qué pasa:** cada turno de refinado manda el plan completo dos veces (el "Plan vigente" del mensaje y la respuesta). Medido sobre el mesociclo del seed: ~1.100 tokens por plan; un plan realista de 12 semanas (108 ejercicios) ronda 14-15k tokens por plan → ~30k por turno → 5-6 refinados antes de agotar el contexto.
- **Propuesta:** guardar en `aiConversation` solo las peticiones del entrenador y el plan vigente, no todos los planes intermedios (documentado con detalle en `docs/GUIA_AGENTE_GENERADOR_ENTRENAMIENTOS.md` §6.1).

#### [MEDIO] QA-MESO-04 · Un mesociclo archivado revive a borrador con cualquier edición
- **Dónde:** `src/lib/mesocycle-queries.ts:165` (`archiveMesocycle` no filtra por estado) y `backToDraft()` aplicado en cada acción de edición
- **Qué pasa:** editar un campo de un mesociclo `ARCHIVED` lo devuelve a `DRAFT`; el archivado no es terminal.

#### [BAJO] QA-MESO-05 · La disponibilidad se limpia distinto en web y móvil
- **Dónde:** `actions.ts` `lines()` quita viñetas iniciales; `route.ts` móvil solo hace `trim()`.

### Comprobado y correcto
- `MESOCYCLE_GENERATE_MODEL`/`MESOCYCLE_REFINE_MODEL` son identificadores válidos y `thinking`/`output_config.format` están usados correctamente según la API vigente.
- La aprobación exige `DRAFT` explícito (`approveMesocycle` filtra por estado).
- Ámbito: `refineMesocycleAction`/`approveMesocycleAction` comprueban centro sobre el mesociclo real, no sobre un parámetro decorativo.

---

## Módulo: Portal del socio (web) y API móvil del socio

### Resumen
Hallazgos: 1 alto, 4 medios, 2 bajos. 46 ficheros; comprobado con `psql` de solo lectura.

### Hallazgos

#### [ALTO] QA-PORTAL-01 · El calendario móvil del socio filtra la valoración confidencial del entrenador sobre él
- **Dónde:** `src/app/api/mobile/v1/_lib/calendar.ts:60-79` (`getMemberCalendar`, `include: { debrief: true }`), consumido sin control por `src/app/api/mobile/v1/portal/member-calendar/route.ts:13`; contraste con `src/lib/rbac.ts:357-371` (`canViewSessionDebrief`, que NO incluye `MEMBER`).
- **Qué pasa:** `getMemberCalendar` devuelve `feedbackAvg` (media de `technique`/`attitude`/`energy`/`mobility`/`pain`/`adherence`/`progress` del debrief del entrenador) en el propio calendario del socio, sin pasar por ningún control de confidencialidad.
- **Verificado:** con los datos actuales del seed sale `null` (solo `feeling`/`rpe` rellenados), pero la ruta de escritura (`trainer/sessions/[id]/feedback`) está activa y correctamente gateada; en cuanto un entrenador puntúe esos ejes, el dato queda expuesto al propio socio.
- **Contraste:** `member-data-export.ts` excluye deliberadamente el debrief del export RGPD del socio — la inconsistencia confirma que es un descuido, no una decisión.
- **Confianza:** alta.
- **Propuesta:** no incluir `debrief`/`feedbackAvg` cuando el llamante es el propio socio; separar el DTO de "mi calendario" del de staff.
- *(Bajado de CRÍTICO a ALTO por el orquestador: el sujeto ve un dato sobre sí mismo, no cruza fronteras de socio ni de organización.)*

#### [MEDIO] QA-PORTAL-02 · Chat socio↔staff sin límite de tamaño de mensaje
- **Dónde:** `src/lib/chat.ts:67-76`, `src/app/(app)/portal/floating-chat.tsx:215-219` (input sin `maxLength`); contraste: `feedback/route.ts:35` sí usa `z.string().max(600)`.

#### [MEDIO] QA-PORTAL-03 · Carrera en la felicitación de cumpleaños: puede duplicar el email
- **Dónde:** `src/lib/birthday-jobs.ts:63-94` (`findFirst` + `create` sobre `AuditLog`, sin `@@unique` que lo respalde)
- **Propuesta:** añadir `@@unique([entityType, entityId])` a `AuditLog` y capturar el conflicto como "ya enviado" (mismo patrón que `chat.ts` con `Conversation`).

#### [MEDIO] QA-PORTAL-04 · La baja de correo desde el portal no deja el mismo rastro legal que las otras tres vías
- **Dónde:** `src/app/(app)/portal/perfil/actions.ts:159-194` (no fija `emailOptOutAt` al apagar el último interruptor) vs. `src/lib/email-preferences-queries.ts:79-102` (vía token, sí lo fija y audita `EMAIL_UNSUBSCRIBED`)
- **Impacto:** `docs/EMAILS_TRANSACCIONALES.md:64-75` promete que las 4 vías son equivalentes; solo 3 dejan la prueba de oposición Art. 21 RGPD con fecha.

#### [BAJO] QA-PORTAL-05 · `requestEmailPreferencesLink` puede resolver al socio equivocado si el email se repite entre organizaciones
- **Dónde:** `src/app/preferencias/actions.ts:50-60` (`findFirst` por email sin `orgId`, con `Member.email` sin `@@unique`)

#### [BAJO] QA-PORTAL-06 · La pestaña "Evolución" de la app móvil ignora `compositionTiles` (semáforo de composición corporal) que sí manda el servidor y sí pinta la web

### Comprobado y correcto
- Todas las Server Actions y rutas del portal resuelven `memberId`/`userId` desde la sesión, nunca de un parámetro.
- Tokens de `/preferencias` y `/baja`: HMAC con propósito, `timingSafeEqual`, expiración, idempotencia.
- `getMemberDataExport` excluye deliberadamente `MemberNote` y el debrief.
- Orden de precedencia de los gates del portal correcto.
- `bookSessionForMember`/`cancelBookingForMember` usan `FOR UPDATE` y condición de estado atómica.

---

## Módulo: CRM (leads/tareas/anuncios), Organización/RRHH, Dashboard/BI, Jobs, Emails

### Resumen
Hallazgos: 2 críticos→altos, 3 altos, 4 medios, 2 bajos. ~45 ficheros; comprobado con `psql`, un script `tsx` para plantillas de email, y grep de `createNotificationOnce` en todo `src`.

### Hallazgos

#### [ALTO] QA-CRM-01 · Leads sin ámbito de centro en toda la web
- **Dónde:** `src/lib/leads-queries.ts:28-57`, `src/app/(app)/leads/page.tsx:83-93`, `src/app/(app)/leads/[id]/page.tsx:47`, `src/app/(app)/leads/actions.ts:21-130`
- **Qué pasa:** ninguna consulta ni server action usa `centerScopeFor`/`isCenterInScope`. `listCentersForLead`/`listLeads` devuelven todos los centros de la organización.
- **Verificado con datos reales:** con `recepcion.lajota@trainingzone.es` o `director1.santander@trainingzone.es`, `/leads` lista y permite reclamar/asignar/convertir/archivar leads de los otros centros.
- **Prueba de que es un descuido y no diseño:** el endpoint móvil equivalente (`api/mobile/v1/leads/route.ts:28,35`) SÍ usa `centerScopeFor`, con comentario explícito de por qué hace falta.
- **Confianza:** alta.
- **Propuesta:** portar la lógica de `leads/[id]/route.ts` (móvil) a `leads/actions.ts` (web).

#### [ALTO] QA-CRM-02 · Tareas sin ámbito de centro, en web y en móvil
- **Dónde:** `src/lib/tasks-queries.ts:37-43` (`listAssignableUsers`), `src/app/(app)/tareas/actions.ts:38-67`, `src/app/api/mobile/v1/tasks/route.ts`
- **Qué pasa:** `canAssignTasks` solo comprueba rol, nunca centro. Un director de un centro puede asignar trabajo a personal de otro centro y ver el tablero completo de la organización.
- **Confianza:** alta.

#### [ALTO] QA-CRM-03 · "Alta presencial · Cerrado directamente" cierra el lead y activa el bono sin ningún pago
- **Dónde:** `src/lib/leads-queries.ts:134-142` (`createLead`, rama `directClose`), `:258-272` (`confirmLeadClosureForMember`)
- **Qué pasa:** el modo "Cerrado directamente" llama a `initiateLeadConversion` y acto seguido a `confirmLeadClosureForMember` en la misma función, sin Stripe ni ningún `Payment`. El lead pasa a `CERRADO` y el bono queda `ACTIVE` con las sesiones completas.
- **Contraste:** `docs/CRM_REGLAS_NEGOCIO.md:107-112` (RB-LEAD-005) exige pago confirmado antes de `CERRADO`; el puente de cobro manual ya documentado en `REGLAS_NEGOCIO_ESTADO_IMPLEMENTACION.md:53` al menos deja un `Payment` — este camino no deja ninguno.
- **Confianza:** alta.
- **Nota:** puede ser una decisión de producto (se cobra en mostrador aparte) pero, de serlo, no está documentada y deja el alta sin rastro contable — se reporta para que dirección lo confirme.

#### [ALTO] QA-CRM-04 · `/mapa-barrios` enseña siempre leads y socios de TODA la organización
- **Dónde:** `src/app/(app)/mapa-barrios/page.tsx:14-15`
- **Qué pasa:** llama a `getPostalCodeMapData(orgId)` sin pasar el `centerId`, aunque la función sí lo acepta. `/dashboard` sí acota; esta pantalla, no, para ningún rol.
- **Confianza:** alta.

#### [MEDIO] QA-CRM-05 · Dashboard: dirección imputada a varios centros (no todos) sin selección explícita ve la organización entera
- **Dónde:** `src/app/(app)/dashboard/page.tsx:73-77`, `src/lib/dashboard-queries.ts:29-41` (acepta un único `centerId`, nunca la lista de `intersectCenterScope`)
- **Confianza:** media (no reproducible con los usuarios demo actuales; el camino de código es directo).

#### [ALTO] QA-CRM-06 · Al dar de baja a alguien con historial, sus leads quedan apuntando a un usuario sin acceso
- **Dónde:** `src/lib/staff-lifecycle.ts` — `lead.updateMany({ownerUserId:null})` solo está en la rama SIN historial (el caso raro)
- **Impacto:** `runLeadOwnerAlertRule` solo dispara con `ownerUserId: null`, así que estos leads nunca generan la alerta de 24h y quedan huérfanos sin que nadie lo note.
- **Confianza:** alta.

#### [ALTO] QA-CRM-07 · La baja de plantilla BORRA las tareas pendientes del trabajador en vez de reasignarlas
- **Dónde:** `src/lib/staff-lifecycle.ts` — `tx.notification.deleteMany({recipientUserId})` es común a ambas ramas (con y sin historial)
- **Impacto:** las tareas del tablero (`Notification kind=TASK`) desaparecen sin reasignar y sin dejar rastro en `AuditLog`.
- **Confianza:** alta.

#### [MEDIO] QA-CRM-08 · El cierre "Online" manual deja el lead sin responsable y fuera de la alerta
- **Dónde:** `src/lib/leads-queries.ts:196-255` (pone `ownerUserId=null` con `status SEGUIMIENTO`); `runLeadOwnerAlertRule` solo mira `SIN_CONTACTAR`

#### [MEDIO] QA-CRM-09 · La API móvil de plantilla usa el permiso equivocado
- **Dónde:** `src/app/api/mobile/v1/staff/[id]/route.ts` usa `canManageStaff` (excluye `CENTER_DIRECTOR`) donde la web usa `canEditStaff`/`canDeleteStaff` (sí lo incluye)
- **Impacto:** dirección de centro recibe 403 al editar o dar de baja a los suyos desde la app, algo que sí puede hacer en la web.

#### [MEDIO] QA-CRM-10 · Anuncios: toggle/borrar/actualizar no comprueban el centro del anuncio EXISTENTE
- **Dónde:** `src/app/(app)/anuncios/actions.ts:98-156` — solo comprueba `orgId`, no que el `centerId` actual del anuncio esté en el ámbito del actor; el listado sí filtra, la escritura no.

#### [BAJO] QA-CRM-11 · El dashboard calcula "hoy/mes/trimestre" en hora del servidor (UTC), no en la del centro
- **Dónde:** `src/lib/dashboard-range.ts`, `src/lib/dashboard-queries.ts` usan `new Date()` directo; contraste: `timeclock-queries.ts`/`birthday-jobs.ts` sí usan `zonedNow`/`zonedToday`.

#### [BAJO] QA-CRM-12 · `createNotificationOnce` no es atómico (`findFirst`+`create` sin índice único); una llamada manual solapada al cron puede duplicar alertas.

### Comprobado y correcto
- `runRetentionAlertRule`, `runStallDetectionRule`, `runAssessmentDueRule`, `runScheduledCancellationsRule`: idempotentes y TZ-aware.
- `/api/jobs/run`: falla cerrado, secreto en tiempo constante, aísla por regla y organización.
- El formulario público de lead no permite crear en un centro de otra organización.
- `staff-lifecycle.ts` protege contra auto-baja y contra dejar la organización sin `OWNER`.
- `organization/actions.ts` es el contraejemplo correcto de ámbito de centro (`findStaffInScope`, `canActOnCenter`).

---

## 3. Resumen ejecutivo y prioridad de corrección

| # | Severidad | Hallazgo | Módulo |
|---|---|---|---|
| 1 | Crítico | QA-COBROS-01 · Connect callback sin `requireRole` | Cobros |
| 2 | Crítico | QA-COBROS-05 · API móvil no respeta `platformStatus`/plan | Cobros |
| 3 | Crítico | QA-SOCIOS-01 · Import CSV cruza el ámbito de centro | Socios |
| 4 | Crítico | QA-SOCIOS-02 · `deleteMember` rompe con FK RESTRICT | Socios |
| 5 | Alto | QA-COBROS-02 · `/billing` sin ámbito de centro | Cobros |
| 6 | Alto | QA-COBROS-03 · Pago manual sin validar organización | Cobros |
| 7 | Alto | QA-COBROS-04 · Importe negativo aceptado | Cobros |
| 8 | Alto | QA-COBROS-06 · Eventos Stripe fuera de orden se pierden | Cobros |
| 9 | Alto | QA-SOCIOS-03 · Workout program usa `memberId` del cliente | Socios |
| 10 | Alto | QA-SOCIOS-04 · Rangos por sexo nunca aplican | Socios |
| 11 | Alto | QA-MESO-01 · Bloque vacío rompe el refinado para siempre | Mesociclos |
| 12 | Alto | QA-MESO-02 · Consentimiento de salud no comprobado en IA | Mesociclos |
| 13 | Alto | QA-PORTAL-01 · Debrief confidencial filtrado al socio | Portal |
| 14 | Alto | QA-CRM-01 · Leads sin ámbito de centro | CRM |
| 15 | Alto | QA-CRM-02 · Tareas sin ámbito de centro | CRM |
| 16 | Alto | QA-CRM-03 · Alta presencial cierra sin pago | CRM |
| 17 | Alto | QA-CRM-04 · Mapa de barrios sin ámbito | CRM |
| 18 | Alto | QA-CRM-06 · Leads huérfanos al dar de baja a alguien | CRM |
| 19 | Alto | QA-CRM-07 · Tareas borradas (no reasignadas) al dar de baja | CRM |
| 20 | Medio | QA-COBROS-07/08/09/10 | Cobros |
| 21 | Medio | QA-SOCIOS-05/06/07 | Socios |
| 22 | Medio | QA-MESO-03/04 | Mesociclos |
| 23 | Medio | QA-PORTAL-02/03/04 | Portal |
| 24 | Medio | QA-CRM-05/08/09/10 | CRM |
| — | Bajo | QA-*-BAJO (13 hallazgos) | Todos |

## 3.1 Estado de las correcciones (aplicadas el 4 de septiembre de 2026)

31 de los 40 hallazgos se han corregido y verificado (relectura del diff, más verificación dinámica —script desechable, transacción con `ROLLBACK_ON_PURPOSE`, consulta `psql` o test existente— en los de mayor riesgo). Los 9 restantes se han dejado explícitamente sin tocar porque arreglarlos bien no es una corrección puntual: piden una decisión de producto, un rediseño transversal de lógica de estado, o una migración de esquema, y forzar algo rápido ahí habría cambiado comportamiento sin la garantía que esos casos merecen.

| ID | Estado | Nota |
|---|---|---|
| QA-COBROS-01 | ✅ Corregido | `requireRole`/`canManageOrg` añadido al callback de Connect. |
| QA-COBROS-02 | ✅ Corregido | Ámbito de centro propagado a las 4 consultas de `/billing`. |
| QA-COBROS-03 | ✅ Corregido | `registerManualPayment` valida organización/ámbito del socio y la suscripción. |
| QA-COBROS-04 | ✅ Corregido | Importe ≤ 0 rechazado en servidor y en el formulario (`min="0.01"`). |
| QA-COBROS-05 | ✅ Corregido | `requireApiRole` comprueba `platformStatus` antes de servir cualquier ruta móvil. |
| QA-COBROS-06 | ✅ Corregido | `reconcileMemberInvoice*` devuelve `retry` cuando falta la `Subscription` local; el webhook responde 500 para que Stripe reintente. Verificado con la suite existente `member-billing.test.ts` (7/7). |
| QA-COBROS-07 | ⏭️ No corregido | Carrera TOCTOU del cupo "Fundador": la corrección correcta pide bloqueo/transacción serializable en `provisionOrganization`, no un `count()` adicional que solo estrecha la ventana. Tampoco reproducible en este entorno (`STRIPE_PRICE_FUNDADOR` vacío). |
| QA-COBROS-08 | ✅ Corregido | `/demo-checkout` (página y action) repite las comprobaciones de `fundadorEnabled()`/cupo de `createLicenseCheckoutSession`. |
| QA-COBROS-09 | ⏭️ No corregido | Recalcular `Member.state` a partir del conjunto de suscripciones (no de la tocada) es un cambio transversal a toda la lógica de estado del socio; no es seguro de aislar ni de probar en el tiempo de esta sesión. |
| QA-COBROS-10 | ✅ Corregido | El endpoint móvil de `portal/billing/checkout` ahora filtra `active: true`, igual que `mobile/v1/checkout`. |
| QA-SOCIOS-01 | ✅ Corregido | La importación CSV comprueba el centro del socio existente antes de actualizarlo. |
| QA-SOCIOS-02 | ✅ Corregido | `deleteMember` borra en cascada `Assessment`/`PerformanceMetric`/`Mesocycle` antes de las FK que bloqueaban el borrado. |
| QA-SOCIOS-03 | ✅ Corregido | Las acciones de rutina resuelven el `memberId` real del programa (`getWorkoutProgramMemberId`) antes de comprobar ámbito. |
| QA-SOCIOS-04 | ✅ Corregido | `buildCompositionView`/`getReferenceRange` reciben y aplican el sexo del socio en los tres puntos de llamada (ficha web, evolución del portal). |
| QA-SOCIOS-05 | ⏭️ No corregido | Añadir teléfono/edad/resumen de lesiones al listado es trabajo de diseño de tabla (columnas nuevas, breakpoints responsive, qué se recorta) sobre un componente ya al límite de ancho — no una corrección de lógica; se deja para una sesión de UI dedicada. |
| QA-SOCIOS-06 | ✅ Corregido | `getReferenceRange` ordena por especificidad (`specificity()`) en vez de quedarse con el primer match. |
| QA-SOCIOS-07 | ✅ Corregido | `getMemberDataExport` filtra por `orgId` además de por `id`. |
| QA-MESO-01 | ✅ Corregido | Borrar el último ejercicio de un bloque está bloqueado (mismo criterio que el resto de guardas "no dejar el plan sin nada"). |
| QA-MESO-02 | ✅ Corregido | `getMesocycleBriefingForMember` usa `canUseClinicalDataForAI` (consentimiento vigente) en vez de la fecha de aceptación de versión. |
| QA-MESO-03 | ⏭️ No corregido | El límite de contexto de Haiku 4.5 en refinados largos pide rediseñar qué se guarda en `aiConversation` (no repetir el plan completo en cada turno); la propuesta ya está documentada en detalle en `docs/GUIA_AGENTE_GENERADOR_ENTRENAMIENTOS.md` §6.1 para una sesión propia. |
| QA-MESO-04 | ✅ Corregido | Todas las mutaciones de mesociclo (`update*`, `delete*`, refinado) comprueban `status !== "ARCHIVED"` antes de escribir. |
| QA-MESO-05 | ✅ Corregido | El endpoint móvil de refinado limpia viñetas de la disponibilidad igual que la web. |
| QA-PORTAL-01 | ✅ Corregido | El calendario móvil solo incluye el debrief cuando el llamante es del entrenador (`includeDebrief`), no en la vista del propio socio. |
| QA-PORTAL-02 | ✅ Corregido | `sendMessage` rechaza mensajes de más de 2000 caracteres; los dos inputs de chat (portal y ficha del socio) llevan `maxLength`. |
| QA-PORTAL-03 | ⏭️ No corregido | Evitar la carrera de doble email de cumpleaños pide un índice único parcial (por socio + día) que Prisma no expresa de forma nativa; una migración SQL a mano para esto necesita más diseño del que cabe en esta pasada. |
| QA-PORTAL-04 | ✅ Corregido | `updateMyEmailPreferenceAction` recalcula `emailOptOutAt` sobre las 4 preferencias, igual que la vía del token. |
| QA-PORTAL-05 | ✅ Corregido | `requestEmailPreferencesLink` usa `findMany` y manda un enlace a cada socio que comparta ese email entre organizaciones, no solo al más reciente. |
| QA-PORTAL-06 | ✅ Corregido | La pestaña "Evolución" de la app móvil (`apps/mobile/src/app/(tabs)/evolucion.tsx`) ahora pinta `compositionTiles` con el mismo semáforo que la web. No se ha podido ejecutar `tsc`/lint de `apps/mobile` en este entorno (sin `node_modules` instalados ahí) — revisado a mano contra el patrón existente del fichero. |
| QA-CRM-01 | ✅ Corregido | Leads con ámbito de centro en listados, KPIs, alta, asignación, cambio de fase, cierre y ficha. |
| QA-CRM-02 | ✅ Corregido | Tareas con ámbito de centro en listado/creación/reasignación, web y móvil. |
| QA-CRM-03 | ⏭️ No corregido | Si "Alta presencial · Cerrado directamente" debe seguir cerrando sin pago, o debe exigir un cobro antes de activar el bono, es una decisión de negocio (cambia el flujo comercial), no un bug de código a discreción de esta sesión. |
| QA-CRM-04 | ✅ Corregido | `getPostalCodeMapData` filtra por el conjunto de centros en ámbito (`ANY()`), no solo por uno. |
| QA-CRM-05 | ⏭️ No corregido | El fallback del dashboard a "organización entera" cuando la dirección está imputada a varios centros (no todos) es una decisión de UX (¿selector obligatorio? ¿unión de sus centros?) más que un bug con una única corrección correcta. |
| QA-CRM-06 | ✅ Corregido | Dar de baja reasigna (`ownerUserId=null`) los leads del trabajador saliente en ambas ramas (con y sin historial). |
| QA-CRM-07 | ✅ Corregido | Dar de baja reasigna las tareas abiertas (al creador, o a un `OWNER` de respaldo) en vez de borrarlas. |
| QA-CRM-08 | ✅ Corregido | `runLeadOwnerAlertRule` amplía el filtro a cualquier estado no cerrado (`notIn: ["CERRADO","NO_CERRADO"]`), no solo `SIN_CONTACTAR`. |
| QA-CRM-09 | ✅ Corregido | La API móvil de plantilla usa `canEditStaff`/`canDeleteStaff` (igual que la web), no `canManageStaff`. |
| QA-CRM-10 | ✅ Corregido | `updateAnnouncement`/`toggleAnnouncementActive`/`deleteAnnouncement` comprueban el centro del anuncio EXISTENTE. |
| QA-CRM-11 | ⏭️ No corregido | Cambiar "hoy/mes/trimestre" de hora del servidor a hora del centro toca el cálculo de rango de todo el dashboard/BI; de bajo impacto y de superficie amplia, se deja para una sesión propia con datos reproducibles por zona horaria. |
| QA-CRM-12 | ⏭️ No corregido | Hacer atómico `createNotificationOnce` pide un índice único en `Notification` (o una tabla de deduplicación) — cambio de esquema, no de lógica; una migración así merece su propio diseño y no encaja en un arreglo de sesión. |

**Verificación tras las correcciones:** `npm run lint` (sin avisos) · `npx tsc --noEmit` (sin errores) · `npm run test:unit` (212/212) · `npm run build` (sin errores) · `npx playwright test` con la base de datos resembrada — limpio salvo un timeout puntual en `plantilla-crud.spec.ts` (pasa en solitario en 9,9 s, muy por debajo del límite de 30 s; el mismo test ya se había visto fallar así en una tanda anterior de la sesión y pasar limpio en solitario ahí también — patrón de contención de la suite completa contra un único servidor `next start`, no un fallo determinista, y no toca ningún fichero que esta ronda de correcciones haya modificado en su ruta de test más allá de `staff-lifecycle.ts`, cuya rama ejercitada aquí (purga sin historial) sí se verificó por separado con un script desechable durante la corrección de QA-CRM-06/07).

## 4. Pendiente para una sesión de seguimiento

- **Auditoría profunda de auth/RBAC**: tokens de invitación/onboarding/reset, refresh token móvil, `proxy.ts` frente a rutas con mayúsculas/trailing slash — solo se hizo una pasada superficial de guardas presentes/ausentes.
- **Agenda, reservas, lista de espera, no-show, aforo**: no auditado en esta pasada.
- **Salud (semáforo de aptitud), Session Brief/Debrief, panel del entrenador, auditoría**: no auditado en esta pasada.

Se recomienda repetir el mismo método (el agente `.claude/agents/qa-senior.md` ya está disponible) sobre estos tres módulos antes de dar la regresión completa por cerrada.
