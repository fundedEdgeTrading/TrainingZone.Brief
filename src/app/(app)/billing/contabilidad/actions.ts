"use server";

import { requireRole } from "@/lib/guard";
import { orgHasFeatureNow } from "@/lib/entitlements";
import { buildAccountingExport, logAccountingExport, parseAccountingMonth } from "@/lib/stripe-export";
import { resolveAccountingScope } from "./resolve-scope";

export type DownloadResult = { ok: true; csv: string; fileName: string } | { ok: false; error: string };

const SIN_PLAN =
  "La exportación de datos entra en el plan Avanzado. Cambia de plan para llevarte el extracto a la gestoría.";

/**
 * HU-ST-25 · Descarga del extracto contable del periodo.
 *
 * El CSV se arma EN EL SERVIDOR aunque la descarga la dispare el navegador: es
 * la única forma de que el ámbito de centro y el rastro de `AuditLog` no
 * dependan de lo que el cliente decida mandar. El navegador solo recibe el
 * fichero ya hecho y lo guarda, como en `export-ranking-button`.
 *
 * `requireFeature` redirige, y una acción de servidor que redirige deja al
 * botón sin respuesta que enseñar: aquí se comprueba el plan con
 * `orgHasFeatureNow` y se devuelve el motivo. La guarda que redirige sigue
 * estando en la pantalla.
 */
export async function downloadAccountingCsvAction(input: {
  mes?: string;
  centerId?: string | null;
}): Promise<DownloadResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR"]);
  if (!(await orgHasFeatureNow(session.user.orgId, "exportaciones"))) {
    return { ok: false, error: SIN_PLAN };
  }

  const scope = await resolveAccountingScope(session.user, input.centerId);
  const mes = parseAccountingMonth(input.mes);

  const exportacion = await buildAccountingExport(session.user.orgId, {
    from: mes.from,
    to: mes.to,
    centerIds: scope.centerIds,
    scopeLabel: scope.scopeLabel,
  });

  // Quién se llevó qué periodo y cuándo. Va antes de devolver el fichero: si la
  // fila no se puede escribir, la exportación no sale.
  await logAccountingExport({
    orgId: session.user.orgId,
    actorUserId: session.user.id,
    from: mes.from,
    to: mes.to,
    centerIds: scope.centerIds,
    rows: exportacion.movements.length,
  });

  return { ok: true, csv: exportacion.csv, fileName: exportacion.fileName };
}
