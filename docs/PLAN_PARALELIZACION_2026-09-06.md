# Plan de paralelización · 192 historias en sesiones simultáneas

**Fecha:** domingo 6 de septiembre de 2026 · **Plazo pedido:** domingo 13 de septiembre (7 días naturales)
**Documento fuente:** [`HISTORIAS_USUARIO_2026-09-06.md`](./HISTORIAS_USUARIO_2026-09-06.md) · troceado en [`docs/hu/`](./hu/)

---

## 0. La cuenta que hay que mirar antes de repartir nada

Sumando las tallas declaradas en las 192 historias (`XS`=0,4 d · `S`=0,8 d · `M`=2,5 d · `L`=6 d):

| | Historias | Días-persona |
|---|---|---|
| **Todo el documento** | 192 | **316** |
| Solo P0 | 55 | 103 |
| Solo el Lote 1 (bloqueantes) | 40 | 59 |

**316 días-persona no caben en 7 días naturales.** Para que cupiesen harían falta ~45 hilos productivos en paralelo, sin colisiones, sin revisión y sin integración — y este repositorio no admite 45 hilos: `src/lib/rbac.ts` solo lo tocan 7 historias de 7 épicas distintas, y `prisma/schema.prisma` lo tocan 8.

Y hay una parte que **no depende de cuántas sesiones abras**:

| Historia | Bloqueada por | Plazo real |
|---|---|---|
| E10-04 · DPA Apta ↔ centro | asesoría jurídica externa | 2-4 semanas |
| E10-05 · Política de privacidad art. 13 | asesoría jurídica externa | 2 semanas |
| E10-06 · Precontractual y desistimiento | asesoría jurídica externa | 2-3 semanas |
| E10-03 · Validación del art. 9.2.f | asesoría jurídica externa | 2 semanas |
| E10-10 · EIPD + designación de DPD | asesoría + comunicación a la AEPD | 3-4 semanas |
| E10-15 · Cláusula laboral | firma de la plantilla | 1-2 semanas |
| E13-03 · Titularidad de la metodología | contrato con Training Zone | 1-2 semanas |
| E5-15 · E9-16 · E10-19 | decisión D-M2, ya aplazada | fuera de trimestre |

**Estas diez no cierran el día 13 aunque el código esté escrito**, porque el entregable es un documento firmado por un tercero. Lo único que puede estar el domingo es el trabajo de producto que las acompaña, con el texto en borrador.

Dicho eso, el plan que sigue es el que **maximiza lo que sí puede estar el domingo**, y al final (§9) hay un pronóstico con el recorte concreto. La decisión de recortar es tuya, no mía: si me dices que siga con las 192 en paralelo, se sigue.

---

## 1. Por qué no puedes abrir nueve sesiones mañana a primera hora

Dos ficheros serializan todo el trabajo. Medido sobre el propio documento:

```
 7 HU · 7 épicas · rbac.ts              [E1, E5, E6, E7, E8, E10, E12]
 8 HU · 6 épicas · prisma/schema.prisma [E2, E3, E9, E10, E4]
 4 HU · 2 épicas · health-access.ts     [E3, E10]
 3 HU · 3 épicas · members-queries.ts   [E1, E10, E12]
```

Si nueve sesiones empiezan a la vez, siete de ellas van a editar `rbac.ts` el mismo día sobre ramas distintas, y cinco van a escribir migraciones de Prisma con números de secuencia que chocan. El coste de resolver eso supera lo que ganas paralelizando.

**La solución no es coordinar mejor: es que esos ficheros los toque una sola sesión, una sola vez, antes de que arranque nadie.** Eso es la Ola 0.

---

## 2. Paso 0 · Preparar el repositorio (ya hecho, ~15 min)

Estas dos cosas ya están en la rama:

