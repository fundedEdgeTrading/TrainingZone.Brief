import type { AccountDeletionRequest, AccountDeletionSource, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";
import { isCenterInScope, type ScopedUser } from "@/lib/center-scope";
import { getRetentionDays } from "@/lib/data-retention";
import { renderAccountDeletionAckEmail } from "@/lib/emails/templates";
import { getHealthRecordsForMember, getProgressEntriesForMember } from "@/lib/health-access";
import { sendMail } from "@/lib/mailer";
import { getSuppressionPlan, type SuppressionAction, type SuppressionEffect } from "@/lib/member-suppression";
import { canDeleteMembers } from "@/lib/rbac";
import { absoluteUrl } from "@/lib/site";

/**
 * E5-15 · Borrado de cuenta a petición del socio, desde la app y desde el portal.
 *
 * Por qué existe y por qué se resuelve como SOLICITUD y no como borrado
 * inmediato: hay cobros que no se pueden borrar. El art. 30 CCom y el art. 66
 * LGT obligan a conservar los justificantes, así que un botón que prometiera
 * "se borra todo ahora" estaría mintiendo o destruyendo documentación. Lo que
 * sí es exigible —y lo que esta historia garantiza— es el plazo del art. 12.3
 * RGPD (un mes), el acuse al socio y que en todo momento sepa en qué estado
 * está su solicitud.
 *
 * No es normativa española lo que lo hace bloqueante: es contractual con las
 * tiendas (App Store Review Guideline 5.1.1(v) y la política de Google Play,
 * que exige ruta in-app **y** URL web accesible desde la ficha).
 *
 * ## El texto que ve el socio no se redacta aquí
 *
 * El escenario que más fácil se rompe sin que se note es el cuarto: el texto
 * que describe qué se conserva. E10-09 ya resolvió ese problema para el
 * diálogo de dirección, y la forma de resolverlo NO fue reescribir el texto
 * sino hacer que texto y ejecución salgan del mismo sitio
 * (`buildSuppressionPlan`, en `member-suppression.ts`). Aquí se reutiliza ese
 * mismo plan: el socio lee, campo por campo, exactamente lo que el borrado va
 * a hacer, con los plazos vigentes de SU organización
 * (`RetentionPolicy`/`RETENTION_DEFAULTS`, E10-08). Copiar aquí una tabla de
 * rótulos y plazos "como espejo" es justo el fallo que ya está documentado.
 *
 * ## Datos de salud
 *
 * La pantalla que enumera qué se va a borrar es una pantalla más: todo acceso
 * a datos de salud pasa por `health-access.ts` y un rol sin autorización
 * recibe `null`, nunca un error que revele si el dato existe. `MEMBER` no
 * está en `canViewHealthData`, así que el socio ve el bloque de salud SIN
 * recuentos —qué se hace con él y con qué base legal, que es lo que el art.
 * 13 le debe— y la pantalla no se rompe por ello. Un rol autorizado que mire
 * la misma solicitud sí ve los recuentos, y su lectura queda en `AuditLog`.
 */

// ---------------------------------------------------------------------------
// Plazo del art. 12.3 RGPD
// ---------------------------------------------------------------------------

/**
 * Un mes natural desde la solicitud, no treinta días: el art. 12.3 habla de
 * mes, y un 31 de enero vence el 28 (o 29) de febrero, no el 3 de marzo.
 * `setUTCMonth` desborda al mes siguiente cuando el día no existe, así que se
 * recorta al último día del mes correcto.
 */
export function accountDeletionDueDate(requestedAt: Date): Date {
  const due = new Date(requestedAt.getTime());
  const day = due.getUTCDate();
  due.setUTCMonth(due.getUTCMonth() + 1);
  if (due.getUTCDate() < day) due.setUTCDate(0);
  return due;
}

/** Cómo se cita el plazo en pantalla. Una sola redacción para web y app. */
export const ACCOUNT_DELETION_DEADLINE_TEXT =
  "Tu centro tiene un mes para atenderla (art. 12.3 RGPD). Recibirás un acuse ahora y otro cuando se resuelva.";

// ---------------------------------------------------------------------------
// Rutas estables
// ---------------------------------------------------------------------------

/**
 * URL pública que exige Google Play y que la ficha de tienda enlaza (E9-16, la
 * construye otra pista). Se declara aquí, junto a la funcionalidad, para que
 * quien la enlace importe la constante en vez de teclear la ruta: una URL de
 * borrado de cuenta que deja de resolver es un motivo de rechazo en la tienda.
 */
export const ACCOUNT_DELETION_PUBLIC_PATH = "/borrar-cuenta";

/** La misma solicitud, ya dentro del portal del socio. */
export const ACCOUNT_DELETION_PORTAL_PATH = "/portal/perfil/borrar-cuenta";

// ---------------------------------------------------------------------------
// Qué se borra, qué se conserva y por cuánto tiempo
// ---------------------------------------------------------------------------

/** Bloques del plan de supresión que contienen datos del art. 9 RGPD. */
const HEALTH_EFFECT_KEYS: ReadonlySet<SuppressionEffect["key"]> = new Set(["healthRecords", "progressEntries"]);

/**
 * Redacción sin recuentos para quien no está autorizado a leer datos de salud.
 * Solo sustituye el `detail` —rótulo, acción y base legal siguen saliendo del
 * plan compartido—, porque lo único que sobra es el número: decir "tienes 7
 * registros de lesión" ES un acceso al dato.
 */
const HEALTH_DETAIL_WITHOUT_COUNTS: Record<string, string> = {
  healthRecords:
    "Tus lesiones, condiciones de salud y el historial clínico que declaraste dejan de estar ligados a tu persona " +
    "y se borran al cumplirse el plazo de conservación de tu centro. No te decimos cuántos registros hay: " +
    "enumerarlos sería un acceso a datos de salud, y esta pantalla no lo hace.",
  progressEntries:
    "Tus fotos de evolución y tus medidas de composición corporal se borran. No hay ninguna obligación de " +
    "conservarlas.",
};

export type AccountDeletionEffect = {
  key: SuppressionEffect["key"];
  label: string;
  action: SuppressionAction;
  detail: string;
  legalBasis?: string;
  /** `null` cuando no es una cuenta, o cuando no se puede enseñar el recuento. */
  count: number | null;
};

export type AccountDeletionDisclosure = {
  effects: AccountDeletionEffect[];
  /** Plazos vigentes en la organización, en días. Salen del motor, no de aquí. */
  retention: {
    billingDays: number;
    healthDays: number;
    /**
     * `docs/legal/03-PLAZOS-CONSERVACION.md` es un BORRADOR marcado
     * ⟦PENDIENTE: validación — 00.C.3⟧: los plazos son la propuesta de
     * anclaje, no un dictamen. Se dice en la interfaz en vez de presentarlos
     * como cerrados — y en vez de inventar otro número.
     */
    pendingLegalReview: true;
  };
  /** `false` cuando el bloque de salud va sin recuentos (rol sin autorización). */
  healthCountsVisible: boolean;
};

/**
 * El plan de supresión tal y como se le puede enseñar a `actorRole`.
 *
 * `null` solo si el socio no existe en esa organización — nunca por falta de
 * permiso sobre salud: eso se resuelve quitando los recuentos, no negando la
 * pantalla.
 */
export async function getAccountDeletionDisclosure(input: {
  memberId: string;
  orgId: string;
  actorUserId: string;
  actorRole: Role;
  now?: Date;
}): Promise<AccountDeletionDisclosure | null> {
  const { memberId, orgId, actorUserId, actorRole } = input;

  // Punto único de lectura de datos de salud: decide si se pueden enseñar
  // recuentos y deja la traza de quien sí está autorizado. Para `MEMBER`
  // devuelve `null` sin tocar la tabla.
  const [healthRecords, progressEntries] = await Promise.all([
    getHealthRecordsForMember({ memberId, orgId, actorUserId, actorRole }),
    getProgressEntriesForMember({ memberId, orgId, actorUserId, actorRole }),
  ]);
  const healthCountsVisible = healthRecords !== null && progressEntries !== null;

  const [plan, days] = await Promise.all([getSuppressionPlan(memberId, orgId, input.now), getRetentionDays(orgId)]);
  if (!plan) return null;

  const effects: AccountDeletionEffect[] = plan.effects.map((effect) => {
    if (healthCountsVisible || !HEALTH_EFFECT_KEYS.has(effect.key)) return { ...effect };
    return { ...effect, count: null, detail: HEALTH_DETAIL_WITHOUT_COUNTS[effect.key] ?? effect.detail };
  });

  return {
    effects,
    retention: { billingDays: days.CONTRACT_BILLING, healthDays: days.HEALTH_DATA, pendingLegalReview: true },
    healthCountsVisible,
  };
}

// ---------------------------------------------------------------------------
// Confirmación con contraseña
// ---------------------------------------------------------------------------

export type PasswordConfirmation =
  | { ok: true }
  | { ok: false; reason: "WRONG_PASSWORD" | "NO_PASSWORD" };

/**
 * Reautenticación antes de pedir el borrado. La sesión ya está abierta: lo que
 * se comprueba aquí es que quien tiene el teléfono en la mano es la persona,
 * no que pueda entrar.
 *
 * `NO_PASSWORD` no es un fallo del socio: es una identidad sin contraseña
 * utilizable (alta por invitación que nunca la fijó, o proveedor externo). La
 * pantalla lo traduce a "fija primero tu contraseña", que es un camino real
 * —`/recuperar-clave`— y no un callejón sin salida.
 */
export async function confirmPasswordForUser(userId: string, password: string): Promise<PasswordConfirmation> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { identity: { select: { passwordHash: true, passwordSetAt: true, authProvider: true } } },
  });
  const identity = user?.identity;
  if (!identity || !identity.passwordSetAt || identity.authProvider !== "password") {
    return { ok: false, reason: "NO_PASSWORD" };
  }
  const valid = await bcrypt.compare(password, identity.passwordHash);
  return valid ? { ok: true } : { ok: false, reason: "WRONG_PASSWORD" };
}

