// F-ALTA: la mitad de la valoración inicial que rellena el propio socio.
//
// F3 dejó la valoración entera del lado del entrenador porque es él quien firma
// el PAR-Q con el socio delante y quien interpreta el screening. Eso sigue
// siendo cierto para la parte clínica, pero deja un hueco: hasta que el socio
// pisa el centro no hay ni objetivo, ni altura, ni punto de partida, y son
// justo los datos con los que se arma su primer mesociclo. Aquí el socio aporta
// lo que sabe de sí mismo y el entrenador se encuentra la valoración ya medio
// escrita.

import { prisma } from "@/lib/prisma";
import type { MemberInitialPartAnswers } from "./schemas";

export type SaveMemberPartResult = { ok: true; assessmentId: string } | { ok: false; error: string };

/** El sexo de la valoración y el de la ficha son el mismo dato con dos vocabularios. */
const SEX_FROM_ANSWER = { HOMBRE: "MALE", MUJER: "FEMALE", OTRO: "OTHER" } as const;

/**
 * Guarda el borrador del socio sobre su valoración inicial.
 *
 * Deliberadamente **no** cierra la valoración ni propaga nada a HealthRecord,
 * ClientGoal, MemberProgressEntry ni PerformanceMetric: todo eso lo hace
 * `saveAssessment` cuando el entrenador la cierra, y hacerlo dos veces
 * duplicaría objetivos y pesaría al socio dos veces el mismo día. Lo único que
 * sí sube a la ficha es lo que allí estaba vacío (altura y sexo), porque son
 * identidad del socio y no una foto del día: la altura es la base del IMC y de
 * los rangos de referencia, y sin ella la composición corporal no se calcula.
 */
export async function saveMemberInitialPart({
  memberId,
  answers,
}: {
  memberId: string;
  answers: MemberInitialPartAnswers;
}): Promise<SaveMemberPartResult> {
  // Se busca por socio y no por id de valoración a propósito: el muro de
  // primera sesión no le enseña ningún id al navegador, así que no hay forma de
  // que llegue aquí el de otra persona.
  const assessment = await prisma.assessment.findFirst({
    where: { memberId, kind: "INITIAL", completedAt: null, memberPartAt: null },
    select: { id: true, answers: true },
  });
  if (!assessment) {
    return { ok: false, error: "No tienes ninguna valoración inicial pendiente de rellenar." };
  }

  const now = new Date();
  const existing = (assessment.answers ?? {}) as Record<string, unknown>;

  await prisma.$transaction(async (tx) => {
    await tx.assessment.update({
      where: { id: assessment.id },
      // Se fusiona sobre lo que ya hubiera en `answers` en vez de sustituirlo:
      // si el entrenador dejó algo apuntado antes de que el socio entrara, su
      // borrador no debe borrarlo. `filledByUserId` se queda como está —lo
      // firma quien cierra la valoración, no quien la empieza.
      data: { answers: { ...existing, ...answers }, memberPartAt: now },
    });

    const member = await tx.member.findUnique({
      where: { id: memberId },
      select: { heightCm: true, sex: true },
    });
    // Solo se rellena lo que faltaba: si dirección ya tenía un dato en la
    // ficha, no lo pisa un formulario contestado de memoria.
    const patch = {
      ...(member?.heightCm == null ? { heightCm: answers.perfil.alturaCm } : {}),
      ...(member?.sex == null ? { sex: SEX_FROM_ANSWER[answers.perfil.sexo] } : {}),
    };
    if (Object.keys(patch).length) {
      await tx.member.update({ where: { id: memberId }, data: patch });
    }
  });

  return { ok: true, assessmentId: assessment.id };
}
