# Mapa de barrios (RB-LEAD-010)

Implementación del handoff «Modernizar dashboard con mapa de calor».

## El problema que arregla

El panel de dirección terminaba en la tarjeta **Mapa de calor**
(`PostalMapPanel`): una capa `leaflet.heat` difuminada más burbujas negras por
código postal, encuadrada sobre todos los puntos de la organización. Con
centros en Zaragoza **y** Santander el encuadre resultante es de escala
nacional y los 19 barrios de Zaragoza se funden en una sola mancha: no se
distingue un barrio de otro.

La pantalla nueva, `/mapa-barrios`, sustituye esa lectura por **coropletas a
pantalla completa**: cada barrio es un polígono con su borde, su nombre y su
cifra, y la misma geometría se recolorea con seis métricas. Cada una responde
una de las seis preguntas que marcó dirección:

| Métrica | Pregunta | De dónde sale |
|---|---|---|
| Clientes | ¿Dónde están mis clientes? | `Member.postalCode` |
| Leads | ¿Dónde hay leads sin convertir? | `Lead.postalCode` |
| Conversión | ¿Dónde convierto peor? | `members / (members + leads)` |
| Tendencia | ¿Qué barrio crece y cuál se apaga? | altas de 90 días vs. los 90 anteriores |
| Distancia | ¿A qué distancia queda el centro más cercano? | haversine contra `Center.lat/lng` |
| Oportunidad | ¿Dónde abrir el próximo centro? | `(leads + members × 0,35) × min(1, km / 2,6)` |

La tarjeta del panel **se mantiene** (responde «dónde hay volumen» de un
vistazo) y gana un enlace a la pantalla nueva.

## Qué se ha tocado

| Fichero | Qué hace |
|---|---|
| `src/lib/barrio-geometry.ts` | Teselación de Voronoi recortada al casco convexo, haversine y centro más cercano. |
| `src/lib/barrio-map.ts` | Métricas, rampas de color, escalas, orden del ranking y reparto por ciudad. Módulo puro, compartido por servidor y cliente. |
| `src/lib/dashboard-queries.ts` | `getPostalCodeMapData()`: barrios con los cuatro derivados + centros situados. `getPostalCodeStats()` pasa a ser su filtrado. |
| `src/app/(app)/mapa-barrios/*` | La pantalla: página con guarda, vista de cliente, mapa de Leaflet y su loader `ssr:false`. |
| `src/app/(app)/header-slot.tsx` | Hueco del header para el selector de ciudad y el subtítulo de la pantalla. |
| `src/app/(app)/header.tsx` | Botón «volver» de las pantallas que cuelgan de otra + lectura del hueco. |
| `src/lib/rbac.ts` | `OFF_NAV_TITLES` y `PARENT_ROUTE` para la ruta nueva. |
| `src/app/globals.css` | Pantalla a sangre, filtros de tesela, etiquetas de barrio y de centro. |
| `prisma/schema.prisma` + migración | `Center.lat` / `Center.lng` (opcionales). |

## Decisiones que conviene conocer

**La geometría es una aproximación, y la pantalla lo dice.** `PostalCodeArea`
solo guarda un punto por CP, así que el polígono de cada barrio se calcula
teselando la ciudad (cada punto se queda con lo que le cae más cerca que a
cualquier otro, recortado al casco convexo). La leyenda lo advierte en su pie.
Cuando entre el GeoJSON de barrios del cliente, basta con servir un anillo por
`code` en vez de llamar a `tessellate()`: el resto de la vista (color,
etiquetas, foco, encuadre) ya trabaja sobre anillos.

**Los centros necesitaban coordenadas.** `Center` tenía dirección postal pero
no `lat`/`lng`, y sin ellas no hay marcador, ni anillo de «15 min andando», ni
distancia por barrio — la mitad de las preguntas. Son opcionales: un centro sin
situar sigue siendo válido, solo no se pinta. El alta de centro
(**Organización**) las pide, y el seed las trae para los tres centros de demo.

**La tendencia se acota a ±200 %.** Un barrio que pasa de 1 alta a 6 es un
+500 % que aplasta la rampa divergente de los otros dieciocho. Sin altas
previas, un barrio que estrena clientes se marca como +100 %, no como infinito.

**La fórmula de oportunidad está a validar con negocio.** Es la del prototipo y
lee «demanda que existe pero queda lejos de un centro»: un barrio con muchos
leads a 3 km puntúa alto; el mismo volumen a 500 m no, porque ya está atendido.

**El ranking de Conversión va al revés.** La pregunta es «dónde convierto
peor», así que lo primero de la lista tiene que ser el problema.

**El encuadre espera a que el contenedor tenga medidas.** Un `ResizeObserver`
sobre el lienzo dispara el encuadre en cuanto el mapa ocupa algo: en una
navegación de cliente el contenedor puede estar todavía a 0×0 cuando Leaflet se
monta, y encuadrar contra eso da un zoom inválido y deja las celdas sin dibujar.

**Las etiquetas resuelven colisiones.** Dirección pidió los nombres siempre
visibles, así que no basta con pintarlos: se colocan de mayor a menor valor,
midiendo la caja real de tinta, sembrando la lista de ocupados con los
rectángulos de las tarjetas flotantes (`data-tz-overlay`) y de los rótulos de
centro. Si el nombre no cabe queda solo la cifra; si tampoco, se oculta. El
barrio en foco o bajo el puntero nunca compite.

**El hueco del header no usa contexto de React.** Un proveedor tendría que
envolver al header y a `children` —el layout entero—, y meter el árbol de todas
las páginas dentro de otro componente cliente cambia cómo se sirve: el
contenido de la página pasa a viajar como un hueco del stream y llega más tarde
que el resto (se vio en los e2e de `/billing` y del panel del entrenador, con
dos copias del contenido en el DOM durante el primer instante). Se resuelve con
una tiendecilla de módulo y `useSyncExternalStore`: solo el header se suscribe.

**El enlace del panel no hace prefetch.** Con el prefetch por defecto, pasar el
ratón por encima lanza en el servidor la consulta geográfica entera, y —peor—
esa petición RSC compite con la de la navegación real: se llegaron a ver tres
peticiones al mismo segmento, una de ellas abortada, y el router se quedaba con
la vacía dejando el `main` con la barra de progreso y nada más. Se reprodujo en
los e2e (1 de cada 3 ejecuciones); con `prefetch={false}`, 10 de 10 en verde.

**La pantalla a sangre se marca en la propia página.** Su raíz lleva
`data-full-bleed` y una regla de `globals.css` (`main:has(> [data-full-bleed])`)
le quita al contenedor de página el relleno y el scroll, y le da contexto de
apilamiento propio para que las tarjetas flotantes del mapa (z 500, por encima
de las capas de Leaflet) no se suban por encima del header.

## Qué queda fuera

- **Responsive por debajo de `lg`**: la columna derecha (foco + ranking) y la
  leyenda se ocultan; el mapa, la barra de métricas y la botonera siguen
  operativos. La pantalla está pensada para escritorio, como el propio panel.
- **`walkMinutes`, `showCenters` y `cellOpacity`** son constantes con nombre en
  `barrio-map-view.tsx`. El sitio natural de convertirlas en preferencia del
  centro es `Center`, cuando se pidan.
- **Edición de las coordenadas de un centro ya creado**: se dan en el alta; para
  cambiarlas hoy hay que tocar el dato.
