# App móvil nativa (iOS + Android) — Plan de implementación por fases

> Documento de especificación técnica. Describe cómo llevar Training Zone a una
> app **nativa** para iOS y Android con **React Native / Expo**, reutilizando el
> backend existente. Incluye el reparto en fases, el detalle de cada una y una
> **estimación pensada para ejecutarse aquí, en Claude Code** (sesiones de
> trabajo asistido, no semanas/persona de un equipo tradicional).

---

## 1. Punto de partida: qué se puede reutilizar y qué no

La decisión de esfuerzo depende por completo de cómo está construida la app
actual. El análisis del código da un diagnóstico claro:

| Capa | Tecnología actual | ¿Reutilizable en React Native? |
|------|-------------------|--------------------------------|
| **Datos / dominio** | `src/lib/*-queries.ts` (34 modelos Prisma, ~12 módulos de queries) — funciones TypeScript puras que reciben `orgId`/`centerId` | ✅ **Sí, tal cual.** Es el activo más valioso. |
| **Reglas de negocio / RBAC** | `src/lib/rbac.ts`, `guard.ts`, `notifications.ts`, motores de reglas (`trainer-alerts`, `stall-detection`, `checkin-schedule`…) | ✅ **Sí**, se invocan desde la nueva capa API. |
| **Transporte** | **Server Actions** (59 funciones `"use server"`) + Server Components | ❌ **No.** Los Server Actions son un RPC propio del modelo de Next/React; React Native no puede invocarlos. Hay que exponer una **API JSON**. |
| **UI** | 28 páginas Server/Client Components + Tailwind v4 | ❌ **No.** Se reescribe con componentes nativos. La lógica de presentación (formato, agrupaciones) sí se puede portar. |
| **Auth** | NextAuth v5, estrategia **JWT** + Credentials | ⚠️ **Parcial.** El motor sirve; la sesión por **cookie** no encaja en móvil. Hace falta un flujo por **token bearer**. |
| **Pagos** | Stripe (`stripe-checkout.ts`, webhook) | ⚠️ Requiere **Stripe React Native SDK** y respetar las reglas de las stores (ver §7). |

**Conclusión de dimensionamiento:** no es un "empaquetado" de la web (eso sería
Capacitor y se sentiría como web). El trabajo real es **(a)** construir una capa
**API JSON con auth por token** sobre la lógica ya existente, y **(b)** una
**UI nativa nueva** en Expo. El backend de negocio no se reescribe: se expone.

### Recomendación estratégica de alcance

La plataforma son **dos apps en una**: el **CRM de gestión** (staff: dashboard,
leads, agenda, cobros, RRHH, auditoría…) y el **portal del socio** (member:
actividad, reservar clase, evolución, plan, chat).

- El **portal del socio** es el candidato natural a app nativa: los socios
  quieren una app en el móvil (reservar, ver su plan, chatear, notificaciones).
- El **staff** trabaja mayoritariamente en escritorio; en móvil solo tiene
  sentido un subconjunto operativo (agenda del día, *Session Brief*, check-in,
  ficha de socio, leads rápidos).

Por eso el plan prioriza **primero el portal del socio** como MVP nativo y deja
el panel de staff como fase posterior y acotada.

---

## 2. Arquitectura objetivo

```
┌──────────────────────────┐      ┌──────────────────────────┐
│   App Expo (iOS/Android)  │      │   Web Next.js (actual)    │
│   React Native + Expo     │      │   Server Components/UI    │
│   Router, React Query     │      │   (sin cambios)           │
└───────────┬──────────────┘      └───────────┬──────────────┘
            │  HTTPS + Bearer JWT              │  Server Actions
            ▼                                  ▼
    ┌───────────────────────────────────────────────────┐
    │        Capa API JSON  (nueva)                      │
    │   src/app/api/mobile/**  (Route Handlers)          │
    │   Auth por token · Zod · mismo RBAC/guard          │
    └───────────────────────┬───────────────────────────┘
                            ▼
    ┌───────────────────────────────────────────────────┐
    │   Lógica de negocio EXISTENTE (sin cambios)        │
    │   src/lib/*-queries.ts · rbac · notifications      │
    └───────────────────────┬───────────────────────────┘
                            ▼
                    Prisma · PostgreSQL
```

