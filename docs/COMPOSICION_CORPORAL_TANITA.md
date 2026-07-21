# TRAINING ZONE — Módulo de Composición Corporal (Bioimpedancia / Tanita)

**Documento de trabajo interno · v1.0**
**Origen:** análisis de un informe real de bioimpedancia **Tanita (MyTanita)** de un cliente
(báscula de composición corporal). El objetivo es evaluar qué de ese informe encaja en la app y
convertirlo en una funcionalidad nueva, alineada con las reglas de negocio ya cerradas
(`CRM_REGLAS_NEGOCIO.md` v1.1) y con el plan de implementación (`CRM_IMPLEMENTACION_FUNCIONALIDADES.md`).

> ⚠️ **Antes de escribir código, leer `AGENTS.md`.** Next.js 16 + Prisma 7, acceso aislado por
> `orgId` en `src/lib/*`. Este documento define el "qué" y "cómo" del módulo; **no** reescribe reglas
> ya existentes, las **referencia** (`RB-*`).

**Convención de marcadores:** 🆕 entidad/módulo nuevo · ➕ extiende algo existente · 🔁 sustituye.

---

## 1. Qué contiene el informe Tanita analizado

El PDF (`MyTanita`, cliente de 170 cm / 28 años, con histórico de 3 tomas: 26.11.2025, 09.04.2026,
28.04.2026) es una medición de **bioimpedancia** con estos indicadores:

| Indicador Tanita | Ejemplo del informe | Ya en la app | Encaje |
|---|---|---|---|
| Peso | 68.55 kg | ✅ `MemberProgressEntry.weightKg` | Reusar |
| % Grasa corporal | 14.90 % | ✅ `MemberProgressEntry.bodyFatPct` | Reusar |
| Masa grasa (kg) | 10.21 kg | ❌ | Nuevo campo |
| Masa muscular | 55.40 kg | ❌ | Nuevo campo |
| Masa magra / libre de grasa | 58.34 kg | ❌ | Nuevo campo |
| Agua corporal (%) | 64.00 % | ❌ | Nuevo campo |
| Masa ósea | 2.90 kg | ❌ | Nuevo campo |
| Grasa visceral (rating) | 3 | ❌ | Nuevo campo |
| Metabolismo basal (BMR) | 1702 kcal / 7121 kJ | ❌ | Nuevo campo |
| Edad metabólica | 18 años | ❌ | Nuevo campo |
| IMC (BMI) | 23.70 | ➖ derivable de peso+altura | Calculado |
| Rangos de referencia | 53–72 kg, 8–19 %, 18.5–25 IMC | ❌ | Config/rango |
| **Análisis segmental** (brazos/piernas/tronco: grasa y músculo por segmento) | 13.2 % / 10.4 % / 7.3 %… | ❌ | JSON segmental |
| Histórico de tomas | 3 fechas comparadas | ➕ ya hay serie temporal | Reusar patrón |

**Conclusión:** encaja de lleno. La app **ya** mide peso y % grasa en `MemberProgressEntry` y ya
tiene el requisito de "progreso visible al cliente" (`RB-IA-004`) y de gráficas de progresión. Un
informe Tanita es exactamente una **toma de composición corporal enriquecida**: extiende lo que ya
existe en lugar de crear un sistema paralelo.

---

## 2. Encaje con las reglas de negocio existentes

- **`RB-IA-004` (progreso visible al cliente):** la composición corporal es justo el tipo de dato
  "peso, marcas, cumplimiento" que el cliente debe ver graficado en su portal. Este módulo es una
  fuente de datos más de esa vista, no una pantalla nueva aislada.
- **`RB-PERFIL-003` / `ClientGoal` (objetivos de salud medibles):** los rangos de referencia del
  Tanita (% grasa objetivo, peso objetivo, edad metabólica) se convierten en objetivos concretos y
  comparables. "Bajar del 14.9 % al 12 % de grasa" es un `ClientGoal` medible.
- **`RB-IA-007` (detección de estancamiento):** la **ausencia de progresión en marcadores clave** ya
  es una de las señales objetivas de estancamiento. La serie de composición corporal (grasa/músculo
  que no se mueven en X semanas) es una señal directa para `lib/stall-detection.ts`, sin motor nuevo.
- **`RB-IA-005` (autovaloración + recomendación IA):** una toma nueva de Tanita puede disparar la
  recomendación de la IA (p. ej. "sube masa muscular, mantén grasa → progresa bien").
