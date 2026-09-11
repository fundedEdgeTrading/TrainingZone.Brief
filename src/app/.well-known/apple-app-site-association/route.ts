import { NextResponse } from "next/server";

import { appleAppSiteAssociation } from "@/lib/app-links";

/**
 * `/.well-known/apple-app-site-association`. Sin extensión a propósito — así
 * la pide Apple —, y el proxy ya la deja pasar sin sesión (E9-01).
 *
 * `force-dynamic`: el contenido depende de variables de entorno, no de nada
 * que se pueda precalcular en build.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const aasa = appleAppSiteAssociation({
    appleTeamId: process.env.APPLE_TEAM_ID,
    iosBundleId: process.env.IOS_BUNDLE_ID,
  });

  if (!aasa) {
    // 404 explícito, no un JSON a medias: un appID incompleto fallaría la
    // verificación de Apple en silencio (ver src/lib/app-links.ts).
    return NextResponse.json(
      { error: "App Links no configurados todavía (falta APPLE_TEAM_ID o IOS_BUNDLE_ID)" },
      { status: 404 },
    );
  }

  // Apple exige "application/json" aunque el fichero no lleve extensión.
  return NextResponse.json(aasa, { headers: { "Content-Type": "application/json" } });
}
