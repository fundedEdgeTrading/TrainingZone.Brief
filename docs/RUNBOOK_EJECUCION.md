# Runbook de ejecución · paso a paso

**Para quien no quiere pensar, solo ejecutar.** Cada paso dice qué abrir, qué copiar y qué esperar.
Todo lo que se menciona aquí ya está en `main` (PR #201).

---

## Lo que vas a hacer, en 30 segundos

```
DÍA 1 mañana   ┌─ Sesión A (esquema y guardas) ─┐
               └─ Sesión B (cliente y pruebas) ─┘   ← estas 2 a la vez

DÍA 1 tarde    ▼ MEZCLAR LAS DOS EN main          ← puerta obligatoria

DÍA 2 en adelante
               ├─ T1  Aislamiento          ┐
               ├─ T2  Reservas y bonos     │
               ├─ T3  Stripe               │
               ├─ T4  Salud                │  ← estas 9 a la vez
               ├─ T5  Portal del socio     │
               ├─ T6  App nativa           │
               ├─ T7  SEO y mapa           │
               ├─ T8  Cumplimiento         │
               └─ T9  Producto e higiene   ┘

DÍA 4 en adelante
               └─ T10 Pruebas              ← arranca tarde, a propósito

CADA DÍA       ▼ 13:00 y 19:00 · mezclar todo en main
```

**Nueve sesiones a la vez, más una que entra el jueves.** Ni una más: por encima de diez, el tiempo que pierdes mezclando supera lo que ganas paralelizando.

> ### La cuenta, dicha una vez y no la repito
> El documento son **316 días-persona**. Este plan es lo que más trabajo mete en la semana, no una forma de que quepan los 316. Lo realista es **Lote 1 completo más buena parte del Lote 2**. Si el domingo tiene que estar todo, el recorte lo decides tú, no el calendario.

---

## Vocabulario mínimo (cinco palabras)

| Palabra | Qué es |
|---|---|
| **Sesión** | Una conversación de Claude Code trabajando. Nueve sesiones = nueve pestañas abiertas a la vez |
| **Rama** | Una copia del código donde una sesión trabaja sin molestar a las demás |
| **Pista** | El paquete de trabajo de una sesión: sus historias y sus ficheros |
| **Costura** | El trabajo del día 1 que deja puestos los cimientos. Nadie más empieza hasta que está |
| **Ventana de merge** | Los dos momentos del día en que se junta el trabajo de todos |

**Regla de oro, la única que importa:** cada pista toca **solo sus ficheros**. Si dos sesiones editan el mismo fichero, se pisan y pierdes una hora resolviéndolo.

---

## Antes de empezar · 10 minutos, una sola vez

### ☐ 1. Comprueba que `main` tiene todo

Abre una terminal y pega esto:

```bash
git checkout main && git pull origin main
ls docs/hu/ && ls docs/legal/
```

Tienes que ver 14 ficheros en `docs/hu/` y 12 en `docs/legal/`. Si los ves, estás listo.

### ☐ 2. Decide quién integra

**Una sola persona mezcla.** Con nueve ramas vivas, integrar es un puesto de trabajo. Si mezcláis varios a la vez, os pisáis.

### ☐ 3. Manda el expediente al despacho — hoy

Esto no lo hace Claude. Abre `docs/legal/00-CUESTIONARIO-DIRECCION.md`, contesta lo que puedas, y manda la carpeta entera al despacho. **Son 2-4 semanas y no aceleran con más sesiones.** Si esto no sale hoy, el resto de la semana da igual.

---

# PASO 1 · Día 1 por la mañana

## Abre DOS sesiones y lanza estos dos prompts, uno en cada una

Las dos van a la vez porque no se tocan.

### 🔵 Sesión A · Costuras del servidor

> **Modelo: Opus.** Aquí se decide el esquema de toda la semana; no es sitio para ahorrar.

```
Eres la sesión S0-A · Costuras del servidor.

Antes de que arranquen las nueve pistas del plan, dejas puestos los cimientos
que todas van a usar. Nadie más puede empezar hasta que esto esté mezclado.

LEE SOLO ESTO:
- docs/PLAN_PARALELIZACION_2026-09-06.md, secciones 3 y 4
- docs/hu/E4.md (solo E4-29 y E4-30), docs/hu/E6.md, docs/hu/E10.md (solo E10-14),
  docs/hu/E12.md (solo E12-04 y E12-11)

NO abras docs/HISTORIAS_USUARIO_2026-09-06.md: son 236 KB y no lo necesitas.

TU RAMA:
  git checkout main && git pull origin main && git checkout -b costuras/servidor

TU TRABAJO, EN ESTE ORDEN EXACTO:

1. UNA SOLA MIGRACIÓN de Prisma con TODO el cambio de esquema del trimestre.
   Un único commit. Incluye:
   - SessionLedger (para E2-15)
   - enum cerrado de zonas de lesión + lateralidad como campo aparte (E3-02)
   - Mesocycle.startDate y MesocyclePhase.deload (E3-12)
   - Center: phone, city, postalCode, neighborhood, description, openingHours,
     publicPage (E9-05)
   - StripeWebhookEvent (HU-ST-05)
   - estado PAUSED distinto de FROZEN (HU-ST-14)
   - campos de edad y consentimiento de tutor (E10-12)
   - tabla de plazos de retención (E10-08)
   - REVOKE UPDATE, DELETE ON "AuditLog" para el rol de aplicación (E10-14)

2. HELPERS COMPARTIDOS, funcionando pero mínimos, para que las nueve pistas
   los consuman en vez de inventarse cada una el suyo:
   - requireApiCenterScope(claims, centerId)
   - requireApiFeature(claims, feature) + un FEATURE_BY_ROUTE para la API móvil
   - assertBookingTransition(from, to)

3. E12-04 · SERVICE_LABEL en un solo sitio (hoy está definido 8 veces con 4 nombres)
4. E4-30 · createSubscriptionFromPlan (hoy hay 5 copias, una regala sesiones ilimitadas)
5. E4-29 · saveMembershipPlan compartido web/móvil
6. E6-02 · las rutas hijas de módulos premium heredan el gate de su padre
7. E6-03 · ia_programacion declarado en FEATURE_BY_ROUTE
8. E6-07 · /audit sale del muro de pago; la exportación se queda dentro
9. E12-11 · /trainer accesible para dirección

POR CADA PASO: implementa los escenarios Gherkin tal como están escritos, escribe
el test del escenario principal, ejecuta
  npm run lint && npx tsc --noEmit && npm run test:unit
y haz un commit con el ID en el asunto. Sigue al siguiente sin preguntarme.

NUNCA ejecutes la suite completa de Playwright: muta la base de datos de demo.

Cuando termines, dime en una línea qué has dejado listo.
```

### 🟢 Sesión B · Costuras de cliente

> **Modelo: Sonnet 5.** Es trabajo mecánico con los criterios ya escritos.

```
Eres la sesión S0-B · Costuras de cliente.

Vas en paralelo con S0-A y NO tocáis los mismos ficheros. No esperes a esa sesión.

LEE SOLO ESTO:
- docs/hu/E8.md (solo E8-01 y E8-02)
- docs/hu/E9.md (solo E9-03)
- docs/hu/E7.md (solo E7-01 y E7-02)

TU RAMA:
  git checkout main && git pull origin main && git checkout -b costuras/cliente

TUS HISTORIAS, EN ESTE ORDEN:
  1. E8-02 · Field con htmlFor, aria-invalid y aria-describedby
             (un fichero arregla 221 sitios)
  2. E8-01 · error.tsx en (app)/ y en dashboard, members/[id], agenda y billing
  3. E9-03 · src/lib/site.ts con BRAND y publicOrigin()
  4. E7-01 · infraestructura de pruebas de la app móvil
  5. E7-02 · job de CI propio para la app móvil

AVISO en E8-02: tocas selectores que usan e2e/leads.spec.ts, alta-socio-bonos.spec.ts,
plantilla-crud.spec.ts y members-bonos-calendario.spec.ts. Revísalos en el mismo cambio.

AVISO en E7-01: no fijes versiones a mano. Usa
  npx expo install --dev jest-expo jest @testing-library/react-native
para que la pareja de versiones sea la correcta con Expo 57.

POR CADA HISTORIA: implementa los escenarios Gherkin, escribe el test del principal,
ejecuta npm run lint && npx tsc --noEmit && npm run test:unit, y haz un commit con
el ID en el asunto. Sigue a la siguiente sin preguntarme.

NUNCA ejecutes la suite completa de Playwright.

Cuando termines, dime en una línea qué has dejado listo.
```

---

# PASO 2 · Día 1 por la tarde · la puerta

**Cuando las dos sesiones digan que han terminado**, la persona integradora hace esto:

```bash
# 1. Traer la primera
git checkout main && git pull origin main
git merge costuras/servidor
npm run lint && npx tsc --noEmit && npm run test:unit

# 2. Traer la segunda
git merge costuras/cliente
npm run lint && npx tsc --noEmit && npm run test:unit

# 3. Publicar
git push origin main
```

> ### 🚧 A partir de aquí, dos ficheros quedan CONGELADOS
>
> `prisma/schema.prisma` y `src/lib/rbac.ts`
>
> **Ninguna de las nueve pistas los toca.** Si una sesión dice que los necesita, para y decide tú: o se lo haces en un commit aparte sobre `main`, o se reordena su trabajo. Lo que no puede pasar es que dos ramas los editen a la vez — es el error que arruina la semana.

---

# PASO 3 · Día 2 · abre las nueve pistas de golpe

Nueve sesiones nuevas, un prompt en cada una. **Todos son copiar y pegar.**

Antes de nada, cada sesión crea su rama desde `main` ya actualizado. El comando va dentro de cada prompt.

---

### 🔴 T1 · Aislamiento y gateo · Opus

> Las dos primeras historias son **fugas de datos de salud entre centros, demostradas end-to-end**. Es lo más urgente que hay en todo el documento.

```
Eres la pista T1 · Aislamiento y gateo.

LEE SOLO ESTO: docs/hu/E1.md y, de docs/hu/E6.md, solo E6-01.
NO abras docs/HISTORIAS_USUARIO_2026-09-06.md.

TU RAMA:
  git checkout main && git pull origin main && git checkout -b pista/T1-aislamiento

FICHEROS QUE POSEES (solo tú los tocas):
  src/lib/center-scope.ts
  src/lib/brief-queries.ts (la parte de ámbito)
  src/lib/feedback-queries.ts
  src/lib/no-show-alerts.ts
  src/app/api/mobile/v1/_lib/api-session.ts
  src/app/api/mobile/v1/staff/

FICHEROS CONGELADOS (si los necesitas, PARA y dímelo):
  prisma/schema.prisma, src/lib/rbac.ts

TUS 10 HISTORIAS, EN ESTE ORDEN:
  E1-01, E1-02, E1-03, E1-04, E1-06, E6-01, E1-07, E1-11, E1-09, E1-10

USA los helpers que dejó la sesión de costuras: requireApiCenterScope y
requireApiFeature ya existen. No escribas los tuyos.

POR CADA HISTORIA:
  1. Implementa TODOS los escenarios Gherkin tal como están escritos.
  2. Escribe el test que cubre el escenario principal.
  3. Ejecuta: npm run lint && npx tsc --noEmit && npm run test:unit
  4. Commit con el ID en el asunto. Ejemplo:
     "E1-01 · el Session Brief respeta el ámbito de centro"
  5. Sigue con la siguiente SIN pedirme confirmación.

NUNCA ejecutes la suite completa de Playwright: muta la base de datos de demo y
contamina a las otras ocho sesiones que trabajan a la vez.

PARA cuando: termines la lista, te bloquee otra pista, o necesites un fichero
congelado. Al parar, dime en una línea qué has terminado y qué falta.
```

---

### 🟠 T2 · Agenda, reservas y bonos · Opus

> Aquí hay dinero del socio: borrar una sesión hoy **quema el bono de todos los apuntados** sin devolución ni aviso.

```
Eres la pista T2 · Agenda, reservas y bonos.

LEE SOLO ESTO: docs/hu/E2.md, y de docs/hu/E1.md solo E1-05, y de docs/hu/E12.md
solo E12-06 y E12-14.
NO abras docs/HISTORIAS_USUARIO_2026-09-06.md.

TU RAMA:
  git checkout main && git pull origin main && git checkout -b pista/T2-reservas

FICHEROS QUE POSEES:
  src/lib/agenda-queries.ts
  src/lib/portal-queries.ts
  src/lib/attendee-discard.ts
  src/lib/no-show.ts
  src/lib/session-vacancy-notify.ts
  src/app/(app)/agenda/session-actions.ts

FICHEROS CONGELADOS: prisma/schema.prisma, src/lib/rbac.ts

TUS 14 HISTORIAS, EN ESTE ORDEN (el orden importa: E2-15 va la última a propósito):
  E2-01, E2-02, E2-04, E2-05, E2-07, E1-05, E2-14, E2-12, E2-13,
  E2-08, E2-09, E12-06, E12-14, E2-15

POR QUÉ E2-15 VA LA ÚLTIMA: el libro mayor del bono se construye sobre E2-01 y
E2-02. Si lo haces antes, documentas con precisión un saldo que sigue perdiendo
movimientos. Es una decisión de negocio ya tomada (D-P7), no la cambies.

USA assertBookingTransition, que ya existe. E2-02 hay que aplicarla en los CUATRO
puntos de escritura, no en uno.

POR CADA HISTORIA:
  1. Implementa TODOS los escenarios Gherkin tal como están escritos.
  2. Escribe el test que cubre el escenario principal.
  3. Ejecuta: npm run lint && npx tsc --noEmit && npm run test:unit
  4. Commit con el ID en el asunto.
  5. Sigue con la siguiente SIN pedirme confirmación.

NUNCA ejecutes la suite completa de Playwright.

PARA cuando termines, te bloquees o necesites un fichero congelado.
```

---

### 🟣 T3 · Stripe · Opus

> **Es el camino crítico de toda la semana.** 28 historias, cinco fases que van en orden. Arranca esta la primera de las nueve y no la partas en dos sesiones.

```
Eres la pista T3 · Stripe y catálogo.

LEE SOLO ESTO: docs/hu/E4.md
NO abras docs/HISTORIAS_USUARIO_2026-09-06.md.

TU RAMA:
  git checkout main && git pull origin main && git checkout -b pista/T3-stripe

FICHEROS QUE POSEES:
  src/lib/stripe*.ts
  src/lib/member-billing.ts
  src/lib/platform-billing.ts
  src/lib/provisioning.ts
  src/lib/subscriptions.ts
  src/app/api/stripe/webhook/

FICHEROS CONGELADOS: prisma/schema.prisma, src/lib/rbac.ts
(el modelo StripeWebhookEvent que necesita HU-ST-05 YA existe: lo dejó la sesión
de costuras. No hagas otra migración.)

TUS 28 HISTORIAS, EN ORDEN ESTRICTO DE FASE:
  Fase 0 (bloqueante):  HU-ST-01 a HU-ST-06
  Fase 1 (MVP cobro):   HU-ST-07 a HU-ST-11
  Fase 2 (ciclo vida):  HU-ST-12 a HU-ST-17
  Fase 3 (morosidad):   HU-ST-18 a HU-ST-22
  Fase 4 (contable):    HU-ST-23 a HU-ST-28

NO SALTES DE FASE. La fase 0 arregla tres bugs que hacen que nada de lo demás
funcione: el webhook que no verifica las dos firmas, el plano 1 que no concilia
contra la API vigente, y la ausencia total de claves de idempotencia.

DECISIONES DE NEGOCIO YA TOMADAS, no las reabras (están dentro de docs/hu/E4.md):
  cuentas Standard · Bizum solo en mode:"payment" · el plan ONLINE no se vende
  desde la app · subida de plan prorrateada, bajada al siguiente ciclo · gracia
  de morosidad 7 días configurable · al agotar reintentos, cancel · reembolsos
  y disputas desde Apta · Apta factura solo su licencia.

POR CADA HISTORIA:
  1. Implementa TODOS los escenarios Gherkin.
  2. Escribe el test del escenario principal.
  3. Ejecuta: npm run lint && npx tsc --noEmit && npm run test:unit
  4. Commit con el ID en el asunto.
  5. Sigue sin pedirme confirmación.

NUNCA ejecutes la suite completa de Playwright.

PARA al terminar cada FASE y dime en una línea dónde estás. Es la pista que más
depende del resto y quiero saber el ritmo.
```

---

### 🟡 T4 · Salud y metodología · Opus

> El semáforo de aptitud es el foso del producto y hoy **se apaga en silencio**: de las ocho zonas de dolor que puede marcar una valoración, solo dos encuentran regla.

```
Eres la pista T4 · Salud y metodología.

LEE SOLO ESTO: docs/hu/E3.md, y de docs/hu/E1.md solo E1-08, y de docs/hu/E10.md
solo E10-02 y E10-11.
NO abras docs/HISTORIAS_USUARIO_2026-09-06.md.

TU RAMA:
  git checkout main && git pull origin main && git checkout -b pista/T4-salud

FICHEROS QUE POSEES:
  src/lib/health-access.ts
  src/lib/assessments/
  src/lib/ai/
  src/lib/reference-ranges.ts
  src/lib/composition-view.ts
  src/lib/mesocycle*

FICHEROS CONGELADOS: prisma/schema.prisma, src/lib/rbac.ts
(el enum de zonas con lateralidad que necesita E3-02 YA existe en el esquema: lo
dejó la sesión de costuras. Tu trabajo es MIGRAR LOS DATOS y usarlo, no crearlo.)

TUS 20 HISTORIAS, EN ESTE ORDEN:
  E3-02, E3-03, E3-15, E1-08, E10-02, E3-05, E3-04, E3-06, E3-07, E3-08,
  E3-09, E3-10, E3-11, E3-12, E3-13, E3-14, E3-16, E3-17, E3-18, E10-11

AVISO en E3-02: hay que migrar las filas de texto libre que ya existen. Las que no
se puedan mapear quedan MARCADAS PARA REVISIÓN MANUAL, nunca descartadas, y el
informe de migración dice cuántas quedaron sin mapear.

AVISO en E3-15: hasta que el DPA con Anthropic esté firmado, la generación con IA
no opera sobre datos de un socio real. Está escrito como escenario en la historia.

POR CADA HISTORIA:
  1. Implementa TODOS los escenarios Gherkin.
  2. Escribe el test del escenario principal.
  3. Ejecuta: npm run lint && npx tsc --noEmit && npm run test:unit
  4. Commit con el ID en el asunto.
  5. Sigue sin pedirme confirmación.

NUNCA ejecutes la suite completa de Playwright.

PARA cuando termines, te bloquees o necesites un fichero congelado.
```

---

### 🔵 T5 · Portal del socio · Sonnet 5

> Hoy, para darse de baja, el socio tiene que **cerrar sesión e ir a la página pública donde el gimnasio vende altas**.

```
Eres la pista T5 · Portal del socio (web).

LEE SOLO ESTO: docs/hu/E5.md, y de docs/hu/E10.md solo E10-22.
NO abras docs/HISTORIAS_USUARIO_2026-09-06.md.

TU RAMA:
  git checkout main && git pull origin main && git checkout -b pista/T5-portal

FICHEROS QUE POSEES:
  src/app/(app)/portal/
  src/lib/emails/templates.ts
  src/app/(app)/portal/first-session-wall.tsx
  src/components/account-menu.tsx

FICHEROS CONGELADOS: prisma/schema.prisma, src/lib/rbac.ts
FICHEROS DE OTRAS PISTAS (no los toques): src/lib/portal-queries.ts es de T2.

TUS 12 HISTORIAS, EN ESTE ORDEN:
  E5-02, E5-01, E5-03, E5-04, E5-05, E5-06, E5-08, E5-07, E5-09, E5-10,
  E5-11, E10-22

DEPENDENCIAS DE OTRAS PISTAS:
  - E5-01 (gestionar suscripción y baja) necesita HU-ST-15 y HU-ST-17 de la pista
    de Stripe. Si aún no están, construye la pantalla y deja el botón llamando a
    la función que ya existe (createMemberBillingPortalSession).
  - E5-09 (historial de movimientos) necesita E2-15 de la pista de reservas.
    Si no está, DÉJALA PARA EL FINAL y avísame.

POR CADA HISTORIA:
  1. Implementa TODOS los escenarios Gherkin.
  2. Escribe el test del escenario principal.
  3. Ejecuta: npm run lint && npx tsc --noEmit && npm run test:unit
  4. Commit con el ID en el asunto.
  5. Sigue sin pedirme confirmación.

NUNCA ejecutes la suite completa de Playwright.

PARA cuando termines, te bloquees o necesites un fichero congelado.
```

---

### 🟢 T6 · App nativa · Sonnet 5

> La primera historia es **el defecto número uno de todo el producto y se arregla en veinte líneas**: el brief del móvil no pinta las condiciones sin regla, así que un hipertenso o una embarazada salen como "Sin restricciones".

```
Eres la pista T6 · App nativa.

LEE SOLO ESTO: docs/hu/E13.md, y de docs/hu/E3.md solo E3-01, y de docs/hu/E2.md
solo E2-03, E2-06, E2-10 y E2-11, y de docs/hu/E5.md solo E5-12, E5-13 y E5-14,
y de docs/hu/E8.md solo E8-03, E8-04 y E8-07 a E8-12, y de docs/hu/E10.md solo
E10-18, y de docs/hu/E7.md solo E7-03.
NO abras docs/HISTORIAS_USUARIO_2026-09-06.md.

TU RAMA:
  git checkout main && git pull origin main && git checkout -b pista/T6-app

FICHEROS QUE POSEES: apps/mobile/ ENTERO. Nadie más lo toca.

NO TOQUES src/app/api/mobile/v1/ — eso es código de la web y es de otras pistas.

TUS 20 HISTORIAS, EN ESTE ORDEN:
  E3-01, E2-03, E13-01, E13-02, E2-06, E5-12, E5-13, E2-10, E2-11, E5-14,
  E8-03, E8-04, E8-07, E8-08, E8-09, E8-10, E8-11, E8-12, E10-18, E7-03

POR QUÉ E13-01 VA TAN PRONTO: recorta la app de ocho roles a dos (socio y
entrenador). Hacerlo TERCERO significa que todo lo que viene después se arregla
sobre la mitad de superficie. Si lo dejas para el final, arreglas pantallas que
luego borras. La web NO se toca: conserva todos sus roles.

E7-03 VA LA ÚLTIMA porque es la batería de pruebas y cubre lo que has arreglado.
La infraestructura de test (E7-01) ya existe: la dejó la sesión de costuras.

POR CADA HISTORIA:
  1. Implementa TODOS los escenarios Gherkin.
  2. Escribe el test del escenario principal.
  3. Ejecuta, dentro de apps/mobile:
     npm run lint && npm run typecheck && npm test
  4. Commit con el ID en el asunto.
  5. Sigue sin pedirme confirmación.

PARA cuando termines o te bloquees.
```

---

### 🟤 T7 · Público, SEO y mapa · Sonnet 5

> La primera historia desbloquea todas las demás: hoy `robots.txt` **redirige a `/login`**, y Googlebot lo pide antes de rastrear nada.

```
Eres la pista T7 · Público, SEO y mapa.

LEE SOLO ESTO: docs/hu/E9.md y docs/hu/E11.md
NO abras docs/HISTORIAS_USUARIO_2026-09-06.md.

TU RAMA:
  git checkout main && git pull origin main && git checkout -b pista/T7-seo

FICHEROS QUE POSEES:
  src/app/planes/
  src/app/hazte-socio/
  src/app/lead-form/
  src/proxy.ts
  src/app/robots.ts, src/app/sitemap.ts (los creas tú)
  src/lib/barrio-map*
  src/lib/public-membership-queries.ts, src/lib/public-lead-queries.ts

FICHEROS CONGELADOS: prisma/schema.prisma, src/lib/rbac.ts
(los campos nuevos de Center que necesita E9-05 YA existen: phone, city,
postalCode, neighborhood, description, openingHours, publicPage.)

OJO: src/lib/dashboard-queries.ts NO es tuyo, es de T9. Para E11-01 y E11-09
necesitas tocarlo: pide el cambio en la ventana de merge en vez de editarlo.

TUS 24 HISTORIAS, EN ESTE ORDEN:
  E9-01, E9-02, E9-04, E9-05, E9-06, E9-15, E9-13, E9-08, E9-09, E9-10,
  E9-07, E9-11, E9-12, E9-14,
  E11-02, E11-03, E11-04, E11-05, E11-06, E11-07, E11-10, E11-01, E11-09, E11-08

POR QUÉ E9-01 VA LA PRIMERA: sin ella, robots.txt y sitemap.xml redirigen a
/login y todo lo demás de SEO es inútil. Es una línea en el matcher del proxy.

E11-01 y E11-09 van casi al final porque dependen de dashboard-queries.ts, que
es de otra pista.

E11-08 (geometría real de barrios) VA LA ÚLTIMA: necesita descargar y preprocesar
geodatos del INE o de los portales municipales. Si no llegas, no pasa nada:
la teselación actual sigue funcionando.

POR CADA HISTORIA:
  1. Implementa TODOS los escenarios Gherkin.
  2. Escribe el test del escenario principal.
  3. Ejecuta: npm run lint && npx tsc --noEmit && npm run test:unit
  4. Commit con el ID en el asunto.
  5. Sigue sin pedirme confirmación.

AVISO: E11-02, E11-04, E11-06 y E11-10 tocan el DOM que usa e2e/mapa-barrios.spec.ts.
E11-04 rompe su selector span.tz-nums al sustituir la lista por una tabla.
Actualiza el spec en el mismo cambio.

NUNCA ejecutes la suite completa de Playwright.

PARA cuando termines o te bloquees.
```

---

### ⚫ T8 · Cumplimiento (código) · Opus

> La primera historia es **el hallazgo con peor relación coste/exposición de todo el repositorio**: el formulario público capta datos de salud sin base jurídica y estampa la firma de un consentimiento que nadie ha prestado.

```
Eres la pista T8 · Cumplimiento normativo (la parte de código).

LEE SOLO ESTO: docs/hu/E10.md
Y para el contexto de qué se está redactando en paralelo con el despacho:
docs/legal/README.md (solo el índice, no los 12 documentos).
NO abras docs/HISTORIAS_USUARIO_2026-09-06.md.

TU RAMA:
  git checkout main && git pull origin main && git checkout -b pista/T8-cumplimiento

FICHEROS QUE POSEES:
  src/lib/consent.ts
  src/app/privacidad/
  src/lib/retention.ts
  src/app/api/portal/export-data/
  src/app/api/jobs/run/

FICHEROS CONGELADOS: prisma/schema.prisma, src/lib/rbac.ts
(la tabla de plazos de retención y los campos de menores YA existen en el esquema.)

FICHEROS DE OTRAS PISTAS: health-access.ts es de T4. E10-02 y E10-11 las hace T4,
no tú.

TUS 10 HISTORIAS, EN ESTE ORDEN:
  E10-01, E10-07, E10-09, E10-13, E10-12, E10-08, E10-16, E10-17, E10-20, E10-21

QUÉ NO HACES: E10-03, E10-04, E10-05, E10-06, E10-10 y E10-15 son documentos que
firma un despacho. Los borradores ya están en docs/legal/. Tu trabajo es la MITAD
DE CÓDIGO de cada uno cuando la tengan, no el texto legal.

AVISO en E10-21: el módulo de fichajes se apaga (decisión tomada). ANTES de retirar
el modelo, exporta y conserva los TimeClockEntry existentes: el plazo de 4 años del
art. 34.9 ET sigue corriendo aunque la funcionalidad desaparezca.

AVISO en E10-08: los plazos son CONFIGURACIÓN, no código. La tabla está en
docs/legal/03-PLAZOS-CONSERVACION.md y el despacho puede cambiarla sin tocar el motor.

POR CADA HISTORIA:
  1. Implementa TODOS los escenarios Gherkin.
  2. Escribe el test del escenario principal.
  3. Ejecuta: npm run lint && npx tsc --noEmit && npm run test:unit
  4. Commit con el ID en el asunto.
  5. Sigue sin pedirme confirmación.

NUNCA ejecutes la suite completa de Playwright.

PARA cuando termines o te bloquees.
```

---

### ⚪ T9 · Producto, menú e higiene · Sonnet 5

> 25 historias, casi todas pequeñas. Las dos primeras quitan promesas que el producto no cumple: una rutina de IA falsa y un chat que dice "responde al instante" que nadie lee.

```
Eres la pista T9 · Producto, menú e higiene técnica.

LEE SOLO ESTO: docs/hu/E12.md, y de docs/hu/E6.md solo E6-04 a E6-08, y de
docs/hu/E8.md solo E8-05, E8-06, E8-13 a E8-18.
NO abras docs/HISTORIAS_USUARIO_2026-09-06.md.

TU RAMA:
  git checkout main && git pull origin main && git checkout -b pista/T9-producto

FICHEROS QUE POSEES:
  src/lib/platform-plans.ts
  src/components/nav-icons.tsx
  src/app/(app)/apta/
  src/lib/members-queries.ts
  src/lib/dashboard-queries.ts
  src/app/(app)/_lib/dashboard.ts

FICHEROS CONGELADOS: prisma/schema.prisma, src/lib/rbac.ts
(E8-17, el menú de 5 secciones, necesita rbac.ts. Diseña el cambio, escríbelo en
un fichero aparte y pídemelo en la ventana de merge.)

TUS 25 HISTORIAS, EN ESTE ORDEN:
  E12-01, E12-02, E12-03, E6-04, E6-05, E6-06, E12-10, E12-05, E12-17,
  E8-15, E8-16, E8-17, E12-16, E12-12, E12-13, E12-08, E12-09, E12-07,
  E12-15, E8-05, E8-06, E8-13, E8-14, E8-18, E6-08

DECISIONES YA TOMADAS que afectan a tus historias:
  - E12-01: la rutina de IA falsa SE APAGA
  - E12-02: se quita la promesa "responde al instante"; el chat NO se apaga
  - E12-03: el plan ONLINE NO se retira del catálogo; solo deja de venderse en la app
  - E6-04: reempaquetado completo del catálogo
  - E12-17: solo España, así que wa.me sin reservas

AVISO en E12-07: antes de borrar /portal/billing/, comprueba que E5-01 y HU-ST-17
no lo necesitan. Si lo necesitan, NO lo borres: dales consumidor.

POR CADA HISTORIA:
  1. Implementa TODOS los escenarios Gherkin.
  2. Escribe el test del escenario principal.
  3. Ejecuta: npm run lint && npx tsc --noEmit && npm run test:unit
  4. Commit con el ID en el asunto.
  5. Sigue sin pedirme confirmación.

NUNCA ejecutes la suite completa de Playwright.

PARA cuando termines o te bloquees.
```

---

# PASO 4 · Día 4 (jueves) · abre la décima sesión

**Espera al jueves a propósito.** Estos tests cubren código que T1, T2 y T6 están cambiando. Si arrancas el martes, escribes tests contra código que va a cambiar dos veces.

### 🔺 T10 · Pruebas · Sonnet 5

```
Eres la pista T10 · Pruebas de regresión.

Arrancas el jueves, cuando T1 y T2 ya han mezclado sus historias P0.

LEE SOLO ESTO: docs/hu/E7.md
NO abras docs/HISTORIAS_USUARIO_2026-09-06.md.

TU RAMA:
  git checkout main && git pull origin main && git checkout -b pista/T10-pruebas

FICHEROS QUE POSEES: los ficheros de test que creas. No modificas código de
producción; si un test falla por un fallo real, me lo dices y lo arregla su pista.

TUS 6 HISTORIAS, EN ESTE ORDEN:
  E7-06, E7-07, E7-08, E7-09, E7-04, E7-05

EMPIEZA POR: mobile-agenda-scope.spec.ts y mobile-staff-scope.spec.ts (los dos
bloqueantes de E7-06). No necesitan interfaz: se ejecutan con Playwright
request.newContext() contra la API, sin navegador.

PATRÓN A COPIAR para los unitarios: e2e/../agenda-booking.test.ts, que monta su
propia organización contra Postgres real. Es el mejor fichero de test del repositorio.

POR CADA HISTORIA:
  1. Escribe los casos tal como están especificados en los escenarios Gherkin.
  2. Ejecuta solo TUS tests, nunca la suite completa de Playwright.
  3. Commit con el ID en el asunto.
  4. Sigue sin pedirme confirmación.

Si un test que escribes falla porque el código está mal, NO lo arregles: anótalo
y dímelo al final con el ID de la historia a la que pertenece.
```

---

# PASO 5 · Todos los días · las dos ventanas de merge

**13:00 y 19:00.** Fuera de esas dos horas, nadie mezcla.

### Antes de la ventana · cada sesión hace esto

Pega esto en cada sesión unos minutos antes:

```
Prepárate para la ventana de merge:
  git add -A && git commit -m "wip" (si te queda algo sin commitear)
  git fetch origin main
  git merge origin/main
Resuelve los conflictos que salgan SOLO en tus ficheros.
Luego ejecuta npm run lint && npx tsc --noEmit && npm run test:unit
y dime si estás listo para mezclar.
```

### En la ventana · la persona integradora hace esto

**Siempre en este orden.** De la pista que más dependencias produce a la que menos:

```bash
git checkout main && git pull origin main

for RAMA in T1-aislamiento T2-reservas T3-stripe T4-salud T8-cumplimiento \
            T9-producto T5-portal T6-app T7-seo T10-pruebas; do
  echo "──────── mezclando $RAMA ────────"
  git merge --no-ff pista/$RAMA || { echo "⛔ CONFLICTO en $RAMA — para aquí"; break; }
done

npm run lint && npx tsc --noEmit && npm run test:unit
git push origin main
```

Si el bucle se para en una rama, resuelve esa y vuelve a lanzarlo desde ahí.

> **Nunca uses `rebase`.** Hay nueve o diez checkouts vivos y un rebase les rompe el suyo. Siempre `merge`.

### Una vez al día, en la ventana de las 19:00

```bash
npx playwright test
```

**Esta es la única vez que se ejecuta la suite completa**, porque muta la base de datos de demo.

---

# PASO 6 · Viernes 18:00 · corte de alcance

Pega esto en cada sesión:

```
Corte de alcance. Termina SOLO la historia que tengas a medias, haz commit y para.
No empieces ninguna más.
Dime: qué historias has terminado (con sus IDs), cuál has dejado a medias, y
cuáles no has empezado.
```

Con esas diez respuestas tienes el estado real en cinco minutos.

---

# PASO 7 · Sábado y domingo

**Sábado: cero historias nuevas.** Solo integración, arreglar CI y regresión.

**Domingo:** suite completa de Playwright, repaso de lo que entra, y una nota escrita de lo que queda para la semana siguiente.

---

# Cuando algo va mal

| Lo que ves | Qué haces |
|---|---|
| **Una sesión dice que necesita `rbac.ts` o `schema.prisma`** | No la dejes. Apunta qué necesita, hazlo tú en un commit aparte sobre `main` en la siguiente ventana, y dile que continúe con la siguiente historia |
| **Dos ramas chocan en el mismo fichero** | Es un fallo del reparto, no un conflicto normal. Mira en `docs/PLAN_PARALELIZACION_2026-09-06.md` §4 de quién es ese fichero. El otro revierte su parte y la pide |
| **CI en rojo tras un merge** | Se arregla antes de mezclar la siguiente rama. Nunca acumules dos ramas sobre un `main` roto |
| **Una sesión se atasca dando vueltas** | Párala y pégale: `Resume en 3 líneas qué has hecho y qué te bloquea. No sigas hasta que te conteste.` |
| **Una sesión se queda sin contexto** | Déjala compactar y que siga. **No la reinicies**: perderías la caché del prefijo y pagarías el contexto entero otra vez |
| **T3 (Stripe) va por detrás del resto** | Es lo esperado: es el camino crítico. Antes de recortar nada, recorta de T7 y T9, que son las que menos bloquean |
| **Una historia resulta estar mal escrita** | Que la sesión la implemente como pueda y lo anote. **No reabras la decisión de negocio**: las 30 están cerradas |
| **Un test nuevo falla por un fallo real de código** | La pista dueña del fichero lo arregla, no la de pruebas |

---

# Chuleta de un vistazo

| Cuándo | Sesiones abiertas | Qué pasa |
|---|---|---|
| **Lun mañana** | 2 · S0-A + S0-B | Costuras |
| **Lun tarde** | 0 | Merge de costuras · se congelan `schema.prisma` y `rbac.ts` |
| **Mar - Vie** | 9 · T1…T9 | Trabajo en paralelo · merge a las 13:00 y 19:00 |
| **Jue - Vie** | +1 · T10 | Se suma la de pruebas |
| **Vie 18:00** | 10 | Corte de alcance |
| **Sáb** | 0 | Solo integración y CI |
| **Dom** | 0 | Regresión completa y entrega |

### Reparto verificado

**192 historias, 0 duplicadas, 0 sin asignar.**

| Pista | HU | Modelo | Primera historia |
|---|---|---|---|
| S0-A · Costuras servidor | 8 | Opus | migración única de esquema |
| S0-B · Costuras cliente | 5 | Sonnet 5 | E8-02 |
| T1 · Aislamiento | 10 | Opus | E1-01 |
| T2 · Reservas y bonos | 14 | Opus | E2-01 |
| T3 · Stripe | 28 | Opus | HU-ST-01 |
| T4 · Salud | 20 | Opus | E3-02 |
| T5 · Portal del socio | 12 | Sonnet 5 | E5-02 |
| T6 · App nativa | 20 | Sonnet 5 | E3-01 |
| T7 · SEO y mapa | 24 | Sonnet 5 | E9-01 |
| T8 · Cumplimiento | 10 | Opus | E10-01 |
| T9 · Producto e higiene | 25 | Sonnet 5 | E12-01 |
| T10 · Pruebas | 6 | Sonnet 5 | E7-06 |
| **Despacho** · jurídico | 7 | — | `docs/legal/00` |
| **Backlog** · publicación | 3 | — | espera a D-M2 |

### Las tres reglas que no se rompen

1. **Cada pista toca solo sus ficheros.**
2. **`schema.prisma` y `rbac.ts` están congelados** desde el lunes por la tarde.
3. **Nadie ejecuta la suite completa de Playwright** salvo el integrador, una vez al día.
