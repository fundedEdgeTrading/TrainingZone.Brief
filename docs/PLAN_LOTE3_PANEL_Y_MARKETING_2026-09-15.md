# Lote 3 · Panel, CRM y email marketing

**Fecha:** 15 de septiembre de 2026
**Base medida:** `main` en `13ed2f3`
**Origen:** petición de negocio del 15-09-2026 (comparativa Apta ⟷ Harbiz ⟷ MyWellness)
**Reglas de trabajo:** `docs/TRABAJO_EN_PARALELO.md` — vocabulario, ventanas de
merge, orden de integración y las tres reglas que no se rompen. Si algo no está
aquí, está allí.

Este documento es **lo que hay que lanzar, en qué orden y con qué prompt**. La
parte de arriba se lee una vez y se decide una vez; la de abajo se copia y se
pega.

---

## Lo primero: qué de lo que pides ya está hecho

Antes de abrir una sola sesión, esto es lo que he comprobado contra el árbol.
Cuatro de las diez peticiones de las dos primeras listas **no son desarrollo
nuevo**, y eso cambia el tamaño del lote.

| Petición | Estado real en `main` | Qué queda de verdad |
|---|---|---|
| **1 · LTV en meses** | `getLtvAndTicket` (dashboard-queries.ts:216) calcula **la media de todo lo cobrado por socio, sin acotar periodo**. No es un LTV: es facturación acumulada media. No existe permanencia | Medir permanencia real y reformular el LTV. Ver M1 |
| **2 · Selector de periodo** | Existe, con **cuatro** rangos (`mes`/`30d`/`trim`/`ano`). La comparativa contra el periodo anterior **ya está y ya está bien**: `comparisonWindow` recorta el tramo previo a los mismos días transcurridos | Subir de 4 a 7 rangos y añadir el personalizado. La comparativa no se toca |
| **3 · Cálculos del panel** | Tres sospechosos concretos localizados, ninguno es "el cálculo está mal" a secas. Ver M1 | Diagnóstico contra datos reales **antes** de tocar nada |
| **4 · Tareas repetidas** | Causa encontrada y es triple. Ver M3 | Arreglar el motor, limpiar las 216, poner tope |
| **5 · Mapa de barrios** | El trabajo visual **está hecho**: cuantiles y leyenda (E11-02), geometría real TopoJSON (E11-08), contraste y daltonismo (E11-06) y **la tabla que pides ya existe** (`mapa-barrios/barrio-table.tsx`, E11-04) | El problema no es que se pinte mal: es que **los números son otros**. `getPostalCodeMapData` recibe `range` y `memberStates` y **no los usa** — cuenta socios cancelados y todo el histórico. La petición está escrita desde el 6 de septiembre en `docs/hu/T7-peticion-dashboard-queries.md` y nadie la aplicó |
| **6 · Tipos de persona** | `MemberState` ya distingue ACTIVE / FROZEN / DELINQUENT / CANCELLED, y `Subscription.pauseUntil` ya guarda hasta cuándo | Faltan los **motivos** y la fecha de vuelta prevista, y la lectura agrupada |
| **7 · Ingresos por concepto** | `Payment` no tiene concepto. Sí tiene `subscriptionId`, que es de donde sale | Derivar alta/renovación y medir la baja. Ver M4 |
| **8 · Bonos por centro** | `Subscription.sessionsRemaining` + `sessionsIncluded` + **`SessionLedger` completo** (con motivo `EXPIRY` incluido) | Solo falta agregarlo y pintarlo. Es la petición más barata de la lista |
| **9 · Última visita** | **Ya está en el listado del CRM**: columna «Última visita» (`members/page.tsx:333`), alimentada por `lastAttendanceByMember`. Se esconde por debajo de 1536 px, que probablemente es por qué no la ves | Falta la **frecuencia semanal** y que la columna no desaparezca |
| **10 · Formularios** | Existe casi entero: `Assessment.memberPartAt` es exactamente «lo rellenó el socio», `AssessmentCustomQuestion` permite preguntas propias por centro, `/portal/valoracion/[id]` es el formulario, y los consentimientos están en `/onboarding/[token]` | Falta **poder enviárselo a alguien que todavía no tiene cuenta** y que lo rellene con un enlace con token |

Y lo que **no existe de ninguna forma**: etiquetas, flujos de email, panel por
flujo y referidos. Eso es el lote de verdad.

Una cosa más que conviene saber antes de leer el resto: el motor que hace falta
para los flujos **ya está construido a medias y por otro motivo**. Hay un cron
único con quince reglas temporales (`src/app/api/jobs/run/route.ts`), envío por
Brevo con `List-Unsubscribe` (`src/lib/mailer.ts`), enlace de baja con token
(`/api/email/baja/[token]`), preferencias por tipo de correo y —esto es lo
importante— `canSendMemberEmail("marketing", …)`, que **ya comprueba
`consentMarketing`**. La parte legal del punto «consentimiento de comercial y
enlace de baja» está hecha desde E10. Lo que no existe es la parte declarativa:
hoy cada regla es código.

---

## Antes de pegar nada · cuatro decisiones, ya tomadas

Las dejo escritas porque las sesiones las van a leer y no pueden volver a
abrirlas.

### ☐ 1. La congelación se abre para una sola sesión: S2

`AGENTS.md` congela `prisma/schema.prisma` y `src/lib/rbac.ts`. Etiquetas,
flujos, referidos, motivos de estado y el registro de envíos necesitan tablas
nuevas; las rutas nuevas (`/etiquetas`, `/flujos`, `/referidos`) necesitan
entrada declarada en `FEATURE_BY_ROUTE`, que vive en `rbac.ts`.

**Decisión:** se descongelan **los dos** ficheros **solo para la sesión S2**,
que hace **una migración** y **un commit de `rbac.ts`**, y se vuelven a congelar
en cuanto S2 esté mezclada. Es el mismo mecanismo que S1 en el lote 2. Ninguna
otra sesión los toca: quien crea necesitarlos, para y lo pide.

### ☐ 2. Cuatro tipos de persona, no tres

Pides tres. Van cuatro: **Cliente**, **Congelado** (voluntario: agosto, viaje,
lesión), **Suspendido** (por impago) y **Excliente**.

No es capricho de ingeniería: congelado voluntario e impago se separaron a
propósito en HU-ST-14 porque la lista de morosos incluía a quien estaba de
vacaciones, y volver a juntarlos deshace ese arreglo y rompe el flujo 5 (impago),
que necesita saber quién debe dinero. En la pantalla se pueden ver juntos bajo
un rótulo; por dentro siguen siendo dos.

### ☐ 3. «Baja» en el desglose de ingresos = ingreso perdido

Tres líneas: **alta nueva** (primer cobro de una suscripción), **renovación**
(cobros siguientes de la misma) y **baja**, que es la **cuota mensual que se va
con los socios que causaron baja ese mes, en negativo**. Es lo que contesta si
el mes se sostiene. No se mezcla con lo cobrado: la baja se pinta aparte y
rotulada como lo que es, para que nadie la sume a la caja ni la busque en Stripe.

### ☐ 4. En fase 1 no se miden aperturas

Medir aperturas exige un píxel de traza, y `AGENTS.md` es explícito: cualquier
cosa que no sea estrictamente técnica obliga a montar un CMP con «rechazar todo»
al mismo nivel visual que «aceptar todo» **en el mismo cambio**. Eso es un
módulo propio de varios días que afecta a toda la web.

**Decisión:** el panel por flujo mide **entradas**, **clics** (el enlace es
nuestro, no necesita píxel) y **objetivo cumplido** (volvió a entrenar, renovó,
rellenó el formulario). La rama «si abre» del editor pasa a ser **«si hace
clic»**. «Si responde» y «si no responde en X días» se quedan tal cual.

---

## El mapa en treinta segundos

```
OLA 0          ┌─ S2  Costura del lote 3            1,5 d ─┐  ← sola
día 1          └───────────────────────────────────────────┘
                        ▼ PUERTA · mezclar S2 en main

OLA 1          ┌─ M1  Panel · LTV, periodos, cálculos 4,5 d ─┐
día 2 en       ├─ M2  Mapa, bonos y CRM               3,0 d  │
adelante       ├─ M3  Tareas · limpieza y tope        3,5 d  │  ← estas 6
               ├─ M4  Tipos de persona e ingresos     3,0 d  │     a la vez
               ├─ M5  Formularios al cliente          2,5 d  │
               └─ E1  Etiquetas                       4,0 d ─┘

                        ▼ PUERTA · mezclar E1 en main

OLA 2          ┌─ E2  Motor de flujos                 9,0 d ─┐  ← E2 es
               └─ R1  Referidos                       6,5 d ─┘     el camino
                                                                   crítico
                        ▼ PUERTA · mezclar E2 en main

OLA 3          └─ E3  Los 6 flujos + panel por flujo  4,5 d

CADA DÍA       ▼ 13:00 y 19:00 · mezclar todo en main
```

> ### La cuenta, dicha una vez
> Son **42 días-persona**. El suelo de calendario **no** es la pista más larga:
> es la cadena **S2 → E1 → E2 → E3**, que son **19 días seguidos** y no se
> paralelizan porque cada una necesita la anterior mezclada. Todo lo demás
> (M1-M5, R1) cabe por debajo. Si el lote tiene que terminar antes, lo que se
> recorta es **E3** —los seis flujos se pueden entregar de tres en tres— o **R1**,
> nunca el motor.

**Nunca más de seis sesiones a la vez.** La ola 1 llega justo al tope.

---

## Quién posee qué

La regla de oro sigue siendo la única que importa: **cada pista toca solo sus
ficheros**. Reparto verificado contra el árbol de hoy.

