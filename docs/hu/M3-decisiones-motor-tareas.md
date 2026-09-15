# M3 · Decisiones del motor de tareas

> Pista **M3** · lote 3 · historias **E14-11** a **E14-14**.
> Lo que hay que saber sin volver a leer el código, y lo que otras pistas tienen
> que decidir en sus ficheros.

---

## 0. La causa, verificada contra datos

Antes de tocar nada, las tres causas del plan se comprobaron sobre la base de
demo sembrada (`npm run db:seed`), con **7 personas en dirección**. Una sola
pasada del cron, sobre los mismos datos, antes y después:

| | antes (`main`) | después |
|---|---|---|
| tareas automáticas abiertas | **238** | **38** |
| socios con el bono acabándose | 11 | 11 |
| …que tenían su tarea de bono | **7** | **11** |
| …con las dos tareas abiertas a la vez | **0** | 4 |

Las cuatro que faltaban no eran un caso raro: eran **imposibles**. Esos cuatro
socios ya tenían abierta la de «pocas sesiones programadas», las dos reglas
escribían la misma clave, y el deduplicador se comía la segunda **en silencio** —
mientras la regla devolvía «he creado 77». Con siete direcciones, ningún socio
podía tener nunca las dos.

Eso es el «216 creadas y muchas repetidas» del encargo, y de paso la mitad que no
se ve: además de sobrar, **faltaban las que más venden**.

La segunda y la tercera pasada del cron ya no escriben nada. (Los datos de demo
se siembran con valores aleatorios, así que las cifras exactas bailan un poco de
un `db:seed` al siguiente; el orden de magnitud y las proporciones, no.)

---

## 1. La clave de deduplicación (E14-11)

`createNotificationOnce` deduplicaba por
`(orgId, recipientUserId, entityType, entityId, resolvedAt: null)`.
Ahora la clave lleva además **la regla** y **el tipo de aviso**:

- **La regla**, porque cada una tiene su `entityType` propio en el catálogo
  `AUTO_TASK_RULES` (`src/lib/tasks.ts`). Es el patrón que ya se había inventado
  `no-show-alerts.ts` para escaparse de esto mismo; aquí deja de ser un truco
  suelto y pasa a ser la tabla que consultan el motor, la pantalla y el script
  de limpieza.
- **`kind`**, porque un `ALERT` de campana y un `TASK` del tablero no son la
  misma cosa y no deben comerse el uno al otro. Esto separa, sin tocar sus
  ficheros, el «mensaje nuevo de un socio» (`chat.ts`, TASK) del aviso de impago
  (`stripe-dunning.ts`, ALERT), que comparten `entityType = "Member"`.

El catálogo vive en `lib/tasks.ts` y no en `lib/notifications.ts` **a propósito**:
`tasks.ts` no importa `prisma` y por tanto lo puede leer el tablero, que es
cliente.

### Entidades nuevas

`MemberFewSessionsScheduled`, `MemberLowPackBalance`, `MemberStallRisk` y
`AutoTaskWeeklyCap`. El `entityId` sigue siendo el del socio (o el de la persona,
en el aviso del tope), así que el enlace de la campana sigue llevando a la misma
ficha. Se han añadido a `src/lib/notification-routes.ts` **y a su réplica móvil**
`apps/mobile/src/notification-routes.ts`, que el test compara.

> `notification-routes.ts` no es de ninguna pista del lote 3. El cambio es
> estrictamente aditivo —cinco `case` más— y sin él las entidades nuevas
> dejarían el aviso sin enlace a la ficha.

---

## 2. El abanico por destinatario (E14-11)

`Notification.recipientUserId` es **obligatorio**, así que «una tarea de centro
sin dueño, que la coja quien pueda» no cabe en el modelo sin tocar el esquema, y
el esquema está congelado.

**Decisión: un dueño, elegido con criterio, y deduplicación de ámbito de
organización.** Una regla marcada `audience: "centro"` en el catálogo:

1. deduplica en **toda la organización**, no por destinatario: si la tarea ya la
   tiene alguien de dirección, no se abre una segunda para el de al lado;
2. elige destinatario con `pickCenterTaskRecipient`: de quienes tienen hueco en
   el tope de la semana, **el que menos tareas automáticas lleve**; a igualdad,
   el primero por id, para que dos pasadas seguidas no bailen;
3. y queda reasignable desde el tablero, que es lo que hace que «la coja quien
   pueda» siga siendo cierto en la práctica: dirección ve y reparte las tareas de
   todo su ámbito (`canAssignTasks`).

Los candidatos se acotan además **al centro del socio** (dirección de
organización siempre; dirección de centro, la del suyo), como ya hacía
`no-show-alerts.ts` por E1-07: el nombre y apellidos de un socio de La Jota no
tienen por qué aparecer en la bandeja de Santander.

