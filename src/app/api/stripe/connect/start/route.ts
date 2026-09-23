import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { canManageOrg } from "@/lib/rbac";
import {
  buildStripeAuthorizeUrl,
  CONNECT_STATE_COOKIE,
  connectStateCookieOptions,
  createConnectState,
  isStripeConnectConfigured,
} from "@/lib/stripe-connect";

/**
 * CON-01 · Inicio del OAuth de Connect. Existe porque el nonce del `state` tiene
 * que quedar en una cookie del navegador que inicia el flujo, y eso solo lo
 * puede hacer un Route Handler (el botón vive en un Server Component).
 *
 * La org sale de la sesión, nunca de un parámetro: así la cookie solo puede
 * atar el flujo a la org de quien pulsa el botón.
 */
export async function GET(req: NextRequest) {
  const settingsUrl = new URL("/organization", req.url);

  const session = await auth();
  if (!session?.user) return NextResponse.redirect(new URL("/login", req.url));
  if (!canManageOrg(session.user.role) || !isStripeConnectConfigured()) {
    settingsUrl.searchParams.set("stripe_connect", "error");
    return NextResponse.redirect(settingsUrl);
  }

  const { nonce, cookieValue } = createConnectState(session.user.orgId);
  const response = NextResponse.redirect(buildStripeAuthorizeUrl(nonce));
  response.cookies.set(CONNECT_STATE_COOKIE, cookieValue, connectStateCookieOptions());
  return response;
}
