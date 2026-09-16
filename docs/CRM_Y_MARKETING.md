# CRM y marketing

Todo lo que va de captar, segmentar, comunicar y medir: leads, etiquetas, flujos
de email, referidos, anuncios, correo transaccional y el panel de dirección.

Las tres pantallas de automatización —`/etiquetas`, `/flujos` y `/referidos`—
comparten una sola funcionalidad de plan, **`marketing_automatizado`**, incluida
en Avanzado y por herencia en Élite y Fundador. `/leads` y `/anuncios` **no** se
gatean: son del núcleo. Lo que se cobra es la automatización, no poder apuntar a
quien entra por la puerta.

> **Por qué las tres van juntas y no sueltas.** La mitad de los disparadores de
> un flujo y **todas** sus condiciones se apoyan en etiquetas, así que «flujos
> sin etiquetas» es un editor que no puede segmentar. Y el programa de referidos
> se mide con las etiquetas del embajador y su correo de los 90 días es un flujo,
> así que «referidos sin lo demás» es un enlace y un panel sin campaña detrás.

---

## 1. Leads (`/leads`)

`Lead` con su canal, su responsable y su cierre. Catálogos por organización:
`LeadChannel` (cómo nos conoció) y `NoCloseReason` (por qué no cerró), ambos
configurables — no son enums.

- **Ámbito de centro aplicado** (`leadIsInScope`): dirección de organización ve
  toda la empresa; el resto del equipo, solo los leads de los centros a los que
  está imputado. La API móvil ya lo aplicaba y la web filtraba solo por
  organización: es el patrón «espejo móvil» al revés.
- **Captura de salud del lead** (`RB-LEAD-001`): lo que declara el interesado se
  guarda como `CHRONIC_CONDITION` con su consentimiento versionado
  (`LEAD_CONSENT_VERSION`) y pasando por `health-access.ts`. En menores, lo que
  se puede capturar lo decide `canCaptureLeadHealthData`.
- **Conversión**: al pasar a socio se crea la ficha con su invitación
  (`createMemberWithInvitation`) y se liberan las recompensas de referido
  pendientes de ese lead.
- **Formularios públicos**: `/lead-form/[org]/[centro]`, que canoniza hacia
  `/hazte-socio` y no se indexa.
- **WhatsApp** (`src/lib/whatsapp.ts`, decisión D-P3): enlace `wa.me` con el
  mensaje ya escrito. **Deliberadamente no hay integración con la API de WhatsApp
  Business** — sin verificación de negocio, sin plantillas aprobadas y sin coste
  por conversación. Quien pulsa revisa y edita el texto dentro de WhatsApp antes
  de enviarlo. Solo España este trimestre: un móvil de 9 dígitos se antepone con
  34.

### 1.1 Anuncios y coste de captación

`/anuncios` sirve para dos cosas distintas según el rol: comunicación al socio, y
—con el coste de campaña que registra el esquema de R1— el cálculo del coste por
lead y por alta que alimenta el panel.

---

## 2. Etiquetas (`/etiquetas`)

Dos clases, y **la distinción es de dato, no de nombre**:
`MemberTagDefinition.kind` es un enum `AUTOMATIC` / `MANUAL`.

Una automática **no se puede quitar a mano**: volvería sola en la siguiente
pasada del cron y parecería un fallo. Si el equipo necesita contradecir al
sistema, eso es una etiqueta manual distinta, nunca un borrado.

### Las nueve automáticas

| Clave | Qué significa |
|---|---|
| `grupo_reducido` | Tiene una suscripción activa de grupos reducidos |
| `entrenamiento_personal` | Tiene una suscripción activa de entrenamiento personal |
| `primeros_30_dias` | Se dio de alta hace menos de 30 días y sigue de alta |
| `bono_por_acabarse` | Le quedan 1 o 2 sesiones — la misma condición que la alerta de bono bajo |
| `dos_semanas_sin_venir` | 14 días o más sin sesión asistida; si nunca vino, desde el alta |
| `impago` | Impago abierto, con la fecha del primer recibo devuelto |
| `congelado` | Cuota congelada por voluntad propia |
| `excliente` | Causó baja, con su fecha y su motivo |
| `cumple_este_mes` | Cumple años este mes, en el calendario de su centro |

Siete de las nueve **no recalculan nada**: se cablean a la señal que ya existe
(`Member.state`, `delinquentSince`, `sessionsRemaining`, la última asistencia…).
Eso es lo que evita que el sistema acabe con dos criterios distintos para «lleva
dos semanas sin venir».

**Las claves son estables y son el contrato con los flujos**: la condición de un
flujo guarda la clave, no el rótulo, así que renombrar una etiqueta no puede
dejar flujos apuntando a nada.

Cada regla lleva su **definición en texto llano**, que es lo que se enseña en la
pantalla: una regla que nadie puede leer es una regla en la que nadie confía —y
aquí además es lo que evita la discusión de «¿por qué a este socio no le ha
entrado el flujo?». Si se cambia un umbral en `tag-engine.ts`, se cambia la
frase: ninguna máquina puede comprobar que dice la verdad.

