import "dotenv/config";

import bcrypt from "bcryptjs";
import type { PlatformStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureIdentity } from "@/lib/identity";
import { absoluteUrl, generateInvitationToken, invitationExpiry, onboardingUrlFor } from "@/lib/invitations";
import { isMailerConfigured, sendMail } from "@/lib/mailer";
import { renderStaffInviteEmail } from "@/lib/emails/templates";
import { publicOrigin } from "@/lib/site";
import { ROLE_LABEL } from "@/lib/rbac";

/**
 * ARRANQUE DE LA PLATAFORMA EN UNA BASE LIMPIA (INF-03).
 *
 *   NODE_ENV=production npm run bootstrap:plataforma [-- --reenviar]
 *   npm run bootstrap:plataforma -- --force            (fuera de producción)
 *
 * Variables: PLATFORM_ORG_SLUG y PLATFORM_ADMIN_EMAIL (obligatorias),
 * PLATFORM_ORG_NAME y PLATFORM_ADMIN_NAME (opcionales).
 *
 * Producción arranca SIN seed: el seed vacía la base entera y siembra una
 * organización de demostración con contraseñas públicas. Pero sin seed no hay
 * nadie que pueda entrar al panel de plataforma, y las organizaciones de los
 * gimnasios solo nacen pagando (RB-ALTA-001). Este script crea lo mínimo para
 * romper ese círculo: la organización de plataforma y su PLATFORM_ADMIN.
 *
 * ES IDEMPOTENTE. Se reconoce la organización por su slug y al administrador por
 * su email dentro de ella; volver a ejecutarlo no duplica nada. Con
 * `--reenviar` vuelve a mandar la invitación vigente.
 *
 * SIN CONTRASEÑA EN CLARO. El administrador recibe una invitación por correo y
 * fija su contraseña en /onboarding/<token>, el mismo camino que el personal. El
 * enlace no se imprime nunca: es una credencial, y la salida de una shell de
 * producción acaba en sitios que no controlamos.
 *
 * SE NIEGA A EJECUTARSE:
 * - fuera de producción sin `--force` (el día que alguien lo lance contra la
 *   base equivocada, prefiero que tenga que escribirlo);
 * - si detecta datos de demostración, con o sin `--force`: una base que tiene la
 *   organización del seed o cuentas con su contraseña pública no es una base de
 *   producción, y darle un administrador de plataforma sería legitimarla;
 * - en producción, si el correo no está configurado o la URL pública apunta a
 *   localhost: la invitación sería el único camino de entrada y no llegaría.
 */

/** Huella del seed (`prisma/seed.ts`). */
export const DEMO_ORG_SLUG = "training-zone";
export const DEMO_PASSWORD = "demo1234";
export const DEMO_ACCOUNTS = ["direccion@trainingzone.es", "socio@trainingzone.es", "sergio@trainingzone.es"];

const PLATFORM_ROLE: Role = "PLATFORM_ADMIN";
const AUDIT_ACTION = "PLATFORM_BOOTSTRAP";

export type BootstrapArgs = { force: boolean; resend: boolean };

export function parseArgs(argv: readonly string[]): BootstrapArgs {
  return { force: argv.includes("--force"), resend: argv.includes("--reenviar") };
}

export function environmentError(nodeEnv: string | undefined, force: boolean): string | null {
  if (nodeEnv === "production" || force) return null;
  return (
    `NODE_ENV es "${nodeEnv ?? ""}", no "production". Este script prepara una base de producción; ` +
    "para ejecutarlo en otro entorno, añade --force."
  );
}

export type BootstrapConfig = { orgSlug: string; orgName: string; adminEmail: string; adminName: string };

