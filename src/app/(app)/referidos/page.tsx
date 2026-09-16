import { Badge, type BadgeTone } from "@/components/ui/badge";
import { DataTable, type DataTableColumn, type DataTableRow } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { requireFeature } from "@/lib/entitlements";
import { requireRole } from "@/lib/guard";
import {
  ambassadorReach,
  BENEFICIARY_LABEL,
  listRewards,
  referralPanelData,
  referralProgramsInScope,
  REWARD_STATUS_LABEL,
  type RewardRow,
} from "@/lib/referral-rewards";
import { ProgramForm } from "./program-form";
import { RewardRowActions } from "./reward-row-actions";

/**
 * E14-34 · El panel de embajadores.
 *
 * Tres bloques, y el orden es el del trabajo real: primero lo que hay que
 * hacer hoy (las recompensas que esperan a que alguien las valide y las
 * aplique), después la medida (quién trae, cuánto entra, cuánto cuesta) y al
 * final la configuración de cada centro.
 *
 * LO QUE ESTA PANTALLA NO HACE, dicho donde se ve: no descuenta nada. Validar
 * una recompensa dice "esta es buena"; marcarla como pagada deja constancia de
 * que una persona la aplicó. El importe del próximo recibo y las sesiones
 * sueltas los mueve esa persona en su sitio de siempre. Un sistema que toca
 * recibos por su cuenta descuadra Stripe.
 *
 * LA COMPARATIVA CON ANUNCIOS está a medias A PROPÓSITO: el coste de los
 * anuncios no existe hoy en ninguna parte del repositorio y no se ha inventado
 * un campo para él. Se enseña el coste por alta del programa y se dice qué
 * falta para poder comparar. Ver `docs/hu/R1-peticion-schema-coste-anuncios.md`.
 */
