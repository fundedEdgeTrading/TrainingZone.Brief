# 09 · Plataforma, alta de gimnasios y acceso

El **plano 1**: Apta vende su licencia a gimnasios. Más identidad, seguridad y
conservación de datos. Descripción funcional en
[PRODUCTO_COBROS.md](../PRODUCTO_COBROS.md) §2 y
[ARQUITECTURA.md](../ARQUITECTURA.md).

## Licencia y planes

### RB-PLAN-001 · El precio de la licencia vive en Stripe

**Estado:** 🟢 Vigente (reescrita: antes decía "en variables de entorno")

Los planes (Esencial, Avanzado, Élite, Fundador) y qué funcionalidades lleva
cada uno están en código (`src/lib/platform-plans.ts`). **El precio** se lee de
Stripe por su clave (`apta_<plan>`): cambiar un precio se hace en Stripe, sin
desplegar. Archivar el precio lo retira de `/planes`.

- El eje de precio es el **número de centros, nunca el de socios** (D-8).
- **Fundador**: pago único, a perpetuidad, sin IA, con cupo real de plazas.
- La compra de la licencia **no admite Apple Pay** (con "ocultar mi correo" Apta
  perdía el email del director). Los socios sí pueden pagar con Apple Pay.

### RB-PLAN-002 · El límite de centros es del plan

**Estado:** 🟢 Vigente

Crear un centro por encima del límite del plan se rechaza con la salida concreta
(qué plan lo permite). La comprobación es a prueba de dos altas simultáneas.

### RB-PLAN-003 · El plan oculta analítica, nunca datos propios

**Estado:** 🟢 Vigente

Además del rol, cada pantalla premium comprueba el plan contratado, también por
URL directa y en la app (`RB-PLAT-008`). Lo que se oculta es analítica y
módulos; **nunca** los datos del propio gimnasio ni su exportación. Toda ruta
nueva tiene que declarar su gate: si no, falla un test.

### RB-PLAT-008 · La app comprueba el plan igual que la web

**Estado:** 🟢 Vigente

### RB-PLAT-009 · La IA se gatea antes de llamar al modelo

**Estado:** 🟢 Vigente — sin el plan con IA, o con el cupo del mes agotado, no se hace la llamada (que cuesta dinero).

## Estado de la licencia

### RB-PLAT-001 · Solo una licencia activa abre la aplicación

**Estado:** 🟢 Vigente

| Estado | Qué implica |
|---|---|
| Pendiente de pago | Muro de pago (`/activar`). Se purga a los **30 días** |
| Activa | Operativa |
| Impagada | El cobro recurrente falló; periodo de gracia |
| Suspendida | Impago persistente: solo lectura. **Nunca se purga** |
| Cancelada | Baja definitiva |

### RB-PLAT-004 · Solo la confirmación del pago activa la licencia

**Estado:** 🟢 Vigente — el webhook de Stripe es lo único que pasa una organización a activa. Repetirlo no duplica nada.

### RB-PLAT-005 · Purga de altas sin pagar

**Estado:** 🟢 Vigente — 30 días; nunca a una organización suspendida o cancelada.

### RB-PLAT-002 / RB-PLAT-003 / RB-PLAT-006 / RB-PLAT-007

`002` (alta del director con contraseña y login automático) y `003` (reanudar un
registro a medias) eran del flujo "registro primero", **sustituido** por el alta
pago-primero (`RB-ALTA-001`). `006` (catálogo como dato) lo cubren `RB-PLAN-001`
y `RB-PLAN-003`. `007` (las organizaciones de demo nacen activas) es interna de
desarrollo. 🗑️ Sustituidas, se conservan como registro.

## Alta de un gimnasio

### RB-ALTA-001 · La organización nace del pago

**Estado:** 🟢 Vigente

Se compra la licencia en `/planes` sin cuenta previa; la organización y su
dirección se crean **al confirmarse el pago**. `/activar` cierra el alta contra
Stripe sin esperar al webhook. La organización nueva nace con sus listas por
defecto (canales, motivos de no cierre) y una guía de puesta en marcha.

### RB-ALTA-002 · Quien acaba de pagar nunca se queda sin salida

**Estado:** 🟢 Vigente — ve el estado de su alta y puede reenviarse el enlace de activación. El email nunca es el único camino.

### RB-ALTA-003 · Un email no crea dos organizaciones

**Estado:** 🟢 Vigente

- Un pago con el email de alguien que **ya dirige** una organización **se retiene
  para soporte**, no crea una segunda (QA-ALTA-13).
- En el alta de socios (`/hazte-socio`), un email que ya es socio de esa
  organización no crea una segunda ficha.

## Identidad

### RB-ID-001 · Una credencial, varias membresías

**Estado:** 🟢 Vigente — el email y la contraseña son únicos en todo Apta; la misma persona puede pertenecer a varias organizaciones con roles distintos. El duplicado se comprueba **por organización**.

### RB-ID-002 · Login único con selector

**Estado:** 🟢 Vigente — con una membresía se entra directo; con varias, se elige organización. Igual en la app.

### RB-ID-003 · Invitar a quien ya tiene cuenta no le pide contraseña nueva

**Estado:** 🟢 Vigente — se le añade la membresía y se respeta su contraseña. Desde la ficha de un centro no se puede reescribir la credencial de alguien que está en varias organizaciones.

### RB-ID-004 · Cambiar de organización se verifica en el servidor

**Estado:** 🟢 Vigente

### RB-ID-005 · Ninguna pantalla revela si una cuenta existe

**Estado:** 🟢 Vigente — login, recuperación de contraseña, enlace de preferencias y enlace de pago responden siempre igual exista o no el email.

## Seguridad (las cumple desarrollo)

| Regla | Qué garantiza | Estado |
|---|---|---|
| `RB-SEG-001` | El Session Brief solo abre sesiones del ámbito de centro de quien lo pide | 🟢 |
| `RB-SEG-002` | La API de la app aplica el mismo ámbito de centro que la web (agenda, plantilla) | 🟢 |
| `RB-SEG-003` | Feedback, debriefs y el selector de socio de la agenda respetan el ámbito de centro | 🟢 |
| `RB-SEG-004` | Recepción no recibe datos derivados de salud (media de debriefs) | 🟢 |
| `RB-SEG-005` | Freno de fuerza bruta en el login web y móvil | 🟢 |
| `RB-SEG-006` | La auditoría (`AuditLog`) no se puede modificar ni borrar desde la aplicación | 🟢 |

**Ámbito de centro (invariante):** dirección de organización ve todos sus
centros; el resto, solo los centros a los que está imputado. Vale para leer y
para escribir, en la web y en la app.

## Conservación de datos

### RB-DATOS-001 · Plazos de conservación y anonimización

**Estado:** 🟢 Vigente · **Decisión:** D-C3 (plazos estándar, validables por el jurídico)

Cada tipo de dato tiene su plazo (exsocios, leads no convertidos, auditoría,
altas sin pagar…) y la pasada diaria anonimiza o purga lo vencido. Los plazos y
su justificación están en `src/lib/data-retention.ts` y en
`docs/legal/03-PLAZOS-CONSERVACION.md`.

### Cookies (sin número `RB`)

**Estado:** 🟢 Vigente

Hoy solo hay cookies técnicas (sesión y zona horaria), inventariadas en
`/cookies`, y por eso no hay banner. **Cualquier analítica, publicidad o cookie
no técnica obliga a montar en el mismo cambio un banner con "rechazar todo" al
mismo nivel que "aceptar todo"** y a actualizar `/cookies`.