Cada regla **pone y quita**, y lo segundo es la mitad que se olvida siempre. El
motor cuenta movimientos: un 0 en una segunda pasada seguida es la prueba barata
de que es idempotente.

Módulos: `tags.ts` (puro) · `tag-engine.ts` (las nueve reglas) ·
`tags-queries.ts` (con ámbito de centro).

---

## 3. Flujos de email (`/flujos`)

La estructura es **fija**, y el editor no permite nada más:

```
DISPARADOR → CONDICIÓN → ESPERA → ACCIÓN
```

### 3.1 Disparadores

Diez, y **ninguno recalcula nada**: cada uno se cablea a una señal existente, y
el editor enseña cuál al lado del desplegable.

| Disparador | Señal |
|---|---|
| Alta nueva | `Member.joinedAt` |
| Primera sesión hecha | La primera reserva `ATTENDED` |
| X sesiones sin venir | Días desde la última asistencia (la misma que la etiqueta) |
| El bono baja de N | `Subscription.sessionsRemaining` |
| Recibo fallido | `Member.delinquentSince`, que escribe el dunning |
| Cambio de estado | `Member.state`, que solo mueve `member-lifecycle.ts` |
| Aniversario del alta | `Member.joinedAt` |
| Cumpleaños | `Member.birthDate`, con el mismo criterio de zona y de 29 de febrero que el job |
| Formulario respondido | `MemberFormInvite.completedAt` |
| Valoración por debajo de N | `TrainerRating.score` |

Los umbrales numéricos se declaran una sola vez, con su rango, y el editor y el
servidor validan contra la misma definición.

### 3.2 Las seis reglas de seguridad

`src/lib/flows/safety.ts` — lógica pura, sin base de datos y **sin leer el reloj
del sistema**: el instante entra como parámetro, que es lo que permite probar los
casos malos (dos flujos disparando el mismo minuto, el cron a las 23:00, un socio
sin `consentMarketing`, la pausa global a mitad de cola, el cambio de hora).

1. **Máximo 1 email por socio y semana**, entre todos los flujos (7 días).
2. **Nada entre las 22:00 y las 8:00**, en la hora **del centro**.
3. **Un socio no repite el mismo flujo hasta 90 días después.**
4. **Pausa global.**
5. **Modo borrador.**
6. `canSendMemberEmail("marketing", …)`, que ya es ley.

> Los topes **no son columnas configurables** (decisión D-L3-7): son constantes
> de ese fichero. Una regla de seguridad que se afloja desde una pantalla deja de
> serlo.

### 3.3 El motor es una cola, no un «enviar ahora»

`flows/engine.ts` lee, escribe y reserva el hueco en una transacción. Si la
pasada cae dentro de la ventana de silencio, no manda nada y **reprograma a las
8:00**, sin perder nada.

Por eso el disparo tiene **su propio workflow** (`.github/workflows/flujos-cron.yml`)
separado del cron diario: el cron general corre a las 05:00 UTC, que está *dentro*
de la ventana de silencio, así que con solo esa pasada la cola no se vaciaría
nunca. La solución no es aflojar la ventana: es llamar al motor dentro de ella.

---

## 4. Programa de referidos (`/referidos`)

Un socio recomienda el centro con su código (`/r/[code]`, pensado para
compartirse por WhatsApp). Cuando el referido se da de alta, se libera la
recompensa **y su tarea**: la recompensa no se aplica sola, alguien de recepción
la valida y la marca como pagada.

Quién puede ser embajador: `ACTIVE`, `FROZEN`, `DELINQUENT` y `TRIAL`. Un
`PROSPECT` todavía no es socio; un `CANCELLED` tiene el código revocado.
Congelado y moroso **sí** siguen siendo socios de la casa: quitarles el enlace
por estar de vacaciones o por un recibo devuelto sería un castigo que nadie pidió.

### Las tres reglas antifraude

Deciden dinero, así que se escribieron sin acceso a datos: reciben hechos y
devuelven un veredicto (`ALLOW` / `REVIEW` / `BLOCK`). `REVIEW` libera la
recompensa marcada con su motivo y lo dice en el título de la tarea: **sobre un
hueco no se automatiza una decisión que reparte dinero, pero tampoco se tira a la
basura el trabajo de un socio sin que nadie lo mire.**

1. **Un excliente que se fue hace menos de la ventana configurada no cuenta como
   alta nueva.** La ventana sale de `ReferralProgramConfig.exMemberCooldownDays`
   (180 por defecto), no de un literal: lo decide quien dirige el centro. El caso
   difícil son los socios importados de MyWellness, que pueden **no tener
   `cancelledAt`** — el export de origen no siempre lo traía. Sin esa fecha la
   pregunta no tiene respuesta, y la respuesta segura a una pregunta sin respuesta
   que reparte dinero es **revisión humana**: ni se paga ni se niega a ciegas.
