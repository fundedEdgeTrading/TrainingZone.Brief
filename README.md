# Apta · Training Zone

**Apta** es una plataforma de gestión para centros de entrenamiento personal y
grupos reducidos. **Training Zone** es el cliente piloto y la marca de origen; en
el código, `Organization` es cualquier cliente y Training Zone es una de ellas.

Dos superficies sobre un solo backend:

- **Web app** — Next.js 16 (App Router) + React 19 · PostgreSQL con Prisma 7 y el
  driver adapter `@prisma/adapter-pg` · Auth.js v5 · Tailwind CSS 4 · Recharts ·
  Leaflet · Stripe · Zod · SDK de Anthropic.
- **App nativa** — Expo / React Native en `apps/mobile/`, que consume
  `src/app/api/mobile/v1/**`.

## Qué hace

| Área | En una línea |
|---|---|
| **Socios** | Ficha con consentimientos, estados reales, importación desde CSV y portal propio |
| **Agenda** | Sesiones periódicas, aforo por centro, lista de espera, asistencia y no-show |
| **Cobros** | Cuotas y bonos con Stripe Connect; el dinero va a la cuenta del gimnasio, **sin comisión de Apta** |
| **Salud y aptitud** | Datos del art. 9 con acceso auditado, Semáforo de Aptitud, Session Brief y Debrief |
| **Valoraciones** | Cuestionario configurable por centro, composición corporal y evolución |
| **IA** | Generación de mesociclos con la metodología del centro, con cupo por plan |
| **CRM y marketing** | Leads, etiquetas automáticas, flujos de email, referidos y anuncios |
| **Dirección** | Panel con ingresos, ocupación, LTV, captación y mapa por barrios |
| **Plataforma** | Multi-tenant, multi-centro, planes de licencia y consola de soporte |

## Puesta en marcha

```bash
createdb trainingzone
cp .env.example .env          # y ajustar DATABASE_URL
npm install
npx prisma migrate dev
npm run db:seed
npm run dev                   # http://localhost:3000 → /login
```

Usuarios de demostración, contraseña `demo1234`:

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

La lista completa —dos usuarios por rol y centro— la imprime `npm run db:seed` al
terminar.

## Comprobaciones

```bash
npm run lint
npx tsc --noEmit
npm run test:unit
npm run test:e2e      # Playwright: no lanzar la suite entera si hay sesiones en paralelo
```

## Estructura

```
prisma/schema.prisma        Modelo multi-tenant (orgId en cada tabla)
src/proxy.ts                Exige sesión salvo rutas públicas
src/lib/rbac.ts             Permisos por rol, navegación y gateo por ruta
src/lib/center-scope.ts     Frontera de centro
src/lib/entitlements.ts     Gateo por plan contratado
src/lib/health-access.ts    Único punto de lectura de datos de salud + auditoría
src/lib/*-queries.ts        Capa de consulta por módulo, filtrada por orgId
src/app/(app)/…             Pantallas autenticadas
src/app/api/mobile/v1/…     API JSON de la app nativa
src/app/api/jobs/run        Todas las reglas temporales, en una pasada
apps/mobile/                App nativa Expo
docs/                       Documentación (empezar por docs/README.md)
```

## Documentación

Empieza por **[`docs/README.md`](./docs/README.md)**, que es el índice.

| Documento | Para qué |
|---|---|
| [Arquitectura](./docs/ARQUITECTURA.md) | Multi-tenant, identidad, permisos, invariantes |
| [Producto · Gestión](./docs/PRODUCTO_GESTION.md) | Socios, salud, agenda, bonos, entrenador |
| [Producto · Cobros](./docs/PRODUCTO_COBROS.md) | Stripe en sus dos planos |
| [CRM y marketing](./docs/CRM_Y_MARKETING.md) | Leads, etiquetas, flujos, referidos, panel |
| [SEO y captación](./docs/SEO_Y_CAPTACION.md) | Páginas públicas, indexación, medición |
| [App móvil](./docs/APP_MOVIL.md) | Contrato de la API y la app Expo |
| [Operaciones](./docs/OPERACIONES.md) | Entornos, cron, pruebas, despliegue |
| [Reglas de negocio](./docs/CRM_REGLAS_NEGOCIO.md) | Catálogo `RB-*` |

Dos fuentes que no son documentación pero se leen como tal: `.env.example`
explica cada variable con su porqué, y `prisma/schema.prisma` está comentado
modelo a modelo.

## Antes de escribir código

Lee `AGENTS.md`. Resumen de lo que más cuesta si se ignora:

- Next.js 16, Prisma 7 y Tailwind 4 tienen APIs distintas de las anteriores.
  Las guías están en `node_modules/next/dist/docs/`.
- Toda lectura y escritura con `centerId` pasa por `isCenterInScope` /
  `requireApiCenterScope` — **también en la API móvil**.
- Todo acceso a datos de salud pasa por `health-access.ts` y deja `AuditLog`.
- `prisma/schema.prisma` y `src/lib/rbac.ts` están **congelados**: si hace falta
  tocarlos, se pide.
