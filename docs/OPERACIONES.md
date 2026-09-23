# Operaciones

Entornos, configuración, trabajos programados, pruebas y despliegue.

---

## 1. Puesta en marcha

```bash
createdb trainingzone          # o cualquier Postgres accesible
cp .env.example .env           # y ajustar DATABASE_URL
npm install
npx prisma migrate dev
npm run db:seed
npm run dev                    # http://localhost:3000 → redirige a /login
```

Para la app nativa, `apps/mobile/README.md`.

### Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` / `build` / `start` | Ciclo de Next |
| `npm run lint` | ESLint 9 |
| `npm run db:migrate` / `db:seed` / `db:studio` | Prisma |
| `npm run test:unit` | Pruebas unitarias (`node:test` sobre `tsx`) |
| `npm run test:unit:coverage` | Lo mismo, midiendo cobertura |
| `npm run test:e2e` | Playwright |
| `npm run migrate:fotos` | Migración de fotos de progreso al almacén cifrado |
| `npm run export:fichajes` | Exportación de fichajes (módulo aparcado) |
| `npm run bootstrap:plataforma` | Organización de plataforma y su primer `PLATFORM_ADMIN` en una base limpia, sin seed (§7.3) |

Otros scripts puntuales en `scripts/`: `limpiar-tareas.ts`,
`simular-flujos.ts`.

---

## 2. Configuración

**`.env.example` es la documentación de las variables**: cada una lleva escrito
su porqué, su valor por defecto y qué pasa si falta. No se duplica aquí. Lo que
sí conviene tener presente son las cuatro que **cambian el comportamiento de
arranque**:

| Variable | Si falta o no cuadra |
|---|---|
| `DATA_REGION` | Debe coincidir con `DECLARED_DATA_REGION` y estar en el EEE. Si no, **el servidor no arranca** |
| `PROGRESS_PHOTO_KEY` | Sin ella no hay dónde cifrar las fotos de composición. Perderla es perder las fotos; filtrarla equivale a publicarlas |
| `JOBS_CRON_SECRET` | Sin secreto configurado, `/api/jobs/run` **no se atiende**. Falla cerrado: antes se abría a cualquiera si la variable faltaba |
| `DATA_RETENTION_DATABASE_URL` | Sin ella, la purga del log de auditoría y la de organizaciones sin pagar **no se ejecutan**, y lo dicen en la respuesta del cron en vez de fallar en silencio |

Degradan de forma controlada, sin romper: las claves de Stripe (modo demo), el
SMTP, la analítica (`NEXT_PUBLIC_ANALYTICS_DOMAIN` ausente ⇒ no se carga nada) y
los proveedores OAuth.

---

## 3. Trabajos programados

El stack (Next.js sobre Render) **no tiene worker**, así que las reglas
temporales viven en una route handler y alguien de fuera tiene que llamarla.

### 3.1 `/api/jobs/run` — una pasada, todas las reglas

Una sola llamada recorre **todas** las organizaciones y **todas** las reglas, así
que no hace falta un cron por regla: lo que se añada al handler queda cubierto
sin tocar el workflow.

**El orden importa** y está razonado en el propio fichero:

1. Reglas que mueven el estado del socio (bajas programadas…).
2. Alerta por faltas seguidas (`RB-RES-009`), como red de seguridad de la que
   salta al marcar la falta.
3. Retención **antes** que el estancamiento, porque este usa la alerta de
   retención como señal y la quiere recalculada de esta pasada.
4. Fila de apertura del libro mayor de bonos (idempotente).
5. Preaviso de cargo SEPA.
6. **Motor de etiquetas**, después de lo que mueve el estado, para que las
   etiquetas describan el estado de *esta* pasada.
7. **Motor de flujos**, después del de etiquetas, porque la mitad de sus
   condiciones se apoyan en ellas: con las de la pasada anterior, un socio que
   acaba de volver seguiría entrando en el flujo de ausencia.
8. **Motor de conservación**, el último de cada organización: purga y anonimiza,
   y todas las reglas anteriores todavía quieren leer lo que borra.
9. Purga de organizaciones sin pagar, **una vez por pasada**, fuera del bucle.

