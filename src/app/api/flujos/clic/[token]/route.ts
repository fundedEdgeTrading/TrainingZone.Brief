import { NextResponse } from "next/server";

import { verifyFlowClickToken } from "@/lib/flows/click-tokens";
import { recordFlowEmailClick } from "@/lib/flows/engine";
import { absoluteUrl } from "@/lib/site";

/**
 * E2 · El enlace de los correos de flujo. Anota el clic y redirige al destino.
 *
 * Es lo que sostiene la rama «si hace clic» SIN píxel de traza: el socio pulsa
 * un enlace nuestro a propósito, así que no hay nada que consentir que no haya
 * consentido ya al pulsar. Medir la APERTURA sí exigiría el píxel, y con él un
 * CMP entero: la decisión 4 del plan lo deja fuera de la fase 1.
 *
 * El destino viaja DENTRO del token firmado, no en un parámetro: así esto no
 * puede usarse como redirector abierto con el dominio del centro delante.
 *
 * Un token inválido o caducado no da error al socio —que no tiene culpa de
 * nada— sino que lo lleva a su portal. Lo único que pierde es la anotación.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = verifyFlowClickToken(token);
  if (!result.ok) return NextResponse.redirect(absoluteUrl("/portal"));

  // Anotar no puede tumbar la redirección: el socio va a donde iba aunque la
  // base de datos esté teniendo un mal día.
  try {
    await recordFlowEmailClick(result.emailLogId);
  } catch (error) {
    console.error("[flujos] no se pudo anotar el clic:", error);
  }

  return NextResponse.redirect(result.url);
}
