/**
 * App Links / Universal Links (E9-16).
 *
 * `apple-app-site-association` y `assetlinks.json` los piden Apple y Google
 * **sin sesión y sin seguir redirecciones** — el proxy ya los deja pasar
 * (E9-01, `src/proxy.ts`). Lo que falta aquí es el contenido, y ese contenido
 * necesita datos que hoy no existen en el repositorio: el equipo de Apple
 * (`APPLE_TEAM_ID`), el `bundleIdentifier` de iOS, el `package` de Android y
 * la huella SHA-256 del certificado de firma — esta última no existe hasta
 * que se generan las credenciales de build en EAS.
 *
 * Mismo criterio que `centerJsonLd` (`src/lib/json-ld.ts`): **marcado
 * incompleto es peor que ausente**. Un `assetlinks.json` con un paquete
 * equivocado o sin la huella correcta no falla con un error visible: la
 * verificación de Google/Apple falla **en silencio** y el enlace universal
 * simplemente deja de abrir la app, sin que nadie lo note hasta que un
 * usuario se queje. Por eso los dos constructores devuelven `null` en vez de
 * un objeto con huecos, y las rutas que los sirven devuelven 404 con un
 * cuerpo explícito hasta que las cuatro variables de entorno existan
 * (`apps/mobile/PUBLISHING.md` §3 documenta cuáles y por qué).
 *
 * Módulo puro: sin `next/*`, para poder probarlo sin levantar rutas.
 */

/** Ruta que tiene que abrir la app cuando está instalada. */
export const APP_LINK_PATHS = ["/portal/agenda"] as const;

export type AppleAppSiteAssociation = {
  applinks: {
    apps: string[];
    details: { appID: string; paths: string[] }[];
  };
};

/**
 * `apple-app-site-association`. `null` si falta el equipo de Apple o el
 * bundle id: un `appID` a medias ("undefined.undefined") pasaría el `JSON.parse`
 * de Apple y fallaría la verificación sin decir por qué.
 */
export function appleAppSiteAssociation(env: {
  appleTeamId?: string;
  iosBundleId?: string;
}): AppleAppSiteAssociation | null {
  const teamId = env.appleTeamId?.trim();
  const bundleId = env.iosBundleId?.trim();
  if (!teamId || !bundleId) return null;

  return {
    applinks: {
      apps: [],
      details: [{ appID: `${teamId}.${bundleId}`, paths: [...APP_LINK_PATHS] }],
    },
  };
}

export type AndroidAssetLinks = {
  relation: string[];
  target: { namespace: "android_app"; package_name: string; sha256_cert_fingerprints: string[] };
}[];

/**
 * `assetlinks.json`. `null` si falta el `package` o la huella: Google
 * comprueba la huella del certificado que firmó la build, así que una lista
 * vacía o inventada no verifica nada — solo aparenta estar configurado.
 */
export function androidAssetLinks(env: {
  androidPackageName?: string;
  androidSha256CertFingerprints?: string;
}): AndroidAssetLinks | null {
  const packageName = env.androidPackageName?.trim();
  const fingerprints = (env.androidSha256CertFingerprints ?? "")
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);
  if (!packageName || fingerprints.length === 0) return null;

  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: packageName, sha256_cert_fingerprints: fingerprints },
    },
  ];
}
