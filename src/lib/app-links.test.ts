import test from "node:test";
import assert from "node:assert/strict";

import { androidAssetLinks, appleAppSiteAssociation, APP_LINK_PATHS } from "@/lib/app-links";

/**
 * E9-16 · App Links.
 *
 * Lo que se comprueba no es que el marcado exista, es que un valor a medias
 * no se sirva: `apps/mobile/PUBLISHING.md` §1 documenta que
 * `bundleIdentifier`/`package`/la huella del certificado siguen sin
 * decidirse, así que hoy en producción las dos funciones tienen que devolver
 * `null` — y el día que existan las cuatro variables, el `appID` y el
 * `package_name` tienen que salir bien formados.
 */

test("apple-app-site-association: null si falta el equipo o el bundle id", () => {
  assert.equal(appleAppSiteAssociation({}), null);
  assert.equal(appleAppSiteAssociation({ appleTeamId: "ABCDE12345" }), null);
  assert.equal(appleAppSiteAssociation({ iosBundleId: "com.ejemplo.app" }), null);
});

test("apple-app-site-association: appID compuesto por equipo y bundle id, con la ruta del portal", () => {
  const aasa = appleAppSiteAssociation({ appleTeamId: "ABCDE12345", iosBundleId: "com.ejemplo.app" });
  assert.ok(aasa);
  assert.equal(aasa.applinks.details[0].appID, "ABCDE12345.com.ejemplo.app");
  assert.deepEqual(aasa.applinks.details[0].paths, [...APP_LINK_PATHS]);
  assert.ok(aasa.applinks.details[0].paths.includes("/portal/agenda"));
});

test("assetlinks.json: null si falta el paquete o la huella", () => {
  assert.equal(androidAssetLinks({}), null);
  assert.equal(androidAssetLinks({ androidPackageName: "com.ejemplo.app" }), null);
  assert.equal(androidAssetLinks({ androidSha256CertFingerprints: "AA:BB" }), null);
  // Huella vacía tras recortar: sigue sin verificar nada.
  assert.equal(
    androidAssetLinks({ androidPackageName: "com.ejemplo.app", androidSha256CertFingerprints: " , " }),
    null,
  );
});

test("assetlinks.json: package_name y huellas, admite varias separadas por coma", () => {
  const links = androidAssetLinks({
    androidPackageName: "com.ejemplo.app",
    androidSha256CertFingerprints: "AA:BB:CC, DD:EE:FF",
  });
  assert.ok(links);
  assert.equal(links[0].target.package_name, "com.ejemplo.app");
  assert.deepEqual(links[0].target.sha256_cert_fingerprints, ["AA:BB:CC", "DD:EE:FF"]);
  assert.deepEqual(links[0].relation, ["delegate_permission/common.handle_all_urls"]);
});
