# Producto · Gestión del centro

Qué hace la plataforma en el día a día de un centro: socios, salud, valoraciones,
agenda, bonos, sesiones y el trabajo del entrenador. Las reglas numeradas
(`RB-*`) están en [CRM_REGLAS_NEGOCIO.md](./CRM_REGLAS_NEGOCIO.md); aquí se citan
por su código, no se reescriben.

---

## 1. Socios

### 1.1 Estados

`MemberState`: `PROSPECT` → `TRIAL` → `ACTIVE` → `DELINQUENT` / `FROZEN` /
`CANCELLED`. Los mueve **un solo módulo**, `src/lib/member-lifecycle.ts` (M4), y
eso es lo que permite que un disparador de flujo o una etiqueta automática se
apoyen en `Member.state` sin tener que reconciliar dos escritores.

Ojo con la distinción, que el modelo separa a propósito:

- `FROZEN` (estado del socio) y `Subscription.PAUSED` (congelación voluntaria:
  agosto, lesión, viaje) no son lo mismo que `DELINQUENT` / `PAST_DUE`. **Un
  socio pausado no es un moroso.**
- `Subscription.PENDING_CONFIRMATION` es el primer cobro asíncrono en vuelo (un
  adeudo SEPA tarda días en liquidar): todavía no abre acceso, y tampoco es un
  impago — aún no se sabe.

### 1.2 La ficha

Una sola pantalla (`/members/[id]`) con: datos de contacto y consentimientos,
estado y plan, bitácora de observaciones no clínicas (`MemberNote`), progreso
físico, valoraciones, composición corporal, salud y mesociclos. En la cabecera,
el aviso permanente de condición crónica (ver §2.3).

### 1.3 Alta

Tres vías, y las tres acaban en la misma ficha:

| Vía | Quién | Dónde |
|---|---|---|
| Manual | Recepción y dirección | `/members` |
| Pública | La propia persona | `/hazte-socio/[org]/[centro]` con checkout |
| Importación CSV | Solo dirección (`canImportMembers`) | `/members`, ver §1.4 |

**Menores** (`src/lib/minors.ts`): el consentimiento lo firma quien tiene la
patria potestad, y eso cambia el formulario, no solo una casilla.

### 1.4 Importación desde CSV (`RB-IMPORT`)

Exclusiva de dirección (`OWNER` y `CENTER_DIRECTOR`); recepción da de alta de uno
en uno pero no importa. Validada contra un export real de **MyWellness /
Technogym**.

- `src/lib/member-import.ts` reconoce las cabeceras en español con o sin acentos
  y **autodetecta el separador** (`,`, `;` o tabulador).
- Cada fila se inserta o actualiza: la operación es **idempotente**, reimportar
  el mismo archivo no duplica. El resumen devuelve altas, actualizados y
  omitidos con el motivo por fila.
- A los socios **nuevos con email** se les crea una invitación y se les manda el
  acceso, salvo que dirección desmarque la casilla. Solo a los dados de alta en
  esa pasada (`Invitation.memberId` es único), nunca a quien ya tenga la ficha
  activada: cargar un histórico de ex clientes no debe disparar cientos de
  correos.

### 1.5 El muro de la primera sesión

La importación trae lo justo para identificar a la persona: en el export de
referencia, dirección, ciudad, CP y provincia vienen en blanco, el teléfono real
viaja en la columna *Móvil* y no hay contacto de emergencia. Dirección no puede
inventárselos, así que se le piden al socio la primera vez que entra
(`src/lib/member-first-session.ts`):

1. **Datos esenciales** — solo los que estén vacíos. El CP es el que alimenta el
   mapa por barrios del panel: sin él, el socio no aparece en ninguna métrica de
   zona.
2. **Su parte de la valoración inicial.**

