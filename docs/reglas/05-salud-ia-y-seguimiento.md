# 05 · Salud, IA y seguimiento

Pantallas: `/health`, `/health/aptitude-rules`, `/brief` (Session Brief),
`/feedback`, mesociclos en la ficha del socio, `/portal/evolucion`. Descripción
funcional en [PRODUCTO_GESTION.md](../PRODUCTO_GESTION.md) §2, §3 y §6.

> **Antes de tocar este dominio:** los datos de salud son categoría especial
> (art. 9 RGPD). Cualquier regla nueva que cambie quién ve o qué se guarda pasa
> también por revisión de cumplimiento (`docs/legal/`).

## Salud y aptitud

### Quién ve los datos de salud (sin número `RB`)

**Estado:** 🟢 Vigente

Ven y editan salud: dirección de organización, dirección de centro, entrenador y
Entrenador Admin, siempre dentro de su ámbito de centro. **Recepción, RRHH y el
soporte de plataforma no.** Toda lectura deja rastro en auditoría. A quien no
tiene permiso se le devuelve "no hay dato", nunca un error que revele que existe.

**Dónde vive:** `src/lib/health-access.ts`, `canViewHealthData` en `src/lib/rbac.ts`

### RB-SALUD-010 · Una condición sin regla nunca es "sin restricciones"

**Estado:** 🟢 Vigente

Si el socio declara una condición que no tiene regla de aptitud asignada, se
pinta en **ámbar**, en la web y en la app; nunca en verde.

### RB-SALUD-011 · Zonas de lesión de catálogo cerrado

**Estado:** 🟢 Vigente

La zona de una lesión se elige de una lista cerrada, con la lateralidad
(izquierda/derecha) como dato aparte. Nada de texto libre.

**Dónde vive:** `src/lib/injury-zones.ts`

### RB-SALUD-012 · Semáforo de aptitud

**Estado:** 🟢 Vigente

De las condiciones declaradas sale una luz para el entrenador:
- condición sin regla → **ámbar**;
- varias condiciones → manda **la más restrictiva**;
- "Sin restricciones" solo si **no hay ninguna** condición;
- solo una condición **resuelta** deja de contar.

Las reglas de aptitud las edita dirección (`/health/aptitude-rules`).

**Dónde vive:** `src/lib/aptitude-light.ts`

### RB-SALUD-013 · Composición corporal sin rangos inventados

**Estado:** 🟢 Vigente

Los rangos de referencia (grasa, etc.) dependen de **sexo y tramo de edad** y los
define la organización. **No hay valores por defecto**: sin rango para ese sexo
y edad, el dato se enseña sin color.

**Dónde vive:** `src/lib/reference-ranges.ts`

### RB-SALUD-014 · Derivación a fisioterapia

**Estado:** ✅ Aprobada, sin construir (E3-14)

La derivación a fisio debe ser un registro propio (quién deriva, a quién,
cuándo, con qué resultado), no una nota. No existe todavía.

## IA

### RB-IA-002 · La IA de programación es herramienta del personal

**Estado:** 🟢 Vigente

La IA que genera mesociclos la usan solo entrenadores y dirección. **No es un
chat de IA con el socio.** Requiere el plan con `ia_programacion` (Avanzado con
cupo de 20 generaciones al mes, Élite sin cupo; Fundador no la incluye) y se
comprueba **antes** de llamar al modelo (`RB-PLAT-009`).

### Mesociclo: confirmación humana (sin número `RB`, citada como "§7.4")

**Estado:** 🟢 Vigente

Todo mesociclo generado por IA **nace en borrador** y solo pasa a activo cuando
un entrenador lo aprueba.

### RB-MESO-005 · El mesociclo está en el calendario

**Estado:** 🟢 Vigente

Un mesociclo tiene fecha de inicio, semana en curso, fases con progresión y
semanas de descarga declaradas.

### RB-IA-004 · A la IA no le llegan datos que identifiquen al socio

**Estado:** 🟢 Vigente · **Condición:** D-C5 (contrato de encargo con el proveedor de IA firmado antes del piloto)

Todo texto libre que se envía al modelo pasa por un filtro de identificadores
(nombres, teléfonos, emails…) y queda constancia de que pasó.

**Dónde vive:** `src/lib/ai/pseudonymize.ts`, `src/lib/health-access.ts`

### RB-IA-005 · Autovaloración del socio y estancamiento

**Estado:** 🟢 Vigente

El socio rellena autovaloraciones (cómo se siente, si nota estancamiento). Si
apuntan a estancamiento (ver `RB-IA-007`), se avisa al entrenador para que
contacte y valore una acción comercial. Además: abrir un mesociclo con criterios
clínicos queda auditado, y la conversación con la IA se borra al aprobarlo.

### RB-IA-006 · Check-in periódico de objetivos

**Estado:** 🟢 Vigente · **Decisión:** §11.6

Cada cierto tiempo se pregunta al socio si su objetivo ha cambiado, si se ve
estancado o si quiere más. Periodicidad **configurable por tipo de servicio**
(EP, grupos, online) desde `/rrhh`, **30 días por defecto**.

**Dónde vive:** `src/lib/checkin-schedule.ts`

### RB-IA-007 · Qué es un socio estancado

**Estado:** 🟢 Vigente · **Decisión:** §11.9

Se combina la autovaloración con señales objetivas: caída de asistencia frente a
su patrón, esfuerzo percibido (RPE) bajo sostenido y ausencia de progresión en
sus marcadores u objetivos. Basta la autovaloración **o** el umbral de señales
objetivas. Reutiliza el motor de retención, no uno paralelo.

**Dónde vive:** `src/lib/stall-detection.ts`

### RB-IA-001 / RB-IA-003 · Rutinas para casa generadas por IA

**Estado:** ⏸️ Apagada · **Decisión:** D-P6 (E12-01)

El socio pedía una rutina para casa y la IA la preparaba para que el entrenador
la confirmara. Se apagó: no había pantalla donde el entrenador la confirmase y
la "IA" era fingida. Volver a encenderla exige diseñarla de nuevo.

## Feedback de sesión

### RB-FB-101 · Debrief del entrenador

**Estado:** 🟢 Vigente

Tras cada sesión el entrenador registra, por asistente, sensación (🟢🟡🔴),
esfuerzo (RPE 1-10) y una nota corta, en menos de 20 segundos desde el Session
Brief. Lo ve el equipo. (Cubre también `RB-RRHH-009`.)

### RB-FB-102 · Feedback del socio sobre la sesión

**Estado:** 🟢 Vigente

El socio deja su propia sensación y esfuerzo percibido de la sesión desde el
portal; se enseña junto al debrief del entrenador.

### RB-FB-103 · Valoración del entrenador por los socios

**Estado:** 🟢 Vigente

Ver `RB-RRHH-011` y `RB-RRHH-012`: confidencial, solo dirección.

### RB-FB-104 · Informe semanal de debriefs

**Estado:** 🟢 Vigente

Vista semanal de solo lectura para dirección con los debriefs agrupados por
sesión y entrenador (`/feedback/debriefs-semanales`). Respeta el ámbito de
centro (`RB-SEG-003`). (Cubre `RB-RRHH-010`.)
