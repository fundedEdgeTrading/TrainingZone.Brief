import { createMemberWithInvitation } from "@/lib/invitations";
import { completeMemberOnboarding } from "@/app/onboarding/[token]/actions";
import { saveMemberInitialPart } from "@/lib/assessments/member-part";
import { createSelfDeclaredHealthRecord } from "@/lib/health-access";
import { bookSessionForMember, getMemberForUser } from "@/lib/portal-queries";
import { db } from "./db";

/**
 * Socios "de relleno" para llenar un grupo (R3), ocupar una franja de EP (R6)
 * o pasar lista (R10) en la organización NUEVA del recorrido. Mismo camino que
 * `e2e/fixtures/booking-members.ts`, pero parametrizado por organización y
 * centro en vez de colgarse del entrenador del seed, que aquí no existe.
 *
 * Se atraviesa por código lo que el recorrido principal ya cubre por pantalla
 * (alta, onboarding, muro de primera sesión, parte del socio de la valoración):
 * estos socios están para ocupar plazas, no para volver a probar el alta.
 *
 * El bono nace por `createMemberWithInvitation` → `createBonoSubscription`, que
 * escribe su asiento `PURCHASE` en `SessionLedger`: la invariante del trimestre
 * (ningún saldo sin asiento) se cumple igual que en un alta real.
 */
export type FillerMember = {
  memberId: string;
  userId: string;
  email: string;
  fullName: string;
  password: string;
};

export const FILLER_PASSWORD = "RellenoE2E!2026";

/** Alta con invitación, sin activar: el socio existe pero aún no tiene cuenta. */
export async function createInvitedMember(params: {
  orgId: string;
  centerId: string;
  firstName: string;
  lastName: string;
  email: string;
  planId?: string;
}) {
  const { member, invitation } = await db().$transaction((tx) =>
    createMemberWithInvitation(tx, {
      orgId: params.orgId,
      primaryCenterId: params.centerId,
      firstName: params.firstName,
      lastName: params.lastName,
      email: params.email,
      bonos: params.planId ? [{ planId: params.planId, centerId: params.centerId }] : [],
    })
  );
  return { memberId: member.id, token: invitation.token };
}

/**
 * Socio listo para reservar: alta con bono, cuenta activada con TODOS los
 * consentimientos obligatorios (salud incluido: P8 lo hará exigible en el
 * servidor y el relleno no puede depender de que hoy no lo sea), muro de
 * primera sesión superado y su parte de la valoración inicial enviada, para que
 * el aviso de valoración pendiente no tape el portal cuando entra por pantalla.
 */
export async function createFillerMember(params: {
  orgId: string;
  centerId: string;
  planId: string;
  tag: string;
  label: string;
}): Promise<FillerMember> {
  const firstName = "Relleno";
  const lastName = `${params.label} ${params.tag}`;
  const email = `relleno.${params.label.toLowerCase()}.${params.tag}@org-nueva-e2e.es`;

  const { memberId, token } = await createInvitedMember({
    orgId: params.orgId,
    centerId: params.centerId,
    firstName,
    lastName,
    email,
    planId: params.planId,
  });

  const result = await completeMemberOnboarding(token, {
    password: FILLER_PASSWORD,
    consentHealth: true,
    consentImages: false,
    consentMarketing: false,
    consentAI: false,
  });
  if (!result.ok) throw new Error(`No se pudo activar el socio de relleno ${email}: ${result.error}`);

  // Muro de primera sesión (E5-08): edad y contacto de emergencia.
  await db().member.update({
    where: { id: memberId },
    data: { birthDate: new Date("1991-02-11"), emergencyContact: "Contacto relleno — 600000000" },
  });
  await createSelfDeclaredHealthRecord({ memberId, orgId: params.orgId, description: "Ninguna" });

  const part = await saveMemberInitialPart({
    memberId,
    answers: {
      pesoKg: 72,
      dolorActual: 0,
      calidadSueno: 3,
      estres: 3,
      energia: 3,
      diasPorSemana: "2",
      perfil: {
        edad: 35,
        sexo: "OTRO",
        alturaCm: 174,
        objetivoPrincipal: "Ocupar una plaza",
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
  if (!part.ok) throw new Error(`No se pudo rellenar la valoración del socio de relleno ${email}: ${part.error}`);

  const saved = await db().member.findUniqueOrThrow({ where: { id: memberId }, select: { userId: true } });
  return { memberId, userId: saved.userId!, email, fullName: `${firstName} ${lastName}`, password: FILLER_PASSWORD };
}

/**
 * Reserva del socio de relleno por la MISMA función que usa el portal
 * (`bookSessionForMember`): descuenta su bono con asiento en el libro mayor y
 * respeta aforo y lista de espera. Lanza si no reserva, para que un grupo que
 * no se llena no pase desapercibido.
 */
export async function bookAsFiller(filler: FillerMember, sessionId: string, dayISO: string) {
  const member = await getMemberForUser(filler.userId);
  if (!member) throw new Error(`El socio de relleno ${filler.email} no tiene ficha.`);
  const result = await bookSessionForMember(member, sessionId, dayISO);
  if (!result.ok) throw new Error(`El socio de relleno ${filler.email} no pudo reservar: ${result.error}`);
  return result;
}
