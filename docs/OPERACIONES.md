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
publicada en `/privacidad`; ver [ARQUITECTURA.md §5](./ARQUITECTURA.md)).

Antes de un despliegue con cambios de esquema: `npx prisma migrate deploy`. El
`postinstall` ya corre `prisma generate`.
