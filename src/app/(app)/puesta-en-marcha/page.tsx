import Link from "next/link";
import { requireRole } from "@/lib/guard";
import { getSetupChecklist, setupProgress } from "@/lib/setup-checklist";
import { CelebrateOnce } from "@/components/ui/celebrate";

export default async function PuestaEnMarchaPage() {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "HR_MANAGER", "PLATFORM_ADMIN"]);
  const steps = await getSetupChecklist(session.user.orgId);
  const { done, total, complete } = setupProgress(steps);

  return (
    <div className="max-w-3xl">
      <CelebrateOnce
        storageKey={`tz.setup-celebrated.${session.user.orgId}`}
        active={complete}
        toastTitle="Centro puesto en marcha"
        toastDescription="Ya tienes todo lo imprescindible configurado."
      />
      <div className="mb-6">
        <div className="font-display font-bold text-[11px] tracking-[.16em] uppercase text-brand-muted mb-1">
          Configuración inicial
        </div>
        <h1 className="font-display font-extrabold text-2xl uppercase tracking-[-.01em] text-tz-black">
          {complete ? "Todo listo" : "Pon en marcha tu centro"}
        </h1>
        <p className="text-sm text-muted mt-2">
          {complete
            ? "Has completado la configuración. Esta página se queda aquí por si añades otro centro o cambias de tarifas."
            : "Puedes usar la plataforma desde ya. Estos pasos son la ruta más corta para tenerla operativa con tus datos."}
        </p>
      </div>

      <div className="bg-white border border-tz-linen rounded-card p-5 mb-6">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="font-semibold text-tz-black">
            {done} de {total} completados
          </span>
          <span className="text-muted">{Math.round((done / total) * 100)} %</span>
        </div>
        <div className="h-2 bg-tz-sand rounded-pill overflow-hidden">
          {/* El plan §0.6 prohíbe animar `width`: la barra crece con `scaleX`
              y, al completarse, se tiñe con el degradado de logro. */}
          <div
            className="h-full w-full rounded-pill origin-left transition-transform duration-500 ease-spring"
            style={{
              transform: `scaleX(${done / total})`,
              background: complete ? "linear-gradient(90deg,var(--color-good),var(--color-apta-gold))" : "var(--color-tz-black)",
            }}
          />
        </div>
      </div>

      <ol className="space-y-2.5">
        {steps.map((step, i) => (
          <li key={step.id} style={{ animation: `tzFadeUp .45s ${(0.05 + i * 0.05).toFixed(2)}s both` }}>
            <Link
              href={step.href}
              className="flex items-start gap-3.5 bg-white border border-tz-linen rounded-card p-4 no-underline transition-colors duration-150 hover:border-brand-border-hover"
            >
              <span
                aria-hidden="true"
                className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                  step.done ? "bg-tz-black text-tz-bone tz-check-pop" : "bg-tz-sand text-brand-muted"
                }`}
              >
                {step.done && (
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--color-tz-bone)"
                    strokeWidth="3.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 13l4 4L19 7" className="tz-draw" />
                  </svg>
                )}
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-[15px] font-semibold ${step.done ? "text-muted line-through" : "text-tz-black"}`}
                  >
                    {step.label}
                  </span>
                  {step.blocking && !step.done && (
                    <span className="text-[10px] font-bold uppercase tracking-[0.08em] bg-critical-bg text-critical rounded-pill px-2 py-0.5">
                      Necesario
                    </span>
                  )}
                </span>
                <span className="block text-[13px] text-muted mt-0.5">{step.hint}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
