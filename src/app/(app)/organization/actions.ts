"use server";

import { revalidatePath } from "next/cache";
import { requireRole, CENTER_OUT_OF_SCOPE } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { canManageOrg, canManageStaff, canEditStaff, canDeleteStaff, ROLE_LABEL } from "@/lib/rbac";
import { findStaffInScope, countActiveWithRole, canActOnCenter } from "@/lib/staff-queries";
import { removeStaffMember, restoreStaffMember, type StaffRemovalResult } from "@/lib/staff-lifecycle";
import { createStaffWithInvitation, onboardingUrlFor, absoluteUrl } from "@/lib/invitations";
import { sendMail } from "@/lib/mailer";
import { renderStaffInviteEmail } from "@/lib/emails/templates";
import { canAddCenter } from "@/lib/entitlements";
import type { PlanType, Role } from "@prisma/client";
import {
  PLAN_TYPES,
  saveMembershipPlan,
  setMembershipPlanActive as archiveMembershipPlan,
  type SaveMembershipPlanInput,
} from "@/lib/membership-plans";

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

  // Coordenadas del centro (opcionales): sitúan el centro en el mapa de
  // barrios. O van las dos o no va ninguna — media coordenada no ubica nada, y
  // guardarla dejaría el marcador en mitad del Atlántico.
  const lat = parseCoordinate(formData.get("lat"), -90, 90);
  const lng = parseCoordinate(formData.get("lng"), -180, 180);
  if (lat === "invalid" || lng === "invalid") {
    return { ok: false, error: "Las coordenadas tienen que ser números (latitud -90..90, longitud -180..180)." };
  }
  if ((lat === null) !== (lng === null)) {
    return { ok: false, error: "Indica latitud y longitud, o ninguna de las dos." };
  }

  const existing = await prisma.center.findFirst({
    where: { orgId: session.user.orgId, slug },
    select: { id: true },
  });
  if (existing) return { ok: false, error: "Ya existe un centro con ese slug." };

  // RB-PLAN-002: el número de centros es lo que se paga. Se comprueba aquí, con
  // un mensaje que indica la salida concreta en vez de un "no puedes".
  const allowed = await canAddCenter(session.user.orgId);
  if (!allowed.ok) return { ok: false, error: allowed.error };

  await prisma.center.create({ data: { orgId: session.user.orgId, name, slug, address, lat, lng, logoUrl } });
  revalidatePath("/organization");
  return { ok: true };
}

/** Coordenada opcional de un formulario: `null` si viene vacía, `"invalid"` si no es un número del rango. */
function parseCoordinate(raw: FormDataEntryValue | null, min: number, max: number): number | null | "invalid" {
  const text = String(raw ?? "").trim().replace(",", ".");
  if (!text) return null;
  const value = Number(text);
  if (!Number.isFinite(value) || value < min || value > max) return "invalid";
  return value;
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
    select: { id: true, deactivatedAt: true },
  });
  // Una baja con histórico conserva su fila, así que el email sigue ocupado:
  // sin este mensaje el alta fallaba con un "ya existe" sobre alguien que no
  // aparece en la plantilla, y no había forma de adivinar que hay que
  // reincorporarla.
  if (dup?.deactivatedAt) {
    return { ok: false, error: "Esa persona está dada de baja en tu organización: reincorpórala desde la plantilla." };
  }
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

// ---------- Edición y baja de plantilla (CRUD del equipo) ----------
// El alta y la imputación son de organización y RRHH; editar la ficha y sacar a
// alguien del equipo bajan un escalón para que dirección de centro pueda
// gestionar a los suyos (`canEditStaff` / `canDeleteStaff`). El ámbito no lo
// pone el rol: cada acción vuelve a resolver a quién puede tocar quien la
// llama con `findStaffInScope`, porque un id de otro centro llega igual de
// bien por POST aunque la pantalla no lo enseñe.

const EDIT_STAFF_ROLES: Role[] = ["OWNER", "PLATFORM_ADMIN", "HR_MANAGER", "CENTER_DIRECTOR"];

