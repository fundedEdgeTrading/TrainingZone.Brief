import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual, createHmac } from "crypto";

/**
 * ADR-005 · Cifrado a nivel de columna (E10-20).
 *
 * El esquema ya reconoce que el esquema `health.*` cifrado está pendiente. Esta
 * es la primitiva: AES-256-GCM, con la etiqueta de autenticación dentro del
 * propio valor, de modo que un texto manipulado falla al descifrar en vez de
 * devolver basura silenciosamente.
 *
 * Formato del valor cifrado, todo en una cadena para que quepa en la misma
 * columna `String` que hoy guarda el texto en claro:
 *
 *     enc:v1:<iv base64url>:<tag base64url>:<ciphertext base64url>
 *
 * El prefijo con versión es lo que permite rotar el algoritmo o la clave sin
 * tener que adivinar qué hay en cada fila: convive lo antiguo con lo nuevo, y
 * `isEncrypted` distingue una cosa de otra.
 */

const PREFIX = "enc";
const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;

export class ColumnCryptoError extends Error {}

/**
 * Clave de 32 bytes en base64. Se lee de entorno y NUNCA se cachea en un módulo
 * global: en un despliegue con rotación, un valor cacheado seguiría cifrando
 * con la clave vieja hasta el siguiente reinicio.
 */
export function readKey(name: string, env: NodeJS.ProcessEnv = process.env): Buffer | null {
  const raw = env[name];
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_BYTES) {
    throw new ColumnCryptoError(
      `${name} tiene ${key.length} bytes; se esperan ${KEY_BYTES} (32 bytes en base64). ` +
        `Genera una con: openssl rand -base64 32`,
    );
  }
  return key;
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(`${PREFIX}:${VERSION}:`);
}

export function encryptColumn(plain: Buffer | string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const input = typeof plain === "string" ? Buffer.from(plain, "utf8") : plain;
  const ciphertext = Buffer.concat([cipher.update(input), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, VERSION, b64(iv), b64(tag), b64(ciphertext)].join(":");
}

export function decryptColumn(value: string, key: Buffer): Buffer {
  const parts = value.split(":");
  if (parts.length !== 5 || parts[0] !== PREFIX || parts[1] !== VERSION) {
    throw new ColumnCryptoError("El valor no tiene el formato de una columna cifrada.");
  }
  const [, , ivPart, tagPart, dataPart] = parts;
  const decipher = createDecipheriv(ALGORITHM, key, unb64(ivPart));
  decipher.setAuthTag(unb64(tagPart));
  try {
    return Buffer.concat([decipher.update(unb64(dataPart)), decipher.final()]);
  } catch {
    // GCM detecta la manipulación: se dice que el valor no es auténtico, no que
    // "hubo un error", que invita a reintentar con otra clave hasta que cuele.
    throw new ColumnCryptoError("El valor cifrado no es auténtico: clave incorrecta o contenido manipulado.");
  }
}

/**
 * Firma de acceso caducada. Se usa para las URLs de foto: el enlace vale unos
 * minutos y para un objeto concreto, así que copiarlo del inspector no da un
 * acceso permanente ni sirve para pedir otro objeto.
 */
export function signAccess(payload: string, expiresAt: number, key: Buffer): string {
  const mac = createHmac("sha256", key).update(`${payload}.${expiresAt}`).digest();
  return `${expiresAt}.${b64(mac)}`;
}

export function verifyAccess(payload: string, token: string, key: Buffer, now: number = Date.now()): boolean {
  const [expiresRaw, macRaw] = token.split(".");
  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || !macRaw) return false;
  if (expiresAt < now) return false;

  const expected = createHmac("sha256", key).update(`${payload}.${expiresAt}`).digest();
  let provided: Buffer;
  try {
    provided = unb64(macRaw);
  } catch {
    return false;
  }
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

function b64(buf: Buffer): string {
  return buf.toString("base64url");
}

function unb64(value: string): Buffer {
  return Buffer.from(value, "base64url");
}