Decisiones clave:

- **Monorepo o repo aparte:** empezar dentro de este repo en `apps/mobile`
  (workspace) para compartir tipos con `src/lib`. La API vive en el mismo
  proyecto Next (`src/app/api/mobile`), desplegada con la web.
- **Contrato tipado extremo a extremo:** los tipos de retorno de las queries ya
  existen (`type LeadWriteResult`, etc.). Se exportan a un paquete
  `packages/shared-types` que consumen API y app. Evita divergencias.
- **Estado remoto en la app:** **TanStack Query (React Query)** para
  caché/reintentos/optimistic updates. Es el equivalente móvil de lo que hoy
  resuelven Server Components + `revalidatePath`.
- **Navegación:** **Expo Router** (file-based, familiar respecto a App Router).
- **Build & entrega:** **EAS Build** + **EAS Submit** (Expo) para compilar en la
  nube y subir a TestFlight / Google Play sin Mac local obligatorio.

> ⚠️ **Nota sobre la versión de Next.js de este repo:** `AGENTS.md` advierte que
> esta versión de Next (16.2.10) tiene cambios de API respecto a lo conocido.
> **Antes de escribir los Route Handlers de la API móvil hay que leer la guía
> correspondiente en `node_modules/next/dist/docs/`** (Route Handlers, runtime,
> headers/cookies). No asumir la firma clásica.

---

## 3. Reparto en fases (visión general)

| Fase | Objetivo | Entregable | Estimación en Claude Code |
|------|----------|------------|---------------------------|
| **F0** | Cimientos: capa API + auth por token + tipos compartidos | API JSON navegable y autenticada | **4–6 sesiones** |
| **F1** | Scaffold Expo, auth, navegación, design system | App que arranca, login y shell navegable | **3–4 sesiones** |
| **F2** | Portal del socio (MVP nativo) | App del socio funcional end-to-end | **6–8 sesiones** |
| **F3** | Subconjunto de staff en móvil | Agenda + Brief + ficha + leads | **6–9 sesiones** |
| **F4** | Capacidades nativas | Push, biometría, cámara, offline básico | **4–6 sesiones** |
| **F5** | Publicación en stores | Builds firmadas en TestFlight y Play | **2–3 sesiones** |

**Total orientativo: ~25–36 sesiones de trabajo asistido.** Una "sesión" ≈ un
bloque de trabajo enfocado de Claude Code (implementar + probar + iterar sobre
un área acotada). El MVP publicable del **portal del socio** (F0→F2→F4 parcial→F5)
son ~**16–20 sesiones**; el panel de staff (F3) es incremental sobre esa base.

> Estas cifras asumen que Claude Code escribe el código, los tests y la
> configuración, y que una persona valida en dispositivo y aporta las
> credenciales externas (cuentas Apple/Google, claves push, Stripe). Los
> tiempos de **revisión de las stores** (Apple 1–3 días, Google horas–1 día) son
> externos y no cuentan como sesiones.

---

## 4. Fase 0 — Cimientos: capa API + auth por token

**Objetivo:** exponer la lógica existente como API JSON consumible desde móvil,
sin tocar la lógica de negocio.

### Alcance
1. **Estructura API:** `src/app/api/mobile/v1/**` con Route Handlers. Versionado
   `v1` desde el principio (las stores obligan a mantener versiones viejas
   mientras haya usuarios sin actualizar).
