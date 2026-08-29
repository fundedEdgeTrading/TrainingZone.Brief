# Salud — fases de una lesión, fecha de inicio y aviso de crónica

**Ámbito:** `HealthRecord` (A.2.4, dato del Art. 9 RGPD). No toca `MemberNote`
(la bitácora no clínica) ni ninguna otra sección de la ficha del socio.

---

## 1. El problema

El modelo sabía dos cosas de una lesión y ninguna de ellas era la que se
pregunta en el centro:

| Pregunta del entrenador | Antes | Ahora |
|---|---|---|
| ¿Cuándo se lesionó? | No se sabía. Solo constaba `reportedAt`, que es cuándo alguien lo escribió en la app | `injuryDate` (+ `injuryDateApprox`), y el "hace 3 meses" derivado en lectura |
| ¿Va a mejor? | `ACTIVE` o `RESOLVED`. No había forma de decir "está en rehabilitación" | `ACTIVE → IN_REHAB → RESOLVED`, más `CHRONIC` |
| ¿Quién le dio el alta y cuándo? | Un `AuditLog` con la acción `HEALTH_RECORD_RESOLVED`, y solo para ese salto | Un apunte por cada salto: `HEALTH_RECORD_STATUS_CHANGED` con `metadata.from/to` |
| ¿Este socio arrastra algo permanente? | Había que abrir el apartado "Salud" y leer los registros | Aviso fijo en la cabecera de la ficha |

---

## 2. Modelo

```prisma
enum HealthStatus {
  ACTIVE    // recién sufrida / vigente, sin plan de recuperación en marcha
  IN_REHAB  // en rehabilitación
  RESOLVED  // recuperada, ya no condiciona el entrenamiento
  CHRONIC   // permanente: no se espera que se resuelva
}

model HealthRecord {
  injuryDate       DateTime? // cuándo se produjo (≠ reportedAt)
  injuryDateApprox Boolean   @default(false) // solo se sabe mes y año
  statusChangedAt  DateTime? // último salto de fase (copia de lectura)
}
```

### 2.1. Por qué `CHRONIC` es un estado y NO se unifica con `CHRONIC_CONDITION`

`HealthRecordType.CHRONIC_CONDITION` ya existía, así que la primera reacción
razonable es "no dupliques el concepto". Se revisó y **no son el mismo
concepto**: son dos ejes y hacen falta los dos.

- `type` dice **qué es**: una lesión, una medicación, una alergia, una cirugía.
- `status` dice **en qué fase está**.

Los dos casos que obligan a mantenerlos separados:

1. **Una lesión que ya no se va a curar** (hernia L4-L5, hombro operado con
   limitación residual) es `type = INJURY` + `status = CHRONIC`. Tiene que
   seguir siendo una lesión: el Semáforo de Aptitud empareja por `zone`, y
   `CHRONIC_CONDITION` no lleva zona. Convertirla en `CHRONIC_CONDITION`
   apagaría el semáforo justo en el caso más limitante.
2. **Una condición crónica superada** (asma infantil que ya no cursa) es
   `type = CHRONIC_CONDITION` + `status = RESOLVED`. Si "crónico" fuera solo el
   tipo, no habría forma de decir que se dejó atrás sin borrar el registro.

Lo que sí queda unificado es el **comportamiento**: "¿esto es permanente?" se
pregunta en un único sitio, `isChronicHealthRecord()`
(`src/lib/health-status.ts`), que cubre las dos formas de serlo. Ningún otro
punto del código *decide* si algo es permanente comparando por su cuenta contra
`"CHRONIC"` o `"CHRONIC_CONDITION"` (sí los escribe, claro, al dar de alta un
registro o al pintar la lista de tipos del formulario).

### 2.2. El aviso de la ficha usa solo la fase, a propósito

`isChronicPhase()` (solo `status === CHRONIC`) es lo que enciende el aviso
permanente de la cabecera, y no `isChronicHealthRecord()`. Motivo: la captura de
salud del lead (RB-LEAD-001) escribe **todo** lo que declara el interesado con
`type = CHRONIC_CONDITION`, incluido «ninguna». Si el tipo encendiera el aviso,
media base de socios tendría una alerta roja permanente por haber contestado un
formulario. Marcar la fase `CHRONIC` es un acto explícito de alguien del centro:
es el dato en el que se puede confiar para poner un aviso en toda la ficha.

---

## 3. Vigente ≠ activa

Antes, "activa" y "vigente" eran sinónimos porque solo había dos fases. Con
cuatro ya no. Todas las consultas que filtraban `status: "ACTIVE"` pasan a
filtrar por `OPEN_HEALTH_STATUSES = [ACTIVE, IN_REHAB, CHRONIC]`:

| Consulta | Archivo |
|---|---|
| Semáforo de aptitud del panel del entrenador | `src/lib/trainer-panel-queries.ts` |
| Session Brief (roster + reglas de aptitud) | `src/lib/brief-queries.ts` |
| Transparencia de aptitud en el portal del socio | `src/lib/portal-queries.ts` |
| Criterios clínicos que salen hacia la IA (mesociclo) | `src/lib/health-access.ts` |
| Rótulo "N lesiones vigentes" del rail de la ficha | `src/app/(app)/members/[id]/page.tsx` |

Solo `RESOLVED` se cae. Una lesión en rehabilitación es justo la que más
adaptación necesita; una crónica no deja de limitar por ser antigua.

---

## 4. Semáforo de Aptitud (`AptitudeRule`) — comportamiento con las fases nuevas

**Revisado: `AptitudeRule` no cambia.** La regla empareja por zona
(`AptitudeRule.injuryZone` ↔ `HealthRecord.zone`) y produce una luz
(`GREEN|AMBER|RED`), un bloque afectado y una adaptación. **No mira el `status`
del registro y no debe hacerlo**: quién decide si una lesión cuenta es el lado
del registro (el filtro `OPEN_HEALTH_STATUSES`), no la regla.

