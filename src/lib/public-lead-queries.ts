import { cache } from "react";
import { unstable_cache } from "next/cache";

import type { PlatformStatus, Sex } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isPlatformOperational } from "@/lib/entitlements";
import { PUBLIC_CENTER_SELECT, PUBLIC_CENTER_REVALIDATE } from "@/lib/public-membership-queries";
import { centerPublicTag } from "@/lib/public-center-seo";

/**
 * Contexto público (sin sesión) para el formulario de leads embebido por centro.
 *
 * Mismo select de centro que `/hazte-socio` (E9-05): las dos plantillas son la
 * misma ficha del mismo centro, y tenerlas con dos selects distintos es
 * exactamente cómo se desincronizan. `cache()` por lo mismo que allí: desde
 * E9-04 el contexto se pide una vez en `generateMetadata` y otra en el render.
 */
export const getPublicLeadFormContext = cache(async function getPublicLeadFormContext(
  orgSlug: string,
  centerSlug: string
) {
  const organization = await prisma.organization.findUnique({
    where: { slug: orgSlug },
    select: { id: true, name: true, slug: true, logoUrl: true, platformStatus: true },
  });
  if (!organization) return null;

  const center = await prisma.center.findFirst({
    where: { orgId: organization.id, slug: centerSlug },
    select: PUBLIC_CENTER_SELECT,
  });
  if (!center) return null;

  const channels = await prisma.leadChannel.findMany({
    where: { orgId: organization.id, active: true },
    orderBy: { label: "asc" },
    select: { id: true, label: true },
  });

  return { organization, center, channels };
});

/**
 * E9-14 · La versión cacheada, para la página. La acción de servidor que crea el
 * lead sigue usando la fresca: un canal de captación recién desactivado no puede
 * seguir aceptando leads durante diez minutos.
 */
export function getCachedPublicLeadFormContext(orgSlug: string, centerSlug: string) {
  return unstable_cache(
    () => getPublicLeadFormContext(orgSlug, centerSlug),
    ["public-lead-context", orgSlug, centerSlug],
    { revalidate: PUBLIC_CENTER_REVALIDATE, tags: [centerPublicTag(orgSlug, centerSlug)] }
  )();
}

const SEX_VALUES: readonly Sex[] = ["FEMALE", "MALE", "OTHER"];

export type PublicLeadChoice = { ok: true; channel: string; sex: Sex | null } | { ok: false; error: string };

/**
 * QA-ALTA-20 · Lo que el visitante elige en el formulario público, validado
 * contra el contexto fresco del centro. La action no tiene sesión y el
 * FormData viaja por la red: el `required` del select no protege nada.
 *
 * - Solo recibe leads una organización operativa (`isPlatformOperational`, el
 *   mismo criterio que abre la app): una suspendida o cancelada no puede seguir
 *   acumulando datos personales que nadie va a atender.
 * - El canal tiene que ser uno ACTIVO de ESTA organización (`ctx.channels` ya
 *   viene filtrado por las dos cosas).
 * - El sexo, uno del enum o vacío ("prefiero no decirlo"); cualquier otro
 *   valor reventaba en Prisma con un 500.
 */
export function validatePublicLeadChoice(
  ctx: { organization: { platformStatus: PlatformStatus }; channels: { label: string }[] },
  input: { channel: string; sex: string }
): PublicLeadChoice {
  if (!isPlatformOperational(ctx.organization.platformStatus)) {
    return { ok: false, error: "Este centro no está recibiendo solicitudes en este momento." };
  }
  const channel = input.channel.trim();
  if (!ctx.channels.some((c) => c.label === channel)) {
    return { ok: false, error: "Selecciona cómo nos has conocido." };
  }
  const sex = input.sex.trim();
  if (sex && !SEX_VALUES.includes(sex as Sex)) return { ok: false, error: "Selecciona una opción válida en «Sexo»." };
  return { ok: true, channel, sex: sex ? (sex as Sex) : null };
}
