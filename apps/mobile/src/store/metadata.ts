import appJson from "../../app.json";

/**
 * Contenido de la ficha de tienda (E9-16), en un solo sitio.
 *
 * `nombre` y `subtítulo` son las dos decisiones ya cerradas y son
 * irreversibles tras la primera publicación, igual que `bundleIdentifier` y
 * `package` (ver `PUBLISHING.md` §1) — así que se copian aquí literales, no se
 * inventan ni se retocan.
 *
 * `privacyPolicyUrl` NO se repite a mano: se lee de `app.json` →
 * `expo.extra.privacyPolicyUrl`, que es la única fuente. Si mañana se
 * confirma o corrige el dominio de producción (`PUBLISHING.md` §2), cambia
 * una línea en `app.json` y este módulo (y el resto de la ficha) lo hereda
 * sin tocarlo.
 *
 * Módulo puro: sin `react-native`, sin Expo runtime — se puede leer y probar
 * con Node a secas, y es lo que alimentaría un `eas metadata:push` el día que
 * se confirme el esquema exacto de `store.config.json` contra la
 * documentación versionada de Expo (`apps/mobile/AGENTS.md`: "Expo HAS
 * CHANGED"), que esta sesión no ha podido consultar por no tener salida a
 * internet.
 */

const PRIVACY_POLICY_URL = appJson.expo.extra.privacyPolicyUrl;

export const STORE_LISTING = {
  /** Nombre de ficha. Decisión cerrada, no reabrir. */
  name: "Apta · Tu gimnasio",

  /** Subtítulo (App Store: máx. 30 caracteres). Decisión cerrada, no reabrir. */
  subtitle: "Reserva, bonos y tu progreso",

  /**
   * Descripción breve de Google Play (máx. 80 caracteres).
   *
   * Dice qué resuelve, no qué es: no "Apta es la app de tu centro", sino la
   * fricción concreta que quita. `store.test.ts` comprueba el límite de
   * caracteres y que no empieza describiendo el producto en vez del problema.
   */
  shortDescription: "Reserva tu clase, controla tus bonos y seguimiento sin llamar a recepción.",

  /**
   * Descripción larga (App Store y Google Play, máx. 4000 caracteres en las
   * dos). Mismo criterio: problema → solución → qué incluye, sin listar
   * pantallas.
   */
  fullDescription: [
    "¿Cuántas veces has llamado a tu centro para reservar una clase, saber cuántas sesiones te quedan del bono o preguntar cómo va tu progreso? Con Apta no hace falta.",
    "Reserva tu próxima clase o sesión en segundos, y cancela con margen si algo cambia — la ventana de cancelación es la que tu centro tiene configurada, sin sorpresas.",
    "Consulta cuántas sesiones te quedan de tu bono y cuándo caduca, sin esperar a que te lo digan en recepción.",
    "Sigue tu progreso: tus valoraciones, tus fotos de evolución y las notas de tu entrenador, todo en el mismo sitio en el que reservas.",
    "Si eres entrenador, tu agenda del día, la ficha de cada socio y el semáforo de aptitud antes de cada sesión — sin cargar papel.",
  ].join("\n\n"),

  /** Palabras clave de App Store (máx. 100 caracteres, separadas por coma, sin espacios tras la coma). */
  keywords: "gimnasio,reservas,entrenamiento personal,bonos,clases,fitness,box,crossfit,pilates",

  privacyPolicyUrl: PRIVACY_POLICY_URL,

  /** Categoría primaria en cada tienda. Determina también el cuestionario de privacidad aplicable. */
  category: {
    apple: "HEALTH_AND_FITNESS",
    google: "HEALTH_AND_FITNESS",
  },
} as const;