| Pista | Ficheros que posee |
|---|---|
| **S2** | `prisma/schema.prisma` (solo ella) · `src/lib/rbac.ts` (solo ella) · los módulos vacíos que deja puestos |
| **M1** | `src/lib/dashboard-range.ts` · `src/lib/dashboard-queries.ts` (**entero**, mapa incluido) · `src/lib/occupancy.ts` · `src/app/(app)/dashboard/` |
| **M2** | `src/app/(app)/mapa-barrios/` · `src/lib/barrio-*.ts` · `src/lib/bonos-queries.ts` (nuevo) · `src/lib/members-queries.ts` · `src/app/(app)/members/page.tsx` |
| **M3** | `src/lib/notifications.ts` · `src/lib/tasks.ts` · `src/lib/tasks-queries.ts` · `src/app/(app)/tareas/` · `src/lib/trainer-alerts.ts` · `src/lib/stall-detection.ts` · `scripts/limpiar-tareas.ts` (nuevo) |
| **M4** | `src/lib/member-lifecycle.ts` (nuevo) · `src/lib/revenue-mix.ts` (nuevo) · `src/app/(app)/dashboard/revenue-mix-card.tsx` (nuevo, lo monta M1) · `src/app/(app)/members/[id]/actions.ts` |
| **M5** | `src/app/formulario/` (nueva) · `src/lib/member-forms.ts` (nuevo) · `src/lib/assessments/` |
| **E1** | `src/lib/tags.ts`, `src/lib/tags-queries.ts`, `src/lib/tag-engine.ts` (nuevos) · `src/app/(app)/etiquetas/` (nueva) |
| **E2** | `src/lib/flows/` (nueva) · `src/app/(app)/flujos/` (nueva) · `src/lib/emails/flow-templates.ts` (nuevo) |
| **E3** | `src/lib/flows/seeds/` · `src/app/(app)/flujos/[id]/panel/` · `e2e/flujos.spec.ts` |
| **R1** | `src/lib/referrals.ts`, `src/lib/referral-rewards.ts` (nuevos) · `src/app/(app)/referidos/` (nueva) · `src/app/r/[code]/` (nueva) |
| **Cruces** | `dashboard-queries.ts` es de **M1**. Quien lo necesite escribe `docs/hu/<PISTA>-peticion-dashboard-queries.md` y lo pide en la ventana de merge. **Esto ya pasó con T7 y nadie lo aplicó: esta vez el integrador lo comprueba antes de cerrar la ventana** |

**Congelado para todos menos S2:** `prisma/schema.prisma`, `src/lib/rbac.ts`.

---

# OLA 0 · día 1 · una sola sesión

### 🟪 S2 · Costura del lote 3 · Opus

> **Es la puerta.** Aquí se decide el esquema de todo el lote y las rutas nuevas.
> Si sale torcido, chocan seis pistas. Nadie más empieza hasta que esté mezclada.

```
Eres la sesión S2 · Costura del lote 3.

Dejas puestos los cimientos que van a usar las nueve pistas siguientes: UNA
migración de Prisma y UN commit de src/lib/rbac.ts. Nadie más puede empezar
hasta que esto esté en main.

TIENES AUTORIZACIÓN EXPRESA PARA TOCAR prisma/schema.prisma Y src/lib/rbac.ts.
Eres la única sesión del lote que la tiene. Se vuelven a congelar en cuanto
mezcles.

LEE SOLO ESTO:
- docs/PLAN_LOTE3_PANEL_Y_MARKETING_2026-09-15.md (este plan), entero
- prisma/schema.prisma, para conocer el terreno: fíjate en Member, Subscription,
  Payment, Notification, SessionLedger y Lead
- src/lib/rbac.ts, FEATURE_BY_ROUTE y NAV_BY_ROLE
- src/lib/email-preferences.ts, para no reinventar el consentimiento
Tu épica de docs/hu/ es autosuficiente: no necesitas ningún documento más.

TU RAMA:
  git checkout main && git pull origin main && git checkout -b lote3/S2-costura

TU TRABAJO, EN ESTE ORDEN EXACTO:

1. UNA SOLA MIGRACIÓN, un único commit, con TODO el esquema del lote:

   TIPOS DE PERSONA (M4). Son CUATRO y no tres — la decisión está en el plan:
   Cliente, Congelado (voluntario), Suspendido (impago), Excliente. NO toques el
   enum MemberState: los cuatro estados ya existen ahí (ACTIVE, FROZEN,
   DELINQUENT, CANCELLED) y fusionarlos rompería HU-ST-14. Lo que falta:
   - motivo y fecha de vuelta prevista de la congelación
   - motivo de baja (la fecha ya es Member.cancelledAt)
   - catálogos configurables por organización para los dos motivos, con el mismo
     patrón que LeadChannel y NoCloseReason, que ya están en el esquema

   ETIQUETAS (E1). Un socio tiene varias. Dos clases —automática (la pone y la
   quita el sistema) y manual (la pone el equipo)— y esa distinción tiene que
   estar en el dato, no en un convenio de nombres: una etiqueta automática que
   alguien pueda quitar a mano vuelve sola en la siguiente pasada del cron y
   parece un fallo. Guarda también cuándo se puso y quién (null = el sistema).
   Las nueve automáticas de salida están en el plan, en la ficha de E1.

   FLUJOS (E2). Cuatro piezas y nada más: DISPARADOR → CONDICIÓN → ESPERA →
   ACCIÓN. Los catálogos de cada pieza están en la ficha de E2; conviértelos en
   enums donde sean cerrados. Hace falta además:
   - la definición del flujo (activo/borrador/pausado, centro, quién lo creó)
   - la inscripción de un socio en un flujo, con en qué paso va y cuándo le toca
     el siguiente: esto es una COLA, no un "enviar ahora" (ver punto siguiente)
   - el registro de cada envío efectivamente hecho a un socio, con su flujo y su
     marca de tiempo

   LAS CINCO REGLAS DE SEGURIDAD SON ESQUEMA, NO CÓDIGO. Léelas: máximo 1 email
   por socio y semana ENTRE TODOS los flujos; nada entre 22:00 y 8:00; un socio
   no repite el mismo flujo hasta 90 días después; pausa global; modo borrador
   que envía solo a un email de prueba. Las tres primeras solo se pueden cumplir
   si el registro de envíos y la inscripción permiten preguntar "¿le he escrito
   esta semana?" y "¿pasó por este flujo en los últimos 90 días?" con un índice
   detrás, y si lo que se guarda es "cuándo le toca" y no "mándalo ya". Diseña
   para esas dos preguntas y para esa cola. Si tu esquema obliga a recorrer tabla
   entera para contestarlas, está mal.

   REFERIDOS (R1). Código único por socio, quién trajo a quién, el estado del
   referido (invitado → valoración hecha → alta) y la recompensa con su estado
   (pendiente de validar → validada → pagada). LA RECOMPENSA NO TOCA RECIBOS
   NUNCA: genera una tarea a administración, y eso es Notification, que ya
   existe. Configuración por centro: importe fijo o sesiones sueltas, y algo para
   el que entra. "Referido" como canal de lead NO necesita tabla: Lead.channel es
   texto y LeadChannel ya es configurable — lo que falta es de quién viene.

   BONOS Y FORMULARIOS no necesitan esquema nuevo: SessionLedger y
   Assessment/AssessmentCustomQuestion ya cubren M2 y M5. Compruébalo antes de
   añadir nada; si añades algo ahí, explica por escrito por qué no valía lo que
   hay.

   REGLAS QUE NO SE ROMPEN, están en AGENTS.md:
   - Ninguna operación mueve sessionsRemaining sin escribir en SessionLedger.
   - AuditLog sigue siendo de solo inserción: no aflojes el trigger.
   - Ningún Price de Stripe se borra jamás: se archiva.
   - Todo lo que lleve centerId se lee y se escribe pasando por isCenterInScope /
     requireApiCenterScope. Tu esquema tiene que hacer eso POSIBLE: nada de
     tablas nuevas colgando solo de orgId si el dato es de un centro.

2. UN COMMIT DE src/lib/rbac.ts, separado del anterior, con:
   - las tres rutas nuevas en FEATURE_BY_ROUTE (/etiquetas, /flujos, /referidos).
     Decide la funcionalidad de plan que las cubre y ARGUMÉNTALO en comentario:
     mira PlatformFeature en src/lib/platform-plans.ts y elige entre reutilizar
     una existente o proponer una nueva. Si propones una nueva, NO la inventes a
     medias: hay que tocar también platform-plans.ts y eso es de esta sesión.
   - las tres entradas en NAV_BY_ROLE, en la sección "Crecimiento" (captar,
     recuperar y comunicar son el mismo trabajo — lo dice el propio comentario
     del fichero), con sus claves de icono. El mapa clave → SVG vive en
     src/components/nav-icons.tsx y también es tuyo si hace falta.
   - Recuerda que featureForRoute HEREDA por prefijo: /flujos/[id]/panel no
     necesita entrada propia, y una ruta hija nueva sin gate debe fallar en test.

3. DEJA PUESTOS LOS MÓDULOS VACÍOS que las otras pistas van a llenar, con su
   firma y su comentario de cabecera, sin implementación:
   src/lib/tags.ts · src/lib/flows/index.ts · src/lib/referrals.ts ·
   src/lib/member-lifecycle.ts · src/lib/revenue-mix.ts · src/lib/bonos-queries.ts
   Así seis sesiones no se pelean por crear el mismo fichero el mismo día.

4. ESCRIBE docs/hu/E14.md con las historias del lote en el formato de
   docs/hu/E11.md (encabezado, "Cómo leer este documento", "Decisiones de negocio
   cerradas" y una historia por sección con sus escenarios Gherkin). Las cuatro
   decisiones ya cerradas están en el plan y van en la sección de decisiones, no
   se vuelven a discutir.

CÓMO SE COMPRUEBA QUE FUNCIONA:
  npx prisma migrate dev    (la migración aplica limpia)
  npx tsc --noEmit          (0 errores)
  npm run lint              (limpio)
  npm run test:unit         (todo verde; hay tests que leen el esquema —
                             src/lib/schema-costuras.test.ts y
                             costuras-lote2-schema.test.ts— y son los que avisan
                             si has roto una costura)
  npx playwright test e2e/planes-gateo.spec.ts   (el gateo de las rutas nuevas)

NUNCA ejecutes la suite completa de Playwright: muta la base de datos de demo y
contamina a las otras sesiones.

Commits: "lote3 · migración única del lote (etiquetas, flujos, referidos, tipos)"
y "lote3 · rutas y gateo de los tres módulos nuevos".

Cuando termines, dime en cinco líneas: qué tablas has creado, qué funcionalidad
de plan cubre cada ruta nueva, y si algo del inventario de arriba NO lo has
podido resolver sin romper una invariante.
```