**Cada regla se aísla.** Antes corrían sueltas dentro del bucle, así que una sola
organización con datos que hicieran fallar una regla tumbaba el handler entero y
todas las organizaciones siguientes se quedaban sin procesar, en silencio y hasta
la próxima pasada.

Cuando algo falla se responde **207**: el cron se considera ejecutado (no tiene
sentido reintentar lo que sí pasó) pero el fallo queda visible en la respuesta en
vez de perderse en los logs — y además se convierte en **tarea** para la
dirección de la organización afectada.

Autenticación: `x-cron-secret` en cabecera, nunca en la query string, que acaba
en los logs.

### 3.2 Los dos disparadores

| Workflow | Cadencia | Por qué |
|---|---|---|
| `.github/workflows/jobs-cron.yml` | `0 5 * * *` (UTC) | Todas las reglas, una vez al día |
| `.github/workflows/flujos-cron.yml` | Varias veces dentro de la ventana 8:00–22:00 | El motor de flujos no manda nada entre las 22:00 y las 8:00 del centro, y las 05:00 UTC caen **dentro** de esa ventana: con solo la pasada diaria la cola no se vaciaría nunca |

GitHub evalúa el cron en **UTC** y no conoce el cambio de hora española: 05:00 UTC
son las 07:00 en Madrid en verano y las 06:00 en invierno. Se eligió de madrugada
para que el desfase estacional nunca empuje la ejecución al día anterior — en
reglas que preguntan «¿es hoy su cumpleaños?» eso sería un fallo silencioso de un
día.

**Aviso:** los cron de Actions se retrasan con frecuencia (5–30 min) y en picos de
carga GitHub llega a saltarse ejecuciones. Es aceptable para avisos diarios; no lo
es para nada que deba ocurrir a una hora concreta. `concurrency: jobs-cron` evita
dos pasadas simultáneas: las reglas usan `createNotificationOnce` y son
idempotentes, pero los envíos de correo no tienen por qué serlo.

### 3.3 El relevo de Render

`render.yaml` es el mismo cron como servicio de Render, **desactivado por
defecto**, para cuando el piloto esté en marcha y la puntualidad importe. Se
enciende con New → Blueprint apuntando al repositorio.

> Si se activa, hay que **desactivar el workflow de Actions** o las reglas se
> ejecutarán dos veces al día.

Usa una imagen pública con `curl` en vez de construir la app entera: levantar un
build de varios minutos para hacer una petición HTTP no tiene sentido. Mismo
contrato —secreto en cabecera— y trata el **207 como fallo**, porque `curl -f` no
lo detectaría.

---

## 4. Pruebas

| Suite | Comando | Qué cubre |
|---|---|---|
| Unitarias | `npm run test:unit` | `src/**/*.test.ts`. Lógica pura y, en los reconciliadores de Stripe, contra la base real |
| Tipos | `npx tsc --noEmit` | — |
| Lint | `npm run lint` | — |
| E2E | `npm run test:e2e` | ~40 specs de Playwright en `e2e/` |

> **Nunca la suite completa de Playwright mientras haya sesiones en paralelo:**
> muta la base de datos de demo y contamina al resto. Se ejecutan los specs de la
> pista en la que se trabaja.

Buena parte de las pruebas unitarias son **pruebas de invariante**, no de función:
comprueban que el ámbito de centro se aplica en las dos superficies, que web y app
no divergen en permisos o rótulos, que no se pide comisión en ningún sitio, que
una ruta nueva bajo un prefijo gateado llama a `requireFeature`, o que un
documento y el código dicen lo mismo. Si una de esas falla, lo que hay que
arreglar rara vez es el test.

Los specs de la app móvil viven en `apps/mobile` con `jest-expo` (ver
[APP_MOVIL.md §2.3](./APP_MOVIL.md)).

---

## 5. CI

`.github/workflows/e2e.yml`, sobre `pull_request` y `push` a `main` y `release`,
más `workflow_dispatch` —sin él, la única forma de relanzar CI sobre una rama es
empujar otro commit—. Postgres 16 como servicio.

Dos jobs, y la razón de que sean dos es real:

- **`verify`** — lint → migraciones y seed → unitarias con cobertura → build →
  e2e. Corre **sin claves de Stripe** a propósito, porque `/planes` debe arrancar
  en modo demo y eso es lo que verifica `planes-gateo.spec.ts`.
