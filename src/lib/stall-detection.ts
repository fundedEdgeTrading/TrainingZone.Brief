import { prisma } from "@/lib/prisma";
import { createNotificationOnce } from "@/lib/notifications";

const STALL_KEYWORDS = ["estanc", "no avanzo", "no progres", "aburrid"];
const LOOKBACK_DAYS = 90;

export type StallSignals = {
  selfReported: boolean;
  attendanceDropping: boolean;
  lowRpeSustained: boolean;
  goalsWithoutProgress: boolean;
};

/**
 * RB-IA-007 (decisión §11.9): el estancamiento combina la autovaloración
 * textual del cliente con señales objetivas que YA existen en el sistema
 * (RetentionAlert, SessionDebrief, ClientGoal) — no se construye un motor
 * paralelo. Estancado = autovaloración positiva O al menos 2 señales objetivas.
 */
export async function getStallSignals(memberId: string): Promise<StallSignals> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const [assessments, retentionAlert, recentDebriefs, staleGoals] = await Promise.all([
    prisma.selfAssessment.findMany({ where: { memberId, createdAt: { gte: since } }, select: { text: true, structured: true } }),
    prisma.retentionAlert.findFirst({
      where: { memberId, status: { in: ["OPEN", "CONTACTED"] }, riskLevel: { in: ["MEDIUM", "HIGH"] } },
      select: { id: true },
    }),
    prisma.sessionDebrief.findMany({
      where: { booking: { memberId } },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { rpe: true },
    }),
    prisma.clientGoal.findFirst({
      where: { memberId, isTemplate: false, achievedAt: null, createdAt: { lte: since } },
      select: { id: true },
    }),
  ]);

  const selfReported = assessments.some((a) => {
    const structuredStalled = a.structured && typeof a.structured === "object" && (a.structured as Record<string, unknown>).stalled === true;
    const textStalled = a.text ? STALL_KEYWORDS.some((k) => a.text!.toLowerCase().includes(k)) : false;
    return structuredStalled || textStalled;
  });

  const lowRpeSustained = recentDebriefs.length === 3 && recentDebriefs.every((d) => (d.rpe ?? 10) <= 4);

  return {
    selfReported,
    attendanceDropping: !!retentionAlert,
    lowRpeSustained,
    goalsWithoutProgress: !!staleGoals,
  };
}

export function isStalled(signals: StallSignals): boolean {
  const objectiveCount = [signals.attendanceDropping, signals.lowRpeSustained, signals.goalsWithoutProgress].filter(Boolean).length;
  return signals.selfReported || objectiveCount >= 2;
}

export async function runStallDetectionRule(orgId: string): Promise<number> {
  const members = await prisma.member.findMany({
    where: { orgId, state: "ACTIVE" },
    select: { id: true, firstName: true, lastName: true, trainerId: true },
  });

  const directors = await prisma.user.findMany({ where: { orgId, role: { in: ["OWNER", "CENTER_DIRECTOR"] } }, select: { id: true } });

  let created = 0;
  for (const member of members) {
    const signals = await getStallSignals(member.id);
    if (!isStalled(signals)) continue;

    const recipients = member.trainerId ? [member.trainerId] : directors.map((d) => d.id);
    for (const recipientUserId of recipients) {
      await createNotificationOnce({
        orgId,
        recipientUserId,
        kind: "ALERT",
        title: `${member.firstName} ${member.lastName}: riesgo de estancamiento`,
        body: "Autovaloración y/o señales objetivas (asistencia, RPE, objetivos) sugieren estancamiento. Contacta y valora una acción comercial (RB-IA-005).",
        entityType: "Member",
        entityId: member.id,
      });
      created++;
    }
  }
  return created;
}
