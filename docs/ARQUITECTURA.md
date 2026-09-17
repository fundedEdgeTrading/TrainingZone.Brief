# Arquitectura

Cómo está construida la plataforma y qué reglas no se negocian. Para la forma de
los datos, la fuente es `prisma/schema.prisma`, comentado modelo a modelo.

---

## 1. Stack y estructura

**Web app** — Next.js 16 (App Router) + TypeScript · PostgreSQL con Prisma 7 y el
driver adapter `@prisma/adapter-pg` · Auth.js v5 · Tailwind CSS 4 · Recharts ·
Leaflet · Stripe SDK · Zod · SDK de Anthropic para la generación de rutinas.

**App móvil** — Expo / React Native con expo-router y TanStack Query, en
`apps/mobile/`. No reimplementa negocio: consume `src/app/api/mobile/v1/**`.

```
prisma/schema.prisma        Modelo de dominio multi-tenant (orgId en cada tabla)
prisma/seed.ts              Generador de datos de demo
src/proxy.ts                Proxy (el "middleware" de Next 16): exige sesión salvo rutas públicas
src/auth.ts, auth.config.ts Auth.js: Credentials + Microsoft Entra ID + Google
src/lib/rbac.ts             Matriz de permisos por rol, navegación y gateo por ruta
src/lib/guard.ts            requireRole() / guardas de página con ámbito de centro
src/lib/center-scope.ts     Frontera de centro: isCenterInScope / isMemberInScope
src/lib/entitlements.ts     Gateo por plan contratado: requireFeature()
src/lib/health-access.ts    Único punto de lectura de datos de salud + auditoría
src/lib/*-queries.ts        Capa de consulta por módulo; todo filtrado por orgId
src/app/(app)/...           Pantallas autenticadas
src/app/api/mobile/v1/...   API JSON con auth por token para la app nativa
src/app/api/jobs/run        Todas las reglas temporales, en una sola pasada
apps/mobile/                App nativa Expo
```

**Reparto de capas.** Las pantallas no hablan con Prisma: llaman a
`src/lib/<modulo>-queries.ts`, que es donde se aplica el `orgId` y el ámbito de
centro. Los módulos **puros** (sin Prisma ni `next/*`) existen a propósito y son
los que se pueden probar sin base de datos y, sobre todo, importar desde
componentes de cliente sin arrastrar `prisma` —y `pg` con él— al bundle del
navegador. Ese es el motivo de que `tags.ts` viva aparte de `tags-queries.ts`,
`coupon-code.ts` de `stripe-coupons.ts`, `referral-program.ts` de `referrals.ts`
y `flows/safety.ts` de `flows/engine.ts`.

---

## 2. Multi-tenant: organización, centro y ámbito

Una **organización** (`Organization`) es un cliente de Apta. Tiene **centros**
(`Center`), y cada tabla del dominio lleva `orgId`. Todas las consultas filtran
por el `orgId` de la sesión: nunca se cruzan datos entre organizaciones.

Dentro de una organización, el rol **no** dice en qué centro manda una persona.
Eso lo dice su imputación real: su centro base (`User.centerId`) más las filas de
`CenterMembership`, que permiten repartir a una persona entre varios centros con
rol y porcentaje de dedicación.

> **Invariante.** Toda lectura y toda escritura con `centerId` pasa por
> `isCenterInScope` / `isMemberInScope` (`src/lib/center-scope.ts`), y en la API
> móvil por `requireApiCenterScope`. `null` significa *sin frontera* y solo lo
> tienen los roles de ámbito organización (`OWNER`, `PLATFORM_ADMIN`) — dentro de
> su organización, nunca fuera.
>
> El fallo que más se repite es el **espejo móvil**: una ruta de la web con el
> ámbito aplicado y su equivalente en `api/mobile/v1` sin él. Cualquier pantalla
> nueva se construye en los dos sitios con la misma guarda.

**Identidad separada de la membresía.** `Identity` es la credencial (email +
contraseña, única global) y `User` es la pertenencia a una organización. Así una
misma persona puede ser socia de un centro y entrenadora de otro con un solo
login. `src/lib/identity.ts` es el **único** módulo que maneja contraseñas: nadie
más importa `bcrypt`, y ahí viven el coste de hash, la longitud mínima y el hash
de descarte que hace que el login tarde lo mismo exista o no el email.

---

## 3. Autenticación

| Proveedor | Estado |
|---|---|
| **Credentials** | Activo. Valida contra `Identity` con bcrypt. Es el que se usa hoy |
| **Microsoft Entra ID** | Declarado en `src/auth.config.ts`; se activa solo con `AUTH_MICROSOFT_ENTRA_ID_ID` / `_SECRET` / `_ISSUER` |
| **Google** | Igual: declarado y listo, el botón aparece deshabilitado hasta que existan `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` |

