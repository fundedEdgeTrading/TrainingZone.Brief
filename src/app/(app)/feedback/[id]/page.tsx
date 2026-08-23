import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/guard";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/kpi-card";
import { Badge } from "@/components/ui/badge";
import {
  getMemberFeedbackDetail,
  CATEGORY_LABEL,
  CATEGORY_TONE,
  DIMENSION_LABEL,
  type AlignmentCategory,
} from "@/lib/feedback-queries";
import type { BadgeTone } from "@/components/ui/badge";
import { AlignmentTrack } from "../alignment-track";
import { RequestFeedbackButton, FeedbackDetailActions } from "../feedback-actions";

function initials(first: string, last: string) {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
}

function daysAgo(date: Date) {
  const days = Math.round((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "hoy";
  if (days === 1) return "hace 1 día";
  return `hace ${days} días`;
}

function interpretation(cat: AlignmentCategory, hasClient: boolean, hasDebrief: boolean, clientSat: number | null | undefined) {
  if (cat === "sin_feedback") {
    if (!hasClient && !hasDebrief) return "Todavía no hay feedback de ninguno de los dos lados. Usa \"Solicitar feedback\" para abrir el ciclo.";
    if (!hasClient) return "El entrenador ya ha dejado su debrief, pero el socio todavía no ha respondido.";
    return "El socio ya ha respondido, pero su entrenador todavía no ha dejado el debrief de este periodo.";
  }
  if (cat === "ciego")
    return "Punto ciego: el entrenador percibe al socio bastante más satisfecho de lo que realmente está. Riesgo de baja que puede pasar desapercibido.";
  if (cat === "cliente_positivo")
    return "El socio valora la experiencia por encima de lo que estima el entrenador. Hay margen para reforzar la relación y capitalizar su satisfacción.";
  if (cat === "alineado" && clientSat != null && clientSat < 5)
    return "Cliente y entrenador coinciden en una valoración baja. Caso de atención prioritaria.";
  return "Percepciones alineadas. Relación saludable, sin señales de alarma.";
}

export default async function FeedbackDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR"]);
  const { id } = await params;

  const member = await getMemberFeedbackDetail(session.user.orgId, id);
  if (!member) notFound();

  const text = interpretation(member.cat, member.client != null, member.debrief != null, member.client?.sat);

  return (
    <div className="tz-page space-y-4">
      <Link href="/feedback" className="text-[13px] font-semibold text-brand-text-2 hover:underline w-fit inline-block">
        ← Volver al listado
      </Link>

      <PageHeader
        description={
          <span className="flex items-center gap-3 flex-wrap">
            <span
              className="rounded-full bg-trial-bg text-trial font-bold text-base inline-flex items-center justify-center shrink-0"
              style={{ width: 52, height: 52 }}
            >
              {initials(member.firstName, member.lastName)}
            </span>
            <span>
              <span className="block font-display font-extrabold text-[22px] text-brand-text">
                {member.firstName} {member.lastName}
              </span>
              <span className="block text-[13px] text-brand-muted">
                {member.planName ?? "Sin plan"} · {member.trainerName ?? "Sin entrenador"} · {member.centerName}
              </span>
            </span>
            <Badge tone={CATEGORY_TONE[member.cat]}>{CATEGORY_LABEL[member.cat]}</Badge>
          </span>
        }
      />

      <Card title="Resumen">
        <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-8 flex-wrap">
          <div className="flex items-start gap-6 sm:contents">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[.1em] text-brand-muted mb-1">Cliente</div>
              <div className={`font-display font-extrabold text-[28px] sm:text-[34px] tabular-nums leading-none ${member.clientAvg != null ? "text-brand-text" : "text-brand-border-hover"}`}>
                {member.clientAvg != null ? member.clientAvg.toFixed(1) : "—"}
                <span className="text-sm text-faint font-semibold">/10</span>
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[.1em] text-brand-muted mb-1">Entrenador</div>
              <div
                className="font-display font-extrabold text-[28px] sm:text-[34px] tabular-nums leading-none"
                style={{ color: member.trainerAvg != null ? "var(--color-gold)" : "var(--color-brand-border-hover)" }}
              >
                {member.trainerAvg != null ? member.trainerAvg.toFixed(1) : "—"}
                <span className="text-sm text-faint font-semibold">/10</span>
              </div>
            </div>
          </div>
          <p className="text-sm text-brand-text-2 w-full sm:flex-1 sm:min-w-[220px] pt-1">{text}</p>
        </div>
      </Card>

      <Card title="Desglose por dimensión">
        <div className="space-y-3">
          {DIMENSION_LABEL.map(({ key, label }) => {
            const clientV = member.client ? member.client[key] : null;
            const trainerV = member.debrief ? member.debrief[key] : null;
            const delta = clientV != null && trainerV != null ? trainerV - clientV : null;
            const deltaTone: BadgeTone = delta == null ? "neutral" : delta >= 1.5 ? "critical" : delta <= -1.5 ? "trial" : "good";
            return (
              <div key={key} className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
                <span className="text-[13px] font-semibold text-brand-text-2 sm:w-[116px] sm:shrink-0">
                  {label}
                </span>
                <div className="flex items-center gap-2 sm:gap-3 sm:flex-1 min-w-0">
                  <span className={`text-sm font-bold tabular-nums text-right shrink-0 ${clientV != null ? "text-brand-text" : "text-brand-border-hover"}`} style={{ width: 28 }}>
                    {clientV != null ? clientV : "—"}
                  </span>
                  <AlignmentTrack clientValue={clientV} trainerValue={trainerV} cat={member.cat} />
                  <span className={`text-sm font-bold tabular-nums shrink-0 ${trainerV == null ? "text-brand-border-hover" : ""}`} style={{ color: trainerV != null ? "var(--color-gold)" : undefined, width: 28 }}>
                    {trainerV ?? "—"}
                  </span>
                  <Badge tone={deltaTone} className="justify-center shrink-0" dot={false}>
                    <span style={{ minWidth: 24, display: "inline-block", textAlign: "center" }}>
                      {delta == null ? "—" : `${delta >= 0 ? "+" : ""}${delta}`}
                    </span>
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="relative bg-brand-card border border-brand-border rounded-card shadow-card overflow-hidden pl-[19px]">
          <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-brand-ink" />
          <div className="p-5">
            <div className="flex items-baseline justify-between gap-2 mb-3">
              <h3 className="font-display font-extrabold text-base uppercase text-brand-text">Voz del cliente</h3>
              {member.client && <span className="text-xs text-brand-muted">{daysAgo(member.client.submittedAt)}</span>}
            </div>
            {member.client ? (
              <p className="text-[15px] italic text-brand-text">&ldquo;{member.client.comment ?? "Sin comentario adicional."}&rdquo;</p>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-brand-muted">Este socio todavía no ha enviado su feedback.</p>
                <RequestFeedbackButton memberId={member.memberId} />
              </div>
            )}
          </div>
        </div>

        <div className="relative bg-brand-card border border-brand-border rounded-card shadow-card overflow-hidden pl-[19px]">
          <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-apta-gold" />
          <div className="p-5">
            <div className="flex items-baseline justify-between gap-2 mb-3">
              <h3 className="font-display font-extrabold text-base uppercase text-brand-text">Debrief del entrenador</h3>
              {member.debrief && <span className="text-xs text-brand-muted">{daysAgo(member.debrief.debriefAt)}</span>}
            </div>
            {member.debrief ? (
              <>
                <p className="text-[15px] text-brand-text">{member.debrief.note}</p>
                <p className="text-xs font-semibold text-brand-muted mt-2">— {member.debrief.trainerName}</p>
                {member.debrief.reviewedAt && (
                  <Badge tone="good" className="mt-2.5">
                    Revisado {daysAgo(member.debrief.reviewedAt)}
                  </Badge>
                )}
              </>
            ) : (
              <p className="text-sm text-brand-muted">
                {member.trainerName ?? "Su entrenador"} todavía no ha dejado el debrief de este periodo.
              </p>
            )}
          </div>
        </div>
      </div>

      {member.client && member.debrief && member.periodMismatch && (
        <div className="bg-warning-bg border border-warning-bg rounded-xl px-4 py-3 text-[13px] text-warning">
          Ojo: el feedback del cliente es de <b>{member.client.periodKey}</b> y el debrief del entrenador de{" "}
          <b>{member.debrief.periodKey}</b> — no son del mismo periodo, la comparación es orientativa.
        </div>
      )}

      <FeedbackDetailActions memberId={member.memberId} canReview={member.debrief != null} alreadyReviewed={!!member.debrief?.reviewedAt} />
    </div>
  );
}
