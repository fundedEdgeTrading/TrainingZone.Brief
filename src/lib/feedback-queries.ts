import { prisma } from "@/lib/prisma";

// Página "Feedback" de Dirección: contrasta el feedback que reporta el socio
// (ClientFeedback) con el debrief que registra su entrenador (TrainerDebrief),
// ambos sobre las mismas 5 dimensiones 0-10. El universo de candidatos es
// **todo socio de EP activo** (mismo criterio de elegibilidad que el ciclo de
// `lib/feedback-capture.ts`), no solo los que ya tienen algún debrief — así un
// socio que respondió pero cuyo entrenador no lo ha hecho (o viceversa) es
// visible como hueco real, no invisible. Solo importa el más reciente de cada
// lado ("por periodo"); los agregados (medias, gap, categoría, KPIs) se
// calculan aquí, nunca se persisten.

export type FeedbackDims = { sat: number; prog: number; adher: number; motiv: number; esf: number };

export type AlignmentCategory = "ciego" | "cliente_positivo" | "alineado" | "sin_feedback";

export const CATEGORY_LABEL: Record<AlignmentCategory, string> = {
  ciego: "Punto ciego",
  cliente_positivo: "Cliente + positivo",
  alineado: "Alineado",
  sin_feedback: "Sin feedback",
};

// El tono coincide 1:1 con los tokens semánticos existentes (`Badge`/`FilterBar`).
export const CATEGORY_TONE: Record<AlignmentCategory, "critical" | "trial" | "good" | "neutral"> = {
  ciego: "critical",
  cliente_positivo: "trial",
  alineado: "good",
  sin_feedback: "neutral",
};

const GAP_THRESHOLD = 1.5;

function mean(d: FeedbackDims): number {
  return (d.sat + d.prog + d.adher + d.motiv + d.esf) / 5;
}

/** Ninguno de los dos lados es obligatorio para que exista el otro: si falta cualquiera, no hay comparación posible. */
export function categorize(clientAvg: number | null, trainerAvg: number | null): { cat: AlignmentCategory; gap: number | null } {
  if (clientAvg == null || trainerAvg == null) return { cat: "sin_feedback", gap: null };
  const gap = trainerAvg - clientAvg;
  if (gap >= GAP_THRESHOLD) return { cat: "ciego", gap };
  if (gap <= -GAP_THRESHOLD) return { cat: "cliente_positivo", gap };
  return { cat: "alineado", gap };
}

export function isAtRisk(clientSat: number | null, cat: AlignmentCategory): boolean {
  return (clientSat != null && clientSat < 5) || cat === "ciego";
}

export type MemberFeedbackClient = (FeedbackDims & { comment: string | null; submittedAt: Date; periodKey: string }) | null;
export type MemberFeedbackDebrief =
  | (FeedbackDims & { note: string; debriefAt: Date; trainerName: string; periodKey: string; reviewedAt: Date | null })
  | null;

export type MemberFeedbackRow = {
  memberId: string;
  firstName: string;
  lastName: string;
  planName: string | null;
  trainerName: string | null;
  centerId: string;
  centerName: string;
  client: MemberFeedbackClient;
  debrief: MemberFeedbackDebrief;
  clientAvg: number | null;
  trainerAvg: number | null;
  gap: number | null;
  cat: AlignmentCategory;
  atRisk: boolean;
  /** Ambos lados respondieron, pero en periodos ("YYYY-MM") distintos: la comparación existe pero es menos fiable. */
  periodMismatch: boolean;
};