// ---------------------------------------------------------------------------
// La solicitud
// ---------------------------------------------------------------------------

export type AccountDeletionRequestView = {
  id: string;
  status: AccountDeletionRequest["status"];
  source: AccountDeletionSource;
  requestedAt: Date;
  dueAt: Date;
  resolvedAt: Date | null;
  resolutionNotes: string | null;
};

function toView(request: AccountDeletionRequest): AccountDeletionRequestView {
  return {
    id: request.id,
    status: request.status,
    source: request.source,
    requestedAt: request.requestedAt,
    dueAt: request.dueAt,
    resolvedAt: request.resolvedAt,
    resolutionNotes: request.resolutionNotes,
  };
}

/**
 * La solicitud viva del socio, si la hay. Es lo que convierte "he pedido el
 * borrado" en un estado consultable: sin esto el socio se queda sin saber si
 * su petición llegó, que es lo único que la historia NO permite.
 */
export async function getOpenDeletionRequest(
  memberId: string,
  orgId: string,
): Promise<AccountDeletionRequestView | null> {
  const request = await prisma.accountDeletionRequest.findFirst({
    where: { memberId, orgId, status: "PENDING" },
    orderBy: { requestedAt: "desc" },
  });
  return request ? toView(request) : null;
}

/** La última solicitud, esté abierta o ya resuelta: el socio ve también el desenlace. */
export async function getLatestDeletionRequest(
  memberId: string,
  orgId: string,
): Promise<AccountDeletionRequestView | null> {
  const request = await prisma.accountDeletionRequest.findFirst({
    where: { memberId, orgId },
    orderBy: { requestedAt: "desc" },
  });
  return request ? toView(request) : null;
}

