"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { canManageOrg, ROLE_LABEL } from "@/lib/rbac";
import { createStaffWithInvitation, onboardingUrlFor, absoluteUrl } from "@/lib/invitations";
import { sendMail } from "@/lib/mailer";
import { renderStaffInviteEmail } from "@/lib/emails/templates";
import { canAddCenter } from "@/lib/entitlements";
import type { PlanType, Role } from "@prisma/client";

const STAFF_ROLES: Role[] = [
  "OWNER",
  "CENTER_DIRECTOR",
  "TRAINER",
  "TRAINER_ADMIN",
  "RECEPTION",
  "HR_MANAGER",
  "PLATFORM_ADMIN",
];
// Roles ligados a un centro (exigen imputación). El resto son de ámbito organización.
const CENTER_SCOPED: Role[] = ["CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN", "RECEPTION"];

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

  // RB-PLAN-002: el número de centros es lo que se paga. Se comprueba aquí, con
  // un mensaje que indica la salida concreta en vez de un "no puedes".
  const allowed = await canAddCenter(session.user.orgId);
  if (!allowed.ok) return { ok: false, error: allowed.error };

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

  // RB-ID-001: la comprobación es POR ORGANIZACIÓN. Que el email exista en otro
  // gimnasio de Apta no es un conflicto: se le añadirá una membresía aquí.
  const dup = await prisma.user.findUnique({
    where: { orgId_email: { orgId: session.user.orgId, email } },
    select: { id: true },
  });
  if (dup) return { ok: false, error: "Ya existe una persona con ese email en tu organización." };

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

  const [org, inviteCenter] = await Promise.all([
    prisma.organization.findUnique({ where: { id: session.user.orgId }, select: { name: true, logoUrl: true } }),
    centerId
      ? prisma.center.findUnique({ where: { id: centerId }, select: { name: true, address: true } })
      : Promise.resolve(null),
  ]);
  // Email de invitación no bloqueante: el staff ya está guardado, un SMTP lento no debe colgar el alta.
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
      centerName: inviteCenter?.name,
      postalAddress: inviteCenter?.address ?? undefined,
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

  // RRHH no puede imputar a nadie con administración de la organización (evita escalada de privilegios).
  if ((role === "OWNER" || role === "PLATFORM_ADMIN") && !canManageOrg(session.user.role)) {
    return { ok: false, error: "No tienes permiso para asignar ese rol." };
  }

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

// ---------- Productos (lo que el gimnasio vende a sus socios) ----------
// Sin esto un gimnasio real no puede dar de alta sus cuotas ni sus bonos: los
// planes solo existían si los creaba el seed.

const PLAN_TYPES: PlanType[] = ["MONTHLY", "SESSION_PACK", "DROP_IN", "PERSONAL_TRAINING", "DUO", "ONLINE"];

/** Tipos que consumen sesiones de un bono: para ellos las sesiones incluidas son obligatorias. */
const PACK_TYPES: PlanType[] = ["SESSION_PACK", "PERSONAL_TRAINING", "DUO"];

function parsePlanForm(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "") as PlanType;
  const priceEuros = String(formData.get("priceEuros") ?? "").trim().replace(",", ".");
  const sessionsRaw = String(formData.get("sessionsIncluded") ?? "").trim();
  const validityRaw = String(formData.get("validityDays") ?? "").trim();

  if (!name) return { ok: false as const, error: "Indica el nombre del producto." };
  if (!PLAN_TYPES.includes(type)) return { ok: false as const, error: "Tipo de producto no válido." };

  const price = Number(priceEuros);
  if (!Number.isFinite(price) || price <= 0) return { ok: false as const, error: "El precio debe ser mayor que 0." };
  // Céntimos: se redondea al entero para no arrastrar errores de coma flotante.
  const priceCents = Math.round(price * 100);

  const sessionsIncluded = sessionsRaw ? Number(sessionsRaw) : null;
  if (sessionsIncluded !== null && (!Number.isInteger(sessionsIncluded) || sessionsIncluded <= 0)) {
    return { ok: false as const, error: "Las sesiones incluidas deben ser un número entero mayor que 0." };
  }
  if (PACK_TYPES.includes(type) && sessionsIncluded === null) {
    return { ok: false as const, error: "Un bono necesita indicar cuántas sesiones incluye." };
  }

  const validityDays = validityRaw ? Number(validityRaw) : null;
  if (validityDays !== null && (!Number.isInteger(validityDays) || validityDays <= 0)) {
    return { ok: false as const, error: "La validez en días debe ser un número entero mayor que 0." };
  }

  return { ok: true as const, data: { name, type, priceCents, sessionsIncluded, validityDays } };
}

export async function createMembershipPlan(formData: FormData): Promise<OrgActionResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "PLATFORM_ADMIN"]);
  const parsed = parsePlanForm(formData);
  if (!parsed.ok) return parsed;

  const dup = await prisma.membershipPlan.findFirst({
    where: { orgId: session.user.orgId, name: parsed.data.name, active: true },
    select: { id: true },
  });
  if (dup) return { ok: false, error: "Ya tienes un producto activo con ese nombre." };

  await prisma.membershipPlan.create({ data: { orgId: session.user.orgId, ...parsed.data } });
  revalidatePath("/organization");
  return { ok: true };
}

export async function updateMembershipPlan(formData: FormData): Promise<OrgActionResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "PLATFORM_ADMIN"]);
  const planId = String(formData.get("planId") ?? "");
  const parsed = parsePlanForm(formData);
  if (!parsed.ok) return parsed;

  const plan = await prisma.membershipPlan.findFirst({
    where: { id: planId, orgId: session.user.orgId },
    select: { id: true, priceCents: true },
  });
  if (!plan) return { ok: false, error: "Producto no encontrado." };

  // F5/RB-VENTA-002: los precios de Stripe son inmutables — si cambia el
  // importe, el espejo (`stripePriceId`) queda obsoleto y hay que invalidarlo
  // para que `ensureStripePrice` cree uno nuevo en el próximo checkout. Las
  // `Subscription` ya vivas no se ven afectadas: siguen colgando del precio
  // de Stripe anterior, que nunca se borra.
  const priceChanged = parsed.data.priceCents !== plan.priceCents;

  await prisma.membershipPlan.update({
    where: { id: plan.id },
    data: { ...parsed.data, ...(priceChanged ? { stripePriceId: null } : {}) },
  });
  revalidatePath("/organization");
  return { ok: true };
}

/**
 * Archivar, nunca borrar (RB-VENTA-002): un producto tiene suscripciones y pagos
 * colgando, y borrarlo dejaría el histórico de cobros sin referencia. Archivado
 * desaparece de los selectores de venta y sigue visible en el histórico.
 */
export async function setMembershipPlanActive(formData: FormData): Promise<OrgActionResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "PLATFORM_ADMIN"]);
  const planId = String(formData.get("planId") ?? "");
  const active = String(formData.get("active") ?? "") === "true";

  const plan = await prisma.membershipPlan.findFirst({
    where: { id: planId, orgId: session.user.orgId },
    select: { id: true },
  });
  if (!plan) return { ok: false, error: "Producto no encontrado." };

  await prisma.membershipPlan.update({ where: { id: plan.id }, data: { active } });
  revalidatePath("/organization");
  return { ok: true };
}
