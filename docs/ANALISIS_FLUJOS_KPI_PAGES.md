# Análisis de flujos, KPIs y páginas

Revisión completa de la app (45 páginas, 32 route handlers, 7 roles) buscando:
qué está roto, qué KPI miente, qué página sobra y qué falta. Es un documento de
propuesta — no cambia código. Cada punto lleva la referencia al fichero para que
se pueda verificar antes de decidir.

Orden del documento: primero lo que está roto (§1), luego la auditoría de KPIs
(§2), luego las páginas a eliminar/fusionar (§3), luego las mejoras de
funcionalidad (§4) y por último el backlog priorizado (§5).

---

## 1. Hallazgos críticos

Estos cinco no son mejoras: son cosas que hoy no hacen lo que dicen que hacen.

### 1.1 El motor de retención no genera ninguna alerta en producción

`RetentionAlert` **solo se crea en `prisma/seed.ts:1163-1192`**. No hay ninguna
regla que lo alimente: `/api/jobs/run` (`src/app/api/jobs/run/route.ts:47-55`)
ejecuta ocho reglas —leads sin responsable, pocas sesiones EP, bono bajo,
estancamiento, check-ins, ofertas, cancelaciones programadas, ciclo de
feedback— y **ninguna es la de retención**.

Consecuencia: en la demo el módulo se ve lleno; en un cliente real
`/retention` queda vacío para siempre, igual que el KPI "Alertas de retención"
del panel de control (`dashboard-queries.ts:10`). Y es el módulo que la propia
página vende como *"la señal con mayor ROI directo de la plataforma"*
(`retention/page.tsx:43`) y que va gateado en el plan Avanzado (149 €/mes).

**Propuesta.** Escribir `runRetentionAlertRule(orgId)` con la misma lógica que
usa el seed (frecuencia de las últimas 2 semanas contra la línea base personal
del socio) y engancharla en `/api/jobs/run`. Es la corrección de mayor impacto
comercial de toda la lista y no requiere UI nueva: la pantalla ya existe.

### 1.2 Dos funcionalidades vendidas no están gateadas en ninguna parte

`bi_avanzado` y `ia_programacion` se anuncian en `/planes`
(`platform-plans.ts:63-70,101-113` y `planes/hero.tsx:5`) pero **no aparecen en
ningún `requireFeature` ni en `FEATURE_BY_ROUTE`**. Verificado por búsqueda: los
únicos usos son el catálogo y el hero de la landing.

- Un cliente **Esencial** (79 €/mes, `features: []`) tiene hoy el panel de
  control completo con todo el BI: LTV, demografía, mapa de calor, ranking de
  socios. El comentario de `rbac.ts:31-34` dice que *"lo que se gatea es el BI
  avanzado DENTRO del panel"* — pero eso nunca se implementó.
- Lo mismo con el generador de rutinas (`lib/workout-programs.ts`, pestaña
  "IA & Chat" de la ficha del socio): es exclusivo de Élite (279 €/mes) y está
  abierto a todos.

**Propuesta.** Decidir explícitamente y dejarlo escrito: o se gatean (partir el
panel en un bloque básico —socios, ingresos, ocupación— y otro
`bi_avanzado`; añadir `requireFeature("ia_programacion")` en las acciones de
`workout-actions.ts`), o se bajan de tier y se dejan de vender como
diferenciador. Lo que no puede quedarse es el estado intermedio actual.

### 1.3 La dirección de centro ve los datos de toda la organización

`rbac.ts:6-8` define el ámbito `"center"` para `CENTER_DIRECTOR`, y
`getCentersForUser()` (`agenda-queries.ts:14-35`) resuelve correctamente los
centros de cada persona vía `CenterMembership`. Pero **solo lo usan `/agenda` y
`/anuncios`**.

Todo lo demás consulta por `orgId` a secas: `/dashboard`
(`dashboard/page.tsx:58`), `/members` (`members-queries.ts:4-12`, acepta
`centerId` pero la página nunca se lo pasa), `/billing`
(`billing-queries.ts:14`), `/retention`, `/feedback`, `/offers`, `/rrhh`.

