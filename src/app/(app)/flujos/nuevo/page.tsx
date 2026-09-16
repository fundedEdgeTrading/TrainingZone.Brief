import Link from "next/link";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/guard";
import { canManageMembers } from "@/lib/rbac";
import { PageHeader } from "@/components/ui/page-header";
import { FlowEditor } from "../flow-editor";
import { emptyFlowValue } from "../editor-value";
import { flowEditorOptions } from "../editor-options";

/** Montar un flujo desde cero. Nace en BORRADOR, siempre: encenderlo es otro gesto. */
export default async function NuevoFlujoPage() {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR"]);
  if (!canManageMembers(session.user.role)) redirect("/flujos");

  const options = await flowEditorOptions(session.user);
  // Sin centro en el ámbito no hay flujo posible: un flujo es de un centro.
  if (options.centers.length === 0) redirect("/flujos");

  return (
    <>
      <PageHeader
        kicker="Nuevo flujo"
        description="Disparador → condición → espera → acción. Nada más: el editor no deja construir otra cosa, y lo que se guarda se vuelve a comprobar en el servidor."
        actions={
          <Link href="/flujos" className="text-[13px] underline text-brand-muted hover:text-brand-ink">
            Volver
          </Link>
        }
      />
      <FlowEditor options={options} initial={emptyFlowValue(options.centers[0].id)} />
    </>
  );
}
