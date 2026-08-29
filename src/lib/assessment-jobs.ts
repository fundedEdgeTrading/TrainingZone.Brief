import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mailer";
import { renderAssessmentDueEmail } from "@/lib/emails/templates";
import { absoluteUrl } from "@/lib/invitations";
import { zonedToday, DEFAULT_TIMEZONE } from "@/lib/date-utils";
import { dueDateForMilestone, getAssessmentMilestones } from "@/lib/assessments/queries";
import { milestoneKeyOf, milestoneLabelOf } from "@/lib/assessments/config";
import { canSendMemberEmail, MEMBER_EMAIL_PREFERENCES_SELECT } from "@/lib/email-preferences";
import { memberEmailFooterLinks } from "@/lib/email-preferences-queries";

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
  const [org, milestones, members] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId }, select: { name: true, logoUrl: true } }),
    // La escalera es la que ha configurado el centro (F-VAL), no una constante
    // del código: si el cron calculara la suya, la fecha que ve el socio en el
    // email y la que ve el entrenador en la ficha podrían dejar de coincidir.
    getAssessmentMilestones(orgId),
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
        assessments: { select: { kind: true, milestoneKey: true } },
      },
    }),
  ]);

  const brandName = org?.name ?? "Training Zone";
  const brandLogoUrl = absoluteUrl(org?.logoUrl || "/brand/tz-logo-white.png");
  // Del hito más lejano al más cercano: la regla abre el vigente, no todos los
  // que hayan pasado (ver la nota de arriba).
  const ladder = [...milestones].reverse();

  let created = 0;
  for (const member of members) {
    // El día se mide en el calendario del centro: un cron en UTC a las 00:00
    // está todavía en la víspera para un centro español en verano.
    const today = zonedToday(member.primaryCenter.timezone || DEFAULT_TIMEZONE);
    const joinedDay = new Date(member.joinedAt.getFullYear(), member.joinedAt.getMonth(), member.joinedAt.getDate());

    const milestone = ladder.find((m) => dueDateForMilestone(joinedDay, m) <= today);
    if (!milestone) continue;

    const alreadyExists = member.assessments.some((a) => milestoneKeyOf(a) === milestone.key);
    if (alreadyExists) continue;

    const dueDate = dueDateForMilestone(joinedDay, milestone);
    const assessment = await prisma.assessment.create({
      data: {
        orgId,
        memberId: member.id,
        kind: milestone.kind,
        // Los estándar se identifican por `kind`; solo los que ha añadido el
        // centro necesitan clave propia.
        milestoneKey: milestone.standard ? null : milestone.key,
        dueDate,
        answers: {},
      },
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
      subject: `${milestone.label} · ${brandName}`,
      html: renderAssessmentDueEmail({
        memberFirstName: member.firstName,
        brandName,
        brandLogoUrl,
        assessmentLabel: milestone.label,
        isInitial: milestone.kind === "INITIAL",
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
    select: { id: true, orgId: true, kind: true, milestoneKey: true, dueDate: true },
  });
  if (!assessment) return null;
  const milestones = await getAssessmentMilestones(assessment.orgId);
  return {
    ...assessment,
    label: milestoneLabelOf(assessment, milestones),
    portalPath: assessmentPortalPath(assessment.id),
  };
}
