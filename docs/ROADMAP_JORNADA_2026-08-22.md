# Roadmap de jornada — 22 de agosto de 2026

> Plan de trabajo ejecutable fase a fase por sesiones de Claude Code. Nueve fases,
> ~21 h de trabajo, ~14 h de reloj si se paraleliza según §11.
>
> **Antes de la primera línea de código: leer `AGENTS.md`.** Next.js 16 + Prisma 7 +
> Tailwind 4 tienen APIs distintas a las de versiones anteriores. Consultar la guía
> concreta de `node_modules/next/dist/docs/` solo cuando la fase lo indique.

---

## 0. Cómo trabajar este documento

### 0.1 Regla de oro

**Una fase = una unidad de trabajo = un commit.** No se empieza una fase sin haber
cerrado la anterior con su criterio de aceptación en verde. No se adelanta trabajo
de fases posteriores.

### 0.2 Economía de contexto (obligatorio)

`prisma/seed.ts` = 2589 líneas. `prisma/schema.prisma` = 1420. Leerlos enteros es la
principal fuga de contexto de este repo.

1. Leer solo los ficheros listados en «Ficheros» de la fase en curso.
2. `seed.ts` y `schema.prisma` **nunca se leen enteros**: usar `Grep` por símbolo
   exacto, o `Read` con `offset`/`limit`.
3. No releer un fichero recién editado para comprobar el cambio: `Edit` falla si no aplica.
4. Diffs mínimos. No reformatear, no reordenar imports, no renombrar lo que no toca
   la fase, no «aprovechar para arreglar» nada fuera de alcance.
5. No escribir resúmenes de trabajo en el repo. El commit es el registro.
6. Comentarios: solo los que explican un *porqué* no evidente, en la densidad del
   código vecino. El repo comenta decisiones y reglas (`RB-*`), no mecánica.
7. Verificación por fase: `npx tsc --noEmit` y `npm run lint` antes de cada commit.
   Los e2e solo cuando la fase lo pida (arrancan servidor y son caros).

### 0.3 Decisiones ya cerradas — no volver a abrirlas

| Decisión | Valor |
|---|---|
| Roles | Se **añade** `TRAINER_ADMIN`. `RECEPTION` y `HR_MANAGER` se mantienen |
| Limpieza | Se ocultan **Ofertas** y **Fichajes**. No se borran ni código ni tablas |
| Se mantienen | Mapa de calor por CP, app móvil, chat del portal, anuncios |
| Modelo IA | `claude-sonnet-5` genera · `claude-haiku-4-5` refina |
| Mesociclo | Visible **solo para el entrenador**. Nada en portal ni app móvil |
| Sueño | Escala **1-5** en todos los formularios. Se elimina «horas de sueño» |
| Consentimiento | Se reescribe en F3, con versionado y re-consentimiento |
| App móvil | Requisito obligatorio, fase propia. No se recorta |

---

## 1. Estado de partida (verificado en código)

Cosas que el equipo cree que faltan y **ya están**:

- **Cobro recurrente Stripe.** `src/lib/member-billing.ts` usa `mode:"subscription"`
  para planes recurrentes, con `card + sepa_debit`, portal de facturación y los
  cuatro reconciliadores de webhook. Nunca se ha ejecutado contra Stripe real, pero
  está escrito. `docs/MVP_PILOTO_GIMNASIO_ANALISIS.md` está **desfasado** en este punto.
- **Mailer.** `src/lib/mailer.ts` vía API HTTP de Brevo (no SMTP: muchos hosts
  bloquean el puerto). Con `BREVO_API_KEY` vacía simula el envío en el log.
- **Reset de contraseña.** `/recuperar-clave/[token]`.
- **`Member.birthDate`**, `consentImages`, `consentImagesAt`, `postalCode`.
- **Composición corporal (Tanita)** con importación y evolución.

Cosas que **están construidas pero apagadas**:

- **Las ocho reglas de `/api/jobs/run`.** Alertas de lead sin responsable, pocas
  sesiones EP, bono bajo, estancamiento, check-ins periódicos, sugerencias de oferta,
  cancelaciones programadas y ciclo de feedback. En `.github/workflows/` solo existe
  `e2e.yml`: **nadie las ha ejecutado nunca**. Se enciende en F4.

Huecos reales que este roadmap cierra: rol Entrenador Admin, valoraciones
estructuradas, consentimiento válido para IA, mesociclos, cumpleaños, geografía
multi-ciudad y datos demo de un segundo centro.

---

## 2. FASE 1 — Esquema completo y rol Entrenador Admin

**~2 h · sin dependencias · es la fase que desbloquea el paralelismo**

### 2.1 Por qué esta fase es especial

**Esta fase declara TODO el esquema de la jornada en una única migración**, aunque
la lógica de cada modelo llegue en fases posteriores. Sin esto, F3, F4, F5 y F6
tocarían `schema.prisma` y no podrían correr en paralelo: dos migraciones de Prisma
concurrentes producen conflictos de nombre y de orden que cuestan más de arreglar
que el tiempo que ahorra el paralelismo.

**Regla derivada: ninguna fase posterior a F1 modifica `prisma/schema.prisma`.**
Si una fase descubre que necesita un campo nuevo, se para y se añade aquí.

### 2.2 Ficheros

