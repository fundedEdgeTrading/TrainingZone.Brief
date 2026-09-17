import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/guard";
import { requireFeature } from "@/lib/entitlements";
import { canManageMembers } from "@/lib/rbac";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { FLOW_STATUS_HELP } from "@/lib/flows/catalog";
import { flowPanelData, type FlowPanelData, type FlowPanelStep } from "./queries";
import { RefreshGoalButton } from "./refresh-goal-button";
import type { FlowSeedGap } from "@/lib/flows/seeds";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * E14-36 · EL PANEL POR FLUJO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Cuántos entran, cuántos hacen clic y CUÁNTOS CUMPLEN EL OBJETIVO.
 *
 * Y la regla que ordena esta pantalla entera: CADA CIFRA LLEVA SU DEFINICIÓN
 * ESCRITA AL LADO. Un embudo cuyo último paso nadie sabe medir es un embudo
 * decorativo, y uno cuyo último paso solo sabe medir quien lo programó es lo
 * mismo con más pasos. Por eso debajo de cada número va, en texto llano, contra
 * qué dato se ha calculado.
 *
 * NO HAY TASA DE APERTURA. No se mide en fase 1 (D-L3-4): exige un píxel de
 * traza y con él un CMP con «rechazar todo» al mismo nivel visual que «aceptar
 * todo» en el mismo cambio. La pantalla lo dice en vez de callárselo, porque la
 * pregunta se va a hacer — y la respuesta es el clic.
 */
export default async function FlujoPanelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR"]);
  // En la página y no solo en el layout: `rbac-gating.test.ts` exige que toda
  // pantalla bajo una ruta gateada llame a la guarda ella misma.
  await requireFeature("marketing_automatizado");

  // Fuera de ámbito es 404 y no 403: un error que distingue «no existe» de «no
  // es tuyo» cuenta lo que hay en el centro de al lado.
  const data = await flowPanelData(session.user, id);
  if (!data) notFound();

  return (
    <div className="space-y-6" data-testid="flow-panel">
      <PageHeader
        kicker={`Embudo · ${data.flow.name}`}
        description={
          <>
            {data.flow.description || "Sin descripción."} · {data.flow.centerName}
          </>
        }
        actions={
          <div className="flex items-center gap-3">
            <Badge
              tone={data.flow.status === "ACTIVE" ? "good" : data.flow.status === "PAUSED" ? "warning" : "neutral"}
              dot={false}
            >
              <span title={FLOW_STATUS_HELP[data.flow.status]}>{data.flow.statusLabel}</span>
            </Badge>
            {canManageMembers(session.user.role) && data.goalKind && <RefreshGoalButton flowId={data.flow.id} />}
            <Link href={`/flujos/${data.flow.id}`} className="text-[13px] underline text-brand-muted hover:text-brand-ink">
              Volver al flujo
            </Link>
          </div>
        }
      />

      <Embudo data={data} />
      <Pasos steps={data.steps} />
      <SinApertura />
      {data.gaps.length > 0 && <Huecos gaps={data.gaps} />}
    </div>
  );
}

/* ------------------------------------------------------------------------- *
 * El embudo
 * ------------------------------------------------------------------------- */

/**
 * Cuatro peldaños y no tres, y el segundo es el que casi siempre falta.
 *
 * «Entran» y «reciben» NO son el mismo número: entre los dos están el tope
 * semanal, la ventana de silencio, el consentimiento de marketing y el socio sin
 * email. Enseñar solo «entran» haría que un flujo con cuarenta inscritos y tres
 * correos pareciera un flujo con mal porcentaje de clic, cuando lo que pasa es
 * que las reglas frenaron a treinta y siete. Y el porcentaje de clic se calcula
 * sobre los que RECIBIERON, que es el único denominador honesto.
 */
