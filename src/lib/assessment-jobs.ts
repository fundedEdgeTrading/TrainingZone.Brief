import { prisma } from "@/lib/prisma";
import type { AssessmentKind } from "@prisma/client";
import { sendMail } from "@/lib/mailer";
import { renderAssessmentDueEmail } from "@/lib/emails/templates";
import { absoluteUrl } from "@/lib/invitations";
import { addMonthsClamped, zonedToday, DEFAULT_TIMEZONE } from "@/lib/date-utils";

/**
 * Escalera de revisiones desde el alta (F4): inicial el mismo día, y después
 * mes 1, 3, 6, 9 y aniversario. Ordenada de más reciente a más antigua porque
 * la regla solo mira el hito vigente (ver `runAssessmentDueRule`).
 */
const LADDER: { kind: AssessmentKind; months: number }[] = [
  { kind: "Y1", months: 12 },
  { kind: "M9", months: 9 },
  { kind: "M6", months: 6 },
  { kind: "M3", months: 3 },
  { kind: "M1", months: 1 },
  { kind: "INITIAL", months: 0 },
];

const KIND_LABEL: Record<AssessmentKind, string> = {
  INITIAL: "Valoración inicial",
  M1: "Revisión del primer mes",
  M3: "Revisión de los tres meses",
  M6: "Revisión de los seis meses",
  M9: "Revisión de los nueve meses",
  Y1: "Revisión del año",
};

/** Ruta del formulario de valoración en el portal del socio. */
export function assessmentFormPath(assessmentId: string): string {
  return `/portal/valoracion/${assessmentId}`;
}

/**
 * Crea las valoraciones vencidas y avisa al socio por email.
 *
 * Solo se crea **el hito vigente**, no todos los que hayan pasado: un socio de
 * hace tres años daría de golpe seis valoraciones y seis correos, que es la
 * forma más rápida de que un socio marque el remitente como spam. Los hitos que
 * se perdieron (porque el cron no existía todavía) se quedan perdidos; a partir
 * de aquí cada uno se crea el día que toca.
 *
 * El propio `Assessment` es el registro de idempotencia: si ya existe uno de
 * ese tipo para ese socio, ni se crea ni se reenvía el email.
 */
export async function runAssessmentDueRule(orgId: string): Promise<number> {
  const [org, members] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId }, select: { name: true, logoUrl: true } }),
    prisma.member.findMany({
      where: { orgId, state: "ACTIVE" },
      select: {
        id: true,
        firstName: true,
        email: true,
        joinedAt: true,
        primaryCenter: { select: { timezone: true } },
        user: { select: { email: true } },
        assessments: { select: { kind: true } },
      },
    }),
  ]);

  const brandName = org?.name ?? "Training Zone";
  const brandLogoUrl = absoluteUrl(org?.logoUrl || "/brand/tz-logo-white.png");

  let created = 0;
  for (const member of members) {
    // El día se mide en el calendario del centro: un cron en UTC a las 00:00
    // está todavía en la víspera para un centro español en verano.
    const today = zonedToday(member.primaryCenter.timezone || DEFAULT_TIMEZONE);
    const joinedDay = new Date(member.joinedAt.getFullYear(), member.joinedAt.getMonth(), member.joinedAt.getDate());

    const due = LADDER.find(({ months }) => addMonthsClamped(joinedDay, months) <= today);
    if (!due) continue;

    const alreadyExists = member.assessments.some((a) => a.kind === due.kind);
    if (alreadyExists) continue;

    const dueDate = addMonthsClamped(joinedDay, due.months);
    const assessment = await prisma.assessment.create({
      data: { orgId, memberId: member.id, kind: due.kind, dueDate, answers: {} },
      select: { id: true },
    });
    created++;

    const to = member.user?.email ?? member.email;
    if (!to) continue;
    // Fire-and-forget, como el resto de transaccionales: un proveedor de email
    // lento no debe abortar la pasada del cron para el resto de socios.
    void sendMail({
      to,
      fromName: brandName,
      subject: `${KIND_LABEL[due.kind]} · ${brandName}`,
      html: renderAssessmentDueEmail({
        memberFirstName: member.firstName,
        brandName,
        brandLogoUrl,
        assessmentLabel: KIND_LABEL[due.kind],
        isInitial: due.kind === "INITIAL",
        formUrl: absoluteUrl(assessmentFormPath(assessment.id)),
      }),
    });
  }

  return created;
}

/**
 * Valoración vencida y sin cumplimentar de un socio, para el aviso de entrada
 * al portal (F4 §5.3). Devuelve la más antigua: si se acumulan dos, primero se
 * cierra la que lleva más tiempo esperando.
 */
export async function getDueAssessmentForMember(memberId: string) {
  const assessment = await prisma.assessment.findFirst({
    where: { memberId, completedAt: null, dueDate: { lte: new Date() } },
    orderBy: { dueDate: "asc" },
    select: { id: true, kind: true, dueDate: true },
  });
  if (!assessment) return null;
  return { ...assessment, label: KIND_LABEL[assessment.kind], formPath: assessmentFormPath(assessment.id) };
}
