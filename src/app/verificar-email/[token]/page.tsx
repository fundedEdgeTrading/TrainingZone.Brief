import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { verifyEmailToken } from "@/lib/email-verification";
import { tokenPageMetadata } from "@/lib/seo";

// Sin generateStaticParams, Next.js podría cachear indefinidamente la
// primera respuesta que reciba cada token. Esta página es sensible al
// tiempo (el token expira) y muta estado, así que debe renderizarse
// siempre en el momento de la petición.
export const dynamic = "force-dynamic";

/**
 * E9-02 · El token viaja en la URL: `noindex`, `nofollow`, `nocache` y
 * `referrer: no-referrer` — sin esto, un enlace de este correo indexado es
 * acceso sin contraseña, y la cabecera `Referer` filtra el token a cualquier
 * tercero que la página cargue.
 */
export const metadata: Metadata = tokenPageMetadata("Confirmar email");

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

  const identity = await prisma.identity.update({
    where: { id: result.identityId },
    data: { emailVerifiedAt: new Date() },
    select: { email: true },
  }).catch(() => null);

  if (!identity) {
    return <Wrapper title="No hemos podido confirmar tu email" body="La cuenta asociada a este enlace ya no existe." />;
  }

  return <Wrapper title="Email confirmado" body={`${identity.email} ha quedado confirmado como tu canal de facturación.`} />;
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
