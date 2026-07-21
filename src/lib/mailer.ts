import nodemailer, { type Transporter } from "nodemailer";

/**
 * Envío de email transaccional (invitaciones, altas...). Usa SMTP real si
 * SMTP_HOST/SMTP_USER/SMTP_PASSWORD están configurados (cualquier proveedor
 * compatible con SMTP: Resend, SES, Postmark, Sendgrid, un servidor propio...).
 * Sin esas variables (p. ej. en desarrollo o en este entorno de demo), cae a
 * registrar el email en el log del servidor para poder seguir el flujo sin
 * bloquear la funcionalidad.
 */
let transporter: Transporter | null | undefined;

function getTransporter(): Transporter | null {
  if (transporter !== undefined) return transporter;

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;

  if (!host || !user || !password) {
    transporter = null;
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    auth: { user, pass: password },
  });

  return transporter;
}

export function isMailerConfigured() {
  return getTransporter() !== null;
}

export async function sendMail({ to, subject, html }: { to: string; subject: string; html: string }) {
  const smtp = getTransporter();

  if (!smtp) {
    console.log(`[mailer] SMTP no configurado — simulando envío → ${to} · ${subject}`);
    if (process.env.NODE_ENV !== "production") {
      console.log(html);
    }
    return;
  }

  try {
    await smtp.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      html,
    });
  } catch (error) {
    console.error(`[mailer] Error enviando email a ${to}:`, error);
  }
}
