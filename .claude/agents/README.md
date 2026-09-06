# Agentes de Apta / TrainingZone

Agentes especializados para delegar trabajo. La regla es simple: **el orquestador decide y coordina; los agentes leen el código**. Delegar bien es lo que evita cargar medio repositorio en la conversación principal.

## Cuándo usar cada uno

| Agente | Delégale… | Escribe código |
|---|---|---|
| `fullstack-next` | Implementar funcionalidad, arreglar un bug concreto, refactorizar en la web app o la API móvil | Sí |
| `stripe-pagos` | Cualquier cosa que toque cobros: Connect, checkout, suscripciones, webhooks, catálogo de productos | Sí |
| `mapas-geodatos` | Mapas de Leaflet, coropletas, geodatos, rendimiento cartográfico | Sí |
| `ui-ux-branding` | Maquetar o rediseñar pantallas, sistema de marca, accesibilidad, motion (web y app nativa) | Sí (JSX/CSS) |
| `devops-cicd` | GitHub Actions, IaC, secretos, entornos, jobs programados, CI en rojo | Sí (infra) |
| `seo-contenidos` | Landing de Apta, SEO técnico y local, metadatos, sitemap, copy público | Sí (público) |
| `ciberseguridad` | Auditar vulnerabilidades en el código o en un cambio antes de mezclarlo | No (propone) |
| `qa-senior` | Regresión completa, cazar bugs e incoherencias con informe reproducible | No |
| `coherencia-e2e` | ¿Tiene sentido el producto de punta a punta? Flujos rotos, funcionalidad huérfana, divergencia web/móvil | No |
| `cumplimiento-normativo` | RGPD y datos de salud, obligaciones fiscales y de facturación, LSSI, accesibilidad, contratos con proveedores | No |
| `negocio-producto` | Priorizar, acotar alcance, precio y monetización, decidir si algo merece la pena | No |
| `entrenador-experto` | ¿Esto encaja con el trabajo de sala? Metodología, briefs, mesociclos, valoraciones | No |
| `socio-experto` | ¿Se entiende y se usa desde el móvil de quien paga la cuota? Portal y app nativa | No |

## Cómo delegar sin quemar contexto

1. **Acota el encargo.** Módulo, ficheros de partida y criterio de aceptación. Un agente con el alcance abierto lee de más.
2. **Encadena, no mezcles.** Lo normal es: `negocio-producto` (¿hacerlo?) → `entrenador-experto` o `socio-experto` (¿así?) → `fullstack-next` (hacerlo) → `ciberseguridad` y `qa-senior` (¿está bien?).
3. **Lanza en paralelo lo que no depende entre sí.** Una revisión de seguridad y una de coherencia sobre el mismo cambio pueden ir a la vez.
4. **Pide el informe, no el volcado.** Los agentes de revisión devuelven hallazgos citados con `fichero.ts:línea`; no hace falta traer el código al hilo principal.
5. **No leas `prisma/schema.prisma` ni `prisma/seed.ts` enteros.** Ni tú ni ellos: se busca el símbolo con `Grep` y se lee con `offset`/`limit`.

## Contexto común a todos

- **Next.js 16 + Prisma 7 + Tailwind 4 + Auth.js v5** con cambios de API respecto a versiones anteriores: la referencia es `node_modules/next/dist/docs/`, no la memoria. En `apps/mobile/`, Expo SDK 57.
- **Multi-tenant**: toda tabla lleva `orgId`, y el ámbito de centro se resuelve por persona (`CenterMembership`).
- **Datos de salud**: solo salen por `src/lib/health-access.ts`, que audita cada lectura.
- **Todo en español**: código comentado en español, copy de usuario en español, informes en español.