export async function updateStaffUser(formData: FormData): Promise<OrgActionResult> {
  const session = await requireRole(EDIT_STAFF_ROLES);
  if (!canEditStaff(session.user.role)) return { ok: false, error: "No tienes permiso para editar la plantilla." };

  const userId = String(formData.get("userId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const roleRaw = String(formData.get("role") ?? "");
  const primaryCenterId = String(formData.get("primaryCenterId") ?? "") || null;
  const visibleInApp = String(formData.get("visibleInApp") ?? "") === "on";

  const role = STAFF_ROLES.includes(roleRaw as Role) ? (roleRaw as Role) : null;
  if (!userId || !name || !role) return { ok: false, error: "Completa el nombre y el rol." };

  const target = await findStaffInScope(session.user, userId);
  if (!target) return { ok: false, error: "No se ha encontrado esa persona en tu plantilla." };

  // Escalada de privilegios, en sus dos formas: dársela a otro y dártela a ti.
  if ((role === "OWNER" || role === "PLATFORM_ADMIN") && !canManageOrg(session.user.role)) {
    return { ok: false, error: "No tienes permiso para asignar ese rol." };
  }
  // Dirección de centro solo reparte roles de centro. Con RRHH fuera de esta
  // lista, ascender a alguien a RRHH sería sacarlo de su propio alcance: un
  // rol de ámbito organización al que ya no podría ni volver a bajar.
  if (!canManageStaff(session.user.role) && !CENTER_SCOPED.includes(role)) {
    return { ok: false, error: "Solo puedes asignar roles de centro." };
  }
  if (target.id === session.user.id && role !== target.role) {
    return { ok: false, error: "No puedes cambiarte el rol a ti mismo." };
  }
  // Dejar la organización sin dirección la deja también sin quien pueda
  // devolvérsela: el último OWNER no se degrada desde aquí.
  if (target.role === "OWNER" && role !== "OWNER") {
    const others = await countActiveWithRole(session.user.orgId, "OWNER", target.id);
    if (others === 0) return { ok: false, error: "Es la única Dirección de organización: nombra otra antes de cambiarle el rol." };
  }

  // Centro base: obligatorio para roles de centro, y siempre uno de los que
  // quien edita tiene a su cargo.
  let centerId: string | null = null;
  if (CENTER_SCOPED.includes(role)) {
    if (!primaryCenterId) return { ok: false, error: "Este rol necesita un centro base." };
    const center = await prisma.center.findFirst({
      where: { id: primaryCenterId, orgId: session.user.orgId },
      select: { id: true },
    });
    if (!center) return { ok: false, error: "No se ha encontrado el centro base seleccionado." };
    if (!(await canActOnCenter(session.user, center.id))) return { ok: false, error: CENTER_OUT_OF_SCOPE };
    centerId = center.id;
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: target.id }, data: { name, role, centerId, visibleInApp } });

    if (centerId) {
      // La imputación primaria sigue al centro base: si no, la persona quedaba
      // con rol nuevo y dedicación colgando del centro anterior.
      await tx.centerMembership.updateMany({
        where: { userId: target.id, isPrimary: true, centerId: { not: centerId } },
        data: { isPrimary: false },
      });
      await tx.centerMembership.upsert({
        where: { userId_centerId: { userId: target.id, centerId } },
        create: {
          orgId: session.user.orgId,
          userId: target.id,
          centerId,
          role,
          isPrimary: true,
          allocationPct: 100,
        },
        update: { role, isPrimary: true },
      });
    } else {
      // Pasa a un rol de ámbito organización: deja de estar imputado a centros.
      await tx.centerMembership.deleteMany({ where: { userId: target.id } });
    }

    await tx.auditLog.create({
      data: {
        orgId: session.user.orgId,
        actorUserId: session.user.id,
        action: "STAFF_UPDATED",
        entityType: "User",
        entityId: target.id,
        metadata: { name, email: target.email, roleBefore: target.role, roleAfter: role, centerId },
      },
    });
  });

  revalidatePath("/organization");
  return { ok: true };
}

/**
 * Baja de plantilla (RB-RRHH-014). La regla —qué se borra, qué se conserva y
 * qué la bloquea— vive en `lib/staff-lifecycle.ts`, compartida con la API de la
 * app nativa; aquí solo queda quién puede llamar y sobre quién.
 */
export async function removeStaffUser(userId: string): Promise<StaffRemovalResult> {
  const session = await requireRole(["OWNER", "PLATFORM_ADMIN", "CENTER_DIRECTOR"]);
  if (!canDeleteStaff(session.user.role)) return { ok: false, error: "No tienes permiso para dar de baja personal." };

  const target = await findStaffInScope(session.user, userId);
  if (!target) return { ok: false, error: "No se ha encontrado esa persona en tu plantilla." };

  const result = await removeStaffMember({ orgId: session.user.orgId, actorUserId: session.user.id, target });
  if (result.ok) revalidatePath("/organization");
  return result;
}

