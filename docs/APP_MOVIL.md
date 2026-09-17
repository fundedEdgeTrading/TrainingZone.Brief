# App móvil y API móvil

Dos piezas: la **API JSON** (`src/app/api/mobile/v1/**`, parte de la web app) y
la **app nativa Expo** (`apps/mobile/`).

La app no reimplementa negocio. La API es una capa fina sobre las mismas
`src/lib/*-queries.ts` que usa la web, y ahí está tanto su virtud como su riesgo
principal.

> **El fallo del espejo móvil.** Es el que más se repite y el que más caro sale:
> una pantalla de la web con su guarda aplicada y su equivalente en la API sin
> ella. Ya ocurrió con el ámbito de centro en socios y leads, con el aforo por
> defecto, con el debrief de sesión y con el gateo por plan del Session Brief.
> Toda ruta nueva se construye en los dos sitios, con la misma guarda.

---

## 1. El contrato de la API

### 1.1 Versionado

`/api/mobile/v1/**`, versionado desde el primer día: las tiendas obligan a
mantener versiones viejas mientras haya usuarios sin actualizar.

### 1.2 Envoltura uniforme

```jsonc
{ "ok": true,  "data": … }
{ "ok": false, "error": "…", /* más claves cuando el cliente necesita resolver algo */ }
```

`src/app/api/mobile/v1/_lib/response.ts` (`apiOk`, `apiError`). Coherente con el
patrón `*ActionResult` de los Server Actions de la web. El `extra` de `apiError`
es para los errores que el cliente **puede** resolver, como elegir organización
en el login.

### 1.3 Autenticación

La app no puede leer la cookie de sesión de Auth.js, así que tiene su propio
mecanismo (`src/lib/mobile-auth.ts`):

| Pieza | Detalle |
|---|---|
| Access token | JWT `HS256` firmado con `AUTH_SECRET`, **15 minutos**, sin estado (no toca base de datos) |
| Claims | `sub` (userId), `role`, `orgId`, `centerId` |
| Refresh token | Opaco y **rotatorio**, 30 días, persistido en `MobileRefreshToken` |
| Endpoints | `POST /auth/login` · `POST /auth/refresh` · `POST /auth/logout` |

El refresh se persiste para poder **revocar la sesión de un dispositivo
concreto**. En el cliente se guarda en `expo-secure-store` (Keychain / Keystore),
nunca en `AsyncStorage`, y `src/api/client.ts` reintenta automáticamente ante un
`401` refrescando el token.

> **Invariante multi-tenant.** Todo endpoint deriva `orgId` **del token**, nunca
> de lo que mande el cliente.

### 1.4 Guardas

`src/app/api/mobile/v1/_lib/api-guards.ts`: `requireApiSession` (lee
`Authorization: Bearer` y devuelve `401`/`403` JSON en vez de redirigir) y
`requireApiCenterScope`, el equivalente de `isCenterInScope`. Validación de
entrada con Zod en cada endpoint.

### 1.5 Gateo por plan

`src/lib/mobile-feature-routes.ts` es el espejo de `FEATURE_BY_ROUTE` para las
rutas que no pasan por el menú (`RB-PLAT-008`).

Existe porque el agujero era real y estaba medido: con la organización demo en
`esencial_mes` (sin `salud_aptitud`), `GET /trainer/brief` devolvía 200 con la
lista completa y `GET /trainer/members?filter=alerts` devolvía el semáforo y la
zona de lesión. En web las dos redirigen a `/planes`. **Session Brief, semáforo,
zona de lesión y rangos de composición eran gratis desde la app: fuga de ingresos
directa.**

Las claves son rutas **sin** el prefijo `/api/mobile/v1` y con los segmentos
dinámicos tal y como están en el sistema de ficheros (`[id]`). **El gate se
hereda a las rutas hijas**: declarar `/trainer/brief` cubre
`/trainer/brief/[id]/debrief`, así que una hija nueva no vuelve a abrir el
agujero.

### 1.6 Superficie

