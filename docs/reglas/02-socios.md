# 02 · Socios

Pantallas: listado `/members`, ficha `/members/[id]`, portal del socio
`/portal/*` y la app. Descripción funcional en
[PRODUCTO_GESTION.md](../PRODUCTO_GESTION.md) §1.

## Ficha y servicios

### RB-PERFIL-001 · Varios servicios a la vez, secciones condicionales

**Estado:** 🟢 Vigente

Un socio puede tener más de un servicio simultáneo: **entrenamiento personal
(EP)**, **grupos reducidos** y **online**, y sus combinaciones. La ficha abre
las secciones de cada servicio según los bonos/cuotas activos, no según un
interruptor aparte. Un socio puede tener varios bonos `ACTIVE`/`FROZEN` a la vez
(ver `RB-AGENDA-003`).

- El plan **ONLINE** existe y se vende en la web, pero **no desde la app**
  (decisión D-S3: evitar la compra in-app obligatoria de Apple).

**Dónde vive:** `src/lib/session-balance.ts` (`PLAN_TYPE_TO_SERVICE`)

### RB-PERFIL-002 · Entrenador responsable

**Estado:** 🟢 Vigente · **Decisión:** §11.4

- Socio de **EP** u **online** → entrenador responsable asignado explícitamente.
- Socio de **solo grupos** → el responsable de cara al socio es el centro, sin
  entrenador asignado.

**Dónde vive:** `src/app/(app)/members/actions.ts`, `src/lib/session-balance.ts`

### RB-PERFIL-003 · Objetivos medibles en la valoración inicial

**Estado:** 🟢 Vigente

En la valoración inicial se recogen los objetivos en texto libre **más** un
conjunto de objetivos concretos y medibles, elegidos de un catálogo que la
organización edita (p. ej. "hacer 1 flexión completa", "mejorar el dolor de
espalda"). Son la base del seguimiento periódico (`RB-IA-006`). La valoración
inicial recoge también la profesión (P8-7). El formulario del lead **completa**
los objetivos, no los sustituye (QA-ALTA-21).

**Dónde vive:** `src/lib/members-queries.ts`, `prisma/schema.prisma` (`ClientGoal`)

### RB-PERFIL-004 · La salud del socio es dato de categoría especial

**Estado:** 🟢 Vigente

Lesiones, patologías, fotos de evolución y composición corporal siguen el
tratamiento art. 9 RGPD: consentimiento explícito, acceso restringido y
auditoría de cada lectura. El socio ve su propia evolución en
`/portal/evolucion`. Lo capturado en el lead pasa a ser el primer registro de
salud del socio. El detalle está en [05](./05-salud-ia-y-seguimiento.md).

### RB-VISTA-001 · Listado de socios del centro

**Estado:** 🟢 Vigente

El listado muestra de un vistazo: foto, nombre, teléfono, edad, lesiones
(resumen, no el detalle clínico), servicio contratado, antigüedad y última
visita. La ficha separa **datos administrativos** y **deportivos** (QA-ALTA-08)
y solo enseña las secciones de servicio que aplican (`RB-PERFIL-001`).

**Dónde vive:** `src/app/(app)/members/page.tsx`, `src/app/(app)/members/[id]/page.tsx`

## Comportamiento construido sin regla numerada

- **Cuatro tipos de persona** (decisión del lote 3, D-L3-2): **Cliente**
  (`ACTIVE`), **Congelado** voluntario (`FROZEN`: agosto, viaje, lesión),
  **Suspendido** por impago (`DELINQUENT`) y **Excliente** (`CANCELLED`). Además
  existen `PROSPECT` (pagó con SEPA en vuelo o aún no es socio) y `TRIAL`.
  Congelado e impago se separan a propósito: juntarlos metía en la lista de
  morosos a quien estaba de vacaciones.
  - **Congelar y dar de baja exigen motivo**, de un catálogo por organización
    editable sin desplegar. Sin motivo, la transición se rechaza.
  - Un **solo módulo** mueve el estado del socio: `src/lib/member-lifecycle.ts`.
- **Importación de socios por CSV.** → [PRODUCTO_GESTION.md](../PRODUCTO_GESTION.md) §1.4
- **Baja de un socio con bono vivo** exige cancelar antes la suscripción.
