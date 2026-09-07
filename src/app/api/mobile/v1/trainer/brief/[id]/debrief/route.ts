import type { NextRequest } from "next/server";
import { isDebriefFeeling, setSessionDebrief } from "@/lib/session-debrief";
import { revalidateSessionViews } from "@/lib/revalidate-sessions";
import { requireApiRoute } from "../../../../_lib/api-session";
import { apiOk, apiError } from "../../../../_lib/response";

/**
 * Debrief de sesión desde la app. E3-07: ya no es un "espejo" de la web que
 * pueda derivar — web y app escriben por el MISMO canal (`setSessionDebrief`),
 * con el mismo contrato y la misma gramática: color 🟢🟡🔴 más una frase
 * opcional, puesto por el dedo del entrenador.
 *
 * El ámbito de centro (E1-01) y la máquina de estados de la reserva (E2-02 ·
 * RB-RES-010) los aplica ese canal: este endpoint fue con el que se verificó el
 * fallo —`POST …/debrief` sobre una reserva cancelada respondía
 * `{"saved":true}` y la dejaba en ATTENDED— y ahora la garantía no depende de
 * que cada superficie se acuerde de repetirla.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRoute(req, ["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN", "RECEPTION"], "/trainer/brief/[id]/debrief");
  if (!auth.ok) return auth.response;
  const { claims } = auth;
  const { id: sessionId } = await params;

  const body = (await req.json().catch(() => null)) as
    | { bookingId?: string; feeling?: string; note?: string | null }
    | null;
  if (!body?.bookingId || !isDebriefFeeling(body.feeling)) {
    return apiError("Falta la reserva o el estado de la sesión.", 400);
  }

  const result = await setSessionDebrief({
    bookingId: body.bookingId,
    sessionId,
    orgId: claims.orgId,
    actorUserId: claims.sub,
    actorRole: claims.role,
    actorCenterId: claims.centerId,
    feeling: body.feeling,
    note: body.note,
  });
  // 409 y no 400 cuando el estado no encaja: la petición es correcta, lo que no
  // encaja es la reserva.
  if (!result.ok) return apiError(result.error, result.status);

  revalidateSessionViews(sessionId);
  return apiOk({ saved: true });
}