/** Reincorporación: devuelve el acceso y rehace la imputación a su centro base. */
export async function restoreStaffUser(userId: string): Promise<OrgActionResult> {
  const session = await requireRole(["OWNER", "PLATFORM_ADMIN", "CENTER_DIRECTOR"]);
  if (!canDeleteStaff(session.user.role)) return { ok: false, error: "No tienes permiso para reincorporar personal." };

  const target = await findStaffInScope(session.user, userId);
  if (!target) return { ok: false, error: "No se ha encontrado esa persona en tu plantilla." };

  const result = await restoreStaffMember({ orgId: session.user.orgId, actorUserId: session.user.id, target });
  if (result.ok) revalidatePath("/organization");
  return result;
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
    // `deactivatedAt: null`: a quien ya no está en plantilla no se le imputa
    // trabajo nuevo — la baja acaba de borrarle todas sus imputaciones.
    prisma.user.findFirst({
      where: { id: userId, orgId: session.user.orgId, deactivatedAt: null },
      select: { id: true },
    }),
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
//
// E4-29: la regla de negocio (tipos, validación, duplicados, invalidación del
// espejo de Stripe y archivado) vive en `lib/membership-plans.ts`, compartida
// con `api/mobile/v1/products`. Aquí solo queda leer el formulario.

const PLAN_ROLES: Role[] = ["OWNER", "CENTER_DIRECTOR", "PLATFORM_ADMIN"];

/** Del formulario al contrato compartido. Lo único propio de la web. */
function planFormInput(formData: FormData): { ok: true; input: SaveMembershipPlanInput } | { ok: false; error: string } {
  const priceEuros = String(formData.get("priceEuros") ?? "").trim().replace(",", ".");
  const price = Number(priceEuros);
  if (!Number.isFinite(price) || price <= 0) return { ok: false, error: "El precio debe ser mayor que 0." };

  const sessionsRaw = String(formData.get("sessionsIncluded") ?? "").trim();
  const validityRaw = String(formData.get("validityDays") ?? "").trim();
  const sessions = sessionsRaw ? Number(sessionsRaw) : null;
  const validity = validityRaw ? Number(validityRaw) : null;
  if (sessions !== null && !Number.isFinite(sessions)) {
    return { ok: false, error: "Las sesiones incluidas deben ser un número entero mayor que 0." };
  }
  if (validity !== null && !Number.isFinite(validity)) {
    return { ok: false, error: "La validez en días debe ser un número entero mayor que 0." };
  }

  const type = String(formData.get("type") ?? "");
  if (!PLAN_TYPES.includes(type as PlanType)) return { ok: false, error: "Tipo de producto no válido." };

  const planId = String(formData.get("planId") ?? "").trim();
  // E4-29: `description` e `imageUrl` son el texto de venta y la foto que ve el
  // socio en el catálogo y en `/hazte-socio`. Existían solo en el formulario de
  // la app, así que un gimnasio que solo usara la web no podía rellenarlos.
  const description = String(formData.get("description") ?? "").trim();
  const imageUrl = String(formData.get("imageUrl") ?? "").trim();

  return {
    ok: true,
    input: {
      ...(planId ? { planId } : {}),
      name: String(formData.get("name") ?? ""),
      planType: type as PlanType,
      // Céntimos: se redondea al entero para no arrastrar errores de coma flotante.
      priceCents: Math.round(price * 100),
      sessionsIncluded: sessions,
      validityDays: validity,
      description: description || null,
      imageUrl: imageUrl || null,
    },
  };
}

export async function createMembershipPlan(formData: FormData): Promise<OrgActionResult> {
  const session = await requireRole(PLAN_ROLES);
  const parsed = planFormInput(formData);
  if (!parsed.ok) return parsed;

  // HU-ST-08: el autor va a la traza del cambio de importe (AuditLog).
  const result = await saveMembershipPlan(session.user.orgId, parsed.input, session.user.id);
  if (!result.ok) return result;
  revalidatePath("/organization");
  return { ok: true };
}

export async function updateMembershipPlan(formData: FormData): Promise<OrgActionResult> {
  const session = await requireRole(PLAN_ROLES);
  const parsed = planFormInput(formData);
  if (!parsed.ok) return parsed;
  if (!parsed.input.planId) return { ok: false, error: "Producto no encontrado." };

  const result = await saveMembershipPlan(session.user.orgId, parsed.input, session.user.id);
  if (!result.ok) return result;
  revalidatePath("/organization");
  return { ok: true };
}

/**
 * Archivar, nunca borrar (RB-VENTA-002). La regla vive en el módulo compartido:
 * la app hacía `delete()` sobre la misma tabla.
 */
export async function setMembershipPlanActive(formData: FormData): Promise<OrgActionResult> {
  const session = await requireRole(PLAN_ROLES);
  const planId = String(formData.get("planId") ?? "");
  const active = String(formData.get("active") ?? "") === "true";

  const result = await archiveMembershipPlan(session.user.orgId, planId, active);
  if (!result.ok) return result;
  revalidatePath("/organization");
  return { ok: true };
}
