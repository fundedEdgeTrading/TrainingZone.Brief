# TRAINING ZONE — Implementación del Módulo de Composición Corporal (Tanita)

**Documento de trabajo interno · v1.0**
**Objetivo:** convertir el backlog sugerido en `COMPOSICION_CORPORAL_TANITA.md` (§7) en un plan de
implementación **accionable sobre el código que ya existe**. No repite el "qué" ni el "porqué" (eso
está en el doc de composición y en `CRM_REGLAS_NEGOCIO.md`): define el **cómo**, **en qué ficheros**
y **en qué orden**, con las rutas reales del repo.

> ⚠️ **Antes de escribir código, leer `AGENTS.md`.** Next.js 16 + Prisma 7 + Tailwind v4. Acceso a
> datos aislado por `orgId` en `src/lib/*`. Estética: `docs/BRANDING.md` / `docs/UX_PREMIUM_PLAN.md`
> (beige/negro, Poppins, sin degradados, tokens `brand-*`). Colores de gráfica: usar `dataviz` y el
> `src/lib/chart-colors.ts` ya existente.

**Convención de marcadores:** 🆕 nuevo · ➕ extiende algo existente · 🔁 sustituye.

---

## 0. Estado real del código (base de partida)

El repo está **más construido** que lo que sugiere el doc de composición. Ya existe:

- `MemberProgressEntry` con `weightKg`, `bodyFatPct`, `waistCm`, fotos (`prisma/schema.prisma:263`).
- Captura manual de progreso: acción `createProgressEntry` en
  `src/app/(app)/members/[id]/actions.ts:130` y formulario `AddProgressEntryForm` en
  `src/app/(app)/members/[id]/progress-forms.tsx`.
- La ficha del socio ya pinta la serie de progreso y el comparador antes/después
  (`src/app/(app)/members/[id]/page.tsx:153-211`), con `progressEntries` cargado ordenado por fecha
  en `src/lib/members-queries.ts:57`.
- Motor de estancamiento `src/lib/stall-detection.ts` (`getStallSignals`/`isStalled`) que ya combina
  autovaloración + señales objetivas (`RB-IA-007`), pero **hoy no mira composición corporal**.
- `ClientGoal` (`src/lib/members-queries.ts:59,89`), `health-access.ts`, `chart-colors.ts`.

Por tanto la implementación es **incremental sobre estos ficheros**, no un módulo desde cero.

---

## Fase CC1 — Modelo de datos + captura manual (sin dependencias)

**Meta:** poder teclear una toma Tanita en la ficha del socio y guardarla.

### CC1.1 · Esquema (`prisma/schema.prisma`) ➕
Extender `MemberProgressEntry` (Opción A del doc de composición, §3) con campos **opcionales** para
no romper las filas existentes:

```prisma
  muscleMassKg      Float?
  fatMassKg         Float?
  fatFreeMassKg     Float?
  bodyWaterPct      Float?
  boneMassKg        Float?
  visceralFatRating Int?
  bmrKcal           Int?
  metabolicAge      Int?
  bmi               Float?
  segmental         Json?
  source            String  @default("MANUAL")   // "MANUAL" | "TANITA" | "IMPORT"
  measuredAt        DateTime?                     // fecha real de la báscula (≠ createdAt)
```

Y en `Member` (para IMC / rangos derivados, §8.1 del doc de composición):

```prisma
  heightCm Int?
  sex      String?   // para rangos de referencia por sexo (opcional, dato Art. 9 si aplica)
```

- Migración: `npx prisma migrate dev --name body_composition`. Todos los campos nuevos son nullable
  o tienen default ⇒ migración no destructiva.
- Regenerar cliente Prisma tras migrar.

### CC1.2 · Acción de captura ➕
Extender `createProgressEntry` (`src/app/(app)/members/[id]/actions.ts:130`):
- Añadir al `prisma.memberProgressEntry.create` los nuevos campos vía el helper `num(...)` ya
  presente (y un helper `int(...)` análogo para `visceralFatRating`, `bmrKcal`, `metabolicAge`).