- **`e2e-pago`** — los specs de alta comercial y alta completa del gimnasio
  necesitan justo lo contrario: `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET`
  presentes, para probar el alta pago-primero (compra → webhook firmado →
  activación). Las dos condiciones no caben en el mismo job, así que esos 13 tests
  **se saltaban enteros y nadie lo veía**.

CI declara `DATA_REGION` a propósito: `npm run start` corre en modo producción y
sin ella el servidor no arranca — que es justo el comportamiento que se quiere
ejercitar, en vez de hacerle una excepción.

La cobertura se mide y se publica en el resumen del workflow, **sin umbral que
rompa**: primero se mide.

---

## 6. Datos de demostración

`npm run db:seed` borra y vuelve a poblar. Genera **una organización**, `TRAINING
ZONE`, con tres centros (La Jota y Puerta del Carmen en Zaragoza, y Santander) y:

- Socios con estados realistas (activo, moroso, congelado, prueba, baja).
- ~6-7 meses de histórico y hasta 3 semanas de sesiones futuras, con reservas,
  check-ins, no-shows y lista de espera.
- Imputación de personal a centros (`CenterMembership`), repartida entre varios.
- Pagos con métodos variados y algunos morosos con recibos fallidos.
- Registros de salud para ~1 de cada 4 socios, con consentimiento y reglas del
  semáforo.
- Bitácora de observaciones, debriefs post-sesión, alertas de retención
  calculadas con el motor real —no con una copia— y un log de auditoría con
  lecturas de salud y aperturas de Session Brief.

**Dos usuarios por rol y centro** (dirección, entrenador admin, entrenador y
recepción), para poder comprobar que el ámbito se resuelve **por persona y no por
centro**. Los de ámbito organización no se replican: un Owner y una pareja de
RRHH. La lista completa la imprime el propio seed al terminar.

Contraseña de todos: `demo1234`.

| Email | Rol |
|---|---|
| `direccion@trainingzone.es` | Dirección de organización |
| `direccion.lajota@trainingzone.es` | Dirección de centro |
| `marcos.iglesias@trainingzone.es` | Entrenador Admin |
| `entrenador@trainingzone.es` | Entrenador |
| `recepcion.lajota@trainingzone.es` | Recepción |
| `rrhh@trainingzone.es` | RRHH |
| `socio@trainingzone.es` | Socio |
| `sergio@trainingzone.es` | Admin de plataforma |

---

## 7. Despliegue

Render, con la base de datos en **Frankfurt** (declarada en `DATA_REGION` y
publicada en `/privacidad`; ver [ARQUITECTURA.md §5](./ARQUITECTURA.md)). El
plan de salida completo, con calendario y checklist, está en
[PASO_A_PRODUCCION_2_CENTROS.md](./PASO_A_PRODUCCION_2_CENTROS.md); esta sección
es la parte operativa que se repite en cada entorno.

> **Nunca** `npm run db:seed`, `prisma migrate dev` ni `prisma migrate reset`
> contra staging o producción. El seed **vacía la base entera** antes de
> sembrar (`prisma/seed.ts`, `main()`).

### 7.1 Entornos

`render.yaml` es un Blueprint con dos entornos gemelos:

| | Producción | Staging |
|---|---|---|
| Web | `trainingzone-web` | `trainingzone-web-staging` |
| Base de datos | `trainingzone-db` (Postgres 16) | `trainingzone-db-staging` (Postgres 16) |
| Despliegue | **Manual** (`autoDeployTrigger: off`) | Automático al pasar CI en `main` |
| Stripe | Live | **Test** |

Los dos: Frankfurt, plan de pago, **una sola instancia** (el disco persistente
de `/var/data`, donde viven las fotos de progreso, no se monta en dos),
`preDeployCommand: npx prisma migrate deploy` y health check en `/api/health`.
Todas las variables son `sync: false`: Render pide su valor al crear el
Blueprint. Qué va en cada una: `.env.example` y el §3.2 del plan de salida.

**No se declara `NODE_ENV`.** Con `production` durante el build, `npm ci` se
salta las devDependencies y el build falla; `next build` y `next start` ya
fijan el modo producción.

