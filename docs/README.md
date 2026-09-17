# Documentación · Apta / Training Zone

**Apta** es el producto: un SaaS de gestión para centros de entrenamiento personal
y grupos reducidos. **Training Zone** es el cliente piloto y la marca con la que
nació el proyecto; en el código, `Organization` es cualquier cliente de Apta y
Training Zone es una de ellas.

Dos superficies, un solo backend:

| | Web app | App móvil |
|---|---|---|
| Stack | Next.js 16 (App Router), React 19, Prisma 7, Auth.js v5, Tailwind 4 | Expo / React Native, expo-router, TanStack Query |
| Quién la usa | Dirección, entrenadores, recepción, RRHH, socio | Socio, entrenador, dirección, recepción, RRHH |
| Código | `src/` | `apps/mobile/` |
| Datos | Postgres vía Prisma | `src/app/api/mobile/v1/**` sobre las mismas consultas |

## Mapa de esta carpeta

| Documento | Qué contesta |
|---|---|
| [ARQUITECTURA.md](./ARQUITECTURA.md) | Cómo está construido: multi-tenant, identidad, roles, gateo por plan, capas de acceso a datos, seguridad y las invariantes que no se negocian |
| [PRODUCTO_GESTION.md](./PRODUCTO_GESTION.md) | Socios, salud y aptitud, valoraciones y composición corporal, agenda, bonos, Session Brief, mesociclos por IA, tareas, organización y RRHH |
| [PRODUCTO_COBROS.md](./PRODUCTO_COBROS.md) | Los dos planos de cobro, Stripe Connect, suscripciones, morosidad, SEPA, cupones, reembolsos, disputas y contabilidad |
| [CRM_Y_MARKETING.md](./CRM_Y_MARKETING.md) | Leads, etiquetas, flujos de email, referidos, anuncios, correo transaccional y el panel de dirección |
| [SEO_Y_CAPTACION.md](./SEO_Y_CAPTACION.md) | Páginas públicas, reglas de indexación, datos estructurados, sitemap, analítica sin cookies y medición |
| [APP_MOVIL.md](./APP_MOVIL.md) | La app Expo y el contrato de la API móvil |
| [OPERACIONES.md](./OPERACIONES.md) | Entornos, variables, trabajos programados, despliegue, pruebas y CI |
| [CRM_REGLAS_NEGOCIO.md](./CRM_REGLAS_NEGOCIO.md) | Catálogo numerado de reglas de negocio (`RB-*`). Es la referencia que citan el código y el resto de documentos |
| [BRANDING.md](./BRANDING.md) | Identidad visual y su traducción a tokens |
| [MODULOS_APARCADOS.md](./MODULOS_APARCADOS.md) | Qué se ha apagado, cuándo y por qué. Se oculta, no se borra |
| [TRABAJO_EN_PARALELO.md](./TRABAJO_EN_PARALELO.md) | Cómo se desarrolla con varias sesiones a la vez: pistas, ventanas de merge y las tres reglas que no se rompen |

### Carpetas

| Carpeta | Qué es |
|---|---|
| [`legal/`](./legal/) | Expediente de cumplimiento para revisión jurídica. **Borradores sin firmar**: nada de ahí se publica tal cual |
| [`hu/`](./hu/) | Las 192 historias de usuario troceadas por épica. **Material de trabajo vivo**: es lo que consumen las sesiones en paralelo |
| [`seo/`](./seo/) | Línea base de medición de SEO, para poder comparar dentro de tres meses |

### Documentos de un lote en curso

Se borran cuando el lote cierra; no son referencia permanente.

- `PLAN_LOTE3_PANEL_Y_MARKETING_2026-09-15.md` — reparto y prompts del lote en ejecución.
- `DIAGNOSTICO_PANEL_2026-09.md` — medición previa a la corrección de las métricas del panel (E14-01).

## Documentos retirados y dónde vive ahora su contenido

Se retiraron 28 documentos: planes por fases ya ejecutados, prompts de
paralelización, runbooks, informes puntuales de QA y guías de implementación de
funcionalidades que hoy están construidas. Su **detalle funcional y técnico** se
consolidó en los documentos de arriba; el texto original sigue en el historial de
git (último commit con todos ellos: `3ebf9a2`).

Algunos comentarios de `prisma/schema.prisma` (fichero congelado), de migraciones
ya aplicadas y de las épicas de `docs/hu/` siguen citándolos por su nombre
antiguo. Esta tabla es la traducción.

