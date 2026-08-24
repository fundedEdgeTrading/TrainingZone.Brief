import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { getMemberForUser } from "@/lib/portal-queries";
import { getOrCreateConversation, listMessages } from "@/lib/chat";
import { needsReconsent } from "@/lib/consent";
import { getDueAssessmentForMember } from "@/lib/assessment-jobs";
import { getPendingBirthdayGreeting } from "@/lib/birthday-jobs";
import { resolveTimezone } from "@/lib/timezone";
import { resolveFirstSessionStep } from "@/lib/member-first-session";
import { FloatingChat } from "./floating-chat";
import { ReconsentBanner } from "./reconsent-banner";
import { PendingAssessmentGate } from "./pending-assessment-gate";
import { BirthdayGreetingScreen } from "./birthday-greeting";
import { FirstSessionWall } from "./first-session-wall";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  // El chat flotante es exclusivo del socio. Para el resto de roles (que solo
  // llegarían aquí por URL directa) montamos el portal sin el launcher.
  let floatingChat = null;
  let gate = null;
  let greeting = null;
  // El aviso de re-consentimiento vive en el layout, no en una pantalla suelta:
  // el socio tiene que verlo entre por donde entre al portal (F3 §4.4).
  let reconsentNeeded = false;
  if (session.user.role === "MEMBER") {
    const member = await getMemberForUser(session.user.id);
    if (member) {
      // F-ALTA: el muro de la primera sesión va ANTES que nada y se devuelve en
      // lugar del portal, no encima. Un socio importado por CSV llega sin CP ni
      // teléfono y sin valoración: pedírselo en un modal sobre un portal que
      // sigue siendo navegable con el tabulador es pedirlo de mentira.
      const firstStep = await resolveFirstSessionStep(member);
      if (firstStep) {
        const org = await prisma.organization.findUnique({
          where: { id: session.user.orgId },
          select: { name: true, logoUrl: true },
        });
        return (
          <FirstSessionWall
            step={firstStep.step}
            missing={firstStep.step === "profile" ? firstStep.missing : []}
            orgName={org?.name ?? "Training Zone"}
            orgLogoUrl={member.primaryCenter.logoUrl || org?.logoUrl || "/brand/tz-logo-white.png"}
          />
        );
      }

      reconsentNeeded = needsReconsent(member);
      const conversation = await getOrCreateConversation(session.user.orgId, member.id);
      const messages = await listMessages(conversation.id);
      floatingChat = (
        <FloatingChat
          conversationId={conversation.id}
          initialMessages={messages.map((m) => ({
            id: m.id,
            senderKind: m.senderKind,
            senderName: m.sender?.name ?? null,
            body: m.body,
            createdAt: m.createdAt,
          }))}
        />
      );

      const timezone = await resolveTimezone(member.primaryCenter.timezone);
      const [dueAssessment, pendingGreeting] = await Promise.all([
        getDueAssessmentForMember(member.id),
        getPendingBirthdayGreeting(session.user.orgId, session.user.id, member.id, timezone),
      ]);

      // El cumpleaños tiene prioridad: felicitar y a continuación reclamar una
      // valoración en la misma pantalla sería de un gusto discutible. La
      // valoración sigue vencida mañana.
      if (pendingGreeting) {
        greeting = <BirthdayGreetingScreen greeting={pendingGreeting} />;
      } else if (dueAssessment) {
        gate = (
          <PendingAssessmentGate
            label={dueAssessment.label}
            portalPath={dueAssessment.portalPath}
            dueDateLabel={dueAssessment.dueDate.toLocaleDateString("es-ES", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          />
        );
      }
    }
  }

  return (
    <>
      <ReconsentBanner needed={reconsentNeeded} />
      {children}
      {floatingChat}
      {greeting}
      {gate}
    </>
  );
}
