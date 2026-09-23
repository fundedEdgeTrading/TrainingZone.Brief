/**
 * Envío de email transaccional (invitaciones, altas...) vía la API HTTP de
 * Brevo (https://api.brevo.com). Se usa la API HTTP en vez de SMTP porque
 * proveedores como Render bloquean los puertos SMTP salientes (25/465/587)
 * en sus planes gratuitos; la API HTTP viaja por HTTPS (puerto 443) y no
 * tiene ese problema.
 *
 * Sin BREVO_API_KEY configurada FUERA de producción (desarrollo, CI), cae a
 * registrar el email en el log del servidor para poder seguir el flujo sin
 * bloquear la funcionalidad.
 *
 * PROD-03: en producción ya no se simula. Sin clave, o con un error de Brevo,
 * `sendMail` devuelve `{ ok: false, error }` y deja un `console.error` (sin la
 * clave). Antes el correo "se enviaba" en el log y la invitación o el enlace
 * de recuperación no llegaban nunca, sin que nada se pusiera rojo.
 *
 * `sendMail` NO lanza nunca: los llamadores que lo usan como
 * `void sendMail(...)` siguen funcionando igual, y los que quieran reaccionar
 * leen el resultado.
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

/**
 * Resultado del envío. `id` es el `messageId` de Brevo, o `null` cuando el
 * envío se ha simulado (fuera de producción, sin clave) o Brevo no lo devolvió.
 */
export type SendMailResult = { ok: true; id: string | null } | { ok: false; error: string };

/** Lo que `sendMail` lee del entorno; inyectable para poder probarlo sin red. */
export type MailerEnv = {
  NODE_ENV?: string;
  BREVO_API_KEY?: string;
  BREVO_FROM_EMAIL?: string;
  SMTP_FROM?: string;
};

export type MailerDeps = { env?: MailerEnv; fetch?: typeof fetch };

export async function sendMail(
  { to, subject, html, fromName, replyTo, unsubscribeUrl }: MailOptions,
  deps: MailerDeps = {}
): Promise<SendMailResult> {
  const env = deps.env ?? process.env;
  const doFetch = deps.fetch ?? fetch;
  const production = env.NODE_ENV === "production";
  const apiKey = env.BREVO_API_KEY;

  if (!apiKey) {
    if (production) {
      const error = "BREVO_API_KEY no configurada: correo NO enviado";
      console.error(`[mailer] ${error} → ${to} · ${subject}`);
      return { ok: false, error };
    }
    // Formato del log sin cambios: hay specs que leen los correos de aquí.
    const from = fromName ? ` de «${fromName}»` : "";
    console.log(`[mailer] Brevo no configurado — simulando envío${from} → ${to} · ${subject}`);
    console.log(html);
    return { ok: true, id: null };
  }

  try {
    const res = await doFetch(BREVO_API_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        sender: {
          email: env.BREVO_FROM_EMAIL || env.SMTP_FROM,
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
      // El cuerpo de Brevo explica el motivo (remitente no verificado, clave
      // revocada...). Se recorta y se limpia de la clave por si algún día la
      // repitiera: el log no es sitio para un secreto.
      const body = (await res.text().catch(() => "")).slice(0, 500).split(apiKey).join("[redactado]");
      const error = `Brevo API respondió ${res.status}`;
      console.error(`[mailer] ${error} enviando a ${to} · ${subject}: ${body}`);
      return { ok: false, error };
    }

    const data = (await res.json().catch(() => null)) as { messageId?: unknown } | null;
    return { ok: true, id: typeof data?.messageId === "string" ? data.messageId : null };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const error = `Error de red con Brevo: ${reason.split(apiKey).join("[redactado]")}`;
    console.error(`[mailer] ${error} enviando a ${to} · ${subject}`);
    return { ok: false, error };
  }
}
