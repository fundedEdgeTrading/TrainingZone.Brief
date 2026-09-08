# Prompts para paralelizar lo que queda · lote 2

**Fecha:** 8 de septiembre de 2026
**Base medida:** `main` en `1741b08`
**De dónde sale:** `docs/PENDIENTE_DESARROLLO_2026-09-08.md` (las 24 historias
que quedan, más el punto ciego de CI)
**Antecesor:** `docs/RUNBOOK_EJECUCION.md` — mismas reglas, mismo vocabulario,
mismas ventanas de merge. Si algo no está aquí, está allí.

Este documento es **solo prompts para copiar y pegar**. Once sesiones, repartidas
en dos olas y un grupo bloqueado. Nada que decidir mientras se pega: lo que hay
que decidir está en la sección de arriba y se decide una vez.

---

## El mapa en treinta segundos

```
ANTES DE NADA   ▼ tres decisiones (10 min, una persona)

OLA 0           ┌─ C1  Red de seguridad de CI      0,5 d ─┐
día 1           ├─ S1  Costura del lote            1,5 d  │  ← estas 4 a la vez
                ├─ A2  E5-09 · historial web       2,5 d  │
                └─ D2  E9-16 · ficha de tienda     2,5 d ─┘

                ▼ PUERTA · mezclar S1 en main          ← obligatoria

OLA 1           ┌─ A1  E1-10 · fuerza bruta        2,5 d ─┐
día 2 en        ├─ P1  Stripe · cobro y morosidad 10,9 d  │
adelante        ├─ P2  Stripe · dinero que vuelve  8,5 d  │  ← estas 7 a la vez
                ├─ P3  Stripe · consola dirección  6,0 d  │
                ├─ P4  Stripe · neto y contable    5,8 d  │
                ├─ P5  Stripe · cupones y comisión 3,3 d  │
                └─ D1  E5-15 · borrado de cuenta   2,5 d ─┘

BLOQUEADAS      ├─ L1  Cumplimiento (código)       9,5 d   ← manda el despacho
                └─ D3  E10-19 · legales en la app  0,8 d   ← tras L1 y D1

CADA DÍA        ▼ 13:00 y 19:00 · mezclar todo en main
```

**Nueve sesiones a la vez como máximo**, igual que en el lote anterior. C1, A2 y
D2 siguen vivas cuando arranca la ola 1; con las siete de la ola 1 se llega justo
al techo.

> ### La cuenta, dicha una vez
> Son **54,8 días-persona**. Paralelizar no los reduce: reparte. El suelo de
> calendario lo marca **P1, con 10,9 días**, que es la pista más larga y además
> lleva las dos P0 de Stripe. Todo lo demás cabe por debajo de ella. Si el lote
> tiene que terminar antes, lo que se recorta es alcance —P3, P4 y P5 son P2 y
> P3—, no el número de sesiones.

---

## Antes de pegar nada · tres decisiones

Diez minutos, una sola persona, y no se vuelven a tocar.

### ☐ 1. Descongelar `prisma/schema.prisma` para un solo commit

`AGENTS.md` congeló `prisma/schema.prisma` y `src/lib/rbac.ts` para el trimestre,
y la regla dice: *«Si necesitas tocarlos, para y pídelo»*. **Esto es pedirlo.**

Nueve de las trece historias de Stripe que quedan necesitan tablas que no
existen —mandato SEPA, refunds, notas de crédito, disputas, payouts, cupones— y
E1-10 necesita dónde contar intentos fallidos. Hacerlo pista por pista son nueve
migraciones que chocan entre sí.

**La decisión**: `schema.prisma` se descongela **solo para la sesión S1**, que
hace **una única migración** con todo el lote, y se vuelve a congelar en cuanto
S1 esté mezclada. `src/lib/rbac.ts` **sigue congelado**: ninguna historia de este
lote lo necesita.

### ☐ 2. Decidir quién integra

Una sola persona. Con nueve ramas vivas, integrar es un puesto de trabajo.
Mismas ventanas que el lote anterior: **13:00 y 19:00**.

### ☐ 3. Los identificadores de la app — hoy, no cuando toque

`D2` (E9-16) tiene que escribir `ios.bundleIdentifier` y `android.package` en
`app.json`, y **son inmutables después de la primera publicación**. Esa decisión
no la toma una sesión de Claude. Decide el nombre antes de abrir D2 y pásaselo
dentro del prompt: hay un hueco marcado `⟦BUNDLE_ID⟧` para eso.

Lo mismo con el despacho: si `docs/legal/00-CUESTIONARIO-DIRECCION.md` sigue con
sus 18 huecos `⟦PENDIENTE⟧`, **L1 no arranca**, y son 2-4 semanas que no se
acortan con sesiones.

---

## Quién posee qué

La regla de oro del lote anterior sigue siendo la única que importa: **cada pista
toca solo sus ficheros**. Este es el reparto completo, verificado contra el árbol
actual.

| Pista | Ficheros que posee |
|---|---|
| **C1** | `.github/workflows/e2e.yml` · `e2e/notifications.spec.ts` |
| **S1** | `prisma/schema.prisma` (solo ella) · `src/app/api/stripe/webhook/route.ts` · los módulos vacíos que deja puestos |
| **A1** | `src/lib/login-throttle.ts` (nuevo) · `src/app/login/actions.ts` · `src/app/api/mobile/v1/auth/login/` · `src/auth.ts`, `src/auth.config.ts` |
| **A2** | `src/app/(app)/portal/movimientos/` (nueva) · `src/app/(app)/portal/membresia/billing-view.ts` |
| **P1** | `src/lib/member-billing.ts` · `src/lib/sepa-prenotification*.ts` · `src/lib/stripe-mandate.ts`, `stripe-dunning.ts`, `stripe-card-expiry.ts` (nuevos) · `src/app/gestionar-suscripcion/` |
| **P2** | `src/lib/stripe-refunds.ts`, `stripe-disputes.ts` (nuevos) · `src/app/(app)/billing/reembolsos/`, `.../disputas/` |
| **P3** | `src/app/(app)/stripe/` (nueva) · `src/lib/stripe-console.ts` (nuevo) |
| **P4** | `src/lib/stripe-balance.ts`, `stripe-export.ts`, `stripe-reports.ts` (nuevos) · `src/app/(app)/billing/contabilidad/` |
| **P5** | `src/lib/stripe-coupons.ts` (nuevo) · `src/app/(app)/billing/cupones/` |
| **D1** | `src/app/(app)/portal/perfil/` · `src/lib/account-deletion.ts` (nuevo) · `apps/mobile/src/app/(tabs)/perfil.tsx` |
| **D2** | `apps/mobile/app.json`, `apps/mobile/eas.json`, `apps/mobile/assets/` · `src/app/app/` (nueva) · `src/app/.well-known/` (nueva) · `src/proxy.ts` |
| **P3/P4/P5 → P1** | `member-billing.ts` es de **P1**. Quien lo necesite escribe `docs/hu/<PISTA>-peticion-member-billing.md` y lo pide en la ventana de merge, como hizo T7 con `dashboard-queries.ts` |
| **L1** | `src/app/privacidad/`, `src/app/condiciones/` (nueva) · `src/lib/legal-docs.ts` (nuevo) · `src/app/hazte-socio/` · `src/lib/provisioning.ts` |
| **D3** | `apps/mobile/src/app/(tabs)/perfil.tsx` **después de D1** · `apps/mobile/src/app/legal/` (nueva) |

**Congelado para todos:** `src/lib/rbac.ts`.
**Congelado para todos menos S1:** `prisma/schema.prisma`.

---

# OLA 0 · día 1 · cuatro sesiones a la vez

Ninguna de las cuatro se toca con las otras. Ábrelas de golpe.

---

### ⬛ C1 · Red de seguridad de CI · Sonnet 5

> **Empieza por aquí.** Es media jornada y hoy hay **13 pruebas del alta
> pago-primero que no corren en ninguna parte**: compra → webhook firmado →
> activación de contraseña → puesta en marcha. Todo lo que venga después se apoya
> en esta red.