Con Training Zone (3 centros) y Vitalia (2) esto significa que el director de
Chamberí ve la facturación, los socios y las alertas de Retiro. No es una fuga
entre empresas —el aislamiento multi-tenant está bien— pero sí entre centros, y
contradice la matriz de permisos documentada.

**Propuesta.** Resolver los centros visibles una vez en el layout y propagarlos
como filtro obligatorio a las queries de esos seis módulos. De paso habilita el
selector de centro en el panel de control (§4.1), que hoy no existe.

### 1.4 El registro de auditoría RGPD está detrás de un muro de pago

`rbac.ts:40` gatea `/audit` con la funcionalidad `exportaciones`, y
`api/audit/export/route.ts:14` hace lo mismo. Pero `entitlements.ts:36-40` dice
literalmente lo contrario:

> *el gateo afecta a la INTELIGENCIA construida sobre los datos […] nunca al
> registro ni a la consulta de lo que el gimnasio ya guardó, ni a su
> exportación. Guardar una lesión y sus consentimientos es obligación legal, no
> funcionalidad premium.*

Un cliente Esencial que trate datos de salud (puede: `/members` no está gateado
y `AuditLog` se escribe siempre) **no tiene forma de consultar ni exportar su
propio registro de accesos** — exigible bajo el Art. 9 RGPD y ante una
inspección.

**Propuesta.** Sacar `/audit` de `FEATURE_BY_ROUTE` y dejarlo por rol
(OWNER / PLATFORM_ADMIN). Si se quiere conservar algo premium, que sea el
análisis avanzado sobre el log, nunca el acceso al log.

### 1.5 Recepción no puede fichar

`/rrhh` admite a `RECEPTION` en su guarda (`rrhh/page.tsx:733`) y el widget de
fichaje es lo primero de la página, pero **`NAV_BY_ROLE.RECEPTION`
(`rbac.ts:102-107`) no incluye `/rrhh`**: no hay ningún enlace. Recepción solo
llega escribiendo la URL.

Mismo patrón, menos grave, en otros tres sitios:

| Ruta | La guarda admite | El menú lo muestra a |
|---|---|---|
| `/rrhh` | +RECEPTION | — |
| `/puesta-en-marcha` | +CENTER_DIRECTOR, HR_MANAGER, PLATFORM_ADMIN | solo OWNER |
| `/brief` | +OWNER, CENTER_DIRECTOR, RECEPTION | solo TRAINER |

**Propuesta.** Añadir `/rrhh` a la navegación de recepción (es su fichaje diario,
uso real) y alinear las otras tres: o entran en el menú del rol, o se quitan de
la guarda. Una guarda más laxa que el menú es permiso muerto que solo sirve para
sorpresas.

---

## 2. Auditoría de KPIs

Siete páginas pintan KPIs: panel de control (11 tarjetas), feedback (6), leads
(5), cobros (4), retención (4), panel del entrenador (4) y portal del socio (4).

### 2.1 KPIs que dan un número incorrecto

**"Sesiones este mes"** — `dashboard-queries.ts:19-21`. La query filtra
`date: { gte: startOfMonth() }` **sin cota superior**: cuenta todas las sesiones
programadas desde el día 1 hasta el infinito, incluidas las de meses futuros. El
seed crea hasta 3 semanas futuras, así que el número está inflado siempre. Falta
`lt: startOfNextMonth`.

**"Ahorro potencial estimado"** — `retention/page.tsx:38`:

```ts
const estimatedAnnualSaving = open.length * 3 * 45 * 12;
```

La etiqueta dice *"si se recuperan 3 socios/mes a 45 €"*, que son 1.620 €/año —
pero además multiplica por el número de alertas abiertas. Con 10 alertas
muestra 16.200 €. O se quita `open.length`, o se cambia el texto. Tal cual está,
es el KPI menos defendible de la app delante de un cliente.

