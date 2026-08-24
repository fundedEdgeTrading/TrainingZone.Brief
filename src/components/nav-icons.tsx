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
  socios: (
    <>
      <circle cx="9" cy="8.6" r="3.6" />
      <path d="M2.5 20.2c0-3.4 2.9-5.6 6.5-5.6s6.5 2.2 6.5 5.6" />
      <path d="M16.2 5.4a3.3 3.3 0 0 1 0 6.4" />
      <path d="M18 15c2 .8 3.5 2.6 3.5 5.2" />
    </>
  ),
  agenda: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8.5 3.5v3.5M15.5 3.5v3.5" />
    </>
  ),
  cobros: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
      <circle cx="12" cy="12" r="2.6" />
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
  organizacion: (
    <>
      <path d="M4 20.5V6.2l8-3 8 3v14.3" />
      <path d="M2.5 20.5h19" />
      <path d="M9.5 20.5V15h5v5.5" />
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
  actividad: <path d="M3 12.5h4l2.2-5.5 3.4 10.5 2.4-5h6" />,
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
  facturas: (
    <>
      <path d="M6 3.5h12v17l-3-1.8-3 1.8-3-1.8-3 1.8z" />
      <path d="M9 8h6M9 11.5h6" />
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
