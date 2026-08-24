import type { Role } from "@prisma/client";
import type { PlatformFeature } from "@/lib/platform-plans";

/**
 * Matriz de permisos (A.2.5). Ámbito: rol x módulo.
 * "own" = solo su propio ámbito (sus sesiones, su ficha); "center" = su
 * centro; "org" = toda la organización.
 */
export type NavSection =
  | "Vista general"
  // Rediseño del NavBar: "Comercial" (una cabecera para un único item, Leads)
  // desaparece y "Operativa del centro" pasa a "Día a día". Captar, recuperar y
  // comunicar son el mismo trabajo, y se agrupan en "Crecimiento"; en "Día a
  // día" queda lo que se abre cada mañana. El rótulo antiguo tampoco encajaba
  // en Dirección de organización, que no está en un centro.
  | "Día a día"
  | "Crecimiento"
  | "Salud y aptitud"
  | "Administración"
  // Navegación del socio (rediseño NavBar premium, opción 1b): dos grupos con
  // jerarquía en vez de un único "Mi cuenta" plano.
  | "Entrenar"
  | "Membresía";

/**
 * Clave del icono de trazo de cada item. Es una clave, no JSX: `rbac.ts` se
 * importa desde el servidor y desde `middleware`, así que no puede arrastrar
 * componentes. El mapa clave → SVG vive en `src/components/nav-icons.tsx`.
 */
export type NavIcon =
  | "panel"
  | "feedback"
  | "socios"
  | "agenda"
  | "cobros"
  | "aforo"
  | "leads"
  | "anuncios"
  | "reglas"
  | "rangos"
  | "organizacion"
  | "rrhh"
  | "puestaEnMarcha"
  | "auditoria"
  | "brief"
  | "actividad"
  | "reservar"
  | "evolucion"
  | "membresia"
  | "facturas"
  // No es un item de menú: es el icono del botón "PDF" del panel de control.
  // Vive aquí igual que el resto para que el mapa clave → SVG siga siendo uno.
  | "descargar";

export type NavItem = {
  href: string;
  label: string;
  section: NavSection;
  icon: NavIcon;
  badge?: number;
  /** Texto corto a la derecha del item (p.ej. próxima reserva en "Reservar clase"). */
  meta?: string;
  /** Si está presente, el elemento solo se muestra si el plan contratado lo incluye (RB-PLAN-003). */
  feature?: PlatformFeature;
};

/**
 * Qué funcionalidad de plan cubre cada ruta gateada. Vive aquí, junto a la
 * navegación, para que no se pueda añadir un módulo premium al menú y olvidar
 * declararlo. La guarda de página (`requireFeature`) usa el mismo mapa.
 */
export const FEATURE_BY_ROUTE: Record<string, PlatformFeature> = {
  // `/dashboard` NO se gatea: es la ruta de aterrizaje de dirección y cerrarla
  // dejaría a un cliente Esencial mirando un muro de pago en cada login. Lo que
  // se gatea es el BI avanzado DENTRO del panel, no la puerta.
  //
  // `retencion` tampoco aparece aquí, y no es un olvido: ya no hay ruta que
  // gatear. La pantalla `/retention` se retiró —era una lista sin motor detrás,
  // de ámbito organización y con la prioridad al revés— y el motor (G.3) pasó a
  // `src/lib/retention.ts`, disparado por el cron. El gateo por plan vive ahora
  // donde se produce el valor: `runRetentionAlertRule` no calcula nada para una
  // organización cuyo plan no incluye la funcionalidad, así que sin ella no hay
  // alertas que enseñar ni en el listado de socios ni en la ficha.
  "/feedback": "feedback_direccion",
  "/brief": "salud_aptitud",
  "/health/aptitude-rules": "salud_aptitud",
  "/health/reference-ranges": "salud_aptitud",
  "/audit": "exportaciones",
};

/** Aplica el mapa anterior a una navegación ya resuelta por rol. */
export function withFeatureFlags(items: NavItem[]): NavItem[] {
  return items.map((item) => {
    const feature = FEATURE_BY_ROUTE[item.href];
    return feature ? { ...item, feature } : item;
  });
}

