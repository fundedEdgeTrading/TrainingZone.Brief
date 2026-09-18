# HU-ST-29 · Cuenta Stripe distinta por centro dentro de una organización

> **Estado: borrador de plan, NO aprobado, NO iniciado.** Este documento sintetiza
> el trabajo de cuatro agentes (`stripe-pagos`, `negocio-producto`,
> `cumplimiento-normativo`, `ciberseguridad`) sobre una petición de dirección:
> poder vincular una cuenta de Stripe distinta a cada centro de una misma
> organización. Toca `prisma/schema.prisma`, **congelado este trimestre**
> (`AGENTS.md`) — nada de esto se implementa sin pasar por el integrador, y el
> propio análisis de negocio recomienda no construirlo todavía. Ver §2.

## 0 · Resumen ejecutivo

- **Hoy es imposible sin cambiar el modelo de datos**: `StripeAccount.orgId` es
  `@unique` (`prisma/schema.prisma:1821`) — una cuenta conectada por
  organización, compartida por todos sus centros. `MembershipPlan` y `Member`
  guardan el espejo de Stripe (`stripeProductId`/`stripePriceId`/`stripeAccountId`,
  `stripeCustomerId`) como **campos singulares**, asumiendo la misma cuenta única.
- **El caso crítico que había que comprobar ya es real, no hipotético**: un
  socio puede tener hoy bonos `ACTIVE` en varios centros de la misma
  organización a la vez (`Subscription.centerId`, comentario RB-AGENDA-003 en
  el schema). Cualquier diseño tiene que resolver con qué cuenta se le cobra en
  cada caso.
- **negocio-producto recomienda NO construirlo como funcionalidad general
  ahora**: es un cambio de modelo de datos que arrastra catálogo, ficha de
  pagos del socio, reembolsos/disputas y migración de cobros ya vivos, para un
  caso de uso que nadie ha confirmado que tenga un cliente real detrás hoy.
- **cumplimiento-normativo encuentra un hallazgo crítico (CN-05)**: si el
  motivo real es que hay centros con **titularidad fiscal distinta**, hoy no
  existe ningún punto de la interfaz que le diga al socio con qué empresario
  contrata en cada centro — eso ya sería un problema de transparencia
  (TRLGDCU/LSSI) en cuanto haya sociedades distintas detrás, independientemente
  de si se implementa o no el cambio técnico.
- **ciberseguridad encuentra un hallazgo estructural bloqueante**: con el
  modelo actual de "campo singular", vender el mismo plan desde dos centros
  con cuentas distintas provocaría una condición de carrera real sobre dinero
  (`ensureStripePrice`/`ensureProduct` recrean producto/precio/cliente cada vez
  que compite otra cuenta) — no es solo ineficiencia, es un riesgo de
  integridad. También encuentra dos vacíos de control de acceso **ya
  explotables hoy en teoría, aunque de bajo impacto mientras haya una sola
  cuenta**, que conviene corregir ya (§5).

## 1 · Situación actual verificada

| Pieza | Archivo:línea | Qué dice |
|---|---|---|
| Cuenta Stripe 1:1 con organización | `prisma/schema.prisma:1821-1830` | `StripeAccount.orgId @unique` |
| Catálogo de planes sin centro | `prisma/schema.prisma:726-757` | `MembershipPlan` tiene `orgId`, no `centerId`; espejo Stripe en campos singulares |
| Un socio puede tener bonos en varios centros de la org a la vez | `prisma/schema.prisma` (comentario RB-AGENDA-003, `Subscription.centerId`) | Confirmado por 3 de los 4 agentes de forma independiente |
| Resolución de cuenta por org | `src/lib/stripe.ts:46-57` (`stripeForOrg`) | Recibe solo `orgId` |
| OAuth Connect | `src/lib/stripe-connect.ts:19-67`, `src/app/api/stripe/connect/callback/route.ts` | `state = orgId`, gateado por `canManageOrg` (`OWNER`/`PLATFORM_ADMIN`, sin ámbito de centro) |
| Webhooks | `src/app/api/stripe/webhook/route.ts:260-264` (`resolveConnectOrgId`) | Resuelve `orgId` desde `event.account`, único hoy |
| Decisión de arquitectura de fondo | `docs/hu/HU-ST-28-comision-de-plataforma.md` (D-9) | Cargos directos: el comerciante de registro de cada cobro es el gimnasio (hoy, la organización) |
| Apta no factura al socio | `docs/legal/07-BORRADOR-PRECONTRACTUAL-Y-DESISTIMIENTO.md:110` (D-S8) | Factura el centro con su propio software; Apta entrega el recibo de Stripe |

