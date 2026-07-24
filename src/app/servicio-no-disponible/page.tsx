import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

// A.3: caso real de socios bloqueados por impago del gimnasio (D-6, SUSPENDED).
// PENDING_PAYMENT no llega aquí en la práctica: una org sin pagar aún no tiene socios.
export default async function ServicioNoDisponiblePage() {
  const session = await requireSession();

  const org = await prisma.organization.findUnique({
    where: { id: session.user.orgId },
    select: { name: true, platformStatus: true },
  });
  if (org && (org.platformStatus === "ACTIVE" || org.platformStatus === "TRIALING")) {
    redirect("/portal");
  }

  return (
    <div className="min-h-screen bg-tz-bone flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-white border border-tz-linen rounded-card shadow-pop p-8 text-center space-y-3">
        <h1 className="font-display font-extrabold text-xl uppercase tracking-[-.01em] text-tz-black">
          Servicio no disponible temporalmente
        </h1>
        <p className="text-sm text-muted">
          {org?.name ?? "Tu gimnasio"} tiene una incidencia con la plataforma. Contacta con tu centro para más información.
        </p>
      </div>
    </div>
  );
}