/** Deja solo lo que el rol permite Y el plan incluye. */
export function filterNavByFeatures(items: NavItem[], features: Set<PlatformFeature>): NavItem[] {
  return withFeatureFlags(items).filter((item) => !item.feature || features.has(item.feature));
}

export const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  OWNER: [
    { href: "/dashboard", label: "Panel de control", section: "Vista general", icon: "panel" },
    { href: "/feedback", label: "Feedback", section: "Vista general", icon: "feedback" },
    { href: "/members", label: "Socios", section: "Día a día", icon: "socios" },
    { href: "/agenda", label: "Agenda", section: "Día a día", icon: "agenda" },
    { href: "/billing", label: "Cobros", section: "Día a día", icon: "cobros" },
    { href: "/leads", label: "Leads", section: "Crecimiento", icon: "leads" },
    // Anuncios sale de Administración: es comunicación al socio, no estructura.
    { href: "/anuncios", label: "Anuncios", section: "Crecimiento", icon: "anuncios" },
    { href: "/health/aptitude-rules", label: "Reglas de aptitud", section: "Salud y aptitud", icon: "reglas" },
    { href: "/health/reference-ranges", label: "Rangos de composición", section: "Salud y aptitud", icon: "rangos" },
    { href: "/organization", label: "Organización", section: "Administración", icon: "organizacion" },
    { href: "/rrhh", label: "RRHH", section: "Administración", icon: "rrhh" },
    { href: "/puesta-en-marcha", label: "Puesta en marcha", section: "Administración", icon: "puestaEnMarcha" },
    { href: "/audit", label: "Auditoría", section: "Administración", icon: "auditoria" },
  ],
  CENTER_DIRECTOR: [
    { href: "/dashboard", label: "Panel de control", section: "Vista general", icon: "panel" },
    { href: "/feedback", label: "Feedback", section: "Vista general", icon: "feedback" },
    { href: "/members", label: "Socios", section: "Día a día", icon: "socios" },
    { href: "/agenda", label: "Agenda", section: "Día a día", icon: "agenda" },
    { href: "/aforo", label: "Aforo de clases", section: "Día a día", icon: "aforo" },
    { href: "/billing", label: "Cobros", section: "Día a día", icon: "cobros" },
    { href: "/leads", label: "Leads", section: "Crecimiento", icon: "leads" },
    { href: "/anuncios", label: "Anuncios", section: "Crecimiento", icon: "anuncios" },
    { href: "/health/aptitude-rules", label: "Reglas de aptitud", section: "Salud y aptitud", icon: "reglas" },
    { href: "/health/reference-ranges", label: "Rangos de composición", section: "Salud y aptitud", icon: "rangos" },
    // Dirección de centro entra en Organización solo por la plantilla: la ve
    // acotada a SUS centros y sin marca, productos ni alta de personal (la
    // página gatea esas secciones por `canManageOrg`/`canManageStaff`). Sin
    // esta entrada no tendría desde dónde dar de baja a un trabajador suyo.
    { href: "/organization", label: "Organización", section: "Administración", icon: "organizacion" },
    { href: "/rrhh", label: "RRHH", section: "Administración", icon: "rrhh" },
  ],
  // Un entrenador no gestiona personal: RRHH fuera. Sus 5 items caben en una
  // sola sección: por debajo de 7 items las cabeceras cuestan más de lo que
  // ordenan, y el sidebar las oculta cuando solo hay un grupo.
  TRAINER: [
    { href: "/trainer", label: "Mi panel", section: "Vista general", icon: "panel" },
    { href: "/agenda", label: "Agenda", section: "Vista general", icon: "agenda" },
    { href: "/brief", label: "Session Brief", section: "Vista general", icon: "brief" },
    { href: "/members", label: "Socios", section: "Vista general", icon: "socios" },
    { href: "/leads", label: "Leads", section: "Vista general", icon: "leads" },
  ],
  // El del entrenador más lo que le da su mando sobre el centro (F1).
  TRAINER_ADMIN: [
    { href: "/trainer", label: "Mi panel", section: "Vista general", icon: "panel" },
    { href: "/agenda", label: "Agenda", section: "Vista general", icon: "agenda" },
    { href: "/aforo", label: "Aforo de clases", section: "Vista general", icon: "aforo" },
    { href: "/brief", label: "Session Brief", section: "Vista general", icon: "brief" },
    { href: "/members", label: "Socios", section: "Vista general", icon: "socios" },
    { href: "/leads", label: "Leads", section: "Vista general", icon: "leads" },
  ],
  RECEPTION: [
    { href: "/leads", label: "Leads", section: "Día a día", icon: "leads" },
    { href: "/members", label: "Socios", section: "Día a día", icon: "socios" },
    { href: "/agenda", label: "Agenda", section: "Día a día", icon: "agenda" },
    { href: "/billing", label: "Cobros", section: "Día a día", icon: "cobros" },
  ],
  // "Mi perfil" ya no vive en el nav: se accede desde el bloque de usuario del
  // pie del sidebar y desde el chip de usuario del header (menú de cuenta).
  // "Mi plan" + "Comprar/renovar" se fusionan en "Mi membresía".
  MEMBER: [
    { href: "/portal", label: "Mi actividad", section: "Entrenar", icon: "actividad" },
    { href: "/portal/agenda", label: "Reservar clase", section: "Entrenar", icon: "reservar" },
    { href: "/portal/evolucion", label: "Mi evolución", section: "Entrenar", icon: "evolucion" },
    { href: "/portal/membresia", label: "Mi membresía", section: "Membresía", icon: "membresia" },
    { href: "/portal/membresia/facturas", label: "Facturas y pagos", section: "Membresía", icon: "facturas" },
  ],
  HR_MANAGER: [
    { href: "/organization", label: "Organización", section: "Administración", icon: "organizacion" },
    { href: "/rrhh", label: "RRHH", section: "Administración", icon: "rrhh" },
  ],
  PLATFORM_ADMIN: [
    { href: "/dashboard", label: "Panel de control", section: "Vista general", icon: "panel" },
    { href: "/anuncios", label: "Anuncios", section: "Vista general", icon: "anuncios" },
    { href: "/organization", label: "Organización", section: "Vista general", icon: "organizacion" },
    { href: "/audit", label: "Auditoría", section: "Vista general", icon: "auditoria" },
  ],
};

