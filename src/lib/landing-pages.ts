/**
 * Páginas de captación por funcionalidad y por vertical (E9-11).
 *
 * El inventario completo de páginas públicas indexables era de **cuatro URLs**
 * (`/planes`, `/privacidad` y las dos plantillas de centro) contra Trainingym,
 * Mindbody, Virtuagym, Glofox y AimHarder, todos con blogs de cientos de
 * artículos. No se compite con cuatro URLs, se compita como se compita.
 *
 * La buena noticia es que el contenido **ya estaba escrito**: `CORE_FEATURES`
 * enumera lo que hace el producto y el hero ya nombraba los tres verticales.
 * Este módulo no inventa producto: le pone a cada cosa su URL, su consulta y su
 * párrafo.
 *
 * Módulo puro y sin Prisma: lo consumen las páginas, el sitemap y sus tests.
 */

import { CORE_FEATURES } from "@/lib/platform-plans";

export type LandingPage = {
  slug: string;
  /** Lo que va en el `<h1>`, con la consulta delante. */
  h1: string;
  /** `<title>`. La plantilla del layout raíz añade el sufijo de marca. */
  title: string;
  description: string;
  /** Párrafo de entrada. Un solo párrafo: la página no es un folleto. */
  intro: string;
  /** Tres a cinco puntos concretos. Nada que el producto no haga ya. */
  bullets: string[];
};