Agrupada por área: `auth`, `me`, `portal/*` (actividad, agenda y reservas,
membresías, facturación y checkout, evolución, valoración, consumo, saludo,
calendario, borrado de cuenta), `agenda/*` (sesiones, reservas, franjas de EP),
`trainer/*` (panel, sesiones, brief y debrief, socios, mesociclos, no-show),
`members`, `leads`, `staff`, `tasks`, `products`, `capacity`, `notifications`,
`checkout`, `mesocycles` y `admin/*` (panel, anuncios, organización).

### 1.7 Notificaciones: una sola tabla de destinos

Había **dos** resolutores parcialmente disjuntos: un aviso de `Lead` llevaba a la
ficha en web y a la *lista* en móvil, descartando el id; uno de `Member` llevaba
a una pantalla de entrenador donde recepción y dirección no entraban.

`src/lib/notification-routes.ts` es la fuente de verdad. La app vive en otro
runtime y no comparte módulos con la web, así que
`apps/mobile/src/notification-routes.ts` es una **réplica deliberada**, y
`notification-routes.test.ts` comprueba que las dos no se desincronizan.

---

## 2. La app nativa

Expo / React Native con expo-router y TanStack Query. Documentación propia en la
carpeta:

| Fichero | Qué contiene |
|---|---|
| `apps/mobile/README.md` | Puesta en marcha, pantallas, pestañas por rol, pruebas |
| `apps/mobile/PUBLISHING.md` | Qué falta para publicar y las decisiones ya tomadas |
| `apps/mobile/STORE_PRIVACY.md` | Declaración de privacidad de las fichas de tienda |

### 2.1 Navegación por rol

Cinco pestañas por rol, elegidas por frecuencia de uso; la quinta es **Más**, un
índice real del resto de la app con contadores de trabajo pendiente. El reparto
vive en `src/auth/routes.ts` (`TABS_BY_ROLE`), no en el layout: **la primera
pestaña de cada rol es su pantalla de aterrizaje**, y las dos cosas salen de la
misma lista.

| Rol | Pestañas |
|---|---|
| Socio | Hoy · Reservar · Sesiones · Evolución · Más |
| Entrenador / Entrenador Admin | Hoy · Agenda · Socios · Feedback · Más |
| Dirección de organización | Panel · Socios · Productos · Equipo · Más |
| Dirección de centro | Panel · Socios · Agenda · Productos · Más |
| Admin de plataforma | Panel · Anuncios · Equipo · Más |
| Recepción | Socios · Agenda · Avisos · Más |
| RRHH | Equipo · Avisos · Más |

### 2.2 Diseño

Los tokens de [BRANDING.md](./BRANDING.md) portados a `src/theme/theme.ts`, con
**piel oscura por defecto** y clara si el sistema la pide, más escala tipográfica,
motion con `prefers-reduced-motion` y primitivas propias.

### 2.3 Pruebas

`jest-expo` + `@testing-library/react-native`. No hay MSW: la app habla con el
servidor por un único punto (`apiRequest` → `fetch`), así que se dobla el `fetch`
global y se declaran respuestas por ruta. Las fixtures se escriben **contra el
tipo** de `src/api/types.ts`, sin `as`: si el servidor cambia el contrato, rompe
`tsc` ahí y no la app en producción.

No se instala Detox ni Maestro: caros, lentos, y no cazan ninguno de los fallos
que este proyecto tiene.

---

## 3. Publicación: lo que está bloqueado

`ios.bundleIdentifier` y `android.package` son **inmutables tras la primera
publicación** y todavía no están decididos, así que `app.json` **no** declara
bloques `ios`/`android` con identificador: inventar uno cementaría en la tienda un
nombre que nadie eligió.

Lo mismo gobierna los enlaces universales: `apple-app-site-association` y
`assetlinks.json` devuelven 404 con cuerpo explícito hasta que existan
`APPLE_TEAM_ID`, los dos identificadores y la huella SHA-256 del certificado de
firma (ver [SEO_Y_CAPTACION.md §4](./SEO_Y_CAPTACION.md)).

El detalle completo, en `apps/mobile/PUBLISHING.md`.
