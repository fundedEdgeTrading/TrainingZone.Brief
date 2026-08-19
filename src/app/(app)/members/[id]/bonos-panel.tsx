"use client";

import { useState, useTransition } from "react";
import clsx from "clsx";
import { adjustSubscriptionSessions } from "./bonos-actions";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonSpinner } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { SessionBalance } from "@/lib/members-queries";

export type BonoRowData = {
  id: string;
  planName: string;
  planType: string;
  sessionsIncluded: number | null;
  /** null = bono ilimitado (cuota mensual / online), NO "cero sesiones". */
  sessionsRemaining: number | null;
  status: string;
  centerName: string;
  startDateISO: string;
  endDateISO: string | null;
  priceCents: number;
  /** Bono recurrente de Stripe: el saldo local no viaja a Stripe. */
  isRecurring: boolean;
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Activo",
  FROZEN: "Congelado",
  CANCELLED: "Cancelado",
  EXPIRED: "Caducado",
};

const SERVICE_LABEL: Record<string, string> = {
  EP: "Personal Training",
  GROUP: "Grupos",
  ONLINE: "Online",
};

// Las fechas se pintan desde los componentes "YYYY-MM-DD" y no con
// toLocaleDateString: el ICU de Node y el del navegador no coinciden en es-ES y
// rompen la hidratación (ver member-data-panel.tsx).
function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function euros(cents: number) {
  return `${(cents / 100).toFixed(2).replace(".", ",")} €`;
}

