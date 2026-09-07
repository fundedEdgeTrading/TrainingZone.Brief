import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { PlanType } from "@prisma/client";
import { isSellableInApp } from "@/lib/member-billing";

/**
 * HU-ST-10 / decisión D-S3 · `PlanType.ONLINE` es contenido digital consumido
 * dentro de la propia app: venderlo por Stripe Checkout desde la app nativa cae
 * bajo la compra dentro de la aplicación obligatoria de App Store y Google Play,
 * y es motivo de rechazo. Los planes presenciales quedan exentos.
 *
 * La decisión ya está tomada: **el plan ONLINE no se vende desde la app**, y
 * sigue vendiéndose en la web, que no está sujeta a las reglas de las tiendas.
 */

const PRESENCIALES: PlanType[] = ["MONTHLY", "SESSION_PACK", "DROP_IN", "DUO", "PERSONAL_TRAINING"];

test("los planes presenciales sí se venden desde la app", () => {
  for (const type of PRESENCIALES) {
    assert.equal(isSellableInApp(type), true, `${type} es presencial: las tiendas lo permiten`);
  }
});

test("el plan ONLINE no se vende desde la app", () => {
  assert.equal(isSellableInApp("ONLINE"), false);
});

test("la regla es de superficie: la web sigue vendiendo ONLINE", () => {
  // `createMemberCheckout` es el camino de la web y del portal: no puede aplicar
  // esta regla, porque la misma compra por web es perfectamente legítima.
  const fuente = readFileSync("src/lib/member-billing.ts", "utf8");
  const inicio = fuente.indexOf("export async function createMemberCheckout");
  const fin = fuente.indexOf("export async function createProspectMemberCheckout");
  const cuerpo = fuente.slice(inicio, fin);
  assert.equal(
    cuerpo.includes("isSellableInApp"),
    false,
    "el checkout compartido no puede bloquear una venta legítima por web"
  );
});

test("las dos puertas de compra de la app rechazan ONLINE", () => {
  // No basta con ocultarlo del catálogo: un cliente antiguo, o un planId escrito
  // a mano, llegaría igual al endpoint.
  for (const ruta of [
    "src/app/api/mobile/v1/checkout/route.ts",
    "src/app/api/mobile/v1/portal/billing/checkout/route.ts",
  ]) {
    const fuente = readFileSync(ruta, "utf8");
    assert.ok(fuente.includes("isSellableInApp"), `${ruta} tiene que aplicar la regla de tiendas`);
    assert.ok(fuente.includes("403"), `${ruta} rechaza la compra, no la deja pasar`);
  }
});

test("el catálogo de la app filtra ONLINE para el socio y lo marca para dirección", () => {
  const fuente = readFileSync("src/app/api/mobile/v1/products/route.ts", "utf8");
  assert.ok(fuente.includes("isSellableInApp"), "el catálogo del socio no puede incluirlo");
  assert.ok(fuente.includes("sellableInApp:"), "dirección tiene que verlo marcado, no desaparecido");
});

test("el cobro se abre en el navegador del sistema, nunca en un WebView propio", () => {
  const pantalla = readFileSync("apps/mobile/src/app/onboarding/pago.tsx", "utf8");
  assert.ok(pantalla.includes("WebBrowser.openBrowserAsync"), "Stripe Checkout no funciona embebido");
  assert.equal(pantalla.includes("react-native-webview"), false);
  // Y al volver del navegador se relee /me: el acceso lo desbloquea el webhook
  // habiendo confirmado el cobro, no el hecho de que el navegador se cierre.
  assert.ok(pantalla.includes("await refresh()"));
});
