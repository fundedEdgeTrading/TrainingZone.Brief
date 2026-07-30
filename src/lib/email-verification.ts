import crypto from "crypto";

/**
 * Tokens firmados sin tabla: base64url(purpose + subjectId + exp) + "." +
 * HMAC(AUTH_SECRET). Evita una tabla por cada tipo de enlace a cambio de no ser
 * revocables, lo que es aceptable con TTL cortos.
 *
 * `purpose` va DENTRO de la firma a propósito: sin él, el token de confirmación
 * de email (7 días, se envía en cada alta) valdría también como token de
 * restablecimiento de contraseña, y cualquiera con acceso a un correo antiguo
 * podría tomar la cuenta. `subjectId` es genérico a propósito: para
 * "verify-email"/"password-reset" es una `Identity` (se verifica/restablece la
 * credencial, no la membresía); para "member-billing" es un `Member` (el
 * enlace abre el Billing Portal de Stripe de ESE socio, no toca ninguna
 * credencial de acceso). Cada propósito expone su propio par
 * generar/verificar con el nombre de campo que le corresponde, para no obligar
 * a cada caller a saber qué es un "subject" en abstracto.
 */
type TokenPurpose = "verify-email" | "password-reset" | "member-billing";

const VERIFY_EMAIL_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
// Más corto que el reset de contraseña: es un atajo directo a gestión de pago
// (cambiar tarjeta / cancelar cuota), no una recuperación de acceso completa.
const MEMBER_BILLING_TTL_MS = 30 * 60 * 1000;

type RawTokenResult =
  | { ok: true; subjectId: string }
  | { ok: false; error: "invalid" | "expired" };

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET no configurado — necesario para firmar tokens de verificación.");
  return s;
}

function sign(payload: string) {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

function generate(purpose: TokenPurpose, subjectId: string, ttlMs: number) {
  const payload = `${purpose}.${subjectId}.${Date.now() + ttlMs}`;
  return `${Buffer.from(payload, "utf8").toString("base64url")}.${sign(payload)}`;
}

function verify(purpose: TokenPurpose, token: string): RawTokenResult {
  const [payloadB64, mac] = token.split(".");
  if (!payloadB64 || !mac) return { ok: false, error: "invalid" };

  const payload = Buffer.from(payloadB64, "base64url").toString("utf8");
  const macBuf = Buffer.from(mac);
  const expectedBuf = Buffer.from(sign(payload));
  if (macBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(macBuf, expectedBuf)) {
    return { ok: false, error: "invalid" };
  }

  const [tokenPurpose, subjectId, expStr] = payload.split(".");
  const exp = Number(expStr);
  if (tokenPurpose !== purpose || !subjectId || !Number.isFinite(exp)) return { ok: false, error: "invalid" };
  if (Date.now() > exp) return { ok: false, error: "expired" };

  return { ok: true, subjectId };
}

function appBaseUrl() {
  const base = process.env.NEXTAUTH_URL || process.env.AUTH_URL || "http://localhost:3000";
  return base.replace(/\/$/, "");
}

export type VerifyEmailTokenResult = { ok: true; identityId: string } | { ok: false; error: "invalid" | "expired" };

export function generateVerifyEmailToken(identityId: string) {
  return generate("verify-email", identityId, VERIFY_EMAIL_TTL_MS);
}

export function verifyEmailToken(token: string): VerifyEmailTokenResult {
  const result = verify("verify-email", token);
  return result.ok ? { ok: true, identityId: result.subjectId } : result;
}

export function verifyEmailUrlFor(token: string) {
  return `${appBaseUrl()}/verificar-email/${token}`;
}

export type PasswordResetTokenResult = { ok: true; identityId: string } | { ok: false; error: "invalid" | "expired" };

export function generatePasswordResetToken(identityId: string) {
  return generate("password-reset", identityId, PASSWORD_RESET_TTL_MS);
}

export function verifyPasswordResetToken(token: string): PasswordResetTokenResult {
  const result = verify("password-reset", token);
  return result.ok ? { ok: true, identityId: result.subjectId } : result;
}

export function passwordResetUrlFor(token: string) {
  return `${appBaseUrl()}/recuperar-clave/${token}`;
}

/**
 * A.1: enlace mágico de "gestionar mi suscripción" — abre el Billing Portal de
 * Stripe del socio sin login. Sujeto = `Member.id`, no `Identity.id` (ver nota
 * arriba de `TokenPurpose`).
 */
export type MemberBillingTokenResult = { ok: true; memberId: string } | { ok: false; error: "invalid" | "expired" };

export function generateMemberBillingToken(memberId: string) {
  return generate("member-billing", memberId, MEMBER_BILLING_TTL_MS);
}

export function verifyMemberBillingToken(token: string): MemberBillingTokenResult {
  const result = verify("member-billing", token);
  return result.ok ? { ok: true, memberId: result.subjectId } : result;
}

export function memberBillingUrlFor(token: string) {
  return `${appBaseUrl()}/gestionar-suscripcion/${token}`;
}
