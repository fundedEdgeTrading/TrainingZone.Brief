# Cuestionarios de privacidad de tienda — E9-16

Borrador de las respuestas de **App Privacy** (App Store Connect) y
**Data safety** (Google Play Console). Los dos cuestionarios se rellenan a
mano en cada consola — no hay fichero de configuración que los sustituya —
así que este documento es la fuente que hay que copiar, no una automatización.

Basado en lo que la API móvil expone hoy (`apps/mobile/src/api/types.ts`):
identidad y contacto, fotos de progreso, semáforo de aptitud/salud y
seguimiento de pagos ya realizados en Stripe (importe, fecha, método —
**no** el número de tarjeta, que nunca pasa por este backend).

No se declara nada de analítica ni publicidad: la app no lleva ningún SDK de
medición (ver `AGENTS.md` — cero cookies no técnicas, mismo criterio en
móvil).

## Categorías declaradas

Las dos tiendas exigen elegir categorías de datos. Con datos de salud y fotos
corporales de por medio, las dos que aplican son:

- **Apple: "Health & Fitness"** (además de "Contact Info", "Financial Info"
  y "User Content" para las fotos).
- **Google: "Health and fitness"** dentro de **"Sensitive info"** (además de
  "Personal info", "Financial info" y "Photos and videos").

## App Privacy (Apple)

| Tipo de dato | ¿Se recoge? | ¿Vinculado a la identidad? | Uso |
|---|---|---|---|
| Nombre | Sí | Sí | Funcionalidad de la app (ficha de socio/entrenador) |
| Email | Sí | Sí | Funcionalidad de la app (inicio de sesión) |
| Teléfono | Sí | Sí | Funcionalidad de la app (contacto del socio) |
| Fotos o vídeos (User Content) | Sí — fotos de progreso (frente/lado/espalda) | Sí | Funcionalidad de la app (seguimiento visual, solo visible para el propio socio y su entrenador) |
| Salud (Health) | Sí — semáforo de aptitud, transparencia de bloqueos por zona | Sí | Funcionalidad de la app (valoración y adaptación del entrenamiento) |
| Historial de pagos (Financial Info) | Sí — importe, fecha, estado y método, ya procesados por Stripe | Sí | Funcionalidad de la app (consulta de bonos y cobros) |
| Identificadores (Identifiers) | Sí — token de sesión | Sí | Funcionalidad de la app (autenticación) |

**Seguimiento (tracking) de terceros: NO.** Ningún dato se usa para publicidad
ni se comparte con un bróker de datos. Los únicos terceros que procesan datos
son encargados del tratamiento bajo contrato (Stripe para el cobro; Brevo
para el correo transaccional — ninguno de los dos alimenta la app móvil salvo
el historial de pagos ya resuelto), documentados en
`src/lib/data-region.ts` → `THIRD_PARTY_PROCESSORS`.

**Base legal del dato de salud:** art. 9.2.f RGPD, con consentimiento
explícito recogido en el alta (decisión D-C2, `docs/hu/E9.md`).

## Data safety (Google Play)

Mismo contenido, en el formato de secciones que pide Play Console:

- **¿Se recoge o comparte algún dato de usuario?** Sí, se recoge. No se
  comparte con terceros para publicidad ni analítica.
- **¿Los datos se cifran en tránsito?** Sí (HTTPS/TLS en toda la API).
- **¿El usuario puede pedir que se borren sus datos?** Sí — es el mismo
  derecho de supresión que ya existe en la web (`/preferencias`, `/baja`) y
  que aplica igual a la cuenta usada desde la app.
- **Tipos de datos declarados:**
  - *Personal info*: nombre, email, teléfono.
  - *Photos and videos*: fotos de progreso.
  - *Health and fitness* (dentro de *Sensitive info*): semáforo de aptitud y
    transparencia de bloqueos por zona corporal.
  - *Financial info*: historial de pagos (importe, fecha, método, estado).
  - *App activity*: reservas y asistencias, para mostrar la agenda propia.

## Antes de enviar la ficha a revisión

1. Confirmar `apps/mobile/app.json` → `expo.extra.privacyPolicyUrl`
   (`PUBLISHING.md` §2): las dos consolas piden esta URL y tiene que resolver
   a la política real, no al placeholder de trabajo.
2. Repetir esta declaración si `apps/mobile/src/api/types.ts` gana un campo
   nuevo de datos personales o de salud: el cuestionario miente en cuanto la
   API cambia y el documento no se actualiza a la vez.