**"Pagos fallidos"** — `billing-queries.ts:25`. Cuenta todos los `FAILED` de la
historia, sin ventana temporal. Es un contador que solo sube y que a los seis
meses no informa de nada. Debería ser del mes en curso, como su vecino
"Cobrado este mes".

**"Ingresos por mes · Últimos 6 meses"** — `dashboard-queries.ts:38-42`.
`setMonth(-6)` + `setDate(1)` devuelve **7 cubos**, no 6. Cosmético, pero el mes
más antiguo suele salir a medias y descuadra la lectura de la tendencia.

### 2.2 KPIs cuya definición no coincide con su nombre

**"LTV medio por cliente"** — `dashboard-queries.ts:163-171`. Es la suma de
cobros dividida entre clientes que han pagado alguna vez: **ingreso acumulado
por cliente hasta hoy**, no *lifetime value*. Sesga a la baja con cada alta
nueva y sube sola con el tiempo aunque el negocio empeore. O se renombra a
"Ingreso medio por cliente", o se calcula de verdad
(`ticket medio mensual × vida media en meses`), que además da una cifra
accionable para el coste de adquisición.

**"Retención por cohorte"** — `dashboard-queries.ts:141`. Cuenta como retenidos
`ACTIVE`, `DELINQUENT` **y** `FROZEN`. Un moroso de tres meses no es retención.
Propuesta: `ACTIVE + FROZEN` en la serie principal y el moroso como banda
separada, que es justo la conversación que interesa a dirección.

**"% empresarios"** — `dashboard-queries.ts:173,192`. Se infiere buscando
subcadenas (`"empresari"`, `"ceo"`, `"dueñ"`…) en el campo libre `occupation`.
Con texto escrito a mano por recepción esto tiene una precisión desconocida y no
auditable. Si el dato importa para segmentar oferta, merece un campo estructurado
en el alta; si no, mejor quitarlo que publicarlo con un porcentaje falso de
precisión.

**KPIs de feedback** — `feedback/page.tsx:208`. `computeFeedbackKpis(rows)` se
calcula sobre las filas **ya filtradas**. Al filtrar por "Sin feedback", la
tarjeta "Feedback del socio" cae a `0/N` y "% de respuesta" a 0. Los KPIs de
cabecera deberían ser siempre globales y el filtro afectar solo a la lista.

### 2.3 KPIs que faltan (y que un gimnasio sí gestiona)

El panel tiene 11 tarjetas y no tiene ninguna de las tres cifras con las que se
dirige un centro:

| KPI ausente | Por qué importa | Datos ya disponibles |
|---|---|---|
| **MRR / ingreso recurrente** | Distingue el mes bueno por un bono suelto del crecimiento real | `Subscription` (ACTIVE) × `priceCents` |
| **Churn mensual (%) y altas − bajas** | La métrica que decide si el negocio crece; hoy solo hay cohortes | `Member.joinedAt` / `cancelledAt` |
| **Comparación con el periodo anterior** | Las 11 tarjetas son números desnudos, sin tendencia | ya se calcula así en el panel del entrenador (`trainer/page.tsx:156-161`) |

Y en cobros faltan **previsión de cobro del mes** (suscripciones activas ×
precio) y **antigüedad de la deuda** (30/60/90 días), que es lo que convierte
"12 morosos" en una lista de llamadas priorizada.

**Propuesta.** Una fila superior de 4 KPIs de dirección —MRR, churn, altas
netas, ocupación— con delta vs. mes anterior, y bajar la demografía (edad,
sexo, ocupación, hijos) a una pestaña "Perfil de cliente". Hoy comparten peso
visual métricas de gobierno y métricas de curiosidad.

### 2.4 Coste del panel de control

`dashboard/page.tsx:66-106` lanza **19 queries en paralelo** en cada carga, sin
caché ni `revalidate`. Tres son especialmente caras:

