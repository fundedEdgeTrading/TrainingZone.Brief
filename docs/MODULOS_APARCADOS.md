# Módulos aparcados

Qué se ha retirado de la interfaz sin borrar nada, cuándo y por qué. Existe
para que dentro de dos meses nadie tenga que averiguar si un módulo estaba
roto o simplemente aparcado.

Regla común: **se oculta, no se borra.** Ni el código, ni las tablas, ni los
datos. Volver a encenderlo debe ser cuestión de deshacer los puntos de esta
ficha, no de reescribir el módulo.

## Ofertas y sugerencias de IA (22-08-2026, F2)

**Por qué.** El gimnasio todavía no vende paquetes de forma activa, así que el
módulo ocupaba una sección entera del menú de cuatro roles sin que nadie
llegara a usarlo. Vuelve cuando haya campaña comercial que sostener.

**Qué se ha hecho.**

- `src/lib/rbac.ts`: fuera `/offers` del `NAV_BY_ROLE` de Dirección, Dirección
  de centro, Entrenador y Entrenador Admin.
- `src/app/api/jobs/run/route.ts`: la llamada a `generateOfferSuggestions` deja
  de ejecutarse en el cron. La clave `offerSuggestions` sigue en el `summary`
  (a 0) para no cambiar la forma de la respuesta que consume el disparador
  externo.

**Qué NO se ha tocado.** La ruta `/offers` y sus acciones, `PersonalizedOffer`,
`generateOfferSuggestions`, `canProposeOffers` / `canApproveOffers` y el
apartado de ofertas de la ficha del socio. Todo sigue funcionando por URL
directa.

**Para reactivarlo.** Devolver la entrada al menú de los roles que la tenían y
descomentar la llamada de la regla en el cron.

## Fichajes (22-08-2026, F2)

**Por qué.** El control horario no es la prioridad del piloto y el panel de
RRHH se aligera sin él. La verificación cruzada de horas depende del fichaje,
así que se va con él.

**Qué se ha hecho.**

- `src/app/(app)/rrhh/page.tsx`: fuera las tarjetas «Mi fichaje» y
  «Verificación cruzada de horas». El buzón de propuestas, la valoración de
  entrenadores, el ranking de ventas y los check-ins se quedan.

**Qué NO se ha tocado.** El modelo `TimeClockEntry`, `lib/timeclock-queries.ts`
(`clockIn` / `clockOut` / `signEntry` / `crossCheckHours`), las acciones de
`rrhh/actions.ts` y el componente `TimeClockWidget`, que sigue exportado y
listo para volver a montarse.

**Para reactivarlo.** Volver a montar `TimeClockWidget` y la tarjeta de
verificación cruzada en `/rrhh` con los datos que ya devuelven esas queries.

## Nota sobre el recuento del menú de Dirección

El roadmap de la jornada (§3.4) fijaba bajar el menú de Dirección de 15
entradas a 13. Con Ofertas fuera queda en **14**: las demás filas de esa tabla
(salud para Dirección de centro, Comercial del entrenador, navegación del
Entrenador Admin) no retiran nada más de ese menú, y ninguna de las entradas
restantes es prescindible sin dejar su pantalla sin puerta de entrada — la
«Puesta en marcha», por ejemplo, dice de sí misma que se queda ahí «por si
añades otro centro o cambias de tarifas». El aforo de clases no suma entrada
para Dirección: lo edita en Organización → Centros, junto al resto de ajustes
del centro.
