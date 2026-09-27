import { createHash } from "crypto";

import type { Role, StoredFileKind } from "@prisma/client";

import { sniffImageMime, type ImageMime } from "@/lib/image-bytes";
import { prisma } from "@/lib/prisma";

/**
 * Imágenes subidas, guardadas en Postgres (modelo `StoredFile`).
 *
 * Hasta aquí cada pantalla hacía lo suyo: los productos, los anuncios y las
 * fotos de perfil guardaban un `data:image/...;base64` DENTRO de su columna de
 * texto —cada listado que leía la fila arrastraba megas—, los logos solo
 * admitían una URL pegada a mano y las fotos de evolución vivían en un disco de
 * Render ligado a una sola instancia.
 *
 * Ahora la columna guarda `/api/files/<id>` y los bytes van a su propia tabla:
 *  · Sin coste ni proveedor nuevo: es la base de datos que ya se paga, y entra
 *    en sus copias de seguridad.
 *  · Vale con varias instancias, cosa que el disco no.
 *  · Un fichero no se reescribe nunca: cambiar la imagen crea otra fila. Por eso
 *    `/api/files/<id>` se puede cachear para siempre.
 *
 * El formulario sigue mandando un `data:` URL (así viajaba ya en web y app);
 * lo que cambia es que el servidor lo convierte en fichero antes de escribir la
 * fila. `resolveImageInput` es ese paso, y es el único que usan todos los
 * puntos de subida.
 */

export const FILE_URL_PREFIX = "/api/files/";

/** Tope de la imagen ya decodificada. El cliente reescala antes de subir. */
export const IMAGE_MAX_BYTES = 2 * 1024 * 1024;

/** Se sirven sin sesión: salen en páginas públicas, emails y el checkout de Stripe. */
export const PUBLIC_KINDS: ReadonlySet<StoredFileKind> = new Set([
  "ORG_LOGO",
  "CENTER_LOGO",
  "PRODUCT_IMAGE",
  "ANNOUNCEMENT_IMAGE",
]);

/**
 * Admiten además una URL externa (`https://…`) o una ruta del propio
 * despliegue (`/brand/…`), como hasta ahora. Las fotos de personas, no: solo
 * se suben.
 */
const EXTERNAL_URL_KINDS: ReadonlySet<StoredFileKind> = PUBLIC_KINDS;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ParsedImage = { mime: ImageMime; data: Buffer };

/**
 * Trocea y valida un `data:` URL de imagen. `null` si no es una imagen
 * admitida o pasa del tope: es entrada de usuario, y quien llama necesita
 * distinguir "la imagen venía mal" de un fallo de la base de datos.
 */
export function parseImageDataUrl(value: string, maxBytes: number = IMAGE_MAX_BYTES): ParsedImage | null {
  const match = /^data:image\/[a-z0-9.+-]+;base64,([a-z0-9+/=\s]+)$/i.exec(value);
  if (!match) return null;
  const data = Buffer.from(match[1], "base64");
  if (data.length === 0 || data.length > maxBytes) return null;
  const mime = sniffImageMime(data);
  if (!mime) return null;
  return { mime, data };
}

export function storedFileUrl(id: string): string {
  return `${FILE_URL_PREFIX}${id}`;
}

export function isStoredFileUrl(value: string | null | undefined): value is string {
  return typeof value === "string" && storedFileIdFromUrl(value) !== null;
}

/** El id de `/api/files/<id>`, validado como UUID; `null` si no lo es. */
export function storedFileIdFromUrl(value: string): string | null {
  if (!value.startsWith(FILE_URL_PREFIX)) return null;
  const id = value.slice(FILE_URL_PREFIX.length);
  return UUID_RE.test(id) ? id : null;
}

export function isValidFileId(id: string): boolean {
  return UUID_RE.test(id);
}

/** `https://…` o una ruta del propio despliegue. `//host` es otro host, no una ruta. */
export function isExternalImageUrl(value: string): boolean {
  if (/^https?:\/\/[^\s]+$/i.test(value)) return true;
  return value.startsWith("/") && !value.startsWith("//") && !value.startsWith(FILE_URL_PREFIX);
}