- `getOccupancyByCenter` (`dashboard-queries.ts:66-89`): bucle por centro con
  una query dentro (N+1), y trae todas las reservas de 30 días solo para
  contarlas.
- `getMemberRanking` (`:423-436`): carga **todos** los socios con **todos** sus
  pagos y 90 días de reservas en memoria, ordena en JS y luego pagina a 10. Con
  425 socios de demo va; con 5.000 no.
- `getTopServices` (`:384-388`): todos los pagos con suscripción, agregados en
  JS.

**Propuesta.** Agregación en SQL para esas tres (`GROUP BY` como ya se hace en
`getRevenueByMonth` y `getPostalCodeStats`), y `export const revalidate = 300`
en la página: un panel de dirección no necesita ser exacto al segundo.

---

## 3. Páginas: eliminar, fusionar, mantener

### 3.1 Eliminar

**`/portal/chat`** (`portal/chat/page.tsx`) — ruta muerta. Solo hace
`redirect("/portal")` desde que el chat pasó a panel flotante en el layout. Se
puede borrar el `page.tsx` entero. Ojo: `portal/chat/actions.ts` **sí sigue en
uso** (lo llama el chat flotante) y su `revalidatePath("/portal/chat")` de la
línea 18 apunta a una ruta que ya no pinta nada — debe pasar a `/portal`.

**`/brief` (índice)** — `brief/page.tsx`. Lista las sesiones de los próximos 3
días para elegir una. Pero `/trainer` ya pinta el timeline del día **con
navegación de días** (`trainer/page.tsx:227-247`) y cada sesión enlaza al brief
(`:397`); además el spotlight tiene su propio botón "Abrir Session Brief". Para
el entrenador —único rol con la entrada en el menú— es una tercera vía al mismo
sitio. Propuesta: quitar `/brief` del menú, mantener `/brief/[id]` (que es el
producto de verdad) y añadir en `/trainer` un selector de rango de 3 días si se
echa de menos la vista multi-día.

### 3.2 Fusionar

**Reglas de aptitud + Rangos de composición → una sola "Configuración de salud".**
`health/aptitude-rules` (75 líneas) y `health/reference-ranges` (77 líneas) son
dos CRUDs pequeños, ambos exclusivos de OWNER, ambos gateados por
`salud_aptitud`, ambos con la misma estructura (formulario + `DataTable` +
borrar). Ocupan dos de las quince entradas del menú del propietario. Una página
con dos pestañas hace el mismo trabajo y libera una sección entera del menú
("Salud y aptitud" desaparece como sección).

**Retención + Ofertas + estancamiento → una "Bandeja de acciones".**
Hoy son tres sitios distintos para la misma pregunta de dirección: *¿a qué socio
hay que llamar esta semana?* Las alertas de retención (`/retention`), las ofertas
sugeridas por el motor (`/offers`, regla de `offers-queries.ts:26-56`) y las
alertas de estancamiento (`stall-detection.ts`, que hoy **no tiene página** y
solo llega por notificación) son la misma bandeja con distinta causa. Unificarlas
en una lista priorizada por socio, con el motivo como etiqueta y una acción
(contactar / proponer oferta / descartar), es más útil que tres pantallas y
elimina una entrada del menú.

**Valoración de entrenadores: elegir un sitio.** Hoy sale igual en
`/rrhh` (`rrhh/page.tsx:806-829`) y en `/feedback/debriefs-semanales`
(`:188-201`), ambas llamando a `getTrainerRatingSummary`. Duplicar la misma tabla
en dos módulos garantiza que dentro de tres meses una de las dos esté
desactualizada. Recomendación: dejarla en RRHH (es gestión de personas) y en
feedback dejar solo el enlace.

**Portal del socio: de 6 entradas a 4.** Seis pestañas en un menú móvil es
mucho. `/portal/comprar` es una rejilla de planes con un botón — cabe como
sección dentro de `/portal/plan` ("Tu plan → ampliar/renovar"), que es donde el
socio ya está mirando su bono. Y `/portal/evolucion` (fotos y composición) es
material de "Mi actividad". Quedarían: Mi actividad · Reservar · Mi plan · Mi
perfil.

