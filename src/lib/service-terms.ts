/**
 * Declaraciones de alcance del servicio que la aplicación tiene que sostener
 * en pantalla, no solo en un contrato que nadie abre.
 *
 * Un texto legal que el código incumple es peor que no tenerlo — y su reverso
 * también vale: una funcionalidad que se retira sin decirlo deja implícita una
 * obligación que el producto ya no cubre.
 */

/**
 * E10-21 · Registro de jornada.
 *
 * El módulo de fichajes se apaga. La razón no es solo que estuviera aparcado:
 * si se reactivase tal cual **no cumpliría**. `TimeClockEntry` admite una sola
 * entrada y una sola salida por día, lo que no permite pausas ni jornadas
 * partidas —habituales con turno de mañana y tarde— y no distingue horas
 * ordinarias de extraordinarias. El control horario en España es obligación
 * legal: o se hace bien y se vende, o se apaga. A medias es lo peor de los dos
 * mundos.
 *
 * Retirarlo en silencio dejaría al centro creyendo que la aplicación le cubre
 * el art. 34.9 ET. Por eso se dice, y se dice donde el módulo estaba.
 */
export const NO_TIME_TRACKING_NOTICE = {
  title: "Apta no presta registro de jornada",
  body:
    "Esta aplicación NO ofrece registro de jornada laboral. El control horario del art. 34.9 del Estatuto de los " +
    "Trabajadores (RDL 8/2019) es una obligación del centro como empleador, y el centro debe llevarlo por su propio " +
    "medio. Los fichajes que se registraron mientras el módulo existió se han exportado y se conservan cuatro años, " +
    "que es el plazo que exige esa misma norma y que sigue corriendo aunque la funcionalidad ya no esté.",
  /**
   * Si algún día vuelve. No es una lista de deseos: es lo que le faltaba al
   * diseño anterior para poder cumplir.
   */
  ifItComesBack: [
    "Pausas y jornada partida: varias entradas y salidas por día.",
    "Distinción entre horas ordinarias y extraordinarias.",
    "Inalterabilidad del registro una vez cerrado el día.",
    "Acceso del trabajador y de su representación legal a su propio registro.",
    "Seguimiento del RD de desarrollo pendiente antes de volver a construirlo.",
  ],
} as const;
