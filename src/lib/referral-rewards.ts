/**
 * R1 · La recompensa del referido: los tres estados, el antifraude y LA TAREA.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LA RECOMPENSA NO SE APLICA SOLA. Este fichero no toca un `Payment`, ni un
 * recibo, ni un cupón de Stripe, y no lo hará nunca. "Liberar" una recompensa
 * significa exactamente dos cosas: escribir la fila de `ReferralReward` y
 * CREAR LA TAREA a administración para que una persona la valide y la marque
 * como pagada. Nada más. Si alguna vez parece más elegante aplicar el descuento
 * automáticamente, no lo es: un sistema que toca recibos por su cuenta
 * descuadra Stripe, y `AGENTS.md` es explícito sobre lo que se puede y no se
 * puede hacer con su catálogo. Es la única línea del encargo que negocio
 * subrayó, y coincide con una invariante del trimestre.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Los tres saltos son `PENDING_VALIDATION → VALIDATED → PAID` (más `REJECTED`,
 * que es el desenlace que el escenario "validar a mano" implica: si se valida a
 * mano, se puede no validar). Cada salto guarda QUIÉN y CUÁNDO.
 *
 * EL ANTIFRAUDE ES LÓGICA PURA y vive en la primera mitad del fichero, sin
 * `prisma` por medio: las tres reglas se prueban con los casos sucios dentro
 * —excliente de hace cinco meses y veintinueve días, socio importado sin
 * `cancelledAt`, referido que se da de alta dos veces— sin sembrar una base de
 * datos. La segunda mitad es la que va a buscar los hechos y escribe.
 */
import type { MemberState, Prisma, ReferralRewardBeneficiary, ReferralRewardKind } from "@prisma/client";

