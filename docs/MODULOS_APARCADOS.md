# Módulos aparcados

Qué se ha retirado de la interfaz sin borrar nada, cuándo y por qué. Existe
para que dentro de dos meses nadie tenga que averiguar si un módulo estaba
roto o simplemente aparcado.

Regla común: **se oculta, no se borra.** Ni el código, ni las tablas, ni los
datos. Volver a encenderlo debe ser cuestión de deshacer los puntos de esta
ficha, no de reescribir el módulo.

## ~~Ofertas y sugerencias de IA (22-08-2026, F2)~~ — ELIMINADO (23-08-2026)

Estuvo aparcado un día: fuera del menú desde el 22-08-2026 y **eliminado del
todo el 23-08-2026**. Ya no queda nada que reactivar. Se fueron la ruta
`/offers` con sus acciones y componentes, `lib/offers-queries.ts` (incluida
`generateOfferSuggestions`), `canProposeOffers` / `canApproveOffers`, el modelo
`PersonalizedOffer` con su tabla y el enum `OfferStatus`, la clave
`offerSuggestions` del `summary` del cron y `e2e/offers.spec.ts`. La regla de
negocio `RB-RRHH-008/013` queda marcada como retirada en
`docs/reglas/06-equipo-y-tareas.md`.

## Fichajes (22-08-2026, F2)

**Por qué.** El control horario no es la prioridad del piloto y el panel de
RRHH se aligera sin él. La verificación cruzada de horas depende del fichaje,
así que se va con él.

**Qué se ha hecho.**

- `src/app/(app)/rrhh/page.tsx`: fuera las tarjetas «Mi fichaje» y
  «Verificación cruzada de horas». La valoración de entrenadores, el ranking de
  ventas y los check-ins se quedan. (El buzón de propuestas también se quedaba
  entonces; se eliminó del todo el 23-08-2026 — no está aparcado, está borrado.)

**Qué NO se ha tocado.** El modelo `TimeClockEntry`, `lib/timeclock-queries.ts`
(`clockIn` / `clockOut` / `signEntry` / `crossCheckHours`), las acciones de
`rrhh/actions.ts` y el componente `TimeClockWidget`, que sigue exportado y
listo para volver a montarse.

**Para reactivarlo.** Volver a montar `TimeClockWidget` y la tarjeta de
verificación cruzada en `/rrhh` con los datos que ya devuelven esas queries.

> ### 06-09-2026 · YA NO ESTÁ APARCADO: ESTÁ APAGADO (E10-21)
>
> Un módulo aparcado indefinidamente paga peaje en cada migración y en cada
> auditoría de permisos. Y si se reactivase tal cual **no cumpliría**:
> `TimeClockEntry` admite una sola entrada y una sola salida por día, lo que no
> permite pausas ni jornadas partidas —habituales con turno de mañana y tarde—
> y no distingue horas ordinarias de extraordinarias. El control horario en
> España es obligación legal: o se hace bien y se vende, o se apaga. A medias
> es lo peor de los dos mundos. **Decisión tomada: se apaga.**
>
> Retirado en código: `TimeClockWidget`, `lib/timeclock-queries.ts`
> (`clockIn` / `clockOut` / `signEntry` / `crossCheckHours`), las acciones de
> `rrhh/actions.ts` y el bloque de siembra de `prisma/seed.ts`.
>
> **Antes de retirar el modelo del esquema**, exportar y archivar los fichajes
> existentes con `npm run export:fichajes`: el plazo de cuatro años del art.
> 34.9 ET (RDL 8/2019) sigue corriendo aunque la funcionalidad desaparezca.
> La retirada de `TimeClockEntry` del esquema sigue pendiente (el esquema
> estuvo congelado hasta el 27-09-2026 y hoy solo admite cambios aditivos sin
> acuerdo explícito): el código ya no lo toca.
>
> La declaración de que **Apta no presta registro de jornada** vive en
> `src/lib/service-terms.ts` y se pinta en `/rrhh`, donde estaba el widget:
> quien venga a buscar el fichaje encuentra la respuesta, no un hueco. Ahí está
> también lo que un diseño futuro tendría que contemplar.

## IA y chat en la ficha del socio (23-08-2026) — situación actual

El 23-08-2026 el rediseño de `/members/[id]` retiró de la ficha la pestaña
«IA & Chat». Desde entonces cambiaron las dos mitades:

- **Chat: volvió.** E12-02 (decisión D-P6: se quita la promesa de respuesta
  inmediata, el chat **no** se apaga) remontó el lado del personal: la ficha
  tiene una sección «Chat» con `StaffChatThread`, visible según `RB-CHAT-001`
  (`src/lib/chat.ts`). El socio sigue con el panel flotante del portal.
- **Rutina para casa por IA: apagada del todo.** E12-01 (D-P6) retiró el
  emisor (`lib/workout-programs.ts`) y el botón del portal, porque no había
  pantalla donde el entrenador confirmase el borrador y la «IA» era fingida.
  `src/app/(app)/portal/evolucion/workout-request.test.ts` comprueba que no
  vuelve por accidente. Las reglas `RB-IA-001/003` quedan ⏸️ apagadas.

El consentimiento `consentAIAt` sigue en el modelo; los tiles de
consentimiento de la ficha son Contrato, Salud, Imágenes y Marketing.

## Nota sobre el recuento del menú de Dirección

El roadmap de la jornada (§3.4) fijaba bajar el menú de Dirección de 15
entradas a 13. Con Ofertas fuera —primero oculta, desde el 23-08-2026
eliminada— queda en **14**: las demás filas de esa tabla
(salud para Dirección de centro, Comercial del entrenador, navegación del
Entrenador Admin) no retiran nada más de ese menú, y ninguna de las entradas
restantes es prescindible sin dejar su pantalla sin puerta de entrada — la
«Puesta en marcha», por ejemplo, dice de sí misma que se queda ahí «por si
añades otro centro o cambias de tarifas». El aforo de clases no suma entrada
para Dirección: lo edita en Organización → Centros, junto al resto de ajustes
del centro.