| Documento retirado | Dónde está ahora |
|---|---|
| `APP_MOVIL_NATIVA_PLAN.md` | [APP_MOVIL.md](./APP_MOVIL.md) |
| `ARQUITECTURA_IDENTIDAD_VENTA_MULTITENANT.md` | [ARQUITECTURA.md](./ARQUITECTURA.md) §2 y §8 · [PRODUCTO_COBROS.md](./PRODUCTO_COBROS.md) §1–§2 |
| `COMPOSICION_CORPORAL_TANITA.md` · `..._IMPLEMENTACION.md` | [PRODUCTO_GESTION.md](./PRODUCTO_GESTION.md) §3.2 |
| `CRM_IMPLEMENTACION_FUNCIONALIDADES.md` | Implementado. Las reglas, en [CRM_REGLAS_NEGOCIO.md](./CRM_REGLAS_NEGOCIO.md) |
| `EMAILS_TRANSACCIONALES.md` | [CRM_Y_MARKETING.md](./CRM_Y_MARKETING.md) §5 |
| `FEEDBACK_COBROS_DASHBOARD.md` · `..._IMPLEMENTACION.md` | [PRODUCTO_GESTION.md](./PRODUCTO_GESTION.md) §6.2 · [PRODUCTO_COBROS.md](./PRODUCTO_COBROS.md) · [CRM_Y_MARKETING.md](./CRM_Y_MARKETING.md) §6 |
| `FILTROS_TABLA_IMPLEMENTACION.md` | [CRM_Y_MARKETING.md](./CRM_Y_MARKETING.md) §7 |
| `GUIA_AGENTE_GENERADOR_ENTRENAMIENTOS.md` | [PRODUCTO_GESTION.md](./PRODUCTO_GESTION.md) §6.3. La metodología en sí es código: `src/lib/ai/methodology/*.md` |
| `HISTORIAS_USUARIO_2026-09-06.md` | Troceado en [`hu/`](./hu/), que sus propias épicas declaran autosuficientes |
| `IMPORTACION_SOCIOS_CSV.md` | [PRODUCTO_GESTION.md](./PRODUCTO_GESTION.md) §1.4 |
| `MAPA_BARRIOS_IMPLEMENTACION.md` | [CRM_Y_MARKETING.md](./CRM_Y_MARKETING.md) §6.1 |
| `MVP_PILOTO_GIMNASIO_ANALISIS.md` | Desfasado por su propio aviso: lo que daba por hacer está construido |
| `PENDIENTE_DESARROLLO_2026-09-08.md` · `PLAN_PARALELIZACION_2026-09-06.md` · `PROMPTS_PARALELIZACION_2026-09-08.md` · `ROADMAP_JORNADA_2026-08-22.md` · `RUNBOOK_EJECUCION.md` | Lotes ya ejecutados. El método, en [TRABAJO_EN_PARALELO.md](./TRABAJO_EN_PARALELO.md) |
| `PLAN_IMPLEMENTACION_APTA_COMERCIAL.md` · `PLATAFORMA_COBRO_SMTP_STRIPE_CONNECT_IMPLEMENTACION.md` | [PRODUCTO_COBROS.md](./PRODUCTO_COBROS.md) · SMTP en [OPERACIONES.md](./OPERACIONES.md) §2 |
| `QA_REGRESION_BUGS_2026-09-04.md` | Bugs corregidos en su momento; el historial guarda el informe |
| `REGLAS_NEGOCIO_ESTADO_IMPLEMENTACION.md` | Corte del 31-07-2026, superado. El estado real lo describen los documentos de producto |
| `REVISION_WEB_MOVIL_2026-09-06.md` | Dio origen a las 192 historias de [`hu/`](./hu/) |
| `SALUD_LESIONES_FASES.md` | [PRODUCTO_GESTION.md](./PRODUCTO_GESTION.md) §2 |
| `STRIPE_API_SECCION_IMPLEMENTACION.md` · `STRIPE_FUNCIONALIDADES_ROI.md` | [PRODUCTO_COBROS.md](./PRODUCTO_COBROS.md) §5 |
| `UX_PREMIUM_PLAN.md` | [BRANDING.md](./BRANDING.md) §5 |

---

## Cómo se mantiene esto

1. **El código manda.** Cuando este texto y el código no coincidan, el error está
   aquí. Cada afirmación de estos documentos apunta a un fichero real: si el
   fichero cambia de sitio, la línea que lo cita se corrige en el mismo cambio.
2. **Un plan ejecutado no es documentación.** Los planes de fases, los runbooks y
   los prompts de paralelización se borran cuando el trabajo entra en `main`. Lo
   que sobrevive es la descripción de lo que el producto hace, no la del camino
   que se siguió para construirlo. El historial de git guarda lo demás.
3. **Las reglas de negocio se numeran.** Toda regla que decida comportamiento
   vive en `CRM_REGLAS_NEGOCIO.md` con su código `RB-*`, y el código la cita por
   ese código. No se duplica el enunciado en dos sitios.
4. **Lo que no se puede comprobar, no se afirma.** Si una cifra no está medida,
   se dice que no lo está — es la regla que gobierna `seo/linea-base.md` y vale
   para todo lo demás.

## Cosas que la documentación NO es

- **No es el esquema de datos.** `prisma/schema.prisma` está comentado modelo a
  modelo y es la única fuente sobre la forma de los datos.
- **No es la configuración.** `.env.example` documenta cada variable con su
  porqué, su valor por defecto y qué pasa si falta.
- **No es la guía de la metodología de entrenamiento.** Esa vive en
  `src/lib/ai/methodology/*.md` porque el modelo la lee en tiempo de ejecución:
  es código, no documentación.