/** Copia por funcionalidad, indexada por su etiqueta EXACTA de `CORE_FEATURES`. */
const FEATURE_COPY: Record<string, Omit<LandingPage, "slug"> & { slug: string }> = {
  "Socios, fichas y consentimientos": {
    slug: "gestion-de-socios",
    h1: "Software de gestión de socios para tu centro",
    title: "Gestión de socios para gimnasios y centros de entrenamiento",
    description:
      "Ficha de socio, altas y bajas, consentimientos y datos de salud con su auditoría. Todo en un sitio y sin hojas de cálculo.",
    intro:
      "La ficha del socio es donde acaba pasando todo: el alta, la cuota, las lesiones que condicionan lo que puede entrenar y los consentimientos que la ley te obliga a poder demostrar. En Apta es una sola pantalla, y cada acceso a un dato de salud queda registrado.",
    bullets: [
      "Alta manual o importación desde CSV, con el histórico que ya tengas.",
      "Datos de salud con control de acceso por rol y registro de auditoría.",
      "Consentimientos guardados con su fecha y su versión, no marcados en una casilla.",
      "Estados reales: prospecto, prueba, activo, moroso, congelado y baja.",
    ],
  },
  "Agenda, reservas y control de asistencia": {
    slug: "agenda-y-reservas",
    h1: "Agenda y reservas online para tu gimnasio",
    title: "Agenda y reservas online para gimnasios y boxes",
    description:
      "Cuadrante de sala, sesiones periódicas, aforo, lista de espera y control de asistencia, con reserva desde el portal y desde la app.",
    intro:
      "El cuadrante de sala deja de vivir en una pizarra. Las sesiones se crean una vez y se repiten, el aforo lo controla el sistema y el socio reserva desde su móvil sin llamar a recepción.",
    bullets: [
      "Sesiones periódicas: se define la plantilla una vez y la agenda se llena sola.",
      "Aforo por sesión y lista de espera automática cuando se llena.",
      "Ventana de cancelación configurable por centro, la misma para socio, entrenador y recepción.",
      "Asistencia y no-show registrados, con el bono descontado donde debe.",
    ],
  },
  "Cobros y control de morosidad": {
    slug: "cobros-y-morosidad",
    h1: "Cobro de cuotas y control de morosidad para tu centro",
    title: "Cobros online y control de morosidad para gimnasios",
    description:
      "Cuotas recurrentes y bonos con tu propia cuenta de Stripe. El dinero va directo a ti: Apta no cobra comisión sobre tus ingresos.",
    intro:
      "Conectas tu cuenta de Stripe y cobras cuotas mensuales y bonos de sesiones desde tu propia página. Apta no toca ese dinero ni se lleva comisión: es licencia de software, no una pasarela.",
    bullets: [
      "Cuotas recurrentes y bonos puntuales, con Bizum en los pagos únicos.",
      "Periodo de gracia configurable antes de suspender por impago.",
      "El socio cambia su método de pago o cancela sin necesitar contraseña.",
      "Cada movimiento de bono deja asiento: nunca se descuenta una sesión sin registro.",
    ],
  },
  "Portal del socio y app móvil": {
    slug: "portal-del-socio-y-app",
    h1: "Portal del socio y app móvil para tu centro",
    title: "Portal del socio y app móvil para gimnasios",
    description:
      "Tus socios reservan, consultan su bono y siguen su progreso desde el móvil, sin llamar a recepción.",
    intro:
      "El socio entra, ve sus sesiones, reserva, consulta cuántas le quedan del bono y sigue su evolución. Recepción deja de ser una centralita y el equipo vuelve a la sala.",
    bullets: [
      "Reserva y cancelación desde el móvil, con la ventana del centro.",
      "Saldo del bono siempre visible, sin tener que preguntarlo.",
      "Evolución y valoraciones, para que el socio vea por qué sigue pagando.",
      "Incluido en cualquier plan, desde el primer día.",
    ],
  },
  "CRM de leads y anuncios": {
    slug: "crm-de-leads",
    h1: "CRM de leads para captar socios en tu gimnasio",
    title: "CRM de leads y captación para gimnasios",
    description:
      "Formulario público por centro, seguimiento del lead hasta que se convierte en socio, y anuncios para los que ya lo son.",
    intro:
      "Cada centro tiene su formulario público, embebible en su propia web. El lead entra con su origen, se le sigue el rastro y, cuando se convierte, deja de contar como lead: es la misma persona, no dos.",
    bullets: [
      "Formulario público por centro, listo para embeber.",
      "Origen del lead registrado, para saber qué canal trae gente.",
      "Mapa por barrio: dónde están tus socios y dónde hay demanda sin atender.",
      "Anuncios a socios, sin salir de la aplicación.",
    ],
  },
  "Organización, centros, personal y RRHH": {
    slug: "multicentro-y-personal",
    h1: "Software multicentro para cadenas de gimnasios",
    title: "Gestión multicentro, personal y RRHH para gimnasios",
    description:
      "Varios centros bajo una organización, con personal imputado a cada uno y permisos por rol. El precio escala por centro, no por socios.",
    intro:
      "Una organización, los centros que hagan falta, y cada persona del equipo imputada a los suyos con su rol. Quien dirige un centro ve el suyo; quien dirige la organización los ve todos.",
    bullets: [
      "Ámbito por centro aplicado en cada lectura y cada escritura, no por convención.",
      "Roles diferenciados: dirección, dirección de centro, entrenador, recepción y RRHH.",
      "Imputación de personal a varios centros, con su porcentaje de jornada.",
      "El precio escala por número de centros: cuantos más socios des de alta, mejor para ti.",
    ],
  },
};

/**
 * Una página por funcionalidad, **derivada de `CORE_FEATURES`**.
 *
 * El orden y el conjunto los manda el catálogo: si mañana entra una séptima
 * capacidad al núcleo, `landing-pages.test.ts` falla hasta que tenga su página.
 * Al revés que la alternativa —una lista escrita aparte—, que se desincroniza en
 * silencio y deja la landing prometiendo algo que ya no existe.
 */
export const FEATURE_PAGES: LandingPage[] = CORE_FEATURES.map((label) => {
  const copy = FEATURE_COPY[label];
  if (!copy) {
    throw new Error(`E9-11: la capacidad «${label}» de CORE_FEATURES no tiene página de captación.`);
  }
  return copy;
});

