# Training Zone — app móvil (portal del socio)

Primera versión ejecutable de la app nativa descrita en
`docs/APP_MOVIL_NATIVA_PLAN.md`: cubre **F0** (API JSON con auth por token),
**F1** (scaffold Expo, auth, navegación, design system) y un primer recorte de
**F2** (portal del socio: mi actividad, reservar clase, notificaciones,
perfil). El backend de negocio no se ha reescrito — la app consume
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
`socio@trainingzone.es` / `demo1234`. Esta primera versión solo soporta el rol
`MEMBER` (el subconjunto de staff es F3, pendiente).

## Qué incluye esta versión

- **Auth por token** (`/auth/login`, `/auth/refresh`, `/auth/logout`): JWT de
  acceso de 15 min + refresh token opaco y rotatorio (`MobileRefreshToken`),
  guardados en `expo-secure-store` (Keychain/Keystore), nunca `AsyncStorage`.
- **Cliente API** (`src/api/client.ts`): reintenta automáticamente en `401`
  refrescando el token; `src/api/queries.ts` expone hooks de TanStack Query.
- **Diseño**: tokens de `docs/BRANDING.md` portados en `src/theme/theme.ts`
  (claro/oscuro), tipografía Poppins, componentes base en `src/components/`.
- **Navegación**: Expo Router con splash/auto-login (`src/app/index.tsx`) y
  tabs del portal (`src/app/(tabs)/`): Actividad, Reservar, Avisos, Perfil.
- **Pantallas** consumiendo la API real: mi actividad (KPIs + actividad
  mensual), reservar/cancelar clase (con saldo de bonos), notificaciones
  (marcar como leída), perfil (logout).

## Qué falta a propósito (fuera de alcance de esta versión)

- **`packages/shared-types`**: los DTO viven duplicados en `src/api/types.ts`
  en vez de un paquete de workspace compartido con la web, para no acoplar el
  bundler de Expo al monorepo de Next en el primer corte. Si el contrato
  crece, extraerlo tal como describe el plan (§2).
- **F3 (staff en móvil), F4 (push/biometría/cámara/offline) y F5
  (publicación en stores)**: no implementados. Iconos/splash usan los
  placeholders de Expo — antes de publicar hace falta el isotipo de marca.
- Validación en dispositivo/simulador real: esta sesión verificó el build con
  `npx tsc --noEmit` y `npx expo export` (bundling completo sin errores), pero
  no hay hardware disponible en este entorno para probar la UX a mano.
