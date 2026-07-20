# TRAINING ZONE — Plan de Implementación de Funcionalidades Restantes

**Documento de trabajo interno · v1.0**
**Objetivo:** traducir las reglas de negocio ya cerradas en `CRM_REGLAS_NEGOCIO.md` (v1.1, con
las 9 decisiones de §11 decididas) a un **backlog de implementación accionable** sobre el sistema
que ya existe. No repite las reglas: las **referencia** (`RB-*`) y dice, para cada una, qué falta
construir — modelo de datos, capa de acceso, rutas, permisos y UI.

**Base de partida (lo que YA está construido, F0–F5 + G):** multi-tenant (`Organization`,
`Center`, `User`, roles), ficha de socio (`Member` con consentimientos, foto, máquina de estados),
bitácora (`MemberNote`), progreso físico (`MemberProgressEntry`), catálogo y suscripciones
(`MembershipPlan`, `Subscription`), agenda (`SessionTemplate`, `ClassSession`, `Booking` con
check-in `ATTENDED`/`NO_SHOW`), cobros **manuales** (`Payment`), salud Art. 9 (`HealthRecord` +
`lib/health-access.ts` + `AuditLog`), semáforo (`AptitudeRule`), debrief post-sesión
(`SessionDebrief`), motor de retención (`RetentionAlert`), invitaciones (`Invitation`) e imputación
de personal (`CenterMembership`).

> ⚠️ **Antes de escribir código, leer `AGENTS.md`.** Este proyecto usa **Next.js 16** con cambios
> de API/convenciones respecto a versiones anteriores: consultar las guías en
> `node_modules/next/dist/docs/` antes de tocar rutas, server actions o `proxy.ts`. Toda la capa
> de datos es **Prisma 7** (`@prisma/adapter-pg`) y el acceso se aísla por `orgId` en `src/lib/*`.

**Convención de marcadores:** 🆕 entidad/módulo nuevo · ➕ extiende algo existente · 🔁 sustituye un
mecanismo actual.

---

## 1. Estado: construido vs. pendiente (mapa rápido)

