import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/guard";
import {
  getMemberForUser,
  getMemberProgress,
  getMemberHealthTransparency,
  getMemberMonthlyActivity,
} from "@/lib/portal-queries";
import { getAnnouncementsForMember, registerAnnouncementViews } from "@/lib/announcements-queries";
import { KpiCard, Card } from "@/components/kpi-card";
import ActivityChart from "./activity-chart";
import { AnnouncementsBanner } from "./announcements-banner";

const LIGHT_COLOR: Record<string, string> = { RED: "#8A3420", AMBER: "#8A5A12", GREEN: "#4B5A22" };

export default async function PortalHomePage() {
  const session = await requireRole(["MEMBER"]);
  const member = await getMemberForUser(session.user.id);
  if (!member) redirect("/login");

  const [progress, adaptations, activity, announcements] = await Promise.all([
    getMemberProgress(member.id),
    getMemberHealthTransparency(member.id, session.user.orgId),
    getMemberMonthlyActivity(member.id),
    getAnnouncementsForMember({
      id: member.id,
      orgId: member.orgId,
      primaryCenterId: member.primaryCenterId,
      state: member.state,
    }),
  ]);

  // RB-ANUN-003: contabilizar como vistos los anuncios que se le muestran.
  await registerAnnouncementViews(member.id, announcements.map((a) => a.id));

  const activeSub = member.subscriptions[0];

  return (
    <div className="max-w-[1120px] mx-auto flex flex-col gap-[18px]">
      <div
        className={`grid gap-4 tz-fade-up ${
          announcements.length > 0 ? "grid-cols-1 md:grid-cols-[1.6fr_1fr]" : "grid-cols-1"
        }`}
      >
        <AnnouncementsBanner announcements={announcements} />

        <div className="relative overflow-hidden bg-brand-ink rounded-[18px] p-[26px] h-[272px] flex flex-col justify-between border border-brand-border-dark box-border">
          <div className="absolute -right-[54px] -bottom-[54px] w-[184px] h-[184px] rounded-full bg-brand-ink-soft" />
          <div className="relative z-10">
            <div className="font-display font-bold text-[11px] tracking-[.16em] uppercase text-tz-linen">
              Bienvenida de vuelta
            </div>
            <div className="font-display font-extrabold text-[34px] leading-none text-white mt-2 uppercase tracking-[-.01em]">
              Hola, {member.firstName}
            </div>
            <p className="text-[13px] text-brand-muted-2 mt-3 leading-[1.55]">
              Llevas <b className="text-white">{progress.totalThisMonth} sesiones</b> este mes.{" "}
              {progress.totalThisMonth > 0 ? "¡Sigue con la racha!" : "Reserva tu próxima clase y arranca el mes."}
            </p>
          </div>
          <Link
            href="/portal/agenda"
            className="relative z-10 self-start bg-tz-bone text-tz-black rounded-[10px] px-5 py-3 font-display font-extrabold text-sm uppercase tracking-[.03em] transition-[transform,box-shadow] duration-[180ms] hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-10px_rgba(29,29,28,.35)]"
          >
            Reservar clase →
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <KpiCard label="Sesiones este mes" value={String(progress.totalThisMonth)} size="lg" delay={0.06} />
        <KpiCard label="Sesiones este año" value={String(progress.totalThisYear)} tone="good" size="lg" delay={0.1} />
        <KpiCard label="Total histórico" value={String(progress.totalAllTime)} hint="¡sigue así!" size="lg" delay={0.14} />
        <KpiCard
          label="Tu mejor mes"
          value={progress.bestMonthCount ? String(progress.bestMonthCount) : "—"}
          hint={progress.bestMonthLabel || undefined}
          tone="accent"
          size="lg"
          delay={0.18}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-4">
        <Card title="Tu actividad" meta="Sesiones · últimos 6 meses" delay={0.12}>
          <ActivityChart data={activity} />
        </Card>

        <Card title="Tu plan" delay={0.12}>
          {activeSub ? (
            <div className="bg-brand-ink rounded-xl px-[18px] py-4">
              <div className="font-display font-extrabold text-xl text-tz-bone uppercase">
                {activeSub.plan.name}
              </div>
              <div className="text-[13px] text-brand-muted-2 mt-1">
                Activo desde el {activeSub.startDate.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}
              </div>
              <div className="inline-flex items-center gap-1.5 mt-3 bg-brand-ink-circle rounded-full px-[11px] py-[5px] text-xs font-semibold text-white">
                <span className="w-[7px] h-[7px] rounded-full bg-pay-ok" />
                Al corriente de pago
              </div>
            </div>
          ) : (
            <p className="text-sm text-brand-muted">Sin plan activo.</p>
          )}
        </Card>
      </div>

      <Card title="Transparencia · lo que adapta tu entrenador" delay={0.18}>
        <p className="text-[13px] text-brand-muted -mt-3 mb-4">
          A partir de la información de salud que has consentido compartir.
        </p>
        {adaptations.length === 0 ? (
          <p className="text-sm text-brand-muted">
            No tienes ninguna condición de salud activa registrada ahora mismo.
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {adaptations.map((a, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-3.5 bg-brand-subtle border border-[#eeede6] rounded-xl">
                <span
                  className="w-3.5 h-3.5 rounded-full shrink-0 mt-[3px]"
                  style={{ background: LIGHT_COLOR[a.light], boxShadow: `0 0 0 4px ${LIGHT_COLOR[a.light]}22` }}
                />
                <div>
                  <div className="text-sm font-bold text-brand-text">{a.blockArea}</div>
                  {a.adaptation && <div className="text-[13px] text-[#77776f] mt-0.5">{a.adaptation}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-brand-muted-2 mt-3.5 leading-relaxed">
          Puedes solicitar el detalle completo o revocar el consentimiento en cualquier momento en recepción.
        </p>
      </Card>
    </div>
  );
}
