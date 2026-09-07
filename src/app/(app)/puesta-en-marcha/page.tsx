import Link from "next/link";
import { requireRole } from "@/lib/guard";
import { getSetupChecklist, getPublicCenterLinks, setupProgress } from "@/lib/setup-checklist";
import { leadFormPath, membershipPath } from "@/lib/public-center-seo";
import { CopyLink } from "@/components/copy-link";
import { CelebrateOnce } from "@/components/ui/celebrate";

export default async function PuestaEnMarchaPage() {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "HR_MANAGER", "PLATFORM_ADMIN"]);
  const [steps, links] = await Promise.all([
    getSetupChecklist(session.user.orgId),
    getPublicCenterLinks(session.user.orgId),
  ]);
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

      <PublicLinksSection {...links} />
    </div>
  );
}

/**
 * E9-15 · Las URLs públicas de cada centro, con copiar al portapapeles.
 *
 * El paso de la lista de arriba lleva aquí. Se pintan las dos: la de alta de
 * socios (la que se comparte) y la del formulario de leads (la que se embebe en
 * la web del gimnasio). Y se recuerda reclamar la ficha de Google Business
 * Profile con el NAP idéntico, que es la otra mitad del posicionamiento local.
 */
function PublicLinksSection({
  orgSlug,
  centers,
}: {
  orgSlug: string;
  centers: { id: string; name: string; slug: string; publicPage: boolean }[];
}) {
  return (
    <section id="enlaces-publicos" className="mt-8 scroll-mt-24">
      <h2 className="font-display font-extrabold text-lg uppercase tracking-[-.01em] text-tz-black">
        Tus enlaces públicos
      </h2>
      <p className="text-sm text-muted mt-1.5 mb-4">
        Estas son las direcciones que puedes repartir. Funcionan aunque el centro no esté publicado: publicarlo solo
        decide si además aparece en Google.
      </p>

      {centers.length === 0 ? (
        <p className="text-sm text-muted bg-white border border-tz-linen rounded-card p-4">
          En cuanto crees tu primer centro, aquí aparecerán sus dos URLs.
        </p>
      ) : (
        <div className="space-y-3">
          {centers.map((center) => (
            <div key={center.id} className="bg-white border border-tz-linen rounded-card p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-[15px] text-tz-black truncate">{center.name}</span>
                <span
                  className={`shrink-0 inline-flex items-center rounded-pill px-2 py-0.5 text-[10px] font-bold uppercase tracking-[.06em] ${
                    center.publicPage ? "bg-good-bg text-good" : "bg-tz-sand text-brand-muted"
                  }`}
                >
                  {center.publicPage ? "Publicada" : "Sin publicar"}
                </span>
              </div>
              <CopyLink label="Alta de socios" path={membershipPath(orgSlug, center.slug)} />
              <CopyLink label="Formulario de leads (para embeber)" path={leadFormPath(orgSlug, center.slug)} />
              {!center.publicPage && (
                <p className="text-[12px] text-muted">
                  Para que además aparezca en Google, márcala como publicada en{" "}
                  <Link href="/organization" className="underline">
                    Organización → Centros
                  </Link>
                  .
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="text-[12.5px] text-muted leading-relaxed mt-4 bg-tz-bone border border-tz-linen rounded-card p-4">
        <b className="text-tz-black">Reclama tu ficha de Google Business Profile.</b> Es gratis y es la mitad del
        posicionamiento local. El nombre, la dirección y el teléfono tienen que coincidir <b>carácter a carácter</b> con
        los que pongas en la ficha del centro: para Google, «C/ Mayor 1» y «Calle Mayor, 1» son dos negocios distintos.
      </p>
    </section>
  );
}