| Bloque de negocio | Regla(s) | Estado hoy | Falta |
|---|---|---|---|
| Embudo de Leads | §1 completo | ❌ No existe entidad `Lead` (solo `Member.state=PROSPECT`) | Módulo CRM completo 🆕 |
| Código postal + mapa | `RB-LEAD-010` | ❌ `Member.address` libre, sin CP | Campo `postalCode` + geo + mapa 🆕 |
| Alerta 24h sin responsable | `RB-LEAD-009` | ❌ | Regla + motor de notificaciones 🆕 |
| Razón de no cierre obligatoria | `RB-LEAD-011` | ❌ | Campo + validación bloqueante 🆕 |
| Bitácora del lead | `RB-LEAD-008` | ➕ `MemberNote` existe para socio | `LeadNote` (o reuso polimórfico) 🆕 |
| Entrenador responsable asignado | `RB-PERFIL-002` | ❌ Se deduce de la sesión | Relación `Member.trainerId` 🆕 |
| Servicio "online" + secciones condicionales | `RB-PERFIL-001` | ➕ `PlanType` sin `ONLINE` | Nuevo tipo + UI condicional ➕ |
| Objetivos concretos de salud | `RB-PERFIL-003` | ❌ | `ClientGoal` + catálogo editable 🆕 |
| Autorreserva EP + reserva manual | `RB-AGENDA-002/006/007` | ➕ Reserva solo para grupos | Franjas EP autorreservables ➕ |
| Check-in en EP | `RB-AGENDA-003` | ➕ `Booking.status` cubre grupos | Extender a EP ➕ |
| Entrenador que dirige la sesión | `RB-AGENDA-004` | ➕ `ClassSession.trainerId` existe | Confirmar director ≠ asignado ➕ |
| Rutinas / programación IA | `RB-IA-001/002/003` | ❌ | `WorkoutProgram` + agente interno 🆕 |
| Progreso visible al cliente | `RB-IA-004` | ➕ `MemberProgressEntry` existe | Vista/gráficas en portal ➕ |
| Autovaloración + recomendación | `RB-IA-005` | ❌ | `SelfAssessment` 🆕 |
| Definición de "estancado" | `RB-IA-007` | ➕ `RetentionAlert` existe | Regla combinada sobre señales ➕ |
| Check-in periódico de objetivos | `RB-IA-006` | ❌ | Programador configurable 🆕 |
| Chat centro–cliente | `RB-CHAT-001` | ❌ | `Conversation`/`ChatMessage` 🆕 |
| Cobros por Stripe | `RB-PAGO-001` | 🔁 `Payment` manual multi-método | Integración Stripe 🔁 |
| Registro horario + firma | `RB-RRHH-001/002` | ❌ | `TimeClockEntry` 🆕 |
| Buzón de propuestas | `RB-RRHH-003` | ❌ | `StaffProposal` 🆕 |
| Venta atribuida a trabajador | `RB-RRHH-004` | ❌ | `Payment.soldByUserId` 🆕 |
| Panel del entrenador | `RB-RRHH-005` | ❌ | Vista propia + métricas EP/grupos 🆕 |
| Alerta pocas sesiones programadas | `RB-RRHH-006` | ❌ | Regla temporal (<2 sem / 4 ses.) 🆕 |
| Notificaciones accionables (tareas) | `RB-RRHH-007` | ❌ | Motor de notificaciones 🆕 |
| Motor de ofertas + aprobación | `RB-RRHH-008/013` | ❌ | `PersonalizedOffer` con flujo 🆕 |
| Reporte semanal de comentarios | `RB-RRHH-010` | ❌ | Vista agregada 🆕 |
| Valoración de entrenadores (confid.) | `RB-RRHH-011/012` | ❌ | `TrainerRating` visible solo dirección 🆕 |
| BI: LTV, ticket medio | `RB-BI-002` | ➕ Panel existe (ocupación/ingresos) | Métricas nuevas ➕ |
| BI: demográficos/nicho | `RB-BI-003` | ❌ | Requiere ocupación + CP + edad ➕ |
| BI: objetivos agregado | `RB-BI-004` | ❌ | Depende de `ClientGoal`/check-in ➕ |

---

## 2. Cambios de modelo de datos (`prisma/schema.prisma`)

Todos los modelos nuevos llevan `orgId` (aislamiento multi-tenant) y `@@index([orgId])`, como el
resto del esquema. Se agrupan por bloque; los detalles de reglas están en `CRM_REGLAS_NEGOCIO.md`.

### 2.1. Embudo de Leads 🆕

```prisma
enum LeadStatus { SIN_CONTACTAR SEGUIMIENTO CON_FECHA_VALORACION CERRADO NO_CERRADO }

model Lead {
  id                String     @id @default(cuid())
  orgId             String
  centerId          String
  firstName         String
  lastName          String
  phone             String        // canal de reset por SMS (RB-LEAD-002)
  email             String?       // condicional (RB-LEAD-002)
  postalCode        String        // RB-LEAD-010 (estructurado, no libre)
  occupation        String        // "a qué se dedica" (alimenta BI nicho §9.3)
  goals             String        // texto libre
  hasTrainedBefore  Boolean
  hasTrainedNote    String?
  channel           String        // comoNosConocio (RB-LEAD-004, tabla configurable)
  status            LeadStatus @default(SIN_CONTACTAR)
  ownerUserId       String?       // responsable del contacto (RB-LEAD-003)
  contactedAt       DateTime   @default(now())   // fecha de contacto auto (RB-LEAD-001)
  noCloseReason     String?       // OBLIGATORIO al pasar a NO_CERRADO (RB-LEAD-011)
  convertedMemberId String?    @unique            // enlace al Member si CERRADO (RB-LEAD-007)
  createdAt         DateTime   @default(now())
  // healthRecords del lead: ver 2.1.b (Art. 9 RGPD)
  @@index([orgId]) @@index([centerId]) @@index([status])
}

model LeadNote {          // bitácora del lead (RB-LEAD-008), gemela de MemberNote
  id String @id @default(cuid())
  orgId String
  leadId String
  authorUserId String?
  body String
  createdAt DateTime @default(now())
  @@index([orgId]) @@index([leadId])
}
```

