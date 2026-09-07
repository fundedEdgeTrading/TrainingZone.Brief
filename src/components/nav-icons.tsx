import type { NavIcon } from "@/lib/rbac";

/**
 * Iconos de trazo del NavBar (rediseño): uno por item de menú. Sustituyen al
 * punto de 7 px que llevaba antes cada fila.
 *
 * No hay librería de iconos en el proyecto y no hace falta para 21 trazos.
 * Todos comparten envoltorio (`viewBox 0 0 24 24`, `fill:none`,
 * `stroke:currentColor`, grosor 1.8, extremos redondeados) y heredan el color
 * de la fila vía `currentColor`: reposo `text-2`, hover negro, activo oro.
 */
const PATHS: Record<NavIcon, React.ReactNode> = {
  panel: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.6" />
    </>
  ),
  feedback: <path d="M4 5.5h16v10H10l-4.5 3.5v-3.5H4z" />,
  // E8-18: geometría idéntica al icono "users" de la app móvil
  // (`apps/mobile/src/components/Icon.tsx`) — se conserva el de la app porque
  // está mejor construido; antes web dibujaba su propio trazo de dos personas
  // con proporciones distintas para el mismo concepto.
  socios: (
    <>
      <circle cx="8.5" cy="8.5" r="3.4" />
      <circle cx="16.5" cy="9.5" r="2.6" />
      <path d="M2.5 20c0-3 2.6-4.6 6-4.6s6 1.6 6 4.6" />
      <path d="M16.5 15.8c2.7.4 4.5 2 4.5 4.2" />
    </>
  ),
  // E8-18: geometría idéntica al icono "calendar" de la app móvil — antes cada
  // superficie dibujaba su propia "Agenda" con un trazo distinto.
  agenda: (
    <>
      <path d="M4 6.5h16v14H4z" />
      <path d="M4 10.5h16M8.5 3.5v4M15.5 3.5v4" />
    </>
  ),
  // E8-18: geometría idéntica al icono "wallet" de la app móvil.
  cobros: (
    <>
      <path d="M3.5 7.5h14A2.5 2.5 0 0 1 20 10v8.5H6a2.5 2.5 0 0 1-2.5-2.5z" />
      <path d="M3.5 7.5A2 2 0 0 1 5.5 5.5H16" />
      <path d="M15.5 13h4.5" />
    </>
  ),
  aforo: (
    <>
      <path d="M4 18.5a8 8 0 1 1 16 0" />
      <path d="M12 18.5l4.2-5" />
    </>
  ),
  leads: <path d="M3.5 5h17l-6.6 7.6v6.2L10 20.5v-7.9z" />,
  anuncios: (
    <>
      <path d="M3.5 10v4l10.5 4.4V5.6z" />
      <path d="M14 8.8a3.4 3.4 0 0 1 0 6.4" />
    </>
  ),
  reglas: (
    <>
      <rect x="8" y="3" width="8" height="18" rx="4" />
      <circle cx="12" cy="7.6" r="1.35" />
      <circle cx="12" cy="12" r="1.35" />
      <circle cx="12" cy="16.4" r="1.35" />
    </>
  ),
  rangos: <path d="M5 20V11M12 20V4.5M19 20v-6" />,
  // E8-18: geometría idéntica al icono "building" de la app móvil — antes web
  // dibujaba un tejado a dos aguas y la app un bloque rectangular para la
  // misma sección "Organización".
  organizacion: (
    <>
      <path d="M5 21V4.5h14V21" />
      <path d="M9 8.5h2M13 8.5h2M9 12.5h2M13 12.5h2" />
      <path d="M10 21v-4.5h4V21" />
    </>
  ),
  rrhh: (
    <>
      <circle cx="10" cy="8" r="3.6" />
      <path d="M3.5 20c0-3.4 2.9-5.6 6.5-5.6.9 0 1.8.1 2.5.4" />
      <path d="M15 17.4l2.2 2.2 4.3-4.4" />
    </>
  ),
  puestaEnMarcha: (
    <>
      <path d="M6 21V3.5" />
      <path d="M6 4.6h11.5l-2.2 4 2.2 4H6" />
    </>
  ),
  auditoria: (
    <>
      <path d="M12 3l7.5 3v5.2c0 5-3.2 8-7.5 9.8-4.3-1.8-7.5-4.8-7.5-9.8V6z" />
      <path d="M9 12.2l2.2 2.2 4.3-4.5" />
    </>
  ),
  brief: (
    <>
      <path d="M6 3.5h8.5L19 8v12.5H6z" />
      <path d="M14 3.5V8h5" />
      <path d="M9 13h7M9 16.5h4.5" />
    </>
  ),
  // E8-18: geometría idéntica al icono "activity" de la app móvil.
  actividad: <path d="M3 12h4l2.5-7 4 14 2.5-7H21" />,
  reservar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8.5 3.5v3.5M15.5 3.5v3.5M12 13.2v4.2M9.9 15.3h4.2" />
    </>
  ),
  evolucion: (
    <>
      <path d="M3.5 17.5l5.5-5.5 3.5 3.5 7-7" />
      <path d="M15 8.5h4.5V13" />
    </>
  ),
  membresia: (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="3" />
      <path d="M3 9.5h18M7 14h4" />
    </>
  ),
  // Lista con una marca de hecho: es lo que hace el tablero de tareas.
  tareas: (
    <>
      <path d="M4 6.5h9M4 12h9M4 17.5h6" />
      <path d="m16 15.6 2.1 2.1 3.9-4.2" />
    </>
  ),
  descargar: <path d="M12 3v12M7 11l5 5 5-5M4 20h16" />,
};

export default function NavIconSvg({
  name,
  className,
  style,
}: {
  name: NavIcon;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={style}
    >
      {PATHS[name]}
    </svg>
  );
}
