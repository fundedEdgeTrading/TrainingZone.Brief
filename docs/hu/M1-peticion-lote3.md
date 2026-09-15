# M1 → M2 y M4 · lo que queda fuera de mis ficheros

> **Para la ventana de merge.** M1 (`dashboard-range.ts`, `dashboard-queries.ts`,
> `occupancy.ts`, `src/app/(app)/dashboard/`) ha aplicado E14-01 a E14-07. Tres
> cosas caen en ficheros de otras pistas y **no las he tocado**, por la regla de
> oro del lote: cada pista toca solo los suyos. Están escritas para aplicarse
> mecánicamente, como la petición T7 que originó todo esto.
>
> Ninguna de las tres bloquea nada: el panel funciona hoy sin ellas.

---

## 1 · M2 · aviso: la agregación del mapa ya está mezclada

**Esto no es una petición, es el aviso que pedía E14-07.** Los cuatro puntos de
`docs/hu/T7-peticion-dashboard-queries.md` están aplicados en
`getPostalCodeMapData`. A partir de ahora la agregación:

- **Respeta `opts.range`** en socios (`joinedAt`) y leads (`createdAt`). Las dos
  ventanas de 90 días de la tendencia **no** se acotan: son su propia definición.
- **Respeta `opts.memberStates`**, con «socios vivos» por defecto
  (`LIVE_MEMBER_STATES` en `dashboard-range.ts`, que es lo mismo que
  `memberStatesFor("activos")` — hay una prueba que cruza las dos listas).
- **Deja fuera los leads cerrados y los ya convertidos**, así que la misma
  persona ya no se cuenta como lead y como socio, y la conversión del barrio ya
  no se calcula sobre un total inflado.
- **Devuelve `churn`** por barrio: bajas del periodo desde `Member.cancelledAt`,
  con cota superior. `BarrioStat.churn` ya estaba declarado opcional y la
  pastilla de la métrica de fuga ya se puede encender.

Medido contra los datos de demo, el mapa pasa de dar **lo mismo con los cuatro
periodos** (27 barrios, 19 leads, 71 socios, siempre) a moverse de verdad:

| periodo | barrios | leads | socios | bajas |
|---|---|---|---|---|
| Hoy | 11 | 18 | 0 | 0 |
| Mes | 12 | 18 | 4 | 0 |
| 3 meses | 19 | 18 | 14 | 2 |
| Año | 23 | 18 | 30 | 6 |

**Una desviación deliberada de T7**, y conviene que la sepas: el punto 1 de la
petición decía que «con `range === "mes"` el comportamiento tiene que quedar
exactamente como está hoy», y eso no se puede cumplir a la vez que su propia
prueba nº 4 ni que el criterio de aceptación de E14-07 («para el mismo periodo y
el mismo estado, mapa y panel dan la misma cifra»). Ha mandado el criterio de
aceptación: el periodo se aplica también en `mes`. Si el mapa te sale más vacío
de lo que esperabas, es esto y es correcto.

### Lo único que sí te pido

`BarrioStat.dist` y `BarrioStat.opp` siguen siendo `number` y siguen naciendo a
`0` cuando la organización no tiene ningún centro situado. Es el punto 4 de T7 y
es el único que no he aplicado, porque `src/lib/barrio-map.ts` es **tuyo**.

No corre prisa y no cambia ninguna lectura: `metricValue()` ya devuelve `null`
en ese caso mirando `nearestCenter`, así que la pantalla es correcta hoy — lo
dice la propia petición T7. Cuando quieras cerrarlo:

```ts
// src/lib/barrio-map.ts
dist: number | null;
opp: number | null;
```

y en `getPostalCodeMapData` (mío) cambio las dos líneas a `nearest ? … : null` en
la misma ventana de merge. Dímelo y lo hacemos a la vez.

---

## 2 · M4 · la card de ingresos por concepto no recibe el periodo personalizado

`revenue-mix-card.tsx` está **montada** en `panels.tsx` y en `page.tsx`, como
acordaba el reparto. Funciona con los seis periodos fijos.