import { isCenterInScope, centerScopeFor, type ScopedUser } from "@/lib/center-scope";
import { createNotificationOnce, pickCenterTaskRecipient, resolveNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import {
  assessCodeValidityRule,
  assessExMemberRule,
  assessRepeatRule,
  BENEFICIARY_LABEL,
  combineVerdicts,
  DEFAULT_PROGRAM,
  MS_PER_DAY,
  referralStateOf,
  rewardAmountLabel,
  validateProgramInput,
  type PriorMemberFacts,
  type ProgramConfigView,
  type RewardStatusKey,
  type SaveProgramInput,
} from "@/lib/referral-program";

/**
 * LA PARTE PURA VIVE EN `referral-program.ts` y se reexporta aquí: las tres
 * reglas antifraude, la validación del programa y los rótulos. Van allí porque
 * el formulario del programa es un componente de CLIENTE y no puede importar
 * nada que arrastre `prisma` al bundle del navegador —mismo patrón que
 * `coupon-code.ts` respecto a `stripe-coupons.ts`—, y porque una regla que
 * decide dinero se prueba mejor cuando no tiene ni cómo ir a buscar un dato:
 * recibe hechos y devuelve un veredicto.
 *
 * Este fichero es la otra mitad: la que VA A BUSCAR esos hechos y escribe.
 */
export * from "@/lib/referral-program";

/* ========================================================================= *
 * SEGUNDA MITAD · los hechos, la escritura y LA TAREA
 * ========================================================================= */

/**
 * Entidad de la tarea. NO está en el catálogo de `tasks.ts` (que es de M3) a
 * propósito: su espacio de nombres propio es justo lo que `createNotificationOnce`
 * necesita para no confundir esta tarea con ninguna otra sobre la misma
 * persona, y catalogarla exigiría tocar un fichero ajeno.
 */
export const REFERRAL_REWARD_TASK_ENTITY = "ReferralReward";

/** Días para validar. No es una fecha límite dura: ordena la bandeja. */
const REWARD_TASK_DUE_DAYS = 7;

export type ProgramWriteResult = { ok: true } | { ok: false; error: string };

export async function getReferralProgram(user: ScopedUser, centerId: string): Promise<ProgramConfigView | null> {
  if (!(await isCenterInScope(user, centerId))) return null;
  const row = await prisma.referralProgramConfig.findFirst({ where: { centerId, orgId: user.orgId } });
  if (!row) return { centerId, ...DEFAULT_PROGRAM };
  return {
    centerId,
    active: row.active,
    referrerKind: row.referrerKind,
    referrerAmountCents: row.referrerAmountCents,
    referrerSessions: row.referrerSessions,
    referredKind: row.referredKind,
    referredAmountCents: row.referredAmountCents,
    referredSessions: row.referredSessions,
    exMemberCooldownDays: row.exMemberCooldownDays,
  };
}

export async function saveReferralProgram(
  user: ScopedUser,
  centerId: string,
  input: SaveProgramInput
): Promise<ProgramWriteResult> {
  if (!(await isCenterInScope(user, centerId))) return { ok: false, error: "Centro fuera de tu ámbito." };
  const center = await prisma.center.findFirst({ where: { id: centerId, orgId: user.orgId }, select: { id: true } });
  if (!center) return { ok: false, error: "Centro no encontrado." };

  const valid = validateProgramInput(input);
  if (!valid.ok) return valid;

  // Se guarda solo el lado que corresponde a cada `kind`: dejar un importe
  // colgado de un programa de sesiones es exactamente cómo se acaba pagando
  // dos veces la misma recompensa.
  const data = {
    active: input.active,
    referrerKind: input.referrerKind,
    referrerAmountCents: input.referrerKind === "FIXED_AMOUNT" ? input.referrerAmountCents : null,
    referrerSessions: input.referrerKind === "FREE_SESSIONS" ? input.referrerSessions : null,
    referredKind: input.referredKind,
    referredAmountCents: input.referredKind === "FIXED_AMOUNT" ? input.referredAmountCents : null,
    referredSessions: input.referredKind === "FREE_SESSIONS" ? input.referredSessions : null,
    exMemberCooldownDays: input.exMemberCooldownDays,
  };

  await prisma.referralProgramConfig.upsert({
    where: { centerId },
    create: { orgId: user.orgId, centerId, ...data },
    update: data,
  });
  return { ok: true };
}

/* ------------------------------------------------------------------------- *
 * LIBERAR · lo único que ocurre solo, y lo único que hace es crear una tarea
 * ------------------------------------------------------------------------- */

export type ReleaseReport = {
  created: number;
  /** Por qué no se creó nada, cuando no se creó nada. Se escribe en `AuditLog`. */
  skippedReason: string | null;
  reviewRequired: boolean;
};

const NOTHING: ReleaseReport = { created: 0, skippedReason: null, reviewRequired: false };

/**
 * SE LLAMA EN EL ALTA, desde `confirmLeadClosureForMember` (`leads-queries.ts`),
 * que es el único sitio del repositorio donde un lead pasa a `CERRADO` con su
 * socio creado. No hay cron ni segundo camino: el alta es un hecho del embudo y
 * la recompensa cuelga de ese hecho.
 *
 * Es IDEMPOTENTE y NO LANZA: si algo va mal aquí, el alta del socio —que es lo
 * importante— ya está hecha y no se deshace porque el programa de referidos
 * tenga un mal día. Lo que no se escribe se ve en `AuditLog`.
 */
export async function releaseReferralRewardsForLead(orgId: string, leadId: string): Promise<ReleaseReport> {
  try {
    return await release(orgId, leadId);
  } catch (error) {
    await audit(orgId, null, "REFERRAL_REWARD_RELEASE_FAILED", leadId, {
      message: error instanceof Error ? error.message : String(error),
    });
    return { ...NOTHING, skippedReason: "error" };
  }
}

async function release(orgId: string, leadId: string): Promise<ReleaseReport> {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, orgId },
    select: {
      id: true,
      orgId: true,
      centerId: true,
      createdAt: true,
      status: true,
      email: true,
      phone: true,
      convertedMemberId: true,
      referredByMemberId: true,
      referralCodeId: true,
      referralCode: { select: { revokedAt: true } },
      referredBy: { select: { id: true, state: true } },
    },
  });
  if (!lead || !lead.referredByMemberId || !lead.referredBy) return NOTHING;
  // El estado no se guarda: se deriva, con la misma función que usa el panel.
  if (referralStateOf(lead) !== "ALTA" || !lead.convertedMemberId) return NOTHING;

  const config = await prisma.referralProgramConfig.findFirst({ where: { centerId: lead.centerId, orgId } });
  if (!config || !config.active) {
    return { ...NOTHING, skippedReason: "El programa de referidos de este centro no está activo." };
  }

  const now = new Date();
  const prior = await findPriorMember(orgId, lead.convertedMemberId, lead.email, lead.phone);
  const [rewardsForThisLead, rewardsForThisPerson] = await Promise.all([
    prisma.referralReward.count({ where: { leadId: lead.id } }),
    countRewardsForPerson(orgId, [lead.convertedMemberId, ...(prior ? [prior.id] : [])]),
  ]);

  const verdict = combineVerdicts([
    assessRepeatRule({ rewardsForThisLead, rewardsForThisPerson }),
    assessExMemberRule({ now, cooldownDays: config.exMemberCooldownDays, prior }),
    assessCodeValidityRule({
      usedLink: lead.referralCodeId !== null,
      leadCreatedAt: lead.createdAt,
      codeRevokedAt: lead.referralCode?.revokedAt ?? null,
      referrerState: lead.referredBy.state,
    }),
  ]);

  if (verdict.decision === "BLOCK") {
    await audit(orgId, lead.referredByMemberId, "REFERRAL_REWARD_BLOCKED", lead.id, { reason: verdict.reason });
    return { ...NOTHING, skippedReason: verdict.reason };
  }
  const reviewRequired = verdict.decision === "REVIEW";

  // A doble cara cuando el centro lo ha configurado: quien trae SIEMPRE, quien
  // entra solo si `referredKind` no es null. Las dos son tareas, ninguna es un
  // automatismo.
  const sides: { beneficiary: ReferralRewardBeneficiary; kind: ReferralRewardKind; cents: number | null; sessions: number | null }[] =
    [
      {
        beneficiary: "REFERRER",
        kind: config.referrerKind,
        cents: config.referrerAmountCents,
        sessions: config.referrerSessions,
      },
    ];
  if (config.referredKind) {
    sides.push({
      beneficiary: "REFERRED",
      kind: config.referredKind,
      cents: config.referredAmountCents,
      sessions: config.referredSessions,
    });
  }

  let created = 0;
  for (const side of sides) {
    const reward = await createReward({
      orgId,
      centerId: lead.centerId,
      leadId: lead.id,
      referrerMemberId: lead.referredByMemberId,
      // Para `REFERRED` el beneficiario es el socio que acaba de nacer del lead.
      beneficiaryMemberId: side.beneficiary === "REFERRER" ? lead.referredByMemberId : lead.convertedMemberId,
      beneficiary: side.beneficiary,
      kind: side.kind,
      // El importe se CONGELA aquí: cambiar mañana la configuración del centro
      // no puede reescribir lo que se prometió por un alta de hoy.
      amountCents: side.kind === "FIXED_AMOUNT" ? side.cents : null,
      sessions: side.kind === "FREE_SESSIONS" ? side.sessions : null,
      reviewRequired,
      reviewReason: verdict.reason,
    });
    if (reward) created++;
  }

  return { created, skippedReason: null, reviewRequired };
}

