import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createLicenseCheckoutSession } from "@/lib/platform-billing";

/**
 * Checkout público de la licencia (Plano 1). No exige sesión a propósito: el
 * comprador todavía no tiene cuenta — la organización nace del webhook de pago
 * confirmado (RB-ALTA-001), no de un formulario nuestro.
 *
 * Acepta el POST del formulario de `/planes` y responde con una redirección a
 * Stripe, para que funcione también sin JavaScript.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const planCode = form?.get("planCode");

  if (typeof planCode !== "string" || !planCode) {
    return redirectBack(req, "/planes?checkout=error");
  }

  const result = await createLicenseCheckoutSession(planCode);
  if (!result.ok) {
    // Degradación elegante: se vuelve a /planes con el motivo, sin pantalla de error.
    return redirectBack(req, `/planes?checkout=error&motivo=${encodeURIComponent(result.error)}`);
  }

  return NextResponse.redirect(result.url, { status: 303 });
}

function redirectBack(req: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, req.nextUrl.origin), { status: 303 });
}
