import crypto from "crypto";

/**
 * Confirmación blanda del email del director (D-2/B.2). Token sin tabla:
 * base64url(userId + "." + exp) + "." + HMAC(AUTH_SECRET). Evita una tabla
 * nueva (EmailVerification) a cambio de no ser revocable — aceptable porque
 * no bloquea el login (RB-SMTP-001), es solo el canal de facturación/reset.
 */
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET no configurado — necesario para firmar tokens de verificación.");
  return s;
}

function sign(payload: string) {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function generateVerifyEmailToken(userId: string) {
  const exp = Date.now() + TTL_MS;
  const payload = `${userId}.${exp}`;
  const payloadB64 = Buffer.from(payload, "utf8").toString("base64url");
  return `${payloadB64}.${sign(payload)}`;
}

export function verifyEmailToken(token: string): { ok: true; userId: string } | { ok: false; error: "invalid" | "expired" } {
  const [payloadB64, mac] = token.split(".");
  if (!payloadB64 || !mac) return { ok: false, error: "invalid" };

  const payload = Buffer.from(payloadB64, "base64url").toString("utf8");
  const expectedMac = sign(payload);
  const macBuf = Buffer.from(mac);
  const expectedBuf = Buffer.from(expectedMac);
  if (macBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(macBuf, expectedBuf)) {
    return { ok: false, error: "invalid" };
  }

  const [userId, expStr] = payload.split(".");
  const exp = Number(expStr);
  if (!userId || !Number.isFinite(exp)) return { ok: false, error: "invalid" };
  if (Date.now() > exp) return { ok: false, error: "expired" };

  return { ok: true, userId };
}

export function verifyEmailUrlFor(token: string) {
  const base = process.env.NEXTAUTH_URL || process.env.AUTH_URL || "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/verificar-email/${token}`;
}