- `source: "TANITA"` cuando el formulario lo marque; calcular `bmi` si hay `heightCm` + `weightKg`.
- **Ojo consentimiento:** la acción actual exige `consentImages` porque hoy solo sirve para fotos.
  La composición corporal es **dato de salud (Art. 9)**, no imagen → separar la validación: permitir
  guardar métricas con `consentHealth`, y exigir `consentImages` **solo** si se adjunta foto. Enrutar
  la lectura/escritura de estos campos por el patrón de `src/lib/health-access.ts` y dejar `AuditLog`
  (`RB-PERFIL-004`).

### CC1.3 · Formulario ➕
En `src/app/(app)/members/[id]/progress-forms.tsx`, dentro de `AddProgressEntryForm`:
- Añadir una sección plegable "Composición corporal (Tanita)" con los campos nuevos (mismos estilos
  de input que los actuales: `rounded-control border border-brand-border …`).
- Campo `source` (radio Manual/Tanita) y `measuredAt` (fecha de la toma).
- El análisis segmental como subformulario que se serializa a `segmental` (JSON) en la acción.

### CC1.4 · Vista de última toma en la ficha ➕
En `src/app/(app)/members/[id]/page.tsx` (sección de progreso, ~línea 153), añadir una fila de
tarjetas con la última toma: peso, % grasa, músculo, grasa visceral, edad metabólica, BMR — con
**semáforo** verde/ámbar contra el rango de referencia (ver CC2). Reutilizar el patrón visual de
`kpi-card`.

**Entregable CC1:** un entrenador pasa la báscula, teclea los valores y la ficha muestra la última
toma. Cierra la vía 1 de captura del doc de composición (§4).

---

## Fase CC2 — Rangos de referencia configurables ➕ *(dep: CC1)*

**Meta:** semáforos y objetivos apoyados en rangos editables por dirección (no hardcode), misma
filosofía que `AptitudeRule`.

- Nueva tabla `ReferenceRange` 🆕 en `prisma/schema.prisma`:

```prisma
model ReferenceRange {
  id       String  @id @default(cuid())
  orgId    String
  metric   String  // "bodyFatPct" | "bmi" | "weightKg" | "visceralFatRating" ...
  sex      String? // null = ambos
  ageMin   Int?
  ageMax   Int?
  min      Float?
  max      Float?
  @@index([orgId])
}
```

- `src/lib/reference-ranges.ts` 🆕: `getRangeFor(orgId, metric, {sex, age})` con fallback a valores
  por defecto sensatos (los del propio Tanita: % grasa 8–19, IMC 18.5–25…) cuando no hay fila.
- UI mínima de edición bajo `src/app/(app)/organization` (donde ya viven las listas configurables).
- Los semáforos de CC1.4 consumen `reference-ranges.ts`.
- Seed (`prisma/seed.ts`): sembrar los rangos por defecto para poder demostrarlo.

---

## Fase CC3 — Gráficas de evolución ➕ *(dep: CC1; RB-IA-004)*

**Meta:** ver la progresión de composición en el tiempo, en ficha y portal.

- Componente `BodyCompositionChart` 🆕 en `src/app/(app)/members/[id]/` (client component), con
  **Recharts** (ya en el stack) y colores de `src/lib/chart-colors.ts` / skill `dataviz`.
- Series: peso vs. masa muscular vs. masa grasa a lo largo de `measuredAt`, replicando el histórico
  de tomas del propio informe Tanita. Marcar el objetivo (`ClientGoal`) como línea de referencia.
- Datos: `progressEntries` ya se cargan en `src/lib/members-queries.ts:57`; solo hay que **ampliar el
  `select`/tipo** para incluir los campos nuevos y pasar el subconjunto con `source in (MANUAL,TANITA)`.
- **Portal del cliente** (`src/app/(app)/portal` + `src/lib/portal-queries.ts`): versión de solo
  lectura de la misma gráfica → cumple "progreso visible al cliente" (`RB-IA-004`).

---

## Fase CC4 — Señal de estancamiento por composición ➕ *(dep: CC1; RB-IA-007)*

**Meta:** que la falta de progresión de composición cuente como señal objetiva de estancamiento,
**reutilizando** el motor existente (no uno nuevo).

