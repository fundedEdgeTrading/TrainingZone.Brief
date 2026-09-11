/**
 * Guion de capturas de la ficha de tienda (E9-16).
 *
 * Fuente única: la misma lista gobierna el estado "próximamente" de `/app`
 * (`src/app/app/page.tsx`) mientras no hay capturas reales, y es la que se
 * traslada a mano al guion de `apps/mobile/assets/store/README.md` — los dos
 * paquetes son proyectos npm independientes y no se importan entre sí, así
 * que aquí queda como documentación ejecutable de lo que hay que fotografiar,
 * no como una dependencia compartida.
 *
 * Ninguna entrada lleva una URL de imagen: no existen capturas todavía
 * (harían falta un simulador y datos de demo reales, que esta sesión no
 * puede generar). `/app` degrada mostrando el rótulo de la pantalla en vez de
 * romper con una imagen rota.
 */

export type AppScreenshotSpec = {
  /** Orden en el carrusel de la ficha, 1-indexado — coincide con el de la tienda. */
  order: number;
  screen: string;
  /** Qué debe verse en la captura, con datos de demo concretos. */
  demoState: string;
};

/**
 * Seis pantallas — el mínimo que pide la historia (6 a 8) — elegidas para
 * contar el recorrido completo de un socio y no repetir la misma pantalla en
 * dos tamaños.
 */
export const APP_SCREENSHOTS: readonly AppScreenshotSpec[] = [
  {
    order: 1,
    screen: "Agenda del socio",
    demoState:
      "Semana con 3-4 clases visibles, una ya reservada en verde y una plaza libre resaltada.",
  },
  {
    order: 2,
    screen: "Detalle de reserva",
    demoState: "Clase de grupo reducido con entrenador, hora, plazas restantes y botón de reservar.",
  },
  {
    order: 3,
    screen: "Bono y progreso",
    demoState: "Bono de 10 sesiones con 6 restantes y fecha de caducidad, más la última valoración.",
  },
  {
    order: 4,
    screen: "Seguimiento visual",
    demoState: "Comparativa de dos fotos de progreso con dos meses de diferencia, con el socio demo.",
  },
  {
    order: 5,
    screen: "Agenda del entrenador",
    demoState: "Día con 5 sesiones, una con el semáforo de aptitud en ámbar visible en la tarjeta.",
  },
  {
    order: 6,
    screen: "Ficha de socio (entrenador)",
    demoState: "Datos de contacto, bono activo y notas de la última sesión del socio demo.",
  },
] as const;
