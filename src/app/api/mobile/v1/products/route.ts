import type { NextRequest } from "next/server";
import { z } from "zod";
import type { PlanType, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { planServiceKind } from "@/lib/members-queries";
import { requireApiSession, requireApiRole } from "../_lib/api-session";
import { PLAN_TYPES, PLAN_TYPE_LABEL, saveMembershipPlan } from "@/lib/membership-plans";
import { apiOk, apiError } from "../_lib/response";

// Catálogo de bonos (A2 del socio) y su gestión (D4/D5 de dirección). El
// producto es el `MembershipPlan` de siempre: `active` es la visibilidad en el
// catálogo y `description`/`imageUrl` son los campos de venta que añade el móvil.
const MANAGER_ROLES: Role[] = ["OWNER", "CENTER_DIRECTOR", "PLATFORM_ADMIN"];

const productSchema = z.object({
  name: z.string().trim().min(1, "El producto necesita un nombre."),
  description: z.string().trim().max(400).nullable().optional(),
  imageUrl: z.string().trim().nullable().optional(),
  priceCents: z.number().int().min(0),
  sessionsIncluded: z.number().int().min(1).nullable().optional(),
  validityDays: z.number().int().min(1).nullable().optional(),
  // E4-29: los SEIS tipos del dominio son alcanzables desde la app. La
  // modalidad de tres valores se mantiene por compatibilidad con la versión
  // publicada, pero ya no puede convertir un producto en otro.
  planType: z.enum(PLAN_TYPES as [string, ...string[]]).optional(),
  serviceKind: z.enum(["EP", "GROUP", "ONLINE"]).optional(),
  visible: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const claims = await requireApiSession(req);
  if (!claims) return apiError("No autenticado.", 401);
  const canManage = MANAGER_ROLES.includes(claims.role);

  const [plans, center] = await Promise.all([
    prisma.membershipPlan.findMany({
      where: { orgId: claims.orgId, ...(canManage ? {} : { active: true }) },
      orderBy: [{ active: "desc" }, { priceCents: "asc" }],
      include: { _count: { select: { subscriptions: { where: { status: { in: ["ACTIVE", "FROZEN"] } } } } } },
    }),
    claims.centerId ? prisma.center.findUnique({ where: { id: claims.centerId }, select: { name: true } }) : null,
  ]);

  // "Más elegido": el visible con más bonos vivos (empate → el más barato, que
  // es el primero del orden). Sin suscriptores no se destaca nada.
  const featured = plans
    .filter((p) => p.active && p._count.subscriptions > 0)
    .sort((a, b) => b._count.subscriptions - a._count.subscriptions)[0];

  return apiOk({
    canManage,
    centerName: center?.name ?? null,
    // Catálogo de tipos con su rótulo, servido desde la fuente única: la app no
    // mantiene su propia tabla (E4-29/E12-04).
    planTypes: PLAN_TYPES.map((value) => ({ value, label: PLAN_TYPE_LABEL[value] })),
    products: plans.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      imageUrl: p.imageUrl,
      priceCents: p.priceCents,
      sessionsIncluded: p.sessionsIncluded,
      validityDays: p.validityDays,
      planType: p.type,
      serviceKind: planServiceKind(p.type) ?? "GROUP",
      visible: p.active,
      // Los socios no ven cuánta gente tiene contratado cada bono.
      subscribersCount: canManage ? p._count.subscriptions : null,
      featured: p.id === featured?.id,
    })),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireApiRole(req, MANAGER_ROLES);
  if (!auth.ok) return auth.response;
  const { claims } = auth;

  const parsed = productSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? "Datos inválidos.", 400);
  const body = parsed.data;

  // Misma función que `/organization` en la web (E4-29): mismos tipos, misma
  // validación, mismo trato del duplicado y mismo espejo de Stripe.
  const result = await saveMembershipPlan(claims.orgId, {
    name: body.name,
    description: body.description ?? null,
    imageUrl: body.imageUrl ?? null,
    priceCents: body.priceCents,
    sessionsIncluded: body.sessionsIncluded ?? null,
    validityDays: body.validityDays ?? null,
    planType: body.planType as PlanType | undefined,
    serviceKind: body.serviceKind,
    active: body.visible ?? true,
  }, claims.sub);
  if (!result.ok) return apiError(result.error, 400);

  return apiOk({ id: result.id }, 201);
}