export default async function ReferidosPage() {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "RECEPTION"]);
  // RB-PLAN-003 / E6-02: además del rol, el plan contratado (`marketing_automatizado`).
  await requireFeature("marketing_automatizado");

  const [panel, rewards, programs, reach] = await Promise.all([
    referralPanelData(session.user),
    listRewards(session.user),
    referralProgramsInScope(session.user),
    ambassadorReach(session.user),
  ]);

  // Tres bandejas y no dos, porque son tres trabajos distintos: decidir, aplicar
  // y consultar. Mezclar «pendiente de validar» con «validada» en una sola tabla
  // las ordenaba por estado, así que al validar una fila se iba al final —con
  // una cola de verdad, a otra página del listado— y quien acababa de validarla
  // la perdía de vista justo cuando le tocaba pagarla.
  const pending = rewards.filter((r) => r.status === "PENDING_VALIDATION");
  const validated = rewards.filter((r) => r.status === "VALIDATED");
  const closed = rewards.filter((r) => r.status === "PAID" || r.status === "REJECTED");

  return (
    <div className="tz-page space-y-6">
      <PageHeader
        description="Cada socio tiene su enlace. Quien entra por ahí cae en Leads con canal «Referido» y sigue el embudo de siempre. Cuando se da de alta, la recompensa NO se aplica sola: se abre una tarea a administración para validarla y, cuando la hayáis aplicado, marcarla como pagada."
        actions={
          <span className="text-xs text-brand-muted tz-nums">
            {panel.totals.ambassadorsWithCode} {panel.totals.ambassadorsWithCode === 1 ? "embajador" : "embajadores"} con
            enlace vivo
          </span>
        }
      />

      <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat label="Invitados" value={String(panel.totals.invited)} />
        <Stat label="Altas conseguidas" value={String(panel.totals.signedUp)} />
        <Stat label="Ingresos generados" value={euros(panel.totals.revenueCents)} />
        <Stat
          label="Coste en recompensas"
          value={euros(panel.totals.rewardCostCents)}
          hint={panel.totals.rewardSessions > 0 ? `+ ${panel.totals.rewardSessions} sesiones sueltas` : undefined}
        />
        <Stat
          label="Coste por alta"
          value={panel.totals.costPerSignupCents !== null ? euros(panel.totals.costPerSignupCents) : "—"}
          hint="Sin dato de anuncios"
        />
      </section>

      <p className="rounded-card border border-brand-border bg-tz-bone px-4 py-3.5 text-[12.5px] leading-snug text-brand-text-2">
        <b className="text-tz-black">Falta el otro lado de la comparación.</b> Para decir si sale más barato captar por
        referido que por anuncios hace falta lo que cuestan los anuncios, y ese dato hoy no está en la aplicación:
        nadie lo teclea en ninguna parte. Aquí se enseña el coste por alta del programa de referidos y se deja el hueco
        a la vista en vez de rellenarlo con un número inventado.
      </p>

      <section className="space-y-3">
        <SectionTitle
          title="Pendientes de validar"
          subtitle="Comprobad que el alta es buena. Validar no mueve dinero: dice «esta es buena, aplicadla»."
        />
        <DataTable
          columns={REWARD_COLUMNS}
          rows={pending.map(toRewardRow)}
          emptyTitle="Nada que validar"
          emptyDescription="Cuando un referido se dé de alta, su recompensa aparecerá aquí con su tarea en el tablero."
        />
      </section>

      <section className="space-y-3">
        <SectionTitle
          title="Validadas, a falta de aplicarlas"
          subtitle="Descontad el importe del próximo recibo o cargad las sesiones, y marcadlas como pagadas. El sistema no lo hace solo, y no va a hacerlo."
        />
        <DataTable
          columns={REWARD_COLUMNS}
          rows={validated.map(toRewardRow)}
          emptyTitle="Nada por aplicar"
          emptyDescription="Aquí caen las recompensas ya validadas, hasta que alguien las aplique y lo deje anotado."
        />
      </section>

      <section className="space-y-3">
        <SectionTitle title="Top embajadores" subtitle="Quién trae, cuántos entran y cuánto ha pagado la gente que trajo." />
        <DataTable
          columns={AMBASSADOR_COLUMNS}
          rows={panel.ambassadors.map((a) => ({
            key: a.memberId,
            cells: {
              name: (
                <div>
                  <div className="font-semibold text-brand-text">{a.name}</div>
                  <div className="text-xs text-faint">
                    {a.code ? (a.codeRevoked ? `${a.code} · caducado` : a.code) : "sin enlace todavía"}
                  </div>
                </div>
              ),
              center: <span className="text-sm text-brand-text-2">{a.centerName}</span>,
              invited: <span className="tz-nums">{a.invited}</span>,
              assessed: <span className="tz-nums">{a.assessed}</span>,
              signedUp: <span className="tz-nums font-semibold">{a.signedUp}</span>,
              revenue: <span className="tz-nums">{euros(a.revenueCents)}</span>,
              cost: (
                <span className="tz-nums">
                  {euros(a.rewardCostCents)}
                  {a.rewardSessions > 0 && <span className="text-faint"> + {a.rewardSessions} ses.</span>}
                </span>
              ),
            },
            sortValues: {
              name: a.name,
              center: a.centerName,
              invited: a.invited,
              assessed: a.assessed,
              signedUp: a.signedUp,
              revenue: a.revenueCents,
              cost: a.rewardCostCents,
            },
          }))}
          emptyTitle="Todavía no ha traído nadie a nadie"
          emptyDescription="En cuanto un socio comparta su enlace y alguien lo use, aparecerá aquí."
        />
      </section>

      {closed.length > 0 && (
        <section className="space-y-3">
          <SectionTitle title="Histórico" subtitle="Pagadas y rechazadas, con quién y cuándo en cada salto." />
          <DataTable columns={REWARD_COLUMNS} rows={closed.map(toRewardRow)} emptyTitle="" emptyDescription="" />
        </section>
      )}

      <section className="space-y-3">
        <SectionTitle
          title="El programa de cada centro"
          subtitle="Lo que se paga por traer a alguien lo decide quien dirige el centro. Si está apagado, no se genera ninguna recompensa."
        />
        <div className="grid lg:grid-cols-2 gap-3">
          {programs.map((p) => (
            <ProgramForm key={p.centerId} config={p.config} centerName={p.centerName} />
          ))}
        </div>
      </section>

      <p className="text-xs text-brand-muted leading-relaxed">
        <b className="text-brand-text-2">Quiénes pueden ser embajadores hoy:</b> {reach.eligible} socios de tus centros
        —{reach.withCode} ya tienen su enlace generado—. De ellos, {reach.importedEligible} llegaron importados de otra
        plataforma. Los importados invitan igual que el resto; donde sí se notan es al revés: de {reach.cancelled}{" "}
        exsocios, {reach.cancelledWithoutDate} no tienen fecha de baja, y si uno de ellos vuelve como referido su
        recompensa se marca para revisión humana en vez de pagarse a ciegas.
      </p>
    </div>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="font-display font-extrabold text-base uppercase tracking-[-.01em] text-brand-text">{title}</h2>
      <p className="text-xs text-brand-muted mt-0.5 max-w-3xl">{subtitle}</p>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-card border border-brand-border bg-white p-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-brand-muted">{label}</div>
      <div className="font-display font-extrabold text-xl text-brand-text tz-nums mt-1">{value}</div>
      {hint && <div className="text-[11px] text-faint mt-0.5">{hint}</div>}
    </div>
  );
}

