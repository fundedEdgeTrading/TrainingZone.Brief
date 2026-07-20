// Plantillas de email transaccional (tablas + estilos inline para compatibilidad
// con clientes de correo). Ver design_files/Email Bienvenida.dc.html — mismos
// tokens de marca que globals.css, pero como valores literales (los clientes
// de email no leen custom properties de CSS).

const INK = "#1D1D1C";
const PAPER = "#F4F0E8";
const SAND = "#E7DFD2";
const MUTED = "#8A8574";
const TEXT2 = "#5B5748";
const FAINT = "#A8A296";

function shell(opts: {
  logoUrl: string;
  logoAlt: string;
  eyebrow: string;
  title: string;
  bodyHtml: string;
  ctaLabel: string;
  ctaUrl: string;
  noteHtml: string;
  signOff: string;
  footerLine1: string;
  footerLine2: string;
}) {
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${SAND};font-family:Poppins,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SAND};padding:40px 16px;">
<tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:${PAPER};border-radius:16px;overflow:hidden;">
<tr><td align="center" style="background:${INK};padding:36px 40px;">
<img src="${opts.logoUrl}" alt="${opts.logoAlt}" height="40" style="height:40px;width:auto;">
</td></tr>
<tr><td style="background:#ffffff;padding:40px;">
<div style="font-weight:700;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:${MUTED};">${opts.eyebrow}</div>
<h1 style="font-weight:800;font-size:28px;text-transform:uppercase;letter-spacing:-.01em;line-height:1.1;margin:8px 0 0;color:${INK};">${opts.title}</h1>
${opts.bodyHtml}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:30px auto;">
<tr><td align="center" style="background:${INK};border-radius:10px;">
<a href="${opts.ctaUrl}" style="display:inline-block;color:${PAPER};text-decoration:none;font-weight:700;font-size:15px;text-transform:uppercase;letter-spacing:.03em;padding:16px 36px;">${opts.ctaLabel}</a>
</td></tr>
</table>
<div style="background:${PAPER};border:1px solid ${SAND};border-radius:12px;padding:14px 18px;font-size:13px;color:${MUTED};line-height:1.6;">${opts.noteHtml}</div>
<p style="font-size:14px;color:${TEXT2};margin:24px 0 0;">${opts.signOff}</p>
</td></tr>
<tr><td align="center" style="background:${PAPER};padding:24px 40px;border-top:1px solid ${SAND};font-size:12px;color:${FAINT};line-height:1.7;">
${opts.footerLine1}<br>${opts.footerLine2}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export function renderMemberWelcomeEmail(opts: {
  memberFirstName: string;
  orgName: string;
  orgLogoUrl: string;
  centerName: string;
  onboardingUrl: string;
}) {
  return shell({
    logoUrl: opts.orgLogoUrl,
    logoAlt: opts.orgName,
    eyebrow: "Tu cuenta está lista",
    title: `¡Hola, ${opts.memberFirstName}!<br>Bienvenida al equipo.`,
    bodyHtml: `
<p style="font-size:15px;line-height:1.65;color:${TEXT2};margin:18px 0 0;">Nos hace mucha ilusión tenerte con nosotros en <b>${opts.centerName}</b>. Tu entrenador y todo el equipo ya te están esperando para acompañarte en cada sesión.</p>
<p style="font-size:15px;line-height:1.65;color:${TEXT2};margin:14px 0 0;">Solo falta un paso: crea tu contraseña y firma los consentimientos para acceder a tu portal, donde podrás <b>reservar clases, ver tu progreso y tus fotos de evolución</b>.</p>`,
    ctaLabel: "Crear mi acceso →",
    ctaUrl: opts.onboardingUrl,
    noteHtml: `Este enlace es personal y caduca en <b style="color:${TEXT2}">7 días</b>. Si no has solicitado esta cuenta, puedes ignorar este email — no se activará nada sin tu confirmación.`,
    signOff: `Nos vemos en el centro,<br><b>El equipo de ${opts.orgName}</b>`,
    footerLine1: `${opts.orgName} · Recibes este email porque tu centro ha creado tu cuenta de socio.`,
    footerLine2: `Política de privacidad · Contacto`,
  });
}

export function renderStaffInviteEmail(opts: {
  staffFirstName: string;
  orgName: string;
  orgLogoUrl: string;
  roleLabel: string;
  onboardingUrl: string;
}) {
  return shell({
    logoUrl: opts.orgLogoUrl,
    logoAlt: opts.orgName,
    eyebrow: "Te han dado de alta",
    title: `¡Hola, ${opts.staffFirstName}!<br>Ya formas parte del equipo.`,
    bodyHtml: `
<p style="font-size:15px;line-height:1.65;color:${TEXT2};margin:18px 0 0;">Te han dado de alta en <b>${opts.orgName}</b> con el rol de <b>${opts.roleLabel}</b>.</p>
<p style="font-size:15px;line-height:1.65;color:${TEXT2};margin:14px 0 0;">Crea tu contraseña para acceder a la plataforma de gestión.</p>`,
    ctaLabel: "Crear mi contraseña →",
    ctaUrl: opts.onboardingUrl,
    noteHtml: `Este enlace es personal y caduca en <b style="color:${TEXT2}">7 días</b>. Si no esperabas esta invitación, puedes ignorar este email.`,
    signOff: `Bienvenida/o,<br><b>El equipo de ${opts.orgName}</b>`,
    footerLine1: `${opts.orgName} · Recibes este email porque se ha creado tu cuenta de personal.`,
    footerLine2: `Todo acceso queda auditado.`,
  });
}