2. **Auth móvil por token:**
   - Endpoint `POST /api/mobile/v1/auth/login` (email+password → valida con el
     mismo `bcrypt`/tabla `User` que el provider Credentials actual).
   - Emitir **access token (JWT corto, ~15 min)** + **refresh token (largo,
     rotatorio)**. Reutilizar el secreto/estrategia JWT de NextAuth donde sea
     posible.
   - `POST /auth/refresh`, `POST /auth/logout`.
   - Middleware `requireApiSession(req)` — equivalente a `requireSession()`/
     `guard.ts` pero leyendo `Authorization: Bearer` en vez de cookie, y
     devolviendo `401`/`403` JSON en vez de `redirect()`.
3. **Reutilizar RBAC:** envolver las queries con los mismos checks de
   `rbac.ts`/`requireRole`/`requireCenterRole`, adaptados a respuesta JSON.
4. **Validación:** `zod` (ya es dependencia) en cada endpoint de entrada.
5. **Contrato tipado:** `packages/shared-types` con los DTO de request/response,
   derivados de los tipos que ya devuelven las queries.
6. **Endpoints iniciales** (los del portal, para desbloquear F2):
   `GET /me`, `GET /portal/activity`, `GET /portal/agenda` + `POST /portal/agenda/book`,
   `GET /portal/plan`, `GET /portal/evolucion`, `GET/POST /portal/chat`,
   `GET /notifications` + `POST /notifications/:id/read`.
7. **Errores y formato:** envoltura uniforme `{ ok, data | error }`, coherente
   con el patrón `LeadActionResult` ya usado.
8. **Tests:** de contrato (Playwright/API o Vitest) por endpoint.

### Riesgos / notas
- **Multi-tenant:** todo endpoint deriva `orgId` del token, nunca del cliente.
  Es la invariante de seguridad más importante (aislamiento por tenant).
- **CORS** no aplica a apps nativas, pero sí conviene bloquear orígenes web
  ajenos si se reutiliza la API.
- Leer la guía de **Route Handlers** de esta versión de Next antes de codificar.

**Estimación: 4–6 sesiones.** (La auth por token y el middleware RBAC concentran
el grueso; los endpoints de lectura son mecánicos una vez fijado el patrón.)

---

## 5. Fase 1 — Scaffold Expo, auth, navegación y design system

**Objetivo:** una app que arranca en iOS y Android, hace login contra la API de
F0 y presenta el esqueleto de navegación con el sistema visual de marca.

### Alcance
1. **Proyecto Expo** en `apps/mobile` (Expo SDK más reciente, TypeScript,
   Expo Router). Configurar `PLAYWRIGHT`/EAS no aplica; sí `eas.json`.
2. **Cliente API:** wrapper `fetch` con inyección de Bearer, refresh automático
   en `401`, y **almacenamiento seguro del token** con `expo-secure-store`
   (Keychain iOS / Keystore Android) — nunca `AsyncStorage` para tokens.
3. **TanStack Query** con configuración de caché/reintentos y persistencia.
4. **Flujo de auth:** pantallas Login / splash / *auto-login* con token guardado
   / logout. Manejo de sesión expirada.
5. **Design system nativo:** portar tokens de `docs/BRANDING.md` y
   `UX_PREMIUM_PLAN.md` (colores, tipografía, radios, sombras) a un tema RN
   (p. ej. `theme.ts` + componentes base: Button, Card, Field, Badge, Toast,
   EmptyState — espejo de `src/components/ui/*`). Soporte claro/oscuro.
6. **Navegación por rol:** replicar `NAV_BY_ROLE` (`rbac.ts`) → tabs/stack según
   el rol devuelto por `/me`. El socio ve las tabs del portal; el staff, las
   suyas (en F3).
7. **i18n:** la app es en español; dejar preparado el sistema de textos.

**Estimación: 3–4 sesiones.**

---

## 6. Fase 2 — Portal del socio (MVP nativo)

**Objetivo:** app del socio completa y usable de punta a punta. Es el MVP que
justifica publicar.

### Pantallas (espejo de `src/app/(app)/portal/**`)
1. **Mi actividad** (`/portal`) — resumen + gráfico de actividad
   (`activity-chart.tsx` → librería de charts nativa, p. ej. `victory-native`
   o `react-native-gifted-charts`).
