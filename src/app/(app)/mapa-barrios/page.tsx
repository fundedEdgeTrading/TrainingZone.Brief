import { requireRole } from "@/lib/guard";
import { getPostalCodeMapData } from "@/lib/dashboard-queries";
import { groupBarriosByCity } from "@/lib/barrio-map";
import { ROLE_LABEL } from "@/lib/rbac";
import { EmptyState } from "@/components/ui/empty-state";
import { BarrioMapView } from "./barrio-map-view";

/**
 * Mapa de barrios (RB-LEAD-010): la lectura geográfica del panel de control, a
 * pantalla completa y por coropletas. Mismo alcance de roles que `/dashboard`,
 * de donde se abre.
 */
export default async function MapaBarriosPage() {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "PLATFORM_ADMIN"]);
  const { points, centers } = await getPostalCodeMapData(session.user.orgId);
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

  return <BarrioMapView cities={cities} roleLabel={ROLE_LABEL[session.user.role]} />;
}
