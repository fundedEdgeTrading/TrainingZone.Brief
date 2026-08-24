// El guion del tutorial de la landing: instantes, escenas y rótulos.
//
// Vive aparte porque lo leen los dos lados: `tour-stage.tsx` (cliente) para
// derivar de él cada fotograma, y `tour.tsx` (servidor) para publicarlo en
// texto debajo de la pieza. Es la única copia: si una escena cambia de
// duración, la animación y el guion accesible se mueven juntos.

/** Segundo en que arranca cada escena. Las nueve suman 90 s exactos. */
export const CUE = {
  apertura: 0,
  panel: 4.5,
  socios: 16.5,
  agenda: 27.5,
  leads: 38.5,
  anuncios: 48.5,
  socio: 56.5,
  ia: 68.5,
  cierre: 79.5,
} as const;

export const DURATION = 90;

const { apertura: A0, panel: P, socios: S, agenda: G, leads: L, anuncios: N, socio: M, ia: I, cierre: Z } = CUE;

export type Caption = { from: number; to: number; kicker: string; text: string };

/** Rótulos en pantalla, con su entrada y su salida. Copy definitivo. */
export const CAPTIONS: Caption[] = [
  { from: P + 0.8, to: P + 6.2, kicker: "Panel de control", text: "Tus tres centros, en una pantalla" },
  { from: P + 6.4, to: S - 0.4, kicker: "Panel de control", text: "…y cada centro, por separado" },
  { from: S + 0.6, to: G - 0.4, kicker: "Socios", text: "Cada socio, su bono y su riesgo de fuga" },
  { from: G + 0.6, to: L - 0.4, kicker: "Agenda", text: "Reservas y aforo, en tiempo real" },
  { from: L + 0.6, to: N - 0.4, kicker: "Leads", text: "Del primer contacto al alta, sin excels" },
  { from: N + 0.6, to: M - 0.6, kicker: "Anuncios y feedback", text: "Habla con tus socios sin salir de la app" },
  { from: M + 0.8, to: I - 0.6, kicker: "Portal del socio", text: "Reserva, progreso y su app móvil" },
  { from: I + 0.8, to: Z + 0.6, kicker: "Programación por IA", text: "La IA propone el mesociclo; tú lo apruebas" },
];

/** Qué pasa en cada escena, para quien no puede o no quiere ver la animación. */
export const SCENES: { at: number; name: string; what: string }[] = [
  { at: A0, name: "Apertura", what: "El claim de la plataforma sobre negro; se disuelve y aparece la app." },
  { at: P, name: "Panel de control", what: "Saludo, insight del día, ocho KPIs contando desde cero y la gráfica de ingresos. El cursor filtra por el centro La Jota y todas las cifras cambian de ámbito." },
  { at: S, name: "Socios", what: "La tabla de socios con su bono usado, su última visita y las etiquetas de riesgo de fuga. El cursor abre el filtro de la columna Estado y marca Moroso: quedan dos filas." },
  { at: G, name: "Agenda", what: "Rejilla semanal con las sesiones por color de entrenador y su aforo. El cursor arrastra «WOD mañana» del lunes a las 08:00 al miércoles a las 11:00." },
  { at: L, name: "Leads", what: "Embudo de cinco etapas. El cursor arrastra a Álvaro Peña de «Sin contactar» a «Seguimiento» y los contadores se ajustan." },
  { at: N, name: "Anuncios y feedback", what: "Cuatro anuncios con su categoría, su audiencia y sus vistas; debajo, la tira de alineación entre cliente y entrenador." },
  { at: M, name: "Portal del socio", what: "La misma app vista por una socia: anillo de bono en el menú, banner del anuncio anterior, KPIs de progreso y el botón de reservar clase. Entra el móvil con la misma pantalla." },
  { at: I, name: "Programación por IA", what: "Formulario de mesociclo, clic en «Generar borrador», el loader de marca recorre los cinco pasos reales y aparece el plan en tres fases, en borrador, listo para aprobar." },
  { at: Z, name: "Cierre", what: "Vuelve la tarjeta del claim con las capacidades del catálogo y el enlace a los planes." },
];

/** Los siete módulos que recorre la pieza, en el orden en que salen. */
export const MODULES = ["Panel de control", "Socios", "Agenda", "Leads", "Anuncios", "Portal del socio", "IA"];