2. **Reservar clase** (`/portal/agenda`) — lista/calendario de sesiones y acción
   de reserva (`booking-button.tsx` → mutación `POST /portal/agenda/book`), con
   *optimistic update*.
3. **Mi evolución** (`/portal/evolucion`) — composición corporal e histórico
   (reutiliza la lógica de `composition-view.ts`/rangos de referencia; render
   con charts nativos).
4. **Mi plan** (`/portal/plan`) — programa de entrenamiento
   (`workout-programs.ts`) y confirmación.
5. **Chat** (`/portal/chat`) — hilo con el entrenador (`lib/chat.ts`,
   `Conversation`/`ChatMessage`). Polling con React Query en F2; realtime en F4.
6. **Perfil / consentimientos** — datos del socio y gestión de consentimientos
   (RGPD) ya modelados en `Member`.

### Transversal
- Estados de carga (skeletons), vacío y error nativos.
- *Pull-to-refresh* y paginación donde aplique.
- Accesibilidad (labels, tamaños táctiles).

**Estimación: 6–8 sesiones.** (Chat y evolución/charts son las pantallas más
densas; reservar y plan son más directas.)

---

## 7. Fase 3 — Subconjunto de staff en móvil

**Objetivo:** llevar a móvil solo lo que el staff necesita *en el gimnasio*, no
todo el CRM. Requiere ampliar la API (F0) con los endpoints de staff.

### Pantallas priorizadas
1. **Agenda del día** (`/agenda`) — sesiones del centro, cambio de centro
   (`center-switcher.tsx`), detalle de sesión y **check-in**
   (`checkin-button.tsx`, `ep-session-controls.tsx`). Alto valor en móvil.
2. **Session Brief** (`/brief`) — la ficha de preparación de sesión; pensada para
   consultarse en el momento. Alto valor.
3. **Ficha de socio** (`/members/[id]`) — perfil, composición, notas, chat de
   staff, workout. Solo lectura + acciones rápidas al principio.
4. **Leads rápidos** (`/leads`) — alta y seguimiento básico desde el móvil
   (captar un lead en recepción/evento).
5. **Notificaciones/tareas** (`notifications`) — bandeja del motor F10.
6. **Fichaje** (`TimeClockEntry`) — fichar entrada/salida desde el móvil, encaja
   muy bien con geolocalización.

*Fuera de alcance móvil (se quedan en web):* RRHH, auditoría, organización,
reglas de aptitud/rangos, cobros administrativos, dashboards analíticos densos.

**Estimación: 6–9 sesiones** (depende de cuántos módulos de staff se incluyan;
es incremental — se puede lanzar con 1–2 y ampliar).

---

## 8. Fase 4 — Capacidades nativas

**Objetivo:** lo que justifica que sea *nativa* y no una web. Se apoya en modelos
que ya existen.

1. **Notificaciones push** (`expo-notifications` + Expo Push, o FCM/APNs
   directo). El modelo `Notification` y el motor `lib/notifications.ts` ya
   generan los eventos (24h sin responsable, pocas sesiones, valoración
   pendiente, oferta sugerida, estancamiento, check-ins). Trabajo:
   - Registro de *push token* por dispositivo (nueva tabla `DeviceToken`).
   - Enviar push cuando `createNotification()` dispara (hook en el motor).
   - *Deep links* a la entidad (`entityType`/`entityId` ya se guardan).
2. **Biometría** (`expo-local-authentication`) — desbloqueo con Face ID /
   huella para re-autenticación rápida.
3. **Cámara / archivos** (`expo-image-picker`, `expo-camera`):
   - Foto de perfil del socio (`photoUrl`, hoy data URL).
   - **Escaneo/subida de informes Tanita** (composición corporal): foto o PDF →
     el parser `tanita-parse.ts` ya existe en el backend.
4. **Offline básico** — persistencia de React Query + cola de mutaciones para
   agenda/check-in con conectividad intermitente.
