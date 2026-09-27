import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canManageOrg } from "@/lib/rbac";
import {
  buildStripeAuthorizeUrl,
  CONNECT_STATE_COOKIE,
  connectStateCookieOptions,
  createConnectState,
  isStripeConnectConfigured,
  parseConnectLanding,
} from "@/lib/stripe-connect";

/**
 * CON-01 · Inicio del OAuth de Connect. Existe porque el nonce del `state` tiene
 * que quedar en una cookie del navegador que inicia el flujo, y eso solo lo
 * puede hacer un Route Handler (el botón vive en un Server Component).
 *
 * La org sale de la sesión, nunca de un parámetro: así la cookie solo puede
 * atar el flujo a la org de quien pulsa el botón.
 *
 * `?landing=login|register` elige si Stripe abre con el inicio de sesión (el
 * centro ya tiene cuenta) o con el alta, que llega rellena con los datos de
 * facturación del centro.
 */
export async function GET(req: NextRequest) {
  const settingsUrl = new URL("/organization", req.url);

  const session = await auth();
  if (!session?.user) return NextResponse.redirect(new URL("/login", req.url));
  if (!canManageOrg(session.user.role) || !isStripeConnectConfigured()) {
    settingsUrl.searchParams.set("stripe_connect", "error");
    return NextResponse.redirect(settingsUrl);
  }

  const org = await prisma.organization.findUnique({
    where: { id: session.user.orgId },
    select: { name: true, billingName: true, billingEmail: true },
  });

  const { nonce, cookieValue } = createConnectState(session.user.orgId);
  const authorizeUrl = buildStripeAuthorizeUrl(nonce, {
    landing: parseConnectLanding(req.nextUrl.searchParams.get("landing")),
    prefill: {
      email: org?.billingEmail || session.user.email,
      businessName: org?.billingName || org?.name,
    },
  });
  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(CONNECT_STATE_COOKIE, cookieValue, connectStateCookieOptions());
  return response;
}
