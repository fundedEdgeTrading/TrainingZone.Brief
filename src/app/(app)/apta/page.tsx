import type { PlatformStatus } from "@prisma/client";
import { requireRole } from "@/lib/guard";
import { listOrganizationsForAdmin, getPlatformMetrics } from "@/lib/platform-admin-queries";
import { PLATFORM_PLANS } from "@/lib/platform-plans";
import { PageHeader } from "@/components/ui/page-header";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { ActionForm } from "@/components/ui/action-form";
import { DataTable, type DataTableColumn, type DataTableRow } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { resendActivationAction, createAssistedOrgAction } from "./actions";

const CARD = "bg-brand-card border border-brand-border rounded-card p-5 shadow-card";
const SECTION_TITLE = "font-display font-extrabold text-lg uppercase tracking-[-.01em] text-brand-text";

const STATUS_LABEL: Record<PlatformStatus, string> = {
  PENDING_PAYMENT: "Pendiente de pago",
  TRIALING: "En prueba",
  ACTIVE: "Activa",
  PAST_DUE: "En impago",
  SUSPENDED: "Suspendida",
  CANCELLED: "Cancelada",
};

const STATUS_TONE: Record<PlatformStatus, BadgeTone> = {
  PENDING_PAYMENT: "neutral",
  TRIALING: "trial",
  ACTIVE: "good",
  PAST_DUE: "warning",
  SUSPENDED: "critical",
  CANCELLED: "neutral",
};

