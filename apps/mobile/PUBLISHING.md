# Publicación en tiendas — E9-16

Este documento es el punto único donde queda escrito qué falta para publicar
la app, y las decisiones ya tomadas sobre cómo publicarla. Es la contraparte
de `app.json`/`eas.json`/`store.config.js`: cuando falta un dato real, aquí se
explica por qué y qué hacer con él en lugar de inventarlo en el fichero de
configuración.

## 1. Bloqueado: identificadores de tienda

`ios.bundleIdentifier` y `android.package` son **inmutables tras la primera
publicación**. Se preguntó explícitamente antes de tocar `app.json` y la
respuesta fue **"no se sabe"** para los dos. Por eso:

- `app.json` **no** declara bloques `ios`/`android` con identificador. Añadir
  uno inventado sería cementar en la tienda un nombre que nadie decidió.
- `eas.json` sí existe (este cambio) porque los perfiles de build no
  necesitan el identificador — lo lee de `app.json` en el momento del build.

**Antes de la primera build de producción, alguien con autoridad de negocio
tiene que fijar:**

| Campo | Formato | Ejemplo de forma (NO usar tal cual) |
|---|---|---|
| `ios.bundleIdentifier` | reverse-DNS | `com.empresa.app` |
| `android.package` | reverse-DNS, normalmente igual al de iOS | `com.empresa.app` |

Una vez decididos, hay que rellenarlos en:

1. `apps/mobile/app.json` → `expo.ios.bundleIdentifier`, `expo.android.package`.
2. Las variables de entorno de este documento (§3), que alimentan
   `apple-app-site-association` y `assetlinks.json`.

## 2. Bloqueado: dominio público de producción

Ningún fichero del repositorio fija hoy el dominio de producción real:
`src/lib/site.ts` lo resuelve en tiempo de ejecución desde
`NEXT_PUBLIC_SITE_URL`/`NEXTAUTH_URL`, y ese valor solo existe en el entorno
de despliegue, no en el código. La página `/app` y el JSON-LD `MobileApplication`
usan esa misma función (`publicOrigin()`), así que no dependen de un dominio
escrito a mano — funcionan igual en local, en preview y en producción.

Donde SÍ hace falta un dominio literal (fuera del runtime de Next.js) es en
`store.config.js` (URL de política de privacidad para App Store Connect /
Play Console) y en `ios.associatedDomains` / `android.intentFilters` de
`app.json` para los App Links. Esas dos piezas quedan pendientes junto con el
dominio: `store.config.js` lee `EXPO_PUBLIC_SITE_URL` y falla de forma audible
(lanza un error al construir el paquete de metadatos) si no está definida, en
vez de publicar una URL de privacidad que apunte a ningún sitio.

## 3. App Links — qué falta y dónde

El proxy (`src/proxy.ts`) ya deja pasar `/.well-known/*` sin redirigir a
`/login` (E9-01, ya mergeado). Los route handlers
(`src/app/.well-known/apple-app-site-association/route.ts` y
`src/app/.well-known/assetlinks.json/route.ts`) están escritos y sirven
contenido válido en cuanto existan estas variables de entorno:

| Variable | Para qué |
|---|---|
| `APPLE_TEAM_ID` | Prefijo del `appID` en `apple-app-site-association` (`TEAMID.bundleIdentifier`) |
| `IOS_BUNDLE_ID` | Sufijo del mismo `appID` (== `ios.bundleIdentifier` de §1) |
| `ANDROID_PACKAGE_NAME` | `package_name` de `assetlinks.json` (== `android.package` de §1) |
| `ANDROID_SHA256_CERT_FINGERPRINTS` | Huella(s) SHA-256 del certificado de firma, separadas por coma. Solo existen **después** de generar las credenciales de build en EAS (`eas credentials`) — no antes |

Mientras falten, ambas rutas responden `404` con un cuerpo explícito
("App Links no configurados todavía") en vez de sobreescribirse con un valor
inventado: un `assetlinks.json` con un paquete o una huella incorrectos falla
la verificación **en silencio**, que es exactamente el riesgo que E9-16
señala.

Cuando los cuatro valores existan, además hay que añadir a `app.json`:

```json
"ios": { "associatedDomains": ["applinks:TU_DOMINIO"] },
"android": { "intentFilters": [{ "action": "VIEW", "autoVerify": true,
  "data": [{ "scheme": "https", "host": "TU_DOMINIO", "pathPrefix": "/portal" }],
  "category": ["BROWSABLE", "DEFAULT"] }] }
```

para que un enlace a `https://TU_DOMINIO/portal/agenda` abra la app instalada
en vez de (o además de) el navegador. Hasta entonces, el esquema propio
`trainingzone://` (ya declarado en `app.json`) sigue funcionando para deep
links dentro de la propia app, que es un mecanismo distinto y no depende de
ningún dominio.

## 4. OTA (`expo-updates`): decisión

**No entra todavía.** Motivos:

1. **No hay build firmada.** OTA distribuye JS sobre una build nativa ya
   publicada; con los identificadores de §1 sin decidir no existe esa build,
   así que no hay nada sobre lo que aplicar una actualización.
2. **Falta política de canal/rollout.** `expo-updates` exige decidir canales
   (`production`/`preview`), una estrategia de *rollback* y quién aprueba una
   publicación OTA — nada de eso está definido, y añadir la dependencia sin
   esa política es dejar un botón de "publicar sin revisión" sin dueño.
3. **Coste de mantenerlo en cero mientras tanto.** `eas.json` ya declara
   `channel` por perfil (`development`/`preview`/`production`) precisamente
   para que activar `expo-updates` el día que haga falta sea añadir la
   dependencia y el plugin, no rediseñar los perfiles de build.

**Se reabre esta decisión cuando** exista al menos una build de producción en
revisión o publicada y haya un incidente o mejora que de verdad necesite
saltarse el ciclo de revisión de tienda (p. ej. un texto legal desactualizado
o un bug de cliente que no toca código nativo).