- **2.1.b — Salud del lead (Art. 9):** las lesiones/patologías del lead son dato Art. 9 igual que
  `HealthRecord` (`RB-LEAD-001`, `RB-PERFIL-004`). Opción recomendada: **no** crear una tabla
  paralela; permitir que `HealthRecord` cuelgue de un lead **o** de un member (añadir `leadId
  String?` a `HealthRecord`, con `memberId` ya opcionalizado), de modo que al convertir el lead
  (`RB-LEAD-007`) el registro solo cambie de FK y **no se recapture** el dato. Todo acceso sigue
  pasando por `lib/health-access.ts`.
- **Canales y motivos configurables** (`RB-LEAD-004`, `RB-LEAD-011`): tabla `ConfigList` genérica
  (o dos: `LeadChannel`, `NoCloseReason`) editable por dirección sin desplegar, misma filosofía que
  `AptitudeRule`. Evitar enums fijos en código para estas dos listas.

### 2.2. Perfil de cliente extendido ➕

Añadir a `Member`:

```prisma
  postalCode   String?     // RB-LEAD-010 (se traslada del lead)
  occupation   String?     // BI nicho §9.3
  channel      String?     // canal de origen heredado del lead
  originLeadId String?  @unique   // RB-LEAD-007 (trazabilidad lead → member)
  trainerId    String?     // RB-PERFIL-002: entrenador responsable asignado (EP y online)
```

- `trainerId` → relación `Member.trainer User? @relation("AssignedMemberTrainer")`. **Hoy el
  entrenador se deduce de la sesión; esto lo hace explícito** (aplica a EP y a **solo online**, por
  decisión §11.4). Los clientes de **solo grupos** dejan `trainerId = null` (responsable = Training
  Zone).
- Nuevo valor `ONLINE` en `enum PlanType` (`RB-PERFIL-001`). Las **secciones condicionales** del
  perfil se derivan de las `Subscription`/`MembershipPlan` activas (no un flag nuevo).

```prisma
model ClientGoal {                 // RB-PERFIL-003 (objetivos concretos, catálogo editable)
  id String @id @default(cuid())
  orgId String
  memberId String
  label String                     // "Hacer 1 flexión completa", etc.
  isTemplate Boolean @default(false) // fila de catálogo vs. objetivo asignado
  achievedAt DateTime?
  createdAt DateTime @default(now())
  @@index([orgId]) @@index([memberId])
}
```

### 2.3. Agenda EP ➕

- `RB-AGENDA-006/002/007`: modelar el hueco de EP. Reutilizar `ClassSession` con `classType =
  "PERSONAL_TRAINING"` y `capacity = 1`, más un flag de visibilidad:

```prisma
  // en ClassSession:
  selfBookable  Boolean @default(false)  // RB-AGENDA-002: franja abierta a autorreserva de EP
  directedByUserId String?               // RB-AGENDA-004: entrenador que la dirigió (≠ trainerId asignado)
```

  - `selfBookable = false` → hueco creado y reservado a mano por el entrenador (cliente que no usa
    app, `RB-AGENDA-002`). `true` → el cliente de EP puede cogerlo desde el portal.
  - Visibilidad (`RB-AGENDA-001`): filtrar en `agenda-queries.ts`/`portal-queries.ts` — el socio de
    EP solo ve sus franjas `selfBookable`; el de grupos solo ve sesiones de grupo con aforo.
- `RB-AGENDA-003` (check-in EP): ya cubierto por `Booking.status` (`ATTENDED`/`NO_SHOW`); solo hay
  que **exponer el tick en la ficha de sesión de EP**, no cambiar el esquema.

### 2.4. IA, autovaloración y chat 🆕