El muro **no tiene salida** (solo cerrar sesión) y se devuelve *en lugar* del
portal, no como un modal encima: lo que pregunta lo contesta el socio en un
minuto, así que un «ahora no» equivaldría a no pedirlo nunca. Es la diferencia
deliberada con el aviso de valoración vencida, que sí se puede descartar porque
allí se pide una revisión que solo cierra el entrenador.

### 1.6 Formularios con token (M5)

`MemberFormInvite` + `/formulario/[token]`: enviar un cuestionario a alguien que
todavía no tiene cuenta. La ruta va con `noindex` y `referrer: no-referrer`
porque indexarla sería publicar un enlace que abre el cuestionario de salud de
una persona concreta.

### 1.7 Baja de cuenta y portabilidad

- `src/lib/account-deletion.ts` — borrado de cuenta desde el portal y desde la
  app, con la advertencia de qué se conserva y por qué (los plazos citan la
  norma, ver `docs/legal/03`).
- `src/lib/member-data-export.ts` — exportación de los datos del socio (derecho
  de portabilidad).
- `src/lib/data-retention.ts` — motor de conservación: purga y anonimiza según
  las reglas de plazo. Corre el último de cada organización en el cron, porque
  todas las reglas anteriores todavía quieren leer lo que borra.

---

## 2. Salud y Semáforo de Aptitud

Funcionalidad de plan: `salud_aptitud`. Acceso: **siempre** por
`src/lib/health-access.ts`, con `AuditLog` en cada lectura (ver
[ARQUITECTURA.md §5](./ARQUITECTURA.md)).

### 2.1 Dos ejes: qué es y en qué fase está

`HealthRecordType` dice **qué es** (lesión, medicación, alergia, cirugía,
condición crónica). `HealthStatus` dice **en qué fase está**:

```
ACTIVE  →  IN_REHAB  →  RESOLVED
CHRONIC (permanente: no se espera que se resuelva)
```

Son dos ejes y hacen falta los dos:

- Una lesión que ya no se va a curar (hernia L4-L5, hombro operado con limitación
  residual) es `type = INJURY` + `status = CHRONIC`. **Tiene que seguir siendo
  una lesión**: el semáforo empareja por `zone` y `CHRONIC_CONDITION` no lleva
  zona — convertirla apagaría el semáforo justo en el caso más limitante.
- Una condición crónica superada (asma infantil que ya no cursa) es
  `type = CHRONIC_CONDITION` + `status = RESOLVED`.

«¿Esto es permanente?» se pregunta en un único sitio: `isChronicHealthRecord()`
en `src/lib/health-status.ts`.

### 2.2 Vigente ≠ activa

Con cuatro fases, «activa» y «vigente» dejaron de ser sinónimos. Todas las
consultas filtran por `OPEN_HEALTH_STATUSES = [ACTIVE, IN_REHAB, CHRONIC]` —
panel del entrenador, Session Brief, transparencia del portal, criterios clínicos
que salen hacia la IA y el recuento de la ficha. Solo `RESOLVED` se cae: una
lesión en rehabilitación es la que más adaptación necesita, y una crónica no deja
de limitar por ser antigua.

Además se registra `injuryDate` (con `injuryDateApprox` cuando solo se sabe mes y
año), distinto de `reportedAt` —cuándo alguien lo escribió en la app—, y cada
salto de fase deja su apunte `HEALTH_RECORD_STATUS_CHANGED` con `metadata.from/to`.

### 2.3 El aviso permanente de la ficha

Lo enciende **solo la fase** `CHRONIC`, no el tipo. Motivo: la captura de salud
del lead (`RB-LEAD-001`) escribe todo lo que declara el interesado como
`CHRONIC_CONDITION`, incluido «ninguna» — si el tipo encendiera el aviso, media
base tendría una alerta roja por haber rellenado un formulario. Marcar la fase
`CHRONIC` es un acto explícito de alguien del centro.

### 2.4 El semáforo

`AptitudeRule` empareja zona de lesión con una luz (`GREEN` / `AMBER` / `RED`),
un bloque afectado y una adaptación. **No mira el `status`**, y no debe: quién
decide si una lesión cuenta es el filtro del lado del registro.