/**
 * Acuse al socio (escenario "plazo"). Best-effort, igual que el resto del
 * correo transaccional (RB-SMTP-001): que el proveedor de correo esté caído no
 * puede tumbar el ejercicio de un derecho — la solicitud ya está escrita, con
 * su fecha límite, y el portal y la app la enseñan.
 */
async function sendDeletionAck(input: {
  memberId: string;
  dueAt: Date;
  resolution?: { outcomeLabel: string; notes: string };
}) {
  const member = await prisma.member.findUnique({
    where: { id: input.memberId },
    select: {
      firstName: true,
      email: true,
      organization: { select: { name: true, logoUrl: true } },
      primaryCenter: { select: { name: true, address: true } },
    },
  });
  if (!member?.email) return;

  const brandName = member.organization.name;
  try {
    await sendMail({
      to: member.email,
      // RB-MARCA-001: firma el centro, que es con quien el socio tiene la relación.
      fromName: brandName,
      subject: input.resolution
        ? `Tu solicitud de borrado de cuenta, resuelta — ${brandName}`
        : `Hemos recibido tu solicitud de borrado de cuenta — ${brandName}`,
      html: renderAccountDeletionAckEmail({
        recipientFirstName: member.firstName,
        brandName,
        brandLogoUrl: absoluteUrl(member.organization.logoUrl || "/brand/tz-logo-white.png"),
        dueDateLabel: input.dueAt.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" }),
        statusUrl: absoluteUrl(ACCOUNT_DELETION_PORTAL_PATH),
        centerName: member.primaryCenter.name,
        postalAddress: member.primaryCenter.address ?? undefined,
        resolution: input.resolution,
      }),
    });
  } catch (error) {
    console.error("[borrado-cuenta] no se pudo enviar el acuse:", error);
  }
}

export type RequestDeletionResult =
  | { ok: true; request: AccountDeletionRequestView; alreadyOpen?: true }
  | { ok: false; error: string };

export const ACCOUNT_DELETION_NOT_FOUND = "No se ha encontrado tu ficha de socio.";

/**
 * Alta de la solicitud. Dos comprobaciones de ámbito, y las dos hacen falta:
 *
 *  1. La ficha es del socio que la pide (`userId`), no de otro — el `memberId`
 *     nunca llega del cliente, pero el emparejamiento se comprueba igual.
 *  2. El centro principal de esa ficha pertenece a la organización de la
 *     sesión. Sin esto, una ficha mal migrada dejaría una solicitud —y su
 *     resolución— colgando de un centro de otra organización.
 */