### Qué reglas se han girado, y cuáles no

Giradas a `"centro"` — las tres reglas de esta pista, que son las del encargo:

| regla | fichero |
|---|---|
| `fewSessionsScheduled` | `trainer-alerts.ts` (M3) |
| `lowPackBalance` | `trainer-alerts.ts` (M3) |
| `stallRisk` | `stall-detection.ts` (M3) |

**`noShowStreak` se queda en `"persona"` a pesar de tener el mismo abanico.** Se
probó girarla —el catálogo lo permite sin tocar `no-show-alerts.ts`— y rompe
`no-show-alert-scope.test.ts`: **E1-07 fijó por test QUIÉNES tienen derecho a
recibir ese aviso** (dirección de organización, más la del centro donde de hecho
entrena el socio, imputación por `CenterMembership` incluida). Con una sola copia
esa comprobación pasa de «quiénes tienen derecho» a «a cuál de ellos le tocó», y
eso no es un test que se reescriba desde otra pista: es una frontera de centro,
y la decisión es de quien mantiene ese fichero.

**No giradas** (siguen repartiendo N copias, exactamente como hoy):
`noShowStreak` (`no-show-alerts.ts`), `leadWithoutOwner` (`leads-queries.ts`),
`dispute` (`stripe-disputes.ts`), `jobFailure` (`job-failure-report.ts`), y las
de socio (`clientFeedback`, `followUp`, `selfAssessmentPrompt`,
`trainerRatingPrompt`), que van a una persona concreta y ahí N copias sí es lo
correcto.

> **Petición a quien posea esos ficheros:** las cuatro primeras tienen el mismo
> abanico y se arreglan cambiando **una palabra** en `AUTO_TASK_RULES`
> (`audience: "persona"` → `"centro"`), sin tocar la regla — pero hay que
> revisar sus tests de ámbito a la vez, como enseña `noShowStreak`. No se ha
> hecho aquí porque cambia a quién le llega su trabajo. La palanca está puesta.

El script de limpieza respeta lo mismo: en una regla `"persona"` dos filas del
mismo socio para destinatarios distintos **no son un duplicado**, y no se borran.

---

## 3. El tope semanal (E14-12)

La columna ya existía (`Organization.autoTaskWeeklyCapPerUser`, `@default(15)`,
CHECK 1-200). **Se mantiene el 15** como valor por defecto, y el argumento es
este: son unas **tres al día de trabajo real**, que es lo que una persona de
dirección puede atender además de dar sala, cerrar caja y hablar con socios. Por
encima de eso, la bandeja deja de ser una lista de trabajo y pasa a ser un
paisaje — que es exactamente el punto en el que está hoy el cliente con 216.

- **Cuenta solo lo automático**: `createdByUserId = null`. Lo que una persona
  encarga a otra no se limita **nunca**. El tope protege de la máquina, no del
  equipo.
- **Cuenta solo `kind = "TASK"`**. Un `ALERT` es un aviso de campana, no trabajo
  repartido — y entre los `ALERT` está «una regla automática está fallando»,
  justo el que nunca puede quedarse sin escribir.
- **Cuenta las creadas en la semana**, resueltas o no, de lunes a domingo. Si
  contara solo lo abierto, cerrar tareas abriría hueco para que la misma pasada
  del cron volviera a llenarlo: el aluvión, otra vez.

### Qué pasa al alcanzarlo

De las tres salidas que planteaba la historia —descartar la de menor prioridad,
acumular para la semana siguiente, escribir una sola tarea resumen— se eligen
**las dos últimas, y ninguna descarta nada**:

1. **No se descarta.** Las reglas del motor son **detectores sobre el estado de
   hoy**, no una cola de mensajes: vuelven a pasar cada noche y vuelven a mirar.
   Una tarea que el tope no deja escribir esta semana no se ha perdido — la
   situación que la provoca (el bono que se acaba, el calendario vacío) sigue en
   los datos, y la próxima pasada con hueco la escribe. Por eso **no hace falta
   una cola de pendientes**, que sería una segunda fuente de verdad sobre algo
   que ya está en la base.
2. **Antes de topar, se reparte.** `pickCenterTaskRecipient` salta a quien tenga
   hueco. Con varias personas en dirección, el trabajo cae donde cabe en vez de
   amontonarse sobre la misma persona.
3. **Cuando ya no cabe en nadie, se dice.** Una sola tarea resumen por persona
   (`AutoTaskWeeklyCap`, prioridad ALTA), que se resuelve como cualquier otra y
   que no se cuenta a sí misma para el tope.