Ninguno de los dos OAuth exige tocar código ni volver a desplegar: son variables
de entorno.

`src/proxy.ts` exige sesión para todo lo que no esté en `PUBLIC_PATHS`
(`src/lib/public-paths.ts`). No importa `@/auth` a propósito —ese módulo carga
Prisma, que no corre en el runtime del proxy—: comprueba el JWT con
`next-auth/jwt`.

La app nativa no puede leer la cookie de sesión, así que tiene su propio
mecanismo: access token JWT de 15 minutos sin estado y refresh token opaco y
rotatorio de 30 días persistido en `MobileRefreshToken`, para poder revocar el
acceso de un dispositivo concreto (`src/lib/mobile-auth.ts`).

Defensa del login: `src/lib/login-throttle.ts`.

---

## 4. Permisos: tres capas que se suman

Un usuario ve una pantalla solo si pasa **las tres**.

### 4.1 Rol (`src/lib/rbac.ts`) — fichero congelado

Ocho roles:

| Rol | Qué es |
|---|---|
| `PLATFORM_ADMIN` | Soporte de Apta: organizaciones, anuncios y auditoría |
| `OWNER` | Dirección de la organización. Manda en todos sus centros |
| `CENTER_DIRECTOR` | Dirección de centro. Acotada a los suyos |
| `TRAINER_ADMIN` | Entrenador con mando sobre su centro: aforo por defecto y ajuste de bonos |
| `TRAINER` | Entrenador |
| `RECEPTION` | Recepción. **Sin acceso a datos de salud** |
| `HR_MANAGER` | RRHH: personal e imputación a centros. **Sin acceso a datos de salud** |
| `MEMBER` | Socio: portal y app |

`NAV_BY_ROLE` no es solo el menú: es la declaración de qué módulos existen para
cada rol, agrupados en cinco secciones (`Vista general`, `Día a día`,
`Crecimiento`, `Salud y aptitud`, `Administración`) más las dos del socio
(`Entrenar`, `Membresía`). Los rótulos y la tabla de permisos son **fuente única
compartida entre web y app**: copiarlos "como espejo" en la app ya provocó un
fallo documentado.

Las guardas de página están en `src/lib/guard.ts` (`requireRole`, y su versión
con centro), y las de la API móvil en `src/app/api/mobile/v1/_lib/`.

### 4.2 Plan contratado (`src/lib/entitlements.ts` + `FEATURE_BY_ROUTE`)

Siete capacidades gateables, definidas en `src/lib/platform-plans.ts`:
`salud_aptitud`, `retencion`, `feedback_direccion`, `bi_avanzado`,
`exportaciones`, `ia_programacion` y `marketing_automatizado`.

`FEATURE_BY_ROUTE` (en `rbac.ts`) es **declarativo y se hereda por prefijo**:
`/flujos` cubre `/flujos/[id]/panel` sin entrada propia.

> **Invariante.** Una ruta nueva bajo un prefijo gateado que no llame a
> `requireFeature` debe fallar en `rbac-gating.test.ts`, no en producción.

Lo que **no** se gatea, y es deliberado:

- `/dashboard` — es la pantalla de aterrizaje de dirección; cerrarla dejaría a un
  cliente Esencial mirando un muro de pago en cada login. Lo gateado es el BI
  avanzado *dentro* del panel.
- `/audit` — el responsable del tratamiento es el gimnasio: ante un requerimiento
  del art. 32 RGPD tiene que poder acreditar quién accedió a los datos de salud
  sin depender de haber comprado un plan superior. Lo que sí se gatea es la
  **exportación** masiva (`api/audit/export`, funcionalidad `exportaciones`).
- `/leads` y `/anuncios` — están en la misma sección del menú que etiquetas,
  flujos y referidos, pero siguen siendo de todos los planes. Lo que se cobra es
  la automatización, no poder apuntar a quien entra por la puerta.
- `retencion` no tiene ruta: la pantalla se retiró y el motor vive en
  `src/lib/retention.ts`, disparado por el cron. El gateo está donde se produce
  el valor — sin la funcionalidad no se calculan alertas.

**El registro de datos nunca se gatea.** Un cliente que baja de plan deja de ver
paneles, no deja de poder guardar una lesión ni de exportar lo suyo.

### 4.3 Estado de la suscripción de plataforma

`PlatformStatus` decide si la aplicación es usable:

| Estado | Qué implica |
|---|---|
| `PENDING_PAYMENT` | Registrada, sin pagar. Muro. Purgable por TTL |
| `TRIALING` / `ACTIVE` | Operativa |
| `PAST_DUE` | El cobro recurrente falló; periodo de gracia |
| `SUSPENDED` | Impago persistente: solo lectura. **Nunca se purga** |
| `CANCELLED` | Baja definitiva |

Solo `ACTIVE` y `TRIALING` son operativos (`OPERATIONAL_PLATFORM_STATUSES`).

---

## 5. Datos de salud

Categoría especial del art. 9 RGPD, y la parte del sistema con las reglas más
estrictas.

> **Invariante.** Todo acceso pasa por `src/lib/health-access.ts`
> (`getHealthRecordsForMember()`, `getSessionBrief()`), que aplica
> `canViewHealthData` y escribe una fila append-only en `AuditLog` en **cada
> lectura**. Los roles sin autorización reciben `null`, nunca un error que
> revele si el dato existe.

- `AuditLog` es append-only para el rol de la aplicación: `E10-14` revoca
  `UPDATE` y `DELETE`. El `DELETE` se dejó fuera del trigger justamente para que
  el motor de conservación pueda purgar, con una conexión de mantenimiento
  distinta (`DATA_RETENTION_DATABASE_URL`).
- Las **fotos de progreso** (frontal, perfil y espalda, habitualmente en ropa
  interior) no viven en la base: la columna guarda una referencia y el fichero
  vive fuera, cifrado con AES-256-GCM (`src/lib/column-crypto.ts`,
  `PROGRESS_PHOTO_KEY` / `PROGRESS_PHOTO_DIR`), fuera de `public/` y servido por
  enlace firmado.
- Lo que viaja a la IA se pseudonimiza antes (`src/lib/ai/pseudonymize.ts`) y
  solo con consentimiento explícito (`canUseClinicalDataForAI`).
- La región donde vive la base de datos se declara (`DATA_REGION`) y debe
  coincidir con `DECLARED_DATA_REGION`: si no coincide, o apunta fuera del EEE,
  **el servidor no arranca**. Mover la base es una transferencia internacional
  que hay que declarar.

---

## 6. Otras invariantes del dominio

Estas se comprueban en test y romperlas es un fallo, no una decisión de estilo.

| Invariante | Dónde vive |
|---|---|
| Ninguna operación mueve `sessionsRemaining` sin escribir en `SessionLedger` | `src/lib/session-ledger.ts` |
| Las transiciones de reserva pasan por `assertBookingTransition`; `CANCELLED` y `WAITLISTED` **nunca** llegan a `ATTENDED`, en ninguno de los cuatro puntos de escritura | `src/lib/booking-transitions.ts` |
| La ventana de cancelación llega del servidor —horas en `CANCEL_WINDOW_HOURS`, instante calculado en la zona horaria **del centro**, no en la cookie `tz`— y el mismo cálculo pinta el distintivo y ejecuta la cancelación. Cero literales de horas en el cliente | `CANCEL_WINDOW_HOURS`, `canCancelWithoutPenalty` y `enforcementStartsAt` en `src/lib/portal-queries.ts` |
| Nunca se borra un `Price` de Stripe: se archiva. Toda creación lleva clave de idempotencia | `src/lib/stripe-idempotency.ts` |
| `Member.state` lo mueve un solo módulo | `src/lib/member-lifecycle.ts` |
| Rótulos y tabla de permisos: fuente única compartida entre web y app | `src/lib/rbac.ts`, `src/lib/service-labels.ts` |

**Ficheros congelados:** `prisma/schema.prisma` y `src/lib/rbac.ts`. No se editan
sin pasar por integración.

---

## 7. Seguridad de transporte y cabeceras

`src/lib/security-headers.ts` define la política (CSP como lista blanca, HSTS,
anti-clickjacking) y `next.config.ts` la aplica. Vive en un módulo propio, y no
dentro de la configuración, porque una política que no se puede leer en un test
se erosiona sola: `security-headers.test.ts` la fija.

La CSP abre exactamente lo que la aplicación usa: las teselas de CartoDB para los
mapas de Leaflet, `data:` para fotos y logos, y poco más.

---

## 8. Alta de una organización: pago primero

El alta comercial está invertida respecto a lo habitual: **la organización nace
del webhook de Stripe**, no de un formulario. No existen organizaciones pre-pago
esperando a que alguien pague; lo que existe es `PENDING_PAYMENT` con su muro y
su purga por TTL para los casos que se quedan a medias.

El recorrido completo —landing, pago, alta de la empresa, alta de su gente y
venta de sus propias cuotas dentro de Apta, todo con un login único— está
descrito en [PRODUCTO_COBROS.md](./PRODUCTO_COBROS.md) §2, y el aprovisionamiento
en `src/lib/provisioning.ts`.
