import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { canManageOrg } from "@/lib/rbac";
import {
  CONNECT_STATE_COOKIE,
  connectStateCookieOptions,
  exchangeOAuthCode,
  upsertStripeAccountForOrg,
  verifyConnectState,
} from "@/lib/stripe-connect";
import { ensureMemberPortalConfigurationForAccount } from "@/lib/stripe-portal-config";

/**
 * C.3: recibe el `code` de Stripe (Connect Standard OAuth), lo intercambia por
 * `acct_...` y hace upsert de `StripeAccount`.
 *
 * CON-01: `state` es el nonce que `/api/stripe/connect/start` dejó en una
 * cookie firmada de este navegador, junto a la org que lo inició. Se exige que
 * coincidan el nonce, la org de la cookie y la de la sesión; y la cookie se
 * borra en TODAS las salidas, para que el nonce sea de un solo uso.
 *
 * Solo quien administra la organización puede sustituir su cuenta de cobro
 * (mismo permiso que gatea el botón "Conectar cobros con Stripe" en
 * `organization/page.tsx`): sin esto, cualquier persona con sesión podía
 * completar el OAuth con SU PROPIA cuenta de Stripe y desviar los cobros
 * futuros del gimnasio.
 */
export async function GET(req: NextRequest) {
  const settingsUrl = new URL("/organization", req.url);
  const stateCookie = req.cookies.get(CONNECT_STATE_COOKIE)?.value;

  const finish = (url: URL) => {
    const response = NextResponse.redirect(url);
    // Borrar = volver a ponerla vacía con el mismo path y caducada.
    response.cookies.set(CONNECT_STATE_COOKIE, "", { ...connectStateCookieOptions(), maxAge: 0 });
    return response;
  };
  const fail = () => {
    settingsUrl.searchParams.set("stripe_connect", "error");
    return finish(settingsUrl);
  };

  const session = await auth();
  if (!session?.user) return finish(new URL("/login", req.url));
  if (!canManageOrg(session.user.role)) return fail();

  if (req.nextUrl.searchParams.get("error")) return fail();

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !verifyConnectState(stateCookie, state, session.user.orgId).ok) return fail();

  const exchanged = await exchangeOAuthCode(code);
  if (!exchanged.ok) return fail();

  try {
    await upsertStripeAccountForOrg(session.user.orgId, exchanged.accountId);
  } catch (error) {
    // Stripe caído, o ese `acct_…` ya está enlazado a otra organización
    // (`accountId` es único): error visible y cookie borrada, no un 500.
    console.error("[stripe-connect] no se pudo guardar la cuenta conectada", { orgId: session.user.orgId, error });
    return fail();
  }
  // CON-02: el portal del socio queda configurado desde el primer minuto. Es
  // best-effort (no lanza): la cuenta ya está conectada y un fallo aquí se
  // repara solo en el siguiente `ensureMemberPortalConfigurationForOrg`.
  await ensureMemberPortalConfigurationForAccount(session.user.orgId, exchanged.accountId);

  settingsUrl.searchParams.set("stripe_connect", "success");
  return finish(settingsUrl);
}
