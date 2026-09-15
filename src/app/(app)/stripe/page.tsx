import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { resolveTimezone } from "@/lib/timezone";
import {
  loadStripeConsoleCards,
  logStripeConsoleOpened,
  parseStripeConsoleCursors,
  requireStripeConsole,
  resolveStripeConsoleSource,
  stripeEnvironment,
} from "@/lib/stripe-console";
import { StripeListCard } from "./stripe-list-card";

/**
 * HU-ST-24 · Consola de lectura de Stripe para dirección.
 *
 * Server component de cabo a rabo: la clave secreta no sale del servidor y no
 * hay una sola llamada a Stripe desde el navegador.
 *
 * `dynamic`: la pantalla depende de la sesión y de cursores de la query, y lo
 * que enseña es dinero de hoy. Cachearla no es una optimización, es enseñar un
 * saldo viejo.
 */
export const dynamic = "force-dynamic";

export default async function StripeConsolePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Escenario «acceso»: solo OWNER (rol) y solo con el plan que incluye la
  // consola (gate declarado en `stripe-console.ts`, heredado a las hijas).
  const session = await requireStripeConsole();
  const { orgId, id: actorUserId } = session.user;

  const resolved = await resolveStripeConsoleSource(orgId);
  const environment = resolved.ok ? stripeEnvironment(resolved.source.livemode) : null;

  // Escenario «acceso», segunda mitad: CADA apertura queda registrada. Antes de
  // pintar y se vea lo que se vea — también cuando no hay Stripe conectado, que
  // sigue siendo alguien abriendo la consola de cobros.
  await logStripeConsoleOpened({ orgId, actorUserId, connected: resolved.ok, environment });

  if (!resolved.ok) {
    // Sin Stripe conectado: se explica qué falta y se enlaza donde se arregla.
    // Ni botón muerto, ni pantalla en blanco, ni error.
    return (
      <div className="tz-page space-y-4">
        <PageHeader
          kicker="Consola de Stripe"
          description="Lectura de la cuenta de Stripe del centro: cobros, suscripciones, clientes y transferencias al banco."
        />
        <EmptyState
          title="Todavía no hay cobros conectados"
          description={`${resolved.reason} La consola enseña lo que Stripe tiene de este centro, así que hasta que la cuenta esté conectada no hay nada que leer.`}
          action={
            <Link href="/organization">
              <Button variant="secondary">Conectar cobros →</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const cursors = parseStripeConsoleCursors(await searchParams);
  const [cards, timeZone] = await Promise.all([
    loadStripeConsoleCards(resolved.source, cursors),
    resolveTimezone(),
  ]);

  return (
    <div className="tz-page space-y-4">
      <PageHeader
        kicker="Consola de Stripe"
        description="Solo lectura: esta pantalla no mueve dinero. Cada listado se trae de Stripe página a página, por cursor."
        actions={
          // Escenario «entorno»: el distintivo sale del prefijo de la clave.
          // En TEST va en ámbar a propósito: dirección tiene que poder ver de un
          // vistazo que ese dinero no es dinero.
          <Badge tone={environment === "LIVE" ? "good" : "warning"}>
            {environment === "LIVE" ? "LIVE · datos reales" : "TEST · datos de prueba"}
          </Badge>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {cards.map((card) => (
          <StripeListCard key={card.id} card={card} cursors={cursors} timeZone={timeZone} />
        ))}
      </div>
    </div>
  );
}
