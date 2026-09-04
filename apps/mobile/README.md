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
su propio subconjunto de la app; recepción entra con socios, agenda y avisos, y
RRHH con equipo y avisos.

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
  | Dirección de organización | Panel · Socios · Productos · Equipo · Más |
  | Dirección de centro | Panel · Socios · Agenda · Productos · Más |
  | Admin de plataforma | Panel · Anuncios · Equipo · Más |
  | Recepción | Socios · Agenda · Avisos · Más |
  | RRHH | Equipo · Avisos · Más |

  El reparto vive en `src/auth/routes.ts` (`TABS_BY_ROLE`), no en el layout: la
  **primera pestaña de cada rol es su pantalla de aterrizaje**, y las dos cosas
  tienen que salir de la misma lista (ver el repaso de QA de más abajo).

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

### Repaso de QA (barra de pestañas y corrección de fallos)

**Barra de pestañas fijada al borde inferior.** Flotaba con 12 px a los lados y
un hueco calculado a mano (`insets.bottom - 4`), que en los móviles sin barra de
gestos dejaba la isla despegada del borde y en los que sí la tienen la montaba
sobre el indicador. Ahora va a todo el ancho, pegada abajo y **sin margen**, con
el área segura absorbida como `paddingBottom` de la propia barra. Al dejar de
ser `position: "absolute"`, el navegador le resta su alto a la pantalla: ningún
contenido queda debajo, así que `ScreenContainer`/`ScreenFrame` ya no reservan
hueco (`layout.tabBarHeight` pasa a ser el alto ÚTIL y `useTabBarHeight()`
devuelve el total con área segura, que es lo que descuenta el toast). Además se
esconde con el teclado abierto (`tabBarHideOnKeyboard`).

**Fallos corregidos en este repaso** (los que se veían con el rol de entrenador
van primero):

| Dónde | Qué pasaba |
|---|---|
| `panel.tsx` | «Pasar lista» y «Brief» abrían la MISMA pantalla; pasar lista es el feedback socio a socio, que es donde se marca la asistencia. |
| `panel.tsx` | «Hueco de EP sin publicar» contaba huecos ya publicados y **sin reservar**: el rótulo decía lo contrario de la cifra. |
| `feedback/[id].tsx` | El autoguardado mandaba solo el último eje tocado y, al invalidar su propia consulta, la respuesta volvía a sembrar el formulario y **borraba de la pantalla los ejes recién puntuados**. Ahora se manda el bloque entero del socio y la siembra es una sola vez por sesión. |
| `feedback/index.tsx` | «X de Y hechas» contaba la misma sesión como hecha y como pendiente; y «Cierra en X h» usaba el pendiente MENOS urgente del grupo. |
| `login.tsx` | Con varias membresías el servidor responde 409 con la lista de organizaciones (RB-ID-002) y la app enseñaba «Elige la organización…» **sin ninguna que elegir**: no había forma de entrar. Ahora las ofrece y reintenta con `orgId`. `ApiError` conserva los campos extra del error. |
| `login.tsx` | «¿Has olvidado la contraseña?» era un botón mudo. |
| Todas las fichas y pantallas de índice | `router.back()` no hace nada sin historial (recarga del bundle, enlace directo): la flecha de volver se quedaba muerta. `goBack(fallback)` siempre tiene salida. |
| `productos/[id].tsx`, `organizacion/[id].tsx` | El formulario se sembraba en el primer render, antes de que llegara la consulta: abierto en frío salía **en blanco** y «Guardar» borraba nombre, precio, foto e imputación. Ahora espera al dato y se monta con `key`. |
| `productos/[id].tsx` | Guardar mandaba `validityDays: null` **borrando la caducidad** del bono en cada edición. |
| `Sheet.tsx` | El teclado tapaba entera la hoja (crear sesión, nueva tarea, motivo del descarte). |
| `staff-agenda.tsx` | Al retroceder de día, la tira de días no contenía el día seleccionado y no quedaba ninguna casilla marcada. |
| `agenda.tsx` (socio) | El botón de una reserva en espera decía «En espera» y lo que hacía era **cancelar**. |
| `sesiones.tsx` | Al cambiar de mes en el calendario, el día elegido se quedaba en hoy: rejilla sin selección y detalle de otro mes. |
| `index.tsx` (socio) | «Añadir al calendario» fijaba 60 min ignorando la duración real; y un fallo SOLO de la agenda anunciaba «Sin sesiones reservadas» a quien sí tenía. |
| `utils/format.ts` | `new Date("2026-09-01")` es medianoche **UTC**: al oeste de Greenwich las fechas se pintaban un día antes. Y una fecha corrupta escribía «Invalid Date». |
| `Countdown.tsx` | El instante objetivo solo se fijaba una vez: al pasar de «empieza en» a «quedan» seguía descontando la sesión anterior. |
| `leads.tsx` | Un fallo al registrar el contacto avisaba de que «no se pudo abrir el marcador» después de haber llamado. |
| Buscadores de socios | Una petición por tecla, y la lista entera cayendo al esqueleto entre letra y letra (`useDebounced` + `keepPreviousData`). |
| `_layout.tsx` | Un rol sin pestañas declaradas dejaba una barra vacía y sin forma de moverse. |

