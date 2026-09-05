import { NextResponse } from "next/server";
import { requireRole } from "@/lib/guard";
import { getMemberForUser } from "@/lib/portal-queries";
import { getMemberDataExport } from "@/lib/member-data-export";

/**
 * RGPD — portabilidad: descarga de una copia de los propios datos en JSON,
 * accesible solo por el socio autenticado sobre su propia ficha (no admite
 * memberId por parámetro: siempre se resuelve desde la sesión).
 */
export async function GET() {
  const session = await requireRole(["MEMBER"]);
  const member = await getMemberForUser(session.user.id);
  if (!member) return NextResponse.json({ error: "No se ha encontrado tu ficha de socio." }, { status: 404 });

  const data = await getMemberDataExport(member.id, session.user.orgId);
  const fileName = `mis-datos-${new Date().toISOString().slice(0, 10)}.json`;

  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
