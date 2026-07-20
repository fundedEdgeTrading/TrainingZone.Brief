import type { Role } from "@prisma/client";
import { requireRole } from "@/lib/guard";
import { canManageOrg, ROLE_LABEL } from "@/lib/rbac";
import { getOrganization, getCentersWithCounts, getStaffWithMemberships } from "@/lib/org-queries";
import {
  updateOrganization,
  createCenter,
  updateCenterLogo,
  assignUserToCenter,
} from "./actions";
import { RemoveMembershipButton } from "./controls";
import { StaffDrawer } from "./staff-drawer";
import AptaLogo from "@/components/apta-logo";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { Field, Input, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { TableShell, THead, Th, TRow, Td } from "@/components/ui/table";
import { ActionForm } from "@/components/ui/action-form";

const CARD = "bg-brand-card border border-brand-border rounded-card p-5 shadow-card";
const SECTION_TITLE = "font-display font-extrabold text-lg uppercase tracking-[-.01em] text-brand-text";

export default async function OrganizationPage() {
  const session = await requireRole(["OWNER", "PLATFORM_ADMIN", "HR_MANAGER"]);
  const canOrg = canManageOrg(session.user.role);

  const [org, centers, staff] = await Promise.all([
    getOrganization(session.user.orgId),
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
        description="Marca, estructura de la empresa (centros), alta de personal e imputación de cada persona a uno o varios centros con su rol y dedicación. El modelo ya es multi-tenant (orgId en cada tabla); aquí se gestiona el ámbito dentro de la organización (F7)."
      />

      {/* ---------- Marca de la organización ---------- */}
      {canOrg && org && (
        <section className="space-y-3">
          <h2 className={SECTION_TITLE}>Marca</h2>
          <div className={`${CARD} flex flex-col lg:flex-row lg:items-end gap-5`}>
            <div className="shrink-0">
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-brand-muted mb-1.5">
                Logo en el NavBar
              </div>
              <div className="h-14 min-w-[180px] flex items-center rounded-lg border border-brand-border bg-tz-sand px-4">
                {org.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- logo de marca por URL arbitraria
                  <img src={org.logoUrl} alt={org.name} className="h-8 w-auto max-w-[200px] object-contain" />
                ) : (
                  <span className="flex items-center gap-2 text-xs text-faint">
                    <AptaLogo variant="dark" className="text-xl" />
                    <span>(por defecto)</span>
                  </span>
                )}
              </div>
            </div>
            <ActionForm
              action={updateOrganization}
              successMessage="Marca actualizada."
              resetOnSuccess={false}
              className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3 items-end"
            >
              <Field label="Nombre de la organización">
                <Input name="name" defaultValue={org.name} required />
              </Field>
              <Field label="URL del logo" hint="Vacío = logo de Apta por defecto">
                <Input name="logoUrl" defaultValue={org.logoUrl ?? ""} placeholder="/brand/mi-logo.svg o https://..." />
              </Field>
              <Button type="submit">Guardar marca</Button>
            </ActionForm>
          </div>
        </section>
      )}

      {/* ---------- Centros ---------- */}
      <section className="space-y-3">
        <h2 className={SECTION_TITLE}>Centros</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {centers.map((c) => (
            <div key={c.id} className={CARD}>
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-tz-sand border border-brand-border flex items-center justify-center overflow-hidden shrink-0">
                  {c.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- logo de centro por URL arbitraria
                    <img src={c.logoUrl} alt={c.name} className="h-7 w-7 object-contain" />
                  ) : (
                    <span className="text-[8px] font-bold text-faint uppercase tracking-wide">hereda</span>
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-brand-text truncate">{c.name}</h3>
                  <p className="text-xs text-brand-muted truncate">{c.address ?? "Sin dirección"}</p>
                </div>
              </div>
              <p className="text-xs text-faint mt-3">
                {c._count.members} socios · {c._count.staffMemberships} personas imputadas
              </p>
              {canOrg && (
                <ActionForm
                  action={updateCenterLogo}
                  successMessage="Logo del centro actualizado."
                  resetOnSuccess={false}
                  className="mt-3 flex items-end gap-2"
                >
                  <input type="hidden" name="centerId" value={c.id} />
                  <Field label="Logo (URL)" className="flex-1">
                    <Input name="logoUrl" defaultValue={c.logoUrl ?? ""} placeholder="/brand/… (vacío = hereda)" />
                  </Field>
                  <Button type="submit" variant="secondary" size="sm">
                    Guardar
                  </Button>
                </ActionForm>
              )}
            </div>
          ))}
          {centers.length === 0 && <p className="text-sm text-muted">Todavía no hay centros.</p>}
        </div>

        {canOrg && (
          <ActionForm
            action={createCenter}
            successMessage="Centro añadido."
            className={`${CARD} grid grid-cols-1 md:grid-cols-4 gap-3 items-end`}
          >
            <Field label="Nombre del centro" className="md:col-span-2">
              <Input name="name" placeholder="p.ej. Vitalia Este" required />
            </Field>
            <Field label="Slug" hint="Opcional — se genera del nombre">
              <Input name="slug" placeholder="este" />
            </Field>
            <Field label="Logo (URL)" hint="Opcional — si no, hereda">
              <Input name="logoUrl" placeholder="/brand/…" />
            </Field>
            <Field label="Dirección" className="md:col-span-3">
              <Input name="address" placeholder="Calle, número, ciudad" />
            </Field>
            <Button type="submit">Añadir centro</Button>
          </ActionForm>
        )}
      </section>

      {/* ---------- Equipo ---------- */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className={SECTION_TITLE}>Equipo</h2>
            <p className="text-xs text-brand-muted mt-0.5">{staff.length} personas</p>
          </div>
          <StaffDrawer centers={centers} createRoles={createRoles} />
        </div>

        <div className="bg-tz-bone border border-brand-border rounded-xl px-4.5 py-3 text-[13px] text-text-2 flex gap-2.5 items-center">
          <span className="w-2 h-2 rounded-full bg-apta-gold shrink-0" />
          Solo Dirección de organización y RRHH pueden dar de alta personal y asignar roles; Dirección de centro no
          tiene acceso a esta sección.
        </div>

        <TableShell>
          <THead>
            <Th>Persona</Th>
            <Th>Rol base</Th>
            <Th>Imputación a centros</Th>
            <Th>Estado de acceso</Th>
          </THead>
          <tbody>
            {staff.map((u) => {
              const active = !u.invitation || !!u.invitation.usedAt;
              return (
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
                  <Td>
                    <Badge tone={active ? "good" : "warning"}>{active ? "Acceso activo" : "Invitación enviada"}</Badge>
                  </Td>
                </TRow>
              );
            })}
          </tbody>
        </TableShell>
      </section>

      {/* ---------- Imputación ---------- */}
      <section className="space-y-3">
        <h2 className={SECTION_TITLE}>Imputar a un centro</h2>
        <p className="text-sm text-brand-muted max-w-2xl">
          Asigna a una persona a un centro (además de su centro base) con un rol y un porcentaje de
          dedicación. Así un entrenador puede repartirse entre varios centros o una dirección
          supervisar más de uno.
        </p>
        <ActionForm
          action={assignUserToCenter}
          successMessage="Imputación guardada."
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
        </ActionForm>
      </section>
    </div>
  );
}
