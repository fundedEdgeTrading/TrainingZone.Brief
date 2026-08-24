"use client";

import { createContext, useContext, useRef, useState, useTransition } from "react";
import type { Role } from "@prisma/client";
import { Drawer, DrawerFooter } from "@/components/ui/drawer";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { Button, ButtonSpinner } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { ROLE_LABEL } from "@/lib/rbac";
import { updateStaffUser, removeStaffUser, restoreStaffUser } from "./actions";

export type StaffRowData = {
  id: string;
  name: string;
  email: string;
  role: Role;
  centerId: string | null;
  visibleInApp: boolean;
  deactivated: boolean;
};

type StaffActions = { edit: (staff: StaffRowData) => void; remove: (staff: StaffRowData) => void };

/**
 * Un único drawer de edición y un único diálogo de baja para toda la tabla, con
 * la fila elegida en el estado (mismo patrón que el gestor de anuncios y que la
 * baja de socio). Montar uno por fila metía 28 `aria-modal` en el árbol de
 * accesibilidad para enseñar como mucho uno.
 */
const StaffActionsContext = createContext<StaffActions | null>(null);

export function StaffActionsProvider({
  centers,
  editRoles,
  children,
}: {
  centers: { id: string; name: string }[];
  editRoles: Role[];
  children: React.ReactNode;
}) {
  const [editing, setEditing] = useState<StaffRowData | null>(null);
  const [removing, setRemoving] = useState<StaffRowData | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function confirmRemoval() {
    if (!removing) return;
    const staff = removing;
    startTransition(async () => {
      const result = await removeStaffUser(staff.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setRemoving(null);
      toast.success(
        result.purged
          ? { title: "Persona eliminada", description: `${staff.name} ya no está en la plantilla.` }
          : {
              title: "Baja registrada",
              description: `${staff.name} pierde el acceso; su histórico de trabajo se conserva.`,
            }
      );
    });
  }

  return (
    <StaffActionsContext.Provider value={{ edit: setEditing, remove: setRemoving }}>
      {children}
      <StaffEditDrawer
        staff={editing}
        centers={centers}
        editRoles={editRoles}
        onClose={() => setEditing(null)}
      />
      <ConfirmDialog
        open={!!removing}
        onCancel={() => setRemoving(null)}
        onConfirm={confirmRemoval}
        pending={pending}
        kicker="Baja de plantilla"
        title={`Dar de baja a ${removing?.name ?? ""}`}
        description={
          <>
            Pierde el acceso a la plataforma y deja de estar imputada a ningún centro. Su histórico de
            trabajo —clases impartidas, cobros, fichajes— se conserva; si no tiene ninguno, su ficha se
            elimina y su email queda libre para volver a invitarla.
          </>
        }
        confirmLabel="Dar de baja"
        pendingLabel="Dando de baja..."
      />
    </StaffActionsContext.Provider>
  );
}

/**
 * Acciones por fila de la plantilla: editar la ficha, dar de baja y
 * reincorporar. Qué se enseña lo decide el servidor (`canEdit`/`canDelete`) y
 * lo vuelve a comprobar cada acción — esto es UI, no la frontera de permisos.
 */
export function StaffRowActions({
  staff,
  canEdit,
  canDelete,
}: {
  staff: StaffRowData;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const actions = useContext(StaffActionsContext);
  if (!actions) return null;

  return (
    <div className="flex items-center gap-1.5 justify-end">
      {canEdit && !staff.deactivated && (
        <Button variant="secondary" size="sm" onClick={() => actions.edit(staff)}>
          Editar
        </Button>
      )}
      {canDelete &&
        (staff.deactivated ? (
          <RestoreStaffButton staff={staff} />
        ) : (
          <Button variant="ghost" size="sm" onClick={() => actions.remove(staff)}>
            Dar de baja
          </Button>
        ))}
    </div>
  );
}

function StaffEditDrawer({
  staff,
  centers,
  editRoles,
  onClose,
}: {
  staff: StaffRowData | null;
  centers: { id: string; name: string }[];
  editRoles: Role[];
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const toast = useToast();

  return (
    <Drawer
      open={!!staff}
      onClose={onClose}
      kicker="Ficha de plantilla"
      title={staff?.name ?? ""}
      widthClassName="sm:w-[500px]"
    >
      {/* `key`: el formulario usa valores por defecto, así que sin remontarlo
          al cambiar de persona seguiría enseñando los datos de la anterior. */}
      <form
        key={staff?.id}
        ref={formRef}
        action={(fd) =>
          startTransition(async () => {
            const result = await updateStaffUser(fd);
            if (result.ok) {
              onClose();
              toast.success("Ficha actualizada");
            } else {
              toast.error(result.error);
            }
          })
        }
        className="flex flex-col gap-5 p-6 sm:p-7"
      >
        <input type="hidden" name="userId" value={staff?.id ?? ""} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <Field label="Nombre" className="sm:col-span-2">
            <Input name="name" required defaultValue={staff?.name ?? ""} />
          </Field>
          <Field
            label="Email"
            className="sm:col-span-2"
            hint="El email es su identidad en Apta y no se cambia desde aquí: si es otra persona, dale de baja y da de alta a la nueva."
          >
            <Input value={staff?.email ?? ""} readOnly disabled />
          </Field>
          <Field label="Rol">
            <Select name="role" defaultValue={staff?.role}>
              {editRoles.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Centro base" hint="Solo roles de centro">
            <Select name="primaryCenterId" defaultValue={staff?.centerId ?? ""}>
              <option value="">— (organización) —</option>
              {centers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <label className="flex items-start gap-2.5 text-[13px] text-text-2">
          <input
            type="checkbox"
            name="visibleInApp"
            defaultChecked={staff?.visibleInApp ?? true}
            className="mt-0.5 h-4 w-4 rounded border-brand-border accent-tz-black"
          />
          <span>
            Visible en la app del socio
            <span className="block text-xs text-faint">
              Su nombre y su foto acompañan a las sesiones que dirige.
            </span>
          </span>
        </label>
      </form>
      <DrawerFooter>
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending} onClick={() => formRef.current?.requestSubmit()}>
          {pending && <ButtonSpinner />}
          {pending ? "Guardando..." : "Guardar cambios"}
        </Button>
      </DrawerFooter>
    </Drawer>
  );
}

/** Reincorporar no es destructivo: va directa, sin confirmación de por medio. */
function RestoreStaffButton({ staff }: { staff: StaffRowData }) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await restoreStaffUser(staff.id);
          if (result.ok) toast.success(`${staff.name} vuelve a la plantilla.`);
          else toast.error(result.error);
        })
      }
    >
      {pending && <ButtonSpinner />}
      Reincorporar
    </Button>
  );
}
