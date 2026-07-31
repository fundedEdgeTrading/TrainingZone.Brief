import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/guard";
import { requireFeature } from "@/lib/entitlements";
import { getAuditLogForExport } from "@/lib/audit-queries";

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export async function GET(req: NextRequest) {
  const session = await requireRole(["OWNER", "PLATFORM_ADMIN"]);
  await requireFeature("exportaciones");

  const p = req.nextUrl.searchParams;
  const logs = await getAuditLogForExport(session.user.orgId, {
    action: p.get("action") ?? undefined,
    from: p.get("from") ?? undefined,
    to: p.get("to") ?? undefined,
    q: p.get("q") ?? undefined,
  });

  const header = ["Fecha", "Accion", "Actor", "Rol", "TipoEntidad", "IdEntidad", "IdSocio"];
  const rows = logs.map((l) => [
    l.createdAt.toISOString(),
    l.action,
    l.actor?.name ?? "",
    l.actor?.role ?? "",
    l.entityType,
    l.entityId,
    l.memberId ?? "",
  ]);

  const csv = [header, ...rows].map((row) => row.map((v) => csvEscape(String(v))).join(",")).join("\n");
  const fileName = `auditoria-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