**a) El documento troceado por épica**, en `docs/hu/`. Una sesión que trabaja SEO abre `docs/hu/E9.md` (22 KB) en vez del documento completo (236 KB). Cada trozo es autosuficiente: lleva dentro la convención de lectura y las 30 decisiones de negocio, así que la sesión no necesita abrir nada más para entender su alcance.

| Fichero | HU | Tamaño |
|---|---|---|
| `docs/hu/E1.md` … `E13.md` | 192 en total | 10-40 KB cada uno |
| `docs/HISTORIAS_USUARIO_2026-09-06.md` | 192 | 236 KB — **no lo abras en una sesión de trabajo** |

**b) Falta por hacer: el bloque de invariantes en `CLAUDE.md`.** Lo que TODAS las sesiones necesitan saber y hoy tendrían que descubrir leyendo código. Va en `CLAUDE.md` para que viaje en el prefijo cacheado del sistema, no en cada prompt:

```markdown
## Invariantes de este trimestre (no los redescubras, no los cambies)

- Ámbito de centro: toda lectura y toda escritura con `centerId` pasa por
  `isCenterInScope` / `requireApiCenterScope`. Sin excepciones.
- Datos de salud: todo acceso pasa por `health-access.ts` y deja `AuditLog`.
- Bonos: ninguna operación mueve `sessionsRemaining` sin escribir en `SessionLedger`.
- Estados de reserva: usa `assertBookingTransition`. `CANCELLED`/`WAITLISTED` nunca van a `ATTENDED`.
- Gateo por plan: `FEATURE_BY_ROUTE` es declarativo; una ruta nueva sin gate declarado falla en test.
- Ventana de cancelación: la del centro, leída del servidor. Cero literales de horas en el cliente.
- Stripe: nunca borres un Price; archiva. Toda creación lleva clave de idempotencia.
- No ejecutes la suite completa de Playwright: muta la base de datos de demo.
  Ejecuta solo los specs de tu pista.
```

---

## 3. Paso 1 · Ola 0 · Las costuras (día 1, dos sesiones, en serie con el resto)

Dos sesiones que **no se pisan entre sí** y que dejan puestos los puntos de sutura que las nueve pistas van a consumir. Nadie más arranca hasta que esto esté mezclado en `main`.

### S0-A · Esquema y guardas del servidor · Opus · rama `costuras/servidor`

Un único commit de migración con **todo** el cambio de esquema del trimestre:

- `SessionLedger` (E2-15) · enum de zonas + lateralidad (E3-02) · `Mesocycle.startDate` y `deload` (E3-12)
- `Center`: `phone`, `city`, `postalCode`, `neighborhood`, `description`, `openingHours`, `publicPage` (E9-05)
- `StripeWebhookEvent` (HU-ST-05) · `PAUSED` distinto de `FROZEN` (HU-ST-14)
- Campos de edad y tutor (E10-12) · tabla de plazos de retención (E10-08)
- `REVOKE UPDATE, DELETE ON "AuditLog"` (E10-14)

Y los helpers, creados **funcionando pero mínimos**, para que las pistas los consuman en vez de inventarse cada una el suyo:

`requireApiCenterScope` · `requireApiFeature` + `FEATURE_BY_ROUTE` móvil · `assertBookingTransition` · `createSubscriptionFromPlan` (E4-30) · `saveMembershipPlan` (E4-29) · `SERVICE_LABEL` único (E12-04) · y el `rbac.ts` completo del trimestre: herencia de gate a rutas hijas (E6-02), `ia_programacion` declarado (E6-03), `/audit` fuera del muro (E6-07), `/trainer` abierto a dirección (E12-11).

> **A partir del merge de S0-A, `prisma/schema.prisma` y `rbac.ts` quedan CONGELADOS.** Quien necesite tocarlos abre una petición al integrador; no lo hace en su rama.

### S0-B · Costuras de cliente y andamiaje de pruebas · Sonnet 5 · rama `costuras/cliente`

No toca nada de S0-A, así que va en paralelo:

- `Field` con `htmlFor` / `aria-invalid` / `aria-describedby` — **un fichero, 221 sitios** (E8-02)
- `error.tsx` en `(app)/` y las cuatro rutas con más consultas (E8-01)
- `src/lib/site.ts` con `BRAND` y `publicOrigin()` (E9-03)
- Infraestructura de pruebas de la app móvil (E7-01) y su job de CI (E7-02)

**Duración realista de la Ola 0: un día.** Es el peaje que hace posible todo lo demás.

---

## 4. Paso 2 · Las nueve pistas paralelas (días 2-7)

**Regla de oro: la propiedad es por FICHERO, no por épica.** Si una historia de tu épica toca un fichero de otra pista, no la haces tú — está en la columna de cesiones.

| # | Pista | Ficheros que posee en exclusiva | HU asignadas | Modelo |
|---|---|---|---|---|
| **T1** | Aislamiento y gateo | `center-scope.ts`, `brief-queries.ts` (ámbito), `_lib/api-session.ts`, `api/mobile/v1/staff/`, `feedback-queries.ts`, `no-show-alerts.ts` | 10 · ver anexo | Opus |
| **T2** | Agenda, reservas y bonos | `agenda-queries.ts`, `session-actions.ts`, `portal-queries.ts`, `attendee-discard.ts`, `no-show.ts`, `session-vacancy-notify.ts` | 14 · ver anexo | Opus |
| **T3** | Stripe y catálogo | `stripe*.ts`, `member-billing.ts`, `platform-billing.ts`, `provisioning.ts`, `subscriptions.ts`, `api/stripe/webhook/` | 28 · ver anexo | Opus |
| **T4** | Salud y metodología | `health-access.ts`, `assessments/`, `ai/`, `reference-ranges.ts`, `mesocycle*`, `composition-view.ts` | 20 · ver anexo | Opus |
| **T5** | Portal del socio | `app/(app)/portal/**`, `emails/templates.ts`, `first-session-wall.tsx`, `account-menu.tsx` | 12 · ver anexo | Sonnet 5 |
| **T6** | App nativa | **`apps/mobile/**` entero** | 20 · ver anexo | Sonnet 5 |
| **T7** | Público, SEO y mapa | `app/planes/`, `hazte-socio/`, `lead-form/`, `proxy.ts`, `robots.ts`, `sitemap.ts`, `barrio-map*`, `public-*-queries.ts` | 24 · ver anexo | Sonnet 5 |
| **T8** | Cumplimiento (código) | `consent.ts`, `app/privacidad/`, `retention.ts`, `api/portal/export-data/`, `api/jobs/run/` | 10 · ver anexo | Opus |
| **T9** | Producto, menú e higiene | `platform-plans.ts`, `nav-icons.tsx`, `app/(app)/apta/`, `members-queries.ts`, `dashboard-queries.ts`, `_lib/dashboard.ts` | 31 · ver anexo | Sonnet 5 |
| **T10** | **Jurídico — no es una sesión de Claude** | expediente en [`docs/legal/`](./legal/) | 7 · ver anexo | despacho |

### Cesiones (historias que cambian de pista por propiedad de fichero)

| Historia | Épica de origen | La hace | Porque |
|---|---|---|---|
| E1-05 | E1 · aislamiento | **T2** | vive en `agenda-queries.ts` |
| E1-08 · E10-02 · E10-11 | E1 / E10 | **T4** | viven en `health-access.ts` |
| E3-01 | E3 · salud | **T6** | es una pantalla de `apps/mobile/` |
| E12-06 | E12 · higiene | **T2** | es ocupación por ocurrencia, lógica de agenda |
| E2-03/06/10/11 · E5-12/13/14 | E2 / E5 | **T6** | son pantallas nativas |
| E8-01/02 | E8 · accesibilidad | **S0-B** | un fichero cada una, y las consumen todas las pistas |

### Dependencias duras entre pistas

