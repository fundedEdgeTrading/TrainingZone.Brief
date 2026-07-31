import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mailer";
import { renderSessionVacancyEmail } from "@/lib/emails/templates";
import { absoluteUrl } from "@/lib/invitations";
import { sessionServiceKind, planServiceKind } from "@/lib/members-queries";

/**
 * RB-RES-007 (decisión de negocio): en vez de "promocionar" automáticamente a
 * quien esperaba en la lista, cuando una sesión que estaba completa libera un
 * hueco se avisa por email a todos los socios con bono ACTIVE de ese mismo
 * tipo (EP/Grupos) en ese centro — la plaza la reclama quien reserve antes
 * desde el portal (ver `bookSessionForMember`), sin orden de cola garantizado.
 *
 * Se llama solo cuando una cancelación hace pasar la sesión de llena a con
 * hueco (nunca en cancelaciones de una clase que ya tenía sitio: ahí no hay
 * "oportunidad" que avisar). Envíos best-effort, no bloqueantes.
 */
export async function notifySessionVacancy(params: {
  orgId: string;
  sessionId: string;
  occurrenceDate: Date;
  /** El socio que acaba de cancelar no necesita el aviso de su propio hueco. */
  excludeMemberId?: string;
}) {
  const { orgId, sessionId, occurrenceDate, excludeMemberId } = params;

  const session = await prisma.classSession.findFirst({
    where: { id: sessionId, orgId },
    select: { name: true, classType: true, startTime: true, centerId: true, center: { select: { name: true } } },
  });
  if (!session) return;

  const kind = sessionServiceKind(session.classType);

  const [org, candidates] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId }, select: { name: true, logoUrl: true } }),
    prisma.member.findMany({
      where: {
        orgId,
        state: "ACTIVE",
        userId: { not: null },
        id: excludeMemberId ? { not: excludeMemberId } : undefined,
      },
      select: {
        id: true,
        firstName: true,
        user: { select: { email: true } },
        subscriptions: { where: { status: "ACTIVE" }, select: { centerId: true, plan: { select: { type: true } } } },
      },
    }),
  ]);

  const recipients = candidates.filter((m) =>
    m.subscriptions.some((s) => s.centerId === session.centerId && planServiceKind(s.plan.type) === kind)
  );
  if (recipients.length === 0) return;

  const brandName = org?.name ?? "Training Zone";
  const brandLogoUrl = absoluteUrl(org?.logoUrl || "/brand/tz-logo-white.png");
  const dateLabel = occurrenceDate.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
  const agendaUrl = absoluteUrl("/portal/agenda");

  for (const member of recipients) {
    if (!member.user?.email) continue;
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
      }),
    });
  }
}