```prisma
enum WorkoutProgramStatus { DRAFT PENDING_TRAINER ACTIVE COMPLETED }

model WorkoutProgram {             // RB-IA-001/003 (rutina IA con confirmación humana)
  id String @id @default(cuid())
  orgId String
  memberId String
  createdByAI Boolean @default(true)
  confirmedByUserId String?        // entrenador que confirma (RB-IA-003)
  status WorkoutProgramStatus @default(DRAFT)
  payload Json                     // estructura de la rutina
  createdAt DateTime @default(now())
  @@index([orgId]) @@index([memberId])
}

model SelfAssessment {             // RB-IA-005 (autovaloración del cliente)
  id String @id @default(cuid())
  orgId String
  memberId String
  kind String                      // "mensual", "estancamiento", "check-in objetivos" (RB-IA-006)
  text String?
  structured Json?                 // respuestas cerradas (modificó objetivo / estancado / quiere más)
  aiRecommendation String?         // salida de la IA (RB-IA-005)
  createdAt DateTime @default(now())
  @@index([orgId]) @@index([memberId])
}

model Conversation {               // RB-CHAT-001
  id String @id @default(cuid())
  orgId String
  memberId String @unique
  createdAt DateTime @default(now())
  @@index([orgId])
}
model ChatMessage {
  id String @id @default(cuid())
  conversationId String
  senderKind String                // "MEMBER" | "TRAINER" | "AI" | "DIRECTION"
  senderUserId String?
  body String
  createdAt DateTime @default(now())
  @@index([conversationId])
}
```

- **Estancamiento (`RB-IA-007`)** no necesita tabla nueva: es una **regla** que combina
  `SelfAssessment` (texto) con señales objetivas ya calculables — `RetentionAlert.dropPct` (caída de
  asistencia), `SessionDebrief.rpe` sostenido bajo, y falta de progresión en
  `MemberProgressEntry`/`ClientGoal`. Implementar en un `lib/stall-detection.ts` que **reutiliza el
  motor de retención**, no lo duplica.

### 2.5. RRHH y ventas 🆕

```prisma
model TimeClockEntry {             // RB-RRHH-001/002 (registro horario + firma)
  id String @id @default(cuid())
  orgId String
  userId String
  centerId String
  workDate DateTime
  clockIn String                   // "HH:mm"
  clockOut String
  signedAt DateTime?               // firma digital de conformidad
  createdAt DateTime @default(now())
  @@index([orgId]) @@index([userId])
}

model StaffProposal {              // RB-RRHH-003 (buzón de sugerencias → dirección)
  id String @id @default(cuid())
  orgId String
  authorUserId String
  body String
  status String @default("OPEN")   // OPEN | REVIEWED
  createdAt DateTime @default(now())
  @@index([orgId])
}

enum OfferStatus { SUGERIDA PENDIENTE_DIRECCION APROBADA RECHAZADA COMUNICADA }

model PersonalizedOffer {          // RB-RRHH-008/013 (motor de ofertas + aprobación dirección)
  id String @id @default(cuid())
  orgId String
  memberId String
  proposedByUserId String?         // entrenador que la eleva
  approvedByUserId String?         // dirección (RB-RRHH-013: luz verde obligatoria)
  signals Json                     // señales que la dispararon (asistencia, antigüedad, RPE…)
  description String               // "2 días/semana con 20% dto. el primer mes", etc.
  status OfferStatus @default(SUGERIDA)
  createdAt DateTime @default(now())
  @@index([orgId]) @@index([memberId])
}

model TrainerRating {              // RB-RRHH-011/012 (valoración de entrenador, CONFIDENCIAL)
  id String @id @default(cuid())
  orgId String
  trainerUserId String
  memberId String                  // quién valora (no visible al entrenador)
  score Int?
  strengths String?
  improvements String?
  createdAt DateTime @default(now())
  @@index([orgId]) @@index([trainerUserId])
}
```

- **Venta atribuida (`RB-RRHH-004`):** añadir `soldByUserId String?` a `Payment` (y opcionalmente a
  `Subscription`). Alimenta el ranking de ventas por trabajador/mes.
- **Confidencialidad de `TrainerRating` (`RB-RRHH-012`):** es la **excepción** a "el entrenador ve
  los datos de su cliente". El acceso debe centralizarse (patrón `health-access.ts`) en un
  `lib/trainer-rating-access.ts` que **solo** deje leer a `OWNER`/`CENTER_DIRECTOR` y **nunca** al
  propio entrenador, ni sobre sí mismo.

### 2.6. Notificaciones / tareas 🆕 (transversal)