```
prisma/schema.prisma
src/lib/rbac.ts
src/app/(app)/rrhh/*            (alta de personal: nuevo rol asignable)
prisma/seed.ts                  (un usuario demo del rol nuevo)
```

### 2.3 Migración única

**Enum de roles** (`schema.prisma:133`) — añadir `TRAINER_ADMIN`.

**`Center`** — añadir `defaultGroupCapacity Int?`. Hoy la capacidad solo existe en
`SessionTemplate` (`:651`) y `ClassSession` (`:681`); el centro no tiene un valor por
defecto que heredar.

**`Member`** — añadir el consentimiento de IA y su versionado:

```prisma
consentAI        Boolean   @default(false)
consentAIAt      DateTime?
consentVersion   String?   // qué texto firmó; sin esto no sabrás quién aceptó qué
```

**`Assessment`** — valoración inicial y revisiones:

```prisma
model Assessment {
  id             String          @id @default(cuid())
  orgId          String
  memberId       String
  kind           AssessmentKind
  dueDate        DateTime
  completedAt    DateTime?
  answers        Json
  filledByUserId String?
  createdAt      DateTime        @default(now())
  // + relations, @@index([orgId]), @@index([memberId, kind])
}

enum AssessmentKind { INITIAL M1 M3 M6 M9 Y1 }
```

**`PerformanceMetric`** — serie temporal de marcas («simulacro dominadas: 2 reps»,
tiempos de circuito). No es un campo de la valoración: es su propia serie.

```prisma
model PerformanceMetric {
  id         String   @id @default(cuid())
  orgId      String
  memberId   String
  key        String   // "dominadas_reps", "circuito_agilidad_s"
  value      Float
  unit       String
  recordedAt DateTime
  source     String   // "assessment" | "session" | "manual"
}
```

**Mesociclo y su árbol** — traducción directa de la estructura del Notion:

```prisma
model Mesocycle {
  id                String   @id @default(cuid())
  orgId             String
  memberId          String
  createdByUserId   String
  status            MesocycleStatus @default(DRAFT)
  title             String
  objective         String
  safetyCriteria    Json     // heredado del screening de la valoración
  weeklyLayout      Json     // "Lun TZ · Mié TZ · Vie TZ · Mar Gym · Jue Gym"
  milestones        Json     // hoja de ruta: semana → hitos medibles
  aiConversation    Json?    // historial multi-turno del refinado
  approvedAt        DateTime?
  approvedByUserId  String?
  phases            MesocyclePhase[]
}

enum MesocycleStatus { DRAFT APPROVED ARCHIVED }

model MesocyclePhase    { id, mesocycleId, order, name, weekFrom, weekTo, notes, days[] }
model MesocycleDay      { id, phaseId, order, label, venue, focus, warmup Json, blocks[] }
model MesocycleBlock    { id, dayId, order, name, durationMin, exercises[] }
model MesocycleExercise { id, blockId, order, name, sets, reps, load, description, rationale }
```

> `rationale` (el «por qué» de cada ejercicio, con su referencia bibliográfica en el
> Notion) es lo que separa este producto de una plantilla de Excel. No lo omitas.

Ejecutar **una sola** `npx prisma migrate dev --name jornada_20260822`.

### 2.4 Permisos

**Trampa:** `canAdjustSessionBalance()` (`src/lib/rbac.ts:214`) **ya incluye**
`TRAINER`. Si solo añades `TRAINER_ADMIN` sin quitárselo a `TRAINER`, el rol nuevo
no aporta nada.

```ts
// Antes: OWNER | CENTER_DIRECTOR | TRAINER | RECEPTION
// Después: OWNER | CENTER_DIRECTOR | TRAINER_ADMIN | RECEPTION
export function canAdjustSessionBalance(role: Role): boolean { … }

// Nueva
export function canManageCenterCapacity(role: Role): boolean {
  return role === "OWNER" || role === "CENTER_DIRECTOR" || role === "TRAINER_ADMIN";
}
```

Revisar todas las funciones de `rbac.ts` que mencionan `TRAINER` y decidir
explícitamente si `TRAINER_ADMIN` hereda: `canViewHealthData`, `canManageLeads`,
`canManageEpSlots`, `canProposeOffers`, `canViewSessionDebrief`.

### 2.5 Aforo por centro

El Entrenador Admin configura el aforo de **su** centro. Con `CenterMembership` puede
estar imputado a varios: el selector lista solo los suyos. Cambiar
`defaultGroupCapacity` **no altera las sesiones ya creadas** — solo es el valor por
defecto de las nuevas. Decirlo en la interfaz.

### 2.6 Smoke de la app móvil (15 min, dentro de esta fase)

Arrancar `apps/mobile` en el emulador de Android Studio. No para arreglar nada: solo
para saber si compila y si `api/mobile/v1` responde. Si está rota de raíz, F8 no son
2 h 30 y conviene saberlo ahora. Anotar el resultado en el mensaje del commit.

### 2.7 Criterio de aceptación

- Un Entrenador Admin cambia el aforo de su centro y ajusta el bono de un socio.
- Un Entrenador normal no ve ninguna de las dos opciones.
- Cambiar el aforo no altera sesiones existentes.
- `npx prisma migrate status` limpio; `tsc` y `lint` en verde.

---

## 3. FASE 2 — Menú lateral y limpieza

**~1 h 30 · depende de F1 (comparte `rbac.ts`)**

### 3.1 Ficheros

