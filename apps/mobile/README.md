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

Abre la app en un simulador/dispositivo o en Expo Go. Por defecto apunta a
`http://localhost:3000/api/mobile/v1` (`app.json` → `expo.extra.apiUrl`); si
pruebas desde un dispositivo físico o emulador Android, cambia esa URL a la IP
de tu máquina en la red local (Android emulator: `10.0.2.2`).

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
  rol, espejo de `NAV_BY_ROLE` (src/lib/rbac.ts). Las pantallas secundarias
  (calendario, evolución, anuncios, avisos, agenda del centro) se abren desde
  Perfil, que hace de índice.

### Pantallas (handoff "App móvil premium")

| Pantalla | Ruta | Endpoint |
|---|---|---|
| A1 Login | `app/login.tsx` | `POST /auth/login` |
| A2 Catálogo del centro | `app/onboarding/planes.tsx` | `GET /products` |
| A3 Confirmar y pagar | `app/onboarding/pago.tsx` | `POST /checkout` |
| B1 Reservar · B2 Confirmar | `app/(tabs)/agenda.tsx` | `GET /portal/agenda`, `POST /portal/agenda/book` |
| B3 Mis sesiones | `app/(tabs)/sesiones.tsx` | `GET /portal/agenda` |
| B4 Mis bonos | `app/(tabs)/bonos.tsx` | `GET /portal/memberships` |
| B5 Mi calendario | `app/(tabs)/calendario.tsx` | `GET /portal/member-calendar?month=` |
| C1 Mi panel | `app/(tabs)/panel.tsx` | `GET /trainer/panel` |
| C2 Agenda · C3 Crear/editar | `app/(tabs)/staff-agenda.tsx` | `GET /agenda`, `POST`/`PATCH`/`DELETE /agenda/sessions` |
| C4 Feedback 1-10 | `app/(tabs)/feedback/[id].tsx` | `GET`/`POST /trainer/sessions/:id/feedback` |
| D1 Panel de control | `app/(tabs)/dashboard.tsx` | `GET /admin/dashboard?centerId=` |
| D2 Socios · D3 Ficha | `app/(tabs)/socios/` | `GET /members`, `/members/:id`, `/members/:id/calendar` |
| D4 Productos · D5 Ficha | `app/(tabs)/productos/` | `GET`/`POST /products`, `PATCH`/`DELETE /products/:id` |
| D6 Equipo · D7 Ficha | `app/(tabs)/organizacion/` | `GET`/`POST /staff`, `PATCH`/`DELETE /staff/:id` |

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
