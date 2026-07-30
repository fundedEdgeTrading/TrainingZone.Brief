import crypto from "crypto";

/**
 * Tokens firmados sin tabla: base64url(purpose + identityId + exp) + "." +
 * HMAC(AUTH_SECRET). Evita una tabla por cada tipo de enlace a cambio de no ser
 * revocables, lo que es aceptable con TTL cortos.
 *
 * `purpose` va DENTRO de la firma a propósito: sin él, el token de confirmación
 * de email (7 días, se envía en cada alta) valdría también como token de
 * restablecimiento de contraseña, y cualquiera con acceso a un correo antiguo
 * podría tomar la cuenta. El sujeto es una `Identity`, no un `User`: lo que se
 * verifica y lo que se restablece es la credencial, no la membresía.
 */
type TokenPurpose = "verify-email" | "password-reset";

const VERIFY_EMAIL_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

export type TokenResult =
  | { ok: true; identityId: string }
  | { ok: false; error: "invalid" | "expired" };

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET no configurado — necesario para firmar tokens de verificación.");
  return s;
}

function sign(payload: string) {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

function generate(purpose: TokenPurpose, identityId: string, ttlMs: number) {
  const payload = `${purpose}.${identityId}.${Date.now() + ttlMs}`;
  return `${Buffer.from(payload, "utf8").toString("base64url")}.${sign(payload)}`;
}

function verify(purpose: TokenPurpose, token: string): TokenResult {
  const [payloadB64, mac] = token.split(".");
  if (!payloadB64 || !mac) return { ok: false, error: "invalid" };

  const payload = Buffer.from(payloadB64, "base64url").toString("utf8");
  const macBuf = Buffer.from(mac);
  const expectedBuf = Buffer.from(sign(payload));
  if (macBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(macBuf, expectedBuf)) {
    return { ok: false, error: "invalid" };
  }

  const [tokenPurpose, identityId, expStr] = payload.split(".");
  const exp = Number(expStr);
  if (tokenPurpose !== purpose || !identityId || !Number.isFinite(exp)) return { ok: false, error: "invalid" };
  if (Date.now() > exp) return { ok: false, error: "expired" };

  return { ok: true, identityId };
}

function appBaseUrl() {
  const base = process.env.NEXTAUTH_URL || process.env.AUTH_URL || "http://localhost:3000";
  return base.replace(/\/$/, "");
}

export function generateVerifyEmailToken(identityId: string) {
  return generate("verify-email", identityId, VERIFY_EMAIL_TTL_MS);
}

export function verifyEmailToken(token: string) {
  return verify("verify-email", token);
}

export function verifyEmailUrlFor(token: string) {
  return `${appBaseUrl()}/verificar-email/${token}`;
}

export function generatePasswordResetToken(identityId: string) {
  return generate("password-reset", identityId, PASSWORD_RESET_TTL_MS);
}

export function verifyPasswordResetToken(token: string) {
  return verify("password-reset", token);
}

export function passwordResetUrlFor(token: string) {
  return `${appBaseUrl()}/recuperar-clave/${token}`;
}