`src/lib/aptitude-light.ts` resuelve la luz final (`RB-SALUD-012`):

- Una condición declarada **sin regla** enciende `AMBER`, nunca `GREEN` — el
  fallo que arregla es que el semáforo se apagaba en silencio ante hipertensión,
  embarazo, diabetes o una zona que nadie había normalizado. En la sala, la
  rodilla se ve cojear; la tensión no.
- Con varias condiciones manda **la más restrictiva**.
- «Sin restricciones» solo se pinta cuando no hay ninguna condición.

Las reglas se configuran en `/health/aptitude-rules` (dirección).

---

## 3. Valoraciones y composición corporal

### 3.1 Valoraciones (`/organization/valoraciones` para configurar)

Qué se pregunta y cada cuánto es **configuración por organización**
(`src/lib/assessments/config.ts`), no una constante del código: cambiar «revisión
a los 9 meses» por «a los 10» no es un despliegue, y un centro que no mide la
plancha isométrica puede quitarla del formulario. La fila **solo existe cuando el
centro se aparta del estándar**; su ausencia es el comportamiento de siempre.

La valoración inicial se rellena **a dos manos**:

| Lo rellena | Secciones |
|---|---|
| El socio, al entrar | Perfil (edad, sexo, altura, objetivos, motivación), experiencia y constantes (peso, dolor, sueño, estrés, energía, días/semana) |
| El entrenador, en el centro | Screening de salud, marcas físicas, notas y PAR-Q |

`Assessment.memberPartAt` marca el primer tramo. No vale un `completedAt` a
medias: **sin PAR-Q firmado no se propaga nada a `HealthRecord`**, que es la
puerta del art. 9. El entrenador se encuentra el formulario ya escrito y
editable — si al medir resulta que el socio se puso 4 cm de más, corregirlo ahora
es más barato que arrastrar una altura falsa a todos sus IMC.

### 3.2 Composición corporal (bioimpedancia / Tanita)

Origen: el informe real de una báscula **Tanita (MyTanita)**.

- `src/lib/tanita-parse.ts` — lectura del informe.
- `src/lib/composition-view.ts` — qué se enseña y cómo.
- `src/lib/reference-ranges.ts` + `/health/reference-ranges` — los rangos de
  referencia son **de la organización** y se definen por sexo y tramo de edad. Si
  no hay fila que le corresponda a un socio, su valor se muestra **sin semáforo**
  (E3-09): un dato sin norma poblacional no se pinta de un color inventado, y
  menos de rojo.
- Fotos de progreso: cifradas fuera de la base, con enlace firmado
  (ver [ARQUITECTURA.md §5](./ARQUITECTURA.md)).

---

## 4. Agenda, reservas y aforo

### 4.1 Sesiones

`SessionTemplate` define la sesión periódica; `ClassSession` es cada ocurrencia
(`src/lib/session-occurrences.ts`, `session-series.ts`). Se define la plantilla
una vez y la agenda se llena sola.

Además de las clases de grupo, hay **franjas de entrenamiento personal** (EP
slots), que la web fuerza a **1 plaza**.

### 4.2 Aforo

`MAX_GROUP_CAPACITY = 30` es el tope global, y el aforo por defecto del centro
(pantalla `/aforo`, rol `CENTER_DIRECTOR` / `TRAINER_ADMIN`) **no puede
saltárselo**. La aritmética vive en `src/lib/group-capacity.ts`, sin Prisma, para
que web y app apliquen el mismo número y no dos parecidos — el `PATCH /capacity`
móvil usaba un 30 fijo, ignoraba el aforo del centro y aceptaba cualquier
`sessionId`, franjas de EP incluidas.

### 4.3 Reservas y lista de espera

`BookingStatus`: `BOOKED`, `WAITLISTED`, `CANCELLED`, `ATTENDED`, `NO_SHOW`.

