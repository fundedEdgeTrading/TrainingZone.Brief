# Training Zone — app móvil (portal del socio)

App nativa descrita en `docs/APP_MOVIL_NATIVA_PLAN.md` y rediseñada según el
handoff "App móvil premium": cubre **F0** (API JSON con auth por token),
**F1** (scaffold Expo, auth, navegación, design system), **F2** (portal del
socio: actividad, reservar, mis sesiones con cuenta atrás, mis bonos,
calendario y compra del bono) y **F3** (entrenador: panel, agenda del centro
en timeline y feedback 1-10 por socio; dirección: panel de control, socios,
productos y equipo). El backend de negocio no se ha reescrito — la app consume
`src/app/api/mobile/v1/**`, una capa fina sobre `src/lib/*-queries.ts`.

## Puesta en marcha

Requiere que la web (`trainingzone`, en la raíz del repo) esté corriendo con
su base de datos migrada (incluye la migración `mobile_refresh_tokens`):

```bash
# en la raíz del repo
npm run db:migrate
npm run dev          # sirve la API en http://localhost:3000/api/mobile/v1
```

Luego, en este directorio:

```bash
npm install
npx expo start
```

Abre la app en un simulador/dispositivo o en Expo Go. Por defecto (sin
`EXPO_PUBLIC_API_URL`), `src/api/client.ts` deriva el host de la API del
propio Metro bundler (`Constants.expoConfig.hostUri`), así que **no hace
falta tocar nada** ni en simulador ni en un dispositivo físico en la misma
red: si Metro se ve desde el móvil (p.ej. `192.168.1.23:8081`), la API
también. Si tu red bloquea esa conexión directa o usas el emulador de
Android con solo el puerto reenviado (`10.0.2.2`), fija la URL a mano con
`EXPO_PUBLIC_API_URL` como se explica abajo.

### Contra el entorno desplegado (emulador de Android Studio)

Probar solo contra `localhost` esconde justo los fallos que luego aparecen en
producción (URL absolutas, certificado, dominio). Para apuntar al despliegue no
hace falta tocar `app.json`:

```bash
EXPO_PUBLIC_API_URL="https://<host-desplegado>/api/mobile/v1" npx expo start
```

La variable se inlinea en el bundle, así que hay que reiniciar el bundler al
cambiarla. La API móvil no depende de CORS (una app nativa no es un navegador),
pero sí de que el host sirva HTTPS con certificado válido: Android bloquea el
tráfico en claro por defecto.

**Login de prueba** (sembrado por `prisma/seed.ts`, rol `MEMBER`):
`socio@trainingzone.es` / `demo1234`. Socio, entrenador y dirección tienen ya
su propio subconjunto de la app; recepción y RRHH entran con una versión
mínima (avisos y perfil).

## Qué incluye esta versión

- **Auth por token** (`/auth/login`, `/auth/refresh`, `/auth/logout`): JWT de
  acceso de 15 min + refresh token opaco y rotatorio (`MobileRefreshToken`),
  guardados en `expo-secure-store` (Keychain/Keystore), nunca `AsyncStorage`.
- **Cliente API** (`src/api/client.ts`): reintenta automáticamente en `401`
  refrescando el token; `src/api/queries.ts` expone hooks de TanStack Query.
- **Diseño**: tokens de `docs/BRANDING.md` portados en `src/theme/theme.ts`
  (**piel oscura por defecto**, clara si el sistema la pide), escala
  tipográfica en `src/theme/typography.ts`, motion y `prefers-reduced-motion`
  en `src/theme/motion.ts`, y primitivas en `src/components/` (héroe, anillo de
  progreso, cuenta atrás, hojas, chips, barras de puntuación, esqueletos…).
- **Navegación por rol** (`src/app/(tabs)/_layout.tsx`): cinco pestañas por
  rol, elegidas por frecuencia de uso. La quinta es **Más**, un índice real del
  resto de la app con contadores de trabajo pendiente; **Perfil** deja de ser
  ese índice y vuelve a ser solo la cuenta.

  | Rol | Pestañas |
  |---|---|
  | Socio | Hoy · Reservar · Sesiones · Evolución · Más |
  | Entrenador / Entrenador Admin | Hoy · Agenda · Socios · Feedback · Más |

  Lo que cambia respecto a la primera versión: el entrenador tenía en la app
  solo panel, agenda, feedback, brief y perfil mientras en la web disponía
  además de Tareas, Socios, Leads y —como Entrenador Admin— Aforo; ahora
  «Socios» es pestaña y el resto entra por «Más». Del lado del socio,
  Calendario se funde dentro de «Sesiones» como vista (era una pantalla aparte
  que contaba lo mismo), Evolución sube a pestaña y Avisos entra por la campana
  de Hoy y por «Más».