async function createReward(input: {
  orgId: string;
  centerId: string;
  leadId: string;
  referrerMemberId: string;
  beneficiaryMemberId: string | null;
  beneficiary: ReferralRewardBeneficiary;
  kind: ReferralRewardKind;
  amountCents: number | null;
  sessions: number | null;
  reviewRequired: boolean;
  reviewReason: string | null;
}): Promise<{ id: string } | null> {
  let reward: { id: string };
  try {
    reward = await prisma.referralReward.create({
      data: {
        orgId: input.orgId,
        centerId: input.centerId,
        leadId: input.leadId,
        referrerMemberId: input.referrerMemberId,
        beneficiaryMemberId: input.beneficiaryMemberId,
        beneficiary: input.beneficiary,
        kind: input.kind,
        amountCents: input.amountCents,
        sessions: input.sessions,
        reviewRequired: input.reviewRequired,
        reviewReason: input.reviewReason,
      },
      select: { id: true },
    });
  } catch {
    // `@@unique([leadId, beneficiary])`: antifraude 2 en la base de datos. Dos
    // llamadas a la vez sobre el mismo alta no escriben dos recompensas.
    return null;
  }

  const notificationId = await openAdminTask({
    orgId: input.orgId,
    centerId: input.centerId,
    rewardId: reward.id,
    beneficiary: input.beneficiary,
    label: rewardAmountLabel({ kind: input.kind, amountCents: input.amountCents, sessions: input.sessions }),
    reviewRequired: input.reviewRequired,
    reviewReason: input.reviewReason,
  });
  if (notificationId) {
    await prisma.referralReward.update({ where: { id: reward.id }, data: { notificationId } });
  }

  await audit(input.orgId, input.referrerMemberId, "REFERRAL_REWARD_RELEASED", reward.id, {
    leadId: input.leadId,
    beneficiary: input.beneficiary,
    kind: input.kind,
    amountCents: input.amountCents,
    sessions: input.sessions,
    reviewRequired: input.reviewRequired,
    reviewReason: input.reviewReason,
    notificationId,
  });
  return reward;
}

