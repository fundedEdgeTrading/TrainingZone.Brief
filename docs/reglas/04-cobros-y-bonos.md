# 04 · Cobros, cuotas y bonos

Aquí solo el **plano 2**: el gimnasio cobra a sus socios. La licencia que Apta
cobra al gimnasio (plano 1) está en [09](./09-plataforma-y-acceso.md).
Descripción funcional en [PRODUCTO_COBROS.md](../PRODUCTO_COBROS.md).

## Principios

### RB-VENTA-001 · Todo cobro a un socio nace en la cuenta del gimnasio

**Estado:** 🟢 Vigente

Se cobra con Stripe Connect Standard y **cargos directos**: el dinero nace en la
cuenta Stripe del gimnasio, que es el comerciante (KYC, devoluciones,
contracargos y facturas son suyos). Una organización = una cuenta Stripe; la
caja se separa por centro con el centro de cada venta.

- Una cuenta Stripe distinta por centro (HU-ST-29) **no está aprobada**. Ver
  [P-07](./PENDIENTES_DE_DECIDIR.md#p-07).

### RB-VENTA-005 · Apta no cobra comisión sobre los cobros del gimnasio

**Estado:** 🟢 Vigente · **Decisión:** D-9

Solo licencia, cero comisión. Un test en CI se pone en rojo si aparece una
comisión en cualquier cobro. La comisión está documentada como posibilidad en
`docs/hu/HU-ST-28-comision-de-plataforma.md`, **no activada**.

### RB-VENTA-006 · Apta no factura al socio

**Estado:** 🟢 Vigente · **Decisión:** D-12, matizada por D-S8

Apta factura **solo su licencia** al gimnasio. El gimnasio factura a sus socios
con su propio software. La exportación contable de Apta (`RB-BI-023`) es un
extracto de cobros, no un libro de facturas. VERI\*FACTU queda aplazado a 2027.

### RB-PAGO-001 · Stripe es el canal de cobro

**Estado:** ⚠️ En conflicto · ver [P-02](./PENDIENTES_DE_DECIDIR.md#p-02)

Todo cobro (matrícula, cuota, bono, sesión suelta) va por Stripe, con tarjeta o
domiciliación SEPA.

- **Hoy:** sigue existiendo el **registro de cobro manual** (efectivo, tarjeta
  en datáfono, Bizum, transferencia) para dirección, dirección de centro y
  recepción, como "puente". Anota quién vendió y cierra el lead igual que un
  cobro por Stripe.

### RB-PAGO-002 · El cierre del lead depende del cobro · Aplazar un cobro

**Estado:** 🟢 Vigente

1. El lead se cierra cuando se confirma el cobro (`RB-LEAD-005`).
2. Un cobro pendiente se puede **aplazar** a una fecha futura, con motivo
   obligatorio, sin pasar al socio a moroso.

## Conectar Stripe

### RB-CONNECT-001 · Apta guarda solo el identificador de la cuenta

**Estado:** 🟢 Vigente

El gimnasio conecta su Stripe con un botón (OAuth). Apta guarda solo `acct_…`:
nunca una clave secreta del gimnasio. Hay una única clave secreta en el
sistema, la de Apta. Al abrir Stripe, el alta llega rellena con los datos del centro.

### RB-CONNECT-002 · Sin cuenta capaz de cobrar, no hay cobro

**Estado:** 🟢 Vigente

Cobrar a socios exige que la cuenta conectada tenga los cobros habilitados. Si
no, la aplicación degrada con una explicación, no con un error.

### RB-VENTA-004 · Sin Stripe, las superficies de venta desaparecen

**Estado:** 🟢 Vigente

Si el gimnasio no puede cobrar hoy, la página pública de alta y los botones de
compra se ocultan con explicación; nunca fallan.

### RB-CONNECT-004 · Desconexión desde Stripe

**Estado:** 🟢 Vigente

Si el gimnasio revoca el acceso desde su Stripe, Apta lo detecta por webhook y
deja de ofrecer cobros (vuelve a `RB-CONNECT-002`).

## Productos y precios

### RB-VENTA-002 · Archivar, nunca borrar

**Estado:** 🟢 Vigente

Un producto, cuota o bono **se archiva, no se borra**: desaparece de los
selectores y sigue en el histórico. Cambiar el importe crea un precio nuevo; las
suscripciones vivas **conservan el anterior** (ver `RB-PAGO-007`). Lo mismo
vale para los cupones.

### RB-VENTA-007 · Nunca se borra un precio en Stripe

**Estado:** 🟢 Vigente

El catálogo se sincroniza de verdad con Stripe. Un `Price` nunca se borra: se
archiva. Toda creación lleva clave de idempotencia (`RB-PAGO-022`).

### Qué es recurrente

**Estado:** 🟢 Vigente · **Decisión:** D6 del paso a producción (sin número `RB`)

Solo los productos de tipo **mensual** (`MONTHLY`) u **online** se cobran como
suscripción. Entrenamiento personal, dúo y bono de sesiones se cobran **una
vez**. Un "EP 8 sesiones al mes" recurrente se da de alta como mensual con 8
sesiones incluidas.

## Bonos

### RB-VENTA-008 · Libro del bono

**Estado:** 🟢 Vigente · **Decisión:** D-P7

Toda variación del saldo de sesiones de un bono (compra, reserva, cancelación,
no-show devuelto, ajuste, caducidad, renovación) deja un asiento en el libro del
bono, con su motivo y, si aplica, la reserva que lo causó. **Nada mueve el saldo
sin asiento.** El socio ve sus movimientos en `/portal/movimientos`.

**Dónde vive:** `src/lib/session-ledger.ts`

### RB-PAGO-008 · Ajuste manual del saldo

**Estado:** 🟢 Vigente (corregida en E12-13)

El saldo de un bono se puede corregir a mano desde la ficha del socio. No es un
cobro: no genera pago ni pasa por Stripe.

- **Quién:** dirección de organización, dirección de centro, **Entrenador
  Admin** y recepción. El entrenador raso **no**.
- Solo sobre bonos activos o congelados; nunca en bonos ilimitados; nunca por
  debajo de 0. Se aplica como incremento relativo y queda en auditoría.

**Dónde vive:** `canAdjustSessionBalance` en `src/lib/rbac.ts`

### Renovación de una cuota con sesiones

**Estado:** 🟢 Vigente · **Decisiones:** D3 y D4 del paso a producción (sin número `RB`)

- Cada renovación mensual **recarga** las sesiones incluidas.
- Las sesiones que sobran **no se acumulan**: caducan al renovar (D3).
- **Adelantar la renovación**: el socio que agota sus sesiones puede pagar ya el
  mes siguiente desde `/portal/membresia`. El ciclo empieza ese día y **se
  pierden los días que quedaban** (D4). Solo con tarjeta, no con SEPA (D5).
- No se abre una segunda suscripción recurrente si ya hay una viva (STR-02).

## Ciclo de vida de la cuota

### RB-PAGO-004 · Congelar la cuota (pausa voluntaria)

**Estado:** 🟢 Vigente

Pausar la suscripción sin darla de baja: conserva plan, importe e historial y
deja de generar cobros. En Stripe es una pausa de cobro.

- Desde el portal, el socio congela **con fecha de fin obligatoria** y dentro de
  los límites del centro. Desde la gestión puede ser indefinida.
- **Pausa voluntaria (`PAUSED`) e impago (`FROZEN`) son estados distintos** de la
  cuota (`RB-PAGO-026`): un socio de vacaciones no es un moroso.

### RB-PAGO-005 · Venta puntual sobre la cuota

**Estado:** 🟢 Vigente

Un cargo único (bono extra, valoración, material) que no altera la cuota
recurrente, atribuido a quien lo vende (`RB-RRHH-004`).

### RB-PAGO-006 · Baja programada

**Estado:** 🟢 Vigente

La baja se programa para una fecha futura (normalmente fin del periodo pagado):
la cuota sigue activa hasta entonces y la pasada diaria la ejecuta. Desde la
gestión exige doble confirmación y motivo; el socio también puede darse de baja
desde su portal. Se puede anular mientras no llegue la fecha.

### RB-PAGO-007 · Cambiar el importe de una cuota

**Estado:** 🟢 Vigente

El nuevo importe aplica **desde el próximo ciclo**, nunca de forma retroactiva,
y queda en auditoría con el motivo.

### RB-PAGO-003 · Devoluciones

**Estado:** 🟢 Vigente · **Decisión:** D-S7

Dirección devuelve un cobro desde Apta (`/billing/reembolsos`), con motivo
obligatorio y doble confirmación. Si el cobro fue por Stripe, la devolución se
emite en Stripe; si fue manual, se registra.

## Cobro por domiciliación y morosidad

### RB-PAGO-009 · Domiciliación SEPA con mandato

**Estado:** 🟢 Vigente

El socio puede pagar por adeudo SEPA. El mandato se guarda y se le confirma por
email.

### RB-PAGO-025 · Un cobro SEPA en vuelo no da acceso

**Estado:** 🟢 Vigente

Un adeudo SEPA tarda días en confirmarse. Mientras tanto la cuota está
"pendiente de confirmación": el socio **no puede reservar**, pero tampoco es
moroso. Quien paga con tarjeta en `/hazte-socio` nace activo (CHK-04).

### RB-PAGO-027 · Preaviso de cobro SEPA

**Estado:** 🟢 Vigente

Se avisa al socio por email **14 días naturales** antes de cada adeudo, salvo
que el contrato firmado pacte un plazo más corto (se refleja con una variable de
entorno, que no sustituye al pacto).

### RB-PAGO-012 / RB-PAGO-028 · Reintentos e impago

**Estado:** 🟢 Vigente · **Decisiones:** D-S5 y D-S6

- Tras un cobro fallido el socio entra en **periodo de gracia**: **7 días por
  defecto, configurables por organización**. Al vencer, se corta el acceso.
- Agotados los reintentos de Stripe, la suscripción **se cancela**.
- Las cuatro vías de impago (factura fallida, adeudo fallido, devolución
  bancaria, contracargo) abren y cierran la morosidad por la misma puerta.
- Se avisa al socio cuando su tarjeta va a caducar.

### RB-PAGO-026 · Pausa voluntaria ≠ impago

**Estado:** 🟢 Vigente

Ver `RB-PAGO-004`. Separado en HU-ST-14.

## Reglas técnicas de Stripe (las cumple desarrollo; negocio no necesita tocarlas)

| Regla | Qué garantiza | Estado |
|---|---|---|
| `RB-PAGO-020` | El webhook verifica las dos firmas (plataforma y cuentas conectadas) | 🟢 |
| `RB-PAGO-021` | La versión de API de Stripe se fija en el código | 🟢 |
| `RB-PAGO-022` | Toda creación contra Stripe lleva clave de idempotencia | 🟢 |
| `RB-PAGO-023` | Un mismo evento de Stripe nunca se procesa dos veces | 🟢 |
| `RB-PAGO-024` | Existe un modo demo del cobro al socio, solo si se enciende explícitamente (`DEMO_MODE`) | 🟢 |

## Numeración reservada sin regla escrita

`RB-PAGO-010` (Bizum), `011` (wallets), `013` (portal de cliente de Stripe),
`014` (enlaces de pago), `015` (cupones), `016` (Stripe Tax), `017` (TPV),
`018` (Connect), `019`, `RB-VENTA-003` (el socio gestiona su método de pago en
el portal de Stripe) y `RB-CONNECT-003` (descartada: pegar una clave por
organización) se reservaron en planes ya ejecutados. Cupones, portal de Stripe,
Bizum en pago puntual y Connect **existen**; si negocio quiere fijar su
comportamiento, que reescriba la regla con su número.
