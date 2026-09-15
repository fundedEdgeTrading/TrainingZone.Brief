import Link from "next/link";
import { requireRole } from "@/lib/guard";
import { requireFeature } from "@/lib/entitlements";
import { KpiCard, Card } from "@/components/kpi-card";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { PAYMENT_METHOD_LABEL } from "@/lib/chart-colors";
import { listPayoutsWithComposition, reconcilePeriod } from "@/lib/stripe-balance";
import {
  ACCOUNTING_DECLARATION,
  listAccountingMovements,
  parseAccountingMonth,
  recentAccountingMonths,
  totalsOf,
} from "@/lib/stripe-export";
import { buildFinancialReport, stripeConnectionFor } from "@/lib/stripe-reports";
import type { PayoutStatus } from "@prisma/client";
import { resolveAccountingScope } from "./resolve-scope";
import { downloadAccountingCsvAction, downloadFinancialReportAction } from "./actions";
import { DownloadButton } from "./download-button";

/**
 * HU-ST-25 · Contabilidad: el extracto que se lleva la gestoría, el desglose
 * bruto/comisión/neto de HU-ST-23 y el cuadre contra los payouts.
 *
 * GATE DE PLAN: la ruta va gateada con `exportaciones`, pero `FEATURE_BY_ROUTE`
 * vive en `src/lib/rbac.ts`, congelado este trimestre. La declaración pendiente
 * está en `docs/hu/patches-rbac/HU-ST-25-gate-billing-contabilidad.md` y la
 * guarda de esta pantalla ya la aplica; `contabilidad-gate.test.ts` comprueba
 * las dos mitades, para que la ruta no pueda quedarse sin gate declarado.
 */

