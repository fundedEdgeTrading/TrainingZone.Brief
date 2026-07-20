"use server";

import { prisma } from "@/lib/prisma";
import { createStaffWithInvitation, createMemberWithInvitation, onboardingUrlFor } from "@/lib/invitations";
import { sendMail } from "@/lib/mailer";
import { renderMemberWelcomeEmail, renderStaffInviteEmail } from "@/lib/emails/templates";
import type { Role } from "@prisma/client";

const STAFF_ROLE_BY_LABEL: Record<string, Role> = {
  Entrenador: "TRAINER",
  Recepción: "RECEPTION",
  "Dirección de centro": "CENTER_DIRECTOR",
  RRHH: "HR_MANAGER",
};
const CENTER_SCOPED: Role[] = ["CENTER_DIRECTOR", "TRAINER", "RECEPTION"];

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function uniqueOrgSlug(base: string) {
  const root = slugify(base) || "organizacion";
  let slug = root;
  let n = 1;
  while (await prisma.organization.findUnique({ where: { slug }, select: { id: true } })) {
    n += 1;
    slug = `${root}-${n}`;
  }
  return slug;
}

export type RegisterPayload = {
  orgName: string;
  orgCif: string;
  orgEmail: string;
  orgLogoUrl: string | null;
  centers: { name: string; address: string }[];
  staff: { name: string; email: string; role: string }[];
  members: { name: string; email: string; centerIndex: number }[];
};

export type RegisterResult =
  | { ok: true; orgName: string; centersCount: number; staffCount: number; membersCount: number; ownerOnboardingUrl: string }
  | { ok: false; error: string };

export async function registerOrganization(payload: RegisterPayload): Promise<RegisterResult> {
  const orgName = payload.orgName.trim();
  const orgEmail = payload.orgEmail.trim().toLowerCase();
  if (!orgName || !orgEmail) return { ok: false, error: "Indica el nombre de la empresa y el email de dirección." };
  if (payload.members.length > 0 && payload.centers.length === 0) {
    return { ok: false, error: "Añade al menos un centro antes de dar de alta socios." };
  }

  const dupOwner = await prisma.user.findUnique({ where: { email: orgEmail }, select: { id: true } });
  if (dupOwner) return { ok: false, error: "Ya existe una cuenta con ese email de dirección." };

  try {
    const result = await prisma.$transaction(async (tx) => {
      const slug = await uniqueOrgSlug(orgName);
      const org = await tx.organization.create({
        data: { name: orgName, slug, logoUrl: payload.orgLogoUrl || null },
      });

      const centers: Awaited<ReturnType<typeof tx.center.create>>[] = [];
      for (const c of payload.centers) {
        const name = c.name.trim();
        if (!name) continue;
        const centerSlug = slugify(name) || `centro-${centers.length + 1}`;
        centers.push(
          await tx.center.create({
            data: { orgId: org.id, name, slug: centerSlug, address: c.address.trim() || null },
          })
        );
      }
      const defaultCenterId = centers[0]?.id ?? null;

      const ownerName =
        orgEmail.split("@")[0]?.replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) ||
        "Dirección de organización";
      const owner = await createStaffWithInvitation(tx, {
        orgId: org.id,
        name: ownerName,
        email: orgEmail,
        role: "OWNER",
        centerId: null,
      });

      const staffInvites: { email: string; name: string; roleLabel: string; token: string }[] = [];
      for (const s of payload.staff) {
        const name = s.name.trim();
        const email = s.email.trim().toLowerCase();
        const role = STAFF_ROLE_BY_LABEL[s.role];
        if (!name || !email || !role) continue;
        if (await tx.user.findUnique({ where: { email }, select: { id: true } })) continue;
        const centerId = CENTER_SCOPED.includes(role) ? defaultCenterId : null;
        const created = await createStaffWithInvitation(tx, { orgId: org.id, name, email, role, centerId });
        if (centerId) {
          await tx.centerMembership.create({
            data: { orgId: org.id, userId: created.user.id, centerId, role, isPrimary: true, allocationPct: 100 },
          });
        }
        staffInvites.push({ email, name, roleLabel: s.role, token: created.invitation.token });
      }

      const memberInvites: { email: string; name: string; centerName: string; token: string }[] = [];
      for (const m of payload.members) {
        const [firstName, ...rest] = m.name.trim().split(/\s+/);
        const lastName = rest.join(" ");
        const email = m.email.trim().toLowerCase();
        const center = centers[m.centerIndex] ?? centers[0];
        if (!firstName || !email || !center) continue;
        if (await tx.member.findFirst({ where: { orgId: org.id, email }, select: { id: true } })) continue;
        const created = await createMemberWithInvitation(tx, {
          orgId: org.id,
          primaryCenterId: center.id,
          firstName,
          lastName: lastName || "—",
          email,
        });
        memberInvites.push({ email, name: m.name.trim(), centerName: center.name, token: created.invitation.token });
      }

      return { org, centers, owner, staffInvites, memberInvites };
    });

    const orgLogoUrl = payload.orgLogoUrl || "/brand/tz-logo-white.png";

    await sendMail({
      to: orgEmail,
      subject: `¡Bienvenida a ${orgName}! Tu acceso de dirección te espera`,
      html: renderStaffInviteEmail({
        staffFirstName: result.owner.user.name,
        orgName,
        orgLogoUrl,
        roleLabel: "Dirección de organización",
        onboardingUrl: onboardingUrlFor(result.owner.invitation.token),
      }),
    });
    for (const s of result.staffInvites) {
      await sendMail({
        to: s.email,
        subject: `¡Bienvenida a ${orgName}! Tu acceso te espera`,
        html: renderStaffInviteEmail({
          staffFirstName: s.name,
          orgName,
          orgLogoUrl,
          roleLabel: s.roleLabel,
          onboardingUrl: onboardingUrlFor(s.token),
        }),
      });
    }
    for (const m of result.memberInvites) {
      const [memberFirstName] = m.name.split(/\s+/);
      await sendMail({
        to: m.email,
        subject: `¡Bienvenida a ${orgName}, ${memberFirstName}! 🎉 Tu acceso te espera`,
        html: renderMemberWelcomeEmail({
          memberFirstName,
          orgName,
          orgLogoUrl,
          centerName: m.centerName,
          onboardingUrl: onboardingUrlFor(m.token),
        }),
      });
    }

    return {
      ok: true,
      orgName,
      centersCount: result.centers.length,
      staffCount: result.staffInvites.length,
      membersCount: result.memberInvites.length,
      ownerOnboardingUrl: onboardingUrlFor(result.owner.invitation.token),
    };
  } catch {
    return { ok: false, error: "No se ha podido crear la organización. Inténtalo de nuevo." };
  }
}
