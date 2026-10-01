# 06 · Equipo y tareas

Pantallas: `/organization` (personal), `/rrhh`, `/trainer` (panel del
entrenador), `/tareas`. Descripción funcional en
[PRODUCTO_GESTION.md](../PRODUCTO_GESTION.md) §7 y §8.

## Roles (resumen; la fuente es `src/lib/rbac.ts`)

| Rol | Qué es |
|---|---|
| Dirección de organización (`OWNER`) | Manda en todos sus centros |
| Dirección de centro (`CENTER_DIRECTOR`) | Acotada a sus centros |
| Entrenador Admin (`TRAINER_ADMIN`) | Entrenador con mando en su centro: aforo, ajuste de bonos, reparto de tareas |
| Entrenador (`TRAINER`) | Da sesiones, ve salud de sus socios |
| Recepción (`RECEPTION`) | Mostrador y cobros. **Sin salud** |
| RRHH (`HR_MANAGER`) | Altas de personal e imputación a centros. **Sin salud** |
| Socio (`MEMBER`) | Portal y app |
| Soporte de Apta (`PLATFORM_ADMIN`) | Solo para la organización de plataforma; no se puede asignar desde un gimnasio (QA-ALTA-01) |

Los rótulos y permisos son **una sola tabla para web y app**. Cambiar un
permiso es cambiar una regla: escríbelo aquí primero.

## Personal

### RB-RRHH-014 · La baja de plantilla es de dirección

**Estado:** 🟢 Vigente

- **Quién:** dirección de organización o de centro, nunca RRHH. Dirección de
  centro solo alcanza a personas imputadas a sus centros, y nunca a un rol de
  ámbito organización. Nadie se da de baja a sí mismo y la organización no se
  queda sin dirección.
- **Qué hace:** quita el acceso (web y app), la invitación pendiente y la
  imputación a centros. **Conserva** lo hecho: mesociclos, valoraciones,
  clases, cobros atribuidos. Solo si de la persona no cuelga nada se borra la
  fila y se libera su email.
- **Precondición:** no tener sesiones asignadas por delante; se reasignan antes.
- Una baja con histórico se puede **reincorporar**.
- "Tu equipo" solo cuenta personal en activo (QA-ALTA-16); al personal con
  invitación pendiente se le puede **reenviar** (QA-ALTA-10).

### RB-RRHH-004 · Ventas atribuidas a quien vende

**Estado:** 🟢 Vigente

Toda venta (cierre de lead, bono, venta puntual) anota quién la hizo; alimenta
el ranking de ventas por trabajador y mes en `/rrhh`. La venta de recepción se
atribuye al centro elegido, validado con su ámbito (STR-07).

### RB-RRHH-011 · Valoración de entrenadores por los socios

**Estado:** 🟢 Vigente · **Decisión:** §11.6

Periódicamente se pregunta a los socios por su entrenador (fortalezas, áreas de
mejora, puntuación). Periodicidad **configurable por tipo de servicio**, **90
días por defecto**.

### RB-RRHH-012 · Esa valoración es exclusiva de dirección

**Estado:** 🟢 Vigente

Ningún entrenador la ve, ni sobre sí mismo. El entrenador puede solicitar una
conversación con dirección sobre ella.

### RB-RRHH-005 · Panel del entrenador

**Estado:** 🟢 Vigente

El entrenador tiene su panel operativo (`/trainer`): agenda de hoy, pendientes,
sus socios de EP con su evolución y el semáforo de aptitud (calculado como en el
Brief, sin enseñar la descripción clínica, QA-RES-06).

### RB-RRHH-006 · Alerta: a un socio de EP le quedan pocas sesiones programadas

**Estado:** 🟢 Vigente · **Decisión:** §11.8

Tarea para el entrenador responsable cuando al socio de EP le quedan **menos de
2 semanas** de sesiones programadas en el calendario **o 4 sesiones o menos**,
lo que ocurra antes. (Calendario futuro, no saldo del bono.)

### RB-RRHH-007 · Notificaciones accionables al entrenador

**Estado:** 🟢 Vigente

El entrenador recibe avisos en forma de tarea: valoración pendiente, bono a
punto de agotarse ("¿va a renovar?"), socio estancado, etc. El motor de alertas
tiene un **tope semanal** para no inundar el tablero; las tareas del equipo no
cuentan para ese tope.

### RB-RRHH-009 · RPE y nota tras la sesión

**Estado:** 🟢 Vigente — es el debrief, `RB-FB-101`.

### RB-RRHH-010 · Informe semanal de comentarios

**Estado:** ⚠️ En conflicto · ver [P-05](./PENDIENTES_DE_DECIDIR.md#p-05)

La regla decía "un informe semanal **para todo el equipo**". El informe existe
(`RB-FB-104`) pero **solo lo ve dirección**.

### RB-RRHH-001 / RB-RRHH-002 · Registro horario y verificación cruzada

**Estado:** ⏸️ Apagada · **Decisión:** E10-21

El fichaje está apagado: el modelo no admitía pausas ni jornadas partidas y el
registro de jornada es obligación legal (hacerlo bien o no hacerlo). `/rrhh`
dice expresamente que Apta no presta registro de jornada. Los fichajes
antiguos se exportan con `npm run export:fichajes` (conservación de 4 años).

### ~~RB-RRHH-003~~ · Buzón de propuestas — 🗑️ Retirada (23-08-2026)

### ~~RB-RRHH-008 / RB-RRHH-013~~ · Ofertas personalizadas — 🗑️ Retirada (23-08-2026)

El motor de ofertas se eliminó del producto. Si el upsell vuelve, se plantea
desde cero con números nuevos.

## Tareas

### RB-TASK-001 · Encargar trabajo a otro exige permiso

**Estado:** 🟢 Vigente

Crear una tarea para otra persona o reasignar la de otro: dirección y
Entrenador Admin. El resto gestiona lo suyo (mover de columna, completar) y
puede crearse tareas a sí mismo. El soporte de plataforma no reparte tareas
dentro de un gimnasio.

### RB-TASK-002 · Reasignar no cambia quién la pidió

**Estado:** 🟢 Vigente

Al reasignar cambia quién la hace, nunca quién la encargó.

### RB-TASK-003 · Una tarea completada sale de las vistas activas

**Estado:** 🟢 Vigente

Completar la saca del tablero; la columna "Hecha" enseña solo lo cerrado en las
**últimas 24 horas** y remite al histórico.
