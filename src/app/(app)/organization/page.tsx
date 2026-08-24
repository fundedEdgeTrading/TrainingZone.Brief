import type { Role } from "@prisma/client";
import { logoUrlForTheme } from "@/lib/theme";
import { requireRole } from "@/lib/guard";
import { canManageOrg, canManageStaff, canEditStaff, canDeleteStaff, ROLE_LABEL } from "@/lib/rbac";
import { getOrganization, getCentersWithCounts, getStaffWithMemberships } from "@/lib/org-queries";
import { staffScopeFilter } from "@/lib/staff-queries";
import { centerScopeFor } from "@/lib/center-scope";
import {
  updateOrganization,
  createCenter,
  updateCenterLogo,
  assignUserToCenter,
} from "./actions";
import { updateCenterCapacity } from "../aforo/actions";
import { RemoveMembershipButton } from "./controls";
import { StaffDrawer } from "./staff-drawer";
import { StaffRowActions, StaffActionsProvider } from "./staff-row-actions";
import AptaLogo from "@/components/apta-logo";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { Field, Input, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn, type DataTableRow } from "@/components/ui/data-table";
import { ActionForm } from "@/components/ui/action-form";
import { buildConnectOAuthUrl, isStripeConnectConfigured } from "@/lib/stripe-connect";
import { prisma } from "@/lib/prisma";
import { ProductsSection } from "./products-section";

const CARD = "bg-brand-card border border-brand-border rounded-card p-5 shadow-card";
const SECTION_TITLE = "font-display font-extrabold text-lg uppercase tracking-[-.01em] text-brand-text";


/**
 * Vista previa del logo respetando el tema: el asset negro sobre la superficie
 * oscura no se veía (mismo criterio que el `BrandLogo` del sidebar).
 */
function ThemedLogo({ url, alt, className }: { url: string; alt: string; className: string }) {
  const dark = logoUrlForTheme(url, "dark");
  /* eslint-disable @next/next/no-img-element -- logo por URL arbitraria, no un asset estático */
  if (!dark || dark === url) return <img src={url} alt={alt} className={className} />;
  return (
    <>
      <img src={url} alt={alt} className={`tz-logo-light ${className}`} />
      <img src={dark} alt="" aria-hidden="true" className={`tz-logo-dark ${className}`} />
    </>
  );
  /* eslint-enable @next/next/no-img-element */
}

