import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { isMemberInScope } from "@/lib/center-scope";
import { fileAccess, isValidFileId } from "@/lib/file-store";
import { prisma } from "@/lib/prisma";
import { resolveRequestViewer } from "@/lib/request-viewer";

/**
 * Salida de las imágenes guardadas en `StoredFile` (logos, productos,
 * anuncios, fotos de perfil). Quién puede pedir cada tipo lo decide
 * `fileAccess` (src/lib/file-store.ts).
 *
 *  · Públicas (logos, productos, anuncios): sin sesión —salen en fichas
 *    públicas, en emails y en el checkout de Stripe— y con caché de un año:
 *    un fichero no cambia nunca, cambiar la imagen crea otro id.
 *  · Fotos de personas: sesión de la organización (cookie o Bearer de la app);
 *    la de un socio, solo él o el equipo con ese socio en su ámbito de centro.
 *  · Fotos de evolución: nunca por aquí (enlace firmado de `/api/progress-photos`).
 *
 * A quien no puede verla se le responde 404 y no 403: un 403 confirma que el
 * fichero existe.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isValidFileId(id)) return notFound();

  const meta = await prisma.storedFile.findUnique({
    where: { id },
    select: { id: true, orgId: true, kind: true, memberId: true, encrypted: true, sha256: true },
  });
  if (!meta) return notFound();

  let access = fileAccess(meta, null, { isOwnMember: false, memberInScope: false });
  if (access === "deny" && !meta.encrypted && meta.kind !== "PROGRESS_PHOTO") {
    const viewer = await resolveRequestViewer(req);
    if (viewer) {
      const owner = meta.memberId
        ? await prisma.member.findFirst({ where: { id: meta.memberId, orgId: viewer.orgId }, select: { userId: true } })
        : null;
      const isOwnMember = owner?.userId != null && owner.userId === viewer.id;
      const memberInScope =
        meta.kind === "MEMBER_PHOTO" && meta.memberId && !isOwnMember && viewer.role !== "MEMBER"
          ? await isMemberInScope(viewer, meta.memberId)
          : false;
      access = fileAccess(meta, viewer, { isOwnMember, memberInScope });
    }
  }
  if (access === "deny") return notFound();

  const etag = `"${meta.sha256}"`;
  const cacheControl =
    access === "public" ? "public, max-age=31536000, immutable" : "private, max-age=3600";
  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag, "Cache-Control": cacheControl } });
  }

  const file = await prisma.storedFile.findUnique({ where: { id }, select: { mime: true, data: true } });
  if (!file) return notFound();

  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.mime,
      "Content-Length": String(file.data.length),
      "Cache-Control": cacheControl,
      ETag: etag,
      "Content-Disposition": "inline",
      // `nosniff` y una CSP con `sandbox` llegan desde next.config.ts
      // (`UPLOADED_FILE_ROUTES`): contenido de usuario que, aunque se abriera
      // como documento, no ejecuta nada.
      ...(access === "private" ? { Vary: "Cookie, Authorization" } : {}),
    },
  });
}

function notFound() {
  return NextResponse.json({ error: "No encontrado." }, { status: 404 });
}