/**
 * LA TAREA. Esto es lo único que "libera" una recompensa.
 *
 * Va a ADMINISTRACIÓN: recepción del centro, que es quien hace ese trabajo (y
 * por eso `/referidos` está en su menú, ver el comentario de `NAV_BY_ROLE`), y
 * dirección como respaldo cuando el centro no tiene recepción. El reparto entre
 * candidatos lo decide `pickCenterTaskRecipient`, que ya sabe quién tiene hueco
 * esta semana — no se abre un abanico de siete copias idénticas.
 *
 * Devuelve `null` cuando no hay a quién encargársela o cuando el tope semanal
 * la ha dejado para más adelante. La recompensa se escribe IGUALMENTE y se ve
 * en `/referidos`: el dinero prometido no depende de que quepa una tarea.
 */
async function openAdminTask(input: {
  orgId: string;
  centerId: string;
  rewardId: string;
  beneficiary: ReferralRewardBeneficiary;
  label: string;
  reviewRequired: boolean;
  reviewReason: string | null;
}): Promise<string | null> {
  const staff = await prisma.user.findMany({
    where: {
      orgId: input.orgId,
      deactivatedAt: null,
      OR: [{ role: "RECEPTION" }, { role: "CENTER_DIRECTOR" }, { role: "OWNER" }],
    },
    select: { id: true, role: true, centerId: true },
  });
  const ofCenter = staff.filter((u) => u.centerId === input.centerId);
  const candidates = ofCenter.filter((u) => u.role === "RECEPTION");
  const pool = candidates.length
    ? candidates
    : ofCenter.length
      ? ofCenter
      : staff.filter((u) => u.role === "OWNER");
  const recipientUserId = await pickCenterTaskRecipient(
    input.orgId,
    pool.map((u) => u.id)
  );
  if (!recipientUserId) return null;

  const who = BENEFICIARY_LABEL[input.beneficiary].toLowerCase();
  const result = await createNotificationOnce({
    orgId: input.orgId,
    recipientUserId,
    kind: "TASK",
    priority: "ALTA",
    title: input.reviewRequired
      ? `Recompensa de referido A REVISAR (${who}): ${input.label}`
      : `Validar recompensa de referido (${who}): ${input.label}`,
    body:
      "Ábrela en Referidos, comprueba que el alta es buena y márcala como validada; cuando la hayáis aplicado, " +
      "márcala como pagada. El sistema NO descuenta nada solo: el descuento del próximo recibo o las sesiones " +
      "las aplica una persona, a mano." +
      (input.reviewReason ? `\n\nPor qué hay que mirarla: ${input.reviewReason}` : ""),
    entityType: REFERRAL_REWARD_TASK_ENTITY,
    entityId: input.rewardId,
    dueDate: new Date(Date.now() + REWARD_TASK_DUE_DAYS * MS_PER_DAY),
  });
  return result.status === "capped" ? null : result.id;
}

/**
 * ¿Existe ya una ficha de esta persona en la casa, distinta de la que acaba de
 * nacer del lead? Se busca por email y por teléfono: el email lo bloquea
 * `initiateLeadConversion` (no deja convertir con un email que ya es de un
 * socio), así que el camino realista de un excliente que vuelve es el teléfono
 * de siempre con un correo nuevo.
 */
async function findPriorMember(
  orgId: string,
  newMemberId: string,
  email: string | null,
  phone: string
): Promise<PriorMemberFacts | null> {
  const or: Prisma.MemberWhereInput[] = [];
  if (email?.trim()) or.push({ email: { equals: email.trim(), mode: "insensitive" } });
  if (phone.trim()) or.push({ phone: phone.trim() });
  if (!or.length) return null;

  const prior = await prisma.member.findFirst({
    where: { orgId, id: { not: newMemberId }, OR: or },
    // La más reciente: si hubiera varias fichas de la misma persona, manda la
    // última vez que estuvo.
    orderBy: { joinedAt: "desc" },
    select: {
      id: true,
      state: true,
      cancelledAt: true,
      externalRef: true,
      externalSource: true,
      lastAccessAt: true,
      accountCreatedAt: true,
    },
  });
  return prior;
}

/** Recompensas ya pagadas (o en camino) por CUALQUIERA de estas fichas. */
async function countRewardsForPerson(orgId: string, memberIds: string[]): Promise<number> {
  if (!memberIds.length) return 0;
  return prisma.referralReward.count({
    where: {
      orgId,
      status: { not: "REJECTED" },
      OR: [
        { beneficiaryMemberId: { in: memberIds }, beneficiary: "REFERRED" },
        { lead: { convertedMemberId: { in: memberIds } } },
      ],
    },
  });
}

async function audit(
  orgId: string,
  memberId: string | null,
  action: string,
  entityId: string,
  metadata: Prisma.InputJsonValue
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      orgId,
      actorUserId: null,
      action,
      entityType: REFERRAL_REWARD_TASK_ENTITY,
      entityId,
      memberId,
      metadata,
    },
  });
}

