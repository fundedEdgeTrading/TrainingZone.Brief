"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { canManageOrg, ROLE_LABEL } from "@/lib/rbac";
import { createStaffWithInvitation, onboardingUrlFor } from "@/lib/invitations";
import { sendMail } from "@/lib/mailer";
import { renderStaffInviteEmail } from "@/lib/emails/templates";
import type { Role } from "@prisma/client";

const STAFF_ROLES: Role[] = [
  "OWNER",
  "CENTER_DIRECTOR",
  "TRAINER",
  "RECEPTION",
  "HR_MANAGER",
  "PLATFORM_ADMIN",
];
// Roles ligados a un centro (exigen imputación). El resto son de ámbito organización.
const CENTER_SCOPED: Role[] = ["CENTER_DIRECTOR", "TRAINER", "RECEPTION"];

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type OrgActionResult = { ok: true } | { ok: false; error: string };

// ---------- Organización (marca / logo) ----------
export async function updateOrganization(formData: FormData): Promise<OrgActionResult> {
  const session = await requireRole(["OWNER", "PLATFORM_ADMIN"]);
  const name = String(formData.get("name") ?? "").trim();
  const logoUrl = String(formData.get("logoUrl") ?? "").trim() || null;
  if (!name) return { ok: false, error: "El nombre de la organización es obligatorio." };

  await prisma.organization.update({
    where: { id: session.user.orgId },
    data: { name, logoUrl },
  });
  revalidatePath("/organization");
  return { ok: true };
}

// ---------- Centros (alta de estructura de la empresa) ----------
export async function createCenter(formData: FormData): Promise<OrgActionResult> {
  const session = await requireRole(["OWNER", "PLATFORM_ADMIN"]);
  const name = String(formData.get("name") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim() || null;
  const logoUrl = String(formData.get("logoUrl") ?? "").trim() || null;
  const slug = slugify(String(formData.get("slug") ?? "").trim() || name);
  if (!name || !slug) return { ok: false, error: "Indica al menos el nombre del centro." };

  const existing = await prisma.center.findFirst({
    where: { orgId: session.user.orgId, slug },
    select: { id: true },
  });
  if (existing) return { ok: false, error: "Ya existe un centro con ese slug." };

  await prisma.center.create({ data: { orgId: session.user.orgId, name, slug, address, logoUrl } });
  revalidatePath("/organization");
  return { ok: true };
}

// Editar el logo de un centro (si es null, hereda el de la organización / Apta).
export async function updateCenterLogo(formData: FormData): Promise<OrgActionResult> {
  const session = await requireRole(["OWNER", "PLATFORM_ADMIN"]);
  const centerId = String(formData.get("centerId") ?? "");
  const logoUrl = String(formData.get("logoUrl") ?? "").trim() || null;

  const center = await prisma.center.findFirst({
    where: { id: centerId, orgId: session.user.orgId },
    select: { id: true },
  });
  if (!center) return { ok: false, error: "No se ha encontrado ese centro." };

  await prisma.center.update({ where: { id: centerId }, data: { logoUrl } });
  revalidatePath("/organization");
  return { ok: true };
}

// ---------- Alta de personal ----------
export async function createStaffUser(formData: FormData): Promise<OrgActionResult> {
  const session = await requireRole(["OWNER", "PLATFORM_ADMIN", "HR_MANAGER"]);
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const roleRaw = String(formData.get("role") ?? "");
  const primaryCenterId = String(formData.get("primaryCenterId") ?? "") || null;

  const role = STAFF_ROLES.includes(roleRaw as Role) ? (roleRaw as Role) : null;
  if (!name || !email || !role) return { ok: false, error: "Completa el nombre, el email y el rol." };

  // RRHH no puede crear administración de la organización (evita escalada de privilegios).
  if ((role === "OWNER" || role === "PLATFORM_ADMIN") && !canManageOrg(session.user.role)) {
    return { ok: false, error: "No tienes permiso para crear ese rol." };
  }

  const dup = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (dup) return { ok: false, error: "Ya existe una persona con ese email." };

  // Centro base: obligatorio y validado para roles de centro; null para RRHH/dirección global.
  let centerId: string | null = null;
  if (CENTER_SCOPED.includes(role)) {
    if (!primaryCenterId) return { ok: false, error: "Este rol necesita un centro base." };
    const center = await prisma.center.findFirst({
      where: { id: primaryCenterId, orgId: session.user.orgId },
      select: { id: true },
    });
    if (!center) return { ok: false, error: "No se ha encontrado el centro base seleccionado." };
    centerId = center.id;
  }

  const { user, invitation } = await prisma.$transaction((tx) =>
    createStaffWithInvitation(tx, { orgId: session.user.orgId, name, email, role, centerId })
  );

  // Imputación primaria automática para roles de centro.
  if (centerId) {
    await prisma.centerMembership.create({
      data: { orgId: session.user.orgId, userId: user.id, centerId, role, isPrimary: true, allocationPct: 100 },
    });
  }

  const org = await prisma.organization.findUnique({ where: { id: session.user.orgId }, select: { name: true, logoUrl: true } });
  await sendMail({
    to: email,
    subject: `¡Bienvenida a ${org?.name ?? "Training Zone"}! Tu acceso te espera`,
    html: renderStaffInviteEmail({
      staffFirstName: name.split(/\s+/)[0] ?? name,
      orgName: org?.name ?? "Training Zone",
      orgLogoUrl: org?.logoUrl || "/brand/tz-logo-white.png",
      roleLabel: ROLE_LABEL[role],
      onboardingUrl: onboardingUrlFor(invitation.token),
    }),
  });

  revalidatePath("/organization");
  return { ok: true };
}

// ---------- Imputación de personal a centros ----------
export async function assignUserToCenter(formData: FormData): Promise<OrgActionResult> {
  const session = await requireRole(["OWNER", "PLATFORM_ADMIN", "HR_MANAGER"]);
  const userId = String(formData.get("userId") ?? "");
  const centerId = String(formData.get("centerId") ?? "");
  const roleRaw = String(formData.get("role") ?? "");
  const allocationRaw = String(formData.get("allocationPct") ?? "").trim();

  const role = STAFF_ROLES.includes(roleRaw as Role) ? (roleRaw as Role) : null;
  if (!userId || !centerId || !role) return { ok: false, error: "Selecciona la persona, el centro y el rol." };

  const allocationPct = allocationRaw
    ? Math.min(100, Math.max(0, Math.round(Number(allocationRaw))))
    : null;

  const [user, center] = await Promise.all([
    prisma.user.findFirst({ where: { id: userId, orgId: session.user.orgId }, select: { id: true } }),
    prisma.center.findFirst({ where: { id: centerId, orgId: session.user.orgId }, select: { id: true } }),
  ]);
  if (!user || !center) return { ok: false, error: "No se ha encontrado la persona o el centro." };

  await prisma.centerMembership.upsert({
    where: { userId_centerId: { userId, centerId } },
    create: { orgId: session.user.orgId, userId, centerId, role, isPrimary: false, allocationPct },
    update: { role, allocationPct },
  });

  revalidatePath("/organization");
  return { ok: true };
}

export async function removeCenterMembership(id: string): Promise<OrgActionResult> {
  const session = await requireRole(["OWNER", "PLATFORM_ADMIN", "HR_MANAGER"]);
  const membership = await prisma.centerMembership.findFirst({
    where: { id, orgId: session.user.orgId },
    select: { id: true },
  });
  if (!membership) return { ok: false, error: "No se ha encontrado esa imputación." };
  await prisma.centerMembership.delete({ where: { id } });
  revalidatePath("/organization");
  return { ok: true };
}
