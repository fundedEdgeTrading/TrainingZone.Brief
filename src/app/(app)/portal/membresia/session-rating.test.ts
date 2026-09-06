import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { getPendingSessionFeedback } from "@/lib/portal-queries";
import { getWeeklyClientFeedback } from "@/lib/brief-queries";

/**
 * E5-10 — escenario principal: una sola valoración de sesión tiene que
 * satisfacer a la vez las dos superficies que antes la pedían por separado:
 * deja de aparecer como "pendiente" en `getPendingSessionFeedback` (la que
 * usan el badge del menú y "Mi membresía") Y sigue alimentando el Session
 * Brief del entrenador (`getWeeklyClientFeedback`, que lee
 * `structured.feeling` y `text`). Se ejercita el mismo `structured`/`text`
 * que escribe `submitSessionRatingAction` — sin pasar por `requireRole`,
 * igual que el resto de tests de esta pista sobre acciones gateadas por sesión.
 */

const SUFFIX = "e2e-session-rating-test";

async function cleanup() {
  const orgs = await prisma.organization.findMany({ where: { slug: { startsWith: SUFFIX } }, select: { id: true } });
  for (const org of orgs) {
    await prisma.selfAssessment.deleteMany({ where: { orgId: org.id } });
    await prisma.booking.deleteMany({ where: { member: { orgId: org.id } } });
    await prisma.classSession.deleteMany({ where: { orgId: org.id } });
    await prisma.member.deleteMany({ where: { orgId: org.id } });
    await prisma.center.deleteMany({ where: { orgId: org.id } });
    await prisma.organization.delete({ where: { id: org.id } });
  }
}

before(cleanup);
after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test("una valoración combinada limpia la pendiente Y alimenta el Session Brief", async () => {
  const slug = `${SUFFIX}-combinada`;
  const org = await prisma.organization.create({ data: { name: "Rating", slug } });
  const center = await prisma.center.create({ data: { orgId: org.id, name: "Centro", slug: `${slug}-centro`, timezone: "UTC" } });
  const member = await prisma.member.create({
    data: { orgId: org.id, primaryCenterId: center.id, firstName: "Gala", lastName: "Rating", email: `${slug}@example.com` },
  });
  const now = new Date();
  const session = await prisma.classSession.create({
    data: {
      orgId: org.id,
      centerId: center.id,
      name: "Personal Training",
      classType: "Personal Training",
      date: now,
      startTime: "09:00",
      endTime: "10:00",
      capacity: 1,
    },
  });
  const booking = await prisma.booking.create({
    data: { sessionId: session.id, memberId: member.id, occurrenceDate: now, status: "ATTENDED" },
  });

  const pendingBefore = await getPendingSessionFeedback(member.id, "UTC");
  assert.equal(pendingBefore.length, 1, "la sesión asistida sin valorar debe salir como pendiente");

  // Mismo shape que escribe `submitSessionRatingAction`.
  await prisma.selfAssessment.create({
    data: {
      orgId: org.id,
      memberId: member.id,
      kind: "post-sesion",
      text: "Todo genial, gracias",
      structured: {
        bookingId: booking.id,
        trainerScore: 9,
        tags: ["Motivador"],
        energy: 7,
        rpe: 6,
        discomfort: "Ninguna",
        completed: "Sí, todos",
        feeling: "GREEN",
      },
    },
  });

  const pendingAfter = await getPendingSessionFeedback(member.id, "UTC");
  assert.equal(pendingAfter.length, 0, "una sola valoración tiene que quitarla de pendientes en todas las superficies");

  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 3);
  const bySession = await getWeeklyClientFeedback(org.id, weekStart);
  const feedback = bySession.get(session.id);
  assert.ok(feedback, "el Session Brief tiene que seguir recibiendo el feeling de la valoración combinada");
  assert.equal(feedback![0].feeling, "GREEN");
  assert.equal(feedback![0].comment, "Todo genial, gracias");
});