E14-06 añadió un séptimo, `custom`, y sus dos fechas viajan aparte del `range`
porque el tipo tiene que seguir siendo una cadena corta que quepa en la URL:

```ts
// src/lib/dashboard-range.ts
export type CustomRange = { from: Date; to: Date };
export type DashboardOpts = { …; range?: DashboardRange; custom?: CustomRange };
```

`RevenueMixProps` no tiene ese campo, así que con el periodo personalizado tu
card **se comporta como «Mes»** en vez de romper (`comparisonWindow` cae al mes
en curso cuando le llega `custom` sin fechas). No es un fallo visible, pero es
una card contando otro periodo que las de al lado, que es exactamente lo que
acabamos de arreglar en el resto del panel.

Son dos líneas:

```ts
// src/app/(app)/dashboard/revenue-mix-card.tsx
export type RevenueMixProps = {
  orgId: string;
  centerId: string | null;
  range: DashboardRange;
  custom?: CustomRange;            // ← añadir
};

const mix = await getRevenueMix(props.orgId, {
  centerId: props.centerId,
  range: props.range,
  custom: props.custom,            // ← añadir
});
```

En cuanto el tipo lo acepte, en `page.tsx` cambio
`<RevenueMixPanel orgId={orgId} centerId={centerId} range={range} />` por
`<RevenueMixPanel {...panel} />` y queda cerrado.

---

## 3 · Para todos · dos ficheros de prueba ajenos que he tenido que tocar

No he tocado código de nadie, pero **dos pruebas de otras pistas cambiaron de
forma porque cambió la definición**, no porque estuvieran mal. Las he adaptado
en vez de borrarlas, y aquí está el qué y el por qué para que no os sorprenda en
el diff:

- **`src/lib/barrio-map-params.test.ts`** (M2). `parseRange("trim")` ahora
  devuelve `"3m"`: el selector pasó de cuatro periodos a siete y `trim`
  (trimestre natural en curso) se convirtió en `3m` (últimos tres meses). El
  alias existe para que un enlace guardado siga llevando al periodo equivalente
  en vez de caer en el de por defecto. He actualizado el caso y he **añadido**
  uno que cubre el alias.

- **`src/lib/e7-07-occupancy-waitlist.test.ts`** (regresión E7-07). Pedía
  `getOccupancyByCenter` sin periodo y esperaba la ventana fija de 30 días, que
  ya no existe: ahora la consulta sigue al selector. Le paso un periodo
  explícito que cubre la serie entera —con lo que además deja de depender del
  día del mes en que se ejecute— y `occupancyPct` pasa a ser `soldPct`. Las dos
  aserciones originales (no pasar del 100 %, contar clases y no filas) siguen
  ahí, y he añadido la de asistencia real.

- **`e2e/billing-dashboard.spec.ts`** (F17 · BI). Comprobaba «LTV medio por
  cliente» y «Ocupación media», los dos rótulos que E14-05 y E14-02 cambian
  porque cambia lo que miden. Ahora comprueba «Valor de un socio» +
  «Permanencia media» y «Plazas vendidas» + «Asistencia real», que son las
  cifras que las sustituyen.

- **`src/app/api/mobile/v1/admin/dashboard/route.ts`** · una línea, y es la que
  evita reabrir un fallo cerrado. La ruta calculaba su propia asistencia
  (`attended / held`) en vez de leer la de `getNoShowRate`. Con E14-02 esa
  cuenta deja de ser la de la web —el denominador pasan a ser las plazas
  **vendidas** de las clases celebradas, así que un roster sin resolver baja la
  cifra en vez de desaparecer del cálculo— y el mismo centro daría dos
  asistencias distintas según se mirara desde la web o desde la app. Es el
  «espejo móvil» que prohíbe `AGENTS.md` y es exactamente el fallo de E12-05.
  Ahora lee `noShow.attendancePct`. El tipo de la respuesta no cambia y
  `apps/mobile` no se toca.

Si alguna os pisa un cambio vuestro, avisadme y lo resolvemos en la ventana.
