import type { Role } from "@prisma/client";
import { requireRole } from "@/lib/guard";
import { canManageOrg, ROLE_LABEL } from "@/lib/rbac";
import { getCentersWithCounts, getStaffWithMemberships } from "@/lib/org-queries";
import { createCenter, createStaffUser, assignUserToCenter } from "./actions";
import { RemoveMembershipButton } from "./controls";
import { PageHeader } from "@/components/ui/page-header";
import { Field, Input, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { TableShell, THead, Th, TRow, Td } from "@/components/ui/table";

const CARD = "bg-brand-card border border-brand-border rounded-card p-5 shadow-card";
const SECTION_TITLE = "font-display font-extrabold text-lg uppercase tracking-[-.01em] text-brand-text";

export default async function OrganizationPage() {
  const session = await requireRole(["OWNER", "PLATFORM_ADMIN", "HR_MANAGER"]);
  const canOrg = canManageOrg(session.user.role);

  const [centers, staff] = await Promise.all([
    getCentersWithCounts(session.user.orgId),
    getStaffWithMemberships(session.user.orgId),
  ]);

  const createRoles: Role[] = [
    "TRAINER",
    "RECEPTION",
    "CENTER_DIRECTOR",
    "HR_MANAGER",
    ...((canOrg ? ["OWNER"] : []) as Role[]),
  ];
  const assignRoles: Role[] = ["TRAINER", "RECEPTION", "CENTER_DIRECTOR"];

  return (
    <div className="tz-page space-y-6">
      <PageHeader
        kicker="Organización y equipo"
        description="Estructura de la empresa (centros), alta de personal e imputación de cada persona a uno o varios centros con su rol y dedicación. El modelo ya es multi-tenant (orgId en cada tabla); aquí se gestiona el ámbito dentro de la organización (F7)."
      />

      {/* ---------- Centros ---------- */}
      <section className="space-y-3">
        <h2 className={SECTION_TITLE}>Centros</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {centers.map((c) => (
            <div key={c.id} className={CARD}>
              <h3 className="font-semibold text-brand-text">{c.name}</h3>
              <p className="text-xs text-brand-muted mt-1">{c.address ?? "Sin dirección"}</p>
              <p className="text-xs text-faint mt-3">
                {c._count.members} socios · {c._count.staffMemberships} personas imputadas
              </p>
            </div>
          ))}
          {centers.length === 0 && (
            <p className="text-sm text-muted">Todavía no hay centros.</p>
          )}
        </div>

        {canOrg && (
          <form
            action={createCenter}
            className={`${CARD} grid grid-cols-1 md:grid-cols-4 gap-3 items-end`}
          >
            <Field label="Nombre del centro" className="md:col-span-2">
              <Input name="name" placeholder="p.ej. TRAINING ZONE Este" required />
            </Field>
            <Field label="Slug" hint="Opcional — se genera del nombre">
              <Input name="slug" placeholder="este" />
            </Field>
            <Field label="Dirección" className="md:col-span-3">
              <Input name="address" placeholder="Calle, número, ciudad" />
            </Field>
            <Button type="submit">Añadir centro</Button>
          </form>
        )}
      </section>

      {/* ---------- Equipo ---------- */}
      <section className="space-y-3">
        <h2 className={SECTION_TITLE}>Equipo</h2>
        <TableShell>
          <THead>
            <Th>Persona</Th>
            <Th>Rol base</Th>
            <Th>Imputación a centros</Th>
          </THead>
          <tbody>
            {staff.map((u) => (
              <TRow key={u.id}>
                <Td>
                  <div className="font-medium text-brand-text">{u.name}</div>
                  <div className="text-xs text-faint">{u.email}</div>
                </Td>
                <Td className="text-text-2">{ROLE_LABEL[u.role]}</Td>
                <Td>
                  {u.centerMemberships.length === 0 ? (
                    <span className="text-xs text-faint">Toda la organización</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {u.centerMemberships.map((m) => (
                        <span
                          key={m.id}
                          className="inline-flex items-center gap-1.5 rounded-pill bg-tz-sand px-2.5 py-1 text-[11px] text-text-2"
                        >
                          <span className="font-semibold">{m.center.name}</span>
                          <span className="text-faint">
                            {ROLE_LABEL[m.role]}
                            {m.allocationPct != null ? ` · ${m.allocationPct}%` : ""}
                            {m.isPrimary ? " · base" : ""}
                          </span>
                          <RemoveMembershipButton id={m.id} />
                        </span>
                      ))}
                    </div>
                  )}
                </Td>
              </TRow>
            ))}
          </tbody>
        </TableShell>

        <form
          action={createStaffUser}
          className={`${CARD} grid grid-cols-1 md:grid-cols-5 gap-3 items-end`}
        >
          <Field label="Nombre" className="md:col-span-2">
            <Input name="name" placeholder="Nombre y apellidos" required />
          </Field>
          <Field label="Email">
            <Input name="email" type="email" placeholder="persona@trainingzone.es" required />
          </Field>
          <Field label="Rol">
            <Select name="role" defaultValue="TRAINER">
              {createRoles.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Centro base" hint="Solo roles de centro">
            <Select name="primaryCenterId" defaultValue="">
              <option value="">— (organización) —</option>
              {centers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" className="md:col-span-5 md:justify-self-start">
            Dar de alta persona
          </Button>
        </form>
      </section>

      {/* ---------- Imputación ---------- */}
      <section className="space-y-3">
        <h2 className={SECTION_TITLE}>Imputar a un centro</h2>
        <p className="text-sm text-brand-muted max-w-2xl">
          Asigna a una persona a un centro (además de su centro base) con un rol y un porcentaje de
          dedicación. Así un entrenador puede repartirse entre varios centros o una dirección
          supervisar más de uno.
        </p>
        <form
          action={assignUserToCenter}
          className={`${CARD} grid grid-cols-1 md:grid-cols-5 gap-3 items-end`}
        >
          <Field label="Persona" className="md:col-span-2">
            <Select name="userId" required defaultValue="">
              <option value="">Seleccionar...</option>
              {staff.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} · {ROLE_LABEL[u.role]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Centro">
            <Select name="centerId" required defaultValue="">
              <option value="">Seleccionar...</option>
              {centers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Rol en el centro">
            <Select name="role" defaultValue="TRAINER">
              {assignRoles.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Dedicación (%)" hint="Opcional">
            <Input name="allocationPct" type="number" min="0" max="100" step="5" placeholder="40" />
          </Field>
          <Button type="submit" className="md:col-span-5 md:justify-self-start">
            Imputar a centro
          </Button>
        </form>
      </section>
    </div>
  );
}
