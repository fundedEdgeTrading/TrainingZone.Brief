import { router } from "expo-router";

/**
 * Volver, con destino de reserva.
 *
 * `router.back()` no hace NADA cuando no hay historial que deshacer, y estas
 * pantallas no se abren solo desde otra: son rutas del grupo (tabs) a las que
 * también se llega en frío —al recargar el bundle, desde un enlace o al
 * reabrir la app en la última ruta—, y ahí la flecha de «volver» se quedaba
 * muerta sin ninguna forma de salir de la pantalla.
 *
 * `fallback` es la pantalla de la que cuelga esta: la lista de la que es ficha,
 * o «Más» cuando es una entrada del índice.
 */
export function goBack(fallback: Parameters<typeof router.replace>[0]) {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