function euros(cents: number) {
  return (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

const PAYOUT_STATUS_LABEL: Record<PayoutStatus, string> = {
  PENDING: "Pendiente",
  IN_TRANSIT: "En camino",
  PAID: "Liquidado",
  FAILED: "Fallido",
  CANCELED: "Cancelado",
};

const PAYOUT_STATUS_TONE: Record<PayoutStatus, BadgeTone> = {
  PENDING: "neutral",
  IN_TRANSIT: "trial",
  PAID: "good",
  FAILED: "critical",
  CANCELED: "neutral",
};

export default async function ContabilidadPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; centerId?: string }>;
}) {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR"]);
  // El mismo gate que la exportación de auditoría y la de cobros: llevarse los
  // datos fuera es de pago, consultarlos dentro no.
  await requireFeature("exportaciones");

  const params = await searchParams;
  const scope = await resolveAccountingScope(session.user, params.centerId);
  const mes = parseAccountingMonth(params.mes);
  const meses = recentAccountingMonths(12);

  const [movimientos, cuadre, payouts, conexion] = await Promise.all([
    listAccountingMovements(session.user.orgId, { from: mes.from, to: mes.to, centerIds: scope.centerIds }),
    reconcilePeriod(session.user.orgId, { from: mes.from, to: mes.to, centerIds: scope.centerIds }),
    listPayoutsWithComposition(session.user.orgId, { centerIds: scope.centerIds, take: 12 }),
    stripeConnectionFor(session.user.orgId),
  ]);
  const totales = totalsOf(movimientos);

  // HU-ST-26 · el informe solo se calcula si hay cobros conectados: sin cuenta
  // no hay saldo que leer y la sección enseña la explicación, no un botón.
  const informe = conexion.connected
    ? await buildFinancialReport(session.user.orgId, {
        from: mes.from,
        to: mes.to,
        centerIds: scope.centerIds,
        periodLabel: mes.label,
        scopeLabel: scope.scopeLabel,
      })
    : null;

  function href(next: { mes?: string; centerId?: string | null }) {
    const qs = new URLSearchParams();
    qs.set("mes", next.mes ?? mes.id);
    const centro = next.centerId === undefined ? scope.centerId : next.centerId;
    if (centro) qs.set("centerId", centro);
    return `/billing/contabilidad?${qs.toString()}`;
  }

  const pill = (activo: boolean) =>
    `rounded-pill px-3 py-1 text-xs font-semibold transition-colors ${
      activo ? "bg-brand-ink text-tz-bone" : "border border-brand-border text-brand-text-2 hover:bg-brand-card"
    }`;

  return (
    <div className="tz-page space-y-6">
      <PageHeader
        kicker="Contabilidad"
        description="Lo que de verdad ha entrado: bruto cobrado, comisión de Stripe, neto liquidado y con qué payout llegó. El extracto para la gestoría sale de aquí."
        actions={
          <Link
            href="/billing"
            className="text-xs font-semibold text-brand-text-2 border border-brand-border rounded-lg px-3 py-1.5 transition-colors hover:bg-brand-ink hover:text-white hover:border-brand-ink"
          >
            Volver a Cobros
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {meses.slice(0, 6).map((m) => (
          <Link key={m.id} href={href({ mes: m.id })} className={pill(m.id === mes.id)}>
            {m.label}
          </Link>
        ))}
      </div>

      {scope.centers.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <Link href={href({ centerId: null })} className={pill(scope.centerId === null)}>
            {scope.orgWide ? "Toda la organización" : "Todos mis centros"}
          </Link>
          {scope.centers.map((c) => (
            <Link key={c.id} href={href({ centerId: c.id })} className={pill(scope.centerId === c.id)}>
              {c.name}
            </Link>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Bruto cobrado" value={euros(totales.grossCents)} delay={0.04} />
        <KpiCard label="Comisión de Stripe" value={euros(totales.feeCents)} tone="warning" delay={0.1} />
        <KpiCard label="Neto real" value={euros(totales.netCents)} tone="good" delay={0.16} />
        <KpiCard
          label="Devuelto"
          value={euros(totales.refundedCents)}
          tone={totales.refundedCents ? "critical" : "default"}
          delay={0.22}
        />
      </div>

      <Card title="Extracto para la gestoría" meta={mes.label} delay={0.1}>
        <div className="space-y-4">
          <div className="rounded-xl border border-brand-border bg-brand-bg-2 p-3.5 text-xs text-brand-text-2 space-y-1">
            {/* La misma frase que va dentro del fichero. Se enseña aquí para que
                quien lo descarga sepa qué está mandando, no solo quien lo abre. */}
            {ACCOUNTING_DECLARATION.map((linea) => (
              <p key={linea}>{linea}</p>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <DownloadButton
              label="Descargar CSV del periodo"
              pendingLabel="Preparando…"
              request={async () => downloadAccountingCsvAction({ mes: mes.id, centerId: scope.centerId })}
              disabled={movimientos.length === 0}
              disabledReason="No hay movimientos en este periodo, así que no hay nada que exportar."
            />
            <p className="text-xs text-brand-muted">
              {movimientos.length} movimientos · {totales.charges} cobros y {totales.refunds} devoluciones ·{" "}
              {scope.scopeLabel}
            </p>
          </div>
        </div>
      </Card>

      <Card
        title="Informe financiero"
        meta={informe ? mes.label : "sin cobros conectados"}
        delay={0.13}
      >
        {!conexion.connected || !informe ? (
          // Escenario "sin Stripe conectado": se explica qué falta y por dónde
          // se hace. Un botón que no puede generar nada es peor que no tenerlo:
          // se pulsa, no pasa nada, y nadie sabe si el fallo es suyo.
          <div className="space-y-3">
            <p className="text-sm text-brand-text-2">
              Para pedir un informe financiero hace falta conectar los cobros de este centro con Stripe. El
              informe sale de lo que Stripe liquida —comisiones, netos y saldo—, y sin cuenta conectada no hay
              nada que leer.
            </p>
            <p className="text-xs text-brand-muted">
              {!conexion.connected && conexion.reason}
            </p>
            <Link
              href="/organization"
              className="inline-block rounded-lg bg-brand-ink px-3.5 py-1.5 text-xs font-semibold text-tz-bone transition-opacity duration-150 hover:opacity-90"
            >
              Conectar cobros
            </Link>
            <p className="text-xs text-faint">
              Mientras tanto, el extracto de arriba sigue funcionando: se arma con los cobros registrados en
              Apta, tengan o no desglose de Stripe.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-xs text-faint">Saldo disponible</div>
                <div className="font-semibold tz-nums">
                  {informe.balance ? euros(informe.balance.availableCents) : "—"}
                </div>
              </div>
              <div>
                <div className="text-xs text-faint">Pendiente en Stripe</div>
                <div className="font-semibold tz-nums">
                  {informe.balance ? euros(informe.balance.pendingCents) : "—"}
                </div>
              </div>
              <div>
                <div className="text-xs text-faint">Métodos con cobros</div>
                <div className="font-semibold tz-nums">{informe.byMethod.length}</div>
              </div>
              <div>
                <div className="text-xs text-faint">Entorno</div>
                <div>
                  <Badge tone={informe.livemode ? "good" : "warning"}>
                    {informe.livemode ? "Live" : "Pruebas"}
                  </Badge>
                </div>
              </div>
            </div>

            {informe.balanceError && (
              // La tarjeta degrada con su mensaje: el resto del informe sale de
              // nuestra base y no depende de que Stripe conteste.
              <p className="text-xs text-warning-text">
                No se pudo leer el saldo en Stripe: {informe.balanceError} El resto del informe sale igual.
              </p>
            )}

            <DownloadButton
              label="Descargar informe del periodo"
              pendingLabel="Generando…"
              variant="ghost"
              request={async () => downloadFinancialReportAction({ mes: mes.id, centerId: scope.centerId })}
            />
          </div>
        )}
      </Card>

      <Card
        title="Cuadre del periodo"
        meta={cuadre.orgWide ? `${cuadre.payouts.length} payouts liquidados` : "parcial"}
        delay={0.16}
      >
        {cuadre.payouts.length === 0 ? (
          <p className="text-sm text-brand-muted">
            En este periodo no ha llegado ningún payout liquidado. En cuanto Stripe liquide, aquí se compara su
            importe contra la suma de netos de los cobros que lo componen.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-xs text-faint">Payouts liquidados</div>
                <div className="font-semibold tz-nums">{euros(cuadre.payoutsTotalCents)}</div>
              </div>
              <div>
                <div className="text-xs text-faint">Suma de netos</div>
                <div className="font-semibold tz-nums">{euros(cuadre.netTotalCents)}</div>
              </div>
              <div>
                <div className="text-xs text-faint">Cobrado sin liquidar aún</div>
                <div className="font-semibold tz-nums">{euros(cuadre.unsettledNetCents)}</div>
              </div>
            </div>
            {cuadre.orgWide ? (
              <Badge tone={cuadre.balanced ? "good" : "critical"}>
                {cuadre.balanced ? "Cuadra" : "No cuadra: revisa los payouts marcados"}
              </Badge>
            ) : (
              <p className="text-xs text-brand-muted">
                Estás viendo tus centros, no toda la organización: la suma de netos es un subtotal y no puede
                cuadrar contra el importe completo de cada payout.
              </p>
            )}
          </div>
        )}
      </Card>

      <Card title="Payouts" meta="cuándo entra el dinero" delay={0.22}>
        {payouts.length === 0 ? (
          <p className="text-sm text-brand-muted">
            Todavía no hay payouts registrados. Se anotan solos en cuanto Stripe liquida a la cuenta del centro.
          </p>
        ) : (
          <div className="sm:overflow-x-auto">
            <table className="tz-stack-table w-full text-sm">
              <thead className="text-xs text-faint text-left">
                <tr>
                  <th scope="col" className="pb-2">Llegada</th>
                  <th scope="col" className="pb-2">Importe</th>
                  <th scope="col" className="pb-2">Estado</th>
                  <th scope="col" className="pb-2">Cobros</th>
                  <th scope="col" className="pb-2">Suma de netos</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((p) => (
                  <tr key={p.id} className="border-t border-tz-sand align-top">
                    <td data-label="Llegada" className="py-2 tz-nums">
                      {p.arrivalDate ? p.arrivalDate.toLocaleDateString("es-ES") : "—"}
                    </td>
                    <td data-label="Importe" className="py-2 font-semibold tz-nums">{euros(p.amountCents)}</td>
                    <td data-label="Estado" className="py-2">
                      <Badge tone={PAYOUT_STATUS_TONE[p.status]}>{PAYOUT_STATUS_LABEL[p.status]}</Badge>
                      {p.failureMessage && (
                        <span className="block mt-1 text-[11px] text-critical">{p.failureMessage}</span>
                      )}
                    </td>
                    <td data-label="Cobros" className="py-2 text-text-2">
                      {p.payments.length === 0 ? (
                        "—"
                      ) : (
                        <ul className="space-y-0.5">
                          {p.payments.map((c) => (
                            <li key={c.paymentId} className="text-xs">
                              {c.memberName} · {euros(c.netAmountCents ?? 0)}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td data-label="Suma de netos" className="py-2 tz-nums">
                      {euros(p.netSumCents)}
                      {p.balanced === false && (
                        <span className="block text-[11px] text-critical">No cuadra con el importe</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Movimientos del periodo" meta={`${movimientos.length}`} delay={0.28}>
        {movimientos.length === 0 ? (
          <p className="text-sm text-brand-muted">No hay cobros ni devoluciones en {mes.label.toLowerCase()}.</p>
        ) : (
          <div className="sm:overflow-x-auto">
            <table className="tz-stack-table w-full text-sm">
              <thead className="text-xs text-faint text-left">
                <tr>
                  <th scope="col" className="pb-2">Fecha</th>
                  <th scope="col" className="pb-2">Socio</th>
                  <th scope="col" className="pb-2">Concepto</th>
                  <th scope="col" className="pb-2">Bruto</th>
                  <th scope="col" className="pb-2">Comisión</th>
                  <th scope="col" className="pb-2">Neto</th>
                  <th scope="col" className="pb-2">Método</th>
                </tr>
              </thead>
              <tbody>
                {movimientos.map((m) => (
                  <tr key={`${m.kind}-${m.paymentId}`} className="border-t border-tz-sand">
                    <td data-label="Fecha" className="py-2 tz-nums">{m.date.toLocaleDateString("es-ES")}</td>
                    <td data-label="Socio" className="py-2 font-semibold">{m.memberName}</td>
                    <td data-label="Concepto" className="py-2 text-text-2">
                      {m.concept}
                      {m.reason && <span className="block text-[11px] text-brand-muted">{m.reason}</span>}
                    </td>
                    <td data-label="Bruto" className="py-2 tz-nums">{euros(m.grossCents)}</td>
                    <td data-label="Comisión" className="py-2 tz-nums text-text-2">{euros(m.feeCents)}</td>
                    <td
                      data-label="Neto"
                      className={`py-2 tz-nums font-semibold ${m.netCents < 0 ? "text-critical" : ""}`}
                    >
                      {euros(m.netCents)}
                    </td>
                    <td data-label="Método" className="py-2 text-text-2">
                      {PAYMENT_METHOD_LABEL[m.method] ?? m.method}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
