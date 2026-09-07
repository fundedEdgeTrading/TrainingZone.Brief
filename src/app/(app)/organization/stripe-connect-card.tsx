import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buildConnectOAuthUrl, getConnectStatus } from "@/lib/stripe-connect";
import { STRIPE_PAYMENT_METHODS_URL } from "@/lib/stripe-connect-status";

const CARD = "bg-brand-card border border-brand-border rounded-card p-5 shadow-card";

/**
 * HU-ST-07 · Tarjeta "Cobros a socios" con el estado real del KYC.
 *
 * Antes la UI solo distinguía "conectado" de "no conectado", así que el caso
 * intermedio —conectado pero con la verificación a medias, que es donde se queda
 * atascado un gimnasio de verdad— se veía igual que no haber empezado: el
 * director pulsaba "Conectar", Stripe le devolvía a la misma pantalla y nadie le
 * decía qué papel faltaba.
 *
 * **Decisión D-S1 (cuentas Standard)**: la cuenta es del gimnasio. Todo lo que
 * falta se resuelve en SU Dashboard, con un enlace directo, no con un formulario
 * nuestro. Por eso esta tarjeta informa y enlaza, nunca pide papeles.
 */

function euros(cents: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);
}

function fecha(date: Date) {
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long" }).format(date);
}

/** Nota común a todo estado conectado: los métodos de pago los activa el centro. */
function MetodosDePago() {
  return (
    <p className="text-sm text-brand-muted">
      Los métodos de pago que ves en el checkout (tarjeta, Bizum, domiciliación SEPA…) los activas tú desde{" "}
      <a href={STRIPE_PAYMENT_METHODS_URL} target="_blank" rel="noreferrer" className="underline font-medium">
        los ajustes de tu Dashboard de Stripe
      </a>
      . Tu cuenta es tuya: Apta no puede activarlos por ti.
    </p>
  );
}

export async function StripeConnectCard({ orgId }: { orgId: string }) {
  const status = await getConnectStatus(orgId);

  if (status.state === "not-configured") {
    // Sin botón muerto: se explica qué falta EN EL ENTORNO, que no es algo que
    // el gimnasio pueda arreglar.
    return (
      <div className={CARD}>
        <div className="flex flex-col gap-2">
          <Badge tone="warning">En espera de credenciales</Badge>
          <p className="text-sm text-brand-muted max-w-lg">
            El cobro online todavía no está disponible en esta instalación: falta configurar{" "}
            <code className="text-xs">{status.missing.join(" y ")}</code> en el servidor. No es nada que puedas
            hacer desde aquí — avisa a quien administra la plataforma. Mientras tanto, el cobro manual sigue
            funcionando con normalidad.
          </p>
        </div>
      </div>
    );
  }

  if (status.state === "not-connected") {
    return (
      <div className={CARD}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <p className="text-sm text-brand-muted max-w-lg">
            Conecta tu propia cuenta de Stripe para cobrar a tus socios. Apta nunca guarda una clave secreta tuya
            — solo el identificador de tu cuenta conectada, vía OAuth de un botón.
          </p>
          <a href={buildConnectOAuthUrl(orgId)}>
            <Button variant="secondary">Conectar cobros con Stripe →</Button>
          </a>
        </div>
      </div>
    );
  }

  if (status.state === "unavailable") {
    // Stripe no responde: se degrada esta tarjeta, no la pantalla.
    return (
      <div className={CARD}>
        <div className="flex flex-col gap-2">
          <Badge tone="warning">Estado no disponible</Badge>
          <p className="text-sm text-brand-muted max-w-lg">
            {status.error} Tu cuenta sigue conectada; vuelve a cargar la página en un momento o consulta{" "}
            <a href="https://dashboard.stripe.com" target="_blank" rel="noreferrer" className="underline font-medium">
              tu Dashboard de Stripe
            </a>
            .
          </p>
        </div>
      </div>
    );
  }

  if (status.state === "pending") {
    return (
      <div className={CARD}>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Badge tone="warning">Verificación pendiente</Badge>
            <p className="text-sm text-brand-muted">
              {status.disabledReason ?? "Stripe todavía no permite cobrar con esta cuenta."}
            </p>
          </div>

          {status.currentlyDue.length > 0 && (
            <div>
              <p className="text-sm font-medium text-brand-text mb-1">Lo que Stripe te pide:</p>
              <ul className="text-sm text-brand-muted list-disc pl-5 space-y-0.5">
                {status.currentlyDue.map((requirement) => (
                  <li key={requirement.code}>{requirement.label}</li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <a href={status.dashboardUrl} target="_blank" rel="noreferrer">
              <Button variant="secondary">Completar la verificación en Stripe →</Button>
            </a>
          </div>

          {/* Sin `chargesEnabled` no se ofrece ningún cobro a socios: la propia
              tarjeta lo dice, y `isStripeConfiguredForOrg` ya lo gatea en
              recepción y en el portal. */}
          <p className="text-xs text-faint">
            Hasta que Stripe lo apruebe no se ofrece el cobro online a tus socios. El cobro manual sigue
            disponible.
          </p>

          <MetodosDePago />
        </div>
      </div>
    );
  }

  return (
    <div className={CARD}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="good">Cobros activos</Badge>
          <Badge tone={status.payoutsEnabled ? "good" : "warning"}>
            {status.payoutsEnabled ? "Transferencias activas" : "Transferencias pendientes"}
          </Badge>
        </div>

        <p className="text-sm text-brand-muted">
          {status.payoutsEnabled
            ? status.nextPayoutAt
              ? `Tu próxima transferencia${
                  status.nextPayoutCents !== null ? ` de ${euros(status.nextPayoutCents)}` : ""
                } llega el ${fecha(status.nextPayoutAt)}.`
              : "No tienes ninguna transferencia en camino ahora mismo."
            : "Los payouts todavía están pendientes de verificación en Stripe."}
        </p>

        <MetodosDePago />
      </div>
    </div>
  );
}
