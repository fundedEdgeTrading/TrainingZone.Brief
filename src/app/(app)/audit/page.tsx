import Link from "next/link";
import { requireRole } from "@/lib/guard";
import { prisma } from "@/lib/prisma";

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
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-tz-black">Auditoría</h1>
        <p className="text-sm text-muted max-w-2xl">
          Registro append-only (ADR-008). Cada lectura de un dato de salud y
          cada apertura del Session Brief con indicadores de salud queda
          registrada aquí, exigible bajo RGPD Art. 9.
        </p>
      </div>

      <div className="bg-white border border-tz-linen rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-tz-bone text-muted text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Fecha</th>
              <th className="text-left px-4 py-2">Acción</th>
              <th className="text-left px-4 py-2">Actor</th>
              <th className="text-left px-4 py-2">Entidad</th>
              <th className="text-left px-4 py-2">Socio</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-t border-tz-sand">
                <td className="px-4 py-2 text-muted">
                  {l.createdAt.toLocaleString("es-ES")}
                </td>
                <td className="px-4 py-2 font-medium text-text-2">
                  {ACTION_LABEL[l.action] ?? l.action}
                </td>
                <td className="px-4 py-2 text-text-2">
                  {l.actor?.name ?? "—"} <span className="text-xs text-faint">({l.actor?.role})</span>
                </td>
                <td className="px-4 py-2 text-muted text-xs">
                  {l.entityType} · {l.entityId.slice(0, 8)}…
                </td>
                <td className="px-4 py-2">
                  {l.memberId ? (
                    <Link href={`/members/${l.memberId}`} className="text-tz-black hover:underline text-xs">
                      ver ficha
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