function euros(cents: number): string {
  return (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

const STATUS_TONE: Record<RewardRow["status"], BadgeTone> = {
  PENDING_VALIDATION: "warning",
  VALIDATED: "trial",
  PAID: "good",
  REJECTED: "neutral",
};

const REWARD_COLUMNS: DataTableColumn[] = [
  { key: "who", header: "Referido", sortable: true },
  { key: "referrer", header: "Lo trajo", sortable: true },
  { key: "center", header: "Centro", sortable: true },
  { key: "reward", header: "Recompensa", sortable: true },
  { key: "status", header: "Estado", sortable: true },
  { key: "trace", header: "Quién y cuándo" },
  { key: "actions", header: "", align: "right" },
];

function toRewardRow(reward: RewardRow): DataTableRow {
  return {
    key: reward.id,
    cells: {
      who: (
        <div>
          <div className="font-semibold text-brand-text">{reward.referredName}</div>
          {reward.reviewRequired && reward.reviewReason && (
            <div className="text-xs text-warning-text mt-0.5 max-w-sm">{reward.reviewReason}</div>
          )}
          {reward.rejectedReason && <div className="text-xs text-faint mt-0.5 max-w-sm">{reward.rejectedReason}</div>}
        </div>
      ),
      referrer: <span className="text-sm text-brand-text-2">{reward.referrerName}</span>,
      center: <span className="text-sm text-brand-text-2">{reward.centerName}</span>,
      reward: (
        <span className="text-sm text-brand-text">
          {reward.amountLabel}
          <span className="text-faint"> · {BENEFICIARY_LABEL[reward.beneficiary].toLowerCase()}</span>
        </span>
      ),
      status: (
        <Badge tone={reward.reviewRequired ? "critical" : STATUS_TONE[reward.status]}>
          {reward.reviewRequired ? "A revisar" : REWARD_STATUS_LABEL[reward.status]}
        </Badge>
      ),
      trace: (
        <span className="text-xs text-faint">
          {reward.reviewedByName && reward.reviewedAt ? `${reward.reviewedByName} · ${date(reward.reviewedAt)}` : "—"}
          {reward.paidByName && reward.paidAt ? ` → ${reward.paidByName} · ${date(reward.paidAt)}` : ""}
        </span>
      ),
      actions: <RewardRowActions id={reward.id} status={reward.status} reviewRequired={reward.reviewRequired} />,
    },
    sortValues: {
      who: reward.referredName,
      referrer: reward.referrerName,
      center: reward.centerName,
      reward: reward.amountCents ?? reward.sessions ?? 0,
      status: reward.status,
    },
  };
}

const AMBASSADOR_COLUMNS: DataTableColumn[] = [
  { key: "name", header: "Embajador", sortable: true },
  { key: "center", header: "Centro", sortable: true },
  { key: "invited", header: "Invitados", sortable: true, align: "right" },
  { key: "assessed", header: "Valoración hecha", sortable: true, align: "right" },
  { key: "signedUp", header: "Altas", sortable: true, align: "right" },
  { key: "revenue", header: "Ingresos", sortable: true, align: "right" },
  { key: "cost", header: "Coste", sortable: true, align: "right" },
];

function date(value: Date): string {
  return value.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "2-digit" });
}
