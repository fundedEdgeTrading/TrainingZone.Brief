import crypto from "crypto";

import { publicOrigin } from "@/lib/site";

/**
 * E2 · La rama «SI HACE CLIC», sin píxel de traza.
 *
 * Negocio pidió «si abre». No se mide la apertura en fase 1 (D-L3-4): un píxel
 * de traza es una cookie/identificador no estrictamente técnico, y AGENTS.md
 * obliga a traer en el MISMO cambio un CMP con «rechazar todo» al mismo nivel
 * visual que «aceptar todo». Eso es un módulo propio que afecta a toda la web.
 *
 * El CLIC no tiene ese problema: el enlace es NUESTRO, el socio lo pulsa a
 * propósito y no hay nada que cargar de fondo. Se firma el `FlowEmailLog.id`
 * —mismo patrón que `email-verification.ts`— y el destino real viaja dentro del
 * token, así que no hay parámetro de URL que alguien pueda cambiar para
 * convertir esto en un redirector abierto.
 *
 * El propósito va DENTRO de la firma y es propio de este módulo: un token de
 * clic no vale como token de baja ni al revés.
 */

const PURPOSE = "flow-click";

/**
 * Los enlaces viven en la bandeja del socio tanto como el correo. 180 días
 * cubre de sobra la vida útil de una campaña sin dejar un enlace firmado
 * eterno; caducado, el enlace sigue llevando al destino pero ya no anota clic.
 */
const TTL_MS = 180 * 24 * 60 * 60 * 1000;

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET no configurado — necesario para firmar los enlaces de los flujos.");
  return s;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

export type FlowClickTarget = { emailLogId: string; url: string };

export type FlowClickTokenResult =
  | { ok: true; emailLogId: string; url: string }
  | { ok: false; error: "invalid" | "expired" };

/**
 * Token de un enlace concreto de un correo concreto. El destino va dentro y
 * firmado: sin eso, `/clic?to=<url>` sería un redirector abierto con el dominio
 * del centro delante, que es una herramienta de phishing regalada.
 */
export function generateFlowClickToken(target: FlowClickTarget): string {
  const payload = [PURPOSE, target.emailLogId, Date.now() + TTL_MS, Buffer.from(target.url, "utf8").toString("base64url")].join(".");
  return `${Buffer.from(payload, "utf8").toString("base64url")}.${sign(payload)}`;
}

export function verifyFlowClickToken(token: string): FlowClickTokenResult {
  const [payloadB64, mac] = token.split(".");
  if (!payloadB64 || !mac) return { ok: false, error: "invalid" };

  let payload: string;
  try {
    payload = Buffer.from(payloadB64, "base64url").toString("utf8");
  } catch {
    return { ok: false, error: "invalid" };
  }

  const macBuf = Buffer.from(mac);
  const expectedBuf = Buffer.from(sign(payload));
  if (macBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(macBuf, expectedBuf)) {
    return { ok: false, error: "invalid" };
  }

  const [purpose, emailLogId, expStr, urlB64] = payload.split(".");
  const exp = Number(expStr);
  if (purpose !== PURPOSE || !emailLogId || !urlB64 || !Number.isFinite(exp)) return { ok: false, error: "invalid" };

  const url = Buffer.from(urlB64, "base64url").toString("utf8");
  if (Date.now() > exp) return { ok: false, error: "expired" };
  return { ok: true, emailLogId, url };
}

/** La URL que de verdad va en el botón del correo. */
export function flowClickUrl(target: FlowClickTarget): string {
  return `${publicOrigin()}/api/flujos/clic/${generateFlowClickToken(target)}`;
}