> **Invariante.** Toda transición pasa por `assertBookingTransition`
> (`src/lib/booking-transitions.ts`). `CANCELLED` y `WAITLISTED` **nunca** llegan
> a `ATTENDED`, en ninguno de los cuatro puntos de escritura.

La **lista de espera** se renumera cuando alguien sale (`src/lib/waitlist.ts`):
antes se escribía `waitlistedCount + 1` una vez y nadie volvía a tocarlo, con lo
que dos personas acababan en la misma posición. Lo que la posición **no** es —y
la interfaz lo dice— es un turno: por `RB-RES-007`, al liberarse un hueco se
avisa a toda la lista a la vez y la plaza es de quien la reclame antes. La
posición ordena el aviso y dice a cuánta gente tienes delante; no reserva nada.

### 4.4 Ventana de cancelación

Dos piezas, y conviene no confundirlas (`src/lib/portal-queries.ts`):

- **Cuántas horas** (`RB-RES-005`): `CANCEL_WINDOW_HOURS`, configurable por
  entorno con `CANCELLATION_WINDOW_HOURS` para poder cambiar la regla sin
  desplegar; si falta o no es un número válido, 24 h.
- **Contra qué instante**: se calcula en la zona horaria **del centro**, no en la
  cookie `tz` del navegador, y el mismo cálculo pinta el distintivo «cancelable
  sin penalización» y ejecuta la cancelación (`canCancelWithoutPenalty`,
  `enforcementStartsAt`). Con dos cálculos había un desfase de hasta ~26 h: un
  socio con la cookie en América veía «cancelable» una reserva que al pulsar le
  costaba la sesión.

Cero literales de horas en el cliente, ni en la web ni en la app: el número llega
del servidor.

### 4.5 Asistencia, no-show y avisos

`src/lib/no-show.ts` y `no-show-alerts.ts`. La alerta por faltas seguidas salta al
marcar la falta, y el cron la repasa como red de seguridad (`RB-RES-009`).
Recordatorios de sesión en `session-reminders.ts`; aviso de plaza libre en
`session-vacancy-notify.ts`.

---

## 5. Bonos y saldo de sesiones

> **Invariante.** Ninguna operación mueve `sessionsRemaining` sin escribir en
> `SessionLedger` (`src/lib/session-ledger.ts`, `RB-VENTA-008`).

El libro mayor existe porque sin él la pantalla mentía de tres formas a la vez:
la tarjeta decía «5 gastadas de 12», el resumen «0 gastadas» y «9 no
presentadas», y el listado que promete *«aquí aparece cada sesión gastada y cada
devolución»* no tenía una sola línea de consumo. La causa: el movimiento se
derivaba de `booking.subscriptionId`, que la cancelación pone a `null` y la
reserva hecha a mano por el staff nunca puso.

El cron abre una fila de apertura para los bonos anteriores al libro mayor. Es
idempotente —solo entra el bono sin ningún asiento—, así que no hizo falta un
despliegue especial para el histórico.

Ajuste manual de saldo: `canAdjustSessionBalance` — `TRAINER_ADMIN` y
`RECEPTION` sí, el entrenador raso **no** (`RB-PAGO-008`).

---

## 6. El trabajo del entrenador

### 6.1 Session Brief (G.1)

`/brief/[id]` — antes de la sesión, quién viene, con qué condiciones vigentes y
qué adaptación toca para cada uno. Cada apertura queda en `AuditLog`.
Funcionalidad de plan: `salud_aptitud`.

### 6.2 Debrief (Session Loop)

**Un único canal de escritura** (`src/lib/session-debrief.ts`, E3-07). Había tres
escritores con dos criterios incompatibles: la web (🟢🟡🔴), su espejo móvil, y un
endpoint de ocho ejes que *derivaba* el color de la media. Un entrenador
puntuaba ocho ejes en la app (media 8,5 → verde), tocaba 🔴 en la web y quedaba
`feeling: RED` con `technique: 9`. Nadie reconciliaba. Y rellenar solo el RPE
dejaba la media a `null` y derivaba ámbar: el socio quedaba marcado «regular»
para siempre sin que nadie lo hubiera dicho. Promediar movilidad con actitud no
significa nada.