---

# OLA 1 · día 2 en adelante · seis sesiones a la vez

Ninguna de las seis se toca con las otras. Ábrelas de golpe cuando S2 esté en
`main`.

---

### 🔴 M1 · Panel: LTV, periodos y cálculos · Opus

> **Modelo: Opus.** Es la pista con más riesgo del lote y no por volumen: aquí se
> cambian números que dirección ya se sabe de memoria. Un cambio de definición
> sin explicar es peor que el número malo.

```
Eres la sesión M1 · Panel de dirección: LTV, periodos y cálculos.

Peticiones 1, 2, 3 y la mitad agregada de la 5 del encargo de negocio del
15-09-2026.

LEE SOLO ESTO:
- docs/PLAN_LOTE3_PANEL_Y_MARKETING_2026-09-15.md, la tabla "qué ya está hecho"
- docs/hu/E14.md, las historias de M1 (las escribió S2)
- docs/hu/T7-peticion-dashboard-queries.md — ENTERO. Es una petición escrita el
  6 de septiembre contra TU fichero que nadie aplicó. Parte de tu trabajo es
  aplicarla.
- src/lib/dashboard-queries.ts, src/lib/dashboard-range.ts, src/lib/occupancy.ts

TU RAMA:
  git checkout main && git pull origin main && git checkout -b lote3/M1-panel

FICHEROS QUE POSEES (solo tú los tocas):
  src/lib/dashboard-range.ts · src/lib/dashboard-queries.ts (entero) ·
  src/lib/occupancy.ts · src/app/(app)/dashboard/

TU TRABAJO, EN ESTE ORDEN:

1. DIAGNÓSTICO ANTES QUE NADA. NO cambies ninguna fórmula hasta terminar este
   punto y escribir sus conclusiones en docs/DIAGNOSTICO_PANEL_2026-09.md.

   Dirección reporta: 279 € de ingresos del mes, 2 % de ocupación y −85 % contra
   agosto, y dice que con esos números el insight del día "dice cosas raras".
   Levanta Postgres con los datos de demo y AVERIGUA CUÁL DE LAS TRES ES, para
   cada cifra: (a) el dato es correcto y el negocio va así, (b) la definición de
   la métrica no es la que dirección cree, (c) hay un fallo.

   Tres sospechosos ya localizados, verifícalos uno por uno y no te quedes en
   ellos:

   - OCUPACIÓN. `consumedSpots` (occupancy.ts) solo cuenta ATTENDED y NO_SHOW.
     Una sesión ya celebrada cuyo roster sigue en BOOKED —porque nadie pasó
     lista— aporta su aforo entero al denominador y CERO al numerador. Con un
     equipo que no marca asistencia a diario, la ocupación tiende a cero y el
     número no significa lo que parece. Comprueba cuántas ocurrencias del mes en
     curso tienen reservas BOOKED sin resolver. Si es lo que creo, el arreglo NO
     es cambiar el numerador y ya: son DOS métricas distintas —plazas vendidas
     y asistencia real— y hoy están confundidas en una. Propón las dos, pinta
     las dos, y deja dicho en la card cuál es cuál.

   - INGRESOS. getRevenueSeries y getKpiTiles cuentan solo status PAID. Con SEPA,
     el primer cobro tarda días en confirmarse y vive en PENDING
     (PENDING_CONFIRMATION en la suscripción). Mira cuánto importe del mes en
     curso está en PENDING. Si es material, el rótulo "Ingresos del mes" está
     mintiendo por omisión: o se incluye y se distingue, o el pie lo dice.

   - LA COMPARATIVA. `comparisonWindow` recorta el tramo anterior a los mismos
     días transcurridos y el pie lo rotula "vs. agosto a esta fecha". ESO ESTÁ
     BIEN Y NO SE TOCA. Verifica con una consulta que el −85 % sale de comparar
     1-15 de septiembre contra 1-15 de agosto, y no contra agosto entero. Si
     sale de ahí, el −85 % es real y el trabajo es de rótulo, no de fórmula.

   - Y EL INSIGHT. getDailyInsight escribe "los ingresos van un X % abajo" en
     cuanto revenue > 0. Con 279 € en el mes y cuatro cobros, cualquier
     porcentaje es ruido con voz de autoridad. Pon un suelo: por debajo de N
     cobros o M euros en la ventana, el insight NO da porcentajes — dice el
     número absoluto o se calla esa frase. Elige N y M y justifícalos.

2. LTV, LAS DOS MITADES. getLtvAndTicket hoy devuelve la media de TODO lo
   cobrado por socio, sobre todo el histórico, sin acotar por opts.range. Eso no
   es un LTV y además es incoherente con el resto del panel, que sí respeta el
   selector.
   - Añade PERMANENCIA MEDIA EN MESES, medida de verdad: de joinedAt a
     cancelledAt para quien se fue. Decide y DOCUMENTA qué haces con los socios
     vivos (censura por la derecha: incluirlos tal cual infravalora la
     permanencia, excluirlos la sobrevalora si el negocio es joven) y qué haces
     con los socios importados, cuyo joinedAt viene de otra plataforma.
   - La referencia de negocio son 25 meses. NO la escribas a fuego en el código:
     es un objetivo de organización, del mismo tipo que OCCUPANCY_TARGET_PCT en
     src/lib/dashboard-targets.ts. Ponla ahí, con su comentario.
   - La card enseña las dos cifras y la relación entre ellas, que es la que
     decide cuánto se puede gastar en captar. Si la permanencia medida se aleja
     mucho de la referencia, eso es el titular, no una nota al pie.

3. SIETE RANGOS Y UNO PERSONALIZADO. DASHBOARD_RANGES pasa de cuatro a: día,
   semana, mes, últimos 3 meses, últimos 6 meses, año y personalizado. El
   personalizado viaja en la URL igual que el resto (?range=custom&desde=…&hasta=…)
   y se valida: rango invertido, futuro o de más de dos años se rechaza sin
   romper la pantalla.
   - comparisonWindow NO SE REESCRIBE: se extiende. Su regla —tramo anterior
     recortado a los mismos días transcurridos— vale para los siete, y para el
     personalizado el tramo previo es el mismo número de días justo antes.
   - sparkBuckets y revenueBuckets necesitan tramo natural para los nuevos:
     en "día" el tramo es la hora, en "semana" el día. Decídelo y que los
     rótulos no mientan.
   - Toda consulta de dashboard-queries.ts ya acepta el mismo DashboardOpts.
     Comprueba UNA POR UNA que ninguna ignora el rango en silencio, que es
     justo el fallo del punto siguiente.

4. APLICA docs/hu/T7-peticion-dashboard-queries.md. Son cuatro puntos, escritos
   para aplicarse mecánicamente, sobre getPostalCodeMapData: hoy recibe
   opts.range y opts.memberStates, y NO USA NINGUNO DE LOS DOS. El mapa cuenta
   socios cancelados y todo el histórico mientras el panel de al lado cuenta el
   trimestre en curso, con rótulos parecidos. Mientras esto no esté, el mapa de
   barrios no se puede arreglar (esa es la pista M2, que depende de ti: avisa en
   cuanto lo tengas mezclado).

5. Dejas sitio para la card de M4: importa y monta
   src/app/(app)/dashboard/revenue-mix-card.tsx (ingresos por concepto) en
   panels.tsx. El componente lo entrega M4; tú pones la línea. Si en la ventana
   de merge M4 aún no lo ha entregado, deja la línea comentada con un TODO que
   nombre la pista.

CÓMO SE COMPRUEBA:
  npm run lint · npx tsc --noEmit · npm run test:unit
  npx playwright test e2e/dashboard-filtros.spec.ts
  Y hay tests unitarios que son tuyos y que van a cambiar de forma:
  dashboard-range.test.ts, dashboard-queries.test.ts, occupancy.test.ts,
  barrio-*.test.ts. Que un test cambie porque la definición cambió está bien;
  que lo borres para que pase, no.

NUNCA ejecutes la suite completa de Playwright.

Empieza por el punto 1 y PARA cuando lo tengas: antes de cambiar una sola
fórmula quiero leer el diagnóstico. Dime qué has encontrado en las tres cifras
y cuál de las tres opciones (dato bueno / definición distinta / fallo) es cada
una.
```

---

### 🟤 M2 · Mapa, bonos y ritmo del socio · Sonnet 5