```prisma
enum NotificationKind { TASK ALERT INFO }

model Notification {               // RB-RRHH-007/006, RB-LEAD-009, RB-IA-005…
  id String @id @default(cuid())
  orgId String
  recipientUserId String
  kind NotificationKind @default(TASK)
  title String
  body String?
  entityType String?               // "Lead" | "Member" | "PersonalizedOffer"…
  entityId String?
  dueDate DateTime?
  resolvedAt DateTime?
  createdAt DateTime @default(now())
  @@index([orgId]) @@index([recipientUserId]) @@index([resolvedAt])
}
```

Este modelo es la base de casi todas las alertas del documento (24h sin responsable, pocas sesiones
programadas, valoración pendiente, oferta sugerida, estancamiento). Conviene construirlo **pronto**
porque muchos otros bloques dependen de él.

---

## 3. Backlog por fases (con dependencias)

Se continúa la numeración de fases del MVP (F0–F5, G, F6/F7). Cada fase agrupa reglas afines y
declara sus dependencias.

### F8 — Embudo de Leads / CRM comercial 🆕 *(sin dependencias — punto de entrada)*
- **Modelo:** `Lead`, `LeadNote`, `HealthRecord.leadId`, tablas configurables de canal y motivo.
- **Capa de datos:** `src/lib/leads-queries.ts` (CRUD + máquina de estados `RB-LEAD-005`, aislado
  por `orgId`).
- **Rutas:** `src/app/(app)/leads` (listado + tablero por estado), `leads/[id]` (ficha + bitácora),
  y **formulario público** `src/app/(public)/lead` (o `app/lead`) fuera del layout autenticado.
- **Reglas clave:** validación bloqueante de obligatorios (`RB-LEAD-001`), alta con teléfono o email
  (`RB-LEAD-002`), CP estructurado (`RB-LEAD-010`), motivo de no cierre obligatorio (`RB-LEAD-011`).
- **RBAC:** nuevas capacidades en `rbac.ts` (`canManageLeads`) para `OWNER`/`CENTER_DIRECTOR`/
  `RECEPTION`/`TRAINER`; entrada de navegación "Leads".
- **Cierre → Member (`RB-LEAD-005/007`):** al confirmarse el pago (ver F12/Stripe, o el cobro manual
  actual como puente), crear `Member` copiando datos y enlazando `originLeadId`; sin duplicar
  captura. Hasta que Stripe esté (F12), el cierre puede apoyarse en el `Payment` manual existente.

### F9 — Perfil de cliente extendido y entrenador responsable ➕ *(dep: F8 para `originLeadId`)*
- Campos nuevos en `Member` (`trainerId`, `postalCode`, `occupation`, `channel`, `originLeadId`).
- `PlanType.ONLINE` + secciones condicionales del perfil (`RB-PERFIL-001`), entrenador individual en
  online (`RB-PERFIL-002`, decisión §11.4).
- `ClientGoal` + catálogo editable (`RB-PERFIL-003`) y su vista en la ficha.
- Actualizar `members-queries.ts` y la ficha `members/[id]`. La bitácora ya existe (`MemberNote`).

### F10 — Infraestructura de notificaciones/tareas 🆕 *(transversal, habilita F8/F11/F13/F14)*
- `Notification` + `src/lib/notifications.ts` (crear/resolver/listar por usuario).
- UI: bandeja del entrenador y de dirección (campana/inbox) — `RB-RRHH-007`.
- Primeras reglas productoras: `RB-LEAD-009` (24h sin responsable, decisión §11.2).
- **Programador:** las reglas temporales (24h, pocas sesiones, check-ins periódicos) necesitan un
  disparador recurrente. En este stack (Next.js 16, sin worker) usar una **route handler
  programada** (cron externo/Vercel Cron llamando a `/api/jobs/*`) o un job en el arranque; dejar la
  lógica en `lib/` para que sea invocable desde cualquier disparador.

### F11 — Agenda EP: autorreserva, reserva manual y check-in ➕ *(dep: F9 `trainerId`)*
- `ClassSession.selfBookable` + `directedByUserId`; visibilidad segmentada en queries
  (`RB-AGENDA-001`).
