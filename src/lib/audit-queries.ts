import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export const AUDIT_PAGE_SIZE = 50;

export type AuditFilters = {
  page?: number;
  action?: string;
  from?: string; // "YYYY-MM-DD"
  to?: string; // "YYYY-MM-DD"
  q?: string; // nombre del actor
};

function buildWhere(orgId: string, filters: AuditFilters): Prisma.AuditLogWhereInput {
  const createdAt: Prisma.DateTimeFilter = {};
  if (filters.from) createdAt.gte = new Date(`${filters.from}T00:00:00`);
  if (filters.to) createdAt.lte = new Date(`${filters.to}T23:59:59.999`);

  return {
    orgId,
    action: filters.action && filters.action !== "all" ? filters.action : undefined,
    createdAt: filters.from || filters.to ? createdAt : undefined,
    actor: filters.q ? { name: { contains: filters.q, mode: "insensitive" } } : undefined,
  };
}

/**
 * RGPD/ADR-008: antes `take: 200` fijo, sin filtros ni paginación — el log se
 * volvía inconsultable en cuanto crecía. Ahora pagina de verdad y admite
 * acotar por acción, rango de fechas y actor.
 */
export async function getAuditLogPage(orgId: string, filters: AuditFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const where = buildWhere(orgId, filters);

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      include: { actor: { select: { name: true, role: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * AUDIT_PAGE_SIZE,
      take: AUDIT_PAGE_SIZE,
    }),
  ]);

  return { logs, total, page, totalPages: Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE)) };
}

export async function getDistinctAuditActions(orgId: string): Promise<string[]> {
  const rows = await prisma.auditLog.findMany({ where: { orgId }, distinct: ["action"], select: { action: true } });
  return rows.map((r) => r.action).sort();
}

const EXPORT_MAX_ROWS = 20_000;

/** Exportación CSV: mismos filtros que la vista, sin paginar (acotado a un máximo razonable). */
export async function getAuditLogForExport(orgId: string, filters: AuditFilters) {
  const where = buildWhere(orgId, filters);
  return prisma.auditLog.findMany({
    where,
    include: { actor: { select: { name: true, role: true } } },
    orderBy: { createdAt: "desc" },
    take: EXPORT_MAX_ROWS,
  });
}
