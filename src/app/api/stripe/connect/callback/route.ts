import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { exchangeOAuthCode, upsertStripeAccountForOrg } from "@/lib/stripe-connect";

/**
 * C.3: recibe el `code` de Stripe (Connect Standard OAuth), lo intercambia por
 * `acct_...` y hace upsert de `StripeAccount`. `state` = orgId (atado al
 * usuario logueado por seguridad — no nos fiamos solo del `state`).
 */
export async function GET(req: NextRequest) {
  const settingsUrl = new URL("/organization", req.url);

  const session = await auth();
  if (!session?.user) return NextResponse.redirect(new URL("/login", req.url));

  const error = req.nextUrl.searchParams.get("error");
  if (error) {
    settingsUrl.searchParams.set("stripe_connect", "error");
    return NextResponse.redirect(settingsUrl);
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !state || state !== session.user.orgId) {
    settingsUrl.searchParams.set("stripe_connect", "error");
    return NextResponse.redirect(settingsUrl);
  }

  const exchanged = await exchangeOAuthCode(code);
  if (!exchanged.ok) {
    settingsUrl.searchParams.set("stripe_connect", "error");
    return NextResponse.redirect(settingsUrl);
  }

  await upsertStripeAccountForOrg(session.user.orgId, exchanged.accountId);

  settingsUrl.searchParams.set("stripe_connect", "success");
  return NextResponse.redirect(settingsUrl);
}
