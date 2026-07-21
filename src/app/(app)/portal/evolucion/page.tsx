import { redirect } from "next/navigation";
import { requireRole } from "@/lib/guard";
import { getMemberForUser, getMemberEvolution } from "@/lib/portal-queries";
import { CompositionSummary } from "@/app/(app)/members/[id]/composition-summary";
import { BodyCompositionChart } from "@/app/(app)/members/[id]/composition-chart";
import { ProgressComparator } from "@/app/(app)/members/[id]/progress-forms";
import { SingleMetricChart } from "@/components/single-metric-chart";
import { Card } from "@/components/kpi-card";

// RB-PERFIL-004: el socio ve su propio seguimiento de fotos y evolución de composición
// corporal — la misma información que consulta su entrenador en su ficha, en modo lectura.
export default async function PortalEvolutionPage() {
  const session = await requireRole(["MEMBER"]);
  const member = await getMemberForUser(session.user.id);
  if (!member) redirect("/login");

  const evolution = await getMemberEvolution(member.id, session.user.orgId);
  if (!evolution) redirect("/portal");

  const { consentHealth, consentImages, progressEntries, compositionTiles, compositionChartPoints, bodyFatChartPoints, measuredAt } =
    evolution;

  if (!consentHealth && !consentImages) {
    return (
      <div className="max-w-[1100px] mx-auto">
        <div className="text-sm text-muted bg-tz-bone border border-tz-linen rounded-lg p-4">
          Todavía no has firmado el consentimiento de datos de salud ni el de uso de imágenes. En cuanto lo
          firmes en recepción o con tu entrenador, aquí verás tus fotos de evolución y tus métricas de
          composición corporal.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1100px] mx-auto flex flex-col gap-5">
      <div>
        <h1 className="font-display font-extrabold text-2xl uppercase tracking-[-.01em] text-brand-text leading-none">
          Mi evolución
        </h1>
        <p className="text-sm text-brand-muted mt-1.5">Tu seguimiento de fotos y composición corporal, tal y como lo ve tu entrenador.</p>
      </div>

      {!consentImages && consentHealth && (
        <p className="text-xs text-brand-muted -mt-2">
          Sin consentimiento de imágenes: solo se guardan tus métricas (peso, composición), no fotos.
        </p>
      )}

      <CompositionSummary tiles={compositionTiles} measuredAt={measuredAt} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Peso, músculo y grasa" meta="Evolución por toma" delay={0.06}>
          <BodyCompositionChart points={compositionChartPoints} />
        </Card>
        <Card title="% graso" meta="Evolución por toma" delay={0.1}>
          <SingleMetricChart points={bodyFatChartPoints} unit="%" />
        </Card>
      </div>

      {progressEntries.length === 0 ? (
        <p className="text-sm text-muted">Todavía no tienes registros de evolución. Tu entrenador los añade en cada toma.</p>
      ) : (
        <div className="space-y-4">
          {progressEntries.map((entry) => (
            <div key={entry.id} className="border border-tz-linen rounded-xl p-5 bg-brand-card">
              <div className="flex items-center justify-between gap-3 flex-wrap mb-3.5">
                <div className="font-bold text-[15px] text-tz-black flex items-center gap-2">
                  {(entry.measuredAt ?? entry.date).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}
                  {entry.source === "TANITA" && (
                    <span className="rounded-pill bg-tz-black text-tz-bone px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em]">
                      Tanita
                    </span>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap">
                  {entry.weightKg != null && (
                    <span className="rounded-pill bg-tz-sand px-3 py-1 text-xs font-semibold text-text-2 tz-nums">{entry.weightKg} kg</span>
                  )}
                  {entry.bodyFatPct != null && (
                    <span className="rounded-pill bg-tz-sand px-3 py-1 text-xs font-semibold text-text-2 tz-nums">{entry.bodyFatPct} % graso</span>
                  )}
                  {entry.muscleMassKg != null && (
                    <span className="rounded-pill bg-tz-sand px-3 py-1 text-xs font-semibold text-text-2 tz-nums">{entry.muscleMassKg} kg músculo</span>
                  )}
                  {entry.waistCm != null && (
                    <span className="rounded-pill bg-tz-sand px-3 py-1 text-xs font-semibold text-text-2 tz-nums">{entry.waistCm} cm cintura</span>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { url: entry.photoFrontUrl, label: "Frente" },
                  { url: entry.photoSideUrl, label: "Perfil" },
                  { url: entry.photoBackUrl, label: "Espalda" },
                ].map((slot) => (
                  <div key={slot.label}>
                    <div className="h-[200px] rounded-xl bg-tz-bone border border-tz-linen overflow-hidden flex items-center justify-center">
                      {slot.url ? (
                        // eslint-disable-next-line @next/next/no-img-element -- foto de evolución subida por el usuario
                        <img src={slot.url} alt={slot.label} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-xs text-faint">Sin foto</span>
                      )}
                    </div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-brand-muted mt-2 text-center">{slot.label}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <ProgressComparator entries={progressEntries} />
        </div>
      )}
    </div>
  );
}