/** Etiqueta de `CORE_FEATURES` de la que sale cada página, para poder enlazarlas entre sí. */
export const FEATURE_LABEL_BY_SLUG: Record<string, string> = Object.fromEntries(
  CORE_FEATURES.map((label) => [FEATURE_COPY[label].slug, label])
);

/**
 * Los tres verticales que el hero ya nombraba ("tu gimnasio, tu box o tu
 * estudio") y que hasta ahora no tenían dónde aterrizar. Son tres negocios
 * distintos con tres búsquedas distintas: quien lleva un box no busca "software
 * de pilates".
 */
export const VERTICAL_PAGES: LandingPage[] = [
  {
    slug: "box-crossfit",
    h1: "Software de gestión para tu box de CrossFit",
    title: "Software para box de CrossFit",
    description:
      "Clases con aforo, lista de espera, bonos de sesiones y control de asistencia. Lo que un box necesita, sin lo que no.",
    intro:
      "Un box vive de clases con hora y aforo. La agenda se define una vez, la lista de espera se gestiona sola y el bono se descuenta cuando el socio asiste — no cuando reserva.",
    bullets: [
      "Sesiones periódicas con aforo y lista de espera.",
      "Bonos de sesiones con asiento en cada movimiento.",
      "No-show con motivo, para que el hueco no se pierda dos veces.",
      "Reserva desde el móvil, con la ventana de cancelación que decida el box.",
    ],
  },
  {
    slug: "entrenamiento-personal",
    h1: "Software de gestión para entrenamiento personal",
    title: "Software para entrenadores personales y estudios",
    description:
      "Valoraciones, mesociclos, seguimiento de progreso y cobro de bonos. Para quien vende sesiones, no cuotas de acceso.",
    intro:
      "En entrenamiento personal lo que se vende es el seguimiento. Apta guarda la valoración inicial, el programa, la evolución y el bono, y el socio lo ve todo desde su portal.",
    bullets: [
      "Valoraciones periódicas con su histórico y su comparación.",
      "Mesociclos y programación, con la sesión del día lista para la sala.",
      "Bonos de sesiones: nunca se mueve el saldo sin dejar asiento.",
      "Semáforo de Aptitud: qué puede entrenar hoy cada persona y por qué.",
    ],
  },
  {
    slug: "pilates",
    h1: "Software de gestión para tu estudio de pilates",
    title: "Software para estudios de pilates",
    description:
      "Grupos reducidos, aforo por máquina, bonos y recordatorios. Pensado para estudios donde cada plaza cuenta.",
    intro:
      "En un estudio de pilates el aforo es corto y cada plaza vacía se nota. La reserva, la lista de espera y el aviso de hueco libre están para que no quede ninguna sin llenar.",
    bullets: [
      "Aforo corto por sesión, con lista de espera y aviso automático de vacante.",
      "Bonos por número de sesiones, con caducidad configurable.",
      "Ficha con lesiones y limitaciones, accesible solo a quien debe verla.",
      "Recordatorios al socio, para bajar el no-show.",
    ],
  },
];

export const ALL_LANDING_PAGES = [...FEATURE_PAGES, ...VERTICAL_PAGES];

export function featurePage(slug: string): LandingPage | null {
  return FEATURE_PAGES.find((p) => p.slug === slug) ?? null;
}

export function verticalPage(slug: string): LandingPage | null {
  return VERTICAL_PAGES.find((p) => p.slug === slug) ?? null;
}

/** Rutas que estas páginas ocupan. Las usa el sitemap y el test de rutas públicas. */
export function featurePath(slug: string): string {
  return `/funcionalidades/${slug}`;
}

export function verticalPath(slug: string): string {
  return `/para/${slug}`;
}

/** Slug de ciudad para `/centros/[ciudad]`. Misma normalización en el índice y en el enlace. */
export function citySlug(city: string): string {
  return city
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
