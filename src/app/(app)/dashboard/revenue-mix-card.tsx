/**
 * M4 · «De dónde viene el dinero» (E14-17).
 *
 * TRES LÍNEAS DE CAJA —alta nueva, renovación y sin suscripción— y, APARTE y
 * rotulada como lo que es, la BAJA: la cuota mensual que se va con quien se fue
 * este periodo, en negativo. La baja NO es caja, no está en Stripe y no se suma
 * a los ingresos (D-L3-3), y por eso está debajo del filete y no dentro de la
 * lista: si compartiera lista, alguien la sumaría.
 *
 * M1 monta esta card en `panels.tsx`; este fichero es de M4 y `panels.tsx` no se
 * toca desde aquí. Por eso `RevenueMixProps` se declara aquí en vez de importar
 * `PanelProps` de `panels.tsx`: la card es la que se importa, y al revés se
 * cerraría el ciclo.
 */
import { getRevenueMix } from "@/lib/revenue-mix";
import { SERIES } from "@/lib/chart-colors";
import type { DashboardRange } from "@/lib/dashboard-range";

import { PanelCard, BarRow, LegendSwatch } from "./panel-card";

/** Mismo ámbito que el resto de paneles: `{ orgId, centerId, range }`. */
export type RevenueMixProps = { orgId: string; centerId: string | null; range: DashboardRange };

const eur = (cents: number) =>
  (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

/** Dorado el dinero nuevo, tinta el que ya estaba, arena lo que no es cuota. */
const CONCEPT_COLOR = {
  ALTA: SERIES.gold,
  RENOVACION: SERIES.ink,
  SIN_SUSCRIPCION: SERIES.sand,
} as const;

export async function RevenueMixPanel(props: RevenueMixProps) {
  const mix = await getRevenueMix(props.orgId, { centerId: props.centerId, range: props.range });
  const max = Math.max(1, ...mix.lines.map((l) => l.amountCents));
  const sinSuscripcion = mix.lines.find((l) => l.concept === "SIN_SUSCRIPCION");
  const lost = mix.churn.lostMonthlyCents; // negativo, o 0

  return (
    <PanelCard
      title="De dónde viene el dinero"
      meta={mix.scopeLabel.replace(/^de[l]? /, "")}
      delay={0.3}
      action={<LegendSwatch color={SERIES.critical} label="ingreso perdido" />}
      footer={
        <>
          {mix.cashTotalCents > 0 ? (
            <>
              <strong className="text-brand-text">{eur(mix.cashTotalCents)}</strong> cobrados {mix.scopeLabel}, la
              misma cifra que el KPI de ingresos: las tres líneas son un reparto, no otro total.
              {sinSuscripcion && sinSuscripcion.pct >= 20 && (
                <>
                  {" "}
                  Ojo al {Math.round(sinSuscripcion.pct)} % sin suscripción: esa parte del mes no se renueva sola y hay
                  que volver a venderla cada vez.
                </>
              )}
            </>
          ) : (
            <>Sin cobros {mix.scopeLabel} todavía.</>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-2.5">
        {mix.lines.map((line, i) => (
          <BarRow
            key={line.concept}
            label={line.label}
            labelWidth={116}
            pct={(line.amountCents / max) * 100}
            color={CONCEPT_COLOR[line.concept]}
            value={eur(line.amountCents)}
            valueWidth={72}
            height={20}
            rounded="rounded-r-[7px]"
            delay={0.2 + i * 0.06}
          />
        ))}
      </div>

      {/* La baja, APARTE. No es caja: ni suma, ni resta, ni está en Stripe. */}
      <div className="border-t border-tz-sand mt-[18px] pt-3.5">
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex flex-col">
            <span className="text-[12.5px] font-semibold text-brand-text-2">Baja · cuota mensual perdida</span>
            <span className="text-[11px] text-brand-muted leading-[1.5]">
              No es caja ni está en Stripe: es lo que deja de entrar cada mes a partir de ahora.
            </span>
          </div>
          <span className="font-display font-bold text-xl tabular-nums shrink-0" style={{ color: SERIES.critical }}>
            {lost === 0 ? "0 €" : eur(lost)}
          </span>
        </div>
        <p className="text-[11px] text-brand-muted leading-[1.5] mt-2">
          {mix.churn.members === 0 ? (
            <>Nadie ha causado baja {mix.scopeLabel}.</>
          ) : (
            <>
              {mix.churn.members} {mix.churn.members === 1 ? "baja" : "bajas"} {mix.scopeLabel}
              {mix.churn.membersWithoutFee > 0 && (
                <>
                  , {mix.churn.membersWithoutFee} de ellas sin cuota recurrente (solo bonos): esas no restan cuota,
                  pero tampoco la traían
                </>
              )}
              .
            </>
          )}
        </p>
      </div>
    </PanelCard>
  );
}
