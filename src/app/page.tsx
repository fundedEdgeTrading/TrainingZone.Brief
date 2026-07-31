import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { defaultRouteForRole } from "@/lib/rbac";

export default async function Home() {
  const session = await auth();
  // Sin sesión, la raíz es la landing comercial: comprar un plan de Apta es lo
  // mismo que dar de alta un gimnasio (RB-ALTA-001), así que no tiene sentido
  // mandar a un visitante nuevo directo al login.
  if (!session?.user) redirect("/planes");
  redirect(defaultRouteForRole(session.user.role));
}
