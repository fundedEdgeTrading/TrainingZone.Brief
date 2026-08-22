import type { NextRequest } from "next/server";
import { z } from "zod";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { planServiceKind } from "@/lib/members-queries";
import { requireApiSession, requireApiRole } from "../_lib/api-session";
import { planTypeFor } from "../_lib/products";
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
  serviceKind: z.enum(["EP", "GROUP", "ONLINE"]),
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
  const { name, description, imageUrl, priceCents, sessionsIncluded, validityDays, serviceKind, visible } = parsed.data;

  const duplicate = await prisma.membershipPlan.findFirst({
    where: { orgId: claims.orgId, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (duplicate) return apiError("Ya existe un producto con ese nombre.", 400);

  const plan = await prisma.membershipPlan.create({
    data: {
      orgId: claims.orgId,
      name,
      description: description ?? null,
      imageUrl: imageUrl ?? null,
      priceCents,
      sessionsIncluded: sessionsIncluded ?? null,
      validityDays: validityDays ?? null,
      type: planTypeFor(serviceKind, sessionsIncluded ?? null),
      active: visible ?? true,
    },
    select: { id: true },
  });

  return apiOk({ id: plan.id }, 201);
}
