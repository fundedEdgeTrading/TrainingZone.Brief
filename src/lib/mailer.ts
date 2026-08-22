/**
 * Envío de email transaccional (invitaciones, altas...) vía la API HTTP de
 * Brevo (https://api.brevo.com). Se usa la API HTTP en vez de SMTP porque
 * proveedores como Render bloquean los puertos SMTP salientes (25/465/587)
 * en sus planes gratuitos; la API HTTP viaja por HTTPS (puerto 443) y no
 * tiene ese problema.
 *
 * Sin BREVO_API_KEY configurada (p. ej. en desarrollo o en este entorno de
 * demo), cae a registrar el email en el log del servidor para poder seguir
 * el flujo sin bloquear la funcionalidad.
 */
const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

export function isMailerConfigured() {
  return Boolean(process.env.BREVO_API_KEY);
}

export type MailOptions = {
  to: string;
  subject: string;
  html: string;
  /**
   * RB-MARCA-001: nombre visible del remitente. El socio de un gimnasio no ha
   * comprado Apta, ha comprado su gimnasio: sus correos deben verse como de su
   * centro. La dirección de envío sigue siendo la nuestra (es la que tiene
   * SPF/DKIM configurados); lo que cambia es el nombre y el Reply-To.
   */
  fromName?: string;
  replyTo?: string;
  /**
   * Enlace de baja del destinatario (`/api/email/baja/<token>`). Añade las
   * cabeceras `List-Unsubscribe` y `List-Unsubscribe-Post` (RFC 8058): Gmail y
   * Outlook pintan con ellas su propio botón "Cancelar suscripción" arriba del
   * correo, y su ausencia es uno de los motivos por los que un remitente acaba
   * en spam. Solo se pasa en el correo prescindible: en el transaccional puro
   * (contraseña, cobro fallido) no hay nada de lo que darse de baja.
   */
  unsubscribeUrl?: string;
};

export async function sendMail({ to, subject, html, fromName, replyTo, unsubscribeUrl }: MailOptions) {
  const apiKey = process.env.BREVO_API_KEY;

  if (!apiKey) {
    const from = fromName ? ` de «${fromName}»` : "";
    console.log(`[mailer] Brevo no configurado — simulando envío${from} → ${to} · ${subject}`);
    if (process.env.NODE_ENV !== "production") {
      console.log(html);
    }
    return;
  }

  try {
    const res = await fetch(BREVO_API_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        sender: {
          email: process.env.BREVO_FROM_EMAIL || process.env.SMTP_FROM,
          ...(fromName ? { name: fromName } : {}),
        },
        to: [{ email: to }],
        ...(replyTo ? { replyTo: { email: replyTo } } : {}),
        ...(unsubscribeUrl
          ? {
              headers: {
                "List-Unsubscribe": `<${unsubscribeUrl}>`,
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
              },
            }
          : {}),
        subject,
        htmlContent: html,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Brevo API respondió ${res.status}: ${body}`);
    }
  } catch (error) {
    console.error(`[mailer] Error enviando email a ${to}:`, error);
  }
}
