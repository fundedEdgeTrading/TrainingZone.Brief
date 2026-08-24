import { prisma } from "@/lib/prisma";
import { createMemberWithInvitation } from "@/lib/invitations";
import { completeMemberOnboarding } from "@/app/onboarding/[token]/actions";
import { saveMemberInitialPart } from "@/lib/assessments/member-part";

/**
 * Alta de socio para los tests de reservas por el mismo camino que el alta real
 * de dirección: `createMemberWithInvitation` (lo que dispara el email de
 * bienvenida) + `completeMemberOnboarding` con el token de ese email, que es lo
 * que crea la cuenta de acceso del socio. Solo se salta el envío del correo,
 * porque el navegador del test no tiene bandeja de entrada.
 *
 * Incluye también el muro de la primera sesión (F-ALTA), por el mismo motivo:
 * un socio real no llega a la pantalla de reservas sin haberlo pasado, así que
 * un fixture que se lo saltara probaría un estado que no existe. Estos tests
 * van de reservar, no de darse de alta, así que se atraviesa por código.
 */
export type Fixture = { memberId: string; userId: string; email: string; fullName: string };

export const MEMBER_PASSWORD = "demo1234";

export async function createBookingMember({
  tag,
  service,
}: {
  tag: string;
  /** EP = bono de entrenamiento personal · GROUP = bono de grupos reducidos. */
  service: "EP" | "GROUP";
}): Promise<Fixture> {
  const trainer = await prisma.user.findFirstOrThrow({ where: { email: "entrenador@trainingzone.es" } });
  const orgId = trainer.orgId;
  const centerId = trainer.centerId!;

  const plan = await prisma.membershipPlan.findFirstOrThrow({
    where: { orgId, type: service === "EP" ? "PERSONAL_TRAINING" : "SESSION_PACK", active: true },
    orderBy: { priceCents: "desc" },
  });

  const firstName = "Socio";
  const lastName = `E2E ${tag}`;
  const email = `socio.e2e.${tag}@example.com`;

  const { member, invitation } = await prisma.$transaction((tx) =>
    createMemberWithInvitation(tx, {
      orgId,
      primaryCenterId: centerId,
      firstName,
      lastName,
      email,
      bonos: [{ planId: plan.id, centerId }],
    })
  );

  const result = await completeMemberOnboarding(invitation.token, {
    password: MEMBER_PASSWORD,
    consentHealth: false,
    consentImages: false,
    consentMarketing: false,
    consentAI: false,
  });
  if (!result.ok) throw new Error(`No se pudo completar el onboarding del socio de prueba: ${result.error}`);

  // Primer tramo del muro: los datos que la importación no trae y que el socio
  // completa al entrar. Aquí el alta es por formulario, no por CSV, pero el
  // muro mira el dato, no su procedencia.
  await prisma.member.update({
    where: { id: member.id },
    data: {
      birthDate: new Date("1990-05-14"),
      phone: "+34600111222",
      postalCode: "50007",
      address: "Calle de prueba 1",
      city: "Zaragoza",
      province: "Zaragoza",
      emergencyContact: "Contacto E2E — 600333444",
    },
  });

  // Segundo tramo: su parte de la valoración inicial, que `completeMemberOnboarding`
  // acaba de abrir.
  const part = await saveMemberInitialPart({
    memberId: member.id,
    answers: {
      pesoKg: 70,
      dolorActual: 0,
      calidadSueno: 3,
      estres: 3,
      energia: 3,
      diasPorSemana: "2",
      perfil: {
        edad: 35,
        sexo: "OTRO",
        alturaCm: 175,
        objetivoPrincipal: "Ponerme en forma",
        objetivoSecundario: "",
        motivacionReal: "",
        queLeHariaAbandonar: "",
      },
      experiencia: {
        nivelActividad: "MEDIO",
        haEntrenadoAntes: false,
        anosExperiencia: 0,
        tecnicaBasicos: "MEDIA",
        ejerciciosNoTolera: "",
      },
    },
  });
  if (!part.ok) throw new Error(`No se pudo rellenar la valoración del socio de prueba: ${part.error}`);

  const saved = await prisma.member.findUniqueOrThrow({ where: { id: member.id }, select: { userId: true } });
  return { memberId: member.id, userId: saved.userId!, email, fullName: `${firstName} ${lastName}` };
}

/** Limpia socios de prueba y todo lo que cuelga de ellos (reservas, bonos, cuenta). */
export async function deleteBookingMembers(fixtures: Fixture[]) {
  for (const f of fixtures) {
    await prisma.sessionDebrief.deleteMany({ where: { booking: { memberId: f.memberId } } });
    await prisma.booking.deleteMany({ where: { memberId: f.memberId } });
    await prisma.subscription.deleteMany({ where: { memberId: f.memberId } });
    await prisma.selfAssessment.deleteMany({ where: { memberId: f.memberId } });
    // La valoración inicial la abre el propio onboarding (F-ALTA); sin borrarla,
    // el `member.deleteMany` de abajo choca contra su clave ajena.
    await prisma.assessment.deleteMany({ where: { memberId: f.memberId } });
    await prisma.clientGoal.deleteMany({ where: { memberId: f.memberId } });
    await prisma.memberProgressEntry.deleteMany({ where: { memberId: f.memberId } });
    await prisma.invitation.deleteMany({ where: { memberId: f.memberId } });
    await prisma.chatMessage.deleteMany({ where: { conversation: { memberId: f.memberId } } });
    await prisma.conversation.deleteMany({ where: { memberId: f.memberId } });
    await prisma.announcementView.deleteMany({ where: { memberId: f.memberId } });
    await prisma.trainerRating.deleteMany({ where: { memberId: f.memberId } });
    await prisma.notification.deleteMany({ where: { recipientUserId: f.userId } });
    await prisma.member.deleteMany({ where: { id: f.memberId } });
    await prisma.user.deleteMany({ where: { id: f.userId } });
  }
}
