# 03 · Agenda y reservas

Pantallas: `/agenda` (personal), `/agenda/session/[id]` (lista de la sesión),
`/portal/agenda` (socio) y sus equivalentes en la app. Descripción funcional en
[PRODUCTO_GESTION.md](../PRODUCTO_GESTION.md) §4.

Vocabulario: **EP** = entrenamiento personal (uno a uno). **Grupo** = grupo
reducido con aforo. **Bono** = `Subscription` con saldo de sesiones.

## Quién ve y quién reserva

### RB-AGENDA-001 · Visibilidad de huecos por tipo de socio

**Estado:** 🟢 Vigente

| | Ve sesiones de grupo | Ve huecos de EP |
|---|---|---|
| Socio de grupos | Sí, y reserva | No |
| Socio de EP | No | Solo las franjas abiertas a autorreserva (`RB-AGENDA-002`) |
| Personal | Sí | Sí, todas |

### RB-AGENDA-002 · EP: reserva manual o franja autorreservable

**Estado:** 🟢 Vigente

El EP lo agenda por defecto el entrenador. Para cada hueco elige entre
**reservarlo él** en nombre del socio o **publicarlo como autorreservable**
para que el socio lo coja desde el portal o la app. La reserva manual es de
primera clase: hay socios (p. ej. personas mayores) que no usan la app.

**Dónde vive:** `src/app/(app)/agenda/session-dialog.tsx`, `ClassSession.selfBookable`

### RB-AGENDA-006 · Quién publica franjas de EP

**Estado:** 🟡 Parcial · **Decisión:** §11.5

Las franjas las crea, edita y publica **cada entrenador** para sus socios de EP
(también Entrenador Admin y dirección).

- **Falta:** la decisión preveía una **política global de centro** (número de
  franjas, antelación mínima) fijada por dirección. No existe.

**Dónde vive:** `canManageEpSlots` en `src/lib/rbac.ts`, `src/app/api/mobile/v1/agenda/ep-slots/route.ts`

### RB-AGENDA-007 · Grupos: horario del centro y aforo

**Estado:** 🟢 Vigente

Las sesiones de grupo las programa el centro, cada una con su aforo. El socio
reserva solo en esas sesiones y dentro del aforo. El aforo por defecto de un
centro lo fija dirección o el Entrenador Admin de ese centro.

### RB-AGENDA-008 · El personal da o quita una plaza puntual de grupo

**Estado:** 🟢 Vigente

Recepción, entrenador o dirección pueden apuntar o desapuntar a un socio de una
sesión concreta desde su lista.

- Trata el bono **igual que la reserva del socio** (`RB-RES-006`): descuenta al
  reservar, devuelve al cancelar, sobre el bono de esa modalidad y centro.
- Solo a socios con bono activo y **del centro de la sesión** (`RB-SEG-003`),
  y sin superar el aforo: el personal no sobrevende ni apunta a lista de espera.
- **No existe el "socio fijo" de grupos** (decisión de agosto 2026): reservar el
  martes no apunta a los martes siguientes. La plaza recurrente es cosa del EP.
- La reserva se crea **antes** del cobro y el asiento del bono lleva su
  `bookingId` (QA-RES-08).

### RB-AGENDA-003 · Asistencia por socio, también en EP

**Estado:** 🟢 Vigente

En cada sesión, EP o grupo, se marca por socio **asistió / no asistió**. No se
puede pasar asistencia de una sesión que todavía no ha empezado (QA-RES-12);
desmarcar sí se permite siempre. Un socio puede tener varios bonos vivos a la vez.

### RB-AGENDA-004 · Quién dirigió de verdad la sesión

**Estado:** 🟢 Vigente

Se registra qué entrenador dirigió la sesión, que puede no ser el asignado
(sustituciones). Es el que cuenta en los paneles del entrenador.

## Reservas del socio

### RB-RES-001 · Antelación mínima para reservar

**Estado:** 🟢 Vigente

No se reserva una sesión que empieza en **menos de 30 minutos**. Valor fijo en
código, igual para todos los centros.

**Dónde vive:** `MIN_LEAD_MINUTES` en `src/lib/portal-queries.ts`

### RB-RES-002 · Ventana de reserva de 7 días

**Estado:** 🟢 Vigente

El socio solo ve y reserva sesiones de los **próximos 7 días**. Valor fijo en
código, igual para todos los centros.

**Dónde vive:** `BOOKING_WINDOW_DAYS` en `src/lib/portal-queries.ts`

### RB-RES-005 · Cancelar fuera de plazo pierde la sesión

**Estado:** 🟢 Vigente

Cancelar una reserva con menos antelación que la ventana de cancelación
(`RB-RES-011`) es posible, pero **la sesión no vuelve al bono**: cuenta como
consumida. El socio ve el aviso, con el número real de horas, antes de
confirmar. Una clase ya empezada no se puede cancelar.

### RB-RES-006 · Cancelar a tiempo devuelve la sesión

**Estado:** 🟢 Vigente

Reservar descuenta una sesión del bono de esa modalidad y centro; cancelar
dentro de plazo la devuelve **al mismo bono**. La lista de espera nunca
descuenta. Cada movimiento queda en el libro del bono (`RB-VENTA-008`).

