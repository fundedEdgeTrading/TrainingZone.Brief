import { requireRole } from "@/lib/guard";
import { centerScopeFor, isCenterInScope } from "@/lib/center-scope";
import { getPostalCodeMapData } from "@/lib/dashboard-queries";
import { getMapCoverage } from "@/lib/barrio-coverage-queries";
import { groupBarriosByCity } from "@/lib/barrio-map";
import { parseBarrioMapParams } from "@/lib/barrio-map-params";
import { ROLE_LABEL } from "@/lib/rbac";
import { EmptyState } from "@/components/ui/empty-state";
import { BarrioMapView } from "./barrio-map-view";

/**
 * Mapa de barrios (RB-LEAD-010): la lectura geográfica del panel de control, a
 * pantalla completa y por coropletas. Mismo alcance de roles que `/dashboard`,
 * de donde se abre.
 *
 * E11-07 · El estado vive en la URL (`ciudad`, `metrica`, `range`, `estado`,
 * `centerId`), como en `/dashboard`. Antes esta pantalla ni leía `searchParams`:
 * el mapa era siempre acumulado histórico —no comparable con el resto del
 * panel, con los mismos rótulos— y su vista no se podía enlazar ni compartir.
 */
export default async function MapaBarriosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "PLATFORM_ADMIN"]);
  const params = parseBarrioMapParams(await searchParams);

  // Ámbito de centro (center-scope.ts): antes se pasaba siempre la organización
  // entera, para cualquier rol.
  const scope = await centerScopeFor(session.user);

  // Un `?centerId=` escrito a mano NUNCA amplía lo que se ve: se cruza contra el
  // ámbito real antes de llegar a ninguna consulta. Si no está dentro, se ignora
  // y se sirve el ámbito completo, que es lo que esa persona sí puede mirar.
  const centerId = params.centerId && (await isCenterInScope(session.user, params.centerId)) ? params.centerId : null;
  const centerIds = centerId ? [centerId] : (scope ?? undefined);

  const [{ points, centers }, coverage] = await Promise.all([
    getPostalCodeMapData(session.user.orgId, {
      centerIds,
      // E11-07 · El rango viaja hasta la agregación. Ver
      // `docs/hu/T7-peticion-dashboard-queries.md`: hoy `getPostalCodeMapData`
      // lo recibe y no lo aplica, y ese fichero es de otra pista.
      range: params.range,
    }),
    // E11-05 · Con el MISMO ámbito de centro que la agregación: un pie que
    // contara la organización entera mientras el plano cuenta un solo centro
    // mentiría diciendo que falta gente que no debería salir.
    getMapCoverage(session.user.orgId, { centerIds }),
  ]);
  const cities = groupBarriosByCity(points, centers);

  if (cities.length === 0) {
    return (
      <div data-full-bleed className="absolute inset-0 flex items-center justify-center p-6">
        <EmptyState
          title="Todavía no hay nada que situar en el mapa"
          description="Ningún socio ni lead tiene un código postal reconocido. En cuanto los haya, sus barrios se pintan aquí."
        />
      </div>
    );
  }

  return (
    <BarrioMapView
      cities={cities}
      roleLabel={ROLE_LABEL[session.user.role]}
      coverage={coverage}
      params={{ ...params, centerId }}
    />
  );
}