function Embudo({ data }: { data: FlowPanelData }) {
  const { funnel } = data;

  return (
    <section className="bg-brand-card border border-brand-border rounded-card p-4 shadow-card space-y-4" data-testid="flow-panel-embudo">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Peldano
          label="Entran"
          value={funnel.entered}
          definicion="Inscripciones en este flujo, hayan terminado el recorrido o no. Un socio no vuelve a entrar en el mismo flujo hasta 90 días después."
        />
        <Peldano
          label="Reciben el correo"
          value={funnel.emailed}
          porcentaje={porcentaje(funnel.emailed, funnel.entered)}
          definicion="Socios distintos a los que llegó al menos un correo de verdad. Entre «entran» y esto están el tope semanal, la ventana de silencio y el consentimiento de marketing."
        />
        <Peldano
          label="Hacen clic"
          value={funnel.clicked}
          porcentaje={porcentaje(funnel.clicked, funnel.emailed)}
          definicion="Socios distintos que han pulsado el botón del correo. Se cuentan personas, no clics: quien pulsa dos veces sigue siendo uno."
        />
        <Peldano
          destacado
          label={data.goalLabel ?? "Objetivo"}
          value={data.goalMetLive}
          porcentaje={data.goalMetLive === null ? null : porcentaje(data.goalMetLive, funnel.emailed)}
          definicion={
            data.goalKind
              ? (data.goalDefinition ?? "")
              : "Este flujo no declara objetivo, así que el embudo se queda en el clic. Elígelo en el editor del flujo."
          }
        />
      </div>

      {data.goalRationale && (
        <p className="text-[12.5px] text-brand-muted border-t border-brand-border pt-3">
          <strong className="text-brand-ink">Por qué este objetivo:</strong> {data.goalRationale}
        </p>
      )}

      <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-[12px] text-brand-muted border-t border-brand-border pt-3">
        <span className="tz-nums">{data.queued} en cola ahora mismo</span>
        <span className="tz-nums">{data.completed} han recorrido el flujo entero</span>
        {data.cancelled > 0 && <span className="tz-nums">{data.cancelled} salieron antes de tiempo</span>}
        {data.sinCorreoTodavia > 0 && (
          <span className="tz-nums">{data.sinCorreoTodavia} todavía no han recibido nada: no se les puede medir</span>
        )}
        {funnel.sentTest > 0 && (
          <span className="tz-nums">{funnel.sentTest} envíos al buzón de pruebas, que no cuentan en el embudo</span>
        )}
      </div>

      <p className="text-[12px] text-brand-muted">
        El objetivo se recalcula cada vez que se abre esta pantalla, así que lo que ves es de ahora.{" "}
        {data.goalKind &&
          (data.goalSavedAt
            ? `La última vez que alguien guardó la medición fue el ${formatoCorto(data.goalSavedAt)}.`
            : "Nadie ha guardado todavía la medición: pulsa «Guardar la medición» para dejarla escrita en la ficha del flujo.")}
      </p>
    </section>
  );
}

function Peldano({
  label,
  value,
  porcentaje: pct,
  definicion,
  destacado,
}: {
  label: string;
  value: number | null;
  porcentaje?: number | null;
  definicion: string;
  destacado?: boolean;
}) {
  return (
    <div
      className={`rounded-card border p-3 ${destacado ? "border-brand-ink" : "border-brand-border"}`}
      data-testid="flow-panel-peldano"
    >
      <div className="font-display font-bold text-[10px] tracking-[.16em] uppercase text-brand-muted">{label}</div>
      <div className="flex items-baseline gap-2 mt-1">
        <span className="tz-nums text-2xl font-bold">{value === null ? "—" : value}</span>
        {pct !== null && pct !== undefined && <span className="tz-nums text-[12px] text-brand-muted">{pct} %</span>}
      </div>
      {/* LA DEFINICIÓN, EN LA PROPIA PANTALLA. Esto es E14-36 entero. */}
      <p className="text-[12px] text-brand-muted mt-1.5 leading-relaxed">{definicion}</p>
    </div>
  );
}

/** Sin base no hay porcentaje: un 0 % sobre cero envíos no significa nada. */
function porcentaje(parte: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((parte / total) * 100);
}

function formatoCorto(fecha: Date): string {
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(
    fecha
  );
}

/* ------------------------------------------------------------------------- *
 * Paso a paso
 * ------------------------------------------------------------------------- */

/**
 * Dónde se cae la gente, paso a paso.
 *
 * El embudo de arriba contesta «¿sirve este flujo?»; esto contesta «¿qué correo
 * de este flujo sirve?». Son preguntas distintas y la segunda es la accionable:
 * un flujo de tres correos donde el tercero no lo abre nadie no se apaga entero,
 * se le quita el tercero.
 */