- Flujo de reserva manual del entrenador vs. franja autorreservable (`RB-AGENDA-002`, decisión
  §11.5) — el entrenador con permiso para **crear/editar/añadir** franjas de EP.
- Check-in de EP reutilizando `Booking.status` (`RB-AGENDA-003`); registrar director de sesión
  (`RB-AGENDA-004`) para la verificación cruzada de F13.
- Objetivo futuro (política global de centro) documentado como iteración posterior, no bloqueante.

### F12 — Cobros por Stripe 🔁 *(sustituye el registro manual para clientes activos)*
- Integrar Stripe (`RB-PAGO-001`): checkout/domiciliación y **webhook** que confirma el cobro. El
  cierre del lead (`RB-LEAD-005`) pasa a depender del webhook, no de una acción manual.
- Mantener `Payment` como registro local, alimentado por el webhook; añadir `soldByUserId`
  (`RB-RRHH-004`). Migración cuidadosa: hoy `Payment.method` es multi-método manual.
- ⚠️ El README marca Stripe/VERI*FACTU como fuera del MVP por diseño (D3); esta fase **reabre** esa
  decisión conforme a `RB-PAGO-001`.

### F13 — RRHH: registro horario, propuestas, panel del entrenador 🆕
- `TimeClockEntry` (fichaje + firma, `RB-RRHH-001`) y **verificación cruzada** contra
  `ClassSession.directedByUserId` (`RB-RRHH-002`) — informe para dirección, no bloqueo de nómina.
- `StaffProposal` (buzón → dirección, `RB-RRHH-003`, notifica vía F10).
- **Panel del entrenador** (`RB-RRHH-005`): sus clientes de EP, horas de EP/grupos al mes, gráficos.
  Ruta nueva bajo `agenda`/`brief` o un `trainer/` propio.
- Alerta de **pocas sesiones programadas** (`RB-RRHH-006`, decisión §11.8): <2 semanas o ≤4 sesiones
  futuras → `Notification` al entrenador (regla temporal en F10).

### F14 — Motor de ofertas y valoración de entrenadores 🆕 *(dep: F10, señales de F11/G)*
- `PersonalizedOffer` con flujo de estados y **aprobación obligatoria de dirección** (`RB-RRHH-013`,
  decisión §11.7). El entrenador **eleva**, dirección **aprueba**, luego se comunica.
- Detección de estancamiento `RB-IA-007` (decisión §11.9) como señal de entrada, en
  `lib/stall-detection.ts` reutilizando `RetentionAlert`.
- `TrainerRating` confidencial (`RB-RRHH-011/012`) con acceso restringido a dirección
  (`lib/trainer-rating-access.ts`), periodicidad trimestral por defecto (F15).

### F15 — Programador de check-ins periódicos ⏱ *(dep: F10)*
- Check-in de objetivos (`RB-IA-006`) y valoración de entrenadores (`RB-RRHH-011`): **configurables
  por tipo de servicio** con defaults **mensual / trimestral** (decisión §11.6).
- Tabla de configuración de intervalos por `orgId` × tipo de servicio; el programador de F10 emite
  las `SelfAssessment`/encuestas de `TrainerRating` cuando toca.

### F16 — IA de programación y chat 🆕 *(dep: F9; se apoya en F6 del plan original)*
- `WorkoutProgram` con **confirmación humana** (`RB-IA-001/003`); agente de programación **solo para
  staff** (`RB-IA-002`).
- `Conversation`/`ChatMessage` (`RB-CHAT-001`) con visibilidad: entrenador asignado + dirección; la
  IA puede escribir. Reutilizar la matriz de §10 del documento de reglas.
- `SelfAssessment` + recomendación de IA (`RB-IA-005`); progreso visible al cliente (`RB-IA-004`,
  ya hay `MemberProgressEntry`, falta la vista en portal).

### F17 — BI / Analítica para dirección ➕ *(dep: F9, F12, F15 para tener los datos)*
- LTV y ticket medio (`RB-BI-002`), demográficos/nicho (`RB-BI-003`: edad, ocupación agrupada, % con
  hijos, % empresarios — requiere `occupation` y CP de F9), objetivos agregado (`RB-BI-004`, requiere
  `ClientGoal`/check-ins).
