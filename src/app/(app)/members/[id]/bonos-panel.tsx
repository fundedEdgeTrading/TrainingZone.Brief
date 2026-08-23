"use client";

import { useState, useTransition } from "react";
import clsx from "clsx";
import { adjustSubscriptionSessions } from "./bonos-actions";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonSpinner } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { bonoUsage, type SessionBalance } from "@/lib/session-balance";

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

/**
 * Acciones de gestión del bono (congelar, precio, baja...). Llegan ya
 * renderizadas desde el server component porque son los formularios de
 * `subscription-forms.tsx` de siempre: aquí solo se despliegan bajo su botón.
 */
export type BonoAction = {
  key: string;
  label: string;
  tone?: "default" | "danger";
  content: React.ReactNode;
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
  actionsById = {},
}: {
  bonos: BonoRowData[];
  balances: SessionBalance[];
  canAdjust: boolean;
  actionsById?: Record<string, BonoAction[]>;
}) {
  // Qué acción tiene abierta cada bono. Vive aquí y no en la tarjeta porque la
  // tarjeta se remonta cuando llega un saldo nuevo del servidor (ver la `key`
  // de abajo): si el estado viviera dentro, guardar el saldo cerraría el
  // desplegable justo cuando se quiere ver el resultado.
  const [openByBono, setOpenByBono] = useState<Record<string, string | null>>({});

  const vigentes = bonos.filter((b) => b.status === "ACTIVE" || b.status === "FROZEN");
  const historico = bonos.filter((b) => b.status !== "ACTIVE" && b.status !== "FROZEN");

  if (bonos.length === 0) {
    return (
      <p className="text-sm text-brand-muted">
        Este socio no tiene bonos. Añádele uno con «Añadir bono», arriba a la derecha de esta sección.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {balances.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          {balances.map((b) => (
            <div key={b.serviceKind} className="border border-brand-border rounded-xl p-[13px_14px]">
              <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-brand-muted">
                {SERVICE_LABEL[b.serviceKind] ?? b.serviceKind}
              </div>
              <div className="font-display font-extrabold text-[22px] text-brand-text tz-nums leading-tight mt-1">
                {b.unlimited ? "∞" : b.remaining}
              </div>
              <div className="text-[11px] text-brand-faint">
                {b.unlimited
                  ? "Sesiones ilimitadas"
                  : b.total != null
                    ? `de ${b.total} del bono`
                    : "sesiones disponibles"}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <h3 className="text-[13px] font-bold uppercase tracking-[.08em] text-brand-text">Bonos vigentes</h3>
        {vigentes.length === 0 ? (
          <p className="text-sm text-brand-muted">Este socio no tiene ningún bono activo ni congelado.</p>
        ) : (
          vigentes.map((b) => (
            // La clave incluye el saldo del servidor: cuando la acción revalida
            // y llega un valor nuevo, la tarjeta se remonta y el borrador local
            // se descarta solo, sin useEffect de sincronización.
            <BonoCard
              key={`${b.id}:${b.sessionsRemaining}`}
              bono={b}
              canAdjust={canAdjust}
              actions={actionsById[b.id] ?? []}
              open={openByBono[b.id] ?? null}
              onOpenChange={(key) => setOpenByBono((prev) => ({ ...prev, [b.id]: key }))}
            />
          ))
        )}
      </div>

      {historico.length > 0 && (
        <details className="border-t border-brand-subtle-2 pt-3">
          <summary className="text-[11px] font-bold uppercase tracking-[.08em] text-brand-muted cursor-pointer">
            Histórico de bonos ({historico.length})
          </summary>
          <table className="tz-stack-table w-full text-sm mt-3">
            <thead className="text-[11px] font-bold uppercase tracking-[.08em] text-brand-muted text-left">
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
                <tr key={b.id} className="border-t border-brand-subtle-2">
                  <td className="py-2" data-label="">
                    {b.planName}
                  </td>
                  <td className="py-2 text-text-2" data-label="Centro">
                    {b.centerName}
                  </td>
                  <td className="py-2 tz-nums" data-label="Inicio">
                    {fmtDate(b.startDateISO)}
                  </td>
                  <td className="py-2 tz-nums" data-label="Fin">
                    {b.endDateISO ? fmtDate(b.endDateISO) : "—"}
                  </td>
                  <td className="py-2 text-text-2" data-label="Estado">
                    {STATUS_LABEL[b.status] ?? b.status}
                  </td>
                  <td className="py-2 tz-nums" data-label="Sesiones al cierre">
                    {b.sessionsRemaining == null ? "Ilimitadas" : b.sessionsRemaining}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}

function BonoCard({
  bono,
  canAdjust,
  actions,
  open,
  onOpenChange,
}: {
  bono: BonoRowData;
  canAdjust: boolean;
  actions: BonoAction[];
  open: string | null;
  onOpenChange: (key: string | null) => void;
}) {
  const server = bono.sessionsRemaining;
  const [draft, setDraft] = useState<number>(server ?? 0);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const unlimited = server == null;
  const delta = unlimited ? 0 : draft - server;
  const editable = canAdjust && !unlimited;
  // `included` es lo que trae el plan contratado (lo que se enseña al ajustar
  // el saldo); `usage.total` es la capacidad real de ESTE bono, que nunca queda
  // por debajo del saldo — si no, el titular decía "13 / 12" en cuanto alguien
  // le había sumado sesiones a mano.
  const included = bono.sessionsIncluded;
  const usage = bonoUsage(included, server);
  // Barra de consumo: se anima con scaleX (nunca `width`, plan UX §4/§0.6).
  const ratio = !usage || usage.total === 0 ? 1 : usage.remaining / usage.total;

  const items: BonoAction[] = [
    ...actions,
    ...(editable
      ? [
          {
            key: "ajustar",
            label: "Ajustar sesiones",
            content: (
              <div className="flex items-end gap-3 flex-wrap">
                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-[0.1em] text-brand-muted mb-1.5">
                    Sesiones restantes
                  </span>
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
                </div>

                {included != null && <span className="text-xs text-brand-muted pb-2">de {included} incluidas</span>}

                {delta !== 0 && (
                  <span className={clsx("text-xs font-bold tz-nums pb-2", delta > 0 ? "text-good" : "text-critical")}>
                    {delta > 0 ? `+${delta}` : delta}
                  </span>
                )}

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

                {bono.isRecurring && (
                  <p className="text-[11px] text-brand-muted basis-full">
                    Bono recurrente de Stripe: el ajuste es un contador local y no se envía a Stripe.
                  </p>
                )}
              </div>
            ),
          } satisfies BonoAction,
        ]
      : []),
  ];

  const current = items.find((i) => i.key === open);

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
    <div className="border border-brand-border rounded-[14px] overflow-hidden">
      <div className="flex items-start justify-between gap-4 flex-wrap p-[18px_20px]">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-base font-bold text-brand-text">{bono.planName}</h4>
            <Badge tone={bono.status === "ACTIVE" ? "good" : "warning"}>
              {STATUS_LABEL[bono.status] ?? bono.status}
            </Badge>
            {bono.isRecurring && (
              <Badge tone="neutral" dot={false}>
                Recurrente
              </Badge>
            )}
          </div>
          <p className="text-xs text-brand-muted tz-nums mt-1.5">
            {bono.centerName} · {fmtDate(bono.startDateISO)}
            {bono.endDateISO ? ` → ${fmtDate(bono.endDateISO)}` : ""} · {euros(bono.priceCents)}
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="font-display font-extrabold text-[26px] text-brand-text tz-nums leading-none">
            {unlimited ? "∞" : server}
            {usage != null && usage.total > 0 && (
              <span className="text-[13px] font-semibold text-brand-muted"> / {usage.total}</span>
            )}
          </div>
          <div className="text-[11px] text-brand-faint mt-1">
            {unlimited ? "Ilimitado" : "sesiones restantes"}
          </div>
        </div>
      </div>

      <div className="h-1.5 bg-tz-sand rounded-pill mx-5 overflow-hidden">
        <div
          className="h-full bg-tz-black rounded-pill origin-left transition-transform duration-500 ease-out-soft"
          style={{ transform: `scaleX(${ratio})` }}
        />
      </div>

      {items.length > 0 && (
        <div className="p-[16px_20px_18px] flex flex-col gap-3">
          <div className="flex gap-2 flex-wrap">
            {items.map((item) => {
              const on = open === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  aria-expanded={on}
                  onClick={() => onOpenChange(on ? null : item.key)}
                  className={clsx(
                    "rounded-lg px-3 py-1.5 text-xs font-semibold border transition-[background-color,border-color,color] duration-200 ease-out-soft",
                    item.tone === "danger"
                      ? "border-critical-bg text-critical hover:bg-critical-bg"
                      : "border-brand-border text-brand-text hover:border-brand-ink hover:bg-tz-bone",
                    on && item.tone !== "danger" && "border-brand-ink bg-tz-bone",
                    on && item.tone === "danger" && "bg-critical-bg"
                  )}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
          {current && (
            <div
              className="tz-fade-up bg-brand-bg border border-brand-border rounded-xl p-4"
              style={{ animationDuration: "0.25s" }}
            >
              {current.content}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