```
Eres la sesión C1 · Red de seguridad de CI.

Arreglas el punto ciego descrito en docs/PENDIENTE_DESARROLLO_2026-09-08.md,
sección "El punto ciego de CI". No es una historia del catálogo: es un fallo de
la red de seguridad y va antes que ninguna historia.

LEE SOLO ESTO:
- docs/PENDIENTE_DESARROLLO_2026-09-08.md, la sección "El punto ciego de CI"
- .github/workflows/e2e.yml

TU RAMA:
  git checkout main && git pull origin main && git checkout -b lote2/C1-ci

FICHEROS QUE POSEES (solo tú los tocas):
  .github/workflows/e2e.yml
  e2e/notifications.spec.ts

EL PROBLEMA, EN UNA FRASE: dentro del job `verify`, planes-gateo.spec.ts exige
que STRIPE_SECRET_KEY esté AUSENTE, y alta-comercial.spec.ts (4 tests) y
alta-completa-gimnasio.spec.ts (9 tests) exigen que esté PRESENTE junto con
STRIPE_WEBHOOK_SECRET. Son incompatibles en el mismo job, así que esos 13 tests
se saltan enteros y nadie lo vio.

TU TRABAJO, EN ESTE ORDEN:

1. AÑADE UN SEGUNDO JOB a .github/workflows/e2e.yml —llámalo `e2e-pago`— que
   corra EXCLUSIVAMENTE estos tres specs:
     e2e/alta-comercial.spec.ts
     e2e/alta-completa-gimnasio.spec.ts
     e2e/notifications.spec.ts
   con el mismo bloque `env` que `verify` MÁS estas tres, de usar y tirar:
     STRIPE_SECRET_KEY: sk_test_solo_para_ci_0000
     STRIPE_WEBHOOK_SECRET: whsec_solo_para_ci_0000
     JOBS_CRON_SECRET: cron-solo-para-ci
   No hacen falta claves reales de Stripe: las pruebas firman sus propios eventos
   con el mismo secreto que los verifica, y verificar una firma es criptografía
   local, sin llamada a la API.

2. NO TOQUES el bloque `env` del job `verify`. Su comentario dice, con razón, que
   las claves se dejan sin definir a propósito para que /planes arranque en modo
   demo. Añadir claves ahí rompe planes-gateo.spec.ts y cinco tests unitarios.

3. El job nuevo va en PARALELO, sin `needs:`, igual que el job `mobile`: un fallo
   del camino de pago no debe ocultar el resultado de la web ni al revés.

4. Deja escrito en un comentario del YAML POR QUÉ hay dos jobs y no uno. El
   comentario que hay hoy explica media verdad y por eso nadie vio el hueco.

5. `npx playwright install --with-deps chromium` y la subida del informe de
   fallos también en el job nuevo. Copia el patrón de `verify`, no lo reinventes.

CÓMO SE COMPRUEBA QUE FUNCIONA (hazlo antes de dar nada por bueno):
  Levanta Postgres y el .env tal como está documentado en
  docs/PENDIENTE_DESARROLLO_2026-09-08.md, sección "Cómo verificar todo esto por
  tu cuenta", añade las tres claves de usar y tirar, y ejecuta:
    npx playwright test e2e/alta-comercial.spec.ts \
      e2e/alta-completa-gimnasio.spec.ts e2e/notifications.spec.ts
  Tienen que pasar los 14. Si alguno se sigue saltando, el job nuevo no sirve:
  di cuál y por qué.

NUNCA ejecutes la suite completa de Playwright: muta la base de datos de demo y
contamina a las otras sesiones que trabajan a la vez.

Commit con asunto "ci · segundo job para los tests del alta pago-primero".
Cuando termines, dime en una línea cuántos tests dejan de saltarse.
```

---

### 🟪 S1 · Costura del lote · Opus

> **Modelo: Opus.** Aquí se decide el esquema de todo el lote y el reparto del
> despachador de webhooks. Si esto sale torcido, chocan cinco pistas.
> **Es la puerta: nadie de la ola 1 empieza hasta que esté mezclada.**

```
Eres la sesión S1 · Costura del lote 2.

Antes de que arranquen las siete pistas de la ola 1, dejas puestos los cimientos
que todas van a usar: UNA migración y UN despachador de webhook ya cableado.
Nadie más puede empezar hasta que esto esté mezclado en main.

TIENES AUTORIZACIÓN EXPRESA PARA TOCAR prisma/schema.prisma. Es la única sesión
del lote que la tiene, y solo para la migración de abajo. src/lib/rbac.ts SIGUE
CONGELADO: si crees que lo necesitas, para y dímelo.

LEE SOLO ESTO:
- docs/hu/E4.md, fases 2, 3 y 4 (de HU-ST-12 a HU-ST-28)
- docs/hu/E1.md, solo E1-10
- docs/hu/E5.md, solo E5-15
- src/lib/member-billing.ts y src/app/api/stripe/webhook/route.ts, para conocer
  el terreno
NO abras docs/HISTORIAS_USUARIO_2026-09-06.md: son 236 KB y no lo necesitas.

TU RAMA:
  git checkout main && git pull origin main && git checkout -b lote2/S1-costura

TU TRABAJO, EN ESTE ORDEN EXACTO:

1. UNA SOLA MIGRACIÓN de Prisma, un único commit, con TODO el cambio de esquema
   del lote. Deriva los campos exactos de los escenarios Gherkin de las historias
   citadas; esto es el inventario de lo que tiene que quedar cubierto:
   - Mandato SEPA (HU-ST-12): referencia de mandato, últimos 4 del IBAN, estado
     del mandato, y el estado "pendiente de confirmación" de una suscripción cuyo
     primer cobro es asíncrono.
   - Corte de acceso por morosidad (HU-ST-18): periodo de gracia configurable por
     organización, validado entre 0 y 60 días, con 7 por defecto (decisión D-S5),
     y la marca de cuándo empezó el impago.
   - Reembolsos y notas de crédito (HU-ST-20): stripeRefundId ya existe en
     Payment — comprueba qué falta: importe devuelto, motivo, autor, y el enlace
     a la nota de crédito.
   - Disputas (HU-ST-21): la disputa con su importe, su due_by y su resultado.
   - Desglose del cobro (HU-ST-23): bruto, comisión y neto sobre Payment, y el
     payout al que pertenece con su arrival_date.
   - Cupones (HU-ST-27): el cupón espejado desde la cuenta conectada y el
     descuento aplicado en cada Payment.
   - Intentos de acceso (E1-10): dónde se cuentan los intentos fallidos por email
     y por IP, con su ventana. NO uses AuditLog como contador: tiene un trigger
     de solo-inserción (auditlog_append_only) y no es una tabla de estado.
   - Solicitud de borrado de cuenta (E5-15): la solicitud, su plazo de un mes y
     su resolución.

   REGLAS QUE NO SE ROMPEN, están en AGENTS.md:
   - Nada que mueva sessionsRemaining sin pasar por SessionLedger.
   - AuditLog sigue siendo de solo inserción. No aflojes el trigger.
   - Ningún Price de Stripe se borra jamás: se archiva.

2. CABLEA EL DESPACHADOR DE WEBHOOK, src/app/api/stripe/webhook/route.ts.
   Hoy es un `switch` sobre event.type y CINCO pistas distintas necesitan añadirle
   casos. Si lo tocan las cinco, chocan las cinco. Así que lo tocas TÚ, ahora, una
   sola vez: añade los `case` que faltan, cada uno delegando en un módulo propio
   con la firma ya decidida, y deja esos módulos ESCRITOS PERO VACÍOS —que
   registren el evento y devuelvan ok— para que cada pista rellene el suyo:

     charge.refunded, credit_note.*        → src/lib/stripe-refunds.ts     (P2)
     charge.dispute.created/updated/closed → src/lib/stripe-disputes.ts    (P2)
     payout.paid, payout.failed            → src/lib/stripe-balance.ts     (P4)
     mandate.updated,
       checkout.session.async_payment_*    → src/lib/stripe-mandate.ts     (P1)
     invoice.upcoming                      → src/lib/sepa-prenotification.ts (P1)
     customer.source.expiring,
       payment_method.automatically_updated→ src/lib/stripe-card-expiry.ts (P1)

   Respeta lo que ya funciona: la deduplicación por event.id de HU-ST-05
   (claimStripeEvent / markStripeEventProcessed) envuelve también a los casos
   nuevos, y la verificación de las dos firmas de HU-ST-01 no se toca.

3. DEJA UN PUNTO DE ENGANCHE en la conciliación de member-billing.ts para el
   desglose de HU-ST-23: una llamada a recordBalanceBreakdown(paymentId, charge)
   que hoy no hace nada y que P4 rellenará. Es la única línea que S1 escribe en
   member-billing.ts; a partir de ahí el fichero es de P1.

4. HELPERS COMPARTIDOS, mínimos pero funcionando, para que ninguna pista se
   invente el suyo:
   - assertRefundable(payment)  · un pago en efectivo no llama a Stripe, un pago
     ya devuelto no se devuelve dos veces
   - graceWindowFor(orgId)      · el periodo de gracia del centro, leído del
     servidor, nunca un literal de días en el cliente
   - stripeReadClient(orgId)    · cliente de solo lectura contra la cuenta
     conectada, para la consola de P3 y los informes de P4

POR CADA PASO: escribe el test del comportamiento principal, ejecuta
  npm run lint && npx tsc --noEmit && npm run test:unit
y haz un commit descriptivo. Sigue al siguiente sin preguntarme.

NUNCA ejecutes la suite completa de Playwright.

Cuando termines, dime en una línea qué modelos nuevos hay y qué módulos vacíos
has dejado, para que yo se lo diga a las siete pistas.
```