### 3.3 Revisar utilidad (mantener con condiciones)

**`/puesta-en-marcha`** — el checklist se queda en el menú para siempre; la
propia página lo admite (*"Esta página se queda aquí por si añades otro
centro"*, `:596`). Propuesta: ocultar la entrada del menú cuando
`setupProgress().complete` sea true y dejarla accesible desde `/organization`.
Un menú que enseña permanentemente una tarea terminada entrena a ignorarlo.

**`/offers`** — la regla del motor (`offers-queries.ts:26-56`) dispara sobre una
señal única y estrecha: asistencia entre 0,7 y 1,3 sesiones/semana con 8+
semanas de antigüedad, y genera siempre el mismo texto de oferta
(*"ofrecer 2 días/semana con 20% dto."*). Como está, produce poco y siempre lo
mismo. Si se mantiene como página independiente en vez de fusionarla (§3.2),
merece al menos un catálogo de plantillas de oferta y más señales (bono a punto
de agotarse, socio de alta adherencia sin upsell, retorno tras congelación).

### 3.4 Página que falta: consola de plataforma

`PLATFORM_ADMIN` es el soporte de Apta y su menú
(`rbac.ts:130-135`) le da panel de control, anuncios, organización y auditoría
— **todos filtrados por su propio `orgId`**. No existe ninguna vista
multi-organización: ni listado de clientes, ni su `platformStatus`, ni su plan,
ni MRR de Apta, ni churn de gimnasios. Para operar el negocio del Plano 1
(Apta → gimnasios) hoy hay que ir a Stripe y a la base de datos. Es la ausencia
más llamativa del mapa de páginas.

---

## 4. Mejoras de funcionalidad

### 4.1 Panel de control: filtros y comparación

Ningún filtro. Ni centro, ni rango de fechas. Cada tarjeta usa su propia ventana
implícita y distinta —mes en curso, 30 días, 60 días, 90 días (`ADHERENCE_PERIOD_DAYS`),
6 meses, histórico completo— sin decirlo salvo en el `meta` de algunas tarjetas.
Propuesta: un selector global de periodo + centro que se propague a todas las
queries, y que cada tarjeta declare su ventana. Es prerrequisito de §1.3.

### 4.2 Cobros: de registro a gestión

`/billing` hoy registra y lista. Le falta el bucle de trabajo: desde "Socios
morosos" no se puede hacer nada (ni marcar contactado, ni enviar recordatorio,
ni programar reintento), y `listPayments` (`billing-queries.ts:4-11`) trae
`take: 100` fijo sin paginación ni búsqueda por socio, así que en un centro con
volumen la tabla es inservible pasadas dos semanas. Propuesta: paginación +
filtro por socio/fecha, acción "enviar recordatorio" sobre la lista de morosos
(el `mailer` ya existe) y antigüedad de deuda (§2.3).

### 4.3 Retención: cerrar el bucle

Además de generar las alertas (§1.1), a la pantalla le falta el resultado: se
puede cerrar una alerta pero no queda registrado **qué se hizo ni si funcionó**.
Sin eso no se puede responder "¿de las 40 alertas del trimestre, cuántos socios
recuperamos?", que es exactamente la cifra que justifica el precio del módulo.
Propuesta: motivo de cierre (contactado / recuperado / baja inevitable) y un KPI
de efectividad real que sustituya al "ahorro potencial estimado" inventado.

### 4.4 Ficha del socio: 8 pestañas en una página de 588 líneas