```
Eres la sesión M2 · Mapa de barrios, bonos por centro y ritmo de visita.

Peticiones 5, 8 y 9 del encargo de negocio del 15-09-2026.

DEPENDES DE M1 para el punto 1: la agregación del mapa es de su fichero. Los
puntos 2 y 3 son independientes — EMPIEZA POR ELLOS y vuelve al mapa cuando M1
avise de que ha aplicado docs/hu/T7-peticion-dashboard-queries.md.

LEE SOLO ESTO:
- docs/PLAN_LOTE3_PANEL_Y_MARKETING_2026-09-15.md, la tabla "qué ya está hecho"
- docs/hu/E14.md, las historias de M2
- src/app/(app)/mapa-barrios/ entero, src/lib/barrio-map.ts
- src/lib/session-balance.ts y el modelo SessionLedger en prisma/schema.prisma
- src/lib/members-queries.ts, funciones listMembers y lastAttendanceByMember

TU RAMA:
  git checkout main && git pull origin main && git checkout -b lote3/M2-mapa-bonos

FICHEROS QUE POSEES (solo tú los tocas):
  src/app/(app)/mapa-barrios/ · src/lib/barrio-*.ts ·
  src/lib/bonos-queries.ts (S2 lo dejó vacío) · src/lib/members-queries.ts ·
  src/app/(app)/members/page.tsx

TU TRABAJO:

1. BONOS POR CENTRO. Negocio lo dice mejor que nadie: "un bono acabándose es el
   momento de venta". Hoy el saldo está en la ficha de cada socio y no está
   sumado en ninguna parte.
   Construye src/lib/bonos-queries.ts con la agregación por centro de: sesiones
   CANJEADAS, sesiones RESTANTES y CADUCIDAD (bonos que caducan en los próximos
   30 días, y los ya caducados sin consumir).
   - Las canjeadas y las devoluciones salen de SessionLedger, que ya lo registra
     todo con su motivo (BOOKING, CANCELLATION, EXPIRY, MANUAL_ADJUSTMENT…). NO
     las deduzcas restando sessionsRemaining de sessionsIncluded: eso vuelve a
     fallar con los bonos ajustados a mano, que es exactamente el fallo que
     SessionLedger vino a arreglar. Lee el comentario de Subscription.sessionsIncluded
     antes de escribir la primera línea.
   - Los bonos ilimitados tienen sessionsRemaining null y también dejan asiento.
     Cuéntalos aparte; no los sumes como ceros.
   - Respeta DashboardOpts (centerId/centerIds/range) como el resto del panel,
     y el ámbito de centro vía center-scope.ts. Sin excepciones.
   - Pinta una pantalla o una card —decide dónde encaja mejor y dilo— con las
     tres cifras por centro y la lista de bonos a punto de acabarse.

2. RITMO DE VISITA EN EL LISTADO. La columna "Última visita" YA EXISTE en
   /members (members/page.tsx:333) pero está oculta por debajo de 1536 px, que
   es probablemente por qué negocio cree que no está. Dos cosas:
   - Que se vea. Decide el punto de corte con criterio (es una de las tres
     columnas que más se miran) y qué columna cede el sitio.
   - Añade FRECUENCIA SEMANAL: sesiones asistidas por semana, sobre una ventana
     que elijas y que esté escrita en el encabezado o en su tooltip. Sin ventana
     declarada, el número no se puede interpretar. Ojo al rendimiento:
     listMembers ya pagina en servidor (E12-10) y lastAttendanceByMember recibe
     la página, no la tabla entera. Sigue ese patrón: nada de N+1 por fila.
   - Tiene que ser ordenable, y ordenar por "menos frecuencia" es la lectura
     útil: quién ha bajado el ritmo sin abrir 49 fichas.

3. EL MAPA (cuando M1 haya mezclado). Lo visual ya está hecho: cuantiles,
   leyenda, geometría TopoJSON, contraste y la vista tabla. NO LO REHAGAS.
   - Comprueba que con la agregación ya arreglada el plano dice lo mismo que el
     panel para el mismo periodo y el mismo estado. Si no coincide, ahí está el
     trabajo.
   - Negocio pide, como alternativa, "una tabla de códigos postales con nº de
     clientes, nº de leads y conversión". Esa tabla ES barrio-table.tsx y ya
     tiene esas tres métricas y tres más. Lo que falta es que se ENCUENTRE:
     hoy es la vía accesible del mapa, no una vista de primera clase. Hazla
     conmutable a la vista principal, con la elección en la URL como el resto
     del estado de la pantalla, y que se pueda exportar.
   - Si después de arreglar los datos sigues viendo que el plano se lee mal,
     dímelo con una captura y una frase, y no lo rediseñes por tu cuenta.

CÓMO SE COMPRUEBA:
  npm run lint · npx tsc --noEmit · npm run test:unit
  npx playwright test e2e/mapa-barrios.spec.ts e2e/members-bonos-calendario.spec.ts
  Tests nuevos: la agregación de bonos contra SessionLedger es aritmética pura y
  se prueba sin base de datos. Escríbelos.

NUNCA ejecutes la suite completa de Playwright.

Cuando termines, dime si la tabla de CP hace innecesario el plano o no, con
argumento. Es una pregunta de negocio abierta y tu respuesta cuenta.
```

---

### 🟠 M3 · Tareas: limpieza, tope y agrupación · Opus

> **Modelo: Opus.** Hay 216 tareas y el arreglo incluye borrar filas de una base
> con datos que a alguien le importan. Eso no se hace a ojo.

```
Eres la sesión M3 · Tareas: limpieza, tope por entrenador y agrupación.

Petición 4 del encargo de negocio del 15-09-2026: "el módulo está bien, el
problema es que hay 216 creadas y muchas repetidas".

LEE SOLO ESTO:
- docs/PLAN_LOTE3_PANEL_Y_MARKETING_2026-09-15.md
- docs/hu/E14.md, las historias de M3
- src/lib/notifications.ts ENTERO (son 100 líneas y ahí está la causa)
- src/lib/tasks.ts, src/lib/tasks-queries.ts
- src/lib/trainer-alerts.ts y src/app/api/jobs/run/route.ts

TU RAMA:
  git checkout main && git pull origin main && git checkout -b lote3/M3-tareas

FICHEROS QUE POSEES (solo tú los tocas):
  src/lib/notifications.ts · src/lib/tasks.ts · src/lib/tasks-queries.ts ·
  src/app/(app)/tareas/ · src/lib/trainer-alerts.ts · src/lib/stall-detection.ts ·
  scripts/limpiar-tareas.ts (nuevo)

LA CAUSA, YA LOCALIZADA. Verifícala antes de arreglar nada, pero no la busques
de cero — son tres fallos distintos y el segundo es el grave:

  (a) ABANICO POR DESTINATARIO. runFewSessionsScheduledRule y
      runLowPackBalanceRule (trainer-alerts.ts) crean UNA TAREA POR CADA
      DIRECTOR. Con dos directores, cada socio genera dos tareas idénticas. Eso
      solo ya multiplica por el número de personas en dirección.

  (b) COLISIÓN DE LA CLAVE DE DEDUPLICACIÓN — ESTE ES EL GRAVE.
      createNotificationOnce deduplica por (orgId, recipientUserId, entityType,
      entityId, resolvedAt: null). Y las DOS reglas de trainer-alerts.ts usan
      entityType "Member" y entityId = member.id. Consecuencia: si un socio ya
      tiene abierta la tarea de "pocas sesiones programadas", la de "le quedan 2
      sesiones del bono" NUNCA SE CREA — se la come el deduplicador en silencio.
      Es decir: además de sobrar tareas, FALTAN las que más venden. Y el flujo 4
      del email marketing (bono acabándose) se va a montar encima de esa misma
      regla, así que esto se arregla ahora o se arregla dos veces.
      Mira cómo lo resolvió no-show-alerts.ts:18 — se inventó un entityType
      propio justo por esto. Ahí está el patrón bueno.

  (c) REGLAS SIN DEDUPLICAR. agenda-queries.ts (líneas 938 y 1231) y
      birthday-jobs.ts llaman a createNotification, no a la versión Once. Mira
      una por una si en su caso es correcto (una felicitación anual no es un
      duplicado) o si es un olvido.

TU TRABAJO, EN ESTE ORDEN:

1. ARREGLA EL MOTOR. Clave de deduplicación que distinga la REGLA, no solo la
   entidad. Y decide qué hacer con el abanico: una tarea de centro que
   cualquiera de dirección pueda coger es mejor que N copias, pero Notification
   tiene recipientUserId obligatorio, así que o eliges destinatario único con
   criterio o justificas por qué siguen siendo N. Lo que no vale es dejarlo como
   está.

2. TOPE DE TAREAS AUTOMÁTICAS POR ENTRENADOR Y SEMANA. Configurable por
   organización, con un valor por defecto que argumentes. Cuando se alcanza, la
   regla NO revienta ni pierde el trabajo en silencio: decide qué pasa —se
   descarta la de menor prioridad, se acumula para la semana siguiente, se
   escribe una sola tarea resumen— y déjalo dicho en la pantalla, porque un tope
   invisible es un fallo que nadie reporta. El tope cuenta SOLO lo automático:
   lo que asigna una persona a otra no se limita nunca.

3. AGRUPACIÓN CON CONTADOR. Varias tareas de la misma regla se ven como UNA
   tarjeta con su contador, desplegable. Resolver la tarjeta agrupada resuelve
   todas; resolver una suelta baja el contador. Cuidado: resolveNotification es
   el ÚNICO camino a "Hecha", compartido con la campana y con el cron, y el
   estado se DERIVA de startedAt/resolvedAt (no hay columna de estado, y es a
   propósito — lee el comentario del modelo). La agrupación es de PRESENTACIÓN:
   no metas una segunda fuente de verdad del estado.

4. LIMPIEZA DE LAS 216. scripts/limpiar-tareas.ts, y es un script, no una
   migración:
   - Modo simulacro POR DEFECTO: dice qué borraría y qué agruparía, y no toca
     nada. Borrar de verdad exige un argumento explícito.
   - Solo toca tareas AUTOMÁTICAS (createdByUserId null). Una tarea que una
     persona encargó a otra no se borra jamás, por vieja que sea.
   - Informe por regla: cuántas hay, cuántas son duplicado exacto, cuántas
     apuntan a un socio que ya no está o a una situación resuelta.
   - Reversible: antes de borrar, vuelca lo que va a borrar a un fichero.

CÓMO SE COMPRUEBA:
  npm run lint · npx tsc --noEmit · npm run test:unit
  npx playwright test e2e/tareas.spec.ts e2e/notifications.spec.ts
  Y escribe el test que hoy falta y que habría cazado (b): con "pocas sesiones"
  abierta, la regla de bono bajo TIENE que poder crear su tarea.

NUNCA ejecutes la suite completa de Playwright.

Cuando termines, dime cuántas de las 216 sobreviven al simulacro y por qué.
```

---