---

### 🟦 A2 · E5-09 · Historial y movimientos en la web · Sonnet 5

> Es el espejo al revés: **por una vez el móvil va por delante**. El libro de
> movimientos existe en `/api/mobile/v1/portal/consumption` y la mitad web nunca
> se escribió. No necesita esquema nuevo: `SessionLedger` ya está.

```
Eres la pista A2 · E5-09 · Historial de asistencia y de movimientos del bono en la web.

No dependes de S1 ni de nadie: SessionLedger ya existe en main desde E2-15.
Arranca ya.

LEE SOLO ESTO:
- docs/hu/E5.md, solo E5-09
- src/app/api/mobile/v1/portal/consumption/route.ts — es la mitad que YA existe
- src/lib/session-ledger.ts
NO abras docs/HISTORIAS_USUARIO_2026-09-06.md.

TU RAMA:
  git checkout main && git pull origin main && git checkout -b lote2/A2-historial

FICHEROS QUE POSEES:
  src/app/(app)/portal/movimientos/   (la creas tú)
  src/app/(app)/portal/membresia/billing-view.ts

FICHEROS CONGELADOS: prisma/schema.prisma, src/lib/rbac.ts

QUÉ HACES: la mitad web de un libro de movimientos que ya existe en la API móvil.
Los cuatro escenarios Gherkin de E5-09, tal como están escritos: movimientos con
fecha, signo, motivo y saldo resultante leídos del SessionLedger; asistidas,
canceladas y no presentadas con su efecto sobre el bono; el saldo de arriba
cuadrando con la suma de los movimientos de abajo; y paridad con la app.

EL ESCENARIO QUE DECIDE SI ESTÁ BIEN HECHA es "paridad": las dos cifras coinciden
porque LEEN EL MISMO ORIGEN, no porque las dos consultas se parezcan. Extrae la
consulta a una función compartida y que la ruta móvil pase a consumirla. Si
copias la lógica "como espejo", has reproducido exactamente el fallo que AGENTS.md
señala como el que más se repite en este repositorio.

INVARIANTES QUE TE TOCAN (AGENTS.md):
  - Todo lo que lea por centerId pasa por isCenterInScope. También aquí.
  - Ningún movimiento de sessionsRemaining sin su fila en SessionLedger. Tú solo
    lees; si detectas un movimiento sin fila, NO lo arregles: anótalo y dímelo.

POR CADA ESCENARIO:
  1. Impleméntalo tal como está escrito.
  2. Escribe el test del escenario principal.
  3. Ejecuta: npm run lint && npx tsc --noEmit && npm run test:unit
  4. Commit con "E5-09 · ..." en el asunto.

NUNCA ejecutes la suite completa de Playwright.

PARA cuando termines o te bloquees, y dime en una línea qué has dejado listo.
```

---

### 🟩 D2 · E9-16 · Ficha de tienda · Sonnet 5

> Sin identificadores no hay build firmada, sin build firmada no hay TestFlight y
> sin TestFlight no hay ficha. Y `bundleIdentifier` **no se puede cambiar después
> de publicar**: rellena los dos huecos del prompt antes de pegarlo.

```
Eres la pista D2 · E9-16 · Ficha de tienda: identificadores, capturas, copy y App Links.

No dependes de S1: no tocas esquema. Arranca ya.

LEE SOLO ESTO:
- docs/hu/E9.md, solo E9-16 (y E9-01 para entender el matcher del proxy)
- apps/mobile/app.json
NO abras docs/HISTORIAS_USUARIO_2026-09-06.md.

TU RAMA:
  git checkout main && git pull origin main && git checkout -b lote2/D2-ficha

FICHEROS QUE POSEES:
  apps/mobile/app.json
  apps/mobile/eas.json          (lo creas tú)
  apps/mobile/assets/
  src/app/app/                  (la página pública /app, la creas tú)
  src/app/.well-known/          (la creas tú)
  src/proxy.ts

FICHEROS CONGELADOS: prisma/schema.prisma, src/lib/rbac.ts
NO TOQUES apps/mobile/src/app/(tabs)/perfil.tsx: es de la pista D1.

DECISIONES YA TOMADAS, no las reabras:
  ios.bundleIdentifier = ⟦BUNDLE_ID⟧
  android.package      = ⟦PACKAGE⟧
  nombre de ficha      = "Apta · Tu gimnasio"
  subtítulo            = "Reserva, bonos y tu progreso"
Son IRREVERSIBLES tras la primera publicación. Si alguno de los dos huecos llega
sin rellenar, PARA y pídemelo: no inventes un identificador.

LOS SIETE ESCENARIOS DE E9-16, EN ESTE ORDEN:
  1. identificadores — app.json completo + eas.json con perfil de producción
  2. privacidad — app.json referencia la URL de política de privacidad, y quedan
     redactados los cuestionarios App Privacy y Data safety declarando
     "Health & Fitness" y "Sensitive Info"
  3. App Links — apple-app-site-association y assetlinks.json servidos desde
     /.well-known, y el matcher del proxy los deja pasar SIN redirigir a /login
     (mismo arreglo de una línea que E9-01 hizo con robots.txt)
  4. copy — descripción breve de Play que dice qué resuelve, no qué es
  5. página /app — capturas, botones de tienda y JSON-LD MobileApplication
  6. capturas — 6 a 8 por plataforma en los tamaños obligatorios
  7. OTA — decide si entra expo-updates y DÉJALO ESCRITO, con el porqué

SOBRE LAS CAPTURAS: no puedes generar capturas reales de un simulador desde aquí.
Deja el guion exacto —qué pantalla, con qué datos de demo, en qué tamaño y en qué
orden— en apps/mobile/assets/store/README.md, y la estructura de carpetas por
plataforma y tamaño lista para recibirlas. Di claramente en tu resumen final que
ese paso es manual y queda pendiente.

SOBRE LA PÁGINA /app: la política de privacidad completa es E10-05 y la está
redactando un despacho. Enlaza a /privacidad tal como está hoy y NO escribas
texto legal nuevo.

COOKIES (invariante de AGENTS.md): la página /app NO puede introducir analítica
ni ninguna cookie que no sea estrictamente técnica. Hoy no hay banner porque no
hace falta; si añadieras una, harían falta CMP y actualizar /cookies en el mismo
cambio. No la añadas.

POR CADA ESCENARIO:
  1. Impleméntalo tal como está escrito.
  2. Escribe el test del principal.
  3. Ejecuta, en la raíz: npm run lint && npx tsc --noEmit && npm run test:unit
     y, dentro de apps/mobile: npm run lint && npm run typecheck && npm test
  4. Commit con "E9-16 · ..." en el asunto.

NUNCA ejecutes la suite completa de Playwright.

PARA cuando termines o te bloquees.
```

---

# PUERTA · mezclar S1 antes de abrir la ola 1

Cuando S1 diga que ha terminado, la persona integradora hace esto y **nada más
hasta que pase**:

```bash
git checkout main && git pull origin main
git merge --no-ff lote2/S1-costura
npx prisma migrate deploy
npm run lint && npx tsc --noEmit && npm run test:unit
git push origin main
```

Y en cuanto esté publicada:

> ### 🚧 `prisma/schema.prisma` vuelve a estar CONGELADO
>
> Junto con `src/lib/rbac.ts`. **Ninguna de las siete pistas de la ola 1 los
> toca.** Si una dice que los necesita, para y decide: o se lo haces en un commit
> aparte sobre `main`, o se reordena su trabajo.

Pega en cada sesión de la ola 1, al abrirla, el resumen de una línea que dejó S1:
qué modelos nuevos hay y qué módulos vacíos esperan relleno. Se ahorran una
exploración cada una.

---

# OLA 1 · siete sesiones a la vez

---

### 🟥 A1 · E1-10 · Fuerza bruta en el login · Opus

> **Es el último bloqueador del Anexo II del DPA.** Cinco de las seis medidas
> técnicas están cerradas; esta no. Mientras no esté, el anexo no se puede firmar
> honestamente y hay **12 intentos fallidos consecutivos** procesándose contra
> emails que siguen el patrón predecible `rol.centro@org`.

```
Eres la pista A1 · E1-10 · Rate limiting y protección de fuerza bruta en el login
web y móvil.

LEE SOLO ESTO: docs/hu/E1.md, solo E1-10.
NO abras docs/HISTORIAS_USUARIO_2026-09-06.md.

TU RAMA:
  git checkout main && git pull origin main && git checkout -b lote2/A1-fuerza-bruta

FICHEROS QUE POSEES:
  src/lib/login-throttle.ts     (lo creas tú)
  src/app/login/actions.ts
  src/app/api/mobile/v1/auth/login/
  src/auth.ts, src/auth.config.ts

FICHEROS CONGELADOS: prisma/schema.prisma, src/lib/rbac.ts
(la tabla donde se cuentan los intentos YA existe: la dejó S1. No hagas otra
migración.)

LO QUE HAY HOY, verificado: lo único que aparece al buscar rate limiting en el
repositorio es el límite de la API de IA, que no tiene nada que ver. En el login
no hay bloqueo, ni retardo, ni captcha, ni en web ni en móvil.

LOS CINCO ESCENARIOS DE E1-10, EN ESTE ORDEN:
  1. intentos fallidos consecutivos por email → retardo progresivo al superar el
     umbral
  2. límite independiente por dirección IP, para el barrido de muchos emails
  3. el usuario legítimo entra sin fricción en cuanto pasa la ventana
  4. el mismo límite aplica a la solicitud de enlace de recuperación
  5. cada bloqueo deja entrada en AuditLog con email, IP y momento

EL DETALLE QUE MÁS IMPORTA, y está escrito en el escenario 1: **la respuesta no
revela si la cuenta existe**. Un mensaje distinto para "email desconocido" y para
"bloqueado" convierte tu propio límite en un enumerador de usuarios. Mismo cuerpo,
mismo código, mismo tiempo de respuesta.

EL FALLO QUE MÁS SE REPITE EN ESTE REPOSITORIO es el "espejo móvil": arreglar la
web y dejar la API móvil sin arreglar, o al revés. Los dos caminos entran por la
misma función de src/lib/login-throttle.ts. Si acabas con dos implementaciones,
está mal hecho aunque las dos funcionen.

AuditLog es de SOLO INSERCIÓN (trigger auditlog_append_only). No lo uses como
contador de intentos: para eso está la tabla que dejó S1.

POR CADA ESCENARIO:
  1. Impleméntalo tal como está escrito.
  2. Escribe el test del principal. Para el 1 y el 2, el test tiene que demostrar
     que el intento número N+1 se rechaza — el hallazgo original era exactamente
     que doce se procesaban.
  3. Ejecuta: npm run lint && npx tsc --noEmit && npm run test:unit
  4. Commit con "E1-10 · ..." en el asunto.

NUNCA ejecutes la suite completa de Playwright.

PARA cuando termines o te bloquees.
```

---

### 🟣 P1 · Stripe · cobro SEPA, mandato y morosidad · Opus

> **La pista más larga del lote y la única con las dos P0.** No la partas en dos
> sesiones: las cinco historias comparten `member-billing.ts` y partirla es
> garantizar el conflicto. Es el camino por donde entra y sale el dinero.

```
Eres la pista P1 · Stripe · cobro SEPA, mandato y morosidad.

Eres la pista más larga del lote y llevas las dos P0. Arranca la primera de la
ola 1 y no te preocupes por ir por detrás: es lo esperado.

LEE SOLO ESTO: docs/hu/E4.md, fases 2 y 3 (solo tus cinco historias).
NO abras docs/HISTORIAS_USUARIO_2026-09-06.md.

TU RAMA:
  git checkout main && git pull origin main && git checkout -b lote2/P1-cobro

FICHEROS QUE POSEES (solo tú los tocas, y member-billing.ts es TUYO — otras
pistas te pedirán cambios por escrito, no lo editarán):
  src/lib/member-billing.ts
  src/lib/sepa-prenotification.ts, src/lib/sepa-prenotification-job.ts
  src/lib/stripe-mandate.ts       (S1 lo dejó vacío, lo rellenas tú)
  src/lib/stripe-dunning.ts       (S1 lo dejó vacío, lo rellenas tú)
  src/lib/stripe-card-expiry.ts   (S1 lo dejó vacío, lo rellenas tú)
  src/app/gestionar-suscripcion/

FICHEROS CONGELADOS: prisma/schema.prisma, src/lib/rbac.ts
(mandato, estado de confirmación pendiente y periodo de gracia YA existen en el
esquema: los dejó S1. El despachador de webhook ya llama a tus tres módulos.)

TUS 5 HISTORIAS, EN ESTE ORDEN:
  HU-ST-12, HU-ST-18, HU-ST-19, HU-ST-16, HU-ST-22

POR QUÉ ESE ORDEN: HU-ST-12 y HU-ST-18 son las dos P0 y las dos están ya a medias
—sepa_debit está habilitado en el checkout, y el mapeo past_due/incomplete/paused
→ FROZEN y canceled/unpaid → CANCELLED ya está escrito—. HU-ST-19 remata el 18:
sin pantalla de recuperación, el corte de acceso es un callejón sin salida. El 16
y el 22 son avisos y van después de que el motor funcione.

QUÉ FALTA EXACTAMENTE, verificado en el código el 8 de septiembre:
  - HU-ST-12: sepa_debit YA está en payment_method_types de member-billing.ts.
    Falta TODA la asincronía: la gestión del mandato, que un cobro asíncrono NO
    abra acceso hasta liquidar (regla RB-PAGO-025), y la devolución bancaria
    posterior (R-transaction) que devuelve el Payment a FAILED/REFUNDED.
  - HU-ST-16: el preaviso SEPA existe (sepa-prenotification.ts y su job) porque
    lo trajo E10-13. Falta engancharlo a invoice.upcoming, el envío una sola vez
    por factura con la marca en AuditLog —el patrón es sendDunningNoticeOnce— y
    los dos plazos del esquema SEPA Core: 14 días naturales de preaviso y la
    mención de las 8 semanas de devolución.
  - HU-ST-18: falta el corte de acceso. Member.state = DELINQUENT hoy NO corta
    nada, porque el motor de reservas filtra por Subscription.status === "ACTIVE",
    no por Member.state. Ese es el arreglo.

DECISIONES DE NEGOCIO YA TOMADAS, no las reabras (están en docs/hu/E4.md):
  gracia de morosidad 7 días configurable entre 0 y 60 (D-S5) · al agotar los
  reintentos, cancel, y el Dashboard de Stripe se fija a "cancel" para que los
  dos lados coincidan (D-S6) · un socio PAUSED voluntariamente NO es moroso ·
  el preaviso es correo de servicio y se envía aunque el socio haya desactivado
  los avisos comerciales.

INVARIANTES QUE TE TOCAN (AGENTS.md):
  - La ventana de cancelación es la del centro, leída del servidor. CERO literales
    de horas o de días de gracia en el cliente. Usa graceWindowFor(orgId), que
    dejó S1.
  - Ningún Price se borra: se archiva.
  - Toda creación en Stripe lleva clave de idempotencia. Ya existe
    src/lib/stripe-idempotency.ts: úsalo, no escribas otro.
  - Ningún movimiento de sessionsRemaining sin SessionLedger. Cortar acceso por
    morosidad NO consume ni devuelve saldo.

SI OTRA PISTA TE PIDE UN CAMBIO en member-billing.ts, llegará como un fichero
docs/hu/<PISTA>-peticion-member-billing.md. Aplícalo tal como está escrito, en un
commit propio, y sigue con lo tuyo.

POR CADA HISTORIA:
  1. Implementa TODOS los escenarios Gherkin tal como están escritos.
  2. Escribe el test del escenario principal.
  3. Ejecuta: npm run lint && npx tsc --noEmit && npm run test:unit
  4. Commit con el ID en el asunto. Ejemplo:
     "HU-ST-12 · un cobro SEPA asíncrono no abre acceso hasta liquidar"
  5. Sigue con la siguiente SIN pedirme confirmación.

NUNCA ejecutes la suite completa de Playwright: muta la base de datos de demo y
contamina a las otras seis sesiones que trabajan a la vez.

PARA al terminar CADA HISTORIA y dime en una línea dónde estás. Eres el camino
crítico y quiero saber el ritmo.
```

