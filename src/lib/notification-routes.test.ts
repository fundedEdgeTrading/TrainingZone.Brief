import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { notificationHref, NOTIFICATION_ENTITY_TYPES } from "@/lib/notification-routes";

/**
 * E12-09 · resolución única de destino de notificación entre web y app.
 * Los siete tipos de entidad tienen que tener destino en la web (para el rol
 * que corresponda) y el identificador nunca se descarta. La réplica móvil
 * (`apps/mobile/src/notification-routes.ts`) no se puede importar desde
 * aquí —vive en otro proyecto sin módulos compartidos—, así que se compara
 * por texto: los mismos siete tipos, declarados en el mismo orden.
 */

test("E12-09 · los siete tipos de entidad tienen destino en la web para el rol que corresponde", () => {
  for (const entityType of NOTIFICATION_ENTITY_TYPES) {
    const staffHref = notificationHref(entityType, "abc123", false);
    const memberHref = notificationHref(entityType, "abc123", true);
    assert.ok(staffHref || memberHref, `${entityType} no tiene destino ni para staff ni para socio`);
  }
});

test("E12-09 · ningún destino de STAFF descarta el identificador", () => {
  // El socio no tiene ficha por id de una reserva o de un cobro concreto: su
  // destino son sus propias pantallas enteras (agenda, membresía), no una
  // ficha por registro — esa parte queda fuera de esta comprobación a
  // propósito. Donde SÍ existe una ficha por id (todo el lado de staff), el
  // identificador tiene que viajar siempre.
  for (const entityType of NOTIFICATION_ENTITY_TYPES) {
    const href = notificationHref(entityType, "el-id-de-la-entidad", false);
    if (href) assert.match(href, /el-id-de-la-entidad/, `${entityType} descarta el id: ${href}`);
  }
});

test("E12-09 · sin entityId no hay destino", () => {
  assert.equal(notificationHref("Lead", null, false), null);
  assert.equal(notificationHref(null, "abc", false), null);
});

test("E12-09 · la réplica móvil declara los mismos siete tipos, en el mismo orden", () => {
  const mobileSource = readFileSync(join("apps", "mobile", "src", "notification-routes.ts"), "utf8");
  const match = mobileSource.match(/NOTIFICATION_ENTITY_TYPES: NotificationEntityType\[\] = \[([\s\S]*?)\];/);
  assert.ok(match, "no se encuentra NOTIFICATION_ENTITY_TYPES en la réplica móvil");
  const mobileTypes = match![1].match(/"(\w+)"/g)!.map((s) => s.slice(1, -1));
  assert.deepEqual(mobileTypes, NOTIFICATION_ENTITY_TYPES);
});
