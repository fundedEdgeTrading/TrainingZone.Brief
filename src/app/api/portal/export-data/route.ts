import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { getMemberForUser } from "@/lib/portal-queries";
import { getMemberDataExport, rightsDeadline, type ExportScope } from "@/lib/member-data-export";

/**
 * RGPD — ejercicio de derechos sobre los propios datos (E10-11).
 *
 * Dos alcances, uno por derecho:
 *   · `?alcance=portabilidad` (por defecto, art. 20): lo aportado y lo generado
 *     por su actividad, en formato estructurado, sin la bitácora interna.
 *   · `?alcance=acceso` (art. 15): además, `MemberNote` y el registro de accesos
 *     a sus propios datos.
 *
 * Accesible solo por el socio autenticado sobre su propia ficha: no admite
 * `memberId` por parámetro, siempre se resuelve desde la sesión.
 *
 * Y queda registrado: el ejercicio de un derecho es exactamente lo que tiene
 * que dejar traza, y la ruta no escribía ninguna.
 */
export async function GET(req: NextRequest) {
  const session = await requireRole(["MEMBER"]);
  const member = await getMemberForUser(session.user.id);
  if (!member) return NextResponse.json({ error: "No se ha encontrado tu ficha de socio." }, { status: 404 });

  const scope: ExportScope =
    req.nextUrl.searchParams.get("alcance") === "acceso" ? "ACCESO" : "PORTABILIDAD";

  const data = await getMemberDataExport(member.id, session.user.orgId, scope);
  const requestedAt = new Date();

  await prisma.auditLog.create({
    data: {
      orgId: session.user.orgId,
      actorUserId: session.user.id,
      action: "MEMBER_DATA_RIGHT_EXERCISED",
      entityType: "Member",
      entityId: member.id,
      memberId: member.id,
      metadata: {
        scope,
        requestedAt: requestedAt.toISOString(),
        // Art. 12.3: la entrega se produce dentro del mes. Aquí es inmediata, y
        // por eso se anota también el plazo — para que un retraso, si alguna vez
        // lo hubiera, se vea contra una fecha y no contra una impresión.
        deadline: rightsDeadline(requestedAt).toISOString(),
        deliveredAt: requestedAt.toISOString(),
      },
    },
  });

  const suffix = scope === "ACCESO" ? "acceso" : "portabilidad";
  const fileName = `mis-datos-${suffix}-${requestedAt.toISOString().slice(0, 10)}.json`;

  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
