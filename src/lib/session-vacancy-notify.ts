import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mailer";
import { renderSessionVacancyEmail } from "@/lib/emails/templates";
import { absoluteUrl } from "@/lib/invitations";
import { sessionServiceKind, planServiceKind } from "@/lib/members-queries";
import { canSendMemberEmail, MEMBER_EMAIL_PREFERENCES_SELECT } from "@/lib/email-preferences";
import { memberEmailFooterLinks } from "@/lib/email-preferences-queries";

/**
 * RB-RES-007 (decisión de negocio): no hay promoción automática de la lista de
 * espera. Cuando una cancelación libera un hueco se avisa por email y la plaza
 * la reclama quien reserve antes (`bookSessionForMember` desde el portal, o el
 * staff desde la agenda con `bookSessionForMemberAsStaff`), sin orden de cola
 * garantizado: el paso a BOOKED es atómico, así que de dos avisados que
 * reclamen a la vez solo uno se la queda.
 *
 * A quién se avisa depende de si esa ocurrencia tenía lista de espera:
 * - **Con lista de espera**: solo a quien esperaba, a todos a la vez. Son los
 *   que ya dijeron que querían esa clase; abrir el aviso al resto del centro
 *   les quitaría la plaza que llevaban esperando.
 * - **Sin lista de espera**: a los socios con bono ACTIVE de esa misma
 *   modalidad (EP/Grupos) en ese centro, como hasta ahora.
 *
 * Envíos best-effort, no bloqueantes. Devuelve a quién se avisó para que las
 * pruebas (y quien llame) puedan comprobarlo sin mirar el buzón.
 */
export async function notifySessionVacancy(params: {
  orgId: string;
  sessionId: string;
  occurrenceDate: Date;
  /** El socio que acaba de cancelar no necesita el aviso de su propio hueco. */
  excludeMemberId?: string;
}): Promise<{ notifiedMemberIds: string[]; toWaitlist: boolean }> {
  const { orgId, sessionId, occurrenceDate, excludeMemberId } = params;
  const nobody = { notifiedMemberIds: [] as string[], toWaitlist: false };

  const session = await prisma.classSession.findFirst({
    where: { id: sessionId, orgId },
    select: {
      name: true,
      classType: true,
      startTime: true,
      capacity: true,
      room: true,
      centerId: true,
      center: { select: { name: true, address: true } },
    },
  });
  if (!session) return nobody;

  const kind = sessionServiceKind(session.classType);

  // Plazas libres en ESA ocurrencia (no en la serie): mismo criterio de ocupación
  // que la agenda — cuenta lo reservado, lo asistido y los no-show; la lista de
  // espera no ocupa sitio (ver `agenda-queries.ts`).
  const occupied = await prisma.booking.count({
    where: { sessionId, occurrenceDate, status: { in: ["BOOKED", "ATTENDED", "NO_SHOW"] } },
  });
  const freeSpots = Math.max(0, session.capacity - occupied);
  const spotsLabel = freeSpots > 0 ? `${freeSpots} ${freeSpots === 1 ? "plaza" : "plazas"}` : undefined;

  // Quién espera ESE día (la lista de espera es por ocurrencia, no por serie).
  // El orden es el de la cola solo para que el correo salga en ese orden: la
  // plaza no es de nadie hasta que alguien la reclama.
  const waiting = await prisma.booking.findMany({
    where: {
      sessionId,
      occurrenceDate,
      status: "WAITLISTED",
      memberId: excludeMemberId ? { not: excludeMemberId } : undefined,
    },
    orderBy: [{ waitlistPosition: "asc" }, { bookedAt: "asc" }],
    select: {
      member: {
        select: {
          id: true,
          firstName: true,
          ...MEMBER_EMAIL_PREFERENCES_SELECT,
          user: { select: { email: true } },
        },
      },
    },
  });
  const toWaitlist = waiting.length > 0;

  const [org, centerCandidates] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId }, select: { name: true, logoUrl: true } }),
    // Con lista de espera el aviso no sale de ella: no hay a quién más consultar.
    toWaitlist
      ? []
      : prisma.member.findMany({
          where: {
            orgId,
            state: "ACTIVE",
            userId: { not: null },
            id: excludeMemberId ? { not: excludeMemberId } : undefined,
          },
          select: {
            id: true,
            firstName: true,
            ...MEMBER_EMAIL_PREFERENCES_SELECT,
            user: { select: { email: true } },
            subscriptions: { where: { status: "ACTIVE" }, select: { centerId: true, plan: { select: { type: true } } } },
          },
        }),
  ]);

  const recipients = (
    toWaitlist
      ? // Quien espera ya demostró al reservar que la clase le sirve: el filtro
        // de bono es solo para el aviso abierto al resto del centro.
        waiting.map((b) => b.member)
      : centerCandidates.filter((m) =>
          m.subscriptions.some((s) => s.centerId === session.centerId && planServiceKind(s.plan.type) === kind)
        )
  ).filter((m) =>
    // El aviso de plaza es correo prescindible: quien lo ha desactivado (o se
    // ha dado de baja de todo) no entra en el reparto.
    canSendMemberEmail("vacancy", m)
  );
  if (recipients.length === 0) return { notifiedMemberIds: [], toWaitlist };

  const brandName = org?.name ?? "Training Zone";
  const brandLogoUrl = absoluteUrl(org?.logoUrl || "/brand/tz-logo-white.png");
  const dateLabel = occurrenceDate.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
  const agendaUrl = absoluteUrl("/portal/agenda");

  const notifiedMemberIds: string[] = [];
  for (const member of recipients) {
    if (!member.user?.email) continue;
    notifiedMemberIds.push(member.id);
    const footer = memberEmailFooterLinks(member.id);
    // Fire-and-forget, igual que el resto de emails transaccionales del
    // portal: un SMTP lento no debe retrasar la respuesta de la cancelación.
    void sendMail({
      to: member.user.email,
      fromName: brandName,
      subject: `Se ha liberado una plaza · ${session.name}`,
      html: renderSessionVacancyEmail({
        recipientFirstName: member.firstName,
        brandName,
        brandLogoUrl,
        sessionName: session.name,
        dateLabel,
        startTime: session.startTime,
        centerName: session.center.name,
        agendaUrl,
        room: session.room ?? undefined,
        spotsLabel,
        fromWaitlist: toWaitlist,
        postalAddress: session.center.address ?? undefined,
        prefsToken: footer.token,
      }),
      unsubscribeUrl: footer.oneClickUnsubscribeUrl,
    });
  }

  return { notifiedMemberIds, toWaitlist };
}