### RB-AGENDA-009 · Una sola ventana de cancelación para todos

**Estado:** 🟢 Vigente · **Decisión:** D-S10

La ventana es **la misma** para el socio, el entrenador y recepción cuando
cancelan la misma reserva. El personal que cancela aplica la ventana del socio
y no puede cancelar una clase ya empezada (QA-RES-02).

**Dónde vive:** `canCancelWithoutPenalty` en `src/lib/portal-queries.ts`

### RB-RES-011 · La ventana de cancelación es del centro

**Estado:** ⚠️ En conflicto · **Decisión:** D-S9 · ver [P-03](./PENDIENTES_DE_DECIDIR.md#p-03)

Cada centro configura sus horas de cancelación gratuita, con **24 h** por defecto.

- **Hoy:** es **un único valor para toda la plataforma**
  (`CANCELLATION_WINDOW_HOURS` del entorno, 24 h si falta). No hay campo por
  centro. Sí se cumple que el número llega del servidor y nunca está escrito
  en la web ni en la app.

### RB-RES-012 · Las decisiones de reserva usan la hora del centro

**Estado:** 🟢 Vigente

Todo cálculo de plazos de una reserva (cancelable o no, empezada o no) usa la
**zona horaria del centro de esa sesión**, no la del dispositivo del usuario.

### RB-RES-008 · Días de apertura

**Estado:** 🟢 Vigente (revisada en E12-13)

Los centros operan **los siete días**. Existe un único punto (`isOperatingDay`)
por el que volvería a entrar un día de cierre, pero hoy no excluye ninguno. No
hay calendario de festivos ni de cierres por centro.

### RB-RES-007 · Aviso a la lista de espera

**Estado:** 🟢 Vigente

Cuando una cancelación (del socio o del personal) libera una plaza de una
sesión con lista de espera, se avisa por email **a todos los que esperan, a la
vez**. No hay promoción automática: la plaza es de quien la reclame primero con
el botón "Reservar". El paso a reservada es atómico: la sesión nunca se
sobrevende y al que llega tarde no se le cobra nada. Sin lista de espera, el
aviso va a los socios con bono activo de esa modalidad en ese centro.

### RB-RES-010 · Una reserva cancelada o en espera nunca pasa a "asistió"

**Estado:** 🟢 Vigente

`CANCELLED` y `WAITLISTED` no pueden pasar a `ATTENDED` desde ningún punto de
la aplicación (web, app, debrief, check-in). Las transiciones permitidas están
en un solo sitio.

**Dónde vive:** `assertBookingTransition` en `src/lib/booking-transitions.ts`

### RB-RES-009 · No-show con motivo y decisión sobre el bono

**Estado:** 🟢 Vigente

Marcar "no asistió" exige **motivo** (no avisó · avisó tarde · causa
justificada · error del centro) y **decidir** si la sesión vuelve al bono. Por
defecto no vuelve. Se puede marcar desde la web y desde la app.

- **Tres faltas seguidas "no avisó"** del mismo socio → tarea para dirección del
  centro. "Avisó tarde" y "causa justificada" cortan la racha; "error del
  centro" ni suma ni corta; una asistencia corta la racha.
- La racha se recalcula siempre desde el histórico, y la pasada diaria cierra
  alertas que ya no llegan al umbral.
- Un debrief sobre una falta devuelta vuelve a descontar la sesión (QA-RES-04).

**Dónde vive:** `src/lib/no-show-alerts.ts`, `src/app/(app)/agenda/session/[id]/actions.ts`

## Cambios en la agenda

### RB-AGENDA-010 · Borrar una sesión devuelve los bonos

**Estado:** 🟢 Vigente

Borrar una sesión devuelve la sesión al bono de cada socio apuntado a una
ocurrencia **que no ha empezado**, lo deja en auditoría y avisa. Si ya hay
asistencias registradas, pide una segunda confirmación. En una serie periódica
se elige el alcance: **solo ese día, ese y los siguientes, o toda la serie**
(QA-RES-05); lo mismo al arrastrar una ocurrencia a otra hora (QA-RES-03).

**Dónde vive:** `deleteSession` en `src/lib/agenda-queries.ts`

## Recordatorios

### RB-AGENDA-005 · Confirmación y recordatorio al socio

**Estado:** 🟡 Parcial

El socio ve siempre su reserva en "Mis próximas sesiones" y recibe
recordatorios (`RB-RES-013`).

- **Falta:** no se envía **confirmación por email al reservar**.

### RB-RES-013 · Recordatorios el día anterior y 2 horas antes

**Estado:** 🟡 Parcial · ver [P-04](./PENDIENTES_DE_DECIDIR.md#p-04)

Recordatorio por email **el día anterior** (según el calendario del centro) y
**2 horas antes**. Si se reserva con menos de 2 horas, solo llega el de 2 h.
Solo email: no hay notificaciones push.

- **Hoy:** la pasada de trabajos programados corre **una vez al día** (05:00
  UTC), así que el recordatorio de 2 h **no llega a tiempo** en la mayoría de
  sesiones. La lógica está lista para una cadencia horaria.

**Dónde vive:** `src/lib/session-reminders.ts`, `.github/workflows/jobs-cron.yml`
