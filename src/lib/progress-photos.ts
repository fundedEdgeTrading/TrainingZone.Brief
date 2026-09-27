import { createHash, randomUUID } from "crypto";
import { readFile, rm } from "fs/promises";
import path from "path";

import {
  ColumnCryptoError,
  decryptColumn,
  encryptColumn,
  readKey,
  signAccess,
  verifyAccess,
} from "@/lib/column-crypto";
import { sniffImageMime } from "@/lib/image-bytes";

/**
 * E10-20 · Fotos de composición corporal, cifradas.
 *
 * `members/[id]/actions.ts` y `apps/mobile/src/utils/pick-image.ts` guardaban
 * `data:image/jpeg;base64,...` en columnas de texto de Postgres. Son fotos
 * frontal, de perfil y de espalda, habitualmente en ropa interior: un volcado
 * de la base de datos —una copia de seguridad, un `pg_dump` para depurar, una
 * réplica de lectura— las entregaba legibles a quien lo abriera.
 *
 * La columna guarda una REFERENCIA (`photo:v1:<id>`) y la foto va cifrada con
 * AES-256-GCM (ADR-005) en su propia fila de `StoredFile` (kind PROGRESS_PHOTO,
 * `encrypted`). Un volcado ya no entrega nada legible sin `PROGRESS_PHOTO_KEY`,
 * que vive fuera de la base.
 *
 * Primero se guardaron en un disco de Render (`PROGRESS_PHOTO_DIR`). Eso ataba
 * la app a una sola instancia y a un disco de pago, así que ahora van a
 * Postgres; las que siguen en disco se leen y se borran igual mientras
 * `npm run files:migrate` las pasa a la base.
 *
 * Se sirve solo por `/api/progress-photos/[ref]`, con enlace firmado y caducado,
 * y ese endpoint pasa por la matriz de permisos y deja rastro en `AuditLog`.
 * `/api/files` las rechaza siempre.
 */

const REF_PREFIX = "photo:v1:";
const KEY_ENV = "PROGRESS_PHOTO_KEY";
const DIR_ENV = "PROGRESS_PHOTO_DIR";

/** Minutos que vive un enlace de foto. Corto a propósito. */
export const PHOTO_LINK_TTL_MINUTES = 10;

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Mismo tope que el resto de imágenes (`IMAGE_MAX_BYTES`): el cliente reescala antes de subir. */
const PHOTO_MAX_BYTES = 2 * 1024 * 1024;

export type StoredPhoto = { ref: string; mime: string; bytes: number };

export function isPhotoRef(value: string | null | undefined): value is string {
  return typeof value === "string" && value.startsWith(REF_PREFIX);
}

/** Lo que había antes: la foto entera dentro de la columna. */
export function isInlineDataUrl(value: string | null | undefined): value is string {
  return typeof value === "string" && value.startsWith("data:");
}

export function refId(ref: string): string {
  return ref.slice(REF_PREFIX.length);
}

/** Directorio de las fotos guardadas en disco antes de pasar a Postgres (solo lectura y borrado). */
function legacyDir(env: NodeJS.ProcessEnv = process.env): string {
  return env[DIR_ENV] || path.join(process.cwd(), ".data", "progress-photos");
}

function requireKey(env: NodeJS.ProcessEnv = process.env) {
  const key = readKey(KEY_ENV, env);
  if (!key) {
    throw new ColumnCryptoError(
      `${KEY_ENV} no está configurada: sin clave no se pueden guardar fotos de composición corporal cifradas. ` +
        "Genera una con: openssl rand -base64 32",
    );
  }
  return key;
}

/** ¿Está el almacén listo? Lo consulta la UI para no ofrecer subir una foto que fallará. */
export function isPhotoStoreConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return readKey(KEY_ENV, env) != null;
}

export type ParsedDataUrl = { mime: string; data: Buffer };

/**
 * Trocea un `data:` URL. Devuelve `null` en vez de lanzar: lo que llega es
 * entrada de usuario, y un `catch` alrededor del guardado entero no distingue
 * "la foto venía mal" de "el disco está lleno".
 */
export function parseDataUrl(value: string): ParsedDataUrl | null {
  const match = /^data:([a-z]+\/[a-z0-9.+-]+);base64,(.+)$/i.exec(value);
  if (!match) return null;
  if (!ALLOWED_MIME.has(match[1].toLowerCase())) return null;
  const data = Buffer.from(match[2], "base64");
  if (data.length === 0 || data.length > PHOTO_MAX_BYTES) return null;
  // El tipo sale de la firma de los bytes, no de lo que diga el `data:` URL.
  const mime = sniffImageMime(data);
  if (!mime) return null;
  return { mime, data };
}

