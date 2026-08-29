/**
 * Plantillas de email transaccional de Training Zone.
 *
 * Sustituye a `src/lib/emails/templates.ts`. Mantiene las mismas firmas
 * exportadas que la versión anterior (más algunos parámetros opcionales
 * nuevos), así que los call sites existentes siguen compilando sin cambios.
 *
 * Reglas de la revisión de diseño:
 *  - Todo sale firmado como Training Zone (o como el centro concreto). No
 *    queda ninguna mención a Apta en el cuerpo ni en el pie.
 *  - Tablas + estilos inline: los clientes de correo no leen custom
 *    properties de CSS ni hojas externas. El único <style> del <head> lleva
 *    la media query móvil, que no se puede inlinear.
 *  - Cada correo lleva una ficha de datos estructurada (`rows`) entre el
 *    cuerpo y el botón. Es el elemento que da el aire de producto premium y
 *    el que responde "¿de qué va esto exactamente?" sin abrir la app.
 *  - Paleta y tipografía de `docs/BRANDING.md`.
 */

const INK = "#1D1D1C"; // Negro corporativo
const PAPER = "#F4F0E8"; // Hueso
const SAND = "#E7DFD2"; // Arena (color de firma)
const LINEN = "#D8CCB8"; // Lino (bordes y filetes)
const MUTED = "#8A8574";
const TEXT2 = "#5B5748";
const FAINT = "#A8A296";

const FONT = "Poppins,Helvetica,Arial,sans-serif";

/**
 * Dominio público de la app; se usa para los enlaces del pie. Mismo criterio
 * que `invitations.absoluteUrl`, pero sin importarlo: este módulo se mantiene
 * puro (nada de Prisma) para poder renderizar y probar una plantilla sin BD.
 */