### 6.3 Mesociclos por IA (F6)

Funcionalidad de plan `ia_programacion` — el único módulo con **coste marginal
real**, y por eso el único con cupo (20 generaciones/mes en Avanzado).

- `src/lib/ai/mesocycle-generator.ts` genera un árbol
  `Mesocycle → Phase → Day → Block → Exercise` validado con Zod, que nace en
  `DRAFT`, se edita campo a campo y se refina en multi-turno.
- El sistema del modelo se compone en `src/lib/ai/methodology.ts` a partir de
  `src/lib/ai/methodology/*.md`: rol y principios, regla de oro, glosario, reglas
  científicas, reglas de programación, formato de sesión, los porqués, y un
  perfil por tipo de cliente (rendimiento, mantenimiento, rehabilitación, tercera
  edad, derivación a grupos). **Esos ficheros son código**: el modelo los lee en
  tiempo de ejecución, no son documentación.
- Nada clínico sale sin consentimiento (`canUseClinicalDataForAI`) y todo va
  pseudonimizado (`src/lib/ai/pseudonymize.ts`).
- `src/lib/ai/ai-act.ts` y `ai-literacy.ts` cubren la clasificación y la
  información al usuario que exige el Reglamento de IA; el encargo de tratamiento
  con el proveedor, en `ai/dpa.ts` y `docs/legal/04-USO-DE-IA.md`.

### 6.4 Panel del equipo

`/trainer` es el panel del entrenador, y desde E12-11 también lo ven dirección de
organización (todo su equipo) y dirección de centro (el de sus centros): quien
paga a los entrenadores tenía que poder mirar cómo les va.

---

## 7. Motor de retención (G.3)

`src/lib/retention.ts`. Compara la frecuencia reciente de cada socio contra su
**línea base personal** (ventana de 12 semanas cerradas, de −98 a −14 días) y
produce `RetentionAlert`. Funcionalidad de plan: `retencion`.

No tiene pantalla propia a propósito: la señal se lee donde dirección ya mira —el
listado de socios y la ficha— y alimenta `attendanceDropping` en
`src/lib/stall-detection.ts`. Lo dispara el cron; el seed llama a la misma
función para no tener dos criterios.

---

## 8. Tareas (F10)

`/tareas`, tablero de tres columnas. El estado **no vive en una columna**: se
deriva de las dos marcas de tiempo que ya lleva la fila, así que «Hecha» solo
puede significar que hay `resolvedAt` y no puede desincronizarse con un `status`
que alguien olvide escribir desde la campana o desde el cron
(`src/lib/tasks.ts`).

Las tareas también las genera el sistema: un fallo de una regla del cron se
convierte en tarea para la dirección de la organización afectada
(`src/lib/job-failure-report.ts`), y la recompensa de un referido genera la tarea
de validarla y marcarla como pagada.

---

## 9. Organización, personal y RRHH

- `/organization` — marca de la organización, logo por centro, centros y
  personal. Dirección de centro entra acotada a los suyos y sin marca ni alta de
  personal.
- `/rrhh` — alta de personal e imputación multi-centro vía `CenterMembership`
  (rol y % de dedicación). **Sin acceso a datos de salud.**
- `/puesta-en-marcha` — lista de comprobación del arranque de un centro
  (`src/lib/setup-checklist.ts`).
- `/anuncios` — comunicación al socio. Vive en la sección «Crecimiento» porque es
  comunicación, no estructura.
- **Logo:** el NavBar muestra el del centro; si no, el de la organización; si
  ninguno, el de **Apta**.

El módulo de **fichajes** está apagado desde E10-21: ver
[MODULOS_APARCADOS.md](./MODULOS_APARCADOS.md). Se oculta, no se borra.
