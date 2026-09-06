import test from "node:test";
import assert from "node:assert/strict";
import { NO_SHOW_REASONS, NO_SHOW_REASON_HELP, parseNoShowReason } from "@/lib/no-show";
import { checkBookingTransition } from "@/lib/booking-transitions";
import { isMobileRouteDeclared, featureForMobileRoute } from "@/lib/mobile-feature-routes";

/**
 * E2-14 (decisión D-M1) · RB-RES-009: el no-show desde la app.
 *
 * El endpoint es el espejo de `markNoShowAction`, así que lo que hay que fijar
 * es que comparta las reglas y no una copia suya: el motivo validado contra el
 * enum, el estado de partida (E2-02) y el gateo declarado de la ruta nueva.
 */

const ROUTE = "/trainer/bookings/[id]/no-show";

test("el motivo es obligatorio y se valida contra el enum, no contra el desplegable", () => {
  // Lo que manda la app pasa por el mismo parser que la web.
  assert.equal(parseNoShowReason("FORGOT"), "FORGOT");
  assert.equal(parseNoShowReason("OUR_ERROR"), "OUR_ERROR");

  // Y nada más entra: sin motivo válido el endpoint responde 400.
  assert.equal(parseNoShowReason(null), null);
  assert.equal(parseNoShowReason(""), null);
  assert.equal(parseNoShowReason("se le olvidó"), null, "texto libre no es un motivo");
  assert.equal(parseNoShowReason("forgot"), null, "el enum distingue mayúsculas");
});

test("los motivos que sirve el endpoint son el enum entero, con su texto largo", () => {
  // El GET los deriva de aquí para que la app no lleve la lista copiada.
  const served = NO_SHOW_REASONS.map((value) => ({ value, help: NO_SHOW_REASON_HELP[value] }));
  assert.equal(served.length, NO_SHOW_REASONS.length);
  assert.ok(served.every((r) => typeof r.help === "string" && r.help.length > 0));
});

test("estado de partida: CANCELLED y WAITLISTED se rechazan, como en la web", () => {
  // El endpoint traduce este rechazo a 409 (conflicto de estado), no a 404.
  assert.equal(checkBookingTransition("CANCELLED", "NO_SHOW").ok, false);
  assert.equal(checkBookingTransition("WAITLISTED", "NO_SHOW").ok, false);

  // Y lo que sí puede acabar en falta sigue pudiendo.
  assert.equal(checkBookingTransition("BOOKED", "NO_SHOW").ok, true);
  assert.equal(checkBookingTransition("ATTENDED", "NO_SHOW").ok, true, "rectificar un check-in dado por error");
});

test("rectificar devuelve la reserva a BOOKED por defecto, y puede ir a ATTENDED", () => {
  assert.equal(checkBookingTransition("NO_SHOW", "BOOKED").ok, true);
  assert.equal(checkBookingTransition("NO_SHOW", "ATTENDED").ok, true);
});

test("la ruta nueva está declarada en el mapa de gateo y no se gatea", () => {
  // El invariante del trimestre: una ruta sin gate declarado falla en test, no
  // en producción. Marcar una falta es trabajo del día del entrenador.
  assert.equal(isMobileRouteDeclared(ROUTE), true);
  assert.equal(featureForMobileRoute(ROUTE), undefined);
  assert.equal(isMobileRouteDeclared(`/api/mobile/v1${ROUTE}`), true, "también con el prefijo de la API");
});