> `/api/health` lo añade la pista P1. Hasta que esté en `main`, Render no dará
> por bueno ningún despliegue: es intencionado.

### 7.2 Roles de la base de datos (antes del primer despliegue)

Tres roles, y la separación es la que hace que `AuditLog` sea append-only de
verdad (E10-14):

| Rol | Variable | Para qué |
|---|---|---|
| Propietario (`trainingzone_owner`, lo crea Render) | `DATABASE_MIGRATION_URL` | Solo `prisma migrate deploy` (`prisma.config.ts`). Sobre él un `REVOKE` no tiene efecto |
| `apta_app` | `DATABASE_URL` | La aplicación. Puede **insertar** en `AuditLog`, nunca modificar ni borrar |
| `apta_mantenimiento` | `DATA_RETENTION_DATABASE_URL` | Purgas de conservación: el único, además del propietario, que conserva el `DELETE` sobre `AuditLog` |

**El orden importa.** La migración `20260906120000_costuras_servidor_q3` revoca
`UPDATE, DELETE` sobre `AuditLog` a los roles que **existen en ese momento**. Si
la base se migra antes de crear `apta_app`, el `REVOKE` no encuentra a nadie y el
rol nace después con todos los permisos. Por eso:

1. **Comprobar que el usuario de Render puede crear roles.** Conectado como el
   propietario: `SELECT rolcreaterole FROM pg_roles WHERE rolname = current_user;`
   tiene que dar `t`. Si da `f`, parar y abrir un ticket con Render antes de
   seguir: sin roles separados no hay log append-only.
2. **Crear los roles**, como el propietario y con la base todavía vacía. Es
   idempotente: se puede repetir.

<!-- sql:roles (CI ejecuta este bloque tal cual: job `arranque-limpio`) -->
```sql
-- Paso 1 · Roles, sin contraseña en el script (se fija después con \password).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'apta_app') THEN
    CREATE ROLE apta_app LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'apta_mantenimiento') THEN
    CREATE ROLE apta_mantenimiento LOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO apta_app, apta_mantenimiento;

-- Lo que cree el propietario a partir de ahora (todas las migraciones) nace
-- con estos permisos. Por eso va ANTES de la primera migración.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO apta_app, apta_mantenimiento;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO apta_app, apta_mantenimiento;

-- CONNECT sobre la base actual, sea cual sea su nombre.
DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO apta_app, apta_mantenimiento', current_database());
END
$$;
```

3. **Poner las contraseñas** sin que pasen por el historial de la shell ni por
   ningún fichero: en `psql`, `\password apta_app` y `\password apta_mantenimiento`
   (lo piden por teclado y envían el hash). Con ellas se montan
   `DATABASE_URL` (`postgresql://apta_app:<clave>@<host interno>/<base>`) y
   `DATA_RETENTION_DATABASE_URL` (igual, con `apta_mantenimiento`). Los caracteres
   especiales de la clave van codificados en la URL.
4. **Primer despliegue.** El `preDeployCommand` migra con el propietario
   (`DATABASE_MIGRATION_URL`) y la app arranca con `apta_app` (`DATABASE_URL`).
5. **Después de la primera migración**, quitar a los dos roles el acceso a la
   tabla interna de Prisma, que se crea en ese momento:

<!-- sql:post-migracion -->
```sql
REVOKE ALL ON TABLE "_prisma_migrations" FROM apta_app, apta_mantenimiento;
```

6. **Comprobar.** Cada columna tiene que dar lo que dice su comentario; si no,
   la app no sale a producción:

<!-- sql:comprobacion -->
```sql
SELECT
  has_table_privilege('apta_app', '"AuditLog"', 'INSERT')           AS app_inserta,        -- t
  has_table_privilege('apta_app', '"AuditLog"', 'UPDATE')           AS app_modifica,       -- f
  has_table_privilege('apta_app', '"AuditLog"', 'DELETE')           AS app_borra,          -- f
  has_table_privilege('apta_mantenimiento', '"AuditLog"', 'DELETE') AS mant_borra,         -- t
  has_table_privilege('apta_app', '"_prisma_migrations"', 'SELECT') AS app_ve_migraciones, -- f
  (SELECT tableowner FROM pg_tables WHERE tablename = 'AuditLog') <> 'apta_app' AS app_no_es_propietaria; -- t
```

