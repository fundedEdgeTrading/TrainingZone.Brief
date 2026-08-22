import { requireRole } from "@/lib/guard";
import { getCentersForUser } from "@/lib/agenda-queries";
import { PageHeader } from "@/components/ui/page-header";
import { Field, Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ActionForm } from "@/components/ui/action-form";
import { updateCenterCapacity } from "./actions";

const CARD = "bg-brand-card border border-brand-border rounded-card p-5 shadow-card";

export default async function AforoPage() {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER_ADMIN"]);

  // Con `CenterMembership` una persona puede estar imputada a varios centros:
  // aquí solo salen los suyos (dirección de organización ve todos), con el
  // mismo criterio de ámbito que usa la agenda.
  const centers = await getCentersForUser(session.user);

  return (
    <div className="tz-page space-y-4">
      <PageHeader
        kicker="Aforo de clases"
        description="Plazas con las que nace una sesión de grupo nueva en cada centro. Cambiarlo no altera las sesiones ya creadas ni las plantillas: cada una conserva el aforo con el que se creó."
      />

      {centers.length === 0 ? (
        <p className="text-sm text-brand-muted">No estás imputado a ningún centro todavía.</p>
      ) : (
        centers.map((center) => (
          <ActionForm
            key={center.id}
            action={updateCenterCapacity}
            successMessage={`Aforo por defecto de ${center.name} guardado.`}
            resetOnSuccess={false}
            className={`${CARD} grid grid-cols-1 md:grid-cols-3 gap-3 items-end`}
          >
            <input type="hidden" name="centerId" value={center.id} />
            <div className="md:col-span-2">
              <div className="font-display font-extrabold text-lg uppercase tracking-[-.01em] text-brand-text">
                {center.name}
              </div>
              <p className="text-xs text-brand-muted mt-0.5">
                {center.defaultGroupCapacity
                  ? `Ahora mismo, ${center.defaultGroupCapacity} plazas por sesión.`
                  : "Sin aforo por defecto: cada sesión se crea con el que se indique a mano."}
              </p>
            </div>
            <Field label="Plazas por sesión" hint="Vacío = sin valor por defecto">
              <Input name="defaultGroupCapacity" type="number" min="1" step="1" defaultValue={center.defaultGroupCapacity ?? ""} />
            </Field>
            <Button type="submit" className="md:col-span-3 md:justify-self-start">
              Guardar aforo
            </Button>
          </ActionForm>
        ))
      )}
    </div>
  );
}
