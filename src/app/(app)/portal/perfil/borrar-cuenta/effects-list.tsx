import type { AccountDeletionDisclosure } from "@/lib/account-deletion";

/**
 * E5-15 · Qué se borra, qué se conserva y con qué base legal.
 *
 * Se pinta a partir del plan de supresión (E10-09), que es el MISMO que ejecuta
 * el borrado y el mismo que ve dirección. No hay aquí ni un rótulo ni un plazo
 * escrito a mano: si el texto pudiera divergir de lo que ocurre, volveríamos al
 * fallo original — un diálogo que describe un tratamiento que no pasa.
 */

const ACTION_LABEL: Record<AccountDeletionDisclosure["effects"][number]["action"], string> = {
  DELETE: "Se borra",
  DISSOCIATE: "Se conserva sin tu nombre",
  ANONYMIZE: "Se conserva desligado de ti",
};

const ACTION_CLASS: Record<AccountDeletionDisclosure["effects"][number]["action"], string> = {
  DELETE: "bg-tz-bone text-brand-text border-brand-border",
  DISSOCIATE: "bg-warning-bg text-warning-text border-warning-text/20",
  ANONYMIZE: "bg-warning-bg text-warning-text border-warning-text/20",
};

export function DeletionEffectsList({ disclosure }: { disclosure: AccountDeletionDisclosure }) {
  return (
    <div className="flex flex-col gap-3">
      {disclosure.effects.map((effect) => (
        <div key={effect.key} className="border-t border-brand-border pt-3 first:border-t-0 first:pt-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-display font-extrabold text-sm uppercase tracking-[.01em] text-brand-text">
              {effect.label}
            </span>
            <span
              className={`rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-[.06em] ${ACTION_CLASS[effect.action]}`}
            >
              {ACTION_LABEL[effect.action]}
            </span>
            {effect.count !== null && <span className="text-[12px] text-brand-muted">{effect.count} registros</span>}
          </div>
          <p className="text-[13px] text-brand-text-2 leading-relaxed mt-1">{effect.detail}</p>
          {effect.legalBasis && <p className="text-[12px] text-brand-muted mt-1">Base legal: {effect.legalBasis}.</p>}
        </div>
      ))}
    </div>
  );
}

/**
 * Los plazos NO se escriben aquí: salen del motor de conservación (E10-08), que
 * a su vez los toma de `RetentionPolicy` o de la tabla de partida. Y salen con
 * su advertencia: `docs/legal/03-PLAZOS-CONSERVACION.md` es un borrador marcado
 * ⟦PENDIENTE: validación — 00.C.3⟧, así que la cifra se enseña como lo que es
 * —la propuesta de anclaje vigente en el centro—, no como un dictamen cerrado.
 */
export function RetentionNote({ disclosure }: { disclosure: AccountDeletionDisclosure }) {
  const years = (days: number) => Math.round((days / 365) * 10) / 10;
  return (
    <p className="text-[12px] text-brand-muted leading-relaxed">
      Plazos que aplica tu centro hoy: <strong>{disclosure.retention.billingDays} días</strong> (
      {years(disclosure.retention.billingDays)} años) para el contrato y los cobros, y{" "}
      <strong>{disclosure.retention.healthDays} días</strong> ({years(disclosure.retention.healthDays)} años) para los
      datos de salud, contados desde el fin de la relación.{" "}
      {disclosure.retention.pendingLegalReview && (
        <span>
          ⟦PENDIENTE: validación jurídica de los plazos — decisión D-C3⟧. Son la propuesta de anclaje vigente, no un
          dictamen; si el despacho los ajusta, esta pantalla cambia sola.
        </span>
      )}
    </p>
  );
}
