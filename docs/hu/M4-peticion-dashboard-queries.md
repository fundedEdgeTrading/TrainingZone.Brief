# M4 → M1 · montar la card de ingresos por concepto y no desincronizar «cobrado»

> **Para la ventana de merge.** `src/app/(app)/dashboard/panels.tsx` y
> `src/lib/dashboard-queries.ts` son de la pista **M1**; M4 no los ha tocado.
> Son dos cosas: una es de dos líneas, la otra es una trampa que conviene ver
> antes de caer en ella.

## 1 · La card está lista y solo hay que colgarla (E14-17)

M4 entrega `src/app/(app)/dashboard/revenue-mix-card.tsx` con un Server
Component que acepta exactamente el mismo ámbito que el resto de paneles:

```tsx
import { RevenueMixPanel } from "./revenue-mix-card";

// dentro de panels.tsx, donde corresponda por jerarquía (va junto a
// "Método de pago": las dos contestan "de dónde sale el dinero")
<RevenueMixPanel {...props} />
```

`RevenueMixProps` es `{ orgId, centerId, range }` —estructuralmente idéntico a
`PanelProps`—, declarado en el propio fichero de la card y no importado de
`panels.tsx` a propósito: al revés se cerraría un ciclo de importación, porque
es `panels.tsx` quien importa la card.

La card pinta **tres líneas de caja** (alta nueva, renovación, sin suscripción)
y, debajo de un filete y con su propio rótulo, la **baja** en negativo. La baja
**no se suma al total** (decisión D-L3-3): no es caja, no está en Stripe y la
card lo dice con todas las letras.

## 2 · Si cambias qué cuenta como «cobrado», avísanos en el mismo cambio

`src/lib/revenue-mix.ts` usa **las mismas definiciones** que el panel, porque si
no el desglose no cuadraría con el KPI que tiene al lado:

- **qué cuenta como cobrado**: `status: "PAID"`, igual que `getRevenueSeries` y
  `getKpiTiles` hoy;
- **cómo se acota la ventana**: `comparisonWindow(range)` y el mismo
  `d >= from && d < to`;
- **el ámbito del cobro**: `Payment` no tiene centro y lo hereda de su socio
  (`member.primaryCenterId`), que es la copia de tu `paymentScope`.

Verificado contra los datos de demo: `getRevenueMix(...).cashTotalCents` da
**exactamente** el `numericValue` del KPI `revenue` en `mes` y en `trim`. Está
comprobado, no supuesto.

**E14-03 rompe esto.** Si el diagnóstico concluye que «Ingresos del mes» tiene
que incluir el `PENDING` de los adeudos SEPA, `revenue-mix.ts` tiene que moverse
**en el mismo cambio**: si no, la card de al lado sumará otra cosa y no habrá
forma de saber cuál de las dos miente. Son dos sitios:

```ts
// src/lib/revenue-mix.ts — dos `where` con `status: "PAID"` en getRevenueMix
```

Lo mismo con `comparisonWindow` si E14-06 añade rangos: `revenue-mix.ts` la
importa de `dashboard-range.ts` y hereda los siete nuevos sin tocar nada,
**siempre que la firma no cambie**. Si cambia, avisa.

## 3 · Lo que ayudaría, si te cuadra

`paymentScope` y `memberScope` de `dashboard-queries.ts` son privados, así que
`revenue-mix.ts` tiene una copia con el comentario que lo dice. Si los exportas,
M4 los importa y se acaba la copia. No es bloqueante y no hace falta hacerlo en
este lote: es la clase de duplicado que se pudre en tres meses, nada más.