```
src/lib/rbac.ts                     (NAV_BY_ROLE)
src/app/api/jobs/run/route.ts       (desactivar generateOfferSuggestions)
src/app/(app)/rrhh/*                (ocultar fichajes)
```

### 3.2 Se retiran (ocultar, no borrar)

- **Ofertas y sugerencias IA.** Quitar `/offers` del nav de todos los roles y
  desactivar `generateOfferSuggestions` en el cron. Mantener código y tablas: vuelve
  en segunda fase cuando el gimnasio venda paquetes activamente.
- **Fichajes.** Ocultar `TimeClockEntry` de `/rrhh`. Mismo criterio.

Dejar constancia en `docs/` de qué se ocultó y por qué, o en dos meses nadie
recordará si estaba roto o aparcado.

### 3.3 Se mantienen

Mapa de calor por CP (es fuente de decisión de inversión publicitaria, junto con
edad y género), app móvil, chat del portal, anuncios.

### 3.4 Colocación

| Problema | Dónde | Arreglo |
|---|---|---|
| El entrenador tiene RRHH en su menú | `rbac.ts:97` | Fuera: un entrenador no gestiona personal |
| «Salud y aptitud» solo la ve el Owner | `rbac.ts:70-71` | Dársela también al Director de centro: `canViewHealthData` ya lo autoriza |
| Sección «Comercial» del entrenador | `rbac.ts:94-95` | Con Ofertas fuera queda solo Leads: colgarlo de «Mi panel» |
| Owner con 15 entradas | `rbac.ts:62-77` | Baja a 13. Sigue siendo mucho, pero ya es escaneable |
| `TRAINER_ADMIN` sin nav | `rbac.ts` | Copiar el de `TRAINER` + lo que F1 le dio |

### 3.5 Criterio de aceptación

Entrar con los seis roles asignables y que ninguno vea una entrada que no puede usar.
Ningún enlace muerto. El cron no falla por la regla desactivada.

---

## 4. FASE 3 — Valoraciones y consentimiento

**~4 h · depende de F1 · NO toca `schema.prisma` (ya migrado)**

### 4.1 Origen

Transcripción de los dos formularios reales de Notion:
`Valoración inicial` (6 páginas) y `Valoración 1 mes` (3 páginas).

**Cuatro campos del Notion desaparecen:** nombre, DNI y fecha ya los tiene la app, y
«Tipo» lo decide el cron, no la persona. Cuatro campos menos que rellenar cada vez.

### 4.2 Esquemas zod

Sub-esquema compartido — es la serie temporal que se grafica:

```ts
const vitalsSchema = z.object({
  pesoKg:        z.number().positive(),
  dolorActual:   z.number().int().min(0).max(10),
  calidadSueno:  z.number().int().min(1).max(5),
  estres:        z.number().int().min(1).max(5),
  energia:       z.number().int().min(1).max(5),
  diasPorSemana: z.enum(["1", "2", "3", "MAS_DE_3"]),
});
```

> **El sueño se unifica a escala 1-5.** Hoy la inicial pregunta «Horas de sueño»
> (un número de horas) y la revisión «Sueño (1-5)» (una escala): mismo nombre,
> magnitudes distintas, imposibles de graficar juntas. Decisión cerrada: escala.

**Valoración inicial** = `vitalsSchema` +

```ts
perfil:      { edad, sexo: "HOMBRE"|"MUJER"|"OTRO", alturaCm,
               objetivoPrincipal, objetivoSecundario, motivacionReal,
               queLeHariaAbandonar }
experiencia: { nivelActividad: "BAJO"|"MEDIO"|"ALTO", haEntrenadoAntes: boolean,
               anosExperiencia, tecnicaBasicos: "BAJA"|"MEDIA"|"ALTA",
               ejerciciosNoTolera }
screening:   { cardiovascular: boolean, hipertension: boolean, diabetes: boolean,
               medicacion, cirugias, lesionesActuales,
               zonasDolor: array de ["CUELLO","HOMBRO","ESPALDA_ALTA","LUMBAR",
                                     "CADERA","RODILLA","TOBILLO","OTRO"] }
cierre:      { notasEntrenador, consentimientoParq: true (obligatorio),
               autorizacionImagen: boolean (voluntaria, revocable) }
```

**Revisiones (M1/M3/M6/M9/Y1)** = `vitalsSchema` +

```ts
seguimiento: { adherenciaPercibida: 1-5, progresoPercibido: 1-5,
               queHaMejorado, obstaculos, objetivoProximoPeriodo }
cierre:      { notasEntrenador }
```

Los dos consentimientos son **booleanos separados con fecha propia**, nunca uno.
`autorizacionImagen` reutiliza los campos `consentImages` / `consentImagesAt` que ya
existen en `Member` — no crear campos nuevos.

### 4.3 Propagación — el punto crítico de la fase

**Si el screening vive solo dentro de `answers Json`, el Semáforo de Aptitud no se
entera.** Rellenar la valoración inicial de un socio con una lumbalgia no cambiaría
su semáforo ni aparecería en el Session Brief de su entrenador, y esas dos cosas son
el foso del producto.

Al guardar una valoración hay que propagar:

| Del formulario | A dónde | Por qué |
|---|---|---|
| `lesionesActuales`, `cirugias`, `medicacion`, `cardiovascular`, `hipertension`, `diabetes`, `zonasDolor` | `HealthRecord` (vía `src/lib/health-access.ts`) | Alimenta Semáforo de Aptitud y Session Brief |
| `objetivoPrincipal`, `objetivoSecundario`, `objetivoProximoPeriodo` | `ClientGoal` | Ya existe el modelo; no duplicar |
| `pesoKg` | La misma serie que usa composición corporal | O tendrás dos gráficas de peso que se contradicen |
| Marcas de rendimiento | `PerformanceMetric` | Serie temporal propia |

La escritura en `HealthRecord` pasa por `health-access.ts`, que aplica permisos y deja
registro append-only en `AuditLog`.

### 4.4 Consentimiento nuevo

El texto vigente que firman los socios dice literalmente:

> «Mis datos no serán cedidos a terceros.»

Enviar las lesiones de un socio a la API de Claude **es** una comunicación a un
tercero. Que Anthropic actúe como encargado del tratamiento y no como responsable es
la figura jurídica correcta, pero el socio firmó un texto que dice que eso no ocurre.
Ningún DPA arregla eso: hay que reescribir el texto y volver a recogerlo.

**Borrador — requiere validación del asesor legal antes de publicarse:**

> En cumplimiento del RGPD (UE) 2016/679 y la LOPDGDD 3/2018, consiento el
> tratamiento de mis datos personales y de salud por parte de Training Zone Cesar
> Augusto S.L. con la finalidad de diseñar y realizar mi programa de entrenamiento.
>
> Consiento asimismo que, para elaborar propuestas de programación, dichos datos sean
> tratados mediante sistemas de inteligencia artificial operados por proveedores que
> actúan como **encargados del tratamiento** bajo contrato conforme al artículo 28 del
> RGPD. Estos datos se transmiten **seudonimizados**: no incluyen mi nombre, DNI,
> dirección ni datos de contacto. Toda propuesta generada es revisada y aprobada por
> un profesional cualificado antes de aplicarse.
>
> Mis datos no serán cedidos a terceros para finalidades distintas de las descritas.
> Puedo **oponerme al tratamiento con inteligencia artificial** sin que ello afecte a
> mi acceso al servicio, y ejercer mis derechos de acceso, rectificación, supresión,
> oposición y portabilidad en info@trainingzone.es.

Implementación:

- Guardar `consentVersion` en cada registro. Sin eso no sabrás quién firmó qué.
- Flujo de re-consentimiento para socios con el texto antiguo: aviso al entrar, **sin
  bloquear el acceso**.
- La oposición tiene que ser real: un socio que se opone entra por la vía sin datos
  clínicos de F6, no por una casilla decorativa.

### 4.5 Criterio de aceptación

Un entrenador rellena la valoración inicial de un socio real: aparece en su ficha, el
PAR-Q bloquea si no se firma, y la lumbalgia declarada **cambia su semáforo de
aptitud** y sale en el Session Brief.

---

## 5. FASE 4 — Cron y valoración en el aniversario

**~1 h 30 · depende de F1 · puede correr en paralelo con F3**

Con el esquema ya migrado en F1, esta fase escribe contra el modelo `Assessment` sin
esperar a que exista la UI de F3.

### 5.1 Encender el cron

`/api/jobs/run` orquesta ocho reglas ya construidas y **nadie lo llama**. Poner un
cron diario delante (Vercel Cron, o workflow con `schedule:` y
`curl -H "x-cron-secret: …"`). Rellenar `JOBS_CRON_SECRET`: sin él la ruta responde
503 y falla cerrado.

El handler aísla fallos por regla y devuelve `failures[]`. **Mandar ese array a algún
sitio que se mire**, o un fallo por organización es invisible.

### 5.2 Nueva regla `runAssessmentDueRule`

Recorre socios, calcula el aniversario desde el alta y crea el `Assessment` pendiente
con su `dueDate`, según la escalera 1/3/6/9/12 meses.

**El bug del día 31.** Alta el 31 de enero, aniversario en febrero: no existe. Regla
explícita — se usa el último día del mes. **Escribirlo como test antes que como código.**

### 5.3 Email y gating

- Recordatorio vía Brevo (`src/lib/mailer.ts`).
- Con una valoración vencida, el socio ve el formulario al entrar. En `src/proxy.ts`
  o en el layout del portal — **con salida**, o un bug deja al socio encerrado fuera
  de su propia reserva.

### 5.4 Criterio de aceptación

Adelantar la fecha de alta de un socio de prueba, ejecutar el job a mano y ver:
valoración creada, email en una bandeja real, formulario forzado al entrar. Y un socio
dado de alta un 31 recibe la suya en febrero.

---

## 6. FASE 5 — Cumpleaños del socio

**~1 h 30 · depende de F4 (comparte el runner de jobs)**

`Member.birthDate` ya existe: no hace falta modelo nuevo.

### 6.1 Regla de cron

`runBirthdayRule`, diaria, en el mismo runner:

- Selecciona socios **activos** cuyo día y mes de `birthDate` coincidan con hoy.
- **29 de febrero:** en años no bisiestos se felicita el 28. Mismo tipo de trampa que
  el día 31 de F4 — mismo tratamiento: test primero.
- **Idempotencia:** registrar el envío (`BirthdayGreetingLog` o un campo
  `lastBirthdayGreetedYear` en `Member`). Si el cron se ejecuta dos veces, el socio
  no recibe dos correos. *Nota: si esto requiere un campo nuevo, se añade en F1 —
  ninguna fase posterior toca `schema.prisma`.*