`members/[id]/page.tsx` monta Datos, Fotos y evolución, Contratación,
Asistencia, Bitácora, Objetivos, IA & Chat y Salud, cargando **todo** en cada
visita (incluidas fotos en data URL y el hilo de chat completo) aunque el
usuario solo abra la primera. Propuesta: cargar el contenido por pestaña
(la pestaña activa en la URL, `?tab=salud`, que además hace enlazable "abrir la
salud de este socio" desde el brief). Beneficio secundario: la lectura de datos
de salud deja de auditarse en cada apertura de la ficha aunque nadie mire la
pestaña — hoy `getHealthRecordsForMember` se llama siempre (`:88`), lo que
infla el `AuditLog` con accesos que no ocurrieron de verdad y le resta valor
probatorio.

### 4.5 Recepción no tiene página de inicio

`defaultRouteForRole` (`rbac.ts:249-254`) aterriza a recepción en `/leads`, un
tablero kanban de captación. El trabajo real de recepción a las 7 de la mañana
es: quién viene hoy, quién debe dinero, quién entra sin bono. Propuesta: una
vista "Mostrador" con la agenda del día, los cobros pendientes de hoy y el
buscador de socios — o, con menos coste, cambiar el aterrizaje a `/agenda`.

### 4.6 Flujos que dependen de un cron que puede no existir

Ocho reglas de negocio (ofertas, cancelaciones programadas, ciclo de feedback,
check-ins, alertas de leads y de bono bajo) viven en un único endpoint
`/api/jobs/run` que **falla cerrado sin `JOBS_CRON_SECRET`** — correcto — pero
no hay ninguna señal en la app de si el cron está funcionando. Si nadie lo
configura al desplegar, media plataforma deja de funcionar en silencio.
Propuesta: guardar `lastRunAt` por regla y mostrar un aviso en
`/puesta-en-marcha` y en `/organization` cuando lleve más de 48 h sin ejecutarse.

---

## 5. Backlog propuesto

Ordenado por (impacto de negocio ÷ esfuerzo). Los cinco primeros son los que
recomiendo cerrar antes de enseñar la plataforma a un cliente nuevo.

| # | Acción | § | Esfuerzo |
|---|---|---|---|
| 1 | Regla de generación de alertas de retención en `/api/jobs/run` | 1.1 | M |
| 2 | Corregir "Sesiones este mes", "Ahorro potencial" y "Pagos fallidos" | 2.1 | S |
| 3 | Sacar `/audit` del gateo por plan | 1.4 | S |
| 4 | `/rrhh` en el menú de recepción + alinear guardas y menú | 1.5 | S |
| 5 | Decidir y aplicar el gateo de `bi_avanzado` e `ia_programacion` | 1.2 | M |
| 6 | Filtro por centro en dashboard/socios/cobros/retención/feedback | 1.3, 4.1 | M |
| 7 | KPIs de dirección: MRR, churn, altas netas, delta vs. mes anterior | 2.3 | M |
| 8 | Borrar `/portal/chat` y arreglar su `revalidatePath` | 3.1 | XS |
| 9 | Fusionar reglas de aptitud + rangos de composición | 3.2 | S |
| 10 | Agregación SQL en las 3 queries caras + `revalidate` del panel | 2.4 | M |
| 11 | Cobros: paginación, búsqueda, recordatorio y antigüedad de deuda | 4.2 | M |
| 12 | Cierre de alerta con motivo + KPI de efectividad real | 4.3 | M |
| 13 | Bandeja de acciones (retención + ofertas + estancamiento) | 3.2 | L |
| 14 | Ficha del socio por pestañas con carga diferida | 4.4 | M |
| 15 | Portal del socio de 6 a 4 entradas | 3.2 | S |
| 16 | Consola multi-organización para `PLATFORM_ADMIN` | 3.4 | L |
| 17 | Salud del cron visible en puesta en marcha | 4.6 | S |

**Nota sobre el orden.** Los puntos 1 a 5 son todos correcciones de coherencia:
cosas que la app ya promete —en su documentación, en su matriz de permisos o en
su página de precios— y que hoy no cumple. Cuestan poco y son las que más
credibilidad quitan en una demo. Las mejoras de producto de verdad (6, 7, 13,
16) vienen después a propósito.