```
S0-A ──┬─→ T1, T2, T3, T4, T8, T9        (todas necesitan los helpers y el esquema)
S0-B ──┴─→ T5, T6, T7

T2 (E2-01, E2-02) ──→ T2 (E2-15 SessionLedger)   [decisión D-P7: el ledger va DESPUÉS]
T2 (E2-15)        ──→ T5 (E5-09 historial en web)
T3 (HU-ST-01…06)  ──→ T3 (fases 1-4)             [la fase 0 es bloqueante interna]
T3 (HU-ST-14/15/17) ──→ T5 (E5-01, E5-06)
T1 (E6-01)        ──→ T6 (la app recibe 402 y hay que pintarlo)
```

**T3 es el camino crítico**: 30 historias, 75 días-persona, y sus cinco fases son secuenciales entre sí. Si algo va a llegar tarde, es Stripe. Arráncala la primera y no la partas en dos sesiones: las fases se pisan.

---

## 5. Paso 3 · Protocolo de cada sesión

### Prompt de arranque (cópialo tal cual, cambiando las tres variables)

```
Trabajas la pista T4 · Salud y metodología del plan de paralelización.

Lee SOLO estos dos ficheros para entender tu alcance:
  - docs/hu/E3.md          (tus historias, con criterios de aceptación en Gherkin)
  - docs/PLAN_PARALELIZACION_2026-09-06.md, sección 4 (tu propiedad de ficheros)

No abras docs/HISTORIAS_USUARIO_2026-09-06.md: son 236 KB y tu épica ya está extraída.

Ficheros que posees en exclusiva:
  health-access.ts, assessments/, ai/, reference-ranges.ts, mesocycle*, composition-view.ts

Ficheros CONGELADOS (si necesitas tocarlos, para y dímelo):
  prisma/schema.prisma, src/lib/rbac.ts

Rama: pista/T4-salud   (créala desde main después del merge de las costuras)

Orden: E3-02, E3-03, E3-05, E3-06, E3-09, E3-11, E3-12, E3-13, E3-14, E3-16,
       E3-17, E3-18, E3-04, E3-07, E3-08, E3-10, E3-15, E1-08, E10-02, E10-11

Por cada historia:
  1. Implementa los escenarios Gherkin tal como están escritos.
  2. Escribe el test que cubre el escenario principal.
  3. Ejecuta SOLO: npm run lint && npx tsc --noEmit && npm run test:unit
     (nunca la suite completa de Playwright: muta la base de datos de demo)
  4. Un commit por historia, con el ID en el asunto: "E3-02 · zonas de lesión como enum"
  5. Pasa a la siguiente sin pedirme confirmación.

Para cuando: termines la lista, te bloquee una dependencia de otra pista,
o necesites tocar un fichero congelado.
```

### Definición de hecho, por historia

Todos los escenarios Gherkin implementados · un test que cubre el principal · `lint` + `tsc` + unitarios en verde · un commit con el ID en el asunto · ningún fichero fuera de tu propiedad en el diff.

---

## 6. Paso 4 · Integración

**Una persona integradora, y solo ella mezcla.** Con nueve ramas vivas, la integración es un puesto de trabajo, no un trámite.

1. **Dos ventanas de merge al día**, 13:00 y 19:00. Fuera de esas ventanas las pistas no mezclan.
2. **Orden de merge fijo**, del que más dependencias produce al que menos: `T1 → T2 → T3 → T4 → T8 → T9 → T5 → T6 → T7`.
3. Cada pista hace `git merge main` en su rama **antes** de cada ventana, resuelve lo suyo y avisa. Nunca `rebase`: hay nueve checkouts vivos.
4. Un conflicto en un fichero congelado **es un error de proceso, no un conflicto**: se revierte y se pide el cambio al integrador.
5. CI en verde es condición de merge, no un objetivo. El job de la app (S0-B) corre separado del de la web para que un fallo no oculte al otro.

---