---

### 🟠 P2 · Stripe · el dinero que vuelve · Opus

> Hoy una "devolución" es **marcar `REFUNDED` en local**, y encima se bloquea si
> el pago vino de Stripe: `Payment.stripeRefundId` sigue siendo NULL siempre. De
> disputas y contracargos no hay ni un fichero.

```
Eres la pista P2 · Stripe · reembolsos, notas de crédito y disputas.

LEE SOLO ESTO: docs/hu/E4.md, solo HU-ST-20 y HU-ST-21.
NO abras docs/HISTORIAS_USUARIO_2026-09-06.md.

TU RAMA:
  git checkout main && git pull origin main && git checkout -b lote2/P2-devoluciones

FICHEROS QUE POSEES:
  src/lib/stripe-refunds.ts    (S1 lo dejó vacío, lo rellenas tú)
  src/lib/stripe-disputes.ts   (S1 lo dejó vacío, lo rellenas tú)
  src/app/(app)/billing/reembolsos/   (la creas tú)
  src/app/(app)/billing/disputas/     (la creas tú)

FICHEROS CONGELADOS: prisma/schema.prisma, src/lib/rbac.ts
FICHEROS DE OTRAS PISTAS:
  src/lib/member-billing.ts es de P1. El despachador de webhook ya llama a tus
  dos módulos con charge.refunded, credit_note.* y charge.dispute.*: no hace
  falta que toques la ruta del webhook.

TUS 2 HISTORIAS, EN ESTE ORDEN:
  HU-ST-20, HU-ST-21

POR QUÉ ESE ORDEN: HU-ST-21 refleja el resultado de la disputa sobre el Payment,
y ese camino lo abre HU-ST-20.

LOS DOS ESCENARIOS QUE DECIDEN SI ESTÁ BIEN HECHA:
  - "doble clic": no se emiten dos refunds. Misma clave de idempotencia. Usa
    src/lib/stripe-idempotency.ts, que ya existe.
  - "permisos": solo dirección emite un reembolso, y queda en AuditLog con autor
    y motivo. El motivo es OBLIGATORIO, no un campo opcional que nadie rellena.

Y el que más se olvida: "pago en efectivo" sigue el flujo local actual, SIN
llamar a Stripe. Para eso S1 dejó assertRefundable(payment): úsalo, no escribas
tu propia comprobación.

DECISIÓN DE NEGOCIO YA TOMADA (D-S7): reembolsos y disputas se gestionan DESDE
APTA. En esta fase, aportar evidencia de una disputa ENLAZA al Dashboard de
Stripe; Apta no se encarga de la subida. No amplíes eso por tu cuenta.

INVARIANTES QUE TE TOCAN (AGENTS.md):
  - Toda creación en Stripe con clave de idempotencia.
  - Ningún Price se borra.
  - AuditLog en cada reembolso, con autor y motivo. Es de solo inserción.
  - Ámbito de centro en toda lectura y escritura de las dos pantallas nuevas:
    requireApiCenterScope / isCenterInScope. Un reembolso de otro centro no se ve
    ni se emite.

SI NECESITAS UN CAMBIO EN member-billing.ts (por ejemplo, para que la
conciliación marque el Payment como REFUNDED), NO LO EDITES: escribe
docs/hu/P2-peticion-member-billing.md con el cambio exacto, listo para aplicar
mecánicamente, y pídelo en la ventana de merge. El patrón está en
docs/hu/T7-peticion-dashboard-queries.md.

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

### 🔵 P3 · Stripe · consola de lectura para dirección · Sonnet 5

> No existe `src/app/(app)/stripe/`: todo `docs/STRIPE_API_SECCION_IMPLEMENTACION.md`
> está sin construir. Es la pista más aislada del lote — crea una carpeta nueva y
> **solo lee**.

```
Eres la pista P3 · HU-ST-24 · Consola de lectura de Stripe para dirección.

LEE SOLO ESTO:
- docs/hu/E4.md, solo HU-ST-24
- docs/STRIPE_API_SECCION_IMPLEMENTACION.md
NO abras docs/HISTORIAS_USUARIO_2026-09-06.md.

TU RAMA:
  git checkout main && git pull origin main && git checkout -b lote2/P3-consola

FICHEROS QUE POSEES:
  src/app/(app)/stripe/        (la creas tú, entera)
  src/lib/stripe-console.ts    (lo creas tú)

FICHEROS CONGELADOS: prisma/schema.prisma, src/lib/rbac.ts
FICHEROS DE OTRAS PISTAS: no tocas ninguno. Eres solo lectura contra la API de
Stripe. Si te descubres escribiendo en la base de datos, te has salido del
alcance de la historia.

USA stripeReadClient(orgId), que dejó S1: cliente de solo lectura contra la
cuenta conectada. No construyas otro.

LOS CUATRO ESCENARIOS DE HU-ST-24, EN ESTE ORDEN:
  1. acceso — /stripe solo para OWNER, y CADA APERTURA queda en AuditLog
  2. entorno — distintivo TEST o LIVE según el prefijo de la clave
  3. listados — cobros, suscripciones, clientes y payouts, con paginación POR
     CURSOR (no por offset: la API de Stripe es de cursor)
  4. error de Stripe — la tarjeta afectada degrada con su mensaje y el resto de
     la pantalla sigue en pie

EL 4 ES EL QUE DECIDE SI ESTÁ BIEN HECHA. Cuatro listados contra una API externa
son cuatro formas de tumbar la pantalla. Cada tarjeta falla sola.

GATEO POR PLAN (invariante de AGENTS.md): /stripe es una ruta nueva y
FEATURE_BY_ROUTE es declarativo y se hereda a las rutas hijas. **Declara su gate
y escribe el test que lo comprueba.** Una ruta nueva sin gate declarado tiene que
fallar en test, no en producción.

SIN STRIPE CONECTADO: la sección explica que hace falta conectar cobros. Sin
botón muerto, sin pantalla en blanco, sin error.

POR CADA ESCENARIO:
  1. Impleméntalo tal como está escrito.
  2. Escribe su test.
  3. Ejecuta: npm run lint && npx tsc --noEmit && npm run test:unit
  4. Commit con "HU-ST-24 · ..." en el asunto.

NUNCA ejecutes la suite completa de Playwright.

PARA cuando termines o te bloquees.
```

---

### 🟡 P4 · Stripe · neto real, payouts y contabilidad · Sonnet 5

> El cuadre es el escenario que hace útil todo lo demás: **la suma de los netos
> de un periodo tiene que coincidir con la suma de los payouts liquidados.** Si
> no cuadra, la gestoría no lo usa.

```
Eres la pista P4 · Stripe · neto real, payouts, exportación contable e informes.

LEE SOLO ESTO: docs/hu/E4.md, solo HU-ST-23, HU-ST-25 y HU-ST-26.
NO abras docs/HISTORIAS_USUARIO_2026-09-06.md.

TU RAMA:
  git checkout main && git pull origin main && git checkout -b lote2/P4-contable

FICHEROS QUE POSEES:
  src/lib/stripe-balance.ts    (S1 lo dejó vacío, lo rellenas tú)
  src/lib/stripe-export.ts     (lo creas tú)
  src/lib/stripe-reports.ts    (lo creas tú)
  src/app/(app)/billing/contabilidad/   (la creas tú)

FICHEROS CONGELADOS: prisma/schema.prisma, src/lib/rbac.ts
(bruto, comisión, neto y el payout con su arrival_date YA existen en el esquema:
los dejó S1, y el despachador de webhook ya te llama con payout.paid y
payout.failed.)