### 🟢 M4 · Tipos de persona e ingresos por concepto · Sonnet 5

```
Eres la sesión M4 · Tipos de persona e ingresos separados por concepto.

Peticiones 6 y 7 del encargo de negocio del 15-09-2026.

LEE SOLO ESTO:
- docs/PLAN_LOTE3_PANEL_Y_MARKETING_2026-09-15.md, decisiones 2 y 3
- docs/hu/E14.md, las historias de M4
- prisma/schema.prisma: MemberState, Member, Subscription, Payment
- src/lib/subscriptions.ts y src/lib/member-billing.ts, para no duplicar lógica

TU RAMA:
  git checkout main && git pull origin main && git checkout -b lote3/M4-tipos

FICHEROS QUE POSEES (solo tú los tocas):
  src/lib/member-lifecycle.ts · src/lib/revenue-mix.ts ·
  src/app/(app)/dashboard/revenue-mix-card.tsx ·
  src/app/(app)/members/[id]/actions.ts

DOS DECISIONES YA TOMADAS, no las reabras:

  · SON CUATRO TIPOS, no tres: Cliente, Congelado (voluntario), Suspendido
    (impago) y Excliente. Negocio pidió tres juntando congelado y suspendido.
    Van separados porque se separaron a propósito en HU-ST-14 —la lista de
    morosos incluía a quien estaba de vacaciones— y juntarlos rompe el flujo de
    impago, que necesita saber quién debe dinero. En la PANTALLA se pueden
    agrupar bajo un rótulo; por dentro son dos.

  · "BAJA" EN EL DESGLOSE ES INGRESO PERDIDO: la cuota mensual que se va con
    quien causó baja ese mes, en negativo, pintada aparte y rotulada como lo
    que es. No es caja, no está en Stripe y nadie la debe sumar a los ingresos.

TU TRABAJO:

1. TIPOS DE PERSONA (src/lib/member-lifecycle.ts). Los cuatro estados ya
   existen en MemberState; S2 añadió los campos que faltaban. Lo tuyo:
   - Al congelar: fecha de vuelta prevista y motivo, contra el catálogo
     configurable que dejó S2. La fecha de vuelta ya tiene sitio natural
     (Subscription.pauseUntil): úsalo, no dupliques la verdad.
   - Al dar de baja: motivo, contra su catálogo. La fecha ya es Member.cancelledAt.
   - Ambos motivos son OBLIGATORIOS, con el mismo patrón que NoCloseReason en
     leads (RB-LEAD-011), que ya lo hace así. Sin motivo no hay reactivación de
     septiembre que valga: ese es el uso real de esto.
   - Filtro y columna en /members, y la agrupación de la pantalla.
   - SOLO UN PUNTO DE ESCRITURA por transición. Hoy el estado se cambia desde
     varios sitios (ficha, cobros, cron de cancelaciones programadas, webhook de
     Stripe). Busca TODOS antes de escribir: una transición que no pase por tu
     módulo es un socio sin motivo, y el problema vuelve en diciembre.

2. INGRESOS POR CONCEPTO (src/lib/revenue-mix.ts). Payment no tiene campo de
   concepto y NO se lo vas a añadir: sí tiene subscriptionId, y de ahí se deriva.
   - ALTA NUEVA: primer cobro de una suscripción.
   - RENOVACIÓN: los siguientes de la misma suscripción.
   - BAJA: la cuota mensual que se pierde con los socios que causaron baja en la
     ventana, en negativo.
   - Los cobros sin subscriptionId (bonos sueltos, drop-in, venta de mostrador)
     son una CUARTA categoría, no un hueco. Míralos: son más de los que parece.
   - Respeta DashboardOpts entero, ámbito de centro incluido, y usa las mismas
     definiciones que dashboard-queries.ts para lo que ya existe (qué cuenta
     como cobrado, cómo se acota la ventana). Si tu total no cuadra con la card
     de ingresos del panel, uno de los dos está mal y hay que decirlo, no
     taparlo con un redondeo.
   - Entrega la card en revenue-mix-card.tsx. M1 la monta en panels.tsx: tú no
     tocas ese fichero. Avisa en la ventana de merge cuando esté lista.

CÓMO SE COMPRUEBA:
  npm run lint · npx tsc --noEmit · npm run test:unit
  npx playwright test e2e/billing-dashboard.spec.ts e2e/import-socios-cuota.spec.ts
  La clasificación alta/renovación/baja es aritmética pura: pruébala sin base de
  datos, con los casos raros dentro (dos suscripciones a la vez del mismo socio,
  socio que se va y vuelve, socio importado sin histórico de cobros).

NUNCA ejecutes la suite completa de Playwright.

Cuando termines, dime qué porcentaje de los ingresos del último trimestre cae en
la cuarta categoría (sin suscripción). Si es alto, la lectura de negocio cambia.
```

---

### 🔵 M5 · Formularios que rellena el cliente · Sonnet 5

```
Eres la sesión M5 · Formularios que rellena el cliente.

Petición 10 del encargo de negocio del 15-09-2026: "formulario de alta con
antecedentes, objetivos y consentimientos, que entre directo a la ficha. Ahora
lo metemos a mano".

EMPIEZA POR AQUÍ: esto NO es un módulo nuevo. Está construido casi entero y por
otro nombre. Antes de diseñar nada, lee y entiende lo que ya hay:
  - Assessment.memberPartAt en prisma/schema.prisma: es literalmente "cuándo el
    socio rellenó SU parte", con su comentario explicando la separación entre lo
    que rellena el socio y lo que añade el entrenador después.
  - AssessmentCustomQuestion y AssessmentQuestionToggle: cada centro ya puede
    añadir sus preguntas y apagar las estándar, sin desplegar.
  - src/app/(app)/portal/valoracion/[id]/initial-assessment-form.tsx: el
    formulario, funcionando.
  - src/app/onboarding/[token]/onboarding-form.tsx: los consentimientos
    (salud, contrato, imágenes, IA) con sus textos legales y su versionado.
  - src/app/lead-form/[orgSlug]/[centerSlug]/: captura pública, dos pasos (E8-15).

LO QUE DE VERDAD FALTA es que ese formulario se pueda MANDAR a alguien que
todavía no tiene cuenta en el portal, y que al volver caiga en la ficha sin que
nadie teclee nada.

LEE ADEMÁS:
- docs/PLAN_LOTE3_PANEL_Y_MARKETING_2026-09-15.md
- docs/hu/E14.md, las historias de M5
- src/lib/invitations.ts: el patrón de token de un solo uso ya existe, no lo
  reinventes
- src/lib/consent.ts y docs/hu/E10.md, historias E10-01, E10-03 y E10-12

TU RAMA:
  git checkout main && git pull origin main && git checkout -b lote3/M5-formularios

FICHEROS QUE POSEES (solo tú los tocas):
  src/app/formulario/ (nueva) · src/lib/member-forms.ts · src/lib/assessments/

TU TRABAJO:

1. ENVÍO. Desde la ficha del socio o del lead, "enviar formulario" genera un
   enlace con token de un solo uso, con caducidad, y lo manda por correo. El
   token NO identifica al socio en la URL más de lo imprescindible ni deja
   datos de salud en un enlace que acaba en el historial del navegador.

2. RELLENO SIN CUENTA. La página pública pide lo que ya pide hoy el formulario
   del portal —antecedentes, objetivos— más los consentimientos. Con tres
   condiciones que NO son negociables y están en E10:
   - El consentimiento de salud es del art. 9.2.a: explícito, separado, y con su
     capa informativa antes del campo (E10-01, E10-03).
   - Si la organización admite menores, hay que poder detectar que quien rellena
     lo es y pedir el tutor (E10-12). Lead.birthDate existe justo para eso.
   - Consentimiento de COMERCIAL aparte, opcional, nunca premarcado, y se guarda
     CUÁNDO se dio y con qué versión del texto. Esto es lo que va a habilitar
     todo el email marketing del lote: si aquí se hace mal, los flujos no se
     pueden encender.

3. ENTRADA AUTOMÁTICA EN LA FICHA. Lo respondido cae donde ya cae hoy:
   Assessment.answers (con las preguntas propias bajo custom[key]),
   memberPartAt marcado, y los consentimientos en sus campos de Member con su
   fecha. Nada de una tabla paralela de respuestas: el cuestionario ya era Json
   justamente para no migrar por pregunta nueva.
   Lo que llega de un formulario NO es un dato verificado: no toca el semáforo
   de aptitud por su cuenta. Deja tarea al entrenador para revisarlo con el
   socio delante, que es como funciona hoy (F3 §4.2).

4. ESTADO VISIBLE. En la ficha se ve si el formulario está enviado, pendiente o
   relleno, y con qué fecha. El flujo 1 del email marketing (E3) necesita
   preguntar "¿lo rellenó?" a los dos días: expón esa pregunta como función de
   member-forms.ts, no como consulta suelta que E3 tenga que reinventar.

CÓMO SE COMPRUEBA:
  npm run lint · npx tsc --noEmit · npm run test:unit
  npx playwright test e2e/valoraciones-config.spec.ts e2e/leads.spec.ts
  Y un spec nuevo del camino entero: enviar → rellenar sin sesión iniciada →
  verlo en la ficha.

NUNCA ejecutes la suite completa de Playwright.

Si al leer lo que ya existe concluyes que el trabajo es MENOR del que describe
este prompt, dímelo y para: prefiero recortar el alcance que construir un
segundo formulario al lado del que ya funciona.
```

---

### 🟣 E1 · Etiquetas · Opus

> **Es la segunda puerta.** Sin etiquetas no hay flujos: la mitad de los
> disparadores y todas las condiciones se apoyan en ellas. E2 no arranca hasta
> que esto esté mezclado.

