"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signIn } from "@/auth";
import { createOwnerAccount, absoluteUrl } from "@/lib/invitations";
import { sendMail } from "@/lib/mailer";
import { renderVerifyEmail } from "@/lib/emails/templates";
import { generateVerifyEmailToken, verifyEmailUrlFor } from "@/lib/email-verification";

const signupSchema = z.object({
  name: z.string().trim().min(1, "Indica tu nombre."),
  email: z.string().trim().toLowerCase().email("Email no válido."),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres."),
  orgName: z.string().trim().min(1, "Indica el nombre de la empresa."),
  taxId: z.string().trim().optional(),
});

export type SignupResult =
  | { ok: false; error: string }
  | { ok: true; redirectTo: "/activar" }
  | { ok: true; redirectTo: "/login"; resumed: true };

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

/**
 * Alta pragmática del director (D-1/D-3/RB-PLAT-002): registro cuenta-primero.
 * Crea `Organization` (`PENDING_PAYMENT`) + `OWNER` con contraseña real en la
 * misma transacción, sin invitación, y hace login automático. El pago (A.4)
 * es el único muro — no se verifica que sea director de un gimnasio real.
 */
export async function signupAction(_prev: SignupResult | null, formData: FormData): Promise<SignupResult> {
  const parsed = signupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    orgName: formData.get("orgName"),
    taxId: formData.get("taxId") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  }
  const { name, email, password, orgName, taxId } = parsed.data;

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true, orgId: true, organization: { select: { platformStatus: true } } },
  });

  if (existingUser) {
    // RB-PLAT-003: reregistro con el email de una org PENDING_PAYMENT reanuda, no da error.
    // No conocemos la contraseña original, así que llevamos a login (con vuelta a /activar) en vez de autologuear.
    if (existingUser.organization.platformStatus === "PENDING_PAYMENT") {
      return { ok: true, redirectTo: "/login", resumed: true };
    }
    return { ok: false, error: "Ya hay una cuenta con ese email. Inicia sesión." };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const result = await prisma.$transaction(async (tx) => {
    const slug = await uniqueOrgSlug(orgName);
    const org = await tx.organization.create({
      data: {
        name: orgName,
        slug,
        platformStatus: "PENDING_PAYMENT",
        taxId: taxId || null,
        billingEmail: email,
        billingName: orgName,
      },
    });
    const owner = await createOwnerAccount(tx, { orgId: org.id, name, email, passwordHash });
    return { org, owner };
  });

  await signIn("demo", { email, password, redirect: false });

  // D-2: email de verificación no bloqueante — best-effort, nunca rompe el alta.
  try {
    const token = generateVerifyEmailToken(result.owner.id);
    await sendMail({
      to: email,
      subject: `Confirma tu email — ${orgName}`,
      html: renderVerifyEmail({
        directorFirstName: name,
        orgName,
        orgLogoUrl: absoluteUrl("/brand/tz-logo-white.png"),
        verifyUrl: verifyEmailUrlFor(token),
      }),
    });
  } catch (error) {
    console.error("[signup] error enviando email de verificación:", error);
  }

  return { ok: true, redirectTo: "/activar" };
}