TUS 3 HISTORIAS, EN ESTE ORDEN:
  HU-ST-23, HU-ST-25, HU-ST-26

POR QUÉ ESE ORDEN: sin el desglose de HU-ST-23 no hay nada que exportar, y sin la
exportación de HU-ST-25 el informe de HU-ST-26 no tiene con qué contrastarse.

HU-ST-23 · EL PUNTO DE ENGANCHE YA ESTÁ PUESTO. S1 dejó en la conciliación de
member-billing.ts una llamada a recordBalanceBreakdown(paymentId, charge) que hoy
no hace nada. Rellénala en TU módulo, src/lib/stripe-balance.ts. NO edites
member-billing.ts: es de P1.

HU-ST-25 · TRES COSAS QUE SE OLVIDAN Y ESTÁN EN LOS ESCENARIOS:
  - Formato español: punto y coma y BOM. El patrón ya probado está en
    export-ranking-button; cópialo, no inventes otro.
  - Las devoluciones aparecen EN NEGATIVO, con su motivo.
  - El fichero DECLARA, en su propia cabecera, que no es una serie de
    facturación: Apta factura solo su licencia al centro, y el centro factura al
    socio con su propio software (decisión D-S8). Esa frase no es decorativa: es
    lo que evita que la gestoría lo trate como libro registro de IVA.

HU-ST-26 · sin Stripe conectado, la sección explica que hace falta conectar
cobros. Sin botón muerto.

USA stripeReadClient(orgId), que dejó S1.

INVARIANTES QUE TE TOCAN (AGENTS.md):
  - Ámbito de centro en toda lectura: un CSV no puede llevarse los cobros de otro
    centro. isCenterInScope, sin excepciones.
  - La ruta nueva /billing/contabilidad necesita su gate declarado en
    FEATURE_BY_ROUTE, con test.
  - AuditLog en cada exportación: quién se llevó qué periodo y cuándo.

SI NECESITAS UN CAMBIO EN member-billing.ts, NO LO EDITES: escribe
docs/hu/P4-peticion-member-billing.md con el cambio exacto y pídelo en la ventana
de merge. El patrón está en docs/hu/T7-peticion-dashboard-queries.md.

POR CADA HISTORIA:
  1. Implementa TODOS los escenarios Gherkin.
  2. Escribe el test del escenario principal. Para el cuadre de HU-ST-25, el test
     tiene que sumar de verdad y comparar, no comprobar que la columna existe.
  3. Ejecuta: npm run lint && npx tsc --noEmit && npm run test:unit
  4. Commit con el ID en el asunto.
  5. Sigue sin pedirme confirmación.

NUNCA ejecutes la suite completa de Playwright.

PARA cuando termines o te bloquees.
```

---

### 🟤 P5 · Stripe · cupones y comisión de plataforma · Sonnet 5

> La más corta de las de Stripe, y la que cierra un argumento comercial:
> **«cero comisión sobre tus cobros» se tiene que poder afirmar sin matices.**

```
Eres la pista P5 · Stripe · cupones, códigos promocionales y comisión de plataforma.

LEE SOLO ESTO: docs/hu/E4.md, solo HU-ST-27 y HU-ST-28. Y, para el argumento
comercial de HU-ST-28, docs/hu/E6.md, solo E6-05.
NO abras docs/HISTORIAS_USUARIO_2026-09-06.md.

TU RAMA:
  git checkout main && git pull origin main && git checkout -b lote2/P5-cupones

FICHEROS QUE POSEES:
  src/lib/stripe-coupons.ts       (lo creas tú)
  src/app/(app)/billing/cupones/  (la creas tú)

FICHEROS CONGELADOS: prisma/schema.prisma, src/lib/rbac.ts
(el cupón espejado y el descuento aplicado en Payment YA existen en el esquema:
los dejó S1.)

TUS 2 HISTORIAS, EN ESTE ORDEN:
  HU-ST-27, HU-ST-28

HU-ST-27 · los tres escenarios: alta del cupón en la cuenta conectada con espejo
en Apta, uso en el checkout con el descuento registrado en el Payment, y medición
—cuántas ventas y cuánto importe ha traído cada código—.

EL DESCUENTO EN EL CHECKOUT TE OBLIGA A TOCAR member-billing.ts, QUE ES DE P1.
No lo edites. Escribe docs/hu/P5-peticion-member-billing.md con el cambio exacto
—habilitar los códigos promocionales en la sesión de checkout y capturar el
descuento aplicado al conciliar— listo para aplicar mecánicamente, y pídelo en la
ventana de merge. El patrón está en docs/hu/T7-peticion-dashboard-queries.md.
Mientras tanto, construye el alta y la medición, que no dependen de eso.

HU-ST-28 NO ES CÓDIGO, Y ESO ES LO QUE PIDE LA HISTORIA. Por defecto NO se envía
application_fee_amount: Apta no toca el dinero del gimnasio. Tu trabajo son tres
cosas:
  1. Un test que DEMUESTRE que hoy no se envía application_fee_amount en ninguna
     creación de checkout. Es la afirmación comercial, comprobada por CI.
  2. Documentar dónde se insertaría si algún día se activa, y qué implicaciones
     fiscales tendría.
  3. Dejarlo escrito de forma que E6-05 pueda afirmar "cero comisión sobre tus
     cobros" sin matices.
NO la actives. NO dejes una bandera de configuración que la active. La historia
dice "documentada, NO activada" y eso es literal.

INVARIANTES QUE TE TOCAN (AGENTS.md):
  - Ningún Price se borra jamás: se archiva. Un cupón retirado se archiva igual.
  - Toda creación en Stripe con clave de idempotencia (src/lib/stripe-idempotency.ts).
  - Ámbito de centro en la pantalla de cupones y en la medición.
  - /billing/cupones es ruta nueva: gate declarado en FEATURE_BY_ROUTE, con test.

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

### 🟢 D1 · E5-15 · Borrado de cuenta · Sonnet 5

> **Sin esta no hay publicación.** Apple la exige dentro de la app para cualquier
> app que permita crear cuenta (Guideline 5.1.1(v)) y Google la pide con su
> propio formulario. Va antes que las otras dos del backlog aunque parezca la
> menos vistosa.

```
Eres la pista D1 · E5-15 · Borrado de cuenta desde la app y desde el portal.

LEE SOLO ESTO:
- docs/hu/E5.md, solo E5-15
- docs/hu/E10.md, solo E10-09 (la disociación de cobros que tu texto tiene que
  describir con exactitud)
NO abras docs/HISTORIAS_USUARIO_2026-09-06.md.

TU RAMA:
  git checkout main && git pull origin main && git checkout -b lote2/D1-borrado

FICHEROS QUE POSEES:
  src/app/(app)/portal/perfil/
  src/lib/account-deletion.ts   (lo creas tú)
  apps/mobile/src/app/(tabs)/perfil.tsx

FICHEROS CONGELADOS: prisma/schema.prisma, src/lib/rbac.ts
(la solicitud de borrado con su plazo y su resolución YA existe en el esquema: la
dejó S1.)

AVISO DE COORDINACIÓN: la pista D3 (E10-19, enlaces legales en la app) también
necesita apps/mobile/src/app/(tabs)/perfil.tsx. Va DESPUÉS de ti, a propósito. Deja
la pantalla ordenada para que quepan sus enlaces sin rehacerla.

LOS SEIS ESCENARIOS DE E5-15, EN ESTE ORDEN:
  1. solicitud desde la app — desde Perfil, explicando qué se borra, qué se
     conserva y por cuánto tiempo, con confirmación por contraseña
  2. solicitud desde el portal web — la misma ruta, sin necesidad de la app
  3. plazo — máximo un mes (art. 12.3 RGPD), con acuse al socio
  4. obligaciones de conservación — los cobros se DISOCIAN, no se borran, y el
     texto que ve el socio dice exactamente eso
  5. URL web pública accesible desde la ficha de tienda
  6. trazabilidad — solicitud y resolución en AuditLog

SE RESUELVE COMO SOLICITUD VERIFICADA AL CENTRO, no como borrado inmediato. Está
permitido por la historia y es lo correcto: hay cobros que no se pueden borrar.
Lo que NO está permitido es que el socio no sepa en qué estado está su solicitud.

EL ESCENARIO 4 ES EL QUE TE PUEDE SALIR MAL SIN QUE SE NOTE: el texto que ve el
socio tiene que decir la verdad sobre qué se conserva y con qué base legal. No lo
redactes de memoria — sale de E10-09 y de docs/legal/03-PLAZOS-CONSERVACION.md.
Si el plazo que necesitas está marcado ⟦PENDIENTE⟧ en ese documento, DÉJALO
MARCADO en la interfaz y dímelo; no inventes un número.

EL ESCENARIO 5 CRUZA CON D2 (E9-16), que es quien construye la página /app. Tú
pones la página de solicitud y su URL estable; D2 la enlaza desde la ficha. No
toques src/app/app/.

INVARIANTES QUE TE TOCAN (AGENTS.md):
  - Ámbito de centro en la solicitud y en su resolución.
  - Datos de salud: cualquier acceso pasa por health-access.ts y deja AuditLog.
    Un rol sin autorización recibe null, nunca un error que revele si el dato
    existe. Esto vale también para la pantalla que enumera qué se va a borrar.
  - La app y la web comparten origen de rótulos y permisos. No copies una tabla
    "como espejo": ese duplicado ya provocó un fallo documentado.

POR CADA ESCENARIO:
  1. Impleméntalo tal como está escrito.
  2. Escribe su test.
  3. Ejecuta, en la raíz: npm run lint && npx tsc --noEmit && npm run test:unit
     y, dentro de apps/mobile: npm run lint && npm run typecheck && npm test
  4. Commit con "E5-15 · ..." en el asunto.

NUNCA ejecutes la suite completa de Playwright.

PARA cuando termines o te bloquees.
```

