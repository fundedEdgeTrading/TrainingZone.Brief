import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/guard";
import { requireFeature } from "@/lib/entitlements";
import { centerScopeFor } from "@/lib/center-scope";
import { prisma } from "@/lib/prisma";
import { PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/chart-colors";
import { toCsv, csvResponseHeaders } from "@/lib/csv-export";

/** E6-06: exportar cobros del periodo, con el mismo ámbito de centro que /billing. */
export async function GET(req: NextRequest) {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR"]);
  await requireFeature("exportaciones");
  const centerIds = await centerScopeFor(session.user);

  const p = req.nextUrl.searchParams;
  const from = p.get("from");
  const to = p.get("to");

  const payments = await prisma.payment.findMany({
    where: {
      orgId: session.user.orgId,
      ...(centerIds !== null ? { member: { primaryCenterId: { in: centerIds } } } : {}),
      ...(from || to
        ? {
            date: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
    },
    include: {
      member: { select: { firstName: true, lastName: true } },
      subscription: { select: { plan: { select: { name: true } } } },
    },
    orderBy: { date: "desc" },
  });

  const header = ["Fecha", "Socio", "Concepto", "ImporteEuros", "Metodo", "Estado"];
  const rows = payments.map((pay) => [
    pay.date.toISOString().slice(0, 10),
    `${pay.member.firstName} ${pay.member.lastName}`,
    pay.subscription?.plan.name ?? pay.notes ?? "Cobro",
    (pay.amountCents / 100).toFixed(2),
    PAYMENT_METHOD_LABEL[pay.method] ?? pay.method,
    PAYMENT_STATUS_LABEL[pay.status] ?? pay.status,
  ]);

  await prisma.auditLog.create({
    data: {
      orgId: session.user.orgId,
      actorUserId: session.user.id,
      action: "PAYMENTS_EXPORTED",
      entityType: "Payment",
      entityId: session.user.orgId,
      metadata: { centerIds, from, to, rows: rows.length },
    },
  });

  const csv = toCsv(header, rows);
  const fileName = `cobros-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, { headers: csvResponseHeaders(fileName) });
}