## 2 · Pregunta de negocio bloqueante — responder ANTES de diseñar nada más

(`negocio-producto`, `cumplimiento-normativo`)

**¿Cuál de estos dos escenarios es el real?**

1. **Necesidad dura**: uno o más centros de una organización son legalmente
   una **sociedad distinta** (franquicia, CIF propio) y necesitan facturar y
   liquidar bajo su propia identidad fiscal.
2. **Necesidad blanda**: todos los centros son de la misma sociedad, pero
   dirección quiere **ver la caja separada por centro** sin depurarlo a mano
   en el Dashboard de Stripe.

Si es (2), **no hace falta tocar Stripe Connect en absoluto**: `Subscription` y
`Payment` (parcialmente, ver §4.1) ya tienen o pueden tener `centerId`, así que
es un filtro por centro en los informes existentes (`/billing/contabilidad`,
revenue-mix), no una cuenta Stripe nueva.

Si es (1), hace falta además confirmar: **¿la relación es siempre 1 centro = 1
entidad legal, o una misma entidad legal puede operar varios centros?** Si no
es 1:1, `StripeAccount` no debería colgar directamente de `centerId` sino de un
concepto intermedio de "entidad legal/titular fiscal" — diseñar contra
`centerId` asumiendo 1:1 sin verificarlo sería construir sobre un supuesto
equivocado.

**No se debe empezar ningún trabajo técnico de esta HU sin que dirección
responda esto por escrito**, idealmente citando el centro real que lo necesita.

## 3 · Si la respuesta es "necesidad blanda" (2)

No entra en esta HU. Se resuelve con un filtro por centro sobre la cuenta
única existente. Cerrar la petición como "resuelta por informes", sin tocar
`prisma/schema.prisma`.

## 4 · Si la respuesta es "necesidad dura" (1): diseño técnico

(`stripe-pagos`, con matices de `ciberseguridad`)

### 4.1 · Cambios de modelo de datos (TODOS requieren pasar por el integrador)

1. **`StripeAccount`**: quitar `@unique` de `orgId` solo; añadir
   `centerId String? @unique` (`NULL` = cuenta de fallback de organización, el
   comportamiento actual sin cambios); `@@unique([orgId, centerId])`. Matiz
   pendiente de resolver con el integrador: Prisma no tiene índices parciales
   nativos, así que garantizar "como mucho una fila de fallback por org" puede
   necesitar una constraint SQL manual en la migración.
2. **Catálogo de planes — un plan, varias cuentas**: `ciberseguridad` y
   `stripe-pagos` coinciden en que un campo singular en `MembershipPlan`
   provoca una condición de carrera real (dos centros vendiendo el mismo plan
   "pelean" por el mismo campo). Solución recomendada: tabla puente
   `MembershipPlanStripeMirror { planId, stripeAccountId, stripeProductId,
   stripePriceId }` con `@@unique([planId, stripeAccountId])`. Alternativa más
   simple pero con peor UX: obligar a que un plan solo se venda desde un único
   centro (`MembershipPlan.centerId` obligatorio, catálogo duplicado por
   centro) — evita la tabla puente pero rompe el catálogo único de
   organización actual y complica reporting/`SessionLedger` agregado.
3. **`Member` — un socio, varias cuentas**: mismo problema con
   `stripeCustomerId`/`stripeAccountId`. Extraer a
   `MemberStripeCustomer { memberId, stripeAccountId, stripeCustomerId }`,
   `@@unique([memberId, stripeAccountId])`.
4. **`Subscription.stripeAccountId String?`** (nuevo campo): fijado en el
   momento de crear la suscripción, para saber en qué cuenta conectada vive
   sin recalcularlo cada vez.
