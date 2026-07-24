import { prisma } from "@/lib/prisma";

// Página "Feedback" de Dirección: contrasta el feedback que reporta el socio
// (ClientFeedback) con el debrief que registra su entrenador (TrainerDebrief),
// ambos sobre las mismas 5 dimensiones 0-10. Solo importa el más reciente de
// cada uno por socio ("por periodo"); los agregados (medias, gap, categoría,
// KPIs) se calculan aquí, nunca se persisten.

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

export function categorize(clientAvg: number | null, trainerAvg: number): { cat: AlignmentCategory; gap: number | null } {
  if (clientAvg == null) return { cat: "sin_feedback", gap: null };
  const gap = trainerAvg - clientAvg;
  if (gap >= GAP_THRESHOLD) return { cat: "ciego", gap };
  if (gap <= -GAP_THRESHOLD) return { cat: "cliente_positivo", gap };
  return { cat: "alineado", gap };
}

export function isAtRisk(clientSat: number | null, cat: AlignmentCategory): boolean {
  return (clientSat != null && clientSat < 5) || cat === "ciego";
}

export type MemberFeedbackClient = (FeedbackDims & { comment: string | null; submittedAt: Date }) | null;
export type MemberFeedbackDebrief = FeedbackDims & { note: string; debriefAt: Date; trainerName: string };

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
  trainerAvg: number;
  gap: number | null;
  cat: AlignmentCategory;
  atRisk: boolean;
};

async function listCandidateMembers(orgId: string, opts: { q?: string; centerId?: string } = {}) {
  return prisma.member.findMany({
    where: {
      orgId,
      primaryCenterId: opts.centerId || undefined,
      ...(opts.q
        ? {
            OR: [
              { firstName: { contains: opts.q, mode: "insensitive" as const } },
              { lastName: { contains: opts.q, mode: "insensitive" as const } },
            ],
          }
        : {}),
      // Solo importan socios con al menos un debrief del entrenador: sin
      // debrief no hay nada que contrastar (RB de la página).
      trainerDebriefs: { some: {} },
    },
    include: {
      primaryCenter: { select: { id: true, name: true } },
      trainer: { select: { id: true, name: true } },
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

function toRow(m: Awaited<ReturnType<typeof listCandidateMembers>>[number]): MemberFeedbackRow | null {
  const debrief = m.trainerDebriefs[0];
  if (!debrief) return null;

  const clientFb = m.clientFeedback[0] ?? null;
  const client: MemberFeedbackClient = clientFb
    ? {
        sat: clientFb.sat,
        prog: clientFb.prog,
        adher: clientFb.adher,
        motiv: clientFb.motiv,
        esf: clientFb.esf,
        comment: clientFb.comment,
        submittedAt: clientFb.submittedAt,
      }
    : null;

  const trainerAvg = mean(debrief);
  const clientAvg = client ? mean(client) : null;
  const { cat, gap } = categorize(clientAvg, trainerAvg);

  return {
    memberId: m.id,
    firstName: m.firstName,
    lastName: m.lastName,
    planName: m.subscriptions[0]?.plan.name ?? null,
    trainerName: m.trainer?.name ?? debrief.trainer.name,
    centerId: m.primaryCenter.id,
    centerName: m.primaryCenter.name,
    client,
    debrief: {
      sat: debrief.sat,
      prog: debrief.prog,
      adher: debrief.adher,
      motiv: debrief.motiv,
      esf: debrief.esf,
      note: debrief.note,
      debriefAt: debrief.debriefAt,
      trainerName: debrief.trainer.name,
    },
    clientAvg,
    trainerAvg,
    gap,
    cat,
    atRisk: isAtRisk(client?.sat ?? null, cat),
  };
}

export type SortBy = "divergencia" | "satisfaccion" | "nombre";

export async function listMemberFeedback(
  orgId: string,
  opts: { q?: string; centerId?: string; cat?: AlignmentCategory | "all"; sortBy?: SortBy } = {}
): Promise<MemberFeedbackRow[]> {
  const members = await listCandidateMembers(orgId, opts);
  let rows = members.map(toRow).filter((r): r is MemberFeedbackRow => r !== null);

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
  clientAvgSat: number | null;
  trainerAvgRating: number | null;
  blindSpots: number;
  atRisk: number;
};

export function computeFeedbackKpis(rows: MemberFeedbackRow[]): FeedbackKpis {
  const total = rows.length;
  const withClient = rows.filter((r) => r.client != null);
  const collected = withClient.length;
  const clientAvgSat = collected ? withClient.reduce((s, r) => s + r.client!.sat, 0) / collected : null;
  const trainerAvgRating = total ? rows.reduce((s, r) => s + r.debrief.sat, 0) / total : null;
  const blindSpots = rows.filter((r) => r.cat === "ciego").length;
  const atRisk = rows.filter((r) => r.atRisk).length;

  return {
    collected,
    total,
    responseRate: total ? Math.round((collected / total) * 100) : 0,
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
      trainer: { select: { id: true, name: true } },
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
  return toRow(m);
}

export const DIMENSION_LABEL: { key: keyof FeedbackDims; label: string }[] = [
  { key: "sat", label: "Satisfacción" },
  { key: "prog", label: "Progreso" },
  { key: "adher", label: "Adherencia" },
  { key: "motiv", label: "Motivación" },
  { key: "esf", label: "Esfuerzo" },
];