export function readConfig(
  env: Record<string, string | undefined>,
): { ok: true; config: BootstrapConfig } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const orgSlug = (env.PLATFORM_ORG_SLUG ?? "").trim();
  const adminEmail = (env.PLATFORM_ADMIN_EMAIL ?? "").trim().toLowerCase();

  if (!orgSlug) {
    errors.push("Falta PLATFORM_ORG_SLUG.");
  } else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(orgSlug)) {
    errors.push(`PLATFORM_ORG_SLUG "${orgSlug}" no es un slug: solo minúsculas, dígitos y guiones.`);
  } else if (orgSlug === DEMO_ORG_SLUG) {
    // No es manía: `AI_DEMO_ORG_SLUGS` vacía equivale a este slug, y la
    // organización que lo lleve se salta el bloqueo del DPA de IA.
    errors.push(`PLATFORM_ORG_SLUG no puede ser "${DEMO_ORG_SLUG}": es el slug de la organización de demostración.`);
  }

  if (!adminEmail) {
    errors.push("Falta PLATFORM_ADMIN_EMAIL.");
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
    errors.push(`PLATFORM_ADMIN_EMAIL "${adminEmail}" no parece un email.`);
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    config: {
      orgSlug,
      orgName: (env.PLATFORM_ORG_NAME ?? "").trim() || "Plataforma",
      adminEmail,
      adminName: (env.PLATFORM_ADMIN_NAME ?? "").trim() || adminEmail.split("@")[0],
    },
  };
}

export type DemoSignals = { demoOrg: boolean; demoAccounts: string[] };

export function demoDataError(signals: DemoSignals): string | null {
  const found: string[] = [];
  if (signals.demoOrg) found.push(`la organización "${DEMO_ORG_SLUG}" del seed`);
  if (signals.demoAccounts.length > 0) {
    found.push(`cuentas con la contraseña pública del seed (${signals.demoAccounts.join(", ")})`);
  }
  if (found.length === 0) return null;
  return (
    `Esta base tiene datos de demostración: ${found.join(" y ")}. ` +
    "El arranque de plataforma solo se hace sobre una base limpia. --force no cambia esto."
  );
}

/** Lo que ya hay en la base, reducido a lo que decide el plan. */
export type ExistingState = {
  org: {
    platformStatus: PlatformStatus;
    members: number;
    centers: number;
    payments: number;
    hasPlatformCustomer: boolean;
  } | null;
  user: { role: Role; deactivated: boolean } | null;
  identityHasPassword: boolean;
  invitation: { used: boolean; expiresAt: Date } | null;
};

export type InvitationStep = "create" | "renew" | "keep" | "none";

export type BootstrapPlan =
  | { refuse: string }
  | {
      createOrg: boolean;
      activateOrg: boolean;
      createUser: boolean;
      invitation: InvitationStep;
      sendEmail: boolean;
    };

/**
 * Decide qué hacer a partir de lo que ya existe. Pura: es donde viven todas las
 * ramas del idempotente, y así se prueban sin base de datos.
 */
export function planBootstrap(state: ExistingState, opts: { resend: boolean; now: Date }): BootstrapPlan {
  const { org, user } = state;

  if (org && (org.members > 0 || org.centers > 0 || org.payments > 0 || org.hasPlatformCustomer)) {
    return {
      refuse:
        "Ya existe una organización con ese slug y tiene socios, centros, cobros o cliente de Stripe: es un " +
        "gimnasio, no la organización de plataforma. Elige otro PLATFORM_ORG_SLUG.",
    };
  }
  if (user && user.role !== PLATFORM_ROLE) {
    return {
      refuse:
        `Ese email ya es ${user.role} en la organización de plataforma. No se cambia un rol en silencio: ` +
        "hazlo a mano si de verdad es lo que quieres.",
    };
  }
  if (user?.deactivated) {
    return { refuse: "Ese administrador está dado de baja. Alguien lo desactivó a propósito: no se reactiva desde aquí." };
  }

  // Quien ya tiene contraseña en Apta (RB-ID-003) entra con la suya: no hay
  // nada que activar y una invitación solo sería un enlace más circulando.
  let invitation: InvitationStep;
  if (state.identityHasPassword) invitation = "none";
  else if (!state.invitation) invitation = "create";
  else if (state.invitation.used || state.invitation.expiresAt <= opts.now) invitation = "renew";
  else invitation = "keep";

  return {
    createOrg: !org,
    activateOrg: org !== null && org.platformStatus !== "ACTIVE",
    createUser: !user,
    invitation,
    sendEmail: invitation === "create" || invitation === "renew" || (invitation === "keep" && opts.resend),
  };
}

