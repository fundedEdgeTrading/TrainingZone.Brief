import { prisma } from "@/lib/prisma";

/**
 * Estado de la puesta en marcha, DERIVADO de los datos reales. A propósito no
 * hay un campo `setupStep` persistido: se desincroniza el primer día que alguien
 * cree un centro por otra vía, y entonces miente.
 *
 * Solo un paso es bloqueante (el primer centro: los socios cuelgan de él). Los
 * demás bloquean únicamente la acción que dependen de ellos, no el uso de la app
 * — se entra desde el minuto uno.
 */
export type SetupStep = {
  id: string;
  label: string;
  hint: string;
  done: boolean;
  href: string;
  blocking: boolean;
};

export async function getSetupChecklist(orgId: string): Promise<SetupStep[]> {
  const [org, centers, plans, staff, members, stripeAccount] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: orgId },
      select: { taxId: true, billingName: true, logoUrl: true },
    }),
    prisma.center.count({ where: { orgId } }),
    prisma.membershipPlan.count({ where: { orgId, active: true } }),
    prisma.user.count({ where: { orgId, role: { not: "OWNER" } } }),
    prisma.member.count({ where: { orgId } }),
    prisma.stripeAccount.findUnique({ where: { orgId }, select: { chargesEnabled: true } }),
  ]);

  return [
    {
      id: "fiscal",
      label: "Datos de tu empresa",
      hint: "Razón social y NIF para tus facturas.",
      done: !!org?.taxId && !!org?.billingName,
      href: "/organization",
      blocking: false,
    },
    {
      id: "centro",
      label: "Tu primer centro",
      hint: "Necesario para dar de alta socios y agenda.",
      done: centers > 0,
      href: "/organization",
      blocking: true,
    },
    {
      id: "productos",
      label: "Tus tarifas y bonos",
      hint: "Lo que vendes: cuotas, bonos de sesiones, entrenamiento personal.",
      done: plans > 0,
      href: "/organization",
      blocking: false,
    },
    {
      id: "equipo",
      label: "Tu equipo",
      hint: "Invita a entrenadores, recepción y dirección de centro.",
      done: staff > 0,
      href: "/organization",
      blocking: false,
    },
    {
      id: "socios",
      label: "Tus socios",
      hint: "Alta manual o importación desde un CSV.",
      done: members > 0,
      href: "/members",
      blocking: false,
    },
    {
      id: "stripe",
      label: "Conectar Stripe",
      hint: "Para cobrar a tus socios online. El dinero va a tu cuenta, no a la nuestra.",
      done: !!stripeAccount?.chargesEnabled,
      href: "/organization",
      blocking: false,
    },
    {
      id: "marca",
      label: "Tu logo",
      hint: "Aparecerá en la app y en los emails que reciban tus socios.",
      done: !!org?.logoUrl,
      href: "/organization",
      blocking: false,
    },
  ];
}

export function setupProgress(steps: SetupStep[]) {
  const done = steps.filter((s) => s.done).length;
  return { done, total: steps.length, complete: done === steps.length };
}