/** Dueño de la foto: la fila de `StoredFile` va atada al socio y se borra con él. */
export type PhotoOwner = { orgId: string; memberId: string; createdById?: string | null };

/**
 * Dónde viven los sobres cifrados. La implementación real es Postgres
 * (`postgresPhotoStore`); los tests pasan una en memoria.
 */
export type PhotoBlobStore = {
  put(id: string, envelope: string, owner: PhotoOwner): Promise<void>;
  get(id: string): Promise<string | null>;
  delete(id: string): Promise<boolean>;
};

export type PhotoDeps = { env?: NodeJS.ProcessEnv; store?: PhotoBlobStore };

/**
 * `StoredFile` en Postgres, con las fotos que aún sigan en el disco de antes
 * como respaldo de lectura y de borrado. El import de Prisma es perezoso: este
 * módulo lo cargan tests que no tienen base de datos.
 */
export function postgresPhotoStore(env: NodeJS.ProcessEnv = process.env): PhotoBlobStore {
  return {
    async put(id, envelope, owner) {
      const { saveStoredFile } = await import("@/lib/file-store");
      await saveStoredFile({
        id,
        orgId: owner.orgId,
        memberId: owner.memberId,
        createdById: owner.createdById,
        kind: "PROGRESS_PHOTO",
        // El tipo real viaja DENTRO del sobre: la fila no cuenta qué hay en ella.
        mime: "application/octet-stream",
        encrypted: true,
        data: Buffer.from(envelope, "utf8"),
      });
    },
    async get(id) {
      const { prisma } = await import("@/lib/prisma");
      const row = await prisma.storedFile.findFirst({
        where: { id, kind: "PROGRESS_PHOTO" },
        select: { data: true },
      });
      if (row) return Buffer.from(row.data).toString("utf8");
      return readLegacyEnvelope(id, env);
    },
    async delete(id) {
      const { prisma } = await import("@/lib/prisma");
      const deleted = await prisma.storedFile.deleteMany({ where: { id, kind: "PROGRESS_PHOTO" } });
      const legacy = await deleteLegacyEnvelope(id, env);
      return deleted.count > 0 || legacy;
    },
  };
}

/** Sobre de una foto que sigue en el disco de antes, o `null`. */
export async function readLegacyEnvelope(id: string, env: NodeJS.ProcessEnv = process.env): Promise<string | null> {
  const file = legacyPath(id, env);
  if (!file) return null;
  try {
    return await readFile(file, "utf8");
  } catch {
    return null;
  }
}

async function deleteLegacyEnvelope(id: string, env: NodeJS.ProcessEnv): Promise<boolean> {
  const file = legacyPath(id, env);
  if (!file) return false;
  try {
    await rm(file);
    return true;
  } catch {
    return false;
  }
}

function storeOf(deps: PhotoDeps): PhotoBlobStore {
  return deps.store ?? postgresPhotoStore(deps.env);
}

/**
 * Cifra una foto, la guarda y devuelve la referencia que va a la columna.
 *
 * El id es un UUID y no un hash del contenido: con un hash, dos socios con la
 * misma foto compartirían objeto, y borrar el de uno se llevaría el del otro.
 */
export async function putProgressPhoto(
  dataUrl: string,
  owner: PhotoOwner,
  deps: PhotoDeps = {},
): Promise<StoredPhoto | null> {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return null;

  const key = requireKey(deps.env);
  const id = randomUUID();
  // El tipo viaja dentro del sobre cifrado, no fuera: el almacén no debe contar
  // qué hay en él ni de quién.
  const envelope = encryptColumn(Buffer.from(JSON.stringify({ mime: parsed.mime, data: parsed.data.toString("base64") })), key);
  await storeOf(deps).put(id, envelope, owner);

  return { ref: `${REF_PREFIX}${id}`, mime: parsed.mime, bytes: parsed.data.length };
}

export type LoadedPhoto = { mime: string; data: Buffer };

export async function readProgressPhoto(ref: string, deps: PhotoDeps = {}): Promise<LoadedPhoto | null> {
  if (!isPhotoRef(ref)) return null;
  const id = validPhotoId(ref);
  if (!id) return null;
  const key = requireKey(deps.env);

  const envelope = await storeOf(deps).get(id);
  if (!envelope) return null;
  const decoded = JSON.parse(decryptColumn(envelope, key).toString("utf8")) as { mime: string; data: string };
  return { mime: decoded.mime, data: Buffer.from(decoded.data, "base64") };
}