- **Art. 9 RGPD (`RB-PERFIL-004`):** la composición corporal es **dato de salud**. Debe seguir el
  mismo tratamiento que `HealthRecord`: consentimiento, acceso restringido (entrenador asignado +
  dirección) y `AuditLog` en cada lectura. Ver §5.
- **`RB-BI-003` (BI demográfico/nicho):** métricas agregadas de composición (edad metabólica media,
  % de clientes que mejoran grasa) enriquecen el panel de dirección, sin ser el foco principal.

---

## 3. Cambios de modelo de datos (`prisma/schema.prisma`)

Dos opciones; se recomienda la **A** (extender) por reutilización, coherente con la filosofía del
plan ("reutilización antes que duplicación").

### Opción A (recomendada) — extender `MemberProgressEntry` ➕

Añadir campos opcionales a la entidad de progreso ya existente, más un origen de la toma:

```prisma
// en MemberProgressEntry (ya tiene weightKg, bodyFatPct, waistCm, fotos):
  muscleMassKg     Float?    // masa muscular (55.40 kg)
  fatMassKg        Float?    // masa grasa (10.21 kg)
  fatFreeMassKg    Float?    // masa magra / libre de grasa (58.34 kg)
  bodyWaterPct     Float?    // agua corporal (64.00 %)
  boneMassKg       Float?    // masa ósea (2.90 kg)
  visceralFatRating Int?     // grasa visceral (3)
  bmrKcal          Int?      // metabolismo basal (1702 kcal)
  metabolicAge     Int?      // edad metabólica (18)
  bmi              Float?    // IMC (derivable; se guarda para histórico)
  segmental        Json?     // análisis por segmento: brazos/piernas/tronco {grasa, musculo}
  source           String?   @default("MANUAL")  // "MANUAL" | "TANITA" | "IMPORT"
  measuredAt       DateTime? // fecha real de la medición (≠ createdAt) para el histórico
```

- `segmental` en `Json`: estructura sugerida
  `{ "armRight": {"fatPct":13.2,"musKg":..}, "armLeft":..., "legRight":..., "legLeft":..., "trunk":.. }`.
- **IMC / masa magra** son derivables; se guardan igualmente para no depender de recalcular contra
  una altura que puede cambiar. La altura vive en `Member` (o `HealthRecord`); si no existe, añadir
  `heightCm Int?` a `Member`.
- **No** se crea entidad nueva: una "toma Tanita" es una fila de `MemberProgressEntry` con
  `source = "TANITA"` y estos campos rellenos. La serie temporal y las gráficas de `RB-IA-004` ya
  funcionan sobre esta tabla.

### Opción B — entidad dedicada `BodyCompositionEntry` 🆕

Solo si se prefiere aislar la bioimpedancia del progreso "manual" (peso/foto). Mismo set de campos
que arriba + `orgId`, `memberId`, `@@index([orgId])`, `@@index([memberId])`. Coste: duplica la lógica
de series/gráficas ya montada sobre `MemberProgressEntry`. **Descartada salvo petición expresa.**

### Rangos de referencia configurables ➕

Los rangos del Tanita (peso saludable, % grasa, IMC por sexo/edad) deben ser **tabla editable**, no
hardcode — misma filosofía que `AptitudeRule` (`RB-LEAD-004`). Una `ConfigList`/`ReferenceRange` por
`orgId` con `{ metric, sex, ageMin, ageMax, min, max }` alimenta los semáforos verde/amarillo de la
ficha.

---

## 4. Captura de datos: cómo entran las tomas

Tres vías, de menor a mayor esfuerzo:

1. **Entrada manual por el entrenador** (v1, sin dependencias). Formulario en la ficha del socio para
   teclear los valores de una toma tras pasar la báscula. Cubre el 100 % del caso de uso desde el día
   uno.
2. **Importación por texto pegado de MyTanita** ➕. La app móvil **no exporta CSV**: solo comparte un
   texto plano tras cada medición (`* Peso: 68,55 kg`, `* Grasa corporal: 14,9 %` + desglose por
   segmento). `lib/tanita-parse.ts` interpreta ese texto pegado en un `<textarea>` y crea
   `MemberProgressEntry` con `source = "TANITA"`. El PDF es maquetado/posicional (difícil de parsear
   de forma robusta): se descarta como fuente automática; el texto de "Compartir" es la vía estable.
3. **Integración API con Tanita Health Connect** (futuro, riesgo externo). Depende de credenciales y
   disponibilidad del proveedor; planificar aparte, igual que Stripe (F12) o la IA (F16). No bloquea
   las vías 1 y 2.

