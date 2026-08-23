import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { prisma } from "@/lib/prisma";
import { ROLE_LABEL } from "@/lib/rbac";
import { requireSession } from "@/lib/session";
import { ThemeCard } from "../_perfil/theme-card";

/**
 * Perfil del personal. El socio ya tenía el suyo en `/portal/perfil`; el resto
 * de roles no tenía ninguno, y la tarjeta "Apariencia" necesita un sitio donde
 * vivir para ellos (handoff "Modo oscuro" §5). De momento solo contiene esa
 * tarjeta más los datos de la cuenta en lectura: nombre, email y rol se
 * gestionan desde dirección, no en autoservicio.
 */
export default async function StaffProfilePage() {
  const session = await requireSession();
  if (session.user.role === "MEMBER") redirect("/portal/perfil");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      email: true,
      role: true,
      theme: true,
      organization: { select: { name: true } },
      center: { select: { name: true } },
    },
  });
  if (!user) redirect("/login");

  return (
    <div className="max-w-[720px] mx-auto flex flex-col gap-4">
      <PageHeader description="Cómo ves la aplicación y los datos con los que entras. Tu nombre, tu email y tu rol los gestiona dirección." />

      <ThemeCard theme={user.theme} />

      <div className="rounded-2xl p-[22px] bg-brand-card border border-brand-border tz-fade-up">
        <h3 className="font-display font-extrabold text-base uppercase tracking-[.01em] text-brand-text mb-5">
          Tu cuenta
        </h3>
        <dl className="flex flex-col">
          <AccountRow label="Nombre" value={user.name} />
          <AccountRow label="Email" value={user.email} />
          <AccountRow label="Rol" value={ROLE_LABEL[user.role]} />
          <AccountRow label="Organización" value={user.organization.name} />
          <AccountRow label="Centro" value={user.center?.name ?? "Toda la organización"} />
        </dl>
      </div>
    </div>
  );
}

function AccountRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 py-3 border-t border-tz-sand first:border-0 first:pt-0">
      <dt className="text-[11px] font-bold uppercase tracking-[.08em] text-brand-muted">{label}</dt>
      <dd className="text-sm text-brand-text">{value}</dd>
    </div>
  );
}
