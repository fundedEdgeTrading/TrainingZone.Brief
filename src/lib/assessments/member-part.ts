// F-ALTA: la mitad de la valoración que rellena el propio socio.
//
// F3 dejó la valoración entera del lado del entrenador porque es él quien firma
// el PAR-Q con el socio delante y quien interpreta el screening. Eso sigue
// siendo cierto para la parte clínica, pero deja un hueco: hasta que el socio
// pisa el centro no hay ni objetivo, ni altura, ni punto de partida, y son
// justo los datos con los que se arma su primer mesociclo. Aquí el socio aporta
// lo que sabe de sí mismo y el entrenador se encuentra la valoración ya medio
// escrita.
//
// M5 · la misma escritura la comparten dos entradas: el portal del socio
// (`/portal/valoracion/<id>`, que busca la inicial pendiente por socio) y el
// formulario enviado por correo a quien todavía no tiene cuenta
// (`/formulario/<token>`, que ya sabe qué valoración es). Un segundo camino de
// escritura habría sido un segundo sitio donde olvidarse de `memberPartAt`.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { MemberInitialPartAnswers, MemberPartAnswers } from "./schemas";

export type SaveMemberPartResult = { ok: true; assessmentId: string } | { ok: false; error: string };

/** El sexo de la valoración y el de la ficha son el mismo dato con dos vocabularios. */
const SEX_FROM_ANSWER = { HOMBRE: "MALE", MUJER: "FEMALE", OTRO: "OTHER" } as const;

/** Las respuestas del socio traen `perfil` solo cuando la valoración es la inicial. */
function isInitialPart(answers: MemberPartAnswers): answers is MemberInitialPartAnswers {
  return "perfil" in answers;
}

/**
 * Escribe la parte del socio sobre una valoración YA identificada, dentro de la
 * transacción que le pase quien llama.
 *
 * Deliberadamente **no** cierra la valoración ni propaga nada a HealthRecord,
 * ClientGoal, MemberProgressEntry ni PerformanceMetric: todo eso lo hace
 * `saveAssessment` cuando el entrenador la cierra, y hacerlo dos veces
 * duplicaría objetivos y pesaría al socio dos veces el mismo día. Es también lo
 * que cumple «lo que llega de un formulario no toca el semáforo de aptitud por
 * su cuenta» (E14-20): un dato que nadie ha verificado no enciende una luz.
 *
 * Lo único que sí sube a la ficha es lo que allí estaba vacío (altura y sexo),
 * porque son identidad del socio y no una foto del día: la altura es la base del
 * IMC y de los rangos de referencia, y sin ella la composición corporal no se
 * calcula.
 */
export async function writeMemberPart(
  tx: Prisma.TransactionClient,
  params: { assessmentId: string; memberId: string; answers: MemberPartAnswers; now: Date }
): Promise<void> {
  const assessment = await tx.assessment.findUnique({
    where: { id: params.assessmentId },
    select: { answers: true },
  });
  const existing = (assessment?.answers ?? {}) as Record<string, unknown>;

  await tx.assessment.update({
    where: { id: params.assessmentId },
    // Se fusiona sobre lo que ya hubiera en `answers` en vez de sustituirlo:
    // si el entrenador dejó algo apuntado antes de que el socio entrara, su
    // borrador no debe borrarlo. `filledByUserId` se queda como está —lo
    // firma quien cierra la valoración, no quien la empieza.
    data: { answers: { ...existing, ...params.answers }, memberPartAt: params.now },
  });

  if (!isInitialPart(params.answers)) return;

  const member = await tx.member.findUnique({
    where: { id: params.memberId },
    select: { heightCm: true, sex: true },
  });
  // Solo se rellena lo que faltaba: si dirección ya tenía un dato en la
  // ficha, no lo pisa un formulario contestado de memoria.
  const patch = {
    ...(member?.heightCm == null ? { heightCm: params.answers.perfil.alturaCm } : {}),
    ...(member?.sex == null ? { sex: SEX_FROM_ANSWER[params.answers.perfil.sexo] } : {}),
  };
  if (Object.keys(patch).length) {
    await tx.member.update({ where: { id: params.memberId }, data: patch });
  }
}

/**
 * Guarda el borrador del socio sobre su valoración inicial desde el portal.
 *
 * Se busca por socio y no por id de valoración a propósito: el muro de primera
 * sesión no le enseña ningún id al navegador, así que no hay forma de que
 * llegue aquí el de otra persona.
 */
export async function saveMemberInitialPart({
  memberId,
  answers,
}: {
  memberId: string;
  answers: MemberInitialPartAnswers;
}): Promise<SaveMemberPartResult> {
  const assessment = await prisma.assessment.findFirst({
    where: { memberId, kind: "INITIAL", completedAt: null, memberPartAt: null },
    select: { id: true },
  });
  if (!assessment) {
    return { ok: false, error: "No tienes ninguna valoración inicial pendiente de rellenar." };
  }

  const now = new Date();
  await prisma.$transaction((tx) => writeMemberPart(tx, { assessmentId: assessment.id, memberId, answers, now }));

  return { ok: true, assessmentId: assessment.id };
}
