/**
 * E12-09 · destino de un aviso EN LA APP.
 *
 * La tabla de la web y esta son gemelas en criterio, pero no en superficie: la
 * app conserva dos roles (socio y entrenador, D-M4/E13-01) y no tiene las
 * pantallas de dirección. Un destino que el rol no puede abrir no es un enlace
 * imperfecto — es un 403 con el aviso ya marcado como resuelto.
 */
import { NOTIFICATION_ENTITY_TYPES, notificationRoute } from "@/notification-routes";

/** Rutas que la app NO ofrece a socio ni a entrenador (pestañas de dirección). */
const NOT_IN_THE_APP = ["/dashboard", "/socios", "/productos", "/anuncios", "/organizacion"];

describe("Destino de un aviso", () => {
  it("ningún destino apunta a una pantalla que la app ya no sirve a sus dos roles", () => {
    for (const entityType of NOTIFICATION_ENTITY_TYPES) {
      for (const isMember of [true, false]) {
        const route = notificationRoute(entityType, "id-de-la-entidad", isMember);
        if (!route) continue;
        expect(NOT_IN_THE_APP).not.toContain(route.path);
      }
    }
  });

  it("un aviso de cobro lleva al socio a su consumo y al entrenador a ninguna parte", () => {
    // El entrenador no gestiona cobros desde el móvil: el aviso se lee y se
    // marca hecho. Antes abría el panel de dirección, que le responde 403.
    expect(notificationRoute("Payment", "pay-1", true)).toEqual({ path: "/consumo" });
    expect(notificationRoute("Payment", "pay-1", false)).toBeNull();
    expect(notificationRoute("Subscription", "sub-1", false)).toBeNull();
  });

  it("sin entidad o sin identificador no hay destino", () => {
    expect(notificationRoute("Lead", null, false)).toBeNull();
    expect(notificationRoute(null, "lead-1", false)).toBeNull();
  });

  it("el identificador nunca se descarta donde hay ficha por id", () => {
    expect(notificationRoute("Member", "member-1", false)).toEqual({ path: "/mis-socios/member-1" });
    expect(notificationRoute("Lead", "lead-1", false)).toEqual({ path: "/leads", params: { openId: "lead-1" } });
  });
});
