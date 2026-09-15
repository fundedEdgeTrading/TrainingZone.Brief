import type { NextRequest } from "next/server";
import { z } from "zod";

import {
  ACCOUNT_DELETION_DEADLINE_TEXT,
  ACCOUNT_DELETION_PUBLIC_PATH,
  confirmPasswordForUser,
  getAccountDeletionDisclosure,
  getLatestDeletionRequest,
  requestAccountDeletion,
} from "@/lib/account-deletion";
import { absoluteUrl } from "@/lib/site";
import { requireMember } from "../../_lib/require-member";
import { apiError, apiOk } from "../../_lib/response";

/**
 * E5-15 · Borrado de cuenta desde la app (App Store Review 5.1.1(v)).
 *
 * Espejo de `src/app/(app)/portal/perfil/borrar-cuenta/`, y espejo de verdad:
 * la app NO lleva su propia copia del texto de qué se borra y qué se conserva.
 * Lo pide aquí. Una tabla duplicada "para que la app no tenga que llamar" es el
 * patrón que ya provocó un fallo documentado (E8-18, los rótulos de rol), y
 * este texto es peor candidato todavía: si divergiera, la app estaría
 * describiendo un tratamiento que no ocurre.
 *
 * Sin gate por plan: `/portal` está declarado sin funcionalidad en
 * `mobile-feature-routes.ts` y el gate se hereda. Ejercer un derecho no puede
 * depender de lo que haya contratado el centro.
 */

function statusPayload(
  request: Awaited<ReturnType<typeof getLatestDeletionRequest>>,
) {
  if (!request) return null;
  return {
    id: request.id,
    status: request.status,
    source: request.source,
    requestedAt: request.requestedAt.toISOString(),
    dueAt: request.dueAt.toISOString(),
    resolvedAt: request.resolvedAt?.toISOString() ?? null,
    resolutionNotes: request.resolutionNotes,
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireMember(req);
  if (!auth.ok) return auth.response;
  const { claims, member } = auth;

  const [disclosure, request] = await Promise.all([
    getAccountDeletionDisclosure({
      memberId: member.id,
      orgId: claims.orgId,
      actorUserId: claims.sub,
      actorRole: claims.role,
    }),
    getLatestDeletionRequest(member.id, claims.orgId),
  ]);
  if (!disclosure) return apiError("No se ha encontrado tu ficha de socio.", 404);

  return apiOk({
    disclosure,
    request: statusPayload(request),
    deadlineText: ACCOUNT_DELETION_DEADLINE_TEXT,
    publicUrl: absoluteUrl(ACCOUNT_DELETION_PUBLIC_PATH),
  });
}

const bodySchema = z.object({ password: z.string().min(1) });

export async function POST(req: NextRequest) {
  const auth = await requireMember(req);
  if (!auth.ok) return auth.response;
  const { claims, member } = auth;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("Confirma con tu contraseña.", 400);

  const confirmation = await confirmPasswordForUser(claims.sub, parsed.data.password);
  if (!confirmation.ok) {
    // 401 y no 403: lo que falla es la reautenticación, no el permiso. La app
    // necesita distinguirlo para volver a pedir la contraseña en vez de
    // mandar a nadie a iniciar sesión otra vez.
    return confirmation.reason === "NO_PASSWORD"
      ? apiError(
          "Tu cuenta no tiene contraseña propia. Fíjala desde «¿Has olvidado tu contraseña?» y vuelve a intentarlo.",
          409,
        )
      : apiError("La contraseña no es correcta.", 401);
  }

  const result = await requestAccountDeletion({
    memberId: member.id,
    orgId: claims.orgId,
    actorUserId: claims.sub,
    source: "MOBILE_APP",
  });
  if (!result.ok) return apiError(result.error, 404);

  return apiOk({ request: statusPayload(result.request), alreadyOpen: result.alreadyOpen ?? false }, 201);
}