También se han unificado estilos: `brief/index.tsx` volvió al sistema de diseño
(usaba tipografías escritas a mano y un spinner gris), la campana del icono
dejaba de pintar su base dos veces, las medidas del histórico de evolución usan
coma decimal como los tiles, y se han corregido rótulos que prometían otra cosa
que su destino («Salud y consentimientos» → «Mi evolución», «SOLO ENTRENADOR
ADMIN» en una pantalla a la que también entra dirección).

### Segundo repaso de QA (regresión por rol)

Recorrido completo de la app rol por rol contra la API real (`npm run dev` +
`prisma migrate deploy` + `npm run db:seed`), pantalla por pantalla y con las
mutaciones de cada una. Lo que salió:

| Dónde | Qué pasaba |
|---|---|
| `auth/routes.ts` · `(tabs)/index.tsx` | **El fallo del que se partía.** `homeRouteFor` mandaba a TODOS los roles a `/(tabs)`, que es la ruta índice del grupo — o sea `(tabs)/index.tsx`, el «Hoy» del socio. Un entrenador aterrizaba ahí, la pantalla pedía `/portal/activity` y `/portal/agenda`, el servidor las cierra con 403 a quien no es socio y la primera pantalla tras el login era «No se pudo cargar tu día», encima sin ninguna pestaña marcada (para él `index` va oculta). Ahora cada rol entra por su primera pestaña, `TABS_BY_ROLE` y la ruta de aterrizaje salen de la misma lista, y `index` redirige a su sitio a quien no es socio en vez de pedirle datos que tiene prohibidos. |
| `auth/routes.ts` | El soporte de plataforma tenía pestaña **Socios** y `canManageMembers` (`src/lib/rbac.ts`) se los niega: la abría en «No tienes permiso para ver los socios». Sus pestañas son ahora las mismas cuatro de su menú de la web. |
| `(tabs)/mas.tsx` | **Anuncios** estaba implementado y servido por la API, y no había forma de llegar a él: no era pestaña de nadie ni tenía entrada en el índice «Más». Ahora es tile para quien puede publicarlos, sin duplicarse en el rol que sí lo lleva en la barra. |
| `staff-agenda.tsx` | La agenda arrancaba en «Mis sesiones», que filtra por el id del usuario. Dirección de centro y recepción también tienen esa pestaña y no dan clases: la abrían siempre en «Sin sesiones ese día» con la sala llena. Arranca en «Todo el centro» para quien no es entrenador, y los chips que no significan nada para su rol («Mis sesiones», «Huecos EP») ya no se enseñan. |
| `auth/auth-context.tsx` | Recepción y RRHH tenían pestañas declaradas y la API les responde 200 en todas sus pantallas, pero el login los rechazaba con «Tu rol todavía no tiene una versión de la app móvil». El comentario que lo justificaba («sus pantallas aún no existen») había dejado de ser cierto. |
| `api/queries.ts` | `useActivity` y `useAgenda` no se podían desactivar, así que la visita de un no-socio a la ruta índice disparaba dos peticiones condenadas al 403. |

Lo que se comprobó y **no** tenía fallo: los endpoints de las 22 pantallas para
los ocho roles (login, listados, fichas y calendarios), y las mutaciones de
tareas, leads, feedback 1-10, debrief, aforo, anuncios, productos, equipo,
alta/edición/borrado de sesión, hueco de EP y alta/descarte de asistente.

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