function Pasos({ steps }: { steps: FlowPanelStep[] }) {
  if (steps.length === 0) return null;

  return (
    <section className="bg-brand-card border border-brand-border rounded-card p-4 shadow-card" data-testid="flow-panel-pasos">
      <h2 className="font-display font-bold text-[11px] tracking-[.16em] uppercase text-brand-muted">Paso a paso</h2>
      <ul className="mt-3 divide-y divide-brand-border">
        {steps.map((step) => (
          <li key={step.id} className="py-2.5 flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="text-[13px] font-semibold">
                {step.branchLabel} · paso {step.position + 1} · {step.actionLabel}
              </div>
              <div className="text-[12px] text-brand-muted">
                {step.waitDays === 0 ? "Sin espera" : `Espera ${step.waitDays} ${step.waitDays === 1 ? "día" : "días"}`}
                {step.subject && ` · «${step.subject}»`}
                {step.mandaCorreo && ` · ${step.templateLabel}`}
              </div>
            </div>
            {step.mandaCorreo ? (
              <div className="text-[12px] text-brand-muted tz-nums whitespace-nowrap">
                {step.sent} {step.sent === 1 ? "envío" : "envíos"} · {step.clicked} con clic
                {step.sent > 0 && ` (${porcentaje(step.clicked, step.sent)} %)`}
              </div>
            ) : (
              <div className="text-[12px] text-brand-muted whitespace-nowrap">
                No escribe al socio: no gasta cupo ni se mide aquí
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------------- *
 * La pregunta que siempre se hace
 * ------------------------------------------------------------------------- */

function SinApertura() {
  return (
    <section className="rounded-card border border-brand-border bg-brand-card p-4" data-testid="flow-panel-sin-apertura">
      <h2 className="font-display font-bold text-[11px] tracking-[.16em] uppercase text-brand-muted">
        Aquí no hay tasa de apertura
      </h2>
      <p className="mt-2 text-[13px] text-brand-muted leading-relaxed">
        Y no es un olvido. Saber si alguien ABRE un correo obliga a meter dentro una imagen invisible que avise al
        servidor, y eso deja de ser una cookie técnica: haría falta montar un cartel de consentimiento con{" "}
        <strong className="text-brand-ink">«rechazar todo» al mismo nivel que «aceptar todo»</strong> en toda la web, en
        el mismo cambio. Es un módulo entero para una cifra que además engaña —hay clientes de correo que cargan las
        imágenes solos y otros que no las cargan nunca—.
      </p>
      <p className="mt-2 text-[13px] text-brand-muted leading-relaxed">
        <strong className="text-brand-ink">La respuesta es el clic.</strong> El enlace del botón es nuestro, el socio lo
        pulsa a propósito y no hay nada que cargar de fondo: dice más que una apertura y no cuesta un cartel.
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------------- *
 * Lo que este flujo todavía no hace solo
 * ------------------------------------------------------------------------- */

/**
 * Los huecos de la semilla, en pantalla y antes de encender.
 *
 * Es la diferencia entre «este flujo funciona» y «este flujo funciona menos esta
 * parte, que todavía hace una persona». Dirección tiene que poder saberlo antes
 * de darle a Activar, no después del primer correo.
 */
function Huecos({ gaps }: { gaps: FlowSeedGap[] }) {
  return (
    <section className="rounded-card border border-warning bg-warning-bg p-4" data-testid="flow-panel-huecos">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="font-display font-bold text-[11px] tracking-[.16em] uppercase text-warning-text">
          Lo que este flujo todavía no hace solo
        </h2>
        <Badge tone="warning" dot={false}>
          {gaps.length} {gaps.length === 1 ? "hueco" : "huecos"}
        </Badge>
      </div>
      <ul className="mt-3 space-y-3">
        {gaps.map((gap) => (
          <li key={gap.falta} className="text-[13px] text-warning-text leading-relaxed">
            <div className="font-semibold">Falta: {gap.falta}</div>
            <div className="text-[12.5px] opacity-90">Afecta a: {gap.afecta}</div>
            <div className="text-[12.5px] opacity-90">
              <strong>Mientras tanto:</strong> {gap.mientrasTanto}
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[12px] text-warning-text opacity-90">
        Ninguno de estos huecos se tapa inventando un dato. Hasta que se cierren, esa parte del flujo la sigue haciendo
        una persona — y por eso lo que se siembra nace siempre en borrador.
      </p>
    </section>
  );
}
