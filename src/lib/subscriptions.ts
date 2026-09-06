import type { Prisma, SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * E4-30 · La ÚNICA forma de crear un bono o una cuota.
 *
 * Había cinco sitios creando `Subscription` con reglas de saldo distintas, y no
 * eran matices: el camino del webhook recurrente NO escribía
 * `sessionsRemaining`, y `bonoUsage` interpreta `null` como ILIMITADO. Un plan
 * `MONTHLY` con `sessionsIncluded: 8` comprado por Stripe quedaba ilimitado,
 * mientras el mismo plan vendido en recepción quedaba topado a 8. En la semilla
 * no hay ningún plan `MONTHLY`, así que ese camino no se había ejercitado
 * nunca: el fallo estaba esperando al primer cliente que vendiera cuota por la
 * web.
 *
 * `priceCents`, `sessionsIncluded` y `sessionsRemaining` se resuelven aquí y en
 * ningún otro sitio.
 */

type Tx = Prisma.TransactionClient;

/** Lo que hace falta del plan. Se pide explícito para que ningún llamante lo lea a medias. */
export type SubscriptionPlanTerms = {
  id: string;
  priceCents: number;
  sessionsIncluded: number | null;
};

export type SubscriptionTermOverrides = {
  /**
   * Importe realmente pactado, cuando no es el del catálogo (importación de un
   * histórico con precio antiguo). Sin esto, el del plan.
   */
  priceCents?: number | null;
  /**
   * Saldo REAL conocido, cuando quien crea el bono lo sabe mejor que el plan
   * (importación de socios: el CSV trae lo que le queda a mitad de bono).
   *
   *   · `undefined` → lo decide el plan. Es el caso normal, y el que arregla el
   *     alta por Stripe.
   *   · un número   → ese saldo, y el total contratado es el del plan (o ese
   *     número, si el plan no define ninguno).
   *   · `null`      → bono ilimitado, explícitamente.
   */
  sessionsRemaining?: number | null;
};

export type SubscriptionTerms = {
  priceCents: number;
  sessionsIncluded: number | null;
  sessionsRemaining: number | null;
};

/**
 * Las tres cifras del bono, en un solo sitio. Pura: se puede probar sin base de
 * datos, y es lo que garantiza que los cinco caminos digan lo mismo.
 */
export function resolveSubscriptionTerms(
  plan: SubscriptionPlanTerms,
  overrides: SubscriptionTermOverrides = {}
): SubscriptionTerms {
  const priceCents = overrides.priceCents ?? plan.priceCents;
  const included = plan.sessionsIncluded ?? null;

  // Caso normal: el plan manda. Un plan con sesiones incluidas arranca con esas
  // sesiones, lo venda recepción, la importación o el webhook de Stripe.
  if (overrides.sessionsRemaining === undefined) {
    return { priceCents, sessionsIncluded: included, sessionsRemaining: included };
  }

  // Ilimitado declarado: sin total que contar (`bonoUsage` no reparte nada).
  if (overrides.sessionsRemaining === null) {
    return { priceCents, sessionsIncluded: null, sessionsRemaining: null };
  }

  // Saldo conocido a mitad de bono: el total contratado sigue siendo el del
  // plan; si el plan no define ninguno, lo que queda es todo lo que hubo.
  return {
    priceCents,
    sessionsIncluded: included ?? overrides.sessionsRemaining,
    sessionsRemaining: overrides.sessionsRemaining,
  };
}

export type CreateSubscriptionInput = SubscriptionTermOverrides & {
  memberId: string;
  centerId: string;
  plan: SubscriptionPlanTerms;
  startDate?: Date;
  endDate?: Date | null;
  status?: SubscriptionStatus;
  /** Suscripción recurrente en Stripe Billing. Null/ausente en los bonos puntuales. */
  stripeSubscriptionId?: string | null;
};

/**
 * Crea la suscripción con las condiciones resueltas. Acepta un cliente de
 * transacción para poder ir dentro del alta del socio (invitations.ts) sin
 * abrir una segunda.
 */
export async function createSubscriptionFromPlan(tx: Tx | typeof prisma, input: CreateSubscriptionInput) {
  const terms = resolveSubscriptionTerms(input.plan, {
    priceCents: input.priceCents,
    sessionsRemaining: input.sessionsRemaining,
  });

  return tx.subscription.create({
    data: {
      memberId: input.memberId,
      planId: input.plan.id,
      centerId: input.centerId,
      startDate: input.startDate ?? new Date(),
      ...(input.endDate ? { endDate: input.endDate } : {}),
      status: input.status ?? "ACTIVE",
      priceCents: terms.priceCents,
      sessionsIncluded: terms.sessionsIncluded,
      sessionsRemaining: terms.sessionsRemaining,
      ...(input.stripeSubscriptionId ? { stripeSubscriptionId: input.stripeSubscriptionId } : {}),
    },
  });
}
