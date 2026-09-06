import { createHash, randomUUID } from "crypto";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import path from "path";

import {
  ColumnCryptoError,
  decryptColumn,
  encryptColumn,
  readKey,
  signAccess,
  verifyAccess,
} from "@/lib/column-crypto";

/**
 * E10-20 · Fotos de composición corporal fuera de la base de datos.
 *
 * `members/[id]/actions.ts:554` y `apps/mobile/src/utils/pick-image.ts:37`
 * guardaban `data:image/jpeg;base64,...` en columnas de texto de Postgres. Son
 * fotos frontal, de perfil y de espalda, habitualmente en ropa interior: un
 * volcado de la base de datos —una copia de seguridad, un `pg_dump` para
 * depurar, una réplica de lectura— las entrega legibles a quien lo abra.
 *
 * Aquí las fotos salen de la base de datos. Lo que queda en la columna es una
 * REFERENCIA (`photo:v1:<id>`), y el fichero vive fuera, cifrado con AES-256-GCM
 * (ADR-005). La columna del esquema no cambia —está congelado— pero deja de
 * contener la foto.
 *
 * Se sirve solo por `/api/progress-photos/[ref]`, con enlace firmado y caducado,
 * y ese endpoint pasa por la matriz de permisos y deja rastro en `AuditLog`.
 */

const REF_PREFIX = "photo:v1:";
const KEY_ENV = "PROGRESS_PHOTO_KEY";
const DIR_ENV = "PROGRESS_PHOTO_DIR";

/** Minutos que vive un enlace de foto. Corto a propósito. */
export const PHOTO_LINK_TTL_MINUTES = 10;

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

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

function storeDir(env: NodeJS.ProcessEnv = process.env): string {
  // Por defecto FUERA de `public/`: un directorio servido estáticamente
  // convertiría el enlace firmado en un adorno.
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
  const mime = match[1].toLowerCase();
  if (!ALLOWED_MIME.has(mime)) return null;
  const data = Buffer.from(match[2], "base64");
  if (data.length === 0) return null;
  return { mime, data };
}

/**
 * Guarda una foto y devuelve la referencia que va a la columna.
 *
 * El nombre del fichero es un UUID y no un hash del contenido: con un hash, dos
 * socios con la misma foto compartirían fichero, y borrar el de uno se llevaría
 * el del otro.
 */
export async function putProgressPhoto(
  dataUrl: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<StoredPhoto | null> {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return null;

  const key = requireKey(env);
  const id = randomUUID();
  const dir = storeDir(env);
  await mkdir(dir, { recursive: true });

  // El tipo viaja dentro del sobre cifrado, no en el nombre del fichero: el
  // directorio no debe contar qué hay en él ni de quién.
  const envelope = encryptColumn(Buffer.from(JSON.stringify({ mime: parsed.mime, data: parsed.data.toString("base64") })), key);
  await writeFile(path.join(dir, `${id}.enc`), envelope, "utf8");

  return { ref: `${REF_PREFIX}${id}`, mime: parsed.mime, bytes: parsed.data.length };
}

export type LoadedPhoto = { mime: string; data: Buffer };

export async function readProgressPhoto(
  ref: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<LoadedPhoto | null> {
  if (!isPhotoRef(ref)) return null;
  const key = requireKey(env);
  const file = photoPath(ref, env);
  if (!file) return null;

  let envelope: string;
  try {
    envelope = await readFile(file, "utf8");
  } catch {
    return null;
  }
  const decoded = JSON.parse(decryptColumn(envelope, key).toString("utf8")) as { mime: string; data: string };
  return { mime: decoded.mime, data: Buffer.from(decoded.data, "base64") };
}

/** Borrar una entrada de progreso tiene que llevarse también el fichero. */
export async function deleteProgressPhoto(
  ref: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  if (!isPhotoRef(ref)) return false;
  const file = photoPath(ref, env);
  if (!file) return false;
  await rm(file, { force: true });
  return true;
}

/**
 * Ruta del fichero. El id se valida como UUID ANTES de tocar el disco: un id
 * con `../` dentro convertiría este módulo en una lectura arbitraria de
 * ficheros, y `path.join` no protege de eso por sí solo.
 */
function photoPath(ref: string, env: NodeJS.ProcessEnv): string | null {
  const id = refId(ref);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  return path.join(storeDir(env), `${id}.enc`);
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

/** Borra los ficheros de un conjunto de entradas. Devuelve cuántos borró. */
export async function deletePhotosOfEntries(
  entries: PhotoColumns[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  let deleted = 0;
  for (const entry of entries) {
    for (const ref of photoRefsOf(entry)) {
      if (await deleteProgressPhoto(ref, env)) deleted++;
    }
  }
  return deleted;
}