**Sobre `apta.app_roles`.** El plan de salida (§3.1, paso 2) pide
`ALTER DATABASE … SET apta.app_roles = 'apta_app'`. **No hace falta y en Render
falla**: fijar un parámetro propio a nivel de base o de rol exige superusuario
(`permission denied to set parameter "apta.app_roles"`, comprobado en Postgres
16 con un propietario no superusuario, que es lo que da Render). La migración
ya usa `apta_app` cuando el parámetro no existe, así que basta con que el rol se
llame **exactamente** así. Solo si algún día se usan otros nombres habría que
pedirle a Render un `GRANT SET ON PARAMETER "apta.app_roles"`.

**Si la base ya se migró antes de crear los roles** (el orden salió mal), no hay
que tirar nada: crear los roles con el bloque del paso 2 y, después, dar los
permisos sobre lo que ya existe y repetir a mano el `REVOKE` que la migración no
pudo aplicar. Luego, el paso 6.

<!-- sql:arreglo-orden -->
```sql
-- Solo si la base YA se migró antes de crear los roles.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO apta_app, apta_mantenimiento;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO apta_app, apta_mantenimiento;
REVOKE UPDATE, DELETE ON TABLE "AuditLog" FROM apta_app;
REVOKE ALL ON TABLE "_prisma_migrations" FROM apta_app, apta_mantenimiento;
```

### 7.3 Primer arranque sin seed: la plataforma

Producción nace **vacía**. Las organizaciones de los gimnasios solo se crean
pagando (`/planes` → webhook → OWNER, RB-ALTA-001), pero para soporte y para
revisar las altas hace falta alguien en el panel de plataforma, y sin seed no
existe. `scripts/bootstrap-plataforma.ts` crea exactamente eso y nada más:

- la organización de plataforma (slug `PLATFORM_ORG_SLUG`), en estado
  `ACTIVE`: con el `PENDING_PAYMENT` por defecto, la purga de organizaciones sin
  pagar la **borraría** a los días, porque no tiene socios, centros ni cobros;
- un `PLATFORM_ADMIN` (`PLATFORM_ADMIN_EMAIL`) **sin contraseña**: recibe una
  invitación por correo y la fija en `/onboarding/<token>`. El enlace no se
  imprime nunca;
- una fila en `AuditLog` (`PLATFORM_BOOTSTRAP`), sin el token.

Desde la shell del servicio web en Render (tiene las variables del entorno):

```bash
NODE_ENV=production npm run bootstrap:plataforma
```

`NODE_ENV=production` va delante a propósito: Render no lo declara (§7.1) y el
script se niega a correr fuera de producción salvo con `--force`. Variables:
`PLATFORM_ORG_SLUG` y `PLATFORM_ADMIN_EMAIL` (obligatorias, ya en el blueprint),
`PLATFORM_ORG_NAME` y `PLATFORM_ADMIN_NAME` (opcionales, en la propia línea).

| Situación | Qué hace |
|---|---|
| Base vacía | Crea organización, administrador e invitación, y la envía |
| Se vuelve a ejecutar | Nada: dice lo que ya existe. Con `--reenviar`, manda otra vez la invitación vigente |
| La invitación caducó | La renueva (mismo registro, token nuevo) y la envía |
| El email ya tiene contraseña en Apta | Crea la membresía sin invitación: entra con la suya |
| Datos de demo (la organización `training-zone` o cuentas con la contraseña del seed) | **Se niega**, también con `--force` |
| El slug es de una organización con socios, centros o cobros | Se niega: es un gimnasio |
| El email ya tiene otro rol en esa organización, o está de baja | Se niega: no cambia roles en silencio |
| En producción sin `BREVO_API_KEY` o con la URL pública en `localhost` | Se niega **antes de escribir nada**: la invitación no llegaría |

`sendMail` registra los fallos de Brevo en el log en vez de propagarlos: si el
correo no llega, se relanza con `--reenviar`. La lógica de decisión es pura y
tiene sus pruebas en `scripts/bootstrap-plataforma.test.ts`, que corre CI
(`npm run test:unit` solo recorre `src/`).