function appUrl(path: string) {
  const base = (process.env.NEXTAUTH_URL || process.env.AUTH_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}${path}`;
}

export type EmailRow = { label: string; value: string };

/** Una fila de la ficha de datos. `first` quita el filete superior. */
function row(r: EmailRow, first: boolean) {
  return `<tr><td style="padding:13px 20px;${first ? "" : `border-top:1px solid ${LINEN};`}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
<tr><td class="tzdl" align="left" style="font-family:${FONT};font-size:10px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:${MUTED};">${esc(r.label)}</td>
<td class="tzdv" align="right" style="font-family:${FONT};font-size:14px;font-weight:600;color:${INK};">${esc(r.value)}</td></tr>
</table>
</td></tr>`;
}

function shell(opts: {
  logoUrl: string;
  logoAlt: string;
  /** Etiqueta a la derecha del logo en la cabecera negra: SOCIOS, AGENDA, CUOTA… */
  section: string;
  /** Texto de vista previa junto al asunto en la bandeja (~85 caracteres). */
  preheader: string;
  eyebrow: string;
  /** Admite <br> para partir el titular en dos líneas. */
  title: string;
  bodyHtml: string;
  rows: EmailRow[];
  ctaLabel: string;
  ctaUrl: string;
  noteHtml: string;
  signOff: string;
  /** Nombre que firma el pie: el centro si lo hay, si no la organización. */
  senderName: string;
  postalAddress: string;
  reason: string;
  footerLinksHtml: string;
}) {
  const rowsHtml = opts.rows.length
    ? `<tr><td class="tzpad" style="padding:30px 40px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background:${SAND};border:1px solid ${LINEN};border-radius:14px;">
${opts.rows.map((r, i) => row(r, i === 0)).join("\n")}
</table>
</td></tr>`
    : "";

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(opts.logoAlt)}</title>
<style>
@media only screen and (max-width:620px){
  .tzpad{padding-left:24px!important;padding-right:24px!important;}
  .tzhead{padding-left:24px!important;padding-right:24px!important;}
  .tztitle{font-size:24px!important;}
  .tzdl,.tzdv{display:block!important;width:100%!important;text-align:left!important;}
  .tzdv{padding-top:4px!important;}
}
</style>
<!--[if mso]><style>body,table,td,a{font-family:Helvetica,Arial,sans-serif!important;}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background:${SAND};font-family:${FONT};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;height:0;width:0;font-size:1px;line-height:1px;">${esc(opts.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background:${SAND};">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;border-collapse:collapse;background:${PAPER};border-radius:18px;overflow:hidden;">

<tr><td class="tzhead" style="background:${INK};padding:26px 40px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
<tr>
<td align="left" style="width:60%;"><img src="${opts.logoUrl}" alt="${esc(opts.logoAlt)}" width="155" height="26" style="height:26px;width:155px;display:block;border:0;"></td>
<td align="right" style="width:40%;font-family:${FONT};font-size:10px;font-weight:600;letter-spacing:.22em;text-transform:uppercase;color:${MUTED};">${esc(opts.section)}</td>
</tr>
</table>
</td></tr>

<tr><td class="tzpad" style="padding:44px 40px 0;">
<div style="font-family:${FONT};font-size:10px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:${MUTED};">${opts.eyebrow}</div>
<h1 class="tztitle" style="font-family:${FONT};font-size:30px;font-weight:700;text-transform:uppercase;letter-spacing:-.015em;line-height:1.12;margin:12px 0 0;color:${INK};mso-line-height-rule:exactly;">${opts.title}</h1>
${opts.bodyHtml}
</td></tr>

${rowsHtml}

<tr><td class="tzpad" style="padding:30px 40px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
<tr><td align="center" bgcolor="${INK}" style="background:${INK};border-radius:10px;">
<a href="${opts.ctaUrl}" style="display:block;color:${PAPER};text-decoration:none;font-family:${FONT};font-weight:600;font-size:13px;text-transform:uppercase;letter-spacing:.1em;padding:18px 24px;mso-line-height-rule:exactly;line-height:16px;">${opts.ctaLabel}</a>
</td></tr>
</table>
</td></tr>

<tr><td class="tzpad" style="padding:26px 40px 0;">
<div style="border-top:1px solid ${LINEN};padding-top:18px;font-family:${FONT};font-size:12.5px;line-height:1.7;color:${MUTED};">${opts.noteHtml}</div>
</td></tr>

<tr><td class="tzpad" style="padding:24px 40px 44px;">
<p style="font-family:${FONT};font-size:14px;line-height:1.7;color:${TEXT2};margin:0;">${opts.signOff}</p>
</td></tr>

<tr><td class="tzpad" align="center" style="background:${SAND};border-top:1px solid ${LINEN};padding:26px 40px;">
<div style="font-family:${FONT};font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:${TEXT2};">${esc(opts.senderName)}</div>
<div style="font-family:${FONT};font-size:12px;line-height:1.8;color:${MUTED};margin-top:6px;">${esc(opts.postalAddress)}<br>${opts.reason}</div>
<div style="font-family:${FONT};font-size:12px;line-height:1.8;color:${FAINT};margin-top:10px;">${opts.footerLinksHtml}</div>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

function link(path: string, label: string) {
  return `<a href="${appUrl(path)}" style="color:${TEXT2};text-decoration:underline;">${label}</a>`;
}

/**
 * Enlaces del pie. Los de preferencias y baja van SIEMPRE con el token del
 * destinatario (`generateEmailPreferencesToken(member.id)`): una baja que
 * exige recordar la contraseña y navegar por la app no es una baja, y la
 * normativa pide un medio sencillo y gratuito (Art. 21 LSSI / Art. 21 RGPD).
 * Sin token —correos de personal o de dirección, donde el destinatario no es
 * un socio con preferencias— el pie se queda solo con Privacidad: ese correo
 * es estrictamente transaccional y no hay nada de lo que darse de baja.
 */
const PREFS = (token: string) => link(`/preferencias/${token}`, "Preferencias de correo");
const PRIVACY = () => link("/privacidad", "Privacidad");
const UNSUB = (token: string, label = "Darme de baja") => link(`/baja/${token}`, label);

/** Pie de un correo a un socio: preferencias + baja si hay token, privacidad siempre. */
function memberFooterLinks(prefsToken: string | undefined, unsubLabel?: string) {
  if (!prefsToken) return PRIVACY();
  return `${PREFS(prefsToken)} · ${UNSUB(prefsToken, unsubLabel)} · ${PRIVACY()}`;
}

/**
 * Los datos que se interpolan salen de la BD (nombres de socio, de centro, de
 * plan…). Escaparlos evita que un apellido con `<` o un nombre de centro con
 * `&` rompa la maqueta del correo.
 */
function esc(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function p(html: string, first = false) {
  return `<p style="font-family:${FONT};font-size:15px;line-height:1.7;color:${TEXT2};margin:${first ? "20px" : "14px"} 0 0;">${html}</p>`;
}

function strong(text: string) {
  return `<b style="color:${INK};">${esc(text)}</b>`;
}

/**
 * Dirección postal del pie cuando el call site no pasa la del centro (correos
 * de plataforma, o un centro sin `Center.address` cargada). Configurable por
 * entorno para no tener que tocar código al cambiar de sede.
 */
const DEFAULT_ADDRESS = process.env.EMAIL_POSTAL_ADDRESS || "Av. de Cataluña 42, 50014 Zaragoza";

// ---------------------------------------------------------------------------
// 01 · Bienvenida al socio
// ---------------------------------------------------------------------------
export function renderMemberWelcomeEmail(opts: {
  memberFirstName: string;
  orgName: string;
  orgLogoUrl: string;
  centerName: string;
  onboardingUrl: string;
  /** Token de `generateEmailPreferencesToken(member.id)` para el pie. */
  prefsToken?: string;
  memberFullName?: string;
  postalAddress?: string;
}) {
  return shell({
    logoUrl: opts.orgLogoUrl,
    logoAlt: opts.orgName,
    section: "Socios",
    preheader: "Crea tu contraseña y entra a tu portal: reserva clases, sigue tu progreso y tus fotos de evolución.",
    eyebrow: "Tu cuenta está lista",
    title: `¡Hola, ${esc(opts.memberFirstName)}!<br>Bienvenida al equipo.`,
    bodyHtml:
      p(`Nos hace mucha ilusión tenerte con nosotros en ${strong(opts.centerName)}. Tu entrenador y todo el equipo ya te están esperando.`, true) +
      p("Solo falta un paso: crea tu contraseña y firma los consentimientos para entrar a tu portal, donde podrás reservar clases, seguir tu progreso y ver tus fotos de evolución."),
    rows: [
      { label: "Centro", value: opts.centerName },
      ...(opts.memberFullName ? [{ label: "Socia", value: opts.memberFullName }] : []),
      { label: "Estado del acceso", value: "Pendiente de activar" },
      { label: "El enlace caduca", value: "En 7 días" },
    ],
    ctaLabel: "Crear mi acceso",
    ctaUrl: opts.onboardingUrl,
    noteHtml: "Este enlace es personal. Si no has solicitado esta cuenta, ignora este email: no se activará nada sin tu confirmación.",
    signOff: `Nos vemos en el centro,<br>${strong(`El equipo de ${opts.centerName}`)}`,
    senderName: opts.centerName,
    postalAddress: opts.postalAddress ?? DEFAULT_ADDRESS,
    reason: "Recibes este email porque tu centro ha creado tu cuenta de socio.",
    footerLinksHtml: memberFooterLinks(opts.prefsToken),
  });
}

// ---------------------------------------------------------------------------
// 02 · Confirmación del email de dirección
// ---------------------------------------------------------------------------
export function renderVerifyEmail(opts: {
  directorFirstName: string;
  orgName: string;
  orgLogoUrl: string;
  verifyUrl: string;
  directorEmail?: string;
  centerNames?: string[];
  postalAddress?: string;
}) {
  return shell({
    logoUrl: opts.orgLogoUrl,
    logoAlt: opts.orgName,
    section: "Dirección",
    preheader: "Confirma tu email de dirección para no perder ningún aviso de facturación ni de acceso.",
    eyebrow: "Confirma tu email",
    title: `¡Hola, ${esc(opts.directorFirstName)}!<br>Confirma tu email.`,
    bodyHtml:
      p(`Este email es tu canal de facturación y de recuperación de acceso para ${strong(opts.orgName)}. Confírmalo para que no se pierda ningún aviso importante.`, true) +
      p("No es obligatorio para seguir usando la plataforma: puedes hacerlo cuando quieras."),
    rows: [
      { label: "Organización", value: opts.orgName },
      ...(opts.directorEmail ? [{ label: "Email de dirección", value: opts.directorEmail }] : []),
      ...(opts.centerNames?.length ? [{ label: "Centros activos", value: opts.centerNames.join(" · ") }] : []),
      { label: "El enlace caduca", value: "En 7 días" },
    ],
    ctaLabel: "Confirmar mi email",
    ctaUrl: opts.verifyUrl,
    noteHtml: "Si no has creado esta cuenta, puedes ignorar este email: no se confirmará nada.",
    signOff: `Un saludo,<br>${strong(`El equipo de ${opts.orgName}`)}`,
    senderName: opts.orgName,
    postalAddress: opts.postalAddress ?? DEFAULT_ADDRESS,
    reason: "Recibes este email porque diste de alta tu organización.",
    footerLinksHtml: PRIVACY(),
  });
}

// ---------------------------------------------------------------------------
// 03 · Invitación a personal
// ---------------------------------------------------------------------------
export function renderStaffInviteEmail(opts: {
  staffFirstName: string;
  orgName: string;
  orgLogoUrl: string;
  roleLabel: string;
  onboardingUrl: string;
  centerName?: string;
  postalAddress?: string;
}) {
  return shell({
    logoUrl: opts.orgLogoUrl,
    logoAlt: opts.orgName,
    section: "Equipo",
    preheader: `Crea tu contraseña para entrar a la plataforma de gestión de ${esc(opts.orgName)}.`,
    eyebrow: "Te han dado de alta",
    title: `¡Hola, ${esc(opts.staffFirstName)}!<br>Ya formas parte del equipo.`,
    bodyHtml:
      p(`Te han dado de alta en ${strong(opts.orgName)} con el rol de ${strong(opts.roleLabel)}. Crea tu contraseña para acceder a la plataforma de gestión.`, true) +
      p("Desde ahí tendrás tu agenda, el Session Brief de cada socio y el semáforo de aptitud de quien entrenas."),
    rows: [
      { label: "Organización", value: opts.orgName },
      { label: "Rol", value: opts.roleLabel },
      ...(opts.centerName ? [{ label: "Centro base", value: opts.centerName }] : []),
      { label: "El enlace caduca", value: "En 7 días" },
    ],
    ctaLabel: "Crear mi contraseña",
    ctaUrl: opts.onboardingUrl,
    noteHtml: "Este enlace es personal. Todo acceso a datos de salud queda auditado.",
    signOff: `Bienvenido al equipo,<br>${strong(`Dirección de ${opts.orgName}`)}`,
    senderName: opts.orgName,
    postalAddress: opts.postalAddress ?? DEFAULT_ADDRESS,
    reason: "Recibes este email porque se ha creado tu cuenta de personal.",
    footerLinksHtml: PRIVACY(),
  });
}

// ---------------------------------------------------------------------------
// 04 · Restablecer contraseña
// ---------------------------------------------------------------------------
export function renderPasswordResetEmail(opts: {
  recipientFirstName: string;
  brandName: string;
  brandLogoUrl: string;
  resetUrl: string;
  accountEmail?: string;
  requestedAtLabel?: string;
  postalAddress?: string;
}) {
  return shell({
    logoUrl: opts.brandLogoUrl,
    logoAlt: opts.brandName,
    section: "Seguridad",
    preheader: "Elige una contraseña nueva. El enlace caduca en una hora y solo sirve para eso.",
    eyebrow: "Restablecer contraseña",
    title: `¡Hola, ${esc(opts.recipientFirstName)}!<br>Recupera tu acceso.`,
    bodyHtml:
      p("Has pedido restablecer la contraseña de tu cuenta. Pulsa el botón para elegir una nueva.", true) +
      p("Si no has sido tú, ignora este email: tu contraseña actual sigue siendo válida."),
    rows: [
      ...(opts.accountEmail ? [{ label: "Cuenta", value: opts.accountEmail }] : []),
      ...(opts.requestedAtLabel ? [{ label: "Solicitud", value: opts.requestedAtLabel }] : []),
      { label: "Validez del enlace", value: "1 hora" },
      { label: "Uso", value: "Un solo uso" },
    ],
    ctaLabel: "Elegir nueva contraseña",
    ctaUrl: opts.resetUrl,
    noteHtml: "Por seguridad, este enlace solo sirve para cambiar la contraseña y deja de funcionar en cuanto la cambies.",
    signOff: `Un saludo,<br>${strong(`El equipo de ${opts.brandName}`)}`,
    senderName: opts.brandName,
    postalAddress: opts.postalAddress ?? DEFAULT_ADDRESS,
    reason: "Recibes este email porque se ha solicitado restablecer tu contraseña.",
    footerLinksHtml: `${PRIVACY()} · Si no lo has pedido tú, no hace falta que hagas nada.`,
  });
}

// ---------------------------------------------------------------------------
// 05 · Enlace para gestionar la suscripción
// ---------------------------------------------------------------------------
export function renderMemberBillingLinkEmail(opts: {
  recipientFirstName: string;
  brandName: string;
  brandLogoUrl: string;
  portalRequestUrl: string;
  planName?: string;
  amountLabel?: string;
  prefsToken?: string;
  nextChargeLabel?: string;
  postalAddress?: string;
}) {
  return shell({
    logoUrl: opts.brandLogoUrl,
    logoAlt: opts.brandName,
    section: "Cuota",
    preheader: "Cambia tu método de pago, descarga facturas o cancela tu cuota sin necesidad de contraseña.",
    eyebrow: "Gestionar tu suscripción",
    title: `¡Hola, ${esc(opts.recipientFirstName)}!<br>Gestiona tu cuota.`,
    bodyHtml:
      p(`Has pedido un enlace para gestionar tu suscripción en ${strong(opts.brandName)}. Desde él puedes cambiar tu método de pago, descargar facturas o cancelar tu cuota, sin necesidad de contraseña.`, true) +
      p("Si no has sido tú, ignora este email: no se hará ningún cambio."),
    rows: [
      ...(opts.planName ? [{ label: "Plan", value: opts.planName }] : []),
      ...(opts.amountLabel ? [{ label: "Importe", value: opts.amountLabel }] : []),
      ...(opts.nextChargeLabel ? [{ label: "Próximo cobro", value: opts.nextChargeLabel }] : []),
      { label: "Validez del enlace", value: "30 minutos" },
    ],
    ctaLabel: "Gestionar mi suscripción",
    ctaUrl: opts.portalRequestUrl,
    noteHtml: "El enlace es de un solo uso y te lleva al portal de pagos seguro. Nunca guardamos los datos de tu tarjeta.",
    signOff: `Un saludo,<br>${strong(`El equipo de ${opts.brandName}`)}`,
    senderName: opts.brandName,
    postalAddress: opts.postalAddress ?? DEFAULT_ADDRESS,
    reason: "Recibes este email porque se ha solicitado gestionar tu suscripción.",
    footerLinksHtml: memberFooterLinks(opts.prefsToken),
  });
}

// ---------------------------------------------------------------------------
// 06 · Plaza liberada
// ---------------------------------------------------------------------------
export function renderSessionVacancyEmail(opts: {
  recipientFirstName: string;
  brandName: string;
  brandLogoUrl: string;
  sessionName: string;
  dateLabel: string;
  startTime: string;
  centerName: string;
  agendaUrl: string;
  room?: string;
  prefsToken?: string;
  spotsLabel?: string;
  /** El aviso va a quien estaba en lista de espera de ESA sesión, no al centro entero. */
  fromWaitlist?: boolean;
  postalAddress?: string;
}) {
  return shell({
    logoUrl: opts.brandLogoUrl,
    logoAlt: opts.brandName,
    section: "Agenda",
    preheader: `Hay un hueco en ${esc(opts.sessionName)}, ${esc(opts.dateLabel)} a las ${esc(opts.startTime)}. Se cubre por orden de llegada.`,
    eyebrow: "Plaza liberada",
    title: `¡Hola, ${esc(opts.recipientFirstName)}!<br>Se ha liberado un hueco.`,
    bodyHtml: opts.fromWaitlist
      ? // A quien espera se le dice lo que le falta saber: que la plaza no es
        // suya por estar el primero, sino de quien la reserve antes.
        p("Ha quedado libre una plaza en la sesión en la que estabas en lista de espera.", true) +
        p("Hemos avisado a toda la lista a la vez: la plaza es de quien la reserve primero, así que confírmala cuanto antes desde tu portal.")
      : p("Alguien ha cancelado y ha quedado una plaza libre en una sesión de tu centro para la que tienes bono activo.", true) +
        p("Las plazas se cubren por orden de llegada: si te interesa, resérvala cuanto antes desde tu portal."),
    rows: [
      { label: "Sesión", value: opts.sessionName },
      { label: "Fecha", value: opts.dateLabel },
      { label: opts.room ? "Hora · Sala" : "Hora", value: opts.room ? `${opts.startTime} · ${opts.room}` : opts.startTime },
      { label: "Centro", value: opts.centerName },
      ...(opts.spotsLabel ? [{ label: "Plazas libres", value: opts.spotsLabel }] : []),
    ],
    ctaLabel: "Ver y reservar",
    ctaUrl: opts.agendaUrl,
    noteHtml: "Si ya no te interesa esta sesión, no hace falta que hagas nada.",
    signOff: `Un saludo,<br>${strong(`El equipo de ${opts.centerName}`)}`,
    senderName: opts.centerName,
    postalAddress: opts.postalAddress ?? DEFAULT_ADDRESS,
    reason: opts.fromWaitlist
      ? "Recibes este email porque estás en la lista de espera de esta sesión."
      : "Recibes este email porque tienes un bono activo para este tipo de sesión en este centro.",
    footerLinksHtml: memberFooterLinks(opts.prefsToken, "Dejar de recibir avisos de plazas"),
  });
}

// ---------------------------------------------------------------------------
// 07 · Cumpleaños
// ---------------------------------------------------------------------------
export function renderBirthdayEmail(opts: {
  memberFirstName: string;
  brandName: string;
  brandLogoUrl: string;
  portalUrl: string;
  memberSinceLabel?: string;
  sessionCount?: number;
  prefsToken?: string;
  centerName?: string;
  postalAddress?: string;
}) {
  return shell({
    logoUrl: opts.brandLogoUrl,
    logoAlt: opts.brandName,
    section: "Hoy",
    preheader: "Gracias por estar con nosotros. Esperamos felicitarte muchos más.",
    eyebrow: "Hoy es tu día",
    title: `¡Felicidades,<br>${esc(opts.memberFirstName)}!`,
    bodyHtml:
      p("Gracias por estar con nosotros. Esperamos felicitarte muchos más.", true) +
      p("Disfruta del día — y si te apetece pasarte a entrenar, aquí estamos."),
    rows: [
      ...(opts.memberSinceLabel ? [{ label: "Socia desde", value: opts.memberSinceLabel }] : []),
      ...(typeof opts.sessionCount === "number" ? [{ label: "Sesiones contigo", value: String(opts.sessionCount) }] : []),
      ...(opts.centerName ? [{ label: "Tu centro", value: opts.centerName }] : []),
    ],
    ctaLabel: "Entrar a mi portal",
    ctaUrl: opts.portalUrl,
    noteHtml: "Hoy invitamos nosotros a las felicitaciones. El resto del equipo te lo dirá en persona.",
    signOff: `Un abrazo,<br>${strong(`El equipo de ${opts.centerName ?? opts.brandName}`)}`,
    senderName: opts.centerName ?? opts.brandName,
    postalAddress: opts.postalAddress ?? DEFAULT_ADDRESS,
    reason: "Recibes este email porque tienes tu fecha de nacimiento en tu ficha de socio.",
    footerLinksHtml: memberFooterLinks(opts.prefsToken, "No felicitarme más"),
  });
}

// ---------------------------------------------------------------------------
// Portadas al shell nuevo de los tres correos que no entraron en la revisión
// de diseño. Se incluyen para que este archivo siga siendo un reemplazo
// directo del anterior (si se borran, dejan de compilar member-billing.ts,
// provisioning.ts y assessment-jobs.ts). Copy heredado, sin menciones a Apta.
// ---------------------------------------------------------------------------

/**
 * Cobro fallido. El tono importa más de lo habitual: casi siempre es una
 * tarjeta caducada, no alguien que no quiere pagar. Se explica qué ha pasado,
 * se da el botón que lo arregla en un minuto y no se amenaza con nada.
 */
export function renderPaymentFailedEmail(opts: {
  memberFirstName: string;
  brandName: string;
  brandLogoUrl: string;
  amountLabel: string;
  portalUrl: string;
  prefsToken?: string;
  planName?: string;
  postalAddress?: string;
}) {
  return shell({
    logoUrl: opts.brandLogoUrl,
    logoAlt: opts.brandName,
    section: "Cuota",
    preheader: "Casi siempre es una tarjeta caducada. Se arregla en un minuto desde el botón del email.",
    eyebrow: "Cobro no completado",
    title: `Hola, ${esc(opts.memberFirstName)}.<br>No hemos podido cobrar tu cuota.`,
    bodyHtml:
      p(`El cobro de ${strong(opts.amountLabel)} no ha salido adelante. Casi siempre es una tarjeta caducada o un límite del banco, y se resuelve en un minuto desde el botón de abajo.`, true) +
      p("Mientras tanto sigues teniendo tu acceso y tus reservas: no hemos tocado nada."),
    rows: [
      ...(opts.planName ? [{ label: "Plan", value: opts.planName }] : []),
      { label: "Importe", value: opts.amountLabel },
      { label: "Estado", value: "Pendiente de cobro" },
      { label: "Validez del enlace", value: "72 horas" },
    ],
    ctaLabel: "Actualizar mi método de pago",
    ctaUrl: opts.portalUrl,
    noteHtml: "Si ya lo has arreglado por tu cuenta, ignora este email.",
    signOff: `Cualquier duda, aquí estamos,<br>${strong(`El equipo de ${opts.brandName}`)}`,
    senderName: opts.brandName,
    postalAddress: opts.postalAddress ?? DEFAULT_ADDRESS,
    reason: "Recibes este email porque un cobro de tu cuota no se ha completado.",
    footerLinksHtml: opts.prefsToken ? `${PREFS(opts.prefsToken)} · ${PRIVACY()}` : PRIVACY(),
  });
}

export function renderOwnerActivationEmail(opts: {
  orgName: string;
  planName: string;
  aptaLogoUrl: string;
  activationUrl: string;
  postalAddress?: string;
}) {
  return shell({
    logoUrl: opts.aptaLogoUrl,
    logoAlt: "Training Zone",
    section: "Plataforma",
    preheader: "Elige tu contraseña y te llevamos directo a la puesta en marcha de tu plataforma.",
    eyebrow: "Tu plataforma está lista",
    title: "Tu plataforma<br>ya está lista.",
    bodyHtml:
      p(`Hemos recibido tu pago del plan ${strong(opts.planName)} y hemos creado la plataforma de ${strong(opts.orgName)}.`, true) +
      p("Solo queda un paso: elige tu contraseña y te llevamos directo a la puesta en marcha —tu centro, tu equipo, tus tarifas y tus socios."),
    rows: [
      { label: "Organización", value: opts.orgName },
      { label: "Plan", value: opts.planName },
      { label: "El enlace caduca", value: "En 14 días" },
    ],
    ctaLabel: "Crear mi contraseña",
    ctaUrl: opts.activationUrl,
    noteHtml: "Este enlace es personal. Si caduca o no te llega, puedes pedir uno nuevo desde la página de activación.",
    signOff: `Encantados de tenerte,<br>${strong("El equipo de Training Zone")}`,
    senderName: "Training Zone",
    postalAddress: opts.postalAddress ?? DEFAULT_ADDRESS,
    reason: `Recibes este email porque has contratado la plataforma para ${esc(opts.orgName)}.`,
    footerLinksHtml: `Tu factura la emite Stripe y la tienes en tu correo de pago. · ${PRIVACY()}`,
  });
}

export function renderAssessmentDueEmail(opts: {
  memberFirstName: string;
  brandName: string;
  brandLogoUrl: string;
  assessmentLabel: string;
  isInitial: boolean;
  assessmentUrl: string;
  prefsToken?: string;
  dueDateLabel?: string;
  postalAddress?: string;
}) {
  return shell({
    logoUrl: opts.brandLogoUrl,
    logoAlt: opts.brandName,
    section: "Salud",
    preheader: opts.isInitial
      ? "Antes de programar tu entrenamiento necesitamos saber de dónde partes."
      : "Toca repasar tu evolución con tu entrenador en la próxima sesión.",
    eyebrow: opts.assessmentLabel,
    title: opts.isInitial
      ? `¡Hola, ${esc(opts.memberFirstName)}!<br>Empezamos por conocerte.`
      : `¡Hola, ${esc(opts.memberFirstName)}!<br>Toca mirar atrás.`,
    bodyHtml: opts.isInitial
      ? p("Antes de programar tu entrenamiento necesitamos saber de dónde partes: tu historial, tus molestias y qué te ha traído hasta aquí.", true) +
        p("La pasa tu entrenador contigo, en la próxima sesión: son unos minutos y condiciona todo lo que viene después.")
      : p(`Te toca la ${strong(opts.assessmentLabel.toLowerCase())}. Las mismas preguntas de siempre —peso, descanso, energía, dolor y cómo llevas la adherencia—, y las repasas con tu entrenador en la próxima sesión.`, true) +
        p("Repetirlas es lo que convierte respuestas sueltas en una gráfica: sin este punto, el siguiente tramo de tu evolución queda en blanco."),
    rows: [
      { label: "Valoración", value: opts.assessmentLabel },
      ...(opts.dueDateLabel ? [{ label: "Fecha prevista", value: opts.dueDateLabel }] : []),
      { label: "Dónde", value: "Con tu entrenador, en el centro" },
    ],
    ctaLabel: "Ver mi valoración",
    ctaUrl: opts.assessmentUrl,
    noteHtml: `Tus respuestas de salud solo las ve tu entrenador y el equipo autorizado de ${esc(opts.brandName)}, y cada consulta queda registrada.`,
    signOff: `Nos vemos en el centro,<br>${strong(`El equipo de ${opts.brandName}`)}`,
    senderName: opts.brandName,
    postalAddress: opts.postalAddress ?? DEFAULT_ADDRESS,
    reason: "Recibes este email porque tienes una valoración pendiente en tu ficha de socio.",
    footerLinksHtml: memberFooterLinks(opts.prefsToken, "Dejar de recibir recordatorios"),
  });
}

// ---------------------------------------------------------------------------
// 08 · Enlace a las preferencias de correo
//
// No estaba en el handoff de diseño porque no existía la pantalla: es el
// correo que cierra el circuito de la baja. Quien recibe un email antiguo con
// el token caducado pide uno nuevo desde /preferencias y le llega este. Lleva
// el mismo shell y la misma ficha que el resto.
// ---------------------------------------------------------------------------
export function renderEmailPreferencesLinkEmail(opts: {
  recipientFirstName: string;
  brandName: string;
  brandLogoUrl: string;
  preferencesUrl: string;
  centerName?: string;
  postalAddress?: string;
  prefsToken?: string;
}) {
  return shell({
    logoUrl: opts.brandLogoUrl,
    logoAlt: opts.brandName,
    section: "Correo",
    preheader: "Elige qué correos quieres recibir, o déjalos todos: se aplica al momento.",
    eyebrow: "Preferencias de correo",
    title: `¡Hola, ${esc(opts.recipientFirstName)}!<br>Tú decides qué te llega.`,
    bodyHtml:
      p("Has pedido el enlace para gestionar tus preferencias de correo. Desde ahí eliges qué avisos quieres recibir, o te das de baja de todos de una vez.", true) +
      p("Los correos de tu cuenta y de tu cuota —acceso, contraseña y cobros— seguirán llegándote: son parte del servicio y no se pueden desactivar."),
    rows: [
      ...(opts.centerName ? [{ label: "Centro", value: opts.centerName }] : []),
      { label: "Validez del enlace", value: "1 año" },
    ],
    ctaLabel: "Gestionar mis preferencias",
    ctaUrl: opts.preferencesUrl,
    noteHtml: "Si no has pedido tú este enlace, ignora este email: no se cambia nada hasta que lo abras.",
    signOff: `Un saludo,<br>${strong(`El equipo de ${opts.centerName ?? opts.brandName}`)}`,
    senderName: opts.centerName ?? opts.brandName,
    postalAddress: opts.postalAddress ?? DEFAULT_ADDRESS,
    reason: "Recibes este email porque se han solicitado tus preferencias de correo.",
    footerLinksHtml: memberFooterLinks(opts.prefsToken),
  });
}
