import { NextResponse } from "next/server";
import { verifyEmailPreferencesToken } from "@/lib/email-verification";
import { unsubscribeMemberFromAll } from "@/lib/email-preferences-queries";

/**
 * Baja de un clic (RFC 8058). Es el destino de la cabecera `List-Unsubscribe`
 * que pone `mailer.ts`: Gmail y Outlook pintan con ella su propio botón
 * "Cancelar suscripción" y, al pulsarlo, mandan un POST aquí sin abrir el
 * navegador. Tiene que dar de baja y responder 200 — un 30x o un HTML hacen
 * que el cliente lo dé por fallido y deje de ofrecer el botón.
 *
 * Nunca devuelve 404 ni 403 aunque el token sea falso: la respuesta a una baja
 * es siempre la misma. Lo que un token inválido no hace es tocar ninguna ficha.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = verifyEmailPreferencesToken(token);
  if (result.ok) await unsubscribeMemberFromAll(result.memberId);
  return new NextResponse(null, { status: 200 });
}

/**
 * Algunos clientes abren el `List-Unsubscribe` como enlace en vez de mandar el
 * POST. Ahí no se da de baja a nadie en silencio (un escáner de enlaces haría
 * lo mismo): se lleva a la pantalla de confirmación.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return NextResponse.redirect(new URL(`/baja/${token}`, req.url));
}
