import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";

import { confirmLeadClosureForMember, createLead } from "@/lib/leads-queries";
import { cancelMember, reactivateMember } from "@/lib/member-lifecycle";
import { prisma } from "@/lib/prisma";
import { markRewardPaid, releaseReferralRewardsForLead, reviewReward } from "@/lib/referral-rewards";
import { REFERRAL_LEAD_CHANNEL, resolveReferralCode } from "@/lib/referrals";

/**
 * E14-32 · LA RECOMPENSA LIBERA UNA TAREA Y NO TOCA UN RECIBO.
 *
 * Esto sí va contra la base de datos, y a propósito: lo que se comprueba aquí
 * no es una decisión —eso es lógica pura y está en `referral-rewards.test.ts`—
 * sino LO QUE QUEDA ESCRITO cuando un referido se da de alta. Y lo que tiene
 * que quedar escrito es una `ReferralReward`, una `Notification`, y NADA MÁS:
 * ni un `Payment`, ni un recibo, ni un cupón de Stripe.
 *
 * La unicidad de "una recompensa por alta" también se prueba aquí, porque el
 * escenario de la historia pide justamente que la sostenga la base de datos y
 * no solo el código.
 */

const SLUG = "e14-32-referidos-test";
let orgId: string;
let centerId: string;
let identityId: string;
let referrerId: string;
let codeId: string;

before(async () => {
  const org = await prisma.organization.create({ data: { name: "Referidos", slug: SLUG } });
  orgId = org.id;
  const center = await prisma.center.create({ data: { orgId, name: "Centro", slug: `${SLUG}-centro` } });
  centerId = center.id;

  const identity = await prisma.identity.create({
    data: { email: `recepcion@${SLUG}.test`, passwordHash: "x" },
  });
  identityId = identity.id;
  await prisma.user.create({
    data: { identityId, orgId, centerId, name: "Recepción", email: identity.email, role: "RECEPTION" },
  });

  const referrer = await prisma.member.create({
    data: {
      orgId,
      primaryCenterId: centerId,
      firstName: "Ana",
      lastName: "Embajadora",
      email: `ana@${SLUG}.test`,
      phone: "600000100",
      state: "ACTIVE",
    },
  });
  referrerId = referrer.id;

  const code = await prisma.referralCode.create({
    data: { orgId, centerId, memberId: referrerId, code: "ANA-TEST1" },
  });
  codeId = code.id;

  await prisma.referralProgramConfig.create({
    data: {
      orgId,
      centerId,
      active: true,
      referrerKind: "FIXED_AMOUNT",
      referrerAmountCents: 2000,
      referredKind: "FREE_SESSIONS",
      referredSessions: 1,
      exMemberCooldownDays: 180,
    },
  });
});