// ---------------------------------------------------------------------------
// Bordes: base de datos, correo y consola.
// ---------------------------------------------------------------------------

async function detectDemo(): Promise<DemoSignals> {
  const [demoOrg, identities] = await Promise.all([
    prisma.organization.findUnique({ where: { slug: DEMO_ORG_SLUG }, select: { id: true } }),
    prisma.identity.findMany({ where: { email: { in: DEMO_ACCOUNTS } }, select: { email: true, passwordHash: true } }),
  ]);
  const demoAccounts: string[] = [];
  for (const identity of identities) {
    if (identity.passwordHash && (await bcrypt.compare(DEMO_PASSWORD, identity.passwordHash))) {
      demoAccounts.push(identity.email);
    }
  }
  return { demoOrg: demoOrg !== null, demoAccounts };
}

async function readState(config: BootstrapConfig): Promise<{ state: ExistingState; orgId: string | null }> {
  const org = await prisma.organization.findUnique({
    where: { slug: config.orgSlug },
    select: {
      id: true,
      platformStatus: true,
      platformStripeCustomerId: true,
      _count: { select: { members: true, centers: true, payments: true } },
    },
  });
  const [user, identity] = await Promise.all([
    org
      ? prisma.user.findUnique({
          where: { orgId_email: { orgId: org.id, email: config.adminEmail } },
          select: { role: true, deactivatedAt: true, invitation: { select: { usedAt: true, expiresAt: true } } },
        })
      : null,
    prisma.identity.findUnique({ where: { email: config.adminEmail }, select: { passwordSetAt: true } }),
  ]);

  return {
    orgId: org?.id ?? null,
    state: {
      org: org
        ? {
            platformStatus: org.platformStatus,
            members: org._count.members,
            centers: org._count.centers,
            payments: org._count.payments,
            hasPlatformCustomer: org.platformStripeCustomerId !== null,
          }
        : null,
      user: user ? { role: user.role, deactivated: user.deactivatedAt !== null } : null,
      identityHasPassword: identity?.passwordSetAt != null,
      invitation: user?.invitation
        ? { used: user.invitation.usedAt !== null, expiresAt: user.invitation.expiresAt }
        : null,
    },
  };
}

function productionDeliveryError(): string | null {
  if (!isMailerConfigured()) {
    return "BREVO_API_KEY no está configurada: la invitación no saldría y el administrador no podría entrar.";
  }
  const host = new URL(publicOrigin()).hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    return "La URL pública apunta a localhost (NEXT_PUBLIC_SITE_URL / NEXTAUTH_URL): el enlace de la invitación no funcionaría.";
  }
  return null;
}