## 7. Optimización de tokens

Ordenadas por lo que ahorran de verdad.

**1 · El troceado del documento (ya hecho) — la mayor con diferencia.** El documento completo son ~60.000 tokens; `docs/hu/E9.md` son ~5.500. Con nueve pistas releyendo su alcance varias veces al día, la diferencia son cientos de miles de tokens diarios. **Ninguna sesión de trabajo debe abrir el documento completo.**

**2 · Invariantes en `CLAUDE.md`, no en el prompt.** Lo que va en `CLAUDE.md` viaja en el prefijo del sistema y se cachea; lo que repites en cada mensaje se paga cada vez. Las lecturas de caché cuestan ~0,1× y las escrituras ~1,25×, así que una regla estable en el prefijo se amortiza en la segunda petición.

**3 · Una sesión larga por pista, no muchas cortas.** El caché es un **prefijo exacto**: cualquier cambio de byte antes de un punto invalida todo lo que viene después. Una sesión que sigue viva reutiliza el prefijo; una sesión nueva por historia lo reconstruye entero. Cuando la conversación crezca, deja que se compacte — no la reinicies.

**4 · Modelo por pista.** Opus 5 ($5/$25 por millón de tokens) donde hay diseño real: **T3 Stripe, T2 bonos y ledger, T4 la migración del enum de zonas, T1 las guardas, T8 el motor de retención.** Sonnet 5 ($2/$10) donde el trabajo es mecánico y los criterios ya están escritos: **T5, T6, T7, T9** — accesibilidad, metadatos, rótulos, virtualización de listas, higiene. Es la mitad de coste en las cuatro pistas con más historias. La decisión es tuya; si prefieres Opus en todo, el plan no cambia.

**5 · No ejecutes la suite completa de Playwright.** Lo dice el propio informe de QA: muta la base de datos de demo y tarda minutos. Cada pista corre sus specs. La suite entera, una vez al día, en la ventana de las 19:00.

**6 · Un commit por historia con el ID en el asunto.** Hace que revisar y mezclar sea barato, y que un `git log --oneline | grep E3-` te diga el avance sin abrir nada.

**7 · No uses subagentes para leer lo que la sesión ya tiene.** Un subagente arranca con su propio contexto y te lo devuelve resumido: sirve para explorar código desconocido, no para releer un fichero que ya está en la conversación.

**8 · No releas un fichero justo después de editarlo.** Si `Edit` no dio error, el cambio está.

**9 · Reduce las interrupciones por permisos.** `/fewer-permission-prompts` genera una lista de permisos para `.claude/settings.json` a partir de tus transcripciones. Con nueve sesiones, cada prompt de permiso es un turno perdido en nueve sitios.

---

## 8. Calendario

| Día | Qué corre |
|---|---|
| **Lun 7** | Ola 0: S0-A y S0-B. Merge a `main` por la tarde. **Encargo al despacho jurídico (T10) — hoy, no el jueves**: el expediente de entrada está en [`docs/legal/`](./legal/), y lo único que falta antes de mandarlo es el [cuestionario de dirección](./legal/00-CUESTIONARIO-DIRECCION.md). |
| **Mar 8** | Arrancan T1…T9. T3 empieza por la fase 0 de Stripe. |
| **Mié 9** | Primer merge completo de las nueve. Aquí se ve si la propiedad de ficheros aguanta. |
| **Jue 10** | T2 cierra E2-01/E2-02 y arranca el ledger. T6 entra en la batería de pruebas. |
| **Vie 11** | Corte de alcance: lo que no esté empezado a las 18:00, no entra. |
| **Sáb 12** | Solo integración, corrección de CI y regresión. Cero historias nuevas. |
| **Dom 13** | Regresión completa, suite entera de Playwright, entrega. |

---

## 9. Qué llega de verdad el domingo

Con nueve pistas, la Ola 0 el lunes y cinco días útiles de trabajo paralelo:

| Escenario | Qué entra | Días-persona | % del documento |
|---|---|---|---|
| **Realista** | Ola 0 + Lote 1 completo (40 HU) + arranque del Lote 2 | ~75 | 24 % |
| **Bueno** | Lo anterior + Lote 2 completo y fases 0-1 de Stripe | ~110 | 35 % |
| **Todo el documento** | 192 HU | 316 | 100 % |

**Mi recomendación, y es una decisión tuya:** apunta al escenario Bueno y declara explícitamente que los Lotes 3, 4 y 5 se cierran en las semanas siguientes. Lo que entra en ese recorte es exactamente lo que impide que el piloto toque dinero real o socios reales — las fugas de aislamiento entre centros, el bono que se quema al borrar una sesión, la reserva cancelada que resucita a "Asistió", el muro de pago que se salta por URL y el ciclo de vida de Stripe que no llega a la pasarela.

Lo que queda fuera es real y hay que decirlo: el reempaquetado del catálogo, el mapa, el SEO, la mayor parte de accesibilidad y todo lo documental. Nada de eso bloquea el piloto; todo eso es lo que hace que el producto se venda al segundo cliente.

**Si prefieres que se ataquen las 192 igualmente y se acepte lo que caiga, el plan no cambia** — solo cambia qué pistas se quedan a medias, y prefiero que eso lo elijas tú antes que descubrirlo el sábado.

---

## Anexo · Reparto verificado, historia por historia

Comprobado por script contra el documento fuente: **192 asignadas, 0 duplicadas, 0 sin asignar.** Este es el listado que va en el prompt de arranque de cada sesión.

**S0-A · costuras de servidor** (8) — E4-29, E4-30, E6-02, E6-03, E6-07, E10-14, E12-04, E12-11
**S0-B · costuras de cliente** (5) — E7-01, E7-02, E8-01, E8-02, E9-03

**T1 · Aislamiento y gateo** (10) — E1-01, E1-02, E1-03, E1-04, E1-06, E1-07, E1-09, E1-10, E1-11, E6-01
**T2 · Agenda, reservas y bonos** (14) — E1-05, E2-01, E2-02, E2-04, E2-05, E2-07, E2-08, E2-09, E2-12, E2-13, E2-14, E2-15, E12-06, E12-14
**T3 · Stripe** (28) — HU-ST-01 … HU-ST-28, en orden de fase
**T4 · Salud y metodología** (20) — E1-08, E3-02 … E3-18, E10-02, E10-11
**T5 · Portal del socio** (12) — E5-01 … E5-11, E10-22
**T6 · App nativa** (20) — E2-03, E2-06, E2-10, E2-11, E3-01, E5-12, E5-13, E5-14, E7-03, E8-03, E8-04, E8-07 … E8-12, E10-18, E13-01, E13-02
**T7 · Público, SEO y mapa** (24) — E9-01, E9-02, E9-04 … E9-15, E11-01 … E11-10
**T8 · Cumplimiento (código)** (10) — E10-01, E10-07, E10-08, E10-09, E10-12, E10-13, E10-16, E10-17, E10-20, E10-21
**T9 · Producto, menú, higiene y pruebas** (31) — E6-04, E6-05, E6-06, E6-08, E7-04 … E7-09, E8-05, E8-06, E8-13 … E8-18, E12-01, E12-02, E12-03, E12-05, E12-07 … E12-10, E12-12, E12-13, E12-15, E12-16, E12-17

**T10 · Jurídico, fuera de sesión** (7) — E10-03, E10-04, E10-05, E10-06, E10-10, E10-15, E13-03
**Backlog de publicación (D-M2)** (3) — E5-15, E9-16, E10-19

> T9 tiene 31 historias pero suma pocos días: son casi todas `XS` y `S`. Si va corta de tiempo, lo primero que se cede a otra pista son las de pruebas (E7-04 … E7-09), que no dependen de sus ficheros.
