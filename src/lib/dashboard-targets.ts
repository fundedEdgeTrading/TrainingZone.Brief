/**
 * Objetivos internos y umbrales de lectura que el panel de dirección usa como
 * línea de referencia.
 *
 * Viven en su propio módulo, y no en `dashboard-queries.ts`, porque las
 * gráficas son componentes de cliente: importarlos desde el fichero de
 * consultas arrastraría Prisma al bundle del navegador.
 *
 * La regla del módulo: aquí va lo que es **decisión de organización** —lo que
 * negocio cambiaría sin tocar una fórmula— y no las constantes de un cálculo.
 * Si un número se puede discutir en una reunión, su sitio es este fichero.
 */

/** Ocupación objetivo. Pie del KPI "Ocupación media" y del panel por centro. */
export const OCCUPANCY_TARGET_PCT = 75;

/**
 * Permanencia de referencia del negocio, en meses (E14-05).
 *
 * Son los 25 meses que maneja dirección, y es un **objetivo de organización**,
 * no una constante de la fórmula de permanencia: por eso vive aquí y no escrito
 * a fuego en `getLtvAndTicket`.
 *
 * Con qué compararlo, que es donde está la trampa: la permanencia medida no
 * puede pasar del tiempo que lleva abierto el negocio. Medido en septiembre de
 * 2026 contra los datos de demo, el alta más antigua tiene 23,6 meses, así que
 * **nadie ha podido quedarse 25 meses todavía** y cualquier "estamos un 70 % por
 * debajo del objetivo" sería un artefacto de la edad del negocio, no un dato.
 * Por eso `getLtvAndTicket` devuelve también el horizonte de observación y la
 * card se calla la comparación mientras el horizonte no llegue aquí.
 */
export const TENURE_TARGET_MONTHS = 25;

/**
 * Suelo de muestra para derivar cifras de los cobros de una ventana (E14-04).
 *
 * El problema medido en el diagnóstico: `getDailyInsight` escribía "los
 * ingresos van un 82,5 % abajo" sobre **cinco cobros**. Un solo recibo de 264 €
 * que cruzara el borde de la ventana movía la frase ocho puntos. Eso es ruido
 * con voz de autoridad, y es peor que no decir nada porque suena calculado.
 *
 * Los dos umbrales no van a ojo. El ticket medio medido de la organización es
 * de ~130 €, y el criterio es que **un cobro medio que cruce el borde de la
 * ventana no mueva la cifra más de diez puntos**:
 *
 *     1 ticket / ingresos > 10 %  ⟹  ingresos > 10 × 130 € = 1.300 €
 *
 * De ahí `MIN_SAMPLE_REVENUE_CENTS` (1.500 €, los 1.300 con holgura) y
 * `MIN_SAMPLE_PAYMENTS` (10 cobros, el mismo umbral contado en recibos).
 *
 * Contrastado contra los datos reales, que es lo que decide si un umbral sirve:
 * la primera quincena de 2026 más floja tuvo 14 cobros y 1.484 €, y la más
 * fuerte 21 y 3.202 € — todas dan porcentaje. La del 1 al 15 de septiembre, con
 * 5 cobros y 561 €, no. Discrimina justo donde tiene que discriminar.
 *
 * **Dos usos, el mismo motivo.** Lo usa el insight del día, y lo usa el ingreso
 * por socio y mes del que sale el LTV (E14-05): dividir 561 € entre medio mes
 * transcurrido da 290 €/socio/mes cuando la cuota real son 160 €, porque los
 * cobros del mes todavía no han entrado. Una ventana con pocos cobros no
 * sostiene un ritmo mensual, en ninguna de las dos direcciones.
 *
 * Por debajo del suelo ninguna de las dos se calla: el insight dice el número
 * absoluto y cuántos recibos lo sostienen, y la card de LTV dice que le falta
 * periodo. Las dos son información honesta; una cifra inventada no.
 */
export const MIN_SAMPLE_PAYMENTS = 10;
export const MIN_SAMPLE_REVENUE_CENTS = 150_000;