```
Eres la sesión E1 · Etiquetas de socio.

Bloque A del encargo de email marketing del 15-09-2026. Va antes que los flujos
y es su cimiento: sin esto no hay segmentación que valga.

LEE SOLO ESTO:
- docs/PLAN_LOTE3_PANEL_Y_MARKETING_2026-09-15.md
- docs/hu/E14.md, las historias de E1
- src/app/api/jobs/run/route.ts: el cron único donde va a vivir tu motor
- src/lib/retention.ts y src/lib/trainer-alerts.ts: dos reglas temporales ya
  escritas, para copiar la forma, no el contenido
- src/lib/center-scope.ts

TU RAMA:
  git checkout main && git pull origin main && git checkout -b lote3/E1-etiquetas

FICHEROS QUE POSEES (solo tú los tocas):
  src/lib/tags.ts (S2 lo dejó vacío) · src/lib/tags-queries.ts ·
  src/lib/tag-engine.ts · src/app/(app)/etiquetas/ (nueva)
  Y una línea en src/app/api/jobs/run/route.ts para enganchar tu regla: pídela
  en la ventana de merge si choca con otra pista.

DOS CLASES DE ETIQUETA Y LA DISTINCIÓN ES DE DATO, NO DE NOMBRE:

  AUTOMÁTICAS — las pone y las QUITA el sistema. Nueve de salida:
    Grupo reducido · Entrenamiento personal · Primeros 30 días ·
    Bono por acabarse · 2 semanas sin venir · Impago · Congelado ·
    Excliente · Cumple este mes
  MANUALES — las pone el equipo: Embajador, Lesión activa, y las que cree cada
  centro.

  Un socio tiene VARIAS. Una automática no se puede quitar a mano: volvería sola
  en la siguiente pasada del cron y parecería un fallo. Si el equipo necesita
  contradecir al sistema, eso es una etiqueta manual distinta, no un borrado.

TU TRABAJO:

1. EL MOTOR (tag-engine.ts). Cada etiqueta automática es una regla que se
   evalúa en cada pasada del cron y que PONE Y QUITA. Lo segundo es la mitad que
   se olvida siempre: "2 semanas sin venir" tiene que desaparecer sola cuando el
   socio vuelve, o el flujo de ausencia le escribe a alguien que ya está
   entrenando.
   - SIETE DE LAS NUEVE YA TIENEN SU SEÑAL CALCULADA en algún sitio. No
     reimplementes ninguna: Impago es Member.state DELINQUENT y delinquentSince;
     Congelado es FROZEN; Excliente es CANCELLED; Bono por acabarse es la misma
     condición que runLowPackBalanceRule (sessionsRemaining <= 2, gt 0); Cumple
     este mes es birthDate y ya hay birthday-jobs.ts; Primeros 30 días es
     joinedAt; Grupo reducido / Entrenamiento personal salen del plan contratado
     (mira ServiceKind y service-labels.ts, que ya son fuente única). La única
     que necesita cálculo propio es "2 semanas sin venir", y ahí tienes
     lastAttendanceByMember y computeRetentionSignal de retention.ts: decide si
     reutilizas o si tu ventana es distinta, y si es distinta, DI POR QUÉ.
   - Cada puesta y cada retirada deja traza: cuándo y por qué regla. El panel de
     un flujo va a tener que explicar por qué entró un socio.
   - Idempotente: dos pasadas seguidas no cambian nada ni duplican nada.
   - Ámbito de centro en TODA lectura y TODA escritura, vía isCenterInScope.
     Este es el fallo que más se repite en el repositorio; no lo repitas.

2. LA PANTALLA (/etiquetas). Catálogo: crear, renombrar y desactivar las
   manuales; ver las automáticas con su definición en texto llano y CUÁNTOS
   SOCIOS afecta hoy cada una (mismo patrón que E3-04 en las reglas de aptitud,
   que ya lo hace). Desactivar no borra: una etiqueta borrada se lleva por
   delante el histórico de los flujos que la usaron.

3. EN LA FICHA Y EN EL LISTADO. Las etiquetas del socio se ven en su ficha y se
   pueden filtrar en /members. Las manuales se ponen y se quitan desde ahí, con
   permiso: mira canManageMembers en rbac.ts (que está CONGELADO — si necesitas
   un permiso nuevo, para y pídelo, no lo añadas).

4. LA API PARA E2. E2 va a preguntarte dos cosas en caliente: "¿qué etiquetas
   tiene este socio ahora?" y "¿quién tiene esta etiqueta?". Exponlas en
   tags-queries.ts con esos nombres y con el ámbito de centro ya aplicado. Es tu
   contrato con la pista siguiente: escríbelo en la cabecera del fichero, porque
   E2 no puede empezar sin él.

CÓMO SE COMPRUEBA:
  npm run lint · npx tsc --noEmit · npm run test:unit
  Las nueve reglas son decisiones puras sobre un socio y una fecha: pruébalas
  sin base de datos, y prueba SIEMPRE los dos sentidos (se pone / se quita).
  Un spec de Playwright del catálogo y del filtro en /members.

NUNCA ejecutes la suite completa de Playwright.

Cuando termines, dime cuántos socios de la demo caen hoy en cada una de las
nueve automáticas. Si alguna sale vacía o sale con los 49, la regla está mal.
```

---

# OLA 2 · cuando E1 esté en `main`

---

### ⬛ E2 · Motor de flujos · Opus

> **Modelo: Opus. Es la pista más larga del lote y el camino crítico entero.**
> Nueve días. Aquí no se monta ningún flujo concreto: se monta la máquina. Los
> seis flujos son E3 y van después.

```
Eres la sesión E2 · Motor de flujos de email marketing.

Bloque B del encargo del 15-09-2026. Montas LA MÁQUINA, no los flujos: los seis
de salida son la pista E3 y van después de ti. Si te pones a escribir el copy de
la bienvenida, te has salido de tu pista.

LEE SOLO ESTO:
- docs/PLAN_LOTE3_PANEL_Y_MARKETING_2026-09-15.md, decisión 4 incluida
- docs/hu/E14.md, las historias de E2
- src/lib/tags-queries.ts: el contrato que te dejó E1
- src/lib/mailer.ts, src/lib/emails/templates.ts, src/lib/email-preferences.ts
- src/app/api/jobs/run/route.ts y una regla temporal cualquiera, p.ej.
  src/lib/sepa-prenotification-job.ts, que ya hace envío programado con ventana
- src/lib/timezone.ts

TU RAMA:
  git checkout main && git pull origin main && git checkout -b lote3/E2-flujos

FICHEROS QUE POSEES (solo tú los tocas):
  src/lib/flows/ (nueva) · src/app/(app)/flujos/ (nueva) ·
  src/lib/emails/flow-templates.ts

LA ESTRUCTURA ES FIJA Y EL EDITOR NO DEBE PERMITIR NADA MÁS:

  DISPARADOR → CONDICIÓN → ESPERA → ACCIÓN

  DISPARADOR: alta nueva · primera sesión hecha · X sesiones sin venir ·
              bono baja de N · recibo fallido · cambio de estado ·
              fecha (aniversario, cumpleaños) · formulario respondido ·
              valoración por debajo de N
  CONDICIÓN:  centro · tipo de plan · etiqueta · antigüedad · entrenador
  ESPERA:     X días
  ACCIÓN:     enviar email · enviar formulario · poner o quitar etiqueta ·
              crear tarea a un entrenador con fecha · cambiar estado ·
              avisar al director
  RAMAS:      si hace clic · si responde · si no responde en X días

  OJO A LAS RAMAS: negocio pidió "si abre". No se mide la apertura en fase 1 —
  exige un píxel de traza y con él un CMP entero, y la decisión está tomada en
  el plan. "Si abre" pasa a ser "SI HACE CLIC", que el enlace es nuestro y no
  necesita píxel. Las otras dos ramas se quedan igual.

  CASI TODOS LOS DISPARADORES YA EXISTEN COMO SEÑAL, no los recalcules:
  alta nueva (Member.joinedAt) · X sesiones sin venir (retention.ts +
  lastAttendanceByMember, y E1 ya tiene la etiqueta) · bono baja de N
  (runLowPackBalanceRule) · recibo fallido (stripe-dunning.ts y
  Member.delinquentSince) · cambio de estado (M4 centralizó las transiciones en
  member-lifecycle.ts) · cumpleaños (birthday-jobs.ts) · formulario respondido
  (M5 lo expone en member-forms.ts) · valoración (TrainerRating y Assessment).
  Tu trabajo es CABLEARLOS a un modelo declarativo, no reescribirlos. Si alguno
  no tiene señal utilizable, dilo antes de inventarte una.

LAS CINCO REGLAS DE SEGURIDAD VAN DESDE EL PRIMER COMMIT, NO AL FINAL:

  1. MÁXIMO 1 EMAIL POR SOCIO Y SEMANA, ENTRE TODOS LOS FLUJOS. Es un cerrojo
     GLOBAL, no por flujo, y es la regla que decide la arquitectura entera: si
     cada flujo decide por su cuenta, dos flujos que disparan el mismo día
     mandan dos correos y la promesa se rompe. Un único punto de salida por el
     que pasa TODO envío de flujo, que consulta el registro y se reserva el
     hueco en la misma transacción. Y decide y DOCUMENTA qué cuenta para el
     tope: el correo transaccional que ya existe (recordatorio de sesión,
     preaviso SEPA, cobro fallido) NO debería contar —es ejecución del servicio
     contratado, no comercial— pero esa frase tiene que estar escrita en el
     código, no en tu cabeza.
  2. NADA ENTRE 22:00 Y 8:00. Esto obliga a que el motor sea una COLA, no un
     "enviar ahora": el cron puede pasar a las 23:00 y lo que toque entonces se
     encola para las 8:00, no se manda ni se pierde. Y la hora es la DEL CENTRO:
     timezone.ts existe, y la ventana de cancelación ya se leyó mal una vez por
     esto.
  3. UN SOCIO NO REPITE EL MISMO FLUJO HASTA 90 DÍAS DESPUÉS.
  4. BOTÓN DE PAUSA GLOBAL. Para todo, de todos los flujos, al instante, y se
     ve desde cualquier pantalla del módulo que está pausado. Lo que estaba
     encolado no se pierde: se reanuda.
  5. MODO BORRADOR. Un flujo en borrador se ejecuta de verdad pero TODO envío
     va a un email de prueba configurable. Es la única forma de probar esto sin
     escribir a 49 socios.

  Y una sexta que no está en la lista de negocio porque ya es ley y ya está
  resuelta en el repositorio: TODO envío de flujo pasa por
  canSendMemberEmail("marketing", …), que comprueba consentMarketing y la baja
  global. Si un flujo puede saltársela, el módulo es ilegal. El enlace de baja
  ya lo pone el pie de plantilla y las cabeceras List-Unsubscribe ya las pone
  mailer.ts: úsalos, no montes un segundo sistema de bajas.

TU TRABAJO, EN ESTE ORDEN:

1. EL MOTOR Y LAS SEIS REGLAS DE SEGURIDAD, con sus pruebas, ANTES DEL EDITOR.
   Un motor que respeta las reglas y se configura escribiendo un objeto a mano
   ya es entregable. Un editor bonito encima de un motor que manda dos correos
   el mismo día, no.
2. EL EDITOR. Cuatro piezas y nada más, con las ramas simples. Que NO se pueda
   construir un flujo inválido: eso se valida en el servidor, no solo en el
   formulario.
3. LA PANTALLA DE FLUJOS: lista, estado (borrador/activo/pausado), pausa global.
4. EL ARMAZÓN DEL PANEL POR FLUJO: entran / hacen clic / cumplen el objetivo.
   Los objetivos concretos (volvió a entrenar, renovó, rellenó el formulario)
   los define E3; tú dejas el hueco tipado y documentado.

CÓMO SE COMPRUEBA:
  npm run lint · npx tsc --noEmit · npm run test:unit
  Las seis reglas de seguridad son lógica pura sobre reloj y registro: pruébalas
  SIN base de datos, con el reloj inyectado, y con los casos malos dentro —dos
  flujos disparando el mismo minuto, cron a las 23:00, socio sin
  consentMarketing, pausa global a mitad de cola, reloj en cambio de hora—.
  Un spec de Playwright del editor: que no deje guardar un flujo inválido.

NUNCA ejecutes la suite completa de Playwright.

PARA Y PREGUNTA en dos casos: si una regla de seguridad no se puede cumplir con
el esquema que dejó S2, y si crees que el tope de 1 email/semana debe contar
también el correo transaccional. Lo segundo es decisión de negocio, no tuya.

Cuando termines, dime cuántos correos habría mandado el motor en los últimos 30
días de la demo si los seis flujos hubieran estado encendidos, y cuántos habría
frenado cada regla de seguridad. Ese número es la prueba de que el cerrojo
funciona.
```