- **Mapa de radios** de leads/clientes por CP (`RB-LEAD-010`) en el panel de dirección.
- Extender `dashboard-queries.ts`; reutilizar Recharts (ya en el stack).

### Orden recomendado y camino crítico

```
F8 (Leads) ──► F9 (Perfil+trainerId) ──┬─► F11 (Agenda EP) ──► F13 (RRHH/horario)
                                        ├─► F16 (IA+chat)
F10 (Notificaciones) ──────────────────┼─► F13, F14, F15   (habilitador transversal)
                                        └─► F14 (Ofertas) ──► necesita señales de F11/G
F12 (Stripe) ──► cierra el bucle de F8 (RB-LEAD-005) y alimenta F17 (BI económico)
F15 (Programador) ──► F17 (BI de objetivos)
```

**Prioridad de negocio sugerida:** F8 → F10 → F9 → F11 → F13, dejando F12 (Stripe) y F14/F16 (IA)
como bloques mayores que se planifican aparte por su tamaño y dependencias externas (cuenta Stripe,
proveedor de IA).

---

## 4. Consideraciones transversales

- **RGPD / Art. 9:** todo dato de salud (lead o member) pasa por `lib/health-access.ts` y deja
  `AuditLog`. `TrainerRating` recibe el **mismo patrón de acceso centralizado**, pero con matriz
  invertida (solo dirección). No introducir lecturas directas de estos modelos fuera de sus
  *-access.
- **Multi-tenant:** cada modelo nuevo lleva `orgId` y toda query se filtra por él; no confiar en
  filtros de UI.
- **Configurabilidad sin desplegar:** canales (`RB-LEAD-004`), motivos de no cierre (`RB-LEAD-011`),
  catálogo de objetivos (`RB-PERFIL-003`), intervalos de check-in (`RB-IA-006`/`RB-RRHH-011`) y
  política de franjas EP (`RB-AGENDA-006`) deben ser **tablas editables por dirección**, no enums en
  código — misma filosofía que `AptitudeRule`.
- **Reutilización antes que duplicación:** estancamiento reutiliza `RetentionAlert`; RPE/nota
  reutiliza `SessionDebrief`; progreso reutiliza `MemberProgressEntry`; bitácora del member ya
  existe (`MemberNote`). Solo `LeadNote` es genuinamente nuevo (o un `Note` polimórfico lead/member).
- **Seed de demo (`prisma/seed.ts`):** cada fase debe ampliar el seed para poder enseñarla (leads en
  varios estados, franjas EP autorreservables, ofertas pendientes de aprobación, valoraciones
  confidenciales, notificaciones abiertas).
- **Programación temporal:** varias reglas (24h, pocas sesiones, check-ins periódicos) necesitan un
  disparador recurrente. Al no haber worker en el stack, centralizar la lógica en `lib/` e invocarla
  desde route handlers `/api/jobs/*` accionados por un cron externo.

## 5. Riesgos técnicos abiertos

1. **Stripe (F12) reabre una decisión de alcance** que el MVP dejó fuera a propósito (README, D3).
   Requiere cuenta, webhooks y probablemente VERI*FACTU para facturar en España — planificar como
   proyecto propio, no como campo más.
2. **Agente de IA (F16)** depende de un proveedor externo (el `IInsightProvider`/F6 del plan
   original). El modelo de datos (`WorkoutProgram`, `SelfAssessment`) puede construirse antes con la
   IA "mockeada" y confirmación humana siempre presente.
3. **Geocodificación del CP → mapa (RB-LEAD-010):** decidir proveedor (tabla local CP→coordenadas de
   España vs. servicio externo) por coste y privacidad.
4. **Programador recurrente:** sin infraestructura de jobs, las reglas temporales dependen de un cron
   externo fiable; definirlo antes de F10.

---

*Fin del documento. Emparejar con `CRM_REGLAS_NEGOCIO.md` v1.1: aquel define el "qué" y el "porqué"
(reglas y decisiones), este define el "cómo" y el "cuándo" (modelo, capas y fases).*
