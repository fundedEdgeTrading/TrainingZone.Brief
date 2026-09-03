import type { NextRequest } from "next/server";
import { cancelSessionBooking, getBookingCenterId } from "@/lib/agenda-queries";
import { isCenterInScope } from "@/lib/center-scope";
import { revalidateSessionViews } from "@/lib/revalidate-sessions";
import { requireApiRole } from "../../../../../_lib/api-session";
import { apiOk, apiError } from "../../../../../_lib/response";

// Mismo staff que reserva desde el móvil (ver ../route.ts).
const STAFF_ROLES = ["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN", "RECEPTION"] as const;

// DELETE: quita a un socio del roster (RB-RES-006), reutilizando la misma
// devolución de bono que la cancelación desde la web.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; bookingId: string }> }) {
  const auth = await requireApiRole(req, [...STAFF_ROLES]);
  if (!auth.ok) return auth.response;
  const { claims } = auth;
  const { id, bookingId } = await params;

  // El centro sale de la reserva, no de la URL: es lo único que el cliente no
  // puede falsear para tocar el roster de otro centro.
  const centerId = await getBookingCenterId(claims.orgId, bookingId);
  if (!centerId) return apiError("No se ha encontrado esa reserva.", 404);
  const inScope = await isCenterInScope({ id: claims.sub, role: claims.role, orgId: claims.orgId, centerId: claims.centerId }, centerId);
  if (!inScope) return apiError("No se ha encontrado esa reserva.", 404);

  const result = await cancelSessionBooking(claims.orgId, bookingId);
  if (!result.ok) return apiError(result.error, 400);

  revalidateSessionViews(id);
  return apiOk({ cancelled: true });
}