// Orden canónico de secciones (las vacías se omiten al render).
export const NAV_SECTION_ORDER: NavSection[] = [
  "Vista general",
  "Día a día",
  "Crecimiento",
  "Salud y aptitud",
  "Administración",
  "Entrenar",
  "Membresía",
];

/**
 * Secciones que arrancan plegadas la primera vez (sin nada en
 * `localStorage["tz-nav-groups"]`). Administración es estructura y control: se
 * consulta de tarde en tarde, no cada mañana.
 */
export const NAV_SECTIONS_COLLAPSED_BY_DEFAULT: NavSection[] = ["Administración"];

export function groupNav(nav: NavItem[]) {
  return NAV_SECTION_ORDER.map((section) => ({
    section,
    items: nav.filter((i) => i.section === section),
  })).filter((g) => g.items.length > 0);
}

export function canViewHealthData(role: Role): boolean {
  // Recepción, RRHH y Admin plataforma NO ven datos de salud por defecto (A.2.4/A.2.5).
  // El Entrenador Admin hereda: sigue dando sesiones, y sin salud no puede prepararlas.
  return role === "OWNER" || role === "CENTER_DIRECTOR" || role === "TRAINER" || role === "TRAINER_ADMIN";
}

export function canEditHealthData(role: Role): boolean {
  // Alta/resolución de lesiones y condiciones: mismo ámbito que la lectura
  // (entrenador asignado + dirección). Recepción y RRHH quedan fuera.
  return canViewHealthData(role);
}

// F6 — mesociclos: los ve, los genera y los firma quien prepara la sesión.
// Recepción y RRHH quedan fuera, y el socio no los ve en absoluto: el mesociclo
// no se expone ni en el portal ni en la app móvil.
export function canManageMesocycles(role: Role): boolean {
  return canViewHealthData(role);
}

// Gestión de personal e imputación a centros (RRHH además de dirección/plataforma).
export function canManageStaff(role: Role): boolean {
  return role === "OWNER" || role === "PLATFORM_ADMIN" || role === "HR_MANAGER";
}

