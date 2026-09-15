import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatInstantDate } from "@/lib/date-utils";
import {
  stripeConsoleHref,
  type StripeConsoleCard,
  type StripeConsoleCursors,
  type StripeConsoleRow,
} from "@/lib/stripe-console";

const CARD = "bg-brand-card border border-brand-border rounded-card p-5 shadow-card flex flex-col gap-3";

/**
 * HU-ST-24 · Una tarjeta = un listado de Stripe.
 *
 * Las dos cosas que esta tarjeta tiene que sostener, y que son la historia:
 *
 *  · **Degrada sola** (escenario 4). Si su listado falló, enseña el mensaje de
 *    Stripe en su sitio y ya está. No lanza, no vacía la pantalla y no dice
 *    nada de las otras tres, que siguen con sus datos.
 *  · **Pagina por cursor** (escenario 3). "Siguiente" lleva el id del último
 *    objeto de esta página, y conserva el cursor de las demás tarjetas. No hay
 *    número de página: la API de Stripe no sabe ir a la tercera sin pasar por
 *    la primera y la segunda, y fingir lo contrario sería mentirle a dirección.
 */

function money(amountCents: number, currency: string) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: currency.toUpperCase() }).format(
    amountCents / 100
  );
}

/** Verde lo cobrado y lo activo; ámbar lo que está en camino; rojo lo que falló. */
function toneForStatus(status: string): "good" | "warning" | "critical" | "neutral" {
  if (["succeeded", "active", "paid", "trialing"].includes(status)) return "good";
  if (["pending", "in_transit", "incomplete", "past_due", "processing"].includes(status)) return "warning";
  if (["failed", "canceled", "unpaid", "incomplete_expired"].includes(status)) return "critical";
  return "neutral";
}

function Row({ row, timeZone }: { row: StripeConsoleRow; timeZone: string }) {
  return (
    <li className="flex items-start justify-between gap-3 py-2.5 border-b border-brand-border last:border-b-0">
      <div className="min-w-0">
        <div className="text-sm text-brand-text font-medium truncate">{row.title}</div>
        <div className="text-xs text-brand-muted truncate">
          {row.subtitle ? `${row.subtitle} · ` : ""}
          {row.at ? formatInstantDate(row.at, timeZone) : row.id}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {row.amountCents !== null && row.currency && (
          <span className="text-sm tz-nums text-brand-text">{money(row.amountCents, row.currency)}</span>
        )}
        {row.status && <Badge tone={toneForStatus(row.status)}>{row.status}</Badge>}
      </div>
    </li>
  );
}

export function StripeListCard({
  card,
  cursors,
  timeZone,
}: {
  card: StripeConsoleCard;
  cursors: StripeConsoleCursors;
  timeZone: string;
}) {
  const paginated = Boolean(cursors[card.id]);

  return (
    <section className={CARD} aria-label={card.label}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display font-bold text-sm text-brand-text">{card.label}</h2>
        {card.status === "error" && <Badge tone="critical">Stripe no responde</Badge>}
      </div>

      {card.status === "error" ? (
        // El mensaje de Stripe, tal cual: es el que dice si es una clave sin
        // permisos, un límite de peticiones o una caída. El resto de la
        // pantalla no se entera.
        <p className="text-sm text-brand-muted">{card.message}</p>
      ) : card.rows.length === 0 ? (
        <p className="text-sm text-brand-muted">
          {paginated ? "No hay más resultados en esta página." : "Todavía no hay nada que enseñar aquí."}
        </p>
      ) : (
        <ul className="flex flex-col">
          {card.rows.map((row) => (
            <Row key={row.id} row={row} timeZone={timeZone} />
          ))}
        </ul>
      )}

      {card.status === "ok" && (paginated || card.nextCursor) && (
        <div className="flex items-center justify-between gap-3 text-[13px] pt-1">
          {paginated ? (
            <Link
              href={stripeConsoleHref(cursors, card.id, null)}
              scroll={false}
              className="font-semibold text-brand-text hover:underline"
            >
              ← Volver al principio
            </Link>
          ) : (
            <span />
          )}
          {card.nextCursor && (
            <Link
              href={stripeConsoleHref(cursors, card.id, card.nextCursor)}
              scroll={false}
              className="font-semibold text-brand-text hover:underline"
            >
              Siguiente →
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
