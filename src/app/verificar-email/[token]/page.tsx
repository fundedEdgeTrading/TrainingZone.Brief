import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { verifyEmailToken } from "@/lib/email-verification";

/** B.2: confirma el email del director. No bloquea el login (D-2) — es solo informativo. */
export default async function VerificarEmailPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = verifyEmailToken(token);

  if (!result.ok) {
    return (
      <Wrapper
        title={result.error === "expired" ? "Enlace caducado" : "Enlace no válido"}
        body="Este enlace de confirmación ya no es válido. Puedes pedir uno nuevo desde tu panel de activación."
      />
    );
  }

  const user = await prisma.user.update({
    where: { id: result.userId },
    data: { emailVerifiedAt: new Date() },
    select: { email: true },
  }).catch(() => null);

  if (!user) {
    return <Wrapper title="No hemos podido confirmar tu email" body="La cuenta asociada a este enlace ya no existe." />;
  }

  return <Wrapper title="Email confirmado" body={`${user.email} ha quedado confirmado como tu canal de facturación.`} />;
}

function Wrapper({ title, body }: { title: string; body: string }) {
  return (
    <div className="min-h-screen bg-tz-bone flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-white border border-tz-linen rounded-card shadow-pop p-8 text-center space-y-3">
        <h1 className="font-display font-extrabold text-xl uppercase tracking-[-.01em] text-tz-black">{title}</h1>
        <p className="text-sm text-muted">{body}</p>
        <Link href="/activar" className="inline-block text-sm font-medium underline text-tz-black">
          Volver a mi panel →
        </Link>
      </div>
    </div>
  );
}
