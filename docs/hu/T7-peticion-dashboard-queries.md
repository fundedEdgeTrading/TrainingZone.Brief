# T7 → T9 · cambios pedidos en `src/lib/dashboard-queries.ts`

> **Para la ventana de merge.** `src/lib/dashboard-queries.ts` es de la pista T9.
> T7 no lo ha tocado. Tres historias del lote de T7 (**E11-07**, **E11-01** y
> **E11-09**) necesitan cambios dentro de `getPostalCodeMapData`, y aquí están
> escritos para que se apliquen mecánicamente, sin tener que reconstruir el
> razonamiento.
>
> Todo lo demás de esas tres historias —parámetros de URL, filtros de la vista,
> clasificación, leyenda, tabla, pie de cobertura— ya está hecho y mezclado.
> Estos cuatro puntos son la mitad que vive en la agregación.

Estado actual del contrato, para situarse:

```ts
export async function getPostalCodeMapData(orgId: string, opts: DashboardOpts = {}): Promise<PostalCodeMapData>
```

`DashboardOpts` ya trae `centerId`, `centerIds` y `range`.

---

## 1 · E11-07 · el rango se recibe y no se usa

`getPostalCodeMapData` acepta `opts.range` y **no lo aplica en ninguna de las
tres subconsultas**. El mapa es, por tanto, siempre acumulado histórico, y no es
comparable con el resto del panel aunque comparta rótulos: dirección lee "leads
de este trimestre" en `/dashboard` y "leads desde siempre" en el plano.

La pantalla ya envía el rango (`src/app/(app)/mapa-barrios/page.tsx`), así que
solo falta consumirlo:

- Acotar el `LEFT JOIN` de leads por `"createdAt" >= <desde>`.
- Acotar el de socios por `"joinedAt" >= <desde>`.
- **No** acotar la subconsulta de tendencia: sus dos ventanas de 90 días son su
  propia definición y no dependen del selector.

`<desde>` sale del helper de `dashboard-range.ts` que ya usan las demás
consultas del panel. Con `range === "mes"` (el valor por defecto) el
comportamiento tiene que quedar exactamente como está hoy.

## 2 · E11-01 · el mapa cuenta socios muertos y leads ya convertidos

Es el fallo con más consecuencias del módulo:

- **`Member`**: se cuentan **todos** los estados, cancelados, congelados y
  prospectos incluidos. Un barrio del que se está yendo la gente sigue
  pintándose oscuro, que es exactamente al revés de lo que dirección necesita
  ver.
- **`Lead`**: se cuentan todos, incluidos los cerrados y los que tienen
  `convertedMemberId`. **La misma persona se cuenta como lead y como socio**, y
  la etiqueta "leads sin convertir" es falsa. La conversión que calcula el mapa
  se computa sobre ese total inflado.

Cambios:

```sql
-- socios: por defecto, solo los vivos
WHERE "orgId" = $orgId AND "postalCode" IS NOT NULL
  AND "state" NOT IN ('CANCELLED', 'PROSPECT')

-- leads: fuera los cerrados y los ya convertidos
WHERE "orgId" = $orgId
  AND "convertedMemberId" IS NULL
  AND "status" <> 'CERRADO'
```

Y un parámetro explícito para poder pedir lo contrario, que es lo que necesita
la métrica de fuga:

```ts
type DashboardOpts = {
  // …
  /** Estados de socio que entran en la agregación. Por defecto, los vivos. */
  memberStates?: MemberState[];
};
```

T7 ya expone el eje en la URL (`?estado=activos|todos|bajas`, ver
`src/lib/barrio-map-params.ts`) y lo traduce a `memberStates` en cuanto exista.

La subconsulta de tendencia debe seguir contando **altas** sin el filtro de
estado: un socio que se dio de alta en marzo y se fue en julio se dio de alta
igual, y quitarlo reescribiría el pasado.

## 3 · E11-09 · métrica de bajas por barrio

`Member.cancelledAt` **ya está guardado**: es el dato con mejor relación
valor/coste de todo el módulo, y hoy no se puede responder "¿qué barrios tienen
fuga?". `trend` mide altas, no bajas.

Hace falta una cuarta subconsulta y un campo nuevo en `BarrioStat`:

```sql
LEFT JOIN (
  SELECT "postalCode" AS code, COUNT(*) AS churn
  FROM "Member"
  WHERE "orgId" = $orgId AND "postalCode" IS NOT NULL
    AND "cancelledAt" >= $from AND "cancelledAt" < $to   -- ⚠️ CON COTA SUPERIOR
  GROUP BY 1
) c ON c.code = pca.code
```

**La cota superior no es opcional.** Hoy `_lib/dashboard.ts` cuenta bajas con
`gte` y sin tope, así que una baja programada a futuro ya cuenta como baja del
mes en curso. El mismo error aquí haría que el mapa de fuga enseñara barrios que
todavía no han perdido a nadie.

`BarrioStat` gana `churn: number` (T7 ya tiene preparadas la métrica, su
clasificación por cuantiles y su columna en la tabla; solo falta el dato).

## 4 · E11-03 · `dist` y `opp` devuelven un cero inventado

Cuando la organización no tiene ningún centro situado (`Center.lat/lng` son
opcionales), la agregación devuelve `dist: 0` y `opp: 0`. **No significa "está en
la puerta", significa "no se puede calcular"**, y el mapa pintaba toda la ciudad
a 0,0 km.

T7 ya lo tapa en la capa de lectura: `metricValue()` devuelve `null` cuando
`nearestCenter === null`, y de ahí para abajo el gris de "sin dato", la pastilla
deshabilitada y la raya en vez del cero. **La vista es correcta hoy.** Lo que
queda es que el dato nazca bien:

```ts
dist: nearest ? Math.round(nearest.km * 10) / 10 : null,
opp: nearest ? /* … */ : null,
```

con `dist: number | null` y `opp: number | null` en `BarrioStat`. En cuanto el
tipo cambie, T7 quita la comprobación por `nearestCenter` y lee el `null`
directamente; mientras tanto las dos lecturas dan el mismo resultado, así que el
orden de merge no importa.

---

## Cómo comprobar que quedó bien

`src/lib/barrio-map.test.ts` y `src/lib/barrio-coverage.test.ts` ya cubren la
capa de lectura. Para la agregación hacen falta, en el fichero de tests de T9:

1. Un socio `CANCELLED` en un barrio: no cuenta como socio con el filtro por
   defecto, y sí cuenta con `?estado=todos`.
2. Un lead con `convertedMemberId`: no cuenta como lead, y la conversión del
   barrio no lo cuenta dos veces.
3. Una baja con `cancelledAt` en el futuro: **no** entra en el recuento de bajas
   del periodo en curso.
4. Con `range` distinto de `mes`, un socio de hace dos años deja de contar.