- **Zona horaria:** `Center.timezone` (`Europe/Madrid` por defecto). Un cron en UTC a
  las 00:00 felicita el día anterior en verano.
- **Socios de baja no reciben felicitación.** Un «gracias por estar con nosotros» a
  quien se fue hace tres meses es peor que el silencio.

### 6.2 Email

Plantilla en `src/lib/emails/`. Tono del gimnasio, no corporativo. Un solo mensaje, sin
promoción encima: si va con un descuento pegado deja de ser una felicitación y pasa a
ser publicidad, y se nota.

### 6.3 Pantalla de felicitación

Al abrir la app el día de su cumpleaños, una vez y solo una:

- **Web:** en el layout del portal.
- **Móvil:** en F8, contra el mismo endpoint.
- Texto en la línea de *«¡Felicidades, {nombre}! Gracias por estar con nosotros.
  Esperamos felicitarte muchos más.»*
- Se cierra y **no vuelve a aparecer ese día** — persistir el descarte, no dejarlo en
  estado de componente.
- Endpoint compartido `GET /api/portal/greeting` para que web y móvil no dupliquen la
  lógica. La app móvil consume `api/mobile/v1`: exponerlo también ahí.

### 6.4 Criterio de aceptación

Poner el `birthDate` de un socio de prueba a hoy, ejecutar el job: llega el email,
aparece la pantalla al entrar en web, se cierra y no reaparece. Ejecutar el job otra
vez: no llega un segundo email.

---

## 7. FASE 6 — Generador de mesociclos

**~4 h · depende de F1 y F3 · puede correr en paralelo con F4/F5**

### 7.1 Alcance

Mesociclo **editable dentro de la app, visible solo para el entrenador**. Sin vistas
de portal ni de app móvil. El socio no ve su programación en esta entrega.

Los modelos ya están migrados en F1: esta fase construye la generación, el editor y
el refinado conversacional.

### 7.2 La llamada a la API

SDK `@anthropic-ai/sdk`. Referencia completa: invocar la skill `claude-api` antes de
escribir la primera línea.

- **Generar:** `claude-sonnet-5`.
- **Refinar** («cambia la fase 2, no me gusta el broad jump»): `claude-haiku-4-5` en
  multi-turno, guardando el historial en `Mesocycle.aiConversation`.
- **Structured outputs** con `output_config: { format: {…} }` y un JSON Schema espejo
  del árbol `Mesocycle → Phase → Day → Block → Exercise`. Es la decisión que hace la
  diferencia: sin ella recibes un blob de texto que el entrenador no puede editar
  campo a campo.
- `max_tokens` alto y `.stream()` con `.finalMessage()`. Un mesociclo completo son
  miles de tokens de salida; sin streaming se agota el timeout HTTP del SDK.
- **Prompt caching** en la parte estable del sistema (metodología, formato de salida,
  criterios de progresión). Se amortiza desde el segundo mesociclo. Verificar con
  `usage.cache_read_input_tokens` — si sale cero en llamadas repetidas, hay un
  invalidador silencioso en el prefijo.
- `.env.example`: `ANTHROPIC_API_KEY` vacía degrada con error controlado, igual que
  ya hacen Stripe y Brevo.

**Coste medido:** ~$0,18 generar, ~$0,06 refinar. Cien mesociclos al mes ≈ 18 $.

### 7.3 RGPD en la práctica

- **Seudonimizar en el borde.** Salen edad, sexo, métricas, objetivos y criterios
  clínicos. **Nunca** nombre, DNI, teléfono ni email.
- **La llamada pasa por `src/lib/health-access.ts`**, único punto de lectura de datos
  de salud, que deja registro append-only en `AuditLog`. Generar un mesociclo debe
  auditarse igual que abrir un Session Brief.
- Respetar `consentAI`: sin consentimiento, la vía sin datos clínicos (la IA recibe
  objetivos, nivel, edad, sexo y disponibilidad; las contraindicaciones las añade el
  entrenador a mano sobre el borrador).

### 7.4 Regla de producto innegociable

**El mesociclo nace en `DRAFT` y necesita aprobación explícita del entrenador.** Con
socios con doble rotura de cúbito y radio, nada que salga de un modelo llega al
cliente sin que una persona cualificada lo firme. El propio Notion ya trabaja así.

### 7.5 Criterio de aceptación

Reproducir el Mesociclo 1 de Jaime desde su valoración inicial —20 años, oposición
Policía Nacional, doble rotura de cúbito y radio, 0 dominadas, poca movilidad de
tobillo— y comprobar que el plan generado:

- Usa agarre neutro o barra recta en todo lo que cargue muñeca.
- **No** mete tracción vertical en los días de gimnasio de las semanas 1-2.
- Incluye movilidad torácica en todos los calentamientos.

Después pedir un cambio en lenguaje natural y ver que **solo** cambia lo pedido.

---

## 8. FASE 7 — Santander: geografía y datos demo

**~3 h · depende de F1, F3 y F6 (siembra sus modelos)**

### 8.1 El problema que hay que resolver primero

