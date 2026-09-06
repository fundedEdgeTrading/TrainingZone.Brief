import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { canAccessMemberChat, getOrCreateConversation, sendMessage } from "@/lib/chat";

/**
 * E12-02: el chat se queda, pero la promesa "responde al instante" se quita y
 * el lado del personal se remonta. Lo que se prueba aquí en contra de la base
 * real es el cambio de comportamiento que no se puede verificar por lectura de
 * código: el ámbito de recepción deja de ser permanente, y un mensaje del
 * socio deja de caer en un buzón del que nadie se entera.
 */

const SUFFIX = "test-chat-e12-02";

async function cleanup() {
  const orgs = await prisma.organization.findMany({ where: { slug: { startsWith: SUFFIX } }, select: { id: true } });
  for (const org of orgs) {
    await prisma.$transaction([
      prisma.chatMessage.deleteMany({ where: { conversation: { orgId: org.id } } }),
      prisma.conversation.deleteMany({ where: { orgId: org.id } }),
      prisma.notification.deleteMany({ where: { orgId: org.id } }),
      prisma.member.deleteMany({ where: { orgId: org.id } }),
      prisma.user.deleteMany({ where: { orgId: org.id } }),
      prisma.center.deleteMany({ where: { orgId: org.id } }),
      prisma.organization.deleteMany({ where: { id: org.id } }),
    ]);
  }
  await prisma.identity.deleteMany({ where: { email: { contains: SUFFIX } } });
}

before(cleanup);
after(cleanup);

async function createFixture(tag: string) {
  const slug = `${SUFFIX}-${tag}`;
  const org = await prisma.organization.create({ data: { name: `Chat ${tag}`, slug } });
  const center = await prisma.center.create({ data: { orgId: org.id, name: `Centro ${tag}`, slug: `${slug}-centro` } });
  const identity = await prisma.identity.create({ data: { email: `${slug}-recep@example.com`, passwordHash: "x" } });
  const reception = await prisma.user.create({
    data: {
      identityId: identity.id,
      orgId: org.id,
      centerId: center.id,
      name: `Recepción ${tag}`,
      email: identity.email,
      role: "RECEPTION",
    },
  });
  const dirIdentity = await prisma.identity.create({ data: { email: `${slug}-dir@example.com`, passwordHash: "x" } });
  await prisma.user.create({
    data: {
      identityId: dirIdentity.id,
      orgId: org.id,
      centerId: center.id,
      name: `Dirección ${tag}`,
      email: dirIdentity.email,
      role: "CENTER_DIRECTOR",
    },
  });
  const member = await prisma.member.create({
    data: {
      orgId: org.id,
      primaryCenterId: center.id,
      firstName: "Ana",
      lastName: "Test",
      email: `${slug}-member@example.com`,
      phone: "600000000",
    },
  });
  return { orgId: org.id, receptionId: reception.id, memberId: member.id };
}

test("E12-02 · recepción solo entra mientras el último mensaje sea del socio", async () => {
  const { orgId, receptionId, memberId } = await createFixture("scope");

  // Sin conversación todavía: sin acceso.
  assert.equal(await canAccessMemberChat(orgId, memberId, receptionId, "RECEPTION"), false);

  const conversation = await getOrCreateConversation(orgId, memberId);
  await sendMessage(conversation.id, "MEMBER", null, "Hola, ¿tenéis hueco mañana?");

  // Mensaje del socio sin responder: recepción puede atenderlo.
  assert.equal(await canAccessMemberChat(orgId, memberId, receptionId, "RECEPTION"), true);

  await sendMessage(conversation.id, "DIRECTION", null, "Sí, a las 18:00.");

  // Ya respondido: el acceso de recepción se cierra, no es permanente.
  assert.equal(await canAccessMemberChat(orgId, memberId, receptionId, "RECEPTION"), false);
});

test("E12-02 · un mensaje del socio avisa a dirección", async () => {
  const { orgId, memberId } = await createFixture("notify");
  const conversation = await getOrCreateConversation(orgId, memberId);

  await sendMessage(conversation.id, "MEMBER", null, "¿Puedo cambiar mi sesión de mañana?");

  const notifications = await prisma.notification.findMany({ where: { orgId, entityType: "Member", entityId: memberId } });
  assert.equal(notifications.length, 1);
  assert.match(notifications[0].title, /Mensaje nuevo/);
});
