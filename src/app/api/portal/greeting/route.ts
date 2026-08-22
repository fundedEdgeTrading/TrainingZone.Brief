import { NextResponse } from "next/server";
import { requireRole } from "@/lib/guard";
import { getMemberForUser } from "@/lib/portal-queries";
import { getPendingBirthdayGreeting, dismissBirthdayGreeting } from "@/lib/birthday-jobs";
import { resolveTimezone } from "@/lib/timezone";

/**
 * F5 §6.3 — felicitación pendiente del socio. Endpoint compartido: la web lo
 * usa para descartar la pantalla y la app nativa lo replica en
 * `api/mobile/v1/portal/greeting` sobre las mismas funciones, para que no haya
 * dos versiones de la regla de "una vez y solo una".
 */
export async function GET() {
  const session = await requireRole(["MEMBER"]);
  const member = await getMemberForUser(session.user.id);
  if (!member) return NextResponse.json({ error: "No se ha encontrado tu ficha de socio." }, { status: 404 });

  const timezone = await resolveTimezone(member.primaryCenter.timezone);
  const greeting = await getPendingBirthdayGreeting(session.user.orgId, session.user.id, member.id, timezone);
  return NextResponse.json({ greeting });
}

/** Descarte: la felicitación no vuelve a aparecer, ni hoy ni al recargar. */
export async function POST(req: Request) {
  const session = await requireRole(["MEMBER"]);
  const body = (await req.json().catch(() => null)) as { id?: string } | null;
  if (!body?.id) return NextResponse.json({ error: "Falta el identificador." }, { status: 400 });

  const result = await dismissBirthdayGreeting(session.user.orgId, session.user.id, body.id);
  if (!result.ok) return NextResponse.json({ error: "No se ha encontrado esa felicitación." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