`prisma/seed.ts:225-240` construye `LEAD_POSTAL_CODES` y `MEMBER_POSTAL_CODES` a
partir de `ZARAGOZA_POSTAL_CODES`, y `dashboard-queries.ts` hace el join contra esa
misma tabla. **Un centro en Santander con CP 39xxx no tiene entrada: el mapa saldría
vacío y la ficha del socio diría «Fuera de Zaragoza».**

Dos cambios estructurales, en este orden:

1. **Renombrar y extender la tabla de referencia.** `src/lib/postal-codes-zaragoza.ts`
   → `src/lib/postal-codes.ts`, con las ciudades que haya. El propio comentario del
   fichero ya lo anticipa. Actualizar los importadores:
   `src/app/(app)/members/[id]/member-data-panel.tsx`,
   `src/app/(app)/dashboard/postal-heatmap.tsx`, `postal-map-panel.tsx`, `seed.ts`.
2. **Pool de CP por centro, no global.** Hoy son dos constantes de módulo. Pasan a
   ser un campo de `CenterCfg` en `OrgSeedConfig`, para que cada centro siembre socios
   de su propia ciudad.

Degradación digna: un CP sin entrada en la tabla agrupa por los dos primeros dígitos
(provincia) en vez de decir «Fuera de».

### 8.2 Códigos postales de Santander

Punto de partida a **verificar contra fuente oficial** (Correos / Ayuntamiento de
Santander) antes de dar por buenas las coordenadas, exactamente como pide el
comentario de cabecera del fichero actual:

| CP | Zona |
|---|---|
| 39001 | Centro |
| 39002 | Centro |
| 39003 | Centro / Puertochico |
| 39004 | Cuatro Caminos |
| 39005 | El Sardinero |
| 39006 | General Dávila |
| 39007 | Castilla-Hermida |
| 39008 | Cazoña |
| 39009 | Nueva Montaña |
| 39010 | Barrio Pesquero / Castilla |
| 39011 | Peñacastillo |
| 39012 | Monte / Cueto / San Román |

Ponderar el pool como está hecho para Zaragoza: los barrios más poblados con más peso
y una cola larga hacia la periferia, para que el mapa muestre puntos grandes y
pequeños repartidos.

### 8.3 Datos demo del centro

Añadir `Training Zone Santander` a la configuración de la organización Training Zone
(que pasa de tres centros a cuatro). El seed ya está estructurado con `OrgSeedConfig`
y `CenterCfg`: es configuración, no reescritura.

**Dos usuarios demo por rol** (contraseña `demo1234`, patrón
`{rol}{n}.santander@trainingzone.es`):

| Rol | Usuarios | Alcance |
|---|---|---|
| `CENTER_DIRECTOR` | 2 | Dirección del centro |
| `TRAINER_ADMIN` | 2 | Uno de ellos imputado también a un centro de Zaragoza, para probar multi-centro |
| `TRAINER` | 2 | |
| `RECEPTION` | 2 | |
| `HR_MANAGER` | 2 | Ámbito de organización |
| `MEMBER` | 2 | Perfiles contrastados: ver abajo |

`OWNER` es de organización, no de centro: se reutiliza el existente.

**Los dos socios demo con todo relleno**, y deliberadamente distintos entre sí:

- **Socio A** — historial completo: valoración inicial + revisiones de 1 y 3 meses,
  screening con una lesión activa que **encienda el semáforo en ámbar**, objetivos,
  mediciones Tanita, marcas de `PerformanceMetric` con progresión visible, un
  mesociclo `APPROVED` con sus fases y ejercicios, reservas pasadas con debriefs,
  pagos al día, `consentAI = true`.
- **Socio B** — el caso incómodo: valoración inicial sin revisiones (vencida),
  `consentAI = false` para probar la vía sin datos clínicos, algún impago, y
  asistencia decreciente que **dispare una alerta de retención**.

Un demo donde todo va bien no prueba nada. La mitad del valor de estos datos está en
que el semáforo se ponga en ámbar y salte una alerta.

Poblar además: `~40-60 socios` con CP de Santander ponderados, leads del funnel con
sus canales, sesiones con historial y futuro coherentes con `historyDays` /
`futureDays`, y `birthDate` de al menos un socio **puesto a hoy** para poder probar F5
sin tocar la base de datos a mano.

### 8.4 Criterio de aceptación

- `npm run db:seed` desde cero, sin errores.
- El mapa de calor del dashboard muestra **Zaragoza y Santander**, cada ciudad con sus
  barrios, ninguno «Fuera de».
- Login con los doce usuarios nuevos; cada uno ve lo que le corresponde.
- El Socio A tiene semáforo ámbar y mesociclo aprobado; el Socio B dispara alerta de
  retención.

---

## 9. FASE 8 — App móvil en Android Studio

**~2 h 30 · depende de F4, F5 y F7 · requisito obligatorio, no se recorta**

No solo arrancarla: dejarla funcionando contra el entorno desplegado, con la
valoración periódica y el cumpleaños dentro.

- Emulador de Android Studio contra `apps/mobile` (Expo). Partiendo del smoke de F1,
  ya se sabe con qué se enfrenta uno.
- **Paridad de la API.** `src/app/api/mobile/v1/*` es una capa aparte de la web: todo
  lo de la jornada —rol nuevo, gating de valoración, pantalla de cumpleaños, módulos
  retirados— hay que comprobarlo ahí también. Es donde estas cosas se olvidan.