---

## 5. Acceso, privacidad y multi-tenant

- **Art. 9 RGPD:** toda lectura/escritura de composición corporal pasa por la capa de acceso a salud
  (`lib/health-access.ts`) y deja `AuditLog`, exactamente como `HealthRecord` (`RB-PERFIL-004`). No
  introducir lecturas directas del modelo fuera de esa capa.
- **Visibilidad (matriz §10 de reglas):** el **cliente** ve sus propias tomas y gráficas
  (`RB-IA-004`); el **entrenador asignado** y **dirección** las ven; entrenadores no asignados, no.
- **Multi-tenant:** si se usa Opción B, `orgId` obligatorio y filtrado en toda query. En Opción A se
  hereda de `Member`.

---

## 6. UI / dónde se ve

- **Ficha del socio (`members/[id]`):** nueva pestaña/sección "Composición corporal" con la última
  toma (tarjetas de peso, % grasa, músculo, grasa visceral, edad metabólica) y semáforo contra el
  rango de referencia (§3).
- **Gráficas de evolución:** reutilizar **Recharts** (ya en el stack) sobre la serie de
  `MemberProgressEntry`: peso vs. músculo vs. grasa en el tiempo, replicando el "histórico de 3 tomas"
  que muestra el propio Tanita. Encaja en la vista de progreso de `RB-IA-004`.
- **Portal del cliente:** versión de solo lectura de esas gráficas, con su objetivo (`ClientGoal`)
  marcado sobre la curva.
- **Estética:** respetar `BRANDING.md` / `UX_PREMIUM_PLAN.md` (beige/negro, Poppins, sin degradados,
  tokens `brand-*`, sin hex sueltos). Consultar `dataviz` antes de definir colores de las series.

---

## 7. Encaje en el backlog de fases

Este módulo **no** abre una fase nueva de peso: se acopla a fases ya planificadas.

| Trabajo | Fase existente | Nota |
|---|---|---|
| Campos de composición en `MemberProgressEntry` + entrada manual | **F9** (perfil extendido) | Va con `ClientGoal` y la ficha del socio |
| Gráficas de evolución en ficha y portal | **F16** / vista de `RB-IA-004` | Reusa Recharts y la serie existente |
| Señal de estancamiento por falta de progresión | **F14** (`lib/stall-detection.ts`) | Composición estancada = señal objetiva `RB-IA-007` |
| Rangos de referencia configurables | **F9** | Tabla editable estilo `AptitudeRule` |
| Métricas agregadas de composición | **F17** (BI) | Enriquece `RB-BI-003`, no lo sustituye |
| Importación por texto pegado MyTanita | Iteración propia (post-F9) | Parser aislado en `lib/tanita-parse.ts` |
| API Tanita Health Connect | Futuro / riesgo externo | Planificar aparte como Stripe/IA |

**Prioridad sugerida:** (1) campos + entrada manual + ficha con semáforos → (2) gráficas de evolución
→ (3) señal de estancamiento → (4) importación por texto pegado → (5) API. Las tres primeras aportan
valor sin dependencias externas.

---

## 8. Riesgos y decisiones abiertas

1. **Altura del socio:** las métricas derivadas (IMC, edad metabólica de referencia) requieren
   `heightCm`. Decidir si vive en `Member` o en `HealthRecord`. Recomendado: `Member.heightCm`.
2. **Parseo del PDF Tanita:** el PDF es posicional y frágil (el informe analizado mezcla valores sin
   etiquetas claras). La app **no exporta CSV**; se usa el texto de "Compartir" (`lib/tanita-parse.ts`)
   como única vía de importación automática, con el PDF solo como adjunto de respaldo.
3. **Rangos por sexo/edad:** los rangos saludables dependen de sexo y edad; la tabla de referencia
   debe contemplarlo. Requiere el sexo del socio (dato Art. 9 si se infiere de salud).
4. **Frecuencia de toma:** definir si la toma de composición sigue el mismo programador de check-ins
   periódicos (`RB-IA-006`, F15) o es puntual a criterio del entrenador. Recomendado: puntual +
   recordatorio opcional configurable.

---

*Fin del documento. Emparejar con `CRM_REGLAS_NEGOCIO.md` (reglas) y
`CRM_IMPLEMENTACION_FUNCIONALIDADES.md` (fases): este documento añade la fuente de datos de
composición corporal reutilizando `MemberProgressEntry` y las reglas de progreso/salud ya existentes.*
