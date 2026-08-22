import { redirect } from "next/navigation";

// "Mi plan" se fusionó con "Comprar / renovar" en "Mi membresía" (handoff
// NavBar premium 1b). Redirect en código para no romper enlaces/bookmarks
// existentes; el 308 real a nivel de red vive en next.config.ts.
export default function PortalPlanRedirect() {
  redirect("/portal/membresia");
}
