import { requireRole } from "@/lib/guard";
import { requireFeature } from "@/lib/entitlements";
import { getFlowsModuleState } from "@/lib/flows/queries";
import { FlowsModuleBanner } from "./module-banner";

/**
 * El layout del módulo existe por UNA razón: la banda de pausa global tiene que
 * verse desde CUALQUIER pantalla de `/flujos` (E14-27), no solo desde el
 * listado. Si la pintara la página, quien esté montando un flujo nuevo no
 * sabría que el módulo está parado.
 *
 * El gateo (`marketing_automatizado`) se hereda por prefijo desde
 * `FEATURE_BY_ROUTE`, pero se comprueba aquí también: las rutas hijas de este
 * layout no pasan por el `page.tsx` del listado.
 */
export default async function FlujosLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR"]);
  await requireFeature("marketing_automatizado");

  const state = await getFlowsModuleState(session.user);

  return (
    <div className="tz-page space-y-6">
      <FlowsModuleBanner
        pausedAt={state.pausedAt ? state.pausedAt.toISOString() : null}
        queued={state.queued}
        canPause={session.user.role === "OWNER"}
        testEmail={state.testEmail}
      />
      {children}
    </div>
  );
}