---

# BLOQUEADAS · no se abren hasta que el bloqueo se levante

---

### ⚫ L1 · Cumplimiento · la mitad de código · Opus

> **El calendario lo marca el despacho, entre dos y cuatro semanas, y no se
> acorta poniendo más sesiones.** Lo que sí se puede hacer antes es la
> estructura; el texto llega después.

**Antes de abrir esta sesión, comprueba dos cosas:**

1. `docs/legal/00-CUESTIONARIO-DIRECCION.md` ya no tiene huecos `⟦PENDIENTE⟧`
   (eran 18 el 8 de septiembre).
2. El despacho ha devuelto los borradores de `docs/legal/`.

**Si solo se cumple la primera**, puedes abrirla igualmente en modo estructura:
hay una variante del prompt más abajo. Es una decisión del integrador, no de la
sesión — y hay que tomarla a sabiendas de que el texto definitivo puede obligar a
retocar lo montado.

```
Eres la pista L1 · Cumplimiento normativo · la mitad de código.

LEE SOLO ESTO:
- docs/hu/E10.md, solo E10-04, E10-05, E10-06, E10-10 y E10-15
- docs/hu/E13.md, solo E13-03
- docs/legal/, los borradores devueltos por el despacho
NO abras docs/HISTORIAS_USUARIO_2026-09-06.md.

TU RAMA:
  git checkout main && git pull origin main && git checkout -b lote2/L1-cumplimiento

FICHEROS QUE POSEES:
  src/app/privacidad/
  src/app/condiciones/       (la creas tú)
  src/lib/legal-docs.ts      (lo creas tú: versionado y vigencia de los textos)
  src/app/hazte-socio/
  src/lib/provisioning.ts

FICHEROS CONGELADOS: prisma/schema.prisma, src/lib/rbac.ts

TUS 6 HISTORIAS, EN ESTE ORDEN:
  E10-05, E10-06, E10-04, E10-15, E13-03, E10-10

POR QUÉ ESE ORDEN: E10-05 (la política de privacidad) es lo que todo lo demás
enlaza. E10-06 es lo que más riesgo práctico quita. E10-04 toca el checkout de
licencia y el provisioning, que es lo más delicado. E10-15 y E13-03 son
documentales con muy poca superficie de código. E10-10 es enteramente documental
y va la última.

QUÉ ES TU TRABAJO Y QUÉ NO: el texto legal lo firma un despacho y ya está en
docs/legal/. TÚ NO REDACTAS TEXTO LEGAL. Tu trabajo es la mitad de código:
  - E10-05 · la página /privacidad sirve el texto firmado, VERSIONADO y con fecha,
    y los cambios materiales se comunican. Los nueve bloques del art. 13 salen del
    documento, no de tu memoria.
  - E10-06 · la página de contratación muestra precio total CON IMPUESTOS,
    duración, renovación automática, derecho de desistimiento de 14 días con el
    formulario del Anexo A, casilla de condiciones NO premarcada, y el botón deja
    de decir "Contratar" para decir lo que exige el art. 98.2. Más la confirmación
    en soporte duradero y el pie legal del art. 10 LSSI en /planes.
  - E10-04 · el Checkout de licencia recoge consent_collection.terms_of_service,
    la aceptación queda registrada con versión, fecha y quién, existe la lista
    pública de subencargados, y una organización SIN aceptación NO queda
    operativa. Ojo: hoy la organización nace del webhook de pago sin que nadie
    acepte nada. Y hay un flujo de re-aceptación para los centros existentes.
  - E10-15 y E13-03 · entrega y firma del documento antes de que se use el
    sistema, más la trazabilidad de esa entrega.
  - E10-10 · registro de actividades, EIPD, DPD y procedimiento de brechas. Es
    documental; tu parte es que los datos de contacto del DPD aparezcan en la
    política y que el registro interno de incidentes exista como tal.

SI UN DATO QUE NECESITAS SIGUE MARCADO ⟦PENDIENTE⟧ en docs/legal/: DÉJALO
MARCADO, visible, y anótalo. No inventes un NIF, un domicilio, un plazo ni un
nombre de DPD. Un dato inventado en una política de privacidad es peor que un
hueco.

INVARIANTES QUE TE TOCAN (AGENTS.md):
  - COOKIES. Hoy solo hay técnicas (sesión de Auth.js y `tz`), inventariadas en
    /cookies, y por eso NO hay banner. Si tu trabajo introduce cualquier cookie
    que no sea estrictamente técnica, el MISMO cambio tiene que traer un CMP con
    "rechazar todo" al mismo nivel visual que "aceptar todo", y actualizar el
    inventario de /cookies. Lo más probable y lo más sano es que no introduzcas
    ninguna: no lo hagas.
  - Toda creación en Stripe con clave de idempotencia; ningún Price se borra.
  - Fuente única de rótulos entre web y app.

POR CADA HISTORIA:
  1. Implementa TODOS los escenarios Gherkin.
  2. Escribe el test del escenario principal.
  3. Ejecuta: npm run lint && npx tsc --noEmit && npm run test:unit
  4. Commit con el ID en el asunto.
  5. Sigue sin pedirme confirmación.

NUNCA ejecutes la suite completa de Playwright.

PARA cuando termines, te bloquees, o te falte un dato que solo el despacho o
dirección pueden dar.
```

#### Variante · L1 en modo estructura, antes de que el despacho conteste

Pega esto **en lugar de** las secciones "TUS 6 HISTORIAS" y "QUÉ ES TU TRABAJO":

```
NO HAY TEXTO FIRMADO TODAVÍA. Trabajas solo la estructura, y todo texto legal
queda como un marcador visible ⟦PENDIENTE: <qué falta>⟧ que se sustituirá cuando
llegue.

TU TRABAJO, EN ESTE ORDEN:
  1. src/lib/legal-docs.ts — el mecanismo: un documento legal tiene identificador,
     versión, fecha de vigencia y contenido; se puede consultar cuál estaba vigente
     en un momento dado; y sustituir el contenido NO requiere tocar componentes.
     Es lo que hará que el texto del despacho entre en un solo commit.
  2. El registro de aceptaciones: quién aceptó qué versión y cuándo. Sirve a
     E10-04, E10-06 y E10-15 a la vez.
  3. Las estructuras de página —/privacidad, /condiciones, el bloque
     precontractual de /hazte-socio, el pie legal de /planes— consumiendo (1),
     con marcadores en lugar de texto.
  4. Lo que NO depende de ninguna firma y ya se puede cerrar del todo:
     - la casilla de condiciones no premarcada
     - el botón del art. 98.2 con etiqueta inequívoca de obligación de pago
     - el precio mostrado CON impuestos
     - que una organización sin aceptación registrada NO quede operativa
     - la confirmación en soporte duradero

NO redactes ni un párrafo de texto legal, ni siquiera "provisional". Un texto
provisional que se publica es un texto publicado.

Cuando termines, dime qué marcadores ⟦PENDIENTE⟧ has dejado y en qué fichero, en
una lista, para pasársela al despacho.
```

