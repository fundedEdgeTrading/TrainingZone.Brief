import { redirect } from "next/navigation";
import type { Organization, PlatformStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { getPlatformPlan, type PlatformFeature } from "@/lib/platform-plans";

/**
 * POLÍTICA de lo contratado. El catálogo (datos) vive en `platform-plans.ts`;
 * aquí se decide qué puede hacer una organización con el plan que tiene.
 *
 * Un único punto de decisión por regla: ninguna página compara `platformStatus`
 * a mano ni mira `features` por su cuenta. Si hay que cambiar la política, se
 * cambia aquí.
 */

/** Solo estos campos hacen falta para decidir: quien llame no necesita cargar la organización entera. */
export type OrgEntitlements = Pick<Organization, "platformPlan" | "platformStatus">;

/**
 * RB-PLAT-001. `TRIALING` sigue aceptándose aunque hoy no se use: no se ofrece
 * prueba gratuita (D-10), pero dejar el estado fuera de la comprobación
 * significaría que una organización marcada así quedaría bloqueada sin motivo.
 */
export function isPlatformOperational(status: PlatformStatus): boolean {
  return status === "ACTIVE" || status === "TRIALING";
}

/**
 * RB-PLAN-003: el gateo afecta a la INTELIGENCIA construida sobre los datos
 * (semáforo, retención, BI, feedback), nunca al registro ni a la consulta de lo
 * que el gimnasio ya guardó, ni a su exportación. Guardar una lesión y sus
 * consentimientos es obligación legal, no funcionalidad premium.
 */
export function orgHasFeature(org: OrgEntitlements, feature: PlatformFeature): boolean {
  if (!isPlatformOperational(org.platformStatus)) return false;
  const plan = getPlatformPlan(org.platformPlan);
  return plan?.features.includes(feature) ?? false;
}

/** `null` = sin límite. `0` = sin plan contratado: no se permite crear centros. */
export function centerLimitFor(org: OrgEntitlements): number | null {
  const plan = getPlatformPlan(org.platformPlan);
  if (!plan) return 0;
  return plan.maxCenters;
}

export type CanAddCenterResult = { ok: true } | { ok: false; error: string };

/** RB-PLAN-002: se comprueba al crear el centro, y el mensaje indica la salida concreta. */
export async function canAddCenter(orgId: string): Promise<CanAddCenterResult> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { platformPlan: true, platformStatus: true },
  });
  if (!org) return { ok: false, error: "Organización no encontrada." };

  const limit = centerLimitFor(org);
  if (limit === null) return { ok: true };

  const plan = getPlatformPlan(org.platformPlan);
  if (!plan) {
    return { ok: false, error: "Tu organización no tiene un plan activo. Elige uno para añadir centros." };
  }

  const current = await prisma.center.count({ where: { orgId } });
  if (current < limit) return { ok: true };

  const suffix = plan.maxCenters === 1 ? "1 centro" : `${plan.maxCenters} centros`;
  return {
    ok: false,
    error: `Tu plan ${plan.name} incluye ${suffix}. Para añadir más, cambia de plan.`,
  };
}

/**
 * Guarda de página. Va DESPUÉS del filtro del menú (`rbac.ts`) y no en su
 * lugar: sin esto, escribir la URL a mano se saltaría el gateo.
 */
export async function requireFeature(feature: PlatformFeature) {
  const session = await requireSession();
  // Soporte de Apta: exento, igual que en el muro de plataforma.
  if (session.user.role === "PLATFORM_ADMIN") return session;

  const org = await prisma.organization.findUnique({
    where: { id: session.user.orgId },
    select: { platformPlan: true, platformStatus: true },
  });
  if (!org || !orgHasFeature(org, feature)) redirect(`/planes?feature=${feature}`);

  return session;
}

/** Para pintar la navegación de una vez, sin una consulta por elemento. */
export async function featuresForOrg(orgId: string): Promise<Set<PlatformFeature>> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { platformPlan: true, platformStatus: true },
  });
  if (!org || !isPlatformOperational(org.platformStatus)) return new Set();
  const plan = getPlatformPlan(org.platformPlan);
  return new Set(plan?.features ?? []);
}