// Ver la plantilla y editar la ficha de un trabajador (nombre, rol, centro
// base, visibilidad en la app). Dirección de centro entra aquí —a diferencia
// del alta, que sigue siendo de organización y RRHH— pero solo sobre las
// personas de sus centros: el ámbito no lo da este predicado, lo aplica
// `staffScopeFilter` (lib/staff-queries.ts) sobre cada consulta.
export function canEditStaff(role: Role): boolean {
  return canManageStaff(role) || role === "CENTER_DIRECTOR";
}

// Baja de plantilla (RB-RRHH-014): EXCLUSIVO de dirección —de la organización
// o del centro—, igual que la baja de un socio. RRHH da de alta e imputa, pero
// no saca a nadie del equipo: sacar a alguien le corta el acceso y le quita la
// imputación en todos sus centros, y esa es una decisión de quien dirige.
export function canDeleteStaff(role: Role): boolean {
  return role === "OWNER" || role === "PLATFORM_ADMIN" || role === "CENTER_DIRECTOR";
}

// Alta de organización y centros: solo administración de la organización.
export function canManageOrg(role: Role): boolean {
  return role === "OWNER" || role === "PLATFORM_ADMIN";
}

export function canEditAptitudeRules(role: Role): boolean {
  return role === "OWNER";
}

export function canManageBilling(role: Role): boolean {
  return role === "OWNER" || role === "CENTER_DIRECTOR" || role === "RECEPTION";
}

export function canManageMembers(role: Role): boolean {
  return role === "OWNER" || role === "CENTER_DIRECTOR" || role === "RECEPTION";
}

// Baja definitiva de un socio (C4 — derecho de supresión): EXCLUSIVO de
// dirección. Recepción puede dar de alta y editar, pero no borrar el histórico
// de un socio, que arrastra reservas, cobros y datos de salud.
export function canDeleteMembers(role: Role): boolean {
  return role === "OWNER" || role === "CENTER_DIRECTOR";
}

// Importación masiva de socios desde CSV (RB-IMPORT): EXCLUSIVO de dirección
// (dirección de la organización y dirección de centro) — recepción queda fuera,
// a diferencia del alta individual.
export function canImportMembers(role: Role): boolean {
  return role === "OWNER" || role === "CENTER_DIRECTOR";
}

export function isStaffRole(role: Role): boolean {
  return role !== "MEMBER";
}

// F8 — CRM comercial de leads.
export function canManageLeads(role: Role): boolean {
  return (
    role === "OWNER" ||
    role === "CENTER_DIRECTOR" ||
    role === "RECEPTION" ||
    role === "TRAINER" ||
    role === "TRAINER_ADMIN"
  );
}

// F11/RB-AGENDA-006 — crear/editar/publicar franjas autorreservables de EP.
export function canManageEpSlots(role: Role): boolean {
  return role === "OWNER" || role === "CENTER_DIRECTOR" || role === "TRAINER" || role === "TRAINER_ADMIN";
}

// RB-RES-006 — ajuste manual del saldo de sesiones de un bono desde la ficha
// del socio. A diferencia del resto de la gestión de bonos (`canManageBilling`),
// aquí SÍ entra pista: es quien detecta que a un socio le falta o le sobra una
// sesión (sesión regalada, o hueco de EP agendado a mano, que crea la reserva
// con `subscriptionId` null y por tanto no descuenta bono —
// agenda-queries.ts::createEpSlot). No mueve dinero: solo saldo, y cada ajuste
// queda en AuditLog. Del lado del entrenador es EXCLUSIVO del Entrenador Admin:
// si lo pudiera hacer cualquier entrenador, el rol nuevo no aportaría nada.
export function canAdjustSessionBalance(role: Role): boolean {
  return role === "OWNER" || role === "CENTER_DIRECTOR" || role === "TRAINER_ADMIN" || role === "RECEPTION";
}

// Aforo por defecto de un centro (Center.defaultGroupCapacity). El Entrenador
// Admin lo configura para SUS centros (los de su CenterMembership); dirección,
// para cualquiera de la organización.
export function canManageCenterCapacity(role: Role): boolean {
  return role === "OWNER" || role === "CENTER_DIRECTOR" || role === "TRAINER_ADMIN";
}

// D.1 — publicar anuncios/banners del Dashboard del socio: EXCLUSIVO de dirección.
export function canManageAnnouncements(role: Role): boolean {
  return role === "OWNER" || role === "CENTER_DIRECTOR" || role === "PLATFORM_ADMIN";
}