export function BonosPanel({
  bonos,
  balances,
  canAdjust,
}: {
  bonos: BonoRowData[];
  balances: SessionBalance[];
  canAdjust: boolean;
}) {
  const vigentes = bonos.filter((b) => b.status === "ACTIVE" || b.status === "FROZEN");
  const historico = bonos.filter((b) => b.status !== "ACTIVE" && b.status !== "FROZEN");

  if (bonos.length === 0) {
    return (
      <p className="text-sm text-muted">
        Este socio no tiene bonos. Añádele uno desde la pestaña «Contratación».
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {balances.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-muted uppercase mb-2">Saldo por modalidad</h4>
          <div className="flex flex-wrap gap-3">
            {balances.map((b) => (
              <div
                key={b.serviceKind}
                className="border border-tz-linen rounded-lg px-4 py-3 bg-tz-bone/40 min-w-[150px]"
              >
                <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-brand-muted">
                  {SERVICE_LABEL[b.serviceKind] ?? b.serviceKind}
                </div>
                <div className="font-display font-extrabold text-2xl text-tz-black tz-nums leading-tight">
                  {b.unlimited ? "∞" : b.remaining}
                </div>
                <div className="text-xs text-brand-muted">
                  {b.unlimited
                    ? "Sesiones ilimitadas"
                    : b.total != null
                      ? `de ${b.total} contratadas`
                      : "sesiones disponibles"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-muted uppercase">Bonos vigentes</h4>
        {vigentes.length === 0 ? (
          <p className="text-sm text-muted">Este socio no tiene ningún bono activo ni congelado.</p>
        ) : (
          vigentes.map((b) => (
            // La clave incluye el saldo del servidor: cuando la acción revalida
            // y llega un valor nuevo, la fila se remonta y el borrador local se
            // descarta solo, sin useEffect de sincronización.
            <BonoCard key={`${b.id}:${b.sessionsRemaining}`} bono={b} canAdjust={canAdjust} />
          ))
        )}
      </div>

      {historico.length > 0 && (
        <details className="border-t border-tz-sand pt-3">
          <summary className="text-xs font-semibold text-muted uppercase cursor-pointer">
            Histórico de bonos ({historico.length})
          </summary>
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-sm">
              <thead className="text-xs text-faint text-left">
                <tr>
                  <th className="pb-2">Producto</th>
                  <th className="pb-2">Centro</th>
                  <th className="pb-2">Inicio</th>
                  <th className="pb-2">Fin</th>
                  <th className="pb-2">Estado</th>
                  <th className="pb-2">Sesiones al cierre</th>
                </tr>
              </thead>
              <tbody>
                {historico.map((b) => (
                  <tr key={b.id} className="border-t border-tz-sand">
                    <td className="py-2">{b.planName}</td>
                    <td className="py-2 text-text-2">{b.centerName}</td>
                    <td className="py-2">{fmtDate(b.startDateISO)}</td>
                    <td className="py-2">{b.endDateISO ? fmtDate(b.endDateISO) : "—"}</td>
                    <td className="py-2 text-text-2">{STATUS_LABEL[b.status] ?? b.status}</td>
                    <td className="py-2 tz-nums">
                      {b.sessionsRemaining == null ? "Ilimitadas" : b.sessionsRemaining}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

function BonoCard({ bono, canAdjust }: { bono: BonoRowData; canAdjust: boolean }) {
  const server = bono.sessionsRemaining;
  const [draft, setDraft] = useState<number>(server ?? 0);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const unlimited = server == null;
  const delta = unlimited ? 0 : draft - server;
  const editable = canAdjust && !unlimited;

  function save() {
    if (delta === 0) return;
    startTransition(async () => {
      const result = await adjustSubscriptionSessions(bono.id, delta);
      if (result.ok) toast.success("Saldo actualizado.");
      else {
        toast.error(result.error);
        setDraft(server ?? 0);
      }
    });
  }

  return (
    <div className="border border-tz-linen rounded-lg p-4 space-y-3 bg-tz-bone/40">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h5 className="text-sm font-semibold text-brand-text">{bono.planName}</h5>
        <div className="flex items-center gap-2">
          <Badge tone="neutral" dot={false}>
            {bono.centerName}
          </Badge>
          <Badge tone={bono.status === "ACTIVE" ? "good" : "warning"}>
            {STATUS_LABEL[bono.status] ?? bono.status}
          </Badge>
        </div>
      </div>

      <p className="text-xs text-brand-muted">
        Desde el {fmtDate(bono.startDateISO)}
        {bono.endDateISO ? ` hasta el ${fmtDate(bono.endDateISO)}` : ""} · {euros(bono.priceCents)}
      </p>

      {unlimited ? (
        <div className="flex items-center gap-2 flex-wrap">
          <Badge tone="good" dot={false}>
            Ilimitado
          </Badge>
          <span className="text-xs text-brand-muted">
            Cuota sin bolsa de sesiones: no hay saldo que ajustar.
          </span>
        </div>
      ) : (
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <span className="block text-[11px] font-bold uppercase tracking-[0.08em] text-brand-muted mb-1.5">
              Sesiones restantes
            </span>
            {editable ? (
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  aria-label="Restar una sesión"
                  disabled={pending || draft <= 0}
                  onClick={() => setDraft((v) => Math.max(0, v - 1))}
                >
                  −
                </Button>
                <input
                  type="number"
                  min={0}
                  max={999}
                  inputMode="numeric"
                  aria-label="Sesiones restantes"
                  className="w-20 rounded-control border border-brand-border bg-white px-3 py-1.5 text-sm text-brand-text text-center tz-nums focus:border-brand-ink focus:ring-2 focus:ring-tz-black/10 focus:outline-none"
                  value={draft}
                  disabled={pending}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setDraft(Number.isFinite(n) ? Math.max(0, Math.min(999, Math.trunc(n))) : 0);
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  aria-label="Sumar una sesión"
                  disabled={pending || draft >= 999}
                  onClick={() => setDraft((v) => Math.min(999, v + 1))}
                >
                  +
                </Button>
              </div>
            ) : (
              <span className="font-display font-extrabold text-2xl text-tz-black tz-nums">{server}</span>
            )}
          </div>

          {bono.sessionsIncluded != null && (
            <span className="text-xs text-brand-muted pb-2">de {bono.sessionsIncluded} incluidas</span>
          )}

          {delta !== 0 && (
            <span
              className={clsx(
                "text-xs font-bold tz-nums pb-2",
                delta > 0 ? "text-good" : "text-critical"
              )}
            >
              {delta > 0 ? `+${delta}` : delta}
            </span>
          )}

          {editable && (
            <div className="flex items-center gap-2 pb-0.5 ml-auto">
              {delta !== 0 && (
                <button
                  type="button"
                  className="text-xs text-faint"
                  disabled={pending}
                  onClick={() => setDraft(server ?? 0)}
                >
                  Deshacer
                </button>
              )}
              <Button type="button" variant="secondary" size="sm" disabled={pending || delta === 0} onClick={save}>
                {pending && <ButtonSpinner />}
                Guardar
              </Button>
            </div>
          )}
        </div>
      )}

      {editable && bono.isRecurring && (
        <p className="text-xs text-brand-muted">
          Bono recurrente de Stripe: el ajuste es un contador local y no se envía a Stripe.
        </p>
      )}
    </div>
  );
}