4. **Y se dice en la pantalla**, que es lo que pedía la historia: `/tareas`
   avisa a partir del 80 % del tope y con más énfasis al alcanzarlo, con el
   consumo por persona. Un tope invisible es un fallo que nadie reporta.

**Lo que falta y no es de esta pista:** el número se puede cambiar en la columna,
pero no hay todavía un campo en los ajustes de la organización para hacerlo desde
la pantalla. La pantalla de ajustes no es de M3.

---

## 4. La agrupación (E14-13)

Es **de presentación y solo de presentación**. `groupTasksByRule` (en
`lib/tasks.ts`, puro y sin `prisma`) reparte las tareas ya cargadas en bloques
por regla, conservando el orden de entrada.

- El **contador es `tasks.length`**: no hay ninguna columna, fila ni caché que
  mantener. Por eso «resolver una suelta baja el contador» sale gratis — el
  grupo se recalcula con una menos.
- **Resolver el grupo** cierra sus tareas **una a una** por
  `completeTaskAction` → `resolveNotification`, con su comprobación de acceso
  cada una. Un `updateMany` por regla habría sido más corto y se habría saltado
  el control de acceso por tarea.
- Solo se agrupa **lo automático y de una regla conocida**. Dos encargos de una
  persona con el mismo texto son dos encargos, no un duplicado — el mismo
  criterio que ya aplicaba `createManualTask` al no usar la versión deduplicada
  del motor.
- Las tarjetas agrupadas **no se arrastran** entre columnas del tablero: mover
  un bloque escondería a cuál de las N se le está cambiando el estado.

El estado sigue derivándose de `startedAt`/`resolvedAt`, sin columna propia, y
`resolveNotification` sigue siendo el único camino a «Hecha».

---

## 5. Las reglas que no deduplican (punto (c) del encargo)

Se han mirado una por una. **Las tres están bien como están; no hay ningún
olvido que corregir**, y por eso no se ha tocado ninguno de esos ficheros.

| Sitio | Qué escribe | Veredicto |
|---|---|---|
| `agenda-queries.ts:938` | `INFO` al socio: «se ha cancelado ⟨sesión⟩», `entityType: "ClassSession"`, `entityId: sessionId` | **Correcto.** Es el aviso de un hecho puntual, dirigido al socio, y la sesión se borra en la misma transacción: no puede repetirse. `Once` aquí solo añadiría una consulta. |
| `agenda-queries.ts:1231` | `INFO` al socio: «te han quitado la plaza de ⟨sesión⟩», `entityType: "Booking"`, `entityId: booking.id` | **Correcto.** Una reserva se cancela una vez; la clave es la reserva concreta, no el socio. |
| `birthday-jobs.ts:85` | `INFO` al socio: felicitación, `entityType: GREETING_ENTITY`, `entityId: ⟨socio⟩:⟨año⟩` | **Correcto, y ya deduplicado mejor que con `Once`.** La marca de «ya felicitado» se escribe en `AuditLog` **antes** de enviar y se comprueba antes de entrar. `createNotificationOnce` no habría servido: deduplica solo contra lo **no resuelto**, así que un socio que hubiera cerrado la felicitación del año pasado habría recibido dos. Una felicitación anual no es un duplicado. |

---

## 6. La limpieza (E14-14)

`scripts/limpiar-tareas.ts`. **Simulacro por defecto**; borrar exige
`--ejecutar`, y antes de borrar vuelca a `exports/limpieza-tareas/⟨fecha⟩.json`
las filas completas, no solo sus identificadores.

Clasifica en este orden, y cada tarea cae en la primera razón que la alcanza:

1. **el socio ya no está** — la entidad apuntada no existe;
2. **la situación ya no se da** — se vuelve a evaluar la condición de la regla
   contra los datos de hoy (hay comprobador para las cuatro reglas del catálogo
   que son de M3; sin comprobador, **no se toca**);
3. **duplicado exacto** — misma regla y misma entidad: se queda la que alguien ya
   empezó (`startedAt`) y, si ninguna, la más antigua;
4. **escrita con la clave vieja** — `entityType = "Member"` con el texto de una
   de las tres reglas migradas. Se retira aunque sea trabajo real y único,
   porque el motor ya escribe con la entidad propia y si no el tablero enseñaría
   dos tarjetas de lo mismo. **No se pierde**: la situación sigue en los datos y
   la próxima pasada la vuelve a escribir, una vez y con dueño. El informe dice
   cuántas van a volver.

**Lo que no toca jamás:** lo que ha encargado una persona (`createdByUserId` no
nulo), lo ya resuelto, y el aviso del tope. Las huérfanas no se borran sin
`--incluir-huerfanas`: si un socio desapareció de la base, lo primero es mirar
por qué, no tapar el rastro.
