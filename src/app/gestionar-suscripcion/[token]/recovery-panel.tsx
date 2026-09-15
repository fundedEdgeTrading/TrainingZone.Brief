"use client";

import { useState } from "react";
import { Button, ButtonSpinner } from "@/components/ui/button";
import { openBillingPortal, retryPendingInvoice, type RecoveryResult } from "../actions";

/**
 * HU-ST-19 · Los dos botones de la pantalla de recuperación.
 *
 * "Pagar ahora" es el que faltaba: hasta ahora esta pantalla solo sabía mandar
 * al Billing Portal, y cambiar la tarjeta allí **no cobra** la factura
 * pendiente — el socio actualizaba su método y se quedaba esperando al
 * siguiente reintento de Stripe, con el acceso cortándose mientras tanto.
 *
 * El estado vive en el cliente y no en la URL a propósito: el token viaja en la
 * ruta y un `?resultado=` lo acompañaría a cualquier sitio donde el socio
 * pegase el enlace para preguntar qué le pasa.
 */
export function RecoveryPanel({ token, hasPendingInvoice }: { token: string; hasPendingInvoice: boolean }) {
  const [loading, setLoading] = useState<"pay" | "portal" | null>(null);
  const [result, setResult] = useState<RecoveryResult | null>(null);

  async function run(kind: "pay" | "portal") {
    setLoading(kind);
    setResult(null);
    const formData = new FormData();
    formData.set("token", token);
    const res = kind === "pay" ? await retryPendingInvoice(formData) : await openBillingPortal(formData);
    setResult(res);
    setLoading(null);
    // El Billing Portal es de Stripe: se sale de la aplicación, y la sesión que
    // devuelve caduca, así que se navega en cuanto llega en vez de guardarla.
    if (res.ok && res.url) window.location.href = res.url;
  }

  const paid = result?.ok === true && !result.url;

  return (
    <div className="mt-6 flex flex-col gap-3">
      {!paid && hasPendingInvoice && (
        <Button type="button" size="lg" className="w-full" disabled={loading !== null} onClick={() => run("pay")}>
          {loading === "pay" && <ButtonSpinner />}
          {loading === "pay" ? "Cobrando…" : "Pagar ahora"}
        </Button>
      )}

      {!paid && (
        <Button
          type="button"
          size="lg"
          variant={hasPendingInvoice ? "secondary" : "primary"}
          className="w-full"
          disabled={loading !== null}
          onClick={() => run("portal")}
        >
          {loading === "portal" && <ButtonSpinner />}
          {loading === "portal" ? "Abriendo…" : "Actualizar mi método de pago"}
        </Button>
      )}

      {result?.ok && (
        <p className="text-sm text-good bg-good-bg rounded-control px-3 py-2 text-left">{result.message}</p>
      )}

      {result && !result.ok && (
        <div className="text-sm text-critical bg-critical-bg rounded-control px-3 py-2 text-left">
          <p>{result.error}</p>
          {/* Escenario "método caducado": reintentar con la misma tarjeta no va
              a funcionar nunca, así que el siguiente paso es cambiarla. */}
          {result.needsPaymentMethod && (
            <p className="mt-1 font-semibold">
              Actualiza tu método de pago y vuelve a pulsar «Pagar ahora».
            </p>
          )}
        </div>
      )}
    </div>
  );
}
