import { getDueAssessmentForMember } from "@/lib/assessment-jobs";
import { requireMember } from "../../_lib/require-member";
import { apiOk } from "../../_lib/response";

/**
 * Espejo móvil del gate de valoración del portal (F4 §5.3 · layout.tsx): misma
 * consulta, misma regla. Un socio que solo usa el móvil no puede escaparse del
 * formulario, así que la app necesita saber lo mismo que sabe la web al entrar.
 *
 * El cuestionario NO se rellena aquí: lo firma el entrenador con el socio
 * delante (F3), así que la respuesta lleva el aviso, no el formulario.
 */
export async function GET(req: Request) {
  const auth = await requireMember(req);
  if (!auth.ok) return auth.response;

  const due = await getDueAssessmentForMember(auth.member.id);
  return apiOk({
    assessment: due ? { id: due.id, kind: due.kind, label: due.label, dueDate: due.dueDate.toISOString() } : null,
  });
}