// F14/RB-RRHH-012 — valoraciones de entrenadores: EXCLUSIVO dirección, nunca el propio entrenador.
export function canViewTrainerRatings(role: Role): boolean {
  return role === "OWNER" || role === "CENTER_DIRECTOR";
}

// G.1 — Debrief individual de una sesión: confidencial del entrenador asignado
// (o quien la dirigió realmente) más dirección. Recepción y el resto de
// entrenadores quedan fuera de la vista por sesión; dirección conserva además
// el informe semanal agregado (getWeeklyDebriefReport). El Entrenador Admin NO
// hereda por rol: manda en el aforo de su centro, no en la confidencialidad de
// lo que otro entrenador escribe de su sesión — entra por la vía de siempre,
// ser el entrenador de esa sesión.
export function canViewSessionDebrief(
  role: Role,
  actorUserId: string,
  session: { trainerId: string | null; directedByUserId: string | null }
): boolean {
  if (role === "OWNER" || role === "CENTER_DIRECTOR") return true;
  return session.trainerId === actorUserId || session.directedByUserId === actorUserId;
}

export function defaultRouteForRole(role: Role): string {
  // La primera entrada de su navegación que NO dependa del plan contratado:
  // evita redirigir a una ruta sin permiso (y su bucle) y también aterrizar a
  // un cliente de tier bajo en un módulo que no ha comprado.
  const items = NAV_BY_ROLE[role];
  const alwaysAvailable = items.find((item) => !FEATURE_BY_ROUTE[item.href]);
  return alwaysAvailable?.href ?? items[0]?.href ?? "/login";
}

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Dirección de organización",
  CENTER_DIRECTOR: "Dirección de centro",
  TRAINER: "Entrenador",
  RECEPTION: "Recepción",
  MEMBER: "Socio",
  HR_MANAGER: "RRHH",
  TRAINER_ADMIN: "Entrenador Admin",
  PLATFORM_ADMIN: "Admin plataforma",
};

/**
 * Pantallas que no están en el menú y por tanto no tienen entrada de la que
 * sacar el rótulo. Sin este mapa, `/mi-perfil` se titulaba "Training Zone" y
 * —peor— `/portal/perfil` heredaba por prefijo el de `/portal` y se anunciaba
 * como "Mi actividad", con ese item marcado como activo en el sidebar.
 */
export const OFF_NAV_TITLES: Record<string, string> = {
  "/mapa-barrios": "Mapa de barrios",
  "/mi-perfil": "Mi perfil",
  "/portal/perfil": "Mi perfil",
  "/portal/chat": "Chat con tu centro",
  "/portal/comprar": "Comprar o renovar",
  "/portal/plan": "Mi plan",
};

/**
 * Pantallas que cuelgan de otra: de dónde se sale y, por tanto, a dónde vuelve
 * el botón «volver» del header. También es lo que mantiene marcado el item del
 * menú del que la pantalla depende (el mapa de barrios se abre desde el panel
 * de control, y el sidebar no debería quedarse sin nada activo mientras).
 */
export const PARENT_ROUTE: Record<string, string> = {
  "/mapa-barrios": "/dashboard",
};

/**
 * Item de navegación al que corresponde una ruta: la coincidencia de prefijo
 * más larga, salvo que la ruta sea una de las que no cuelgan del menú (que
 * marcan la de su pantalla de origen, si la tienen).
 */
export function activeNavHref(nav: { href: string }[], pathname: string): string | undefined {
  if (OFF_NAV_TITLES[pathname]) return PARENT_ROUTE[pathname];
  return [...nav]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => pathname === item.href || pathname.startsWith(item.href + "/"))?.href;
}

/** Título de cabecera para la ruta actual: coincidencia de prefijo más larga en NAV_BY_ROLE. */
export function getPageTitle(nav: { href: string; label: string }[], pathname: string): string {
  const offNav = OFF_NAV_TITLES[pathname];
  if (offNav) return offNav;
  const match = [...nav]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => pathname === item.href || pathname.startsWith(item.href + "/"));
  return match?.label ?? "Training Zone";
}

export function footerLabelForRole(role: Role): string {
  return role === "MEMBER" ? "Portal del socio" : "MVP F0–F5";
}
