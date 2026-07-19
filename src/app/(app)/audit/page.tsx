import Link from "next/link";
import { requireRole } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { TableShell, THead, Th, TRow, Td } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";

const ACTION_LABEL: Record<string, string> = {
  HEALTH_RECORD_READ: "Lectura de dato de salud",
  SESSION_BRIEF_OPENED: "Session Brief abierto",
  MEMBER_UPDATED: "Ficha de socio actualizada",
};

export default async function AuditPage() {
  const session = await requireRole(["OWNER", "PLATFORM_ADMIN"]);

  const logs = await prisma.auditLog.findMany({
    where: { orgId: session.user.orgId },
    include: { actor: { select: { name: true, role: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="tz-page space-y-4">
      <PageHeader description="Registro append-only (ADR-008). Cada lectura de un dato de salud y cada apertura del Session Brief con indicadores de salud queda registrada aquí, exigible bajo RGPD Art. 9." />

      {logs.length === 0 ? (
        <TableShell>
          <tbody>
            <tr>
              <td colSpan={5}>
                <EmptyState title="Sin registros" description="Todavía no hay eventos de auditoría." />
              </td>
            </tr>
          </tbody>
        </TableShell>
      ) : (
        <TableShell>
          <THead>
            <Th>Fecha</Th>
            <Th>Acción</Th>
            <Th>Actor</Th>
            <Th>Entidad</Th>
            <Th>Socio</Th>
          </THead>
          <tbody>
            {logs.map((l) => (
              <TRow key={l.id}>
                <Td className="text-muted tz-nums text-xs">{l.createdAt.toLocaleString("es-ES")}</Td>
                <Td className="font-medium text-text-2">
                  <Badge tone="neutral">{ACTION_LABEL[l.action] ?? l.action}</Badge>
                </Td>
                <Td className="text-text-2">
                  {l.actor?.name ?? "—"} <span className="text-xs text-faint">({l.actor?.role})</span>
                </Td>
                <Td className="text-muted text-xs">
                  {l.entityType} · {l.entityId.slice(0, 8)}…
                </Td>
                <Td>
                  {l.memberId ? (
                    <Link href={`/members/${l.memberId}`} className="text-tz-black hover:underline text-xs">
                      ver ficha
                    </Link>
                  ) : (
                    "—"
                  )}
                </Td>
              </TRow>
            ))}
          </tbody>
        </TableShell>
      )}
    </div>
  );
}
