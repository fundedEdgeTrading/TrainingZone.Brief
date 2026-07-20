# TRAINING ZONE

Plataforma de gestión para centros de entrenamiento. Implementación del MVP
descrito en `TRAININGZONE_planfuncionaleimplementacion.md`, fases F0–F5
(fundaciones, socios, agenda, cobros, salud + Session Brief, panel de
control), más los diferenciadores G.1 (Session Loop), G.2 (Semáforo de
Aptitud) y G.3 (Motor de retención).

## Stack

Next.js 16 (App Router) + TypeScript · PostgreSQL + Prisma 7 (driver
adapter `@prisma/adapter-pg`) · Auth.js v5 · Tailwind CSS 4 · Recharts ·
react-big-calendar.

Se eligió Next.js/TypeScript en vez de .NET/Blazor (que también proponía el
documento) por velocidad de iteración en este entorno; el documento original
lo consideraba una alternativa igualmente válida (Parte B.2).

## Puesta en marcha

```bash
# 1. Postgres local (o cualquier instancia postgresql accesible)
createdb trainingzone

# 2. Variables de entorno
cp .env.example .env   # y ajustar DATABASE_URL si hace falta

# 3. Dependencias, esquema y datos de demo
npm install
npx prisma migrate dev
npm run db:seed

# 4. Arrancar
npm run dev
```

Abrir `http://localhost:3000` — redirige a `/login`.

## Autenticación

- **Login demo (activo):** Credentials provider validado contra la tabla
  `User` (bcrypt). Es el que se usa para navegar la plataforma ahora mismo.
- **Microsoft Entra ID (Azure AD):** el proveedor está declarado en
  `src/auth.config.ts` y se activa solo si existen las variables
  `AUTH_MICROSOFT_ENTRA_ID_ID` / `_SECRET` / `_ISSUER` en `.env`, que exigen
  un **App Registration real en un tenant de Azure** — algo que no se puede
  crear desde este entorno. En cuanto el cliente tenga su tenant, basta con
  rellenar esas tres variables: no hace falta tocar código ni desplegar de
  nuevo.

### Usuarios demo (contraseña: `demo1234`)

| Email | Rol | Qué ver |
|---|---|---|
| `sergio@trainingzone.es` | Dirección (Owner) | Panel de control, todos los centros, reglas de aptitud, auditoría |
| `direccion.centro@trainingzone.es` | Dirección de centro | Panel, socios, agenda, cobros, retención (ámbito de su centro) |
| `entrenador@trainingzone.es` | Entrenador (Dani Herrero) | Agenda, Session Brief + Debrief, semáforo de aptitud |
| `recepcion@trainingzone.es` | Recepción | Socios, agenda, cobros — **sin acceso a datos de salud** |
| `rrhh@trainingzone.es` | RRHH | Organización: alta de centros y personal, imputación multi-centro — **sin acceso a datos de salud** |
| `socio@trainingzone.es` | Socio (Marta García López) | Portal: reservar clase, progreso, transparencia de adaptaciones |

También hay entrenadores/recepción/dirección adicionales por centro (ver
`prisma/seed.ts`) para poblar la agenda con datos realistas.

## Datos de demostración

El seed genera, sobre 3 centros ("Centro", "Norte", "Sur"):

- 192 socios con estados realistas (activo, moroso, congelado, prueba, baja)
- ~6 meses de histórico + 2 semanas futuras de sesiones, reservas, check-ins,
  no-shows y lista de espera
- Pagos con métodos variados (tarjeta, Bizum, efectivo, SEPA, transferencia)
  y algunos morosos con recibos fallidos/pendientes
- Registros de salud (lesiones, condiciones crónicas, alergias...) para ~1 de
  cada 4 socios, con consentimiento y reglas del Semáforo de Aptitud
- Debriefs post-sesión (🟢/🟡/🔴) para la mayoría de asistencias pasadas
- Alertas de retención calculadas comparando la frecuencia reciente de cada
  socio contra su línea base personal
- Un log de auditoría con lecturas de datos de salud y aperturas de Session
  Brief

Para regenerar los datos desde cero: `npm run db:seed` (borra y vuelve a
poblar todo).

## Estructura

```
prisma/schema.prisma       Modelo de dominio multi-tenant (orgId en cada tabla);
                            CenterMembership (imputación de personal a centros)
                            y MemberNote (bitácora de observaciones del socio)
prisma/seed.ts              Generador de datos de demo
src/auth.ts, auth.config.ts Auth.js: Credentials (demo) + Microsoft Entra ID (preparado)
src/proxy.ts                 Proxy (antes "middleware"): exige sesión salvo /login
src/lib/rbac.ts              Matriz de permisos por rol + navegación
src/lib/guard.ts             requireRole() — guarda de página por rol
src/lib/health-access.ts     Único punto de lectura de datos de salud + auditoría
src/app/(app)/...            Módulos: dashboard, members, agenda, brief, billing, retention, health, audit, portal, organization
```

## Qué queda fuera de esta entrega (a propósito)

Siguiendo el propio documento (Parte H, riesgos 2 y 8):

- **Facturación VERI\*FACTU** y pasarela de pago online (Stripe): el módulo
  de Cobros aquí solo *registra* el cobro manualmente, no lo procesa ni
  factura. Es una decisión de D3 en el documento, no un olvido.
- **Integración del agente IA de Sergio / `IInsightProvider`** (F6): fuera
  del alcance del MVP (F0–F5) por diseño.
- **Onboarding multi-tenant self-service** (F7): la gestión *dentro* de una
  organización ya está construida (módulo **Organización**: alta de centros y
  personal, e imputación de cada persona a varios centros con rol y % de
  dedicación vía `CenterMembership`). Lo que queda fuera es el alta
  self-service de una organización externa nueva (signup de tenant + SSO).

## Notas de seguridad / RGPD

- Los datos de salud (`HealthRecord`) solo se leen a través de
  `getHealthRecordsForMember()` / `getSessionBrief()`, que aplican la matriz
  de permisos (`canViewHealthData`) y dejan un registro append-only en
  `AuditLog` en cada lectura (ver módulo **Auditoría**, solo Owner/Admin).
- Recepción y el resto de roles sin autorización reciben `null` en vez de
  los registros — nunca un error que revele si existen o no.
- En producción, el propio documento (ADR-005) recomienda mover `health.*` a
  un esquema separado con cifrado a nivel de columna; aquí vive en el mismo
  esquema por simplicidad de la demo, pero el punto de acceso ya está
  centralizado para poder hacer ese cambio sin tocar el resto de la app.
