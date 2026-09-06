import { NextResponse } from "next/server";
import { requireRole } from "@/lib/guard";
import { requireFeature } from "@/lib/entitlements";
import { centerScopeFor } from "@/lib/center-scope";
import { prisma } from "@/lib/prisma";
import { MEMBER_STATE_LABEL } from "@/lib/chart-colors";
import { toCsv, csvResponseHeaders } from "@/lib/csv-export";

/**
 * E6-06: exportar socios. Feature `exportaciones` ya estaba pagada por casi
 * nada (no existía) — es la primera objeción de cualquier dueño ("¿puedo
 * sacar mis datos?"), así que se libera de inmediato como parte de esta
 * historia en vez de esperar a que alguien la reclame.
 *
 * Solo campos de gestión: nada de HealthRecord ni de las respuestas de salud
 * del alta. Los booleanos de consentimiento no son dato clínico, son estado
 * administrativo del alta.
 */
export async function GET() {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR"]);
  await requireFeature("exportaciones");
  const centerIds = await centerScopeFor(session.user);

  const members = await prisma.member.findMany({
    where: {
      orgId: session.user.orgId,
      ...(centerIds !== null ? { primaryCenterId: { in: centerIds } } : {}),
    },
    include: { primaryCenter: { select: { name: true } } },
    orderBy: [{ state: "asc" }, { lastName: "asc" }],
  });

  const header = [
    "Nombre",
    "Apellidos",
    "Email",
    "Telefono",
    "Estado",
    "Centro",
    "CodigoPostal",
    "Ciudad",
    "FechaAlta",
  ];
  const rows = members.map((m) => [
    m.firstName,
    m.lastName,
    m.email,
    m.phone ?? "",
    MEMBER_STATE_LABEL[m.state] ?? m.state,
    m.primaryCenter.name,
    m.postalCode ?? "",
    m.city ?? "",
    m.joinedAt.toISOString().slice(0, 10),
  ]);

  await prisma.auditLog.create({
    data: {
      orgId: session.user.orgId,
      actorUserId: session.user.id,
      action: "MEMBERS_EXPORTED",
      entityType: "Member",
      entityId: session.user.orgId,
      metadata: { centerIds, rows: rows.length },
    },
  });

  const csv = toCsv(header, rows);
  const fileName = `socios-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, { headers: csvResponseHeaders(fileName) });
}