/* ------------------------------------------------------------------------- *
 * LOS DOS SALTOS DE ESTADO · quién y cuándo en cada uno
 * ------------------------------------------------------------------------- */

export type RewardWriteResult = { ok: true } | { ok: false; error: string };

async function loadRewardInScope(user: ScopedUser, rewardId: string) {
  const reward = await prisma.referralReward.findFirst({
    where: { id: rewardId, orgId: user.orgId },
    select: { id: true, centerId: true, status: true, notificationId: true, referrerMemberId: true },
  });
  if (!reward) return null;
  if (!(await isCenterInScope(user, reward.centerId))) return null;
  return reward;
}

/**
 * Pendiente de validar → validada (o rechazada). Guarda quién y cuándo, y el
 * porqué del "no": una recompensa rechazada sin motivo es una conversación
 * incómoda dentro de tres semanas.
 *
 * Validar NO mueve dinero. Sigue sin moverlo. Lo que dice es "esta es buena,
 * aplicadla" — y aplicarla es trabajo de una persona.
 */
export async function reviewReward(
  user: ScopedUser,
  rewardId: string,
  decision: "VALIDATED" | "REJECTED",
  rejectedReason?: string
): Promise<RewardWriteResult> {
  const reward = await loadRewardInScope(user, rewardId);
  if (!reward) return { ok: false, error: "Recompensa no encontrada." };
  if (reward.status !== "PENDING_VALIDATION") {
    return { ok: false, error: "Esta recompensa ya pasó por validación." };
  }
  if (decision === "REJECTED" && !rejectedReason?.trim()) {
    return { ok: false, error: "Di por qué se rechaza: sin motivo no hay forma de explicárselo al socio." };
  }

  const at = new Date();
  await prisma.referralReward.update({
    where: { id: reward.id },
    data: {
      status: decision,
      reviewedByUserId: user.id,
      reviewedAt: at,
      rejectedReason: decision === "REJECTED" ? rejectedReason!.trim() : null,
      // Mirada ya: deja de pedir revisión, pero el motivo se conserva como
      // traza de por qué hubo que mirarla.
      reviewRequired: false,
    },
  });
  // Rechazada: la tarea se acabó. Validada: sigue abierta hasta que se pague,
  // que es el trabajo que de verdad queda pendiente.
  if (decision === "REJECTED") await resolveRewardTask(user, reward.notificationId);

  await audit(user.orgId, reward.referrerMemberId, `REFERRAL_REWARD_${decision}`, reward.id, {
    by: user.id,
    at: at.toISOString(),
    rejectedReason: rejectedReason?.trim() ?? null,
  });
  return { ok: true };
}

/**
 * Validada → pagada. "Pagada" quiere decir que UNA PERSONA ya la ha aplicado:
 * ha descontado el importe del próximo recibo o ha cargado las sesiones. Esta
 * función no hace ninguna de las dos cosas; solo deja constancia de que se
 * hicieron, con quién y cuándo.
 */
export async function markRewardPaid(user: ScopedUser, rewardId: string): Promise<RewardWriteResult> {
  const reward = await loadRewardInScope(user, rewardId);
  if (!reward) return { ok: false, error: "Recompensa no encontrada." };
  if (reward.status === "PAID") return { ok: true };
  if (reward.status !== "VALIDATED") {
    return { ok: false, error: "Primero hay que validarla." };
  }

  const at = new Date();
  await prisma.referralReward.update({
    where: { id: reward.id },
    data: { status: "PAID", paidByUserId: user.id, paidAt: at },
  });
  await resolveRewardTask(user, reward.notificationId);
  await audit(user.orgId, reward.referrerMemberId, "REFERRAL_REWARD_PAID", reward.id, {
    by: user.id,
    at: at.toISOString(),
  });
  return { ok: true };
}

/**
 * Cierra la tarea por el camino de siempre (`resolveNotification` es el único
 * sitio donde se escribe `resolvedAt`). Sin relación de Prisma: la tarea puede
 * haber sido reasignada, resuelta a mano o limpiada por el script de M3, y eso
 * no puede impedir marcar la recompensa.
 */
async function resolveRewardTask(user: ScopedUser, notificationId: string | null): Promise<void> {
  if (!notificationId) return;
  await resolveNotification(user.orgId, user.id, notificationId, { anyRecipient: true });
}

/* ------------------------------------------------------------------------- *
 * Lecturas para las pantallas
 * ------------------------------------------------------------------------- */