async function listCandidateMembers(orgId: string, opts: { q?: string; centerId?: string } = {}) {
  return prisma.member.findMany({
    where: {
      orgId,
      state: "ACTIVE",
      primaryCenterId: opts.centerId || undefined,
      ...(opts.q
        ? {
            OR: [
              { firstName: { contains: opts.q, mode: "insensitive" as const } },
              { lastName: { contains: opts.q, mode: "insensitive" as const } },
            ],
          }
        : {}),
      // Elegible para el ciclo (mismo criterio que runFeedbackCycleRule): al
      // menos una sesión de EP asistida, de donde se deriva "su" entrenador
      // (no hay Member.trainerId fijo). Deliberadamente NO se exige que ya
      // exista un debrief: eso es justo lo que queremos poder ver como hueco.
      bookings: { some: { status: "ATTENDED", session: { classType: "Personal Training" } } },
    },
    include: {
      primaryCenter: { select: { id: true, name: true } },
      subscriptions: { orderBy: { createdAt: "desc" }, take: 1, include: { plan: { select: { name: true } } } },
      clientFeedback: { orderBy: { submittedAt: "desc" }, take: 1 },
      trainerDebriefs: {
        orderBy: { debriefAt: "desc" },
        take: 1,
        include: { trainer: { select: { name: true } } },
      },
    },
    orderBy: [{ lastName: "asc" }],
  });
}

/** Para socios sin debrief todavía: el entrenador se deriva igual que en el resto del sistema (última sesión de EP asistida). */
async function backfillTrainerNames(memberIds: string[]): Promise<Map<string, string>> {
  if (memberIds.length === 0) return new Map();
  const bookings = await prisma.booking.findMany({
    where: {
      memberId: { in: memberIds },
      status: "ATTENDED",
      session: { classType: "Personal Training", trainerId: { not: null } },
    },
    orderBy: { session: { date: "desc" } },
    distinct: ["memberId"],
    select: { memberId: true, session: { select: { trainer: { select: { name: true } } } } },
  });
  const map = new Map<string, string>();
  for (const b of bookings) {
    if (b.session.trainer?.name) map.set(b.memberId, b.session.trainer.name);
  }
  return map;
}

function toRow(
  m: Awaited<ReturnType<typeof listCandidateMembers>>[number],
  fallbackTrainerName: string | null
): MemberFeedbackRow {
  const debriefRow = m.trainerDebriefs[0] ?? null;
  const clientRow = m.clientFeedback[0] ?? null;

  const client: MemberFeedbackClient = clientRow
    ? {
        sat: clientRow.sat,
        prog: clientRow.prog,
        adher: clientRow.adher,
        motiv: clientRow.motiv,
        esf: clientRow.esf,
        comment: clientRow.comment,
        submittedAt: clientRow.submittedAt,
        periodKey: clientRow.periodKey,
      }
    : null;

  const debrief: MemberFeedbackDebrief = debriefRow
    ? {
        sat: debriefRow.sat,
        prog: debriefRow.prog,
        adher: debriefRow.adher,
        motiv: debriefRow.motiv,
        esf: debriefRow.esf,
        note: debriefRow.note,
        debriefAt: debriefRow.debriefAt,
        trainerName: debriefRow.trainer.name,
        periodKey: debriefRow.periodKey,
        reviewedAt: debriefRow.reviewedAt,
      }
    : null;

  const trainerAvg = debrief ? mean(debrief) : null;
  const clientAvg = client ? mean(client) : null;
  const { cat, gap } = categorize(clientAvg, trainerAvg);

  return {
    memberId: m.id,
    firstName: m.firstName,
    lastName: m.lastName,
    planName: m.subscriptions[0]?.plan.name ?? null,
    trainerName: debrief?.trainerName ?? fallbackTrainerName,
    centerId: m.primaryCenter.id,
    centerName: m.primaryCenter.name,
    client,
    debrief,
    clientAvg,
    trainerAvg,
    gap,
    cat,
    atRisk: isAtRisk(client?.sat ?? null, cat),
    periodMismatch: !!(client && debrief && client.periodKey !== debrief.periodKey),
  };
}

export type SortBy = "divergencia" | "satisfaccion" | "nombre";