- El **gating de valoración** debe funcionar en la app, no solo en el portal web. Un
  socio que solo usa el móvil no puede escaparse del formulario.
- La **pantalla de cumpleaños** consume el mismo endpoint que la web.
- Auth por token contra el **entorno desplegado**, no contra `localhost`: es donde
  aparecen los fallos de CORS, de certificado y de URL absoluta.
- Si la app tiene pantalla de ofertas, se esconde también.

**Criterio de aceptación:** un socio de Santander entra desde el emulador contra el
entorno real, se le fuerza la valoración pendiente, la rellena y la ve reflejada en la
web. Ninguna pantalla muerta.

---

## 10. FASE 9 — Cierre

**~1 h · depende de todas**

- `npx tsc --noEmit` y `npm run lint`.
- `npm run test:e2e` — 17 specs. Los de roles y navegación se caerán con F1 y F2: se
  arreglan aquí. Un e2e rojo mañana es un e2e que nadie vuelve a mirar.
- Barrido de honestidad: que nada en la interfaz prometa una automatización que no
  existe.
- Nota de dos líneas al principio de `docs/MVP_PILOTO_GIMNASIO_ANALISIS.md`: su
  bloqueante P0 nº1 ya está construido, no volver a planificar sobre él.
- Documentar qué se ocultó en F2 (Ofertas, Fichajes) y por qué.

---

## 11. Plan de ejecución en sesiones paralelas

### 11.1 Por qué no todo es paralelizable

Tres ficheros son puntos de contención: `prisma/schema.prisma`, `src/lib/rbac.ts` y
`prisma/seed.ts`. Y las migraciones de Prisma concurrentes producen conflictos de
nombre y de orden que cuestan más que el tiempo ahorrado.

**F1 resuelve esto declarando todo el esquema de golpe.** A partir de ahí, ninguna
fase toca `schema.prisma` y el paralelismo es seguro.

### 11.2 Tres olas

```
OLA 1  (1 sesión, secuencial)        F1 → F2                      ~3 h 30
   │   Toca schema.prisma y rbac.ts. Una migración. PR y merge.
   ▼
OLA 2  (3 sesiones en paralelo)      F3 │ F4→F5 │ F6              ~5 h 30 de reloj
   │   Ninguna toca schema.prisma. Tres ramas, tres PR.
   ▼
OLA 3  (1 sesión, secuencial)        F7 → F8 → F9                 ~6 h 30
       F7 necesita los modelos de F3 y F6 para sembrarlos.
```

**~21 h de trabajo → ~15 h 30 de reloj.**

### 11.3 Reparto de la ola 2 y sus roces

| Sesión | Fases | Ficheros propios | Roce |
|---|---|---|---|
| 2A | F3 | `src/lib/assessments/*`, `members/[id]/valoraciones/*` | Pestañas de la ficha del socio |
| 2B | F4 → F5 | `api/jobs/run/route.ts`, `src/lib/*-jobs.ts`, `lib/emails/*`, layout del portal | Ninguno con 2A/2C |
| 2C | F6 | `src/lib/ai/*`, `members/[id]/mesociclos/*` | Pestañas de la ficha del socio |

**Único conflicto previsible:** 2A y 2C añaden cada una una pestaña al mismo
componente de pestañas de la ficha del socio. Es un conflicto de dos líneas. Para
evitarlo del todo, añade **ambas pestañas** en F1 (apuntando a rutas que todavía
devuelven un placeholder) y que cada sesión solo rellene la suya.

### 11.4 Prompt de arranque para cada sesión

Todas las sesiones parten de la misma cabecera. Sustituir `{FASE}` y `{BASE}`:

```
Lee docs/ROADMAP_JORNADA_2026-08-22.md y ejecuta la {FASE} completa.

Reglas:
- Lee AGENTS.md antes de escribir código. Next.js 16 + Prisma 7 + Tailwind 4
  tienen APIs distintas a las de tu entrenamiento.
- Respeta §0.2 (economía de contexto): no leas seed.ts ni schema.prisma enteros.
- No toques prisma/schema.prisma: el esquema completo se migró en F1.
- Ámbito estricto: solo lo que dice la fase. No arregles nada fuera de alcance.
- Antes del commit: npx tsc --noEmit y npm run lint en verde.
- Cuando termines: commit, push a la rama, y abre PR contra {BASE}.

Rama: claude/jornada-{fase}-{slug}
```

Concretos, uno por sesión:

| Sesión | Prompt | Rama |
|---|---|---|
| **1** | `…ejecuta la FASE 1 y después la FASE 2` | `claude/jornada-f1-f2-esquema-menu` |
| **2A** | `…ejecuta la FASE 3` | `claude/jornada-f3-valoraciones` |
| **2B** | `…ejecuta la FASE 4 y después la FASE 5` | `claude/jornada-f4-f5-cron-cumple` |
| **2C** | `…ejecuta la FASE 6` | `claude/jornada-f6-mesociclos` |
| **3** | `…ejecuta la FASE 7, después la 8 y después la 9` | `claude/jornada-f7-f9-santander-movil` |

Para la sesión 6 (F6) añadir una línea al prompt:

```
Invoca la skill claude-api antes de escribir la integración con la API.
No escribas la llamada de memoria: los model IDs y los parámetros han cambiado.
```

Para la sesión 2C y la 3, añadir:

