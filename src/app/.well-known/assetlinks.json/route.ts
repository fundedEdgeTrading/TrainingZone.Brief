import { NextResponse } from "next/server";

import { androidAssetLinks } from "@/lib/app-links";

/**
 * `/.well-known/assetlinks.json`. El proxy ya la deja pasar sin sesión (E9-01).
 *
 * `force-dynamic`: el contenido depende de variables de entorno, no de nada
 * que se pueda precalcular en build.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const assetLinks = androidAssetLinks({
    androidPackageName: process.env.ANDROID_PACKAGE_NAME,
    androidSha256CertFingerprints: process.env.ANDROID_SHA256_CERT_FINGERPRINTS,
  });

  if (!assetLinks) {
    // 404 explícito: una huella de certificado vacía o inventada no verifica
    // nada, solo aparenta estar configurado (ver src/lib/app-links.ts).
    return NextResponse.json(
      {
        error:
          "App Links no configurados todavía (falta ANDROID_PACKAGE_NAME o ANDROID_SHA256_CERT_FINGERPRINTS)",
      },
      { status: 404 },
    );
  }

  return NextResponse.json(assetLinks);
}
