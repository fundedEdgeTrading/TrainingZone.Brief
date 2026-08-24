import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mailer";
import { renderAssessmentDueEmail } from "@/lib/emails/templates";
import { absoluteUrl } from "@/lib/invitations";
import { zonedToday, DEFAULT_TIMEZONE } from "@/lib/date-utils";
import { ASSESSMENT_KIND_ORDER, dueDateForKind } from "@/lib/assessments/queries";
import { ASSESSMENT_KIND_LABEL } from "@/lib/assessments/schemas";
import { canSendMemberEmail, MEMBER_EMAIL_PREFERENCES_SELECT } from "@/lib/email-preferences";
import { memberEmailFooterLinks } from "@/lib/email-preferences-queries";

/**
 * La escalera y sus vencimientos son los de F3 (`assessments/queries.ts`): si
 * el cron calculara los suyos, la fecha que ve el socio en el email y la que
 * ve el entrenador en la ficha podrían dejar de coincidir. Aquí solo se
 * recorre al revés, del hito más lejano al más cercano, porque la regla mira
 * el vigente (ver `runAssessmentDueRule`).
 */
const LADDER = [...ASSESSMENT_KIND_ORDER].reverse();

/** Ruta de la valoración en el portal del socio. */
export function assessmentPortalPath(assessmentId: string): string {
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
        ...MEMBER_EMAIL_PREFERENCES_SELECT,
        primaryCenter: { select: { address: true, timezone: true } },
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

    const kind = LADDER.find((k) => dueDateForKind(joinedDay, k) <= today);
    if (!kind) continue;

    const alreadyExists = member.assessments.some((a) => a.kind === kind);
    if (alreadyExists) continue;

    const dueDate = dueDateForKind(joinedDay, kind);
    const assessment = await prisma.assessment.create({
      data: { orgId, memberId: member.id, kind, dueDate, answers: {} },
      select: { id: true },
    });
    created++;

    const to = member.user?.email ?? member.email;
    if (!to) continue;
    // La valoración se crea siempre (el entrenador la ve en la ficha); lo que
    // el socio puede desactivar es el recordatorio por correo.
    if (!canSendMemberEmail("assessment", member)) continue;

    const footer = memberEmailFooterLinks(member.id);
    // Fire-and-forget, como el resto de transaccionales: un proveedor de email
    // lento no debe abortar la pasada del cron para el resto de socios.
    void sendMail({
      to,
      fromName: brandName,
      subject: `${ASSESSMENT_KIND_LABEL[kind]} · ${brandName}`,
      html: renderAssessmentDueEmail({
        memberFirstName: member.firstName,
        brandName,
        brandLogoUrl,
        assessmentLabel: ASSESSMENT_KIND_LABEL[kind],
        isInitial: kind === "INITIAL",
        assessmentUrl: absoluteUrl(assessmentPortalPath(assessment.id)),
        dueDateLabel: dueDate.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" }),
        postalAddress: member.primaryCenter.address ?? undefined,
        prefsToken: footer.token,
      }),
      unsubscribeUrl: footer.oneClickUnsubscribeUrl,
    });
  }

  return created;
}

/**
 * Valoración vencida y sin cumplimentar de un socio, para el aviso de entrada
 * al portal (F4 §5.3). Devuelve la más antigua: si se acumulan dos, primero se
 * cierra la que lleva más tiempo esperando.
 *
 * F-ALTA: una inicial cuya parte de socio ya está rellenada no cuenta. El aviso
 * existe para reclamarle algo a él, y ahí no le queda nada que hacer —falta el
 * screening, las marcas y el PAR-Q, que son del entrenador—. Sin esta excepción
 * el socio termina el muro de la primera sesión y lo siguiente que ve es un
 * modal reclamándole la misma valoración que acaba de rellenar.
 */
export async function getDueAssessmentForMember(memberId: string) {
  const assessment = await prisma.assessment.findFirst({
    where: {
      memberId,
      completedAt: null,
      dueDate: { lte: new Date() },
      NOT: { kind: "INITIAL", memberPartAt: { not: null } },
    },
    orderBy: { dueDate: "asc" },
    select: { id: true, kind: true, dueDate: true },
  });
  if (!assessment) return null;
  return { ...assessment, label: ASSESSMENT_KIND_LABEL[assessment.kind], portalPath: assessmentPortalPath(assessment.id) };
}
