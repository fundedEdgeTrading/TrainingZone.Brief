import type { NextRequest } from "next/server";
import { getMemberMovements } from "@/lib/member-movements";
import { requireMember } from "../../_lib/require-member";
import { apiOk } from "../../_lib/response";

/**
 * «Historial de consumo» del socio: el libro mayor del bono, no la lista de
 * clases a las que fue.
 *
 * E2-15 · RB-VENTA-008. Antes esta pantalla se contradecía a sí misma: la
 * tarjeta decía "5 gastadas de 12", el resumen decía "0 gastadas" y "9 no
 * presentadas", y el listado que promete *"aquí aparece cada sesión gastada y
 * cada devolución"* no tenía ni una línea de consumo. La causa era que el
 * movimiento se DERIVABA de `booking.subscriptionId` —y 1.458 de 1.458
 * `ATTENDED` y 155 de 155 `NO_SHOW` lo tenían a NULL, porque la cancelación lo
 * pone a null y la reserva agendada a mano nunca lo puso— mientras las
 * devoluciones se leían solo de `AuditLog`, que únicamente escribía el descarte
 * móvil.
 *
 * Ahora las tres cifras salen de `SessionLedger`, así que no pueden
 * contradecirse: son la misma lista contada de tres maneras. El movimiento se
 * ESCRIBE cuando ocurre (invariante del trimestre: nada mueve
 * `sessionsRemaining` sin dejar asiento), no se reconstruye después.
 *
 * E5-09: la consulta vive en `@/lib/member-movements` y la comparte con
 * `/portal/movimientos` en la web — la misma función, no una copia. Es lo que
 * hace que el escenario "paridad con la app" se cumpla por construcción.
 */
export async function GET(req: NextRequest) {
  const auth = await requireMember(req);
  if (!auth.ok) return auth.response;
  return apiOk(await getMemberMovements(auth.member.id));
}