function euros(cents: number) {
  return (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

function formatDate(date: Date | null) {
  if (!date) return "—";
  return date.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * E6-08 · back-office `/apta`. PLATFORM_ADMIN-only (soporte de Apta): lista de
 * organizaciones, alta asistida fuera de Stripe y métricas agregadas.
 *
 * NO da acceso a nada de un socio salvo su recuento: ni ficha, ni
 * consentimiento, ni dato de salud — esas siguen viviendo dentro de cada
 * organización, ámbito al que PLATFORM_ADMIN no entra desde aquí.
 */
export default async function AptaPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  await requireRole(["PLATFORM_ADMIN"]);
  const params = await searchParams;
  const status = params.status && params.status in STATUS_LABEL ? (params.status as PlatformStatus) : undefined;

  const [orgs, metrics] = await Promise.all([
    listOrganizationsForAdmin({ query: params.q, status }),
    getPlatformMetrics(),
  ]);

  const columns: DataTableColumn[] = [
    { key: "name", header: "Organización", sortable: true },
    { key: "plan", header: "Plan", sortable: true },
    { key: "status", header: "Estado", sortable: true },
    { key: "centers", header: "Centros", sortable: true, align: "right" },
    { key: "members", header: "Socios", sortable: true, align: "right" },
    { key: "lastCharge", header: "Último cobro", sortable: true },
    { key: "actions", header: "", className: "text-right" },
  ];

  const rows: DataTableRow[] = orgs.map((org) => ({
    key: org.id,
    cells: {
      name: (
        <div>
          <div className="font-semibold text-brand-text">{org.name}</div>
          <div className="text-xs text-faint">{org.billingEmail ?? org.slug}</div>
        </div>
      ),
      plan: org.planName ?? <span className="text-faint">Sin plan</span>,
      status: <Badge tone={STATUS_TONE[org.platformStatus]}>{STATUS_LABEL[org.platformStatus]}</Badge>,
      centers: org.centersCount,
      members: org.membersCount,
      lastCharge: formatDate(org.lastPlatformChargeAt),
      actions: org.canResendActivation ? (
        <ActionForm action={resendActivationAction.bind(null, org.id)} successMessage="Activación reenviada." resetOnSuccess={false}>
          <Button type="submit" variant="secondary" size="sm">
            Reenviar activación
          </Button>
        </ActionForm>
      ) : null,
    },
    sortValues: {
      name: org.name,
      plan: org.planName ?? "",
      status: STATUS_LABEL[org.platformStatus],
      centers: org.centersCount,
      members: org.membersCount,
      lastCharge: org.lastPlatformChargeAt?.getTime() ?? 0,
    },
  }));

  return (
    <div className="tz-page space-y-6">
      <PageHeader
        kicker="Back-office de Apta"
        description="Organizaciones clientes de Apta: plan contratado, estado de cobro de plataforma, alta asistida fuera de Stripe y reenvío de activación. Solo PLATFORM_ADMIN entra aquí, y cada acción queda en AuditLog."
      />

      {/* ---------- Métricas de plataforma ---------- */}
      <section className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        <div className={CARD}>
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-brand-muted">Activas</div>
          <div className="mt-1 text-2xl font-display font-extrabold text-brand-text">{metrics.active}</div>
        </div>
        <div className={CARD}>
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-brand-muted">En impago</div>
          <div className="mt-1 text-2xl font-display font-extrabold text-warning-text">{metrics.pastDue}</div>
        </div>
        <div className={CARD}>
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-brand-muted">Suspendidas</div>
          <div className="mt-1 text-2xl font-display font-extrabold text-critical">{metrics.suspended}</div>
        </div>
        <div className={CARD}>
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-brand-muted">Canceladas</div>
          <div className="mt-1 text-2xl font-display font-extrabold text-brand-text">{metrics.cancelled}</div>
        </div>
        <div className={CARD}>
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-brand-muted">MRR agregado</div>
          <div className="mt-1 text-2xl font-display font-extrabold text-gold">{euros(metrics.mrrCents)}</div>
        </div>
      </section>

      {/* ---------- Listado + búsqueda/filtro ---------- */}
      <section className="space-y-3">
        <h2 className={SECTION_TITLE}>Organizaciones</h2>
        {/* Formulario GET nativo: sin JS, la búsqueda y el filtro son la propia
            URL (`/apta?q=&status=`), como el resto de listados server-rendered. */}
        <form className="flex flex-wrap items-end gap-3" action="/apta">
          <Field label="Buscar" className="w-full sm:w-64">
            <input
              type="text"
              name="q"
              defaultValue={params.q ?? ""}
              placeholder="Nombre, email o slug"
              className="w-full rounded-control border border-brand-border bg-input px-3.5 py-2.5 text-sm text-brand-text placeholder:text-faint focus:border-brand-ink focus:ring-2 focus:ring-tz-black/10 focus:outline-none"
            />
          </Field>
          <Field label="Estado" className="w-full sm:w-56">
            <select
              name="status"
              defaultValue={params.status ?? ""}
              className="w-full rounded-control border border-brand-border bg-input px-3.5 py-2.5 text-sm text-brand-text focus:border-brand-ink focus:ring-2 focus:ring-tz-black/10 focus:outline-none"
            >
              <option value="">Todos los estados</option>
              {(Object.keys(STATUS_LABEL) as PlatformStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </Field>
          <Button type="submit" variant="secondary">
            Filtrar
          </Button>
        </form>

        {rows.length === 0 ? (
          <EmptyState title="Sin resultados" description="Ninguna organización coincide con la búsqueda o el filtro." />
        ) : (
          <DataTable columns={columns} rows={rows} />
        )}
      </section>

      {/* ---------- Alta asistida ---------- */}
      <section className="space-y-3">
        <h2 className={SECTION_TITLE}>Alta asistida (cobro fuera de Stripe)</h2>
        <p className="text-sm text-brand-muted max-w-2xl">
          Para cerrar una venta por transferencia o factura, sin pasar por el checkout de Stripe. Queda registrado en
          AuditLog quién la dio de alta, con qué plan y con qué justificante.
        </p>
        <div className={CARD}>
          <ActionForm
            action={createAssistedOrgAction}
            successMessage="Organización dada de alta. Se ha enviado el enlace de activación al director."
            className="grid grid-cols-1 md:grid-cols-2 gap-3.5"
          >
            <Field label="Nombre de la organización">
              <Input name="name" required placeholder="Nombre del gimnasio" />
            </Field>
            <Field label="Email del director">
              <Input name="email" type="email" required placeholder="director@gimnasio.es" />
            </Field>
            <Field label="Plan">
              <Select name="planCode" required defaultValue="">
                <option value="" disabled>
                  Seleccionar...
                </option>
                {PLATFORM_PLANS.map((plan) => (
                  <option key={plan.code} value={plan.code}>
                    {plan.name} · {plan.priceLabel}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Método de cobro">
              <Select name="paymentMethod" required defaultValue="">
                <option value="" disabled>
                  Seleccionar...
                </option>
                <option value="TRANSFERENCIA">Transferencia</option>
                <option value="FACTURA">Factura</option>
                <option value="OTRO">Otro</option>
              </Select>
            </Field>
            <Field label="Justificante" hint="Número de factura, referencia de la transferencia, etc." className="md:col-span-2">
              <Input name="justification" required placeholder="Factura nº 2026-045" />
            </Field>
            <div className="md:col-span-2">
              <Button type="submit">Dar de alta</Button>
            </div>
          </ActionForm>
        </div>
      </section>
    </div>
  );
}