### Pantallas (handoff "App móvil premium")

| Pantalla | Ruta | Endpoint |
|---|---|---|
| A1 Login | `app/login.tsx` | `POST /auth/login` |
| A2 Catálogo del centro | `app/onboarding/planes.tsx` | `GET /products` |
| A3 Confirmar y pagar | `app/onboarding/pago.tsx` | `POST /checkout` |
| B1 Reservar · B2 Confirmar | `app/(tabs)/agenda.tsx` | `GET /portal/agenda`, `POST /portal/agenda/book` |
| B3 Mis sesiones | `app/(tabs)/sesiones.tsx` | `GET /portal/agenda` |
| B4 Mis bonos | `app/(tabs)/bonos.tsx` | `GET /portal/memberships` |
| B5 Mi calendario | vista dentro de `app/(tabs)/sesiones.tsx` | `GET /portal/member-calendar?month=` |
| C1 Mi panel | `app/(tabs)/panel.tsx` | `GET /trainer/panel` |
| C2 Agenda · C3 Crear/editar | `app/(tabs)/staff-agenda.tsx` | `GET /agenda`, `POST`/`PATCH`/`DELETE /agenda/sessions` |
| C4 Feedback 1-10 | `app/(tabs)/feedback/[id].tsx` | `GET`/`POST /trainer/sessions/:id/feedback` |
| D1 Panel de control | `app/(tabs)/dashboard.tsx` | `GET /admin/dashboard?centerId=` |
| D2 Socios · D3 Ficha | `app/(tabs)/socios/` | `GET /members`, `/members/:id`, `/members/:id/calendar` |
| D4 Productos · D5 Ficha | `app/(tabs)/productos/` | `GET`/`POST /products`, `PATCH`/`DELETE /products/:id` |
| D6 Equipo · D7 Ficha | `app/(tabs)/organizacion/` | `GET`/`POST /staff`, `PATCH`/`DELETE /staff/:id` |
| Cumpleaños · valoración vencida | `src/components/PortalGate.tsx` | `GET`/`POST /portal/greeting`, `GET /portal/valoracion` |

### Rediseño y paridad funcional (handoff "Mejora de mobile app")

| Pantalla | Ruta | Endpoint |
|---|---|---|
| Más (índice de los dos roles) | `app/(tabs)/mas.tsx` | — |
| Socios del entrenador · ficha | `app/(tabs)/mis-socios/` | `GET /trainer/members`, `/trainer/members/:id`, `POST` (nota) |
| Plan del socio · mesociclos | `app/(tabs)/mis-socios/mesociclo/[id].tsx` | `GET`/`POST /trainer/members/:id/mesocycles`, `GET /mesocycles/:id`, `POST /mesocycles/:id/approve` |
| Tareas | `app/(tabs)/tareas.tsx` | `GET`/`POST /tasks`, `PATCH /tasks/:id` |
| Leads | `app/(tabs)/leads.tsx` | `GET /leads`, `PATCH /leads/:id` |
| Aforo de clases | `app/(tabs)/aforo.tsx` | `GET`/`PATCH /capacity` |
| Hueco de EP | hoja de `app/(tabs)/staff-agenda.tsx` | `POST /agenda/ep-slots` |
| Descartar asistente | hoja de `app/(tabs)/staff-agenda.tsx` | `GET`/`POST /agenda/sessions/:id/bookings/:bookingId/discard` |
| Historial de consumo | `app/(tabs)/consumo.tsx` | `GET /portal/consumption` |

**Regla de negocio nueva — descarte del entrenador (`src/lib/attendee-discard.ts`):**
sacar a un socio de un grupo reducido tiene ventana propia de **24 h**, distinta
de la cancelación del propio socio. Con más margen la sesión vuelve al bono;
dentro de las 24 h se consume, porque la plaza ya no se puede revender. Quien
tiene `canAdjustSessionBalance` (Entrenador Admin, dirección, recepción) puede
devolverla igualmente, y ese override —como el propio descarte— queda en
`AuditLog`. La hoja enseña el efecto exacto sobre el bono ANTES de confirmar.