2. **Una recompensa por persona, no por alta.** La mitad «dos por el mismo lead»
   la sostiene el `@@unique([leadId, beneficiary])` de la base; la otra mitad —el
   que se da de baja y vuelve, con un lead nuevo— no la puede sostener un índice,
   así que se cuenta **por persona**.
3. **El código caduca si el socio se da de baja.** Se leen dos momentos porque son
   dos preguntas: ¿estaba vivo el código *el día que se usó*? (si no, la
   recompensa no nace) y ¿sigue siendo socio quien lo trajo? Si se fue **en
   medio** —trajo a un amigo en marzo y se fue en abril— eso no es fraude, es la
   vida, y no lo decide una máquina: va a revisión humana.

Todo `BLOCK` deja su motivo en `AuditLog`, para poder contestar «¿por qué a mi
amigo no le contó?».

Módulos: `referral-program.ts` (puro, incluido el antifraude) · `referrals.ts` ·
`referral-rewards.ts`.

---

## 5. Correo

### 5.1 Transaccional

`src/lib/emails/templates.ts` es el **único** sitio donde se maqueta correo: un
shell común (cabecera negra con logo, titular, cuerpo, ficha de datos, botón,
nota, firma y pie) y una función por correo. Hoy: bienvenida, verificación de
email, invitación al personal, recuperación de clave, enlace de facturación,
plaza libre, cumpleaños, pago fallido, preaviso SEPA, confirmación de mandato
SEPA, tarjeta a punto de caducar, activación del director, valoración vencida,
recordatorio de sesión, enlace de preferencias, mensaje nuevo de chat, acuse de
borrado de cuenta e invitación a formulario.

El correo de **flujos** usa su propia plantilla (`emails/flow-templates.ts`),
separada a propósito de la transaccional.

### 5.2 Preferencias y baja

`/preferencias/[token]` y `/baja/[token]`, con la baja de verdad detrás
(`src/lib/email-preferences.ts`, `member-suppression.ts`). `canSendMemberEmail`
es la puerta única: distingue servicio de marketing, y el marketing exige
consentimiento.

Las rutas con token van con `noindex`, `nocache` y `referrer: no-referrer` (ver
[SEO_Y_CAPTACION.md](./SEO_Y_CAPTACION.md) §2).

### 5.3 SMTP

`src/lib/mailer.ts`. La configuración es de entorno; sin ella el envío degrada en
vez de reventar.

---

## 6. Panel de dirección (`/dashboard`)

Funcionalidad `bi_avanzado` para el BI avanzado *dentro* del panel; la puerta no
se cierra (ver [ARQUITECTURA.md §4.2](./ARQUITECTURA.md)).

Qué enseña: ingresos y mezcla de ingresos (`revenue-mix.ts`), ocupación
(`occupancy.ts`), LTV y objetivos (`dashboard-targets.ts`), altas y bajas,
ranking de ventas (`sales-ranking.ts`), reparto por sexo y edad, canal de
captación, porcentaje de cierre, y el mapa por barrios.

Los periodos y el ámbito se resuelven en `dashboard-range.ts` y
`dashboard-scope.ts`; las consultas, en `dashboard-queries.ts`.

### 6.1 Mapa por barrios (`/mapa-barrios`, `RB-LEAD-010`)

Coropleta por barrio en vez de una capa de calor difuminada sobre burbujas por
código postal: con centros en Zaragoza **y** Santander, el encuadre resultante
era de escala nacional y los 19 barrios de Zaragoza se fundían en una sola
mancha.

- Geometría por ciudad en `src/data/geo/<ciudad>.topo.json`, servida por
  `GET /api/geo/[ciudad]`. El directorio está **vacío a propósito**: hasta que se
  publique la geometría de una ciudad, el mapa usa `tessellate()` (Voronoi sobre
  el centroide de cada CP) y la leyenda lo declara. Es el respaldo, no una avería.
- `undefined` **no es cero**: una métrica sin dato deshabilita su pastilla y pinta
  una raya en la celda en vez de inventar un cero.
- Módulos: `barrio-map.ts`, `barrio-geojson.ts`, `barrio-geometry.ts`,
  `barrio-coverage.ts`, `barrio-export.ts`, `barrio-contrast.ts`.

### 6.2 Definición de las métricas

Las cifras del panel se revisaron en septiembre de 2026 porque dirección
reportaba tres que no cuadraban. El diagnóstico, con el método y los datos
medidos, está en `DIAGNOSTICO_PANEL_2026-09.md` mientras el lote siga abierto.
La regla que salió de ahí: **una métrica que dirección lee distinto de como se
calcula es un fallo de definición, no de dato**, y se arregla en el rótulo tanto
como en la consulta.

---

## 7. Filtros de tabla

Un solo modelo de filtro, que se aplica al instante, en dos presentaciones del
mismo componente (`src/lib/use-table-filters.ts`, `filter-params.ts`):

| Vista | Variante | Ejes |
|---|---|---|
| `/members` | Filtros en columna | Centro, estado, plan, alta |
| `/leads` | Barra unificada | Centro, tipo de cierre, canal, responsable |

Sustituyó a una tarjeta `FilterBar` de ~330 px con botón **Filtrar**.
