import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isPlatformOperational } from "@/lib/entitlements";
import { listPurchasablePlans } from "@/lib/platform-plans";
import { PlanCheckoutButton, ResendVerificationButton, ResendActivationButton } from "./checkout-buttons";

// El estado depende del webhook, que puede llegar después que el comprador.
export const dynamic = "force-dynamic";

const STATUS_COPY: Record<string, { title: string; body: string }> = {
  PENDING_PAYMENT: {
    title: "Activa tu plataforma",
    body: "Tu organización está creada. Falta elegir un plan para empezar a usar Apta.",
  },
  PAST_DUE: {
    title: "Hay un problema con tu último cobro",
    body: "No hemos podido procesar tu último pago. Actualiza tu método de pago para no perder el acceso.",
  },
  SUSPENDED: {
    title: "Tu plataforma está suspendida",
    body: "El impago es persistente y el acceso ha quedado en solo lectura. Reactiva el pago para volver a operar con normalidad.",
  },
  CANCELLED: {
    title: "Tu suscripción está cancelada",
    body: "Puedes reactivarla cuando quieras eligiendo un plan.",
  },
};

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-tz-bone flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg bg-white border border-tz-linen rounded-card shadow-pop p-8 space-y-6">
        {children}
      </div>
    </div>
  );
}

export default async function ActivarPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; session_id?: string }>;
}) {
  const params = await searchParams;
  const session = await auth();

  // ---- Vuelta de Stripe, todavía sin cuenta ----
  // RB-ALTA-002: el comprador nunca se queda ante un "revisa tu correo" sin
  // salida. Se le dice a qué email ha ido y puede reenviarlo desde aquí.
  if (params.session_id && !session?.user) {
    const org = await prisma.organization.findUnique({
      where: { provisioningSessionId: params.session_id },
      select: { name: true, billingEmail: true },
    });

    return (
      <Card>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-brand-muted mb-1.5">Pago recibido</p>
          <h1 className="font-display font-extrabold text-2xl uppercase tracking-[-.01em] text-tz-black">
            {org ? "Tu plataforma está lista" : "Estamos confirmando tu pago"}
          </h1>
          <p className="text-sm text-muted mt-2">
            {org ? (
              <>
                Te hemos enviado un enlace a <b>{org.billingEmail}</b> para que elijas tu contraseña y
                empieces a configurar {org.name}.
              </>
            ) : (
              <>
                Tu pago se ha completado y estamos terminando de crear tu plataforma. Puede tardar unos
                segundos: recarga esta página o pide el enlace de nuevo.
              </>
            )}
          </p>
        </div>
        <ResendActivationButton sessionId={params.session_id} />
        <p className="text-xs text-faint">
          Si el correo no aparece, revisa la carpeta de spam antes de volver a pedirlo.
        </p>
      </Card>
    );
  }

  if (!session?.user) redirect("/login");
  if (session.user.role === "PLATFORM_ADMIN") redirect("/dashboard");

  const [org, user] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: session.user.orgId },
      select: { name: true, platformStatus: true },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { identity: { select: { emailVerifiedAt: true } } },
    }),
  ]);

  if (!org) redirect("/login");
  if (isPlatformOperational(org.platformStatus)) redirect("/puesta-en-marcha");
  if (session.user.role === "MEMBER") redirect("/servicio-no-disponible");

  const copy = STATUS_COPY[org.platformStatus] ?? STATUS_COPY.PENDING_PAYMENT;
  const isOwner = session.user.role === "OWNER";
  const plans = listPurchasablePlans();

  return (
    <Card>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-brand-muted mb-1.5">{org.name}</p>
        <h1 className="font-display font-extrabold text-2xl uppercase tracking-[-.01em] text-tz-black">{copy.title}</h1>
        <p className="text-sm text-muted mt-2">{copy.body}</p>
      </div>

      {params.checkout === "cancelled" && (
        <p className="text-sm text-critical bg-critical-bg rounded-control px-3 py-2">
          Checkout cancelado. Puedes volver a intentarlo cuando quieras.
        </p>
      )}

      {isOwner ? (
        plans.length > 0 ? (
          <div className="space-y-3">
            {plans.map((plan) => (
              <div
                key={plan.code}
                className="border border-brand-border rounded-control p-4 flex items-center justify-between gap-4"
              >
                <div>
                  <p className="font-semibold text-tz-black">{plan.name}</p>
                  <p className="text-xs text-muted">{plan.priceLabel}</p>
                </div>
                <PlanCheckoutButton plan={plan} />
              </div>
            ))}
            <Link href="/planes" className="block text-xs text-muted underline">
              Ver la comparativa de planes →
            </Link>
          </div>
        ) : (
          <p className="text-sm text-brand-muted bg-tz-sand border border-brand-border rounded-control p-4">
            Todavía no hay planes de precio configurados en este entorno. Contacta con Apta para activar tu cuenta.
          </p>
        )
      ) : (
        <p className="text-sm text-brand-muted bg-tz-sand border border-brand-border rounded-control p-4">
          Solo la dirección de la organización puede activar el pago. Pide a tu director/a que complete este paso.
        </p>
      )}

      {isOwner && !user?.identity.emailVerifiedAt && (
        <div className="border-t border-tz-linen pt-4">
          <p className="text-sm text-muted mb-1">Tu email de facturación aún no está confirmado.</p>
          <ResendVerificationButton />
        </div>
      )}
    </Card>
  );
}