export async function requestAccountDeletion(input: {
  memberId: string;
  orgId: string;
  actorUserId: string;
  source: AccountDeletionSource;
  now?: Date;
}): Promise<RequestDeletionResult> {
  const now = input.now ?? new Date();

  const member = await prisma.member.findFirst({
    where: {
      id: input.memberId,
      orgId: input.orgId,
      userId: input.actorUserId,
      primaryCenter: { orgId: input.orgId },
    },
    select: { id: true, primaryCenterId: true },
  });
  if (!member) return { ok: false, error: ACCOUNT_DELETION_NOT_FOUND };

  // Dos plazos del art. 12.3 corriendo en paralelo sobre lo mismo no tienen
  // sentido: la que ya está abierta ES la respuesta. El índice único parcial
  // de la base de datos lo impide igualmente (ver la migración de las
  // costuras), así que esto es la versión legible del mismo candado.
  const open = await prisma.accountDeletionRequest.findFirst({
    where: { memberId: member.id, orgId: input.orgId, status: "PENDING" },
  });
  if (open) return { ok: true, request: toView(open), alreadyOpen: true };

  const request = await prisma.accountDeletionRequest.create({
    data: {
      orgId: input.orgId,
      memberId: member.id,
      source: input.source,
      requestedAt: now,
      dueAt: accountDeletionDueDate(now),
    },
  });

  await prisma.auditLog.create({
    data: {
      orgId: input.orgId,
      actorUserId: input.actorUserId,
      action: "ACCOUNT_DELETION_REQUESTED",
      entityType: "AccountDeletionRequest",
      entityId: request.id,
      memberId: member.id,
      metadata: {
        source: input.source,
        centerId: member.primaryCenterId,
        dueAt: request.dueAt.toISOString(),
      },
    },
  });

  await sendDeletionAck({ memberId: member.id, dueAt: request.dueAt });

  return { ok: true, request: toView(request) };
}

export type ResolveDeletionResult =
  | { ok: true; request: AccountDeletionRequestView }
  | { ok: false; error: string };

/**
 * Resolución por parte del centro. El borrado material lo ejecuta
 * `deleteMember` (E10-09, con su plan de supresión); esto es el otro extremo
 * del plazo: quién la atendió, cuándo y con qué desenlace, para que el socio
 * pueda verlo y para que quede en `AuditLog`.
 *
 * El ámbito de centro se comprueba sobre el centro principal del socio, con
 * `isCenterInScope`: una dirección de centro no resuelve la solicitud de un
 * socio de otro centro, igual que no puede abrir su ficha.
 */
export async function resolveAccountDeletion(input: {
  requestId: string;
  actor: ScopedUser;
  status: "COMPLETED" | "REJECTED";
  resolutionNotes: string;
  now?: Date;
}): Promise<ResolveDeletionResult> {
  const { actor } = input;
  if (!canDeleteMembers(actor.role)) {
    return { ok: false, error: "No tienes permiso para resolver solicitudes de borrado." };
  }

  const request = await prisma.accountDeletionRequest.findFirst({
    where: { id: input.requestId, orgId: actor.orgId },
    include: { member: { select: { id: true, primaryCenterId: true } } },
  });
  if (!request) return { ok: false, error: "No se ha encontrado esa solicitud." };
  if (request.status !== "PENDING") return { ok: false, error: "Esa solicitud ya está resuelta." };

  if (!(await isCenterInScope(actor, request.member.primaryCenterId))) {
    return { ok: false, error: "Ese socio no es de uno de tus centros." };
  }

  const notes = input.resolutionNotes.trim();
  if (!notes) return { ok: false, error: "Explica qué se ha hecho: es el acuse que se le debe al socio." };

  const resolved = await prisma.accountDeletionRequest.update({
    where: { id: request.id },
    data: {
      status: input.status,
      resolvedAt: input.now ?? new Date(),
      resolvedByUserId: actor.id,
      resolutionNotes: notes,
    },
  });

  await prisma.auditLog.create({
    data: {
      orgId: actor.orgId,
      actorUserId: actor.id,
      action: "ACCOUNT_DELETION_RESOLVED",
      entityType: "AccountDeletionRequest",
      entityId: resolved.id,
      memberId: request.member.id,
      metadata: {
        status: input.status,
        centerId: request.member.primaryCenterId,
        onTime: (resolved.resolvedAt ?? new Date()) <= resolved.dueAt,
      },
    },
  });

  await sendDeletionAck({
    memberId: request.member.id,
    dueAt: resolved.dueAt,
    resolution: {
      outcomeLabel: input.status === "COMPLETED" ? "Atendida" : "Denegada",
      notes,
    },
  });

  return { ok: true, request: toView(resolved) };
}
