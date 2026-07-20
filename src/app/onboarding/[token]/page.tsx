import { prisma } from "@/lib/prisma";
import { ROLE_LABEL } from "@/lib/rbac";
import OnboardingForm from "./onboarding-form";

function InvalidLinkScreen({ message }: { message: string }) {
  return (
    <div className="min-h-dvh bg-tz-black flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-[420px] bg-white border border-tz-linen rounded-card shadow-pop p-8 text-center">
        <h1 className="font-display font-extrabold text-xl uppercase tracking-[-.01em] text-tz-black">
          Enlace no disponible
        </h1>
        <p className="text-sm text-muted mt-3">{message}</p>
        <a
          href="/login"
          className="inline-block mt-6 font-semibold bg-tz-black text-tz-bone rounded-control px-6 py-3 text-sm no-underline"
        >
          Volver al login
        </a>
      </div>
    </div>
  );
}

export default async function OnboardingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const invitation = await prisma.invitation.findUnique({
    where: { token },
    include: {
      organization: { select: { name: true, logoUrl: true } },
      member: { select: { firstName: true, lastName: true, email: true, primaryCenter: { select: { name: true } } } },
      user: { select: { name: true, email: true, role: true } },
    },
  });

  if (!invitation) return <InvalidLinkScreen message="Este enlace no es válido." />;
  if (invitation.usedAt) return <InvalidLinkScreen message="Este enlace ya se ha utilizado. Si necesitas acceder, inicia sesión o pide que te reenvíen la invitación." />;
  if (invitation.expiresAt < new Date()) return <InvalidLinkScreen message="Este enlace ha caducado (los enlaces de invitación duran 7 días). Pide que te reenvíen la invitación." />;

  const orgName = invitation.organization.name;
  const orgLogoUrl = invitation.organization.logoUrl || "/brand/tz-logo-white.png";

  if (invitation.type === "MEMBER" && invitation.member) {
    return (
      <OnboardingForm
        token={token}
        type="MEMBER"
        firstName={invitation.member.firstName}
        email={invitation.member.email}
        orgName={orgName}
        orgLogoUrl={orgLogoUrl}
        contextLabel={invitation.member.primaryCenter.name}
      />
    );
  }

  if (invitation.type === "STAFF" && invitation.user) {
    const firstName = invitation.user.name.trim().split(/\s+/)[0] ?? invitation.user.name;
    return (
      <OnboardingForm
        token={token}
        type="STAFF"
        firstName={firstName}
        email={invitation.user.email}
        orgName={orgName}
        orgLogoUrl={orgLogoUrl}
        contextLabel={ROLE_LABEL[invitation.user.role]}
      />
    );
  }

  return <InvalidLinkScreen message="Este enlace no es válido." />;
}