**Estados de espera (tres mecanismos, no uno):**

1. **Velo de marca bloqueante** (`src/components/BrandLoader.tsx`) — solo para
   las esperas largas con IA (generar un mesociclo: 60-120 s). Portado de
   `src/components/ui/brand-loader.tsx` con sus reglas: el nivel se para al 92 %
   de su tramo, el 100 % solo llega con `done`, y el velo se queda 1150 ms con
   el resultado a la vista. Añadido propio del móvil: **Avisarme al terminar**,
   que permite salir sin abortar el trabajo.
2. **Skeleton** (`src/components/Skeleton.tsx`) — primera carga de cualquier
   pantalla, con variantes por forma (`row`, `avatarRow`, `kpi`, `hero`) para
   que el esqueleto calque la retícula real y nada salte al llegar los datos.
   Cabecera, buscador y filtros son reales desde el primer fotograma.
3. **Botón en curso** — acciones cortas (reservar, cancelar, guardar feedback,
   añadir o descartar asistente). Sin velo: tapar la pantalla media décima de
   segundo hace la app más lenta de lo que es.

### Paridad con el portal web (F8)

`src/app/api/mobile/v1/**` es una capa aparte de la web, así que lo de la
jornada hay que comprobarlo también aquí — es donde estas cosas se olvidan:

- **Entrenador Admin** (`TRAINER_ADMIN`): rol nuevo en `TABS_BY_ROLE` y en el
  índice de Perfil, y ya aceptado por los endpoints de agenda, brief y panel.
  En la app ve lo mismo que el entrenador: su mando sobre el centro (aforo,
  ajuste de bonos) vive solo en la web, que es donde están esas pantallas.
- **Valoración vencida**: `PortalGate` la reclama al entrar, igual que el
  layout del portal, contra la misma consulta (`getDueAssessmentForMember`).
  Con salida siempre: el aviso se cierra y vuelve en la siguiente entrada
  mientras siga pendiente. El cuestionario no se rellena en la app — lo firma
  el entrenador con el socio delante (F3).
- **Cumpleaños**: mismo endpoint que la web (`/portal/greeting`), mismo
  descarte persistente en servidor, y misma prioridad (felicitar antes que
  reclamar la valoración).
- **Módulos retirados en F2** (Ofertas, Fichajes): la app nunca tuvo pantalla
  de ninguno de los dos, y la API móvil tampoco los expone. Nada que ocultar.

### Gate de compra y pago

Si el socio no tiene ningún bono vivo (`/me` → `member.hasActiveMembership`),
A2 sustituye a las tabs hasta que compre. El cobro con tarjeta sale por Stripe
Checkout sobre la cuenta conectada del gimnasio (`src/lib/member-billing.ts`) y
se abre en el navegador del dispositivo con `expo-web-browser` — nunca en un
WebView incrustado, que Stripe no soporta. Si el gimnasio todavía no ha
conectado Stripe, `POST /checkout` responde `mode: "manual"` y la app explica
que el centro activará el bono al registrar el pago: no se crea ninguna
suscripción sin cobro.

## Qué falta a propósito (fuera de alcance de esta versión)

- **`packages/shared-types`**: los DTO viven duplicados en `src/api/types.ts`
  en vez de un paquete de workspace compartido con la web, para no acoplar el
  bundler de Expo al monorepo de Next en el primer corte. Si el contrato
  crece, extraerlo tal como describe el plan (§2).
- **F4 (push, biometría, offline) y F5 (publicación en stores)**: no
  implementados. Iconos/splash usan los placeholders de Expo — antes de
  publicar hace falta el isotipo de marca. La cámara/galería sí entra, vía
  `expo-image-picker`, para la foto de producto y de equipo.
- **Acceso con Microsoft y Google**: los botones existen en el login pero
  quedan deshabilitados hasta que el despliegue tenga sus variables de entorno.
- **Añadir al calendario** (B3) abre el formulario de evento del calendario
  web en el navegador del dispositivo; una integración nativa necesitaría
  `expo-calendar` y un rebuild.
- Validación en dispositivo/simulador real: esta sesión verificó el build con
  `npx tsc --noEmit` y `npx expo export` (bundling completo sin errores), pero
  no hay hardware disponible en este entorno para probar la UX a mano.