- En `src/lib/stall-detection.ts`, dentro de `getStallSignals`, añadir el cálculo de una nueva señal
  `compositionStalled` (p. ej. grasa y músculo sin cambio significativo en las últimas N tomas de
  `MemberProgressEntry` dentro de `LOOKBACK_DAYS`).
- Incluirla en el tipo `StallSignals` y en el recuento de `isStalled` (sigue la regla: autovaloración
  **o** ≥2 señales objetivas). Es **una señal más**, coherente con `RB-IA-007` / decisión §11.9.
- Sin cambios de esquema: se calcula sobre los datos de CC1.

---

## Fase CC5 — Importación CSV de MyTanita ➕ *(dep: CC1; iteración propia)*

**Meta:** cargar tomas desde el export de la báscula sin teclear.

- `src/lib/tanita-import.ts` 🆕: parser de **CSV** (más robusto que el PDF posicional, §8.2 del doc de
  composición). Mapea columnas Tanita → campos de `MemberProgressEntry`, valida y crea filas con
  `source = "TANITA"`.
- Acción + UI de subida en la ficha del socio (dropzone de archivo, reutilizar el patrón de
  `ImageDropzone`). Previsualizar filas antes de confirmar.
- El PDF (como el analizado) se admite solo como **adjunto de respaldo**, no como fuente de parseo
  automático fiable.

---

## Fase CC6 — Objetivos y BI agregado ➕ *(dep: CC1, CC2; RB-PERFIL-003, RB-BI-003)*

- **Objetivos medibles:** permitir crear `ClientGoal` a partir de una métrica de composición
  ("bajar % grasa a 12"), reutilizando el catálogo editable ya existente
  (`src/lib/members-queries.ts:89`). El cumplimiento se marca comparando contra la última toma.
- **BI dirección** (`src/lib/dashboard-queries.ts` + `src/app/(app)/dashboard`): métricas agregadas
  (edad metabólica media, % de socios que mejoran grasa/músculo en el periodo) que **enriquecen**
  `RB-BI-003`, sin sustituir el panel actual.

---

## Fase CC7 — API Tanita Health Connect 🔮 *(futuro, riesgo externo)*

Integración directa con la nube de Tanita. Depende de credenciales y disponibilidad del proveedor →
**planificar aparte**, como Stripe o la IA. No bloquea CC1–CC6. Modelo de datos ya listo desde CC1;
esta fase solo añade el conector de ingesta.

---

## Orden recomendado y camino crítico

```
CC1 (modelo + captura manual) ──┬─► CC2 (rangos) ──► CC3 (gráficas) ──► CC6 (objetivos + BI)
                                ├─► CC4 (estancamiento)
                                └─► CC5 (import CSV)
CC7 (API Tanita) ── futuro, no bloqueante
```

**Prioridad de negocio:** CC1 → CC2 → CC3 → CC4. Aportan valor sin dependencias externas. CC5
(import) y CC7 (API) son comodidad/escala; CC6 depende de tener ya la serie de datos.

---

## Checklist transversal (aplicar en cada fase)

- [ ] `orgId` en todo modelo/consulta nuevos; nunca confiar en filtros de UI.
- [ ] Composición corporal tratada como **Art. 9 RGPD**: acceso vía `health-access.ts` + `AuditLog`;
      separar consentimiento de **salud** (métricas) del de **imágenes** (fotos).
- [ ] Configurable sin desplegar (rangos de referencia) = tabla editable, no enum en código.
- [ ] Reutilizar antes que duplicar: `MemberProgressEntry`, `stall-detection.ts`, `ClientGoal`,
      Recharts, `chart-colors.ts`.
- [ ] Estética `BRANDING.md`/`UX_PREMIUM_PLAN.md`; consultar `dataviz` para las gráficas.
- [ ] Ampliar `prisma/seed.ts` cada fase (tomas Tanita de ejemplo, rangos por defecto) para poder
      demostrarla.
- [ ] Cerrar cada fase con `npm run lint` + `npm run build` en verde y commit propio.

---

*Fin del documento. Emparejar con `COMPOSICION_CORPORAL_TANITA.md` (define la fuente de datos y su
encaje) y con `CRM_IMPLEMENTACION_FUNCIONALIDADES.md` (fases del CRM): este documento aterriza el
backlog de composición corporal en ficheros y orden concretos sobre el código ya existente.*
