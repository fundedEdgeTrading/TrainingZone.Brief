import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { verifyAccessToken } from "@/lib/mobile-auth";
import { isCenterInScope, type ScopedUser } from "@/lib/center-scope";
import { canViewHealthData } from "@/lib/rbac";
import {
  photoFingerprint,
  readProgressPhoto,
  verifyPhotoToken,
  PHOTO_LINK_TTL_MINUTES,
} from "@/lib/progress-photos";

/**
 * E10-20 · Única salida de una foto de composición corporal.
 *
 * Cuatro puertas, en este orden, y ninguna sustituye a otra:
 *  1. Sesión válida.
 *  2. Enlace firmado y NO caducado, atado a este objeto y a este socio: copiar
 *     la URL del inspector no da un acceso permanente ni sirve para pedir otra
 *     foto.
 *  3. Matriz de permisos de salud (`canViewHealthData`) y ámbito de centro. El
 *     socio puede ver las suyas; recepción no puede ver las de nadie.
 *  4. `AuditLog`, siempre, antes de entregar los bytes.
 *
 * Devuelve 404 —no 403— a quien no tiene autorización: un 403 confirma que la
 * foto existe, que es exactamente lo que no se quiere decir.
 *
 * Atiende a la web (cookie de sesión) y a la app nativa (Bearer), porque la
 * pantalla "Mi evolución" existe en las dos. El patrón "espejo móvil" —una
 * segunda comprobación copiada— es el fallo que más se repite en este
 * repositorio: aquí hay UN camino, y lo único que cambia es de dónde sale la
 * identidad de quien pide.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ photoId: string }> }) {
  const { photoId } = await ctx.params;
  const memberId = req.nextUrl.searchParams.get("m") ?? "";
  const token = req.nextUrl.searchParams.get("t") ?? "";

  const viewer = await resolveViewer(req);
  if (!viewer) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  if (!verifyPhotoToken(photoId, memberId, token)) {
    return NextResponse.json({ error: "Enlace no válido o caducado." }, { status: 404 });
  }

  const member = await prisma.member.findFirst({
    where: { id: memberId, orgId: viewer.orgId },
    select: { id: true, userId: true, primaryCenterId: true },
  });
  if (!member) return NextResponse.json({ error: "No encontrado." }, { status: 404 });

  // El socio ve las suyas; el equipo, las de los socios de sus centros y solo
  // si su rol puede ver datos de salud.
  const isOwner = member.userId != null && member.userId === viewer.id;
  // `isCenterInScope` es asíncrona: sin el `await`, la promesa siempre es
  // verdadera y el ámbito de centro dejaría de aplicarse sin que nada avisara.
  const isAuthorizedStaff =
    canViewHealthData(viewer.role) && (await isCenterInScope(viewer, member.primaryCenterId));
  if (!isOwner && !isAuthorizedStaff) {
    return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  }

  const ref = `photo:v1:${photoId}`;
  const entry = await prisma.memberProgressEntry.findFirst({
    where: {
      memberId,
      OR: [{ photoFrontUrl: ref }, { photoSideUrl: ref }, { photoBackUrl: ref }],
    },
    select: { id: true },
  });
  if (!entry) return NextResponse.json({ error: "No encontrado." }, { status: 404 });

  // La traza se escribe ANTES de entregar los bytes: si el fichero falla al
  // leerse, sigue constando que alguien pidió esta foto.
  await prisma.auditLog.create({
    data: {
      orgId: viewer.orgId,
      actorUserId: viewer.id,
      action: "PROGRESS_PHOTO_READ",
      entityType: "MemberProgressEntry",
      entityId: entry.id,
      memberId,
      metadata: { photo: photoFingerprint(ref), viaSignedLink: true, surface: viewer.surface },
    },
  });

  const photo = await readProgressPhoto(ref);
  if (!photo) return NextResponse.json({ error: "No encontrado." }, { status: 404 });

  return new NextResponse(new Uint8Array(photo.data), {
    headers: {
      "Content-Type": photo.mime,
      "Content-Length": String(photo.data.length),
      // Privada y con la vida del enlace: una foto en ropa interior no se queda
      // en la caché de un proxy compartido.
      "Cache-Control": `private, max-age=${PHOTO_LINK_TTL_MINUTES * 60}, no-store`,
      "Content-Disposition": "inline",
    },
  });
}

/** `id/role/orgId/centerId` es exactamente el `ScopedUser` de center-scope. */
type Viewer = ScopedUser & { surface: "web" | "movil" };

/**
 * Identidad de quien pide, venga de la cookie de sesión o del Bearer de la app.
 * Es lo ÚNICO que cambia entre las dos superficies: los permisos, el ámbito de
 * centro y la traza son los mismos más abajo.
 */
async function resolveViewer(req: NextRequest): Promise<Viewer | null> {
  const bearer = req.headers.get("authorization");
  if (bearer?.startsWith("Bearer ")) {
    const claims = await verifyAccessToken(bearer.slice(7));
    if (!claims) return null;
    return {
      id: claims.sub,
      orgId: claims.orgId,
      role: claims.role,
      centerId: claims.centerId ?? null,
      surface: "movil",
    };
  }

  const session = await auth();
  if (!session?.user) return null;
  return {
    id: session.user.id,
    orgId: session.user.orgId,
    role: session.user.role,
    centerId: session.user.centerId ?? null,
    surface: "web",
  };
}