---

### 🟡 R1 · Referidos con recompensa · Opus

```
Eres la sesión R1 · Referidos con recompensa.

Bloque de referidos del encargo del 15-09-2026. Vas en paralelo a E2: no
dependes de su motor salvo para UNA cosa, el flujo de los 90 días, que es lo
último de tu lista y que entregas como definición para que la monte E3.

LEE SOLO ESTO:
- docs/PLAN_LOTE3_PANEL_Y_MARKETING_2026-09-15.md
- docs/hu/E14.md, las historias de R1
- src/lib/leads-queries.ts y el modelo Lead: el embudo ya existe entero y NO se
  duplica
- src/lib/notifications.ts: la recompensa genera una tarea, y las tareas ya
  tienen motor
- src/lib/coupon-code.ts: generación de códigos, ya resuelta

TU RAMA:
  git checkout main && git pull origin main && git checkout -b lote3/R1-referidos

FICHEROS QUE POSEES (solo tú los tocas):
  src/lib/referrals.ts (S2 lo dejó vacío) · src/lib/referral-rewards.ts ·
  src/app/(app)/referidos/ (nueva) · src/app/r/[code]/ (nueva)

LA REGLA QUE MANDA SOBRE TODAS LAS DEMÁS, dicha por negocio y coincidente con
una invariante del trimestre: LA RECOMPENSA NO SE APLICA SOLA. Genera una tarea
a administración para validar y marcar como pagada. Tu código NO toca un recibo,
ni un Payment, ni un cupón de Stripe, JAMÁS. Si el sistema toca recibos por su
cuenta, descuadra Stripe, y `AGENTS.md` es explícito sobre lo que se puede y no
se puede hacer con el catálogo de Stripe. Si en algún momento te parece que
sería más elegante aplicar el descuento automáticamente: no lo es, y es la única
línea del encargo que negocio subrayó.

TU TRABAJO:

1. EL ENLACE. Código único por socio, visible en su ficha y preparado para la
   app. Quien entra por ahí cae en LEADS —el embudo que ya existe— con canal
   "Referido" y el campo "referido por" relleno, y SIGUE EL EMBUDO NORMAL. No
   construyas un segundo embudo: Lead.channel es texto libre y LeadChannel ya es
   configurable por dirección sin desplegar (RB-LEAD-004). Lo único que falta es
   de quién viene.

2. LOS ESTADOS: invitado → valoración hecha → alta. Se derivan del estado del
   lead, no se llevan a mano en paralelo: un lead con fecha de valoración ya es
   CON_FECHA_VALORACION, y un lead cerrado ya tiene convertedMemberId. Si
   duplicas el estado, los dos van a discrepar en una semana.

3. LA RECOMPENSA. Se LIBERA en el alta, y liberar significa: crear la tarea a
   administración, no mover dinero. Estados de la recompensa: pendiente de
   validar → validada → pagada, y quién y cuándo en cada salto. Configurable por
   centro: importe fijo a descontar del siguiente recibo, o sesiones sueltas. Y
   algo para el que entra —a doble cara funciona mejor—, que también es una
   tarea, no un automatismo.

4. ANTIFRAUDE. Tres reglas, y la primera es más difícil de lo que parece:
   - Un excliente que se fue hace menos de 6 meses NO cuenta. Ojo: los socios
     IMPORTADOS de MyWellness traen su histórico de otra plataforma
     (Member.externalRef, lastAccessAt, accountCreatedAt) y su cancelledAt puede
     no existir. Decide qué haces cuando no puedes saberlo —y la respuesta
     segura es marcarlo para revisión humana, no dejarlo pasar— y déjalo escrito.
   - Una recompensa por alta. Ni dos por el mismo referido, ni por un referido
     que se da de baja y vuelve.
   - El código caduca si el socio se da de baja. M4 centralizó las transiciones
     de estado en member-lifecycle.ts: engánchate ahí, no pongas otro sitio
     desde el que se cambia el estado.

5. EL PANEL: top embajadores, altas conseguidas, ingresos generados, coste en
   recompensas y coste de captación COMPARADO CON ADS. Lo último necesita el
   coste de los anuncios, que hoy no está en ninguna parte del repositorio.
   PARA Y PREGÚNTAME de dónde sale ese dato antes de inventarte un campo.

6. LA DEFINICIÓN DEL FLUJO DE LOS 90 DÍAS: a los 90 días del alta, si la
   valoración es 8 o más, email pidiendo la recomendación con el enlace. NO lo
   implementes: escríbelo en el formato declarativo de E2 (disparador →
   condición → espera → acción) y déjalo en src/lib/flows/seeds/ para que lo
   monte E3. Comprueba antes de qué modelo sale ese "8 o más" — mira
   TrainerRating y Assessment y di cuál es, porque no son lo mismo.

CÓMO SE COMPRUEBA:
  npm run lint · npx tsc --noEmit · npm run test:unit
  Las tres reglas antifraude son lógica pura: pruébalas con los casos sucios
  dentro (excliente de hace 5 meses y 29 días, socio importado sin cancelledAt,
  referido que se da de alta dos veces).
  Un spec de Playwright del camino entero: enlace → lead con canal Referido →
  conversión → tarea a administración.

NUNCA ejecutes la suite completa de Playwright.

Cuando termines, dime cuántos de los socios actuales podrían ser embajadores hoy
y qué pasa con los importados.
```

---

# OLA 3 · cuando E2 esté en `main`

---

### ⚪ E3 · Los seis flujos y el panel por flujo · Sonnet 5