```
La rama base ya incluye la migración de F1. Si crees que necesitas un campo
nuevo en schema.prisma, PARA y dilo en vez de migrar por tu cuenta.
```

### 11.5 Secuencia de operación

1. **Lanza la sesión 1.** Espera a que abra PR. Revísalo y mergéalo.
2. **Lanza 2A, 2B y 2C a la vez**, las tres desde la base ya con F1+F2 dentro.
   Que las tres partan del mismo commit es lo que hace que los merges sean limpios.
3. Según vayan abriendo PR, mergea en el orden en que lleguen. Si el segundo o el
   tercero da conflicto de pestañas, es de dos líneas.
4. **Lanza la sesión 3** cuando las tres de la ola 2 estén mergeadas. No antes: F7
   siembra los modelos de F3 y F6, y con uno solo a medias el seed queda inconsistente.
5. F9 cierra con los e2e sobre todo el conjunto.

### 11.6 Antes de empezar

- **Rama base: `release`.** Confirmado por el PR #123 de este mismo documento, abierto
  contra `release`. Ese es el valor de `{BASE}` en los cinco prompts. (`origin/HEAD`
  apunta a `main`, pero el flujo real del repo va por `release`.)
- **Entorno.** F4, F5 y F8 necesitan cosas encendidas de verdad: `BREVO_API_KEY` con
  remitente verificado, `JOBS_CRON_SECRET`, y un despliegue accesible desde el
  emulador. Sin eso, esas fases se validan a medias.

### 11.7 La carrera del login en los e2e — RESUELTA (PR #124)

`e2e/billing-dashboard.spec.ts` caía de forma inestable en CI:
`strict mode violation: getByText('LTV medio por cliente') resolved to 2 elements`.
Tres ejecuciones seguidas en rojo, con el conjunto de tests fallidos variando entre
ellas sobre contenido idéntico.

**Causa, medida instrumentando `loginAs`:**

```
URL tras login:            http://localhost:3000/dashboard
nodos LTV antes del goto:  0
nodos LTV tras el goto:    1
```

1. `loginAs` devolvía el control demasiado pronto: `waitForURL` se cumple cuando el
   App Router cambia la URL, pero el destino aún no está pintado — de ahí los cero nodos.
2. El test navegaba a la ruta en la que ya estaba (dirección aterriza en `/dashboard`
   al iniciar sesión), lanzando una segunda navegación sobre la primera en vuelo.

En el runner de CI los dos árboles convivían en el DOM lo suficiente para que el
locator encontrase dos coincidencias. Era el único fichero del suite que navegaba a la
ruta donde el login ya había aterrizado; el resto va a rutas distintas, donde `goto`
espera correctamente.

**Arreglo (mergeado):** `loginAs` espera además a que el `main` del destino sea
visible — ataca la causa común, no solo este test —, y fuera el `goto` redundante.
CI en verde. **No hay nada que hacer aquí en F9.**

### 11.8 Los 9 rojos en local eran del entorno, no de la suite — RESUELTO

Una versión anterior de esta sección decía que 9 tests fallaban en local por depender
del estado que dejan los anteriores. **Era un diagnóstico equivocado y se corrige aquí**
para que nadie salga a perseguirlo.

El error real no era el `findFirstOrThrow` que se veía en la traza, sino la línea de
Prisma inmediatamente debajo:

```
User was denied access on the database `(not available)`
```

Los specs que preparan datos (`e2e/fixtures/booking-members.ts`) abren su propia
conexión con Prisma **desde el proceso de Playwright**, no desde el servidor Next. Ese
proceso no carga `.env`: en CI da igual, porque `DATABASE_URL` llega como variable del
job (`.github/workflows/e2e.yml`), pero en local vive en `.env` y solo la lee Next. Sin
ella, `PrismaPg` se construye con `connectionString: undefined` y libpq cae a sus
credenciales por defecto, que Postgres rechaza. El `findFirstOrThrow` era simplemente la
primera línea que tocaba la base, no la causa.

Arreglo: `import "dotenv/config"` en `playwright.config.ts`, la misma convención que ya
usaba `prisma/seed.ts`. `dotenv` no pisa variables ya definidas, así que en CI el job
sigue mandando.

Comprobado en local sin exportar nada a mano: **43 pasan, 16 se saltan, 0 fallan.**

Conclusión para las sesiones siguientes: **la suite no arrastra estado y es fiable.** Un
rojo en e2e es un rojo de verdad — trátalo como tal.

---

## 12. Fuera de alcance de esta jornada

| Pendiente | Estado | Nota |
|---|---|---|
| Ciclo Stripe completo en test (test clock, SEPA, idempotencia) | Código listo, nunca ejecutado | Media jornada, obligatoria antes de cobrar un euro real |
| Migración de socios que ya cobran | Importador CSV existe, sin datos de pago | Verificar si el mandato SEPA es transferible antes de prometer fecha |
| Auto check-in por QR | Check-in manual desde la ficha de sesión | La asistencia alimenta retención y semáforo |
| Dunning visible | Reconciliador sí, proceso humano no | Con el bloque de Stripe |
| DPA con Anthropic | Por confirmar | No bloquea construir F6. Bloquea apuntarlo a un socio real |
| Baremos de oposición | No existe | Objetivos con baremo externo: nicho, segunda fase |
| Mesociclo visible para el socio | Fuera por decisión | Solo entrenador en esta entrega |
