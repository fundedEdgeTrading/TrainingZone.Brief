import { prisma } from "@/lib/prisma";

function timeToMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** RB-RRHH-005: panel propio del entrenador — sus clientes de EP + horas EP/grupos del mes. */
export async function getTrainerPanelData(orgId: string, trainerUserId: string) {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [epClients, monthSessions] = await Promise.all([
    prisma.member.findMany({
      where: { orgId, trainerId: trainerUserId, state: "ACTIVE" },
      include: {
        subscriptions: { where: { status: "ACTIVE" }, include: { plan: { select: { type: true } } } },
        bookings: { where: { status: "ATTENDED" }, select: { id: true } },
      },
    }),
    prisma.classSession.findMany({
      where: {
        orgId,
        date: { gte: monthStart },
        status: "SCHEDULED",
        OR: [{ trainerId: trainerUserId }, { directedByUserId: trainerUserId }],
      },
      select: { classType: true, startTime: true, endTime: true },
    }),
  ]);

  let epMinutes = 0;
  let groupMinutes = 0;
  for (const s of monthSessions) {
    const minutes = timeToMinutes(s.endTime) - timeToMinutes(s.startTime);
    if (s.classType === "Personal Training") epMinutes += minutes;
    else groupMinutes += minutes;
  }

  return {
    epClients: epClients.map((m) => ({
      id: m.id,
      firstName: m.firstName,
      lastName: m.lastName,
      attendedCount: m.bookings.length,
      planNames: m.subscriptions.map((s) => s.plan.type).join(", "),
    })),
    epHours: Number((epMinutes / 60).toFixed(1)),
    groupHours: Number((groupMinutes / 60).toFixed(1)),
  };
}