---

### 🔷 D3 · E10-19 · Legales y consentimientos en la app · Sonnet 5

> **Depende de dos cosas**: de L1 —no se pueden enlazar textos que no existen— y
> de D1, porque las dos escriben en `perfil.tsx`. Ábrela cuando las dos estén
> mezcladas. Es la más corta del lote: 0,8 días, y la lógica ya existe.

```
Eres la pista D3 · E10-19 · Enlaces legales y gestión de consentimientos dentro
de la app.

Arrancas cuando L1 y D1 están mezcladas en main. Si no lo están, PARA y dímelo.

LEE SOLO ESTO:
- docs/hu/E10.md, solo E10-19 (y E10-03 para entender por qué la declaración de
  salud se muestra pero NO se revoca)
NO abras docs/HISTORIAS_USUARIO_2026-09-06.md.

TU RAMA:
  git checkout main && git pull origin main && git checkout -b lote2/D3-legales-app

FICHEROS QUE POSEES:
  apps/mobile/src/app/(tabs)/perfil.tsx   (D1 ya lo dejó ordenado)
  apps/mobile/src/app/legal/              (la creas tú)

FICHEROS CONGELADOS: prisma/schema.prisma, src/lib/rbac.ts

ESTO ES CABLEAR INTERFAZ, NO ESCRIBIR LÓGICA. La API y la lógica ya existen:
updateMyConsentAction hace el trabajo. Si te descubres escribiendo reglas de
consentimiento, te has salido del alcance.

LOS CUATRO ESCENARIOS DE E10-19, EN ESTE ORDEN:
  1. enlaces legales — Perfil enlaza a política de privacidad y a condiciones
  2. gestión de consentimientos — el socio ve y cambia IA, imágenes y marketing
     desde la app; la declaración de salud se MUESTRA como informativa y NO es
     revocable (eso es E10-03, ya cerrada)
  3. capa informativa en evolución — la pantalla de evolución explica qué dato es
     y con qué base se trata. Hoy pinta composición corporal y fotos de progreso
     sin ninguna capa informativa: comprueba consentHealth/consentImages para
     decidir qué pinta, que es correcto, pero no informa.
  4. paridad — cambiar un consentimiento en la app tiene EXACTAMENTE el mismo
     efecto que en la web, con la misma auditoría

EL ESCENARIO 4 ES EL QUE DECIDE SI ESTÁ BIEN HECHA, y es donde este repositorio
falla una y otra vez: la app llama a la misma acción que la web, no a una copia
"espejo". AGENTS.md lo dice con nombre y apellidos — ese duplicado ya provocó un
fallo documentado.

INVARIANTES QUE TE TOCAN (AGENTS.md):
  - Datos de salud: todo acceso por health-access.ts, con AuditLog. Un rol sin
    autorización recibe null, nunca un error que revele si el dato existe.
  - Fuente única de rótulos y permisos, compartida entre web y app.

POR CADA ESCENARIO:
  1. Impleméntalo tal como está escrito.
  2. Escribe su test.
  3. Ejecuta, dentro de apps/mobile:
     npm run lint && npm run typecheck && npm test
  4. Commit con "E10-19 · ..." en el asunto.

PARA cuando termines o te bloquees.
```

---

# Prompts auxiliares · los cuatro de todos los días

Idénticos a los del lote anterior. Se pegan tal cual.

### Antes de cada ventana de merge · en cada sesión

```
Prepárate para la ventana de merge:
  git add -A && git commit -m "wip" (si te queda algo sin commitear)
  git fetch origin main
  git merge origin/main
Resuelve los conflictos que salgan SOLO en tus ficheros.
Luego ejecuta npm run lint && npx tsc --noEmit && npm run test:unit
y dime si estás listo para mezclar.
```

### En la ventana · la persona integradora

De la pista que más dependencias produce a la que menos:

```bash
git checkout main && git pull origin main

for RAMA in P1-cobro P2-devoluciones P4-contable P5-cupones P3-consola \
            A1-fuerza-bruta A2-historial D1-borrado D2-ficha C1-ci; do
  echo "──────── mezclando $RAMA ────────"
  git merge --no-ff lote2/$RAMA || { echo "⛔ CONFLICTO en $RAMA — para aquí"; break; }
done

npm run lint && npx tsc --noEmit && npm run test:unit
git push origin main
```

**Nunca `rebase`.** Hay siete u ocho checkouts vivos y un rebase les rompe el
suyo. Siempre `merge`.

Y una vez al día, en la ventana de las 19:00 y solo ahí, la suite completa:

```bash
npx playwright test
```

A partir de que C1 esté mezclada, comprueba además que el job `e2e-pago` sale en
verde en CI: es la red que hoy no existe.

### Una sesión atascada

```
Resume en 3 líneas qué has hecho y qué te bloquea. No sigas hasta que te conteste.
```

### Corte de alcance

```
Corte de alcance. Termina SOLO la historia que tengas a medias, haz commit y para.
No empieces ninguna más.
Dime: qué historias has terminado (con sus IDs), cuál has dejado a medias, y
cuáles no has empezado.
```

---

# Chuleta de un vistazo

| Pista | HU | Esf. | Modelo | Depende de |
|---|---|---|---|---|
| **C1** · Red de CI | — | 0,5 d | Sonnet 5 | nada |
| **S1** · Costura del lote | — | 1,5 d | Opus | nada · **es la puerta** |
| **A2** · Historial web | E5-09 | 2,5 d | Sonnet 5 | nada |
| **D2** · Ficha de tienda | E9-16 | 2,5 d | Sonnet 5 | los identificadores decididos |
| **A1** · Fuerza bruta | E1-10 | 2,5 d | Opus | S1 |
| **P1** · Cobro y morosidad | HU-ST-12, 16, 18, 19, 22 | 10,9 d | Opus | S1 |
| **P2** · Dinero que vuelve | HU-ST-20, 21 | 8,5 d | Opus | S1 |
| **P3** · Consola de dirección | HU-ST-24 | 6,0 d | Sonnet 5 | S1 |
| **P4** · Neto y contable | HU-ST-23, 25, 26 | 5,8 d | Sonnet 5 | S1 |
| **P5** · Cupones y comisión | HU-ST-27, 28 | 3,3 d | Sonnet 5 | S1 |
| **D1** · Borrado de cuenta | E5-15 | 2,5 d | Sonnet 5 | S1 |
| **L1** · Cumplimiento | E10-04, 05, 06, 10, 15 · E13-03 | 9,5 d | Opus | **el despacho** |
| **D3** · Legales en la app | E10-19 | 0,8 d | Sonnet 5 | L1 y D1 |

### Reparto verificado

**24 historias, 0 duplicadas, 0 sin asignar.** 54,8 días-persona, que son
exactamente los del corte del 8 de septiembre.

| Grupo del corte | HU | Días | Dónde van |
|---|---|---|---|
| Huecos no previstos | 2 | 5,0 | A1, A2 |
| Stripe fases 2-4 | 13 | 34,5 | P1, P2, P3, P4, P5 |
| Bloqueadas por el despacho | 6 | 9,5 | L1 |
| Backlog de publicación | 3 | 5,8 | D1, D2, D3 |
| **Total** | **24** | **54,8** | **11 pistas** |

Más el punto ciego de CI, que no es una historia y va en C1.

### Prioridades

5 P0 · 10 P1 · 7 P2 · 2 P3. Las cinco P0 están repartidas así: **HU-ST-12 y
HU-ST-18 en P1**, y **E10-04, E10-05 y E10-06 en L1**, que es la que no depende
de nosotros.

### Las cuatro reglas que no se rompen

1. **Cada pista toca solo sus ficheros.** Si necesitas uno ajeno, lo pides por
   escrito en `docs/hu/<PISTA>-peticion-<fichero>.md`.
2. **`rbac.ts` está congelado siempre.** `schema.prisma`, solo durante S1.
3. **Nadie ejecuta la suite completa de Playwright** salvo el integrador, una vez
   al día, a las 19:00.
4. **Ningún dato legal inventado.** Si falta, se deja `⟦PENDIENTE⟧` visible y se
   avisa.
