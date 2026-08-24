import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function requireSession() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // La sesión es un JWT: una baja de plantilla (RB-RRHH-014) no lo invalida, y
  // hasta que caducase su cookie seguía sirviendo para entrar en la app y para
  // llamar a cualquier server action —que es donde de verdad se opera, con o
  // sin pantalla que la pinte—. Por eso la comprobación va aquí, en la puerta
  // por la que pasan todas, y no en el layout. Es una lectura por clave
  // primaria: el resto de la petición hace ya varias.
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { deactivatedAt: true },
  });
  // `!user` cubre la otra forma de la baja: la que sí borra la fila.
  if (!user || user.deactivatedAt) redirect("/login?baja=1");

  return session;
}
