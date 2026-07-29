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

export async function sendMail({ to, subject, html }: { to: string; subject: string; html: string }) {
  const apiKey = process.env.BREVO_API_KEY;

  if (!apiKey) {
    console.log(`[mailer] Brevo no configurado — simulando envío → ${to} · ${subject}`);
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
        sender: { email: process.env.BREVO_FROM_EMAIL || process.env.SMTP_FROM },
        to: [{ email: to }],
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