export default async function OrganizationPage({
  searchParams,
}: {
  searchParams: Promise<{ stripe_connect?: string }>;
}) {
  // Dirección de centro entra solo por la plantilla de sus centros: el resto de
  // la pantalla (marca, cobros, productos, centros, alta e imputación) sigue
  // siendo de organización y RRHH, y se gatea sección a sección más abajo.
  const session = await requireRole(["OWNER", "PLATFORM_ADMIN", "HR_MANAGER", "CENTER_DIRECTOR"]);
  const canOrg = canManageOrg(session.user.role);
  const canStaffAdmin = canManageStaff(session.user.role);
  const canEdit = canEditStaff(session.user.role);
  const canDelete = canDeleteStaff(session.user.role);
  const params = await searchParams;

  const [org, allCenters, staff, plans, centerScope] = await Promise.all([
    getOrganization(session.user.orgId),
    getCentersWithCounts(session.user.orgId),
    // `includeInactive`: la plantilla es el único sitio donde una baja se
    // sigue viendo — marcada y con la opción de reincorporarla.
    getStaffWithMemberships(session.user.orgId, {
      includeInactive: true,
      scope: await staffScopeFilter(session.user),
    }),
    canOrg
      ? prisma.membershipPlan.findMany({
          where: { orgId: session.user.orgId },
          orderBy: [{ active: "desc" }, { name: "asc" }],
        })
      : Promise.resolve([]),
    centerScopeFor(session.user),
  ]);

  // Los selectores de centro no ofrecen más de lo que quien mira gestiona.
  const centers = canStaffAdmin || centerScope === null ? allCenters : allCenters.filter((c) => centerScope.includes(c.id));

  const createRoles: Role[] = [
    "TRAINER",
    "TRAINER_ADMIN",
    "RECEPTION",
    "CENTER_DIRECTOR",
    "HR_MANAGER",
    ...((canOrg ? ["OWNER"] : []) as Role[]),
  ];
  // Dirección de centro edita a los suyos, y los suyos son de centro: no puede
  // convertir a nadie en dirección de organización, RRHH ni soporte.
  const editRoles: Role[] = canStaffAdmin ? createRoles : ["TRAINER", "TRAINER_ADMIN", "RECEPTION", "CENTER_DIRECTOR"];
  const assignRoles: Role[] = ["TRAINER", "TRAINER_ADMIN", "RECEPTION", "CENTER_DIRECTOR"];

  const inactiveStaff = staff.filter((u) => u.deactivatedAt).length;
  const activeStaff = staff.length - inactiveStaff;

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
                  <ThemedLogo url={org.logoUrl} alt={org.name} className="h-8 w-auto max-w-[200px] object-contain" />
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

      {/* ---------- Cobros a socios (Parte C: Stripe Connect) ---------- */}
      {canOrg && org && (
        <section className="space-y-3">
          <h2 className={SECTION_TITLE}>Cobros a socios</h2>
          <div className={CARD}>
            {params.stripe_connect === "success" && (
              <p className="text-sm text-good bg-good-bg rounded-control px-3 py-2 mb-3">Cuenta de Stripe conectada correctamente.</p>
            )}
            {params.stripe_connect === "error" && (
              <p className="text-sm text-critical bg-critical-bg rounded-control px-3 py-2 mb-3">
                No se pudo conectar la cuenta de Stripe. Inténtalo de nuevo.
              </p>
            )}
            {org.stripeAccount?.chargesEnabled ? (
              <div className="flex items-center gap-2">
                <Badge tone="good">Conectado</Badge>
                <p className="text-sm text-brand-muted">
                  Tu gimnasio ya puede cobrar a sus socios online. {org.stripeAccount.payoutsEnabled ? "Los pagos se transfieren a tu cuenta bancaria." : "Los payouts todavía están pendientes de verificación en Stripe."}
                </p>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                <p className="text-sm text-brand-muted max-w-lg">
                  Conecta tu propia cuenta de Stripe para cobrar a tus socios. Apta nunca guarda una clave secreta tuya
                  — solo el identificador de tu cuenta conectada, vía OAuth de un botón.
                </p>
                {isStripeConnectConfigured() ? (
                  <a href={buildConnectOAuthUrl(session.user.orgId)}>
                    <Button variant="secondary">Conectar cobros con Stripe →</Button>
                  </a>
                ) : (
                  <Badge tone="warning">En espera de credenciales</Badge>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ---------- Productos (lo que el gimnasio vende) ---------- */}
      {canOrg && <ProductsSection plans={plans} />}

      {/* ---------- Centros ---------- */}
      <section className="space-y-3">
        <h2 className={SECTION_TITLE}>Centros</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {centers.map((c) => (
            <div key={c.id} className={CARD}>
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-tz-sand border border-brand-border flex items-center justify-center overflow-hidden shrink-0">
                  {c.logoUrl ? (
                    <ThemedLogo url={c.logoUrl} alt={c.name} className="h-7 w-7 object-contain" />
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
              {canOrg && (
                <ActionForm
                  action={updateCenterCapacity}
                  successMessage="Aforo por defecto actualizado."
                  resetOnSuccess={false}
                  className="mt-3 flex items-end gap-2"
                >
                  <input type="hidden" name="centerId" value={c.id} />
                  <Field label="Aforo por defecto" className="flex-1" hint="Solo afecta a las sesiones nuevas">
                    <Input
                      name="defaultGroupCapacity"
                      type="number"
                      min="1"
                      step="1"
                      defaultValue={c.defaultGroupCapacity ?? ""}
                      placeholder="p.ej. 8 (vacío = sin valor fijo)"
                    />
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
              <Input name="name" placeholder="p.ej. TRAINING ZONE Delicias" required />
            </Field>
            <Field label="Slug" hint="Opcional — se genera del nombre">
              <Input name="slug" placeholder="delicias" />
            </Field>
            <Field label="Logo (URL)" hint="Opcional — si no, hereda">
              <Input name="logoUrl" placeholder="/brand/…" />
            </Field>
            <Field label="Dirección" className="md:col-span-2">
              <Input name="address" placeholder="Calle, número, ciudad" />
            </Field>
            {/* Sin coordenadas el centro no se puede situar en el mapa de
                barrios (marcador, anillo de 15 min y distancia por barrio). */}
            <Field label="Latitud" hint="Opcional — para el mapa de barrios">
              <Input name="lat" placeholder="41.6685" inputMode="decimal" />
            </Field>
            <Field label="Longitud" hint="Opcional — para el mapa de barrios">
              <Input name="lng" placeholder="-0.8815" inputMode="decimal" />
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
            <p className="text-xs text-brand-muted mt-0.5">
              {activeStaff} en plantilla
              {inactiveStaff > 0 && ` · ${inactiveStaff} de baja`}
            </p>
          </div>
          {canStaffAdmin && <StaffDrawer centers={centers} createRoles={createRoles} />}
        </div>

        <div className="bg-tz-bone border border-brand-border rounded-xl px-4.5 py-3 text-[13px] text-text-2 flex gap-2.5 items-center">
          <span className="w-2 h-2 rounded-full bg-apta-gold shrink-0" />
          {canStaffAdmin
            ? "Dirección de organización y RRHH dan de alta personal y lo imputan a centros. La baja de un trabajador es de dirección (de la organización o del centro)."
            : "Ves y gestionas a las personas imputadas a tus centros. El alta de personal y la imputación a centros son de Dirección de organización y RRHH."}
        </div>

        <StaffActionsProvider centers={centers} editRoles={editRoles}>
          <DataTable
            columns={staffColumns(canEdit || canDelete)}
            rows={staff.map((u) => staffToRow(u, { canEdit, canDelete, canAssign: canStaffAdmin }))}
          />
        </StaffActionsProvider>
      </section>

      {/* ---------- Imputación ---------- */}
      {canStaffAdmin && (
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
                {staff
                  .filter((u) => !u.deactivatedAt)
                  .map((u) => (
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
      )}
    </div>
  );
}

type Staff = Awaited<ReturnType<typeof getStaffWithMemberships>>[number];

function staffColumns(withActions: boolean): DataTableColumn[] {
  return [
    { key: "person", header: "Persona", sortable: true },
    { key: "role", header: "Rol base", sortable: true, className: "text-text-2" },
    { key: "centers", header: "Imputación a centros" },
    { key: "access", header: "Acceso", sortable: true },
    ...(withActions ? [{ key: "actions", header: "", align: "right" as const }] : []),
  ];
}

function staffToRow(
  u: Staff,
  options: { canEdit: boolean; canDelete: boolean; canAssign: boolean }
): DataTableRow {
  const deactivated = !!u.deactivatedAt;
  const active = !u.invitation || !!u.invitation.usedAt;
  return {
    key: u.id,
    // Una baja no es "otra persona más": se atenúa la fila entera para que se
    // distinga de un vistazo de quien sí está en plantilla.
    className: deactivated ? "opacity-60" : undefined,
    sortValues: {
      person: u.name,
      role: ROLE_LABEL[u.role],
      access: deactivated ? -1 : active ? 1 : 0,
    },
    cells: {
      person: (
        <>
          <div className="font-medium text-brand-text">{u.name}</div>
          <div className="text-xs text-faint">{u.email}</div>
        </>
      ),
      role: ROLE_LABEL[u.role],
      centers:
        u.centerMemberships.length === 0 ? (
          <span className="text-xs text-faint">{deactivated ? "Sin imputación" : "Toda la organización"}</span>
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
                {options.canAssign && <RemoveMembershipButton id={m.id} />}
              </span>
            ))}
          </div>
        ),
      // Rótulos cortos: la columna de acciones se sale de la tarjeta si esta
      // ocupa lo que ocupaba ("Acceso activo" / "Invitación enviada").
      access: deactivated ? (
        <Badge tone="critical">
          Baja · {u.deactivatedAt!.toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
        </Badge>
      ) : (
        <Badge tone={active ? "good" : "warning"}>{active ? "Activo" : "Invitación"}</Badge>
      ),
      actions: (
        <StaffRowActions
          staff={{
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role,
            centerId: u.centerId,
            visibleInApp: u.visibleInApp,
            deactivated,
          }}
          canEdit={options.canEdit}
          canDelete={options.canDelete}
        />
      ),
    },
  };
}