5. **`Center` — identidad legal** (`cumplimiento-normativo`, CN-01): añadir
   razón social, NIF/CIF y domicilio fiscal. Sin esto, vincular una cuenta
   Stripe a un centro con sociedad propia no tiene dónde declarar quién es esa
   sociedad — el propio borrador precontractual ya tiene esto como
   `⟦PENDIENTE⟧`. Si un centro va a operar su propia cuenta Stripe, el NIF deja
   de poder ser opcional para ese centro.
6. **`Payment`/`AuditLog` — trazabilidad por centro** (`cumplimiento-normativo`
   CN-07, `ciberseguridad`): `Payment` solo llega al centro indirectamente vía
   `subscriptionId` (nullable — los cobros puntuales de bono no cuelgan de una
   suscripción). Sin `centerId` directo en `Payment` (y en `AuditLog` para
   acciones de cobro), no hay forma fiable de reconstruir qué entidad legal
   procesó un cobro histórico ante una inspección o una reclamación.

### 4.2 · Migración de datos

No destructiva: cada `StripeAccount` existente (hoy `orgId` único) se
reescribe con `centerId = NULL` y pasa a ser automáticamente el fallback de su
organización — **ninguna organización existente cambia de comportamiento el
día del despliegue**, hasta que un director conecte explícitamente una cuenta
a un centro. Backfill análogo para `MembershipPlanStripeMirror` y
`MemberStripeCustomer` a partir de los campos singulares actuales.

### 4.3 · Fases de entrega recomendadas

1. **Fase 1 (MVP, menor riesgo)**: solo conexión — `StripeAccount` con
   `centerId` + OAuth por centro + estado visible por centro en
   `/organization`. El catálogo y el checkout **siguen usando la cuenta de
   fallback**: conectar una cuenta a un centro no mueve todavía dinero real.
2. **Fase 2**: catálogo y checkout multi-cuenta (`MembershipPlanStripeMirror`,
   `MemberStripeCustomer`, `Subscription.stripeAccountId`, resolución de
   cuenta por `centerId` real en `createMemberCheckout`/`ensureStripePrice`).
3. **Fase 3**: webhooks y reconciliadores completos — `resolveConnectOrgId`
   pasa a devolver `{orgId, centerId}`, y cada reconciliador
   (`reconcileMemberSubscriptionUpserted`, refunds, disputes, payouts...)
   acota también por centro, no solo por organización.
4. **Fase 4**: paridad app móvil, solo una vez la Fase 2 esté estable.

**No desplegar la Fase 2 sin la Fase 3 completa**: el riesgo concreto es cobrar
correctamente en Stripe pero conciliar el `Payment`/`Subscription` local
contra el centro equivocado, sin que Stripe dé ninguna señal de error — rompe
el invariante de ámbito de centro del trimestre en silencio.

## 5 · Corregir ya, independientemente de si se hace el multi-cuenta

(`ciberseguridad` — hoy de bajo impacto porque hay una sola cuenta por
organización, pero son el mecanismo exacto por el que se fugaría dinero entre
centros en cuanto exista más de una cuenta):

1. **`src/app/(app)/billing/actions.ts:65-79`** (`createStripeCheckoutAction`):
   a diferencia de `registerManualPayment` en el mismo fichero (que sí llama a
   `memberIsInScope`), esta acción recibe `memberId` de un formulario y llama a
   `createMemberCheckout` **sin comprobar el ámbito de centro** del actor
   (`RECEPTION`/`CENTER_DIRECTOR`). Añadir el mismo `memberIsInScope` que ya
   usa la acción vecina.
2. **`src/app/api/hazte-socio/[orgSlug]/[centerSlug]/checkout/route.ts:55-62`**:
   ruta pública sin sesión; cuando el email coincide con un socio ya existente,
   usa el `centerId` del segmento de URL **sin comprobar que tenga relación
   con ese socio**. Cualquiera que sepa el email de un socio puede, hoy,
   provocar una venta atribuida al centro equivocado; con cuentas por centro,
   reasignaría silenciosamente su identidad de facturación (`stripeCustomerId`)
   a la cuenta de un centro ajeno.

## 6 · Requisitos legales que condicionan el diseño (`cumplimiento-normativo`)

- **CN-05 (crítico)**: si hay sociedades distintas detrás de los centros, el
  bloque "quién te vende" en `/hazte-socio/[orgSlug]/[centerSlug]` y la
  confirmación en soporte duradero deben resolverse **por centro real**, no
  por marca/organización — y esto aplica en cuanto haya sociedades distintas,
  se implemente o no el cambio técnico de Stripe.