export function sha256(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

type Db = Pick<typeof prisma, "storedFile">;

export type SaveFileInput = {
  orgId: string;
  kind: StoredFileKind;
  mime: string;
  data: Buffer;
  memberId?: string | null;
  createdById?: string | null;
  encrypted?: boolean;
  /** Id fijado por quien llama (fotos de evolución: la referencia ya lo lleva). */
  id?: string;
};

export async function saveStoredFile(input: SaveFileInput, db: Db = prisma): Promise<string> {
  const created = await db.storedFile.create({
    data: {
      ...(input.id ? { id: input.id } : {}),
      orgId: input.orgId,
      kind: input.kind,
      memberId: input.memberId ?? null,
      mime: input.mime,
      size: input.data.length,
      sha256: sha256(input.data),
      encrypted: input.encrypted ?? false,
      data: new Uint8Array(input.data),
      createdById: input.createdById ?? null,
    },
    select: { id: true },
  });
  return created.id;
}

export type ImageInputContext = {
  orgId: string;
  kind: StoredFileKind;
  /** Lo que la columna tiene hoy. Si llega igual, no se toca nada. */
  previous?: string | null;
  memberId?: string | null;
  createdById?: string | null;
};

export type ImageInputResult = { ok: true; value: string | null } | { ok: false; error: string };

export const INVALID_IMAGE_ERROR = "La imagen no es válida: sube un JPEG, PNG o WebP de hasta 2 MB.";

/**
 * Lo que llega de un formulario → lo que se escribe en la columna.
 *
 *  · vacío → `null` (quitar la imagen).
 *  · igual a lo que ya hay → se conserva. El formulario reenvía la imagen
 *    actual cuando no se ha tocado.
 *  · `data:` URL → se valida, se guarda en `StoredFile` y vuelve su URL.
 *  · `/api/files/<id>` distinto del actual → solo si es de esta organización y
 *    del mismo tipo: nadie se apropia de la imagen de otro centro adivinando un id.
 *  · URL externa → solo en logos, productos y anuncios, como hasta ahora.
 *
 * No borra la imagen anterior: eso va DESPUÉS de escribir la fila
 * (`discardReplacedImage`), para no dejarla apuntando a nada si la escritura falla.
 */
export async function resolveImageInput(
  /** Un campo de FormData o de un cuerpo JSON: cualquier cosa que no sea texto cuenta como vacío. */
  raw: unknown,
  ctx: ImageInputContext,
  db: Db = prisma,
): Promise<ImageInputResult> {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return { ok: true, value: null };
  if (ctx.previous && value === ctx.previous) return { ok: true, value };

  if (value.startsWith("data:")) {
    const parsed = parseImageDataUrl(value);
    if (!parsed) return { ok: false, error: INVALID_IMAGE_ERROR };
    const id = await saveStoredFile(
      {
        orgId: ctx.orgId,
        kind: ctx.kind,
        mime: parsed.mime,
        data: parsed.data,
        memberId: ctx.memberId,
        createdById: ctx.createdById,
      },
      db,
    );
    return { ok: true, value: storedFileUrl(id) };
  }

  const fileId = storedFileIdFromUrl(value);
  if (fileId) {
    const existing = await db.storedFile.findFirst({
      where: { id: fileId, orgId: ctx.orgId, kind: ctx.kind },
      select: { id: true },
    });
    return existing ? { ok: true, value } : { ok: false, error: "Esa imagen no existe." };
  }

  if (EXTERNAL_URL_KINDS.has(ctx.kind) && isExternalImageUrl(value)) return { ok: true, value };
  return { ok: false, error: INVALID_IMAGE_ERROR };
}

/**
 * Tras escribir la fila: si la imagen anterior era un fichero nuestro y ya no
 * es la que queda, se borra. Acotado por organización aunque el valor salga de
 * nuestra propia fila: un borrado nunca cruza de tenant.
 */
export async function discardReplacedImage(
  previous: string | null | undefined,
  next: string | null | undefined,
  orgId: string,
  db: Db = prisma,
): Promise<void> {
  if (!previous || previous === next) return;
  await deleteStoredImage(previous, orgId, db);
}

export async function deleteStoredImage(url: string | null | undefined, orgId: string, db: Db = prisma): Promise<boolean> {
  if (!url) return false;
  const id = storedFileIdFromUrl(url);
  if (!id) return false;
  const deleted = await db.storedFile.deleteMany({ where: { id, orgId } });
  return deleted.count > 0;
}

// ---------- Lectura ----------

export type FileViewer = { id: string; role: Role; orgId: string; centerId: string | null };

export type StoredFileMeta = {
  id: string;
  orgId: string;
  kind: StoredFileKind;
  memberId: string | null;
  encrypted: boolean;
};

export type FileAccess = "public" | "private" | "deny";

/**
 * ¿Puede `viewer` pedir este fichero por `/api/files`? Pura, para poder
 * probarla sin base de datos; la comprobación de ámbito de centro de las fotos
 * de socio la hace la ruta (`memberInScope`), que es asíncrona.
 *
 * PROGRESS_PHOTO y todo lo cifrado se niega SIEMPRE aquí: su única salida es
 * `/api/progress-photos`, con enlace firmado, matriz de salud y AuditLog.
 */
export function fileAccess(
  file: StoredFileMeta,
  viewer: FileViewer | null,
  ctx: { isOwnMember: boolean; memberInScope: boolean },
): FileAccess {
  if (file.encrypted || file.kind === "PROGRESS_PHOTO") return "deny";
  if (PUBLIC_KINDS.has(file.kind)) return "public";
  if (!viewer || viewer.orgId !== file.orgId) return "deny";

  if (file.kind === "STAFF_PHOTO") return "private";
  if (file.kind === "MEMBER_PHOTO") {
    if (ctx.isOwnMember) return "private";
    // Un socio no ve la foto de otro socio; el equipo, la de los socios de su ámbito.
    if (viewer.role === "MEMBER") return "deny";
    return ctx.memberInScope ? "private" : "deny";
  }
  return "deny";
}
