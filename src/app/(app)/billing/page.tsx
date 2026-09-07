import Link from "next/link";
import { requireRole } from "@/lib/guard";
import {
  listPayments,
  countPayments,
  getBillingKpis,
  getDelinquentMembers,
  getMembersForPaymentForm,
  type PaymentSort,
} from "@/lib/billing-queries";
import { centerScopeFor } from "@/lib/center-scope";
import { listActivePlansForOrg } from "@/lib/members-queries";
import { isStripeConfiguredForOrg } from "@/lib/stripe";
import { PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL, PAYMENT_STATUS_TONE } from "@/lib/chart-colors";
import { KpiCard, Card } from "@/components/kpi-card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import PaymentForm from "./payment-form";
import StripeCheckoutForm from "./stripe-checkout-form";
import { PostponePaymentAction, RefundPaymentAction } from "./payment-lifecycle-forms";
import { BillingStatusFilter } from "./billing-status-filter";
import { parseFilterValues } from "@/lib/filter-params";
import type { PaymentStatus } from "@prisma/client";
import { WhatsAppButton } from "@/components/ui/whatsapp-button";
import { logPaymentWhatsappContactAction } from "./actions";

function euros(cents: number) {
  return (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

const STATUS_LABEL = PAYMENT_STATUS_LABEL;
const PAYMENT_STATUSES: PaymentStatus[] = ["PAID", "PENDING", "FAILED", "REFUNDED"];
const PAYMENT_SORTS: PaymentSort[] = ["date_desc", "date_asc", "amount_desc", "amount_asc"];
/** E8-13: tamaño de página del listado de cobros, paginado en servidor. */
const PAYMENTS_PAGE_SIZE = 25;

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string; sort?: string }>;
}) {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "RECEPTION"]);
  const params = await searchParams;
  const sort: PaymentSort = PAYMENT_SORTS.includes(params.sort as PaymentSort) ? (params.sort as PaymentSort) : "date_desc";

  // Mismo ámbito de centro que `/members` (center-scope.ts): dirección de
  // organización ve toda la empresa; recepción/dirección de centro, solo los
  // socios de los centros a los que está imputada. Antes de esto, Cobros
  // filtraba únicamente por organización.
  const scope = await centerScopeFor(session.user);
  const centerIds = scope ?? undefined;
  const statuses = parseFilterValues(params.status) as PaymentStatus[];

  const [kpis, totalPayments, delinquent, membersForForm, plans, stripeConfigured] = await Promise.all([
    getBillingKpis(session.user.orgId, centerIds),
    countPayments(session.user.orgId, { statuses, centerIds }),
    getDelinquentMembers(session.user.orgId, centerIds),
    getMembersForPaymentForm(session.user.orgId, centerIds),
    listActivePlansForOrg(session.user.orgId),
    isStripeConfiguredForOrg(session.user.orgId),
  ]);

  const pageCount = Math.max(1, Math.ceil(totalPayments / PAYMENTS_PAGE_SIZE));
  const page = Math.min(Math.max(1, Number(params.page) || 1), pageCount);
  const payments = await listPayments(session.user.orgId, {
    statuses,
    centerIds,
    sort,
    skip: (page - 1) * PAYMENTS_PAGE_SIZE,
    take: PAYMENTS_PAGE_SIZE,
  });

  // E6-06: exportar es cosa de dirección, igual que en /api/export/payments.
  const canExport = session.user.role === "OWNER" || session.user.role === "CENTER_DIRECTOR";

  return (
    <div className="tz-page space-y-6">
      <PageHeader
        description="Cero dudas sobre quién está al corriente (F3). El cobro online con Stripe está aquí mismo, debajo; la facturación certificada (VERI*FACTU) queda fuera de esta entrega."
        actions={
          canExport ? (
            <a
              href="/api/export/payments"
              className="text-xs font-semibold text-brand-text-2 border border-brand-border rounded-lg px-3 py-1.5 transition-colors hover:bg-brand-ink hover:text-white hover:border-brand-ink"
            >
              Exportar cobros
            </a>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Cobrado este mes" value={euros(kpis.paidThisMonthCents)} tone="good" delay={0.04} />
        <KpiCard label="Pagos pendientes" value={String(kpis.pending)} tone={kpis.pending ? "warning" : "default"} delay={0.1} />
        <KpiCard label="Pagos fallidos" value={String(kpis.failed)} tone={kpis.failed ? "critical" : "default"} delay={0.16} />
        <KpiCard label="Socios morosos" value={String(kpis.delinquentMembers)} tone={kpis.delinquentMembers ? "critical" : "default"} delay={0.22} />
      </div>

      <Card title="Cobro por Stripe" meta="RB-PAGO-001 — canal objetivo" delay={0.1}>
        <StripeCheckoutForm members={membersForForm} plans={plans} configured={stripeConfigured} />
      </Card>

      <Card title="Registrar cobro manual" meta="efectivo / tarjeta presencial / Bizum — puente hasta Stripe" delay={0.12}>
        <PaymentForm members={membersForForm} />
      </Card>

      {delinquent.length > 0 && (
        <Card title="Socios morosos" meta={String(delinquent.length)} delay={0.18}>
          <div className="sm:overflow-x-auto">
            <table className="tz-stack-table w-full text-sm">
              <thead className="text-xs text-faint text-left">
                <tr>
                  <th scope="col" className="pb-2">Socio</th>
                  <th scope="col" className="pb-2">Centro</th>
                  <th scope="col" className="pb-2">Plan</th>
                  <th scope="col" className="pb-2">Último pago</th>
                </tr>
              </thead>
              <tbody>
                {delinquent.map((m) => (
                  <tr key={m.id} className="border-t border-tz-sand">
                    <td data-label="" className="py-2 font-semibold">
                      <Link href={`/members/${m.id}`} className="text-tz-black hover:underline">
                        {m.firstName} {m.lastName}
                      </Link>
                    </td>
                    <td data-label="Centro" className="py-2 text-text-2">{m.primaryCenter.name}</td>
                    <td data-label="Plan" className="py-2 text-text-2">{m.subscriptions[0]?.plan.name ?? "—"}</td>
                    <td data-label="Último pago" className="py-2">
                      {m.payments[0] ? (
                        <span className="inline-flex items-center gap-2">
                          <Badge tone={PAYMENT_STATUS_TONE[m.payments[0].status]}>{STATUS_LABEL[m.payments[0].status]}</Badge>
                          <span className="text-muted tz-nums">{m.payments[0].date.toLocaleDateString("es-ES")}</span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card
        title="Pagos recientes"
        delay={0.24}
        action={
          <BillingStatusFilter
            options={PAYMENT_STATUSES.map((s) => ({
              value: s,
              label: STATUS_LABEL[s],
              tone: PAYMENT_STATUS_TONE[s],
            }))}
          />
        }
      >
        <div className="sm:overflow-x-auto">
          <table className="tz-stack-table w-full text-sm">
            <thead className="text-xs text-faint text-left">
              <tr>
                <PaymentSortHeader
                  label="Fecha"
                  ascSort="date_asc"
                  descSort="date_desc"
                  activeSort={sort}
                  params={params}
                />
                <th scope="col" className="pb-2">Socio</th>
                <PaymentSortHeader
                  label="Importe"
                  ascSort="amount_asc"
                  descSort="amount_desc"
                  activeSort={sort}
                  params={params}
                />
                <th scope="col" className="pb-2">Método</th>
                <th scope="col" className="pb-2">Estado</th>
                <th scope="col" className="pb-2">Recibo</th>
                <th scope="col" className="pb-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-t border-tz-sand">
                  <td data-label="Fecha" className="py-2 tz-nums">
                    {p.date.toLocaleDateString("es-ES")}
                    {p.status === "PENDING" && p.dueDate && (
                      <div className="text-[11px] text-faint">aplazado a {p.dueDate.toLocaleDateString("es-ES")}</div>
                    )}
                  </td>
                  <td data-label="Socio" className="py-2">
                    <Link href={`/members/${p.member.id}`} className="text-tz-black hover:underline">
                      {p.member.firstName} {p.member.lastName}
                    </Link>
                  </td>
                  <td data-label="Importe" className="py-2 tz-nums font-semibold">{euros(p.amountCents)}</td>
                  <td data-label="Método" className="py-2">{PAYMENT_METHOD_LABEL[p.method]}</td>
                  <td data-label="Estado" className="py-2">
                    <Badge tone={PAYMENT_STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                  </td>
                  <td data-label="Recibo" className="py-2 text-faint">{p.receiptNumber}</td>
                  <td data-label="Acciones" className="py-2 empty:hidden flex flex-wrap items-center gap-1.5">
                    {p.status === "PENDING" && <PostponePaymentAction paymentId={p.id} />}
                    {p.status === "PAID" && <RefundPaymentAction paymentId={p.id} />}
                    {p.status === "FAILED" && (
                      <WhatsAppButton
                        phone={p.member.phone}
                        message={`Hola ${p.member.firstName}, hemos visto que el último recibo de tu cuota no se ha podido cobrar. ¿Puedes revisar tu método de pago?`}
                        logAction={logPaymentWhatsappContactAction.bind(null, p.id)}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <PaymentsPager page={page} pageCount={pageCount} total={totalPayments} params={params} />
      </Card>
    </div>
  );
}

/** E8-13: cabecera ordenable con scope, aria-sort y una indicación visible más allá de la flecha. */
function PaymentSortHeader({
  label,
  ascSort,
  descSort,
  activeSort,
  params,
}: {
  label: string;
  ascSort: PaymentSort;
  descSort: PaymentSort;
  activeSort: PaymentSort;
  params: { status?: string; sort?: string };
}) {
  const isSorted = activeSort === ascSort || activeSort === descSort;
  const nextSort = activeSort === descSort ? ascSort : descSort;
  const dir = activeSort === ascSort ? "asc" : "desc";

  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  qs.set("sort", nextSort);
  const href = `/billing?${qs.toString()}`;

  return (
    <th scope="col" aria-sort={isSorted ? (dir === "asc" ? "ascending" : "descending") : "none"} className="pb-2">
      <Link
        href={href}
        className={`inline-flex items-center gap-1 hover:text-brand-text transition-colors ${
          isSorted ? "text-brand-text font-extrabold" : "font-bold"
        }`}
      >
        {label}
        <span aria-hidden="true" className={isSorted ? "opacity-100" : "opacity-40"}>
          {isSorted && dir === "asc" ? "↑" : "↓"}
        </span>
      </Link>
    </th>
  );
}

/** Enlaces `?page=N` que conservan el resto de filtros de la URL (E8-13, mismo patrón que /members). */
function PaymentsPager({
  page,
  pageCount,
  total,
  params,
}: {
  page: number;
  pageCount: number;
  total: number;
  params: { status?: string; page?: string; sort?: string };
}) {
  if (total === 0) return null;

  function hrefFor(targetPage: number) {
    const qs = new URLSearchParams();
    if (params.status) qs.set("status", params.status);
    if (params.sort) qs.set("sort", params.sort);
    if (targetPage > 1) qs.set("page", String(targetPage));
    const query = qs.toString();
    return query ? `/billing?${query}` : "/billing";
  }

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap px-1 pt-3 text-[12.5px] text-brand-muted">
      <span>Página {page} de {pageCount} · {total} {total === 1 ? "cobro" : "cobros"} en total</span>
      <div className="flex items-center gap-1">
        <Link
          href={hrefFor(page - 1)}
          aria-disabled={page === 1}
          className={`inline-flex items-center justify-center w-7 h-7 rounded-lg border border-brand-border text-brand-text-2 hover:bg-tz-bone transition-colors ${
            page === 1 ? "opacity-35 pointer-events-none" : ""
          }`}
          aria-label="Página anterior"
        >
          ‹
        </Link>
        <span className="px-2 font-semibold text-brand-text-2 tz-nums">
          {page} / {pageCount}
        </span>
        <Link
          href={hrefFor(page + 1)}
          aria-disabled={page === pageCount}
          className={`inline-flex items-center justify-center w-7 h-7 rounded-lg border border-brand-border text-brand-text-2 hover:bg-tz-bone transition-colors ${
            page === pageCount ? "opacity-35 pointer-events-none" : ""
          }`}
          aria-label="Página siguiente"
        >
          ›
        </Link>
      </div>
    </div>
  );
}