function fail(message: string) {
  console.error(`✗ ${message}`);
  process.exitCode = 1;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const envError = environmentError(process.env.NODE_ENV, args.force);
  if (envError) return fail(envError);

  const read = readConfig(process.env);
  if (!read.ok) return fail(read.errors.join("\n  "));
  const { config } = read;

  const demoError = demoDataError(await detectDemo());
  if (demoError) return fail(demoError);

  const { state, orgId: existingOrgId } = await readState(config);
  const now = new Date();
  const plan = planBootstrap(state, { resend: args.resend, now });
  if ("refuse" in plan) return fail(plan.refuse);

  // Antes de escribir nada: si el correo no va a llegar, no se deja un
  // administrador creado al que nadie puede activar.
  if (plan.sendEmail && process.env.NODE_ENV === "production") {
    const deliveryError = productionDeliveryError();
    if (deliveryError) return fail(deliveryError);
  }

  const { orgId, orgName, token } = await prisma.$transaction(async (tx) => {
    // ACTIVE y no el PENDING_PAYMENT por defecto: la purga de organizaciones
    // sin pagar (data-retention.ts) borraría la de plataforma a los días, porque
    // no tiene socios, ni centros, ni cobros. Es exactamente su perfil.
    const org = plan.createOrg
      ? await tx.organization.create({
          data: { name: config.orgName, slug: config.orgSlug, platformStatus: "ACTIVE", platformStatusSince: now },
          select: { id: true, name: true },
        })
      : plan.activateOrg
        ? await tx.organization.update({
            where: { id: existingOrgId! },
            data: { platformStatus: "ACTIVE", platformStatusSince: now },
            select: { id: true, name: true },
          })
        : await tx.organization.findUniqueOrThrow({ where: { id: existingOrgId! }, select: { id: true, name: true } });

    const identity = await ensureIdentity(tx, { email: config.adminEmail });
    const user = plan.createUser
      ? await tx.user.create({
          data: {
            identityId: identity.id,
            orgId: org.id,
            centerId: null,
            name: config.adminName,
            email: identity.email,
            role: PLATFORM_ROLE,
          },
          select: { id: true },
        })
      : await tx.user.findUniqueOrThrow({
          where: { orgId_email: { orgId: org.id, email: identity.email } },
          select: { id: true },
        });

    let invitationToken: string | null = null;
    if (plan.invitation === "create") {
      const created = await tx.invitation.create({
        data: {
          orgId: org.id,
          type: "STAFF",
          token: generateInvitationToken(),
          email: identity.email,
          userId: user.id,
          expiresAt: invitationExpiry(),
        },
      });
      invitationToken = created.token;
    } else if (plan.invitation === "renew") {
      // `Invitation.userId` es único: se renueva la fila, no se crea otra.
      const renewed = await tx.invitation.update({
        where: { userId: user.id },
        data: { token: generateInvitationToken(), expiresAt: invitationExpiry(), usedAt: null },
      });
      invitationToken = renewed.token;
    } else if (plan.invitation === "keep") {
      const kept = await tx.invitation.findUniqueOrThrow({ where: { userId: user.id } });
      invitationToken = kept.token;
    }

    if (plan.createOrg || plan.activateOrg || plan.createUser || plan.invitation === "create" || plan.invitation === "renew") {
      // Sin actor: lo hace una persona desde una shell, no una sesión. El token
      // NO va en los metadatos: el log lo leen más personas que el enlace.
      await tx.auditLog.create({
        data: {
          orgId: org.id,
          action: AUDIT_ACTION,
          entityType: "User",
          entityId: user.id,
          metadata: {
            createdOrg: plan.createOrg,
            activatedOrg: plan.activateOrg,
            createdUser: plan.createUser,
            invitation: plan.invitation,
          },
        },
      });
    }

    return { orgId: org.id, orgName: org.name, token: invitationToken };
  });

  console.log(`Organización de plataforma: ${config.orgSlug} (${orgId})${plan.createOrg ? " · creada" : plan.activateOrg ? " · activada" : " · ya existía"}`);
  console.log(`Administrador de plataforma: ${config.adminEmail}${plan.createUser ? " · creado" : " · ya existía"}`);

  if (plan.invitation === "none") {
    console.log("Ya tiene contraseña en Apta: entra con la suya, no hace falta invitación.");
    return;
  }

  if (plan.sendEmail && token) {
    await sendMail({
      to: config.adminEmail,
      // RB-MARCA-001: correo de plataforma, firma Training Zone.
      fromName: "Training Zone",
      subject: `Tu acceso de administración de plataforma — ${orgName}`,
      html: renderStaffInviteEmail({
        staffFirstName: config.adminName.split(/\s+/)[0] ?? config.adminName,
        orgName,
        orgLogoUrl: absoluteUrl("/brand/tz-logo-white.png"),
        roleLabel: ROLE_LABEL[PLATFORM_ROLE],
        onboardingUrl: onboardingUrlFor(token),
      }),
    });
    // `sendMail` no propaga los fallos de Brevo (los registra en el log): si no
    // llega, se relanza con --reenviar.
    console.log("Invitación enviada por correo. Si no llega, vuelve a ejecutar con --reenviar.");
  } else {
    console.log("La invitación vigente sigue pendiente. Para mandarla otra vez: --reenviar.");
  }
}

// Solo al ejecutarlo como script: el test importa las funciones puras.
if (/bootstrap-plataforma\.ts$/.test(process.argv[1] ?? "")) {
  main()
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
