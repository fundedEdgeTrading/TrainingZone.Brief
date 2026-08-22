import type { NextRequest } from "next/server";
import { z } from "zod";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canManageStaff, canManageOrg, ROLE_LABEL } from "@/lib/rbac";
import { createStaffWithInvitation, onboardingUrlFor, absoluteUrl } from "@/lib/invitations";
import { sendMail } from "@/lib/mailer";
import { renderStaffInviteEmail } from "@/lib/emails/templates";
import { requireApiRole } from "../_lib/api-session";
import { apiOk, apiError } from "../_lib/response";

// D6/D7 del handoff: equipo de la organización con foto, rol e imputación a
// centros (`CenterMembership.allocationPct`).
const READ_ROLES: Role[] = ["OWNER", "PLATFORM_ADMIN", "HR_MANAGER", "CENTER_DIRECTOR"];
const STAFF_ROLES: Role[] = ["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN", "RECEPTION", "HR_MANAGER", "PLATFORM_ADMIN"];
const CENTER_SCOPED: Role[] = ["CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN", "RECEPTION"];

const createSchema = z.object({
  name: z.string().trim().min(1, "Completa el nombre."),
  email: z.string().trim().toLowerCase().email("El email no es válido."),
  role: z.enum(["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN", "RECEPTION", "HR_MANAGER", "PLATFORM_ADMIN"]),
  centerId: z.string().trim().nullable().optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireApiRole(req, READ_ROLES);
  if (!auth.ok) return auth.response;
  const { claims } = auth;

  const [staff, centers] = await Promise.all([
    prisma.user.findMany({
      where: { orgId: claims.orgId, role: { not: "MEMBER" } },
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        image: true,
        visibleInApp: true,
        centerId: true,
        createdAt: true,
        centerMemberships: {
          orderBy: { isPrimary: "desc" },
          select: { id: true, allocationPct: true, isPrimary: true, center: { select: { id: true, name: true } } },
        },
        invitation: { select: { usedAt: true } },
      },
    }),
    prisma.center.findMany({ where: { orgId: claims.orgId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return apiOk({
    canManage: canManageStaff(claims.role),
    centers,
    staff: staff.map((s) => ({
      id: s.id,
      name: s.name,
      email: s.email,
      role: s.role,
      roleLabel: ROLE_LABEL[s.role],
      image: s.image,
      visibleInApp: s.visibleInApp,
      joinedAt: s.createdAt.toISOString(),
      invitationPending: Boolean(s.invitation && !s.invitation.usedAt),
      allocations: s.centerMemberships.map((m) => ({
        centerId: m.center.id,
        centerName: m.center.name,
        pct: m.allocationPct,
        isPrimary: m.isPrimary,
      })),
    })),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireApiRole(req, READ_ROLES);
  if (!auth.ok) return auth.response;
  const { claims } = auth;
  if (!canManageStaff(claims.role)) return apiError("No tienes permiso para gestionar el equipo.", 403);

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? "Datos inválidos.", 400);
  const { name, email, role, centerId: requestedCenterId } = parsed.data;

  // RRHH no puede crear administración de la organización (evita escalada de privilegios).
  if ((role === "OWNER" || role === "PLATFORM_ADMIN") && !canManageOrg(claims.role)) {
    return apiError("No tienes permiso para crear ese rol.", 403);
  }
  if (!STAFF_ROLES.includes(role)) return apiError("Ese rol no existe.", 400);

  // RB-ID-001: la comprobación de duplicado es POR ORGANIZACIÓN.
  const duplicate = await prisma.user.findUnique({
    where: { orgId_email: { orgId: claims.orgId, email } },
    select: { id: true },
  });
  if (duplicate) return apiError("Ya existe una persona con ese email en tu organización.", 400);

  let centerId: string | null = null;
  if (CENTER_SCOPED.includes(role)) {
    if (!requestedCenterId) return apiError("Este rol necesita un centro base.", 400);
    const center = await prisma.center.findFirst({ where: { id: requestedCenterId, orgId: claims.orgId }, select: { id: true } });
    if (!center) return apiError("No se ha encontrado el centro base seleccionado.", 404);
    centerId = center.id;
  }

  const { user, invitation } = await prisma.$transaction((tx) =>
    createStaffWithInvitation(tx, { orgId: claims.orgId, name, email, role, centerId })
  );

  if (centerId) {
    await prisma.centerMembership.create({
      data: { orgId: claims.orgId, userId: user.id, centerId, role, isPrimary: true, allocationPct: 100 },
    });
  }

  const org = await prisma.organization.findUnique({ where: { id: claims.orgId }, select: { name: true, logoUrl: true } });
  // Email de invitación no bloqueante: el alta ya está guardada.
  void sendMail({
    to: email,
    fromName: org?.name ?? "Training Zone",
    subject: `¡Bienvenida a ${org?.name ?? "Training Zone"}! Tu acceso te espera`,
    html: renderStaffInviteEmail({
      staffFirstName: name.split(/\s+/)[0] ?? name,
      orgName: org?.name ?? "Training Zone",
      orgLogoUrl: absoluteUrl(org?.logoUrl || "/brand/tz-logo-white.png"),
      roleLabel: ROLE_LABEL[role],
      onboardingUrl: onboardingUrlFor(invitation.token),
    }),
  });

  return apiOk({ id: user.id }, 201);
}
