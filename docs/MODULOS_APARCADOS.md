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
`CRM_REGLAS_NEGOCIO.md` §8.7.

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

## IA y chat en la ficha del socio (23-08-2026, rediseño de la ficha)

**Por qué.** El rediseño de `/members/[id]` unifica once pestañas en cinco
secciones y el cliente decidió que la ficha no es el sitio del chat ni de la
rutina generada por IA: el socio ya tiene el chat flotante en su portal y la
rutina no se consultaba desde aquí. Se retira del todo de la ficha, no se
esconde tras un flag.

**Qué se ha hecho.**

- `src/app/(app)/members/[id]/page.tsx`: fuera la pestaña «IA & Chat» y con
  ella las llamadas a `canAccessMemberChat`, `getOrCreateConversation`,
  `listMessages` y `listWorkoutPrograms`, y los imports de `StaffChatThread` y
  `WorkoutProgramList`. El consentimiento `consentAIAt` sigue en el modelo y en
  el payload del panel de datos, pero deja de pintarse: los cuatro tiles de
  consentimientos son Contrato, Salud, Imágenes y Marketing.
- `e2e/portal.spec.ts`: fuera el caso «el entrenador asignado ve el chat y la
  rutina del socio en su ficha». El chat del portal (panel flotante) se sigue
  probando en el mismo archivo.

**Qué NO se ha tocado.** `chat-actions.ts`, `staff-chat-thread.tsx`,
`workout-panel.tsx` y `workout-actions.ts` siguen en el repo, exportados y sin
cambios, igual que `lib/workout-programs.ts` y el chat del portal del socio.
Ninguna tabla ni dato se ha borrado.

**Para reactivarlo.** Volver a montar `StaffChatThread` y `WorkoutProgramList`
en una sección de la ficha (o en una ruta propia) con las cuatro queries de
arriba, y devolver el tile de «Tratamiento con IA» a los consentimientos.

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