- **CN-06**: `src/lib/consent.ts` hardcodea el responsable del tratamiento de
  datos de salud a una sola sociedad; con centros de titularidad distinta debe
  resolverse por centro, no por texto fijo ni por `orgName`.
- **CN-03/CN-04**: cada entidad legal con cuenta Stripe propia necesita su
  propia aceptación registrada del DPA/ToS de Stripe (no basta con que la
  organización lo haya aceptado una vez); revisar si el análisis de
  transferencia internacional (Cap. V RGPD) debe repetirse por entidad.
- **VERI\*FACTU**: aplazado a 1/1/2027 (sociedades) y 1/7/2027 (resto) por el
  RDL 15/2025 — no bloquea hoy, pero si el caso de uso real es "franquicias
  con NIF distinto", esto debe estar resuelto antes de esas fechas.

## 7 · Riesgos de seguridad a diseñar explícitamente (`ciberseguridad`)

1. **OAuth `state`**: si pasa de `orgId` a `centerId`, el callback necesita
   **dos** comprobaciones nuevas, no una: (a) que el `centerId` pertenezca a la
   organización de la sesión (`isCenterInScope`), y (b) decidir qué rol puede
   iniciar el connect por centro (hoy solo `canManageOrg`; si se abre a
   `CENTER_DIRECTOR`, exigir `isCenterInScope` en vez de/además de
   `canManageOrg`).
2. **Webhooks**: cada reconciliador debe acotar sus escrituras por
   `(orgId, centerId)`, no solo `orgId` — un evento de la cuenta del Centro A
   no debe poder tocar una fila que en realidad pertenece al Centro B de la
   misma organización.
3. **Cupones** (`src/lib/stripe-coupons.ts`): un cupón solo es válido en la
   cuenta donde se creó; sin `centerId` en el modelo de cupón, no hay forma de
   saber en qué cuenta crearlo. Mismo problema de fondo que el catálogo (§4.1.2).
4. **Patrón bueno a replicar**: `stripe-refunds.ts::issueRefund` ya exige
   `isMemberInScope` antes de tocar Stripe, y los checkouts móviles ya derivan
   `centerId` del propio registro de sesión del socio, nunca de un parámetro
   de cliente — usar ambos como referencia para el resto de call sites.

## 8 · Decisiones pendientes — checklist

| # | Decisión | Quién decide |
|---|---|---|
| 1 | ¿Necesidad dura (fiscal) o blanda (informes)? — §2 | Dirección |
| 2 | Si dura: ¿1 centro = 1 entidad legal siempre? | Dirección |
| 3 | Levantar el freeze de `prisma/schema.prisma` para este cambio concreto | Integrador |
| 4 | Catálogo: tabla puente (B) vs. plan duplicado por centro (A) — §4.1.2 | Integrador + producto |
| 5 | ¿Qué cuenta cobra la cuota recurrente de un socio si su centro primario no tiene cuenta propia? | Dirección |
| 6 | ¿Quién puede conectar/desconectar la cuenta de un centro — solo `OWNER`, o también `CENTER_DIRECTOR`? | Dirección + integrador (RBAC congelado) |
| 7 | Redacción legal de "quién te vende" y del consentimiento de salud por centro | Asesoría jurídica externa |
| 8 | Si el DPA Apta↔centro necesita aceptación por entidad legal | Asesoría jurídica externa |

## 9 · Recomendación final

**No empezar ningún trabajo técnico todavía.** Los tres agentes no técnicos
(negocio, cumplimiento, seguridad) coinciden en que este es un cambio de
arquitectura no trivial que solo se justifica si la pregunta del §2 se
responde "necesidad dura" con un centro real identificado. Mientras tanto:

- Aplicar ya las dos correcciones de seguridad del §5 (bajo coste, cierran un
  vector real de fuga cross-center independientemente de esta HU).
- Llevar el checklist del §8 a dirección y al integrador antes de tocar
  `prisma/schema.prisma`.
- Si la respuesta es "necesidad blanda", cerrar esta HU y resolver con un
  filtro de centro en `/billing/contabilidad`.