5. **Geolocalización** — opcional, para validar fichaje en el centro.

**Estimación: 4–6 sesiones.** (Push es la más laboriosa por la parte servidor +
credenciales APNs/FCM; el resto son integraciones de SDK acotadas.)

> **Pagos y stores (Stripe):** cobros de servicios físicos (cuotas de gimnasio,
> EP) se pueden hacer con **Stripe** en la app sin infringir reglas de Apple/
> Google (los bienes/servicios "físicos" no obligan a *in-app purchase*). Usar
> `@stripe/stripe-react-native`. **No** vender contenido puramente digital de
> consumo in-app sin pasar por IAP. Confirmar el caso concreto antes de publicar.

---

## 9. Fase 5 — Publicación en stores

**Objetivo:** builds firmadas y disponibles en TestFlight (iOS) y Google Play
(Android), listas para revisión.

### Alcance
1. **Cuentas y credenciales** (aporta el cliente, no Claude Code):
   - Apple Developer Program (99 $/año) + certificados/perfiles (gestiona EAS).
   - Google Play Console (25 $ pago único).
2. **Configuración de app:** `app.json`/`app.config.ts` — bundle id, iconos,
   *splash*, permisos (cámara, notificaciones, ubicación), versiones.
3. **EAS Build** (perfiles `development`, `preview`, `production`) y **EAS
   Submit** a TestFlight y Play Internal Testing.
4. **Fichas de store:** capturas, descripciones, política de privacidad (RGPD:
   la app maneja datos de salud → declaración de datos obligatoria en ambas
   stores; *App Privacy* de Apple y *Data safety* de Google).
5. **OTA updates** (`expo-updates`) para parches JS sin re-revisión de store.
6. **Checklist de revisión:** cuenta de prueba para el revisor, justificación de
   permisos, cumplimiento de datos de salud.

**Estimación: 2–3 sesiones** (de configuración; la revisión de las stores es
tiempo de espera externo, no de trabajo).

---

## 10. Estimación consolidada

| Escenario | Fases | Sesiones (aprox.) |
|-----------|-------|-------------------|
| **MVP publicable — Portal del socio** | F0 + F1 + F2 + push (parte de F4) + F5 | **16–20** |
| **+ Staff operativo en móvil** | añadir F3 + resto F4 | **+8–13** |
| **Completo** | F0–F5 | **25–36** |

Factores que **suben** el coste: número de módulos de staff en móvil, offline
robusto, realtime en chat, ampliar cobertura de tests E2E en dispositivo.
Factores que lo **bajan**: limitar el MVP al portal del socio, aceptar polling
en vez de realtime al inicio, y que la lógica de negocio ya esté (lo está).

### Dependencias que **no** dependen de Claude Code (bloqueantes externos)
- Cuentas Apple Developer y Google Play (y sus pagos).
- Credenciales push (APNs key de Apple, proyecto FCM de Google).
- Claves Stripe de producción y decisión sobre el modelo de cobro en store.
- Un dispositivo físico (o simulador) para validación de UX y biometría/cámara.
- Los **tiempos de revisión** de las stores.

---

## 11. Recomendación de arranque

1. **Empezar por F0** (capa API + auth por token). Es el cimiento y el mayor
   riesgo técnico; hasta que no exista, la app no puede consumir nada.
2. **Validar F0 con un cliente mínimo** (incluso `curl`/tests) antes de montar la
   UI, para congelar el contrato.
3. **F1 + F2 = MVP del socio.** Es lo que da valor tangible y publicable antes.
4. **Publicar pronto** (F5) con el portal del socio; iterar staff (F3) y
   capacidades (F4) sobre una app ya en las stores con OTA updates.

> **Regla de oro del proyecto:** no se reescribe el backend. Cada endpoint nuevo
> es una fina capa de transporte + validación + RBAC sobre `src/lib/*`. Si en
> algún punto hace falta duplicar lógica de negocio en la app, es señal de que
> ese cálculo debería vivir (o exponerse) en el backend.