/** Borrar una entrada de progreso tiene que llevarse también la foto. */
export async function deleteProgressPhoto(ref: string | null | undefined, deps: PhotoDeps = {}): Promise<boolean> {
  if (!isPhotoRef(ref)) return false;
  const id = validPhotoId(ref);
  if (!id) return false;
  return storeOf(deps).delete(id);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** El id de la referencia, validado como UUID ANTES de tocar ningún almacén. */
function validPhotoId(ref: string): string | null {
  const id = refId(ref);
  return UUID_RE.test(id) ? id : null;
}

/**
 * Ruta del fichero antiguo. El id se valida como UUID ANTES de tocar el disco:
 * un id con `../` dentro convertiría este módulo en una lectura arbitraria de
 * ficheros, y `path.join` no protege de eso por sí solo.
 */
function legacyPath(id: string, env: NodeJS.ProcessEnv): string | null {
  if (!UUID_RE.test(id)) return null;
  return path.join(legacyDir(env), `${id}.enc`);
}

/**
 * Enlace firmado y caducado. La firma incluye el socio además del objeto: un
 * enlace no vale para pedir la foto de otro aunque se acierte con el id.
 */
export function signPhotoUrl(
  ref: string,
  memberId: string,
  now: number = Date.now(),
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const key = readKey(KEY_ENV, env);
  if (!key || !isPhotoRef(ref)) return null;
  const expiresAt = now + PHOTO_LINK_TTL_MINUTES * 60_000;
  const token = signAccess(`${refId(ref)}:${memberId}`, expiresAt, key);
  return `/api/progress-photos/${refId(ref)}?m=${encodeURIComponent(memberId)}&t=${encodeURIComponent(token)}`;
}

export function verifyPhotoToken(
  photoId: string,
  memberId: string,
  token: string,
  now: number = Date.now(),
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const key = readKey(KEY_ENV, env);
  if (!key) return false;
  return verifyAccess(`${photoId}:${memberId}`, token, key, now);
}

/** Huella para la traza: identifica el objeto sin repetir su id en el log. */
export function photoFingerprint(ref: string): string {
  return createHash("sha256").update(ref).digest("hex").slice(0, 16);
}

export type PhotoColumns = {
  photoFrontUrl: string | null;
  photoSideUrl: string | null;
  photoBackUrl: string | null;
};

/**
 * Traduce lo que hay en la columna a algo que un `<img>` pueda pintar.
 *
 * Convive lo nuevo con lo viejo a propósito: una referencia se convierte en un
 * enlace firmado y caducado; un `data:` URL heredado se devuelve tal cual, para
 * que las fichas anteriores a la migración se sigan viendo mientras el backfill
 * corre. Cuando el backfill termina, este segundo camino deja de usarse solo.
 */
export function resolveProgressPhotoUrl(
  value: string | null,
  memberId: string,
  now: number = Date.now(),
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (!value) return null;
  if (isPhotoRef(value)) return signPhotoUrl(value, memberId, now, env);
  return value;
}

/** El mismo trabajo sobre una lista de entradas de progreso. */
export function withSignedPhotoUrls<T extends PhotoColumns>(entries: T[], memberId: string, now: number = Date.now()): T[] {
  return entries.map((entry) => ({
    ...entry,
    photoFrontUrl: resolveProgressPhotoUrl(entry.photoFrontUrl, memberId, now),
    photoSideUrl: resolveProgressPhotoUrl(entry.photoSideUrl, memberId, now),
    photoBackUrl: resolveProgressPhotoUrl(entry.photoBackUrl, memberId, now),
  }));
}

/** Las referencias de una entrada, para borrar sus ficheros. */
export function photoRefsOf(entry: PhotoColumns): string[] {
  return [entry.photoFrontUrl, entry.photoSideUrl, entry.photoBackUrl].filter(isPhotoRef);
}

/** Borra las fotos de un conjunto de entradas. Devuelve cuántas borró. */
export async function deletePhotosOfEntries(entries: PhotoColumns[], deps: PhotoDeps = {}): Promise<number> {
  let deleted = 0;
  for (const entry of entries) {
    for (const ref of photoRefsOf(entry)) {
      if (await deleteProgressPhoto(ref, deps)) deleted++;
    }
  }
  return deleted;
}