export type RewardRow = {
  id: string;
  centerId: string;
  centerName: string;
  status: RewardStatusKey;
  beneficiary: ReferralRewardBeneficiary;
  kind: ReferralRewardKind;
  amountCents: number | null;
  sessions: number | null;
  amountLabel: string;
  reviewRequired: boolean;
  reviewReason: string | null;
  rejectedReason: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
  paidAt: Date | null;
  reviewedByName: string | null;
  paidByName: string | null;
  referrerName: string;
  referredName: string;
};

export async function listRewards(
  user: ScopedUser,
  opts: { status?: RewardRow["status"]; centerId?: string } = {}
): Promise<RewardRow[]> {
  const scope = await centerScopeFor(user);
  if (scope !== null && scope.length === 0) return [];
  const centerIds = opts.centerId
    ? scope === null || scope.includes(opts.centerId)
      ? [opts.centerId]
      : []
    : scope;
  if (centerIds !== null && centerIds.length === 0) return [];

  const rows = await prisma.referralReward.findMany({
    where: {
      orgId: user.orgId,
      ...(centerIds ? { centerId: { in: centerIds } } : {}),
      ...(opts.status ? { status: opts.status } : {}),
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 300,
    select: {
      id: true,
      centerId: true,
      status: true,
      beneficiary: true,
      kind: true,
      amountCents: true,
      sessions: true,
      reviewRequired: true,
      reviewReason: true,
      rejectedReason: true,
      createdAt: true,
      reviewedAt: true,
      paidAt: true,
      center: { select: { name: true } },
      reviewedBy: { select: { name: true } },
      paidBy: { select: { name: true } },
      referrer: { select: { firstName: true, lastName: true } },
      lead: { select: { firstName: true, lastName: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    centerId: r.centerId,
    centerName: r.center.name,
    status: r.status,
    beneficiary: r.beneficiary,
    kind: r.kind,
    amountCents: r.amountCents,
    sessions: r.sessions,
    amountLabel: rewardAmountLabel(r),
    reviewRequired: r.reviewRequired,
    reviewReason: r.reviewReason,
    rejectedReason: r.rejectedReason,
    createdAt: r.createdAt,
    reviewedAt: r.reviewedAt,
    paidAt: r.paidAt,
    reviewedByName: r.reviewedBy?.name ?? null,
    paidByName: r.paidBy?.name ?? null,
    referrerName: `${r.referrer.firstName} ${r.referrer.lastName}`.trim(),
    referredName: `${r.lead.firstName} ${r.lead.lastName}`.trim(),
  }));
}

/* ------------------------------------------------------------------------- *
 * E14-34 · El panel de embajadores
 * ------------------------------------------------------------------------- */

export type AmbassadorRow = {
  memberId: string;
  name: string;
  centerId: string;
  centerName: string;
  code: string | null;
  codeRevoked: boolean;
  invited: number;
  assessed: number;
  /** Altas conseguidas: el estado derivado del lead, no una cuenta aparte. */
  signedUp: number;
  /** Lo que han pagado de verdad los socios que trajo. */
  revenueCents: number;
  /** Lo comprometido en recompensas suyas, rechazadas aparte. */
  rewardCostCents: number;
  rewardSessions: number;
};

export type ReferralPanelData = {
  ambassadors: AmbassadorRow[];
  totals: {
    ambassadorsWithCode: number;
    invited: number;
    signedUp: number;
    revenueCents: number;
    rewardCostCents: number;
    rewardSessions: number;
    /** Coste de captación por alta conseguida. `null` si todavía no hay altas. */
    costPerSignupCents: number | null;
  };
  pendingRewards: number;
  reviewRequired: number;
};

/**
 * Las cifras del panel, acotadas al ámbito de centro de quien mira.
 *
 * Todo sale de datos que YA existen: los estados de los referidos se DERIVAN de
 * `Lead` con `referralStateOf` —la misma función que usa la liberación—, los
 * ingresos son cobros `PAID` de los socios que entraron por ahí, y el coste es
 * lo escrito en `ReferralReward`. Ninguna cifra tiene columna propia.
 *
 * LO QUE NO ESTÁ AQUÍ, y no está a propósito: el COSTE DE LOS ANUNCIOS. Hoy no
 * existe en ninguna parte del repositorio —`/anuncios` es el tablón de
 * comunicados internos, no publicidad— y no se inventa un campo para él. La
 * pantalla enseña el coste por alta del programa de referidos y dice, con
 * todas las letras, que falta el otro lado de la comparación. Negocio decidió
 * que ese dato lo teclea dirección; la tabla que hace falta está pedida en
 * `docs/hu/R1-peticion-schema-coste-anuncios.md`, porque `prisma/schema.prisma`
 * está congelado este trimestre y no se toca desde esta rama.
 */
export async function referralPanelData(user: ScopedUser, opts: { centerId?: string } = {}): Promise<ReferralPanelData> {
  const scope = await centerScopeFor(user);
  const centerIds = opts.centerId
    ? scope === null || scope.includes(opts.centerId)
      ? [opts.centerId]
      : []
    : scope;
  const empty: ReferralPanelData = {
    ambassadors: [],
    totals: {
      ambassadorsWithCode: 0,
      invited: 0,
      signedUp: 0,
      revenueCents: 0,
      rewardCostCents: 0,
      rewardSessions: 0,
      costPerSignupCents: null,
    },
    pendingRewards: 0,
    reviewRequired: 0,
  };
  if (centerIds !== null && centerIds.length === 0) return empty;
  const centerFilter = centerIds ? { in: centerIds } : undefined;

  const leads = await prisma.lead.findMany({
    where: {
      orgId: user.orgId,
      referredByMemberId: { not: null },
      ...(centerFilter ? { centerId: centerFilter } : {}),
    },
    select: {
      id: true,
      centerId: true,
      status: true,
      convertedMemberId: true,
      referredByMemberId: true,
      referredBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          primaryCenterId: true,
          primaryCenter: { select: { name: true } },
          referralCode: { select: { code: true, revokedAt: true } },
        },
      },
    },
    take: 2000,
  });
  if (!leads.length) return empty;

  const convertedIds = leads.map((l) => l.convertedMemberId).filter((id): id is string => id !== null);
  const [revenueByMember, rewards] = await Promise.all([
    convertedIds.length
      ? prisma.payment.groupBy({
          by: ["memberId"],
          where: { orgId: user.orgId, status: "PAID", memberId: { in: convertedIds } },
          _sum: { amountCents: true },
        })
      : Promise.resolve([] as { memberId: string; _sum: { amountCents: number | null } }[]),
    prisma.referralReward.findMany({
      where: {
        orgId: user.orgId,
        ...(centerFilter ? { centerId: centerFilter } : {}),
      },
      select: {
        referrerMemberId: true,
        status: true,
        kind: true,
        amountCents: true,
        sessions: true,
        reviewRequired: true,
      },
    }),
  ]);

  const revenueOf = new Map(revenueByMember.map((r) => [r.memberId, r._sum.amountCents ?? 0]));

  const rows = new Map<string, AmbassadorRow>();
  for (const lead of leads) {
    const referrer = lead.referredBy;
    if (!referrer) continue;
    const row =
      rows.get(referrer.id) ??
      ({
        memberId: referrer.id,
        name: `${referrer.firstName} ${referrer.lastName}`.trim(),
        centerId: referrer.primaryCenterId,
        centerName: referrer.primaryCenter.name,
        code: referrer.referralCode?.code ?? null,
        codeRevoked: Boolean(referrer.referralCode?.revokedAt),
        invited: 0,
        assessed: 0,
        signedUp: 0,
        revenueCents: 0,
        rewardCostCents: 0,
        rewardSessions: 0,
      } satisfies AmbassadorRow);

    row.invited++;
    const state = referralStateOf(lead);
    if (state === "VALORACION_HECHA" || state === "ALTA") row.assessed++;
    if (state === "ALTA") {
      row.signedUp++;
      row.revenueCents += revenueOf.get(lead.convertedMemberId as string) ?? 0;
    }
    rows.set(referrer.id, row);
  }

  let pendingRewards = 0;
  let reviewRequired = 0;
  for (const reward of rewards) {
    if (reward.status === "PENDING_VALIDATION") pendingRewards++;
    if (reward.reviewRequired) reviewRequired++;
    // Una recompensa rechazada no costó nada: no se paga y no se cuenta.
    if (reward.status === "REJECTED") continue;
    const row = rows.get(reward.referrerMemberId);
    if (!row) continue;
    if (reward.kind === "FIXED_AMOUNT") row.rewardCostCents += reward.amountCents ?? 0;
    else row.rewardSessions += reward.sessions ?? 0;
  }

  const ambassadors = [...rows.values()].sort(
    (a, b) => b.signedUp - a.signedUp || b.invited - a.invited || a.name.localeCompare(b.name, "es")
  );

  const totals = ambassadors.reduce(
    (acc, row) => ({
      ambassadorsWithCode: acc.ambassadorsWithCode + (row.code && !row.codeRevoked ? 1 : 0),
      invited: acc.invited + row.invited,
      signedUp: acc.signedUp + row.signedUp,
      revenueCents: acc.revenueCents + row.revenueCents,
      rewardCostCents: acc.rewardCostCents + row.rewardCostCents,
      rewardSessions: acc.rewardSessions + row.rewardSessions,
      costPerSignupCents: null as number | null,
    }),
    {
      ambassadorsWithCode: 0,
      invited: 0,
      signedUp: 0,
      revenueCents: 0,
      rewardCostCents: 0,
      rewardSessions: 0,
      costPerSignupCents: null as number | null,
    }
  );
  totals.costPerSignupCents = totals.signedUp > 0 ? Math.round(totals.rewardCostCents / totals.signedUp) : null;

  return { ambassadors, totals, pendingRewards, reviewRequired };
}

/**
 * Cuántos socios PODRÍAN ser embajadores hoy, y qué pasa con los importados.
 * Es la pregunta que cierra el encargo, y se contesta contra los datos, no de
 * memoria: se enseña en la propia pantalla para que no haya que volver a
 * preguntarla.
 */
export type AmbassadorReach = {
  eligible: number;
  withCode: number;
  imported: number;
  importedEligible: number;
  cancelled: number;
  cancelledWithoutDate: number;
};

export async function ambassadorReach(user: ScopedUser): Promise<AmbassadorReach> {
  const scope = await centerScopeFor(user);
  if (scope !== null && scope.length === 0) {
    return { eligible: 0, withCode: 0, imported: 0, importedEligible: 0, cancelled: 0, cancelledWithoutDate: 0 };
  }
  const where = { orgId: user.orgId, ...(scope ? { primaryCenterId: { in: scope } } : {}) };
  const eligibleStates = { state: { in: ["ACTIVE", "FROZEN", "DELINQUENT", "TRIAL"] as MemberState[] } };

  const [eligible, withCode, imported, importedEligible, cancelled, cancelledWithoutDate] = await Promise.all([
    prisma.member.count({ where: { ...where, ...eligibleStates } }),
    prisma.member.count({ where: { ...where, ...eligibleStates, referralCode: { isNot: null } } }),
    prisma.member.count({ where: { ...where, externalRef: { not: null } } }),
    prisma.member.count({ where: { ...where, ...eligibleStates, externalRef: { not: null } } }),
    prisma.member.count({ where: { ...where, state: "CANCELLED" } }),
    prisma.member.count({ where: { ...where, state: "CANCELLED", cancelledAt: null } }),
  ]);

  return { eligible, withCode, imported, importedEligible, cancelled, cancelledWithoutDate };
}

/**
 * Lo que se lleva QUIEN ENTRA, en texto y para una pantalla pública: `/r/[code]`
 * no tiene sesión, y el centro sale del propio código, así que no hay ámbito
 * que cruzar — solo se lee el programa del centro al que apunta el enlace.
 *
 * `null` cuando el programa está apagado o es a una cara: entonces la página no
 * promete nada, que es mejor que prometer un cero.
 */
export async function publicIncentiveForReferred(centerId: string): Promise<string | null> {
  const config = await prisma.referralProgramConfig.findFirst({
    where: { centerId, active: true },
    select: { referredKind: true, referredAmountCents: true, referredSessions: true },
  });
  if (!config?.referredKind) return null;
  const label = rewardAmountLabel({
    kind: config.referredKind,
    amountCents: config.referredAmountCents,
    sessions: config.referredSessions,
  });
  return config.referredKind === "FIXED_AMOUNT" ? `${label} de descuento en tu alta.` : `${label} de regalo.`;
}

/** Los centros del ámbito de quien mira, con su programa ya resuelto. */
export async function referralProgramsInScope(
  user: ScopedUser
): Promise<{ centerId: string; centerName: string; config: ProgramConfigView }[]> {
  const scope = await centerScopeFor(user);
  if (scope !== null && scope.length === 0) return [];

  const centers = await prisma.center.findMany({
    where: { orgId: user.orgId, ...(scope ? { id: { in: scope } } : {}) },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const configs = await prisma.referralProgramConfig.findMany({
    where: { orgId: user.orgId, centerId: { in: centers.map((c) => c.id) } },
  });
  const byCenter = new Map(configs.map((c) => [c.centerId, c]));

  return centers.map((center) => {
    const row = byCenter.get(center.id);
    return {
      centerId: center.id,
      centerName: center.name,
      config: row
        ? {
            centerId: center.id,
            active: row.active,
            referrerKind: row.referrerKind,
            referrerAmountCents: row.referrerAmountCents,
            referrerSessions: row.referrerSessions,
            referredKind: row.referredKind,
            referredAmountCents: row.referredAmountCents,
            referredSessions: row.referredSessions,
            exMemberCooldownDays: row.exMemberCooldownDays,
          }
        : { centerId: center.id, ...DEFAULT_PROGRAM },
    };
  });
}
