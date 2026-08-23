import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/guard";
import { requireFeature } from "@/lib/entitlements";
import { getAuditLogForExport } from "@/lib/audit-queries";
import { parseFilterValues } from "@/lib/filter-params";

function csvEscape(value: string) {
  // Excel y LibreOffice interpretan como fórmula cualquier celda que empiece
  // por = + - @ (o por un control que quede antes al recortar). El nombre del
  // actor lo escriben personas, así que un usuario llamado `=HYPERLINK(...)`
  // se ejecutaba al abrir la exportación. El apóstrofo inicial la neutraliza
  // sin alterar el texto que se ve en la celda.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  if (/[",\n]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}

export async function GET(req: NextRequest) {
  const session = await requireRole(["OWNER", "PLATFORM_ADMIN"]);
  await requireFeature("exportaciones");

  const p = req.nextUrl.searchParams;
  const logs = await getAuditLogForExport(session.user.orgId, {
    actions: parseFilterValues(p.get("action")),
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