export async function listMemberFeedback(
  orgId: string,
  opts: { q?: string; centerId?: string; cat?: AlignmentCategory | "all"; sortBy?: SortBy } = {}
): Promise<MemberFeedbackRow[]> {
  const members = await listCandidateMembers(orgId, opts);
  const needFallback = members.filter((m) => m.trainerDebriefs.length === 0).map((m) => m.id);
  const fallbackNames = await backfillTrainerNames(needFallback);

  let rows = members.map((m) => toRow(m, fallbackNames.get(m.id) ?? null));

  if (opts.cat && opts.cat !== "all") {
    rows = rows.filter((r) => r.cat === opts.cat);
  }

  const sortBy = opts.sortBy ?? "divergencia";
  rows = [...rows].sort((a, b) => {
    if (sortBy === "nombre") {
      return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
    }
    if (sortBy === "satisfaccion") {
      if (a.client == null && b.client == null) return 0;
      if (a.client == null) return 1;
      if (b.client == null) return -1;
      return a.client.sat - b.client.sat;
    }
    // "Mayor divergencia": por |gap| desc, sin feedback al final.
    if (a.gap == null && b.gap == null) return 0;
    if (a.gap == null) return 1;
    if (b.gap == null) return -1;
    return Math.abs(b.gap) - Math.abs(a.gap);
  });

  return rows;
}

export type FeedbackKpis = {
  collected: number;
  total: number;
  responseRate: number;
  debriefCollected: number;
  debriefResponseRate: number;
  clientAvgSat: number | null;
  trainerAvgRating: number | null;
  blindSpots: number;
  atRisk: number;
};

export function computeFeedbackKpis(rows: MemberFeedbackRow[]): FeedbackKpis {
  const total = rows.length;
  const withClient = rows.filter((r) => r.client != null);
  const withDebrief = rows.filter((r) => r.debrief != null);
  const collected = withClient.length;
  const debriefCollected = withDebrief.length;
  const clientAvgSat = collected ? withClient.reduce((s, r) => s + r.client!.sat, 0) / collected : null;
  const trainerAvgRating = debriefCollected ? withDebrief.reduce((s, r) => s + r.debrief!.sat, 0) / debriefCollected : null;
  const blindSpots = rows.filter((r) => r.cat === "ciego").length;
  const atRisk = rows.filter((r) => r.atRisk).length;

  return {
    collected,
    total,
    responseRate: total ? Math.round((collected / total) * 100) : 0,
    debriefCollected,
    debriefResponseRate: total ? Math.round((debriefCollected / total) * 100) : 0,
    clientAvgSat,
    trainerAvgRating,
    blindSpots,
    atRisk,
  };
}

export async function listCentersForFeedback(orgId: string) {
  return prisma.center.findMany({ where: { orgId }, orderBy: { name: "asc" }, select: { id: true, name: true } });
}

export async function getMemberFeedbackDetail(orgId: string, memberId: string): Promise<MemberFeedbackRow | null> {
  const m = await prisma.member.findFirst({
    where: { id: memberId, orgId },
    include: {
      primaryCenter: { select: { id: true, name: true } },
      subscriptions: { orderBy: { createdAt: "desc" }, take: 1, include: { plan: { select: { name: true } } } },
      clientFeedback: { orderBy: { submittedAt: "desc" }, take: 1 },
      trainerDebriefs: {
        orderBy: { debriefAt: "desc" },
        take: 1,
        include: { trainer: { select: { name: true } } },
      },
    },
  });
  if (!m) return null;
  const fallbackNames = m.trainerDebriefs.length === 0 ? await backfillTrainerNames([m.id]) : new Map<string, string>();
  return toRow(m, fallbackNames.get(m.id) ?? null);
}

export const DIMENSION_LABEL: { key: keyof FeedbackDims; label: string }[] = [
  { key: "sat", label: "Satisfacción" },
  { key: "prog", label: "Progreso" },
  { key: "adher", label: "Adherencia" },
  { key: "motiv", label: "Motivación" },
  { key: "esf", label: "Esfuerzo" },
];