```
Eres la sesión E3 · Los seis flujos de salida y el panel por flujo.

Montas SOBRE el motor de E2, que ya está en main. No lo modificas: si necesitas
algo que el motor no hace, PARA Y DÍMELO — cambiarlo por tu cuenta rompe las
reglas de seguridad que E2 probó una por una.

LEE SOLO ESTO:
- docs/PLAN_LOTE3_PANEL_Y_MARKETING_2026-09-15.md
- docs/hu/E14.md, las historias de E3
- src/lib/flows/ entero: el motor, sus catálogos y el hueco del panel
- src/lib/emails/templates.ts: el sistema de plantillas, con su pie de baja y su
  remitente por centro (RB-MARCA-001 — el socio no compró Apta, compró su
  gimnasio: los correos se ven como de su centro)
- src/lib/flows/seeds/: R1 dejó ahí la definición del flujo de referidos

TU RAMA:
  git checkout main && git pull origin main && git checkout -b lote3/E3-flujos-salida

FICHEROS QUE POSEES (solo tú los tocas):
  src/lib/flows/seeds/ · src/app/(app)/flujos/[id]/panel/ · e2e/flujos.spec.ts ·
  las plantillas nuevas dentro de src/lib/emails/flow-templates.ts

LOS SEIS FLUJOS, EN ESTE ORDEN DE PRIORIDAD (si hay corte de alcance, se
entregan los tres primeros y se dice cuáles faltan):

  1. BIENVENIDA. Día 0: email + formulario de alta (el de M5 — usa
     member-forms.ts, no montes otro). Día 2 sin rellenar: tarea al entrenador.
     Día 30: email de revisión de objetivos.
  2. RAMA POR PRODUCTO. Etiqueta "Grupo reducido" → horarios y normas de sala.
     Etiqueta "Entrenamiento personal" → otro contenido. Las dos etiquetas ya
     las mantiene el motor de E1.
  3. AUSENCIA. 2 semanas sin sesión pagando: email + tarea al entrenador CON EL
     TELÉFONO del socio. A las 3 semanas, aviso al director.
  4. BONO ACABÁNDOSE. Quedan 2 sesiones: tarea de venta al entrenador + email de
     renovación. OJO: esta regla es la que M3 arregló (hoy la deduplicación se
     come la tarea del bono si el socio ya tiene otra abierta). Si M3 no está
     mezclada cuando llegues aquí, este flujo no se puede probar de verdad:
     dilo, no lo des por bueno.
  5. IMPAGO. Día 1: email con enlace de pago — el enlace YA EXISTE, es el de
     HU-ST-19 "Pagar ahora", en member-billing.ts; no generes otro. Día 3: tarea
     a administración. Día 7: pasa a suspendido, y ese cambio de estado pasa por
     member-lifecycle.ts de M4, no por un update suelto.
  6. REACTIVACIÓN. A los 30 días de baja, email. Y campaña a la etiqueta
     "Excliente" cada septiembre. Este es el que negocio hace a mano hoy y el
     que justifica los motivos de baja de M4: un excliente que se fue por
     mudanza no recibe la misma campaña que uno que se fue por precio. Úsalos.

  Y el séptimo, que te dejó escrito R1: 90 días desde el alta, valoración 8 o
  más, email pidiendo recomendación con el enlace.

  TODOS pasan por las reglas de seguridad del motor sin excepción. Un flujo que
  necesite saltarse el tope semanal está mal diseñado: cámbialo o dímelo.

EL PANEL POR FLUJO: cuántos entran, cuántos hacen clic y cuántos CUMPLEN EL
OBJETIVO. El objetivo es distinto en cada flujo y ahí está el trabajo de verdad:
volvió a entrenar (una reserva ATTENDED después de la fecha del email), renovó
(una suscripción nueva o un bono recargado), rellenó el formulario
(memberPartAt). Defínelos contra datos que YA existen y escribe la definición
en la propia pantalla: un embudo cuyo último paso nadie sabe medir es un embudo
decorativo.

NO SE MIDEN APERTURAS. La decisión está en el plan: exige píxel de traza y con
él un CMP entero. Si alguien te pide la tasa de apertura, la respuesta es el
clic.

LOS TEXTOS. Escríbelos en castellano de centro de entrenamiento, no de agencia.
Cada email lleva su pie de baja (ya lo pone la plantilla) y sale con el nombre
del centro como remitente. Si un texto necesita un dato que el centro no ha
rellenado, NO inventes: deja el hueco visible y avisa.

CÓMO SE COMPRUEBA:
  npm run lint · npx tsc --noEmit · npm run test:unit
  e2e/flujos.spec.ts: al menos los flujos 1, 3 y 5 de punta a punta, en modo
  borrador (que envía al email de prueba), verificando que el tope semanal
  frena el segundo correo cuando dos flujos coinciden.

NUNCA ejecutes la suite completa de Playwright.

Cuando termines, dime cuántos socios de la demo entrarían en cada flujo la
primera semana. Si alguno entra con más de veinte, o el flujo está mal acotado o
hay que escalonar la salida — y eso lo decide negocio, no tú.
```

---

# Lo que se queda como está

Dicho para que ninguna sesión lo toque por iniciativa propia:

- **La IA y la programación de entrenamientos.** Mesociclos, generador y brief.
  Ni se refactoriza ni se "mejora de paso".
- **El calendario por entrenador** y el enfoque Google Calendar.
- **La segmentación** actual, la edad media y el ticket medio. Ojo: el **LTV sí
  cambia** (M1) porque hoy no es un LTV; el ticket medio se queda exactamente
  como está.
- **Los anuncios**, que se quedan porque va a haber app.
- **Push y WhatsApp**: fuera de este lote. Email en fase 1. La API oficial de
  WhatsApp se paga por conversación y esa decisión ya está tomada.

---

## Qué te va a llevar más tiempo del que parece

Seis cosas, por orden de cuánto se subestiman.

**1. La regla de «1 email por socio y semana».** Parece una línea de
configuración y es la decisión que define la arquitectura entera del módulo. Es
un cerrojo **global entre todos los flujos**: si cada flujo decide por su
cuenta, dos flujos que coinciden mandan dos correos y la promesa a negocio se
rompe el primer martes. Obliga a un único punto de salida transaccional, y con
la prohibición de enviar entre 22:00 y 8:00 obliga además a que el motor sea una
**cola** y no un «enviar ahora» — porque el cron puede pasar a las 23:00. Esas
dos frases del encargo son la mitad del coste de E2.

**2. Los cálculos del panel.** El encargo son dos líneas. El trabajo es
diagnosticar tres métricas contra datos reales, decidir con negocio qué
significan y luego cambiarlas. Y ya te adelanto lo que creo que va a salir: la
ocupación al 2 % **no es un fallo de fórmula**, es que solo cuenta plazas de
sesiones donde alguien pasó lista, y hoy no se pasa a diario. Eso no se arregla
en el código: se arregla decidiendo que son **dos métricas distintas** —plazas
vendidas y asistencia real— y enseñando las dos. Es una conversación con el
equipo de sala, no un commit.

**3. El antifraude de referidos.** «Un excliente que se fue hace menos de 6
meses no cuenta» exige un histórico fiable de cada persona. Los socios
importados de MyWellness traen su vida anterior en campos de otra plataforma y
muchos **no tienen fecha de baja**. Sobre ese hueco no se puede automatizar una
decisión que reparte dinero: va a haber que mandar casos a revisión humana y
eso hay que diseñarlo, no parchearlo.

**4. Las etiquetas automáticas que se QUITAN.** Ponerlas es fácil. La mitad que
se olvida siempre es retirarlas: «2 semanas sin venir» tiene que desaparecer
sola en cuanto el socio vuelve, o el flujo de ausencia le escribe a alguien que
estuvo entrenando ayer. Son nueve reglas y son dieciocho comportamientos.

**5. Limpiar las 216 tareas.** Es una operación sobre datos que a alguien le
importan, no un cambio de código. Necesita simulacro, informe por regla, volcado
previo y un criterio explícito de qué no se toca nunca (lo que una persona
encargó a otra). Y hay un hallazgo dentro que no esperabas: **además de sobrar
tareas, faltan**. Las dos reglas de `trainer-alerts.ts` comparten clave de
deduplicación, así que la tarea de «bono acabándose» —la que más vende— no se
crea si el socio ya tiene abierta la de «pocas sesiones programadas».

**6. El mapa.** Lo pides como un arreglo visual y el visual está hecho desde el
lote anterior. Lo que está mal son **los números**: la agregación ignora el
periodo y cuenta socios cancelados, así que el plano y el panel de al lado
cuentan cosas distintas con rótulos parecidos. La petición para arreglarlo está
escrita desde el 6 de septiembre y se quedó sin aplicar porque cruzaba dos
pistas. Esta vez el integrador lo comprueba antes de cerrar la ventana.

Y una que **no** te va a llevar más tiempo del que parece, para compensar: los
**bonos por centro** (petición 8). `SessionLedger` lleva desde el lote anterior
registrando cada movimiento con su motivo, caducidad incluida. Es agregar y
pintar. Es la petición más barata de las diez y probablemente la que antes vas a
ver en pantalla.

---

## Chuleta de un vistazo

| Pista | Qué resuelve | Esf. | Modelo | Depende de |
|---|---|---|---|---|
| **S2** · Costura | esquema + rutas del lote | 1,5 d | Opus | nada · **es la puerta** |
| **M1** · Panel | LTV, 7 periodos, cálculos, agregación del mapa | 4,5 d | Opus | S2 |
| **M2** · Mapa y bonos | vista del mapa, tabla CP, bonos, frecuencia | 3,0 d | Sonnet 5 | S2 · el mapa espera a M1 |
| **M3** · Tareas | limpieza, tope, agrupación, el fallo de dedup | 3,5 d | Opus | S2 |
| **M4** · Tipos e ingresos | 4 tipos con motivo, alta/renovación/baja | 3,0 d | Sonnet 5 | S2 |
| **M5** · Formularios | envío con token y entrada en ficha | 2,5 d | Sonnet 5 | S2 |
| **E1** · Etiquetas | 9 automáticas + manuales | 4,0 d | Opus | S2 · **es la 2ª puerta** |
| **E2** · Motor de flujos | la máquina y las 6 reglas de seguridad | 9,0 d | Opus | E1 |
| **R1** · Referidos | enlace, embudo, recompensa, antifraude | 6,5 d | Opus | S2 · M4 para el estado |
| **E3** · Los 6 flujos | flujos de salida y panel por flujo | 4,5 d | Sonnet 5 | E2 · M3 para el flujo 4 |

**42 días-persona. Camino crítico: S2 → E1 → E2 → E3 = 19 días.**

### Las cuatro reglas que no se rompen

1. **Cada pista toca solo sus ficheros.** Si necesitas uno ajeno, lo pides por
   escrito en `docs/hu/<PISTA>-peticion-<fichero>.md`. Y el integrador
   **comprueba las peticiones abiertas antes de cerrar cada ventana**: la de T7
   lleva nueve días sin aplicar y por eso el mapa sigue roto.
2. **`rbac.ts` y `schema.prisma` están congelados.** Solo S2, y solo mientras
   dura.
3. **Nadie ejecuta la suite completa de Playwright** salvo el integrador, una
   vez al día, a las 19:00.
4. **Ningún envío de correo se salta `canSendMemberEmail`.** No es una
   preferencia de producto: es el art. 21 RGPD y el art. 21 LSSI, y ya está
   resuelto en el repositorio.

### Corte de alcance

```
Corte de alcance. Termina SOLO la historia que tengas a medias, haz commit y para.
No empieces ninguna más.
Dime: qué historias has terminado (con sus IDs), cuál has dejado a medias, y
cuáles no has empezado.
```