after(async () => {
  if (!orgId) return;
  await prisma.notification.deleteMany({ where: { orgId } });
  await prisma.referralReward.deleteMany({ where: { orgId } });
  await prisma.auditLog.deleteMany({ where: { orgId } });
  await prisma.lead.deleteMany({ where: { orgId } });
  await prisma.referralCode.deleteMany({ where: { orgId } });
  await prisma.referralProgramConfig.deleteMany({ where: { orgId } });
  await prisma.member.deleteMany({ where: { orgId } });
  await prisma.cancelReason.deleteMany({ where: { orgId } });
  await prisma.user.deleteMany({ where: { orgId } });
  await prisma.identity.deleteMany({ where: { id: identityId } });
  await prisma.center.deleteMany({ where: { orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
  await prisma.$disconnect();
});

/** El camino entero: enlace → lead con canal Referido → conversión → alta. */
async function bringAFriend(name: string, phone: string) {
  const created = await createLead({
    orgId,
    centerId,
    firstName: name,
    lastName: "Referido",
    phone,
    email: `${phone}@${SLUG}.test`,
    postalCode: "",
    occupation: "",
    goals: "",
    hasTrainedBefore: false,
    channel: REFERRAL_LEAD_CHANNEL,
    referredByMemberId: referrerId,
    referralCodeId: codeId,
  });
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("no se pudo crear el lead");

  // El alta, sin pasar por Stripe: se crea el socio y se cierra el lead por el
  // mismo camino que usa el repositorio (`confirmLeadClosureForMember`).
  const member = await prisma.member.create({
    data: {
      orgId,
      primaryCenterId: centerId,
      firstName: name,
      lastName: "Referido",
      email: `${phone}@${SLUG}.test`,
      phone,
      state: "TRIAL",
    },
  });
  await prisma.lead.update({ where: { id: created.leadId }, data: { convertedMemberId: member.id } });
  await confirmLeadClosureForMember(orgId, member.id);
  return { leadId: created.leadId, memberId: member.id };
}

test("el lead entra por el embudo de siempre, con canal Referido y su embajador", async () => {
  const { leadId } = await bringAFriend("Bea", "600000201");
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  assert.equal(lead.channel, REFERRAL_LEAD_CHANNEL, "el canal es texto y es «Referido» (RB-LEAD-004)");
  assert.equal(lead.referredByMemberId, referrerId, "lo único que faltaba era de quién viene");
  assert.equal(lead.referralCodeId, codeId, "y por qué código entró: eso decide dinero");
  assert.equal(lead.status, "CERRADO");
});

test("el alta libera DOS recompensas —a doble cara— y ninguna mueve dinero", async () => {
  const { leadId } = await bringAFriend("Carla", "600000202");

  const rewards = await prisma.referralReward.findMany({ where: { leadId }, orderBy: { beneficiary: "asc" } });
  assert.equal(rewards.length, 2, "quien trae y quien entra");

  const referrer = rewards.find((r) => r.beneficiary === "REFERRER")!;
  assert.equal(referrer.status, "PENDING_VALIDATION");
  assert.equal(referrer.kind, "FIXED_AMOUNT");
  assert.equal(referrer.amountCents, 2000);
  assert.equal(referrer.referrerMemberId, referrerId);

  const referred = rewards.find((r) => r.beneficiary === "REFERRED")!;
  assert.equal(referred.kind, "FREE_SESSIONS");
  assert.equal(referred.sessions, 1);

  // LO QUE NO SE HA TOCADO. Es la regla que manda sobre todas las demás.
  assert.equal(await prisma.payment.count({ where: { orgId } }), 0, "ni un Payment");
  assert.equal(await prisma.stripeCoupon.count({ where: { orgId } }), 0, "ni un cupón de Stripe");
  assert.equal(await prisma.sessionLedger.count({ where: { orgId } }), 0, "ni una sesión cargada sola");
});

test("liberar significa CREAR LA TAREA a administración", async () => {
  const { leadId } = await bringAFriend("Diana", "600000203");
  const reward = await prisma.referralReward.findFirstOrThrow({ where: { leadId, beneficiary: "REFERRER" } });

  assert.ok(reward.notificationId, "la recompensa apunta a su tarea");
  const task = await prisma.notification.findUniqueOrThrow({ where: { id: reward.notificationId! } });
  assert.equal(task.kind, "TASK");
  assert.equal(task.entityType, "ReferralReward");
  assert.equal(task.entityId, reward.id);
  assert.equal(task.resolvedAt, null);
  // Va a administración: recepción del centro es quien hace este trabajo.
  const recipient = await prisma.user.findUniqueOrThrow({ where: { id: task.recipientUserId } });
  assert.equal(recipient.role, "RECEPTION");
  // Y el cuerpo dice lo que el sistema NO va a hacer por su cuenta.
  assert.match(task.body ?? "", /no descuenta nada solo/i);
});

test("ANTIFRAUDE 2 en la BASE DE DATOS: volver a liberar el mismo alta no escribe nada", async () => {
  const { leadId } = await bringAFriend("Elena", "600000204");
  const before = await prisma.referralReward.count({ where: { leadId } });

  await releaseReferralRewardsForLead(orgId, leadId);
  await releaseReferralRewardsForLead(orgId, leadId);

  assert.equal(await prisma.referralReward.count({ where: { leadId } }), before, "el @@unique aguanta");
});

test("los dos saltos guardan quién y cuándo, y el segundo exige el primero", async () => {
  const { leadId } = await bringAFriend("Flor", "600000205");
  const reward = await prisma.referralReward.findFirstOrThrow({ where: { leadId, beneficiary: "REFERRER" } });
  const user = await prisma.user.findFirstOrThrow({ where: { orgId, role: "RECEPTION" } });
  const actor = { id: user.id, role: user.role, orgId, centerId: user.centerId };

  // Pagar sin validar no se puede: el orden de los estados es el orden.
  const tooSoon = await markRewardPaid(actor, reward.id);
  assert.equal(tooSoon.ok, false);

  assert.equal((await reviewReward(actor, reward.id, "VALIDATED")).ok, true);
  const validated = await prisma.referralReward.findUniqueOrThrow({ where: { id: reward.id } });
  assert.equal(validated.status, "VALIDATED");
  assert.equal(validated.reviewedByUserId, user.id);
  assert.ok(validated.reviewedAt);

  assert.equal((await markRewardPaid(actor, reward.id)).ok, true);
  const paid = await prisma.referralReward.findUniqueOrThrow({ where: { id: reward.id } });
  assert.equal(paid.status, "PAID");
  assert.equal(paid.paidByUserId, user.id);
  assert.ok(paid.paidAt);

  // Pagada la recompensa, la tarea se cierra: el trabajo está hecho.
  const task = await prisma.notification.findUniqueOrThrow({ where: { id: paid.notificationId! } });
  assert.ok(task.resolvedAt);

  // Y sigue sin haberse movido un euro.
  assert.equal(await prisma.payment.count({ where: { orgId } }), 0);
});

test("rechazar exige motivo, y sin él no se escribe nada", async () => {
  const { leadId } = await bringAFriend("Gema", "600000206");
  const reward = await prisma.referralReward.findFirstOrThrow({ where: { leadId, beneficiary: "REFERRER" } });
  const user = await prisma.user.findFirstOrThrow({ where: { orgId, role: "RECEPTION" } });
  const actor = { id: user.id, role: user.role, orgId, centerId: user.centerId };

  assert.equal((await reviewReward(actor, reward.id, "REJECTED", "   ")).ok, false);
  assert.equal((await prisma.referralReward.findUniqueOrThrow({ where: { id: reward.id } })).status, "PENDING_VALIDATION");

  assert.equal((await reviewReward(actor, reward.id, "REJECTED", "El teléfono es el de su madre")).ok, true);
  const rejected = await prisma.referralReward.findUniqueOrThrow({ where: { id: reward.id } });
  assert.equal(rejected.status, "REJECTED");
  assert.equal(rejected.rejectedReason, "El teléfono es el de su madre");
});

test("con el programa apagado no nace ninguna recompensa", async () => {
  await prisma.referralProgramConfig.update({ where: { centerId }, data: { active: false } });
  const { leadId } = await bringAFriend("Hilda", "600000207");
  assert.equal(await prisma.referralReward.count({ where: { leadId } }), 0);
  await prisma.referralProgramConfig.update({ where: { centerId }, data: { active: true } });
});

/* ------------------------------------------------------------------------- *
 * E14-33 · antifraude 3, enganchado donde M4 centralizó el estado
 * ------------------------------------------------------------------------- */

test("el código caduca con la baja y vuelve con el socio, desde member-lifecycle", async () => {
  const actor = { kind: "system" as const, orgId, source: "test" };

  assert.equal((await cancelMember(actor, referrerId)).ok, true);
  const revoked = await prisma.referralCode.findUniqueOrThrow({ where: { memberId: referrerId } });
  assert.ok(revoked.revokedAt, "la baja revoca el código");
  // Se revoca, NO se borra: un lead que entró con él ayer tiene que poder
  // seguir señalando por dónde entró.
  assert.equal(revoked.code, "ANA-TEST1");

  // Y con el código caducado, el enlace deja de resolver: 404 en /r/[code].
  assert.equal(await resolveReferralCode("ANA-TEST1"), null);

  assert.equal((await reactivateMember(actor, referrerId)).ok, true);
  const back = await prisma.referralCode.findUniqueOrThrow({ where: { memberId: referrerId } });
  assert.equal(back.revokedAt, null, "si vuelve, recupera el mismo código que ya compartió");
  assert.ok(await resolveReferralCode("ANA-TEST1"));
});

/* ------------------------------------------------------------------------- *
 * El tope semanal de M3 no puede comerse esta tarea
 * ------------------------------------------------------------------------- */

test("la tarea de la recompensa se escribe aunque el tope semanal esté agotado", async () => {
  // El tope de tareas AUTOMÁTICAS de M3 (E14-12) frena a los detectores del
  // motor, que vuelven a pasar cada noche y reescriben lo que no cupo. Esta
  // tarea no es un detector: nace de un alta concreta, una sola vez, y nadie
  // vuelve a mirarla. Si el tope se la comiera, quedaría dinero prometido sin
  // que a nadie se le encargue pagarlo.
  const user = await prisma.user.findFirstOrThrow({ where: { orgId, role: "RECEPTION" } });
  const cap = 15;
  await prisma.notification.createMany({
    data: Array.from({ length: cap + 5 }, (_, i) => ({
      orgId,
      recipientUserId: user.id,
      kind: "TASK" as const,
      title: `Relleno del tope ${i}`,
      entityType: "MemberStallRisk",
      entityId: `relleno-${i}`,
    })),
  });

  const { leadId } = await bringAFriend("Iris", "600000208");
  const reward = await prisma.referralReward.findFirstOrThrow({ where: { leadId, beneficiary: "REFERRER" } });
  assert.ok(reward.notificationId, "con el tope agotado, la recompensa sigue abriendo su tarea");

  const task = await prisma.notification.findUniqueOrThrow({ where: { id: reward.notificationId! } });
  assert.equal(task.resolvedAt, null);
});
