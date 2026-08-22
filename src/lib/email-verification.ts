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
type TokenPurpose =
  | "verify-email"
  | "password-reset"
  | "member-billing"
  | "member-billing-dunning"
  | "email-preferences";

const VERIFY_EMAIL_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
// Más corto que el reset de contraseña: es un atajo directo a gestión de pago
// (cambiar tarjeta / cancelar cuota), no una recuperación de acceso completa.
const MEMBER_BILLING_TTL_MS = 30 * 60 * 1000;
/**
 * El enlace que se envía cuando falla un cobro es un propósito APARTE, y no el
 * de autoservicio con un TTL más largo, por dos razones:
 *
 *  - 30 minutos no sirven aquí. Ese plazo asume a alguien delante del teclado
 *    que acaba de pedir el enlace; un email de impago llega de madrugada y se
 *    lee por la mañana. Caducado, el socio ve un error y abandona: la vía de
 *    recuperación falla en silencio, que es justo lo que veníamos a arreglar.
 *  - Con el propósito dentro de la firma, un enlace de impago no vale como
 *    enlace de autoservicio ni al revés, así que alargar este no alarga aquel.
 *
 * 72 horas cubre un fin de semana entero, que es el caso real. Más sería
 * imprudente: estos tokens no son revocables (ver cabecera).
 */
const MEMBER_DUNNING_TTL_MS = 72 * 60 * 60 * 1000;
/**
 * El enlace de preferencias/baja del pie de cada correo. TTL largo a propósito:
 * un enlace de baja que caduca es una baja que no se puede ejercer, y la
 * normativa exige que el medio siga siendo válido mientras se siga enviando
 * (Art. 21 RGPD / Art. 21 LSSI). Un año cubre de sobra la vida de un correo en
 * la bandeja de quien lo recibió, y el token solo permite dejar de recibir
 * correo: no abre sesión, no toca credenciales y no expone datos de salud.
 */
const EMAIL_PREFERENCES_TTL_MS = 365 * 24 * 60 * 60 * 1000;

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

/** Enlace de recuperación tras un cobro fallido. Ver `MEMBER_DUNNING_TTL_MS`. */
export function generateMemberDunningToken(memberId: string) {
  return generate("member-billing-dunning", memberId, MEMBER_DUNNING_TTL_MS);
}

/**
 * Acepta los dos propósitos porque ambos aterrizan en la misma pantalla. Se
 * prueba el de autoservicio primero y, si el token no es de ese propósito, el
 * de impago: un token válido de uno da `invalid` en el otro, no `expired`, así
 * que ese error no puede enmascarar una caducidad real.
 */
export function verifyMemberBillingOrDunningToken(token: string): MemberBillingTokenResult {
  const selfService = verify("member-billing", token);
  if (selfService.ok) return { ok: true, memberId: selfService.subjectId };
  if (selfService.error === "expired") return selfService;

  const dunning = verify("member-billing-dunning", token);
  return dunning.ok ? { ok: true, memberId: dunning.subjectId } : dunning;
}

export function memberBillingUrlFor(token: string) {
  return `${appBaseUrl()}/gestionar-suscripcion/${token}`;
}

/**
 * Enlaces de "Preferencias de correo" y "Darme de baja" del pie de cada email.
 * Sujeto = `Member.id`: quien recibe estos correos es el socio, y las
 * preferencias viven en su ficha (no en la credencial de acceso, que puede no
 * existir: hay socios sin portal).
 */
export type EmailPreferencesTokenResult = { ok: true; memberId: string } | { ok: false; error: "invalid" | "expired" };

export function generateEmailPreferencesToken(memberId: string) {
  return generate("email-preferences", memberId, EMAIL_PREFERENCES_TTL_MS);
}

export function verifyEmailPreferencesToken(token: string): EmailPreferencesTokenResult {
  const result = verify("email-preferences", token);
  return result.ok ? { ok: true, memberId: result.subjectId } : result;
}

export function emailPreferencesUrlFor(token: string) {
  return `${appBaseUrl()}/preferencias/${token}`;
}

export function emailUnsubscribeUrlFor(token: string) {
  return `${appBaseUrl()}/baja/${token}`;
}

/**
 * Destino de la cabecera `List-Unsubscribe` (RFC 8058). Es un endpoint, no la
 * página: el cliente de correo manda un POST sin que nadie mire, así que tiene
 * que dar de baja y responder 200, no devolver HTML.
 */
export function emailUnsubscribePostUrlFor(token: string) {
  return `${appBaseUrl()}/api/email/baja/${token}`;
}