Consecuencia, deliberada:

| Fase | ¿Enciende el semáforo? | Luz |
|---|---|---|
| `ACTIVE` | Sí | La de la regla de su zona |
| `IN_REHAB` | Sí | **La misma que ACTIVE** — no se rebaja |
| `CHRONIC` | Sí | **La misma que ACTIVE** — no se rebaja |
| `RESOLVED` | No | Ninguna |

Por qué no se rebaja la luz en rehabilitación, que es la tentación evidente: la
luz no dice "cuánto duele", dice **qué bloque hay que adaptar y cómo**. Una
rodilla en rehabilitación necesita exactamente la misma adaptación de sentadilla
que el día que se lesionó, o más cuidado. Rebajar automáticamente la luz sería
que el sistema tomara una decisión clínica que nadie le ha pedido.

Si en el futuro un centro quiere adaptaciones distintas por fase, el sitio
natural es añadir una regla por fase en `AptitudeRule`, no derivarla en código.
Hoy no hay demanda de eso y no se ha construido.

---

## 5. Permisos

Cambiar la fase pide **el mismo permiso que editar cualquier dato de salud**:
`canEditHealthData()` (dirección de organización, dirección de centro,
entrenador y entrenador admin). **No hay un rol adicional para "dar el alta"**:
quien puede registrar una lesión puede decir en qué fase está. Recepción y RRHH
siguen sin ver ni tocar nada de salud.

El control real está en `src/lib/health-access.ts`, no en la acción de servidor:
la acción solo valida entradas y el ámbito de centro.

---

## 6. Auditoría (ADR-008)

Cada salto de fase escribe un apunte append-only en `AuditLog`, por el mismo
punto único que el resto de accesos de salud:

```
action    HEALTH_RECORD_STATUS_CHANGED
entityId  <id del HealthRecord>
actorUserId  quién
createdAt    cuándo
metadata     { from: "ACTIVE", to: "IN_REHAB" }
```

Ese rastro **es** el histórico de fases. `HealthRecord.statusChangedAt` es solo
la copia de lectura del último cambio, para poder escribir "en rehabilitación
desde el 12/03" sin consultar el log. Repetir la fase que el registro ya tiene
(doble clic, dos pestañas) no escribe ni audita nada.

`HEALTH_RECORD_RESOLVED` se mantiene en el rótulo de la pantalla de auditoría
porque hay apuntes históricos con esa acción; ya no se escribe.

---

## 7. Fecha de la lesión y tiempo transcurrido

Se captura con la precisión que el socio recuerde, no con la que exige un
formulario:

- **Día exacto** → `injuryDate`, `injuryDateApprox = false`.
- **Solo mes y año** → día 1 del mes, `injuryDateApprox = true`.
- **No se sabe** → `injuryDate = null`. **No se rellena con `reportedAt`**: son
  datos distintos, y la ficha dice "Fecha de lesión no registrada" y cae a la
  fecha de registro, etiquetada como tal.

El tiempo transcurrido (`formatElapsedSince`) se calcula **siempre al leer y
nunca se guarda**: un campo `mesesDesdeLaLesion` en base de datos nace caducado.
Con `injuryDateApprox` la resolución baja a meses ("hace 3 meses", "este mes"):
decir "hace 12 días" de una fecha cuyo día es relleno sería precisión inventada.

---

## 8. Migración de los datos existentes

`prisma/migrations/20260829120000_health_record_injury_phases` es **puramente
aditiva**: no reescribe ni una fila.

- Los registros anteriores siguen en `ACTIVE` o `RESOLVED` con el mismo
  significado de siempre. `ACTIVE` sigue contando como vigente en todas las
  consultas del §3.
- `injuryDate` se queda a `null`, que es la verdad: nadie la capturó.
- `statusChangedAt` se rellena con `resolvedAt` donde lo había — lo único que se
  puede saber sin inventar.
- **No** se convierte ningún `CHRONIC_CONDITION` en `status = CHRONIC` (ver
  §2.2: arrastraría todas las declaraciones de lead, incluidas las vacías).

Cubierto por `src/lib/health-record-phases.test.ts`, que inserta filas con la
forma exacta del modelo anterior (SQL crudo, sin las columnas nuevas) y
comprueba que se leen y filtran igual.

---

## 9. Qué se toca en la UI

- **Cabecera de la ficha** (`page.tsx`): aviso permanente si hay alguna lesión
  en fase `CHRONIC`, con zona, descripción y tiempo transcurrido. Visible se
  abra la ficha por donde se abra, no solo en "Salud". Solo para quien tiene
  permiso de ver salud — el aviso ya es un dato del Art. 9.
- **Apartado "Salud"**: desplegable de fase en cada registro (sustituye al botón
  único "Marcar resuelta"), tiempo transcurrido y fecha de lesión en cada
  tarjeta, y leyenda de qué significa cada fase.
- **Alta de registro**: selector de precisión de la fecha (día exacto / solo mes
  y año / no se conoce) y el campo correspondiente. No se aceptan fechas futuras.

---

## 10. Tests

| Archivo | Cubre |
|---|---|
| `src/lib/health-status.test.ts` | Tiempo transcurrido (días/semanas/meses/años), fechas aproximadas, fecha futura, meses por calendario, `OPEN_HEALTH_STATUSES`, detección de crónica |
| `src/lib/health-record-phases.test.ts` | Contra Postgres real: compatibilidad de los datos existentes, ciclo completo de fases, auditoría de quién y cuándo, `resolvedAt` en una recaída, permisos y aislamiento entre organizaciones |
