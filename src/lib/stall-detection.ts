import { prisma } from "@/lib/prisma";
import { createNotificationOnce } from "@/lib/notifications";

const STALL_KEYWORDS = ["estanc", "no avanzo", "no progres", "aburrid"];
const LOOKBACK_DAYS = 90;

export type StallSignals = {
  selfReported: boolean;
  attendanceDropping: boolean;
  lowRpeSustained: boolean;
  goalsWithoutProgress: boolean;
  compositionStalled: boolean;
};

// Umbral de "sin cambio apreciable" entre la primera y la última toma de composición del
// periodo de mirada atrás (docs/COMPOSICION_CORPORAL_TANITA.md §2, RB-IA-007).
const BODY_FAT_STALL_MARGIN = 0.5; // puntos %
const MUSCLE_STALL_MARGIN = 0.3; // kg

// CC4: falta de progresión en composición corporal (grasa/músculo) es una señal objetiva más
// de RB-IA-007 — reutiliza la serie de MemberProgressEntry, no un motor aparte.
function compositionStalledFromEntries(entries: { bodyFatPct: number | null; muscleMassKg: number | null }[]): boolean {
  if (entries.length < 2) return false;
  const first = entries[0];
  const last = entries[entries.length - 1];

  const fatChecked = first.bodyFatPct != null && last.bodyFatPct != null;
  const muscleChecked = first.muscleMassKg != null && last.muscleMassKg != null;
  if (!fatChecked && !muscleChecked) return false;

  const fatStalled = fatChecked ? Math.abs(last.bodyFatPct! - first.bodyFatPct!) < BODY_FAT_STALL_MARGIN : true;
  const muscleStalled = muscleChecked ? Math.abs(last.muscleMassKg! - first.muscleMassKg!) < MUSCLE_STALL_MARGIN : true;
  return fatStalled && muscleStalled;
}

/**
 * RB-IA-007 (decisión §11.9): el estancamiento combina la autovaloración
 * textual del cliente con señales objetivas que YA existen en el sistema
 * (RetentionAlert, SessionDebrief, ClientGoal) — no se construye un motor
 * paralelo. Estancado = autovaloración positiva O al menos 2 señales objetivas.
 */
export async function getStallSignals(memberId: string): Promise<StallSignals> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const [assessments, retentionAlert, recentDebriefs, staleGoals, compositionEntries] = await Promise.all([
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
    prisma.memberProgressEntry.findMany({
      where: { memberId, date: { gte: since }, OR: [{ bodyFatPct: { not: null } }, { muscleMassKg: { not: null } }] },
      orderBy: { date: "asc" },
      select: { bodyFatPct: true, muscleMassKg: true },
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
    compositionStalled: compositionStalledFromEntries(compositionEntries),
  };
}

export function isStalled(signals: StallSignals): boolean {
  const objectiveCount = [
    signals.attendanceDropping,
    signals.lowRpeSustained,
    signals.goalsWithoutProgress,
    signals.compositionStalled,
  ].filter(Boolean).length;
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
