import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";

/**
 * HU-ST-05 / RB-PAGO-023 · Deduplicación de eventos de Stripe por `event.id`.
 *
 * Stripe entrega **al menos una vez**: el mismo evento puede llegar varias veces
 * (reintentos tras un 500, reentregas manuales desde el Dashboard, un timeout de
 * red que nos dio por caídos cuando ya habíamos escrito). Cada reconciliador
 * tenía su propia idempotencia ad hoc —por `Payment.status`, por
 * `stripeInvoiceId`, por `provisioningSessionId`— y las que no la tenían
 * duplicaban.
 *
 * `StripeWebhookEvent` es la marca única y transversal: `id` es el `evt_…` de
 * Stripe, y `processedAt` solo se escribe cuando el manejador ha terminado bien.
 * Un evento que falla a mitad NO queda marcado, así que el 500 que devolvemos
 * hace que Stripe lo reintente y la próxima vez se procese de verdad.
 */

/**
 * Margen dentro del cual una segunda entrega del mismo evento con el procesado
 * aún sin terminar se trata como concurrencia, no como reintento.
 *
 * El caso que cubre: dos entregas simultáneas del mismo `evt_…`. La primera ya
 * insertó la fila y sigue trabajando; la segunda ve `processedAt` a null y, sin
 * esto, se pondría a procesar en paralelo. Los reintentos reales de Stripe
 * empiezan con minutos de separación, muy por encima de este margen, así que un
 * procesado que efectivamente falló sí se vuelve a intentar.
 */
const IN_FLIGHT_LEASE_MS = 60_000;

export type EventClaim =
  /** Nadie lo ha procesado: adelante. */
  | { claimed: true }
  /** Ya procesado (o procesándose ahora mismo): responder 200 sin repetir nada. */
  | { claimed: false; reason: "processed" | "in-flight" };

/**
 * Reserva el evento antes de procesarlo. Devuelve `claimed: false` cuando no hay
 * nada que hacer.
 */
export async function claimStripeEvent(event: Stripe.Event): Promise<EventClaim> {
  const existing = await prisma.stripeWebhookEvent.findUnique({
    where: { id: event.id },
    select: { processedAt: true, receivedAt: true },
  });

  if (existing) {
    if (existing.processedAt) return { claimed: false, reason: "processed" };
    if (Date.now() - existing.receivedAt.getTime() < IN_FLIGHT_LEASE_MS) {
      return { claimed: false, reason: "in-flight" };
    }
    // Reintento de Stripe sobre un procesado que falló: se renueva el sello de
    // recepción (para que dos reintentos simultáneos no se pisen) y se procesa.
    await prisma.stripeWebhookEvent.update({
      where: { id: event.id },
      data: { receivedAt: new Date() },
    });
    return { claimed: true };
  }

  try {
    await prisma.stripeWebhookEvent.create({
      data: { id: event.id, type: event.type, account: event.account ?? null },
    });
    return { claimed: true };
  } catch {
    // Carrera con otra entrega del mismo evento: la unicidad de `id` la resuelve
    // la base de datos, y quien pierde no procesa.
    return { claimed: false, reason: "in-flight" };
  }
}

/** Procesado terminado bien: la marca que hace que una reentrega sea un no-op. */
export async function markStripeEventProcessed(eventId: string): Promise<void> {
  await prisma.stripeWebhookEvent.update({
    where: { id: eventId },
    data: { processedAt: new Date(), lastError: null },
  });
}

/**
 * Procesado fallido: se guarda el motivo y `processedAt` se queda en null, para
 * que el reintento de Stripe lo vuelva a coger. El texto se recorta porque un
 * stack completo de Prisma no cabe cómodamente en una columna de listado.
 */
export async function markStripeEventFailed(eventId: string, error: string): Promise<void> {
  await prisma.stripeWebhookEvent.update({
    where: { id: eventId },
    data: { processedAt: null, lastError: error.slice(0, 500) },
  });
}
