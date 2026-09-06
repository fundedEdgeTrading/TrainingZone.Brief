/**
 * Se ejecuta UNA vez por instancia del servidor, antes de atender la primera
 * petición. Es el único sitio donde una comprobación de cumplimiento puede
 * impedir que la aplicación llegue a estar viva.
 */
import { assertEuDataRegion } from "@/lib/data-region";

export function register() {
  // Solo en el runtime de Node: en Edge no hay base de datos que verificar y la
  // comprobación no tendría a qué referirse.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // E10-07: si la base de datos no está donde la documentación dice que está,
  // se para. Arrancar y callarse es lo que convierte un cambio de región en una
  // transferencia internacional de datos de salud sin declarar.
  const region = assertEuDataRegion();
  if (region) {
    console.info(`[E10-07] Región de datos verificada: ${region.label} (${region.country}).`);
  } else {
    console.info("[E10-07] Base de datos local: no hay región que declarar.");
  }
}
