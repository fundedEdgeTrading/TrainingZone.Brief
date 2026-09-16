import { absoluteUrl } from "@/lib/site";

/**
 * E2 · Plantillas de los correos que salen de un FLUJO.
 *
 * Fichero aparte de `emails/templates.ts` a propósito, y no por gusto: aquel es
 * el correo transaccional —el que ejecuta el servicio contratado y NO se puede
 * desactivar— y este es el comercial, que pasa por `canSendMemberEmail
 * ("marketing", …)` y lleva el pie de baja SIEMPRE. Mezclarlos invitaría a
 * copiar el remitente de uno al otro, que es justo el error que convierte un
 * módulo legal en uno ilegal.
 *
 * QUÉ SE HEREDA Y QUÉ NO. La maqueta (tabla de 600px, estilos en línea,
 * cabecera negra, ficha de datos y pie) es la misma de `templates.ts` y la
 * misma paleta de `docs/BRANDING.md`, pero su `shell()` no está exportado y
 * `templates.ts` no es de esta pista: se reconstruye aquí, reducida a lo que un
 * correo de flujo necesita. Si algún día se exporta, este fichero lo importa y
 * se queda en los textos.
 *
 * QUÉ PONE ESTE MÓDULO Y QUÉ PONE OTRO:
 *  · El PIE DE BAJA lo pone esta plantilla, con el token del socio.
 *  · Las cabeceras `List-Unsubscribe` las pone `mailer.ts`. No se monta un
 *    segundo sistema de bajas.
 *  · El REMITENTE es el centro (RB-MARCA-001): el socio no compró Apta, compró
 *    su gimnasio.
 *  · El ENLACE DEL BOTÓN lo envuelve el motor (`click-tokens.ts`) para poder
 *    medir el clic. Es nuestro enlace, así que NO hace falta píxel de traza —y
 *    por eso no se miden aperturas en fase 1 (D-L3-4).
 *
 * E3 monta ENCIMA de esto: sus seis flujos de salida añaden aquí sus textos,
 * llamando a `renderFlowEmail`. No hace falta tocar el motor para añadir uno.
 */

const INK = "#1D1D1C";
const PAPER = "#F4F0E8";
const SAND = "#E7DFD2";
const LINEN = "#D8CCB8";
const MUTED = "#8A8574";
const TEXT2 = "#5B5748";
const FAINT = "#A8A296";
const FONT = "Poppins,Helvetica,Arial,sans-serif";

const DEFAULT_ADDRESS = process.env.EMAIL_POSTAL_ADDRESS || "Av. de Cataluña 42, 50014 Zaragoza";

export type FlowEmailRow = { label: string; value: string };

/** Los datos vienen de la base de datos: un apellido con `<` no rompe la maqueta. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function paragraph(html: string, first: boolean): string {
  return `<p style="font-family:${FONT};font-size:15px;line-height:1.7;color:${TEXT2};margin:${first ? "20px" : "14px"} 0 0;">${html}</p>`;
}

/** Texto llano → párrafos. El cuerpo lo escribe una persona en el editor, no HTML. */
export function paragraphsFrom(bodyText: string): string {
  const blocks = bodyText
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  if (blocks.length === 0) return "";
  return blocks.map((b, i) => paragraph(esc(b).replace(/\n/g, "<br>"), i === 0)).join("\n");
}

function link(path: string, label: string): string {
  return `<a href="${absoluteUrl(path)}" style="color:${TEXT2};text-decoration:underline;">${label}</a>`;
}

/**
 * Pie de un correo comercial. El enlace de baja NO es opcional aquí: sin token
 * el correo no se manda (`engine.ts` siempre lo trae), y esta función lo deja
 * dicho devolviendo solo Privacidad — que es lo que se vería si alguna vez
 * faltara, y se nota.
 */
function footerLinks(prefsToken: string | undefined): string {
  const privacy = link("/privacidad", "Privacidad");
  if (!prefsToken) return privacy;
  return `${link(`/preferencias/${prefsToken}`, "Preferencias de correo")} · ${link(`/baja/${prefsToken}`, "Darme de baja")} · ${privacy}`;
}

function rowHtml(row: FlowEmailRow, first: boolean): string {
  return `<tr><td style="padding:13px 20px;${first ? "" : `border-top:1px solid ${LINEN};`}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
<tr><td class="tzdl" align="left" style="font-family:${FONT};font-size:10px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:${MUTED};">${esc(row.label)}</td>
<td class="tzdv" align="right" style="font-family:${FONT};font-size:14px;font-weight:600;color:${INK};">${esc(row.value)}</td></tr>
</table>
</td></tr>`;
}

export type FlowEmailOptions = {
  memberFirstName: string;
  /** Nombre visible del remitente: el CENTRO, no la plataforma (RB-MARCA-001). */
  centerName: string;
  brandLogoUrl: string;
  /** Asunto, para la vista previa de la bandeja. */
  subject: string;
  /** Cuerpo en texto llano, con los párrafos separados por una línea en blanco. */
  bodyText: string;
  /** Rótulo del flujo, que se pinta arriba en pequeño. */
  eyebrow?: string;
  rows?: FlowEmailRow[];
  ctaLabel?: string;
  /** URL YA envuelta por el motor para poder medir el clic. */
  ctaUrl?: string;
  noteHtml?: string;
  postalAddress?: string;
  /** Token de preferencias del socio. Sin él no hay pie de baja: el motor siempre lo pasa. */
  prefsToken?: string;
  /**
   * Modo borrador: el correo va al buzón de pruebas y no al socio. La banda lo
   * dice en el propio cuerpo — un ensayo que se ve igual que el original acaba
   * reenviado a alguien creyendo que era el bueno.
   */
  testMode?: boolean;
  /** A quién habría ido de verdad. Solo se pinta en la banda de borrador. */
  testModeRecipient?: string | null;
};

/**
 * EL correo de flujo. Uno solo y parametrizado, en vez de una función por
 * flujo: los seis de salida (E3) cambian en el texto, no en la maqueta, y una
 * plantilla por flujo sería seis sitios donde olvidar el pie de baja.
 */
export function renderFlowEmail(opts: FlowEmailOptions): string {
  const rows = opts.rows ?? [];
  const rowsHtml = rows.length
    ? `<tr><td class="tzpad" style="padding:30px 40px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background:${SAND};border:1px solid ${LINEN};border-radius:14px;">
${rows.map((r, i) => rowHtml(r, i === 0)).join("\n")}
</table>
</td></tr>`
    : "";

  const ctaHtml =
    opts.ctaLabel && opts.ctaUrl
      ? `<tr><td class="tzpad" style="padding:30px 40px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
<tr><td align="center" bgcolor="${INK}" style="background:${INK};border-radius:10px;">
<a href="${opts.ctaUrl}" style="display:block;color:${PAPER};text-decoration:none;font-family:${FONT};font-weight:600;font-size:13px;text-transform:uppercase;letter-spacing:.1em;padding:18px 24px;mso-line-height-rule:exactly;line-height:16px;">${esc(opts.ctaLabel)}</a>
</td></tr>
</table>
</td></tr>`
      : "";

  const draftBanner = opts.testMode
    ? `<tr><td class="tzpad" style="padding:20px 40px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background:#FFF4D6;border:1px solid #E5C76B;border-radius:12px;">
<tr><td style="padding:14px 18px;font-family:${FONT};font-size:12.5px;line-height:1.6;color:#6B5310;">
<b>Flujo en borrador · esto es un ensayo.</b> Este correo NO ha llegado al socio: ha venido al buzón de pruebas del módulo de flujos.${
        opts.testModeRecipient ? ` De estar activo, habría ido a ${esc(opts.testModeRecipient)}.` : ""
      }
</td></tr>
</table>
</td></tr>`
    : "";

  const note =
    opts.noteHtml ??
    "Recibes este correo porque has aceptado las comunicaciones de tu centro. Puedes dejar de recibirlas cuando quieras desde el enlace de abajo, y seguirás recibiendo lo imprescindible: tus reservas, tus cobros y tu acceso.";

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(opts.centerName)}</title>
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
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;height:0;width:0;font-size:1px;line-height:1px;">${esc(opts.subject)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background:${SAND};">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;border-collapse:collapse;background:${PAPER};border-radius:18px;overflow:hidden;">

<tr><td class="tzhead" style="background:${INK};padding:26px 40px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
<tr>
<td align="left" style="width:60%;"><img src="${opts.brandLogoUrl}" alt="${esc(opts.centerName)}" width="155" height="26" style="height:26px;width:155px;display:block;border:0;"></td>
<td align="right" style="width:40%;font-family:${FONT};font-size:10px;font-weight:600;letter-spacing:.22em;text-transform:uppercase;color:${MUTED};">${esc(opts.centerName)}</td>
</tr>
</table>
</td></tr>

${draftBanner}

<tr><td class="tzpad" style="padding:44px 40px 0;">
<div style="font-family:${FONT};font-size:10px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:${MUTED};">${esc(opts.eyebrow ?? opts.centerName)}</div>
<h1 class="tztitle" style="font-family:${FONT};font-size:30px;font-weight:700;text-transform:uppercase;letter-spacing:-.015em;line-height:1.12;margin:12px 0 0;color:${INK};mso-line-height-rule:exactly;">¡Hola, ${esc(opts.memberFirstName)}!</h1>
${paragraphsFrom(opts.bodyText)}
</td></tr>

${rowsHtml}
${ctaHtml}

<tr><td class="tzpad" style="padding:26px 40px 0;">
<div style="border-top:1px solid ${LINEN};padding-top:18px;font-family:${FONT};font-size:12.5px;line-height:1.7;color:${MUTED};">${note}</div>
</td></tr>

<tr><td class="tzpad" style="padding:24px 40px 44px;">
<p style="font-family:${FONT};font-size:14px;line-height:1.7;color:${TEXT2};margin:0;">Nos vemos en el centro,<br><b style="color:${INK};">El equipo de ${esc(opts.centerName)}</b></p>
</td></tr>

<tr><td class="tzpad" align="center" style="background:${SAND};border-top:1px solid ${LINEN};padding:26px 40px;">
<div style="font-family:${FONT};font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:${TEXT2};">${esc(opts.centerName)}</div>
<div style="font-family:${FONT};font-size:12px;line-height:1.8;color:${MUTED};margin-top:6px;">${esc(opts.postalAddress ?? DEFAULT_ADDRESS)}</div>
<div style="font-family:${FONT};font-size:12px;line-height:1.8;color:${FAINT};margin-top:10px;">${footerLinks(opts.prefsToken)}</div>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

/**
 * Clave de plantilla, que se guarda en `FlowEmailLog.templateKey`. El correo
 * que escribe el editor a mano es `custom`; los seis de salida de E3 registran
 * aquí la suya para que el panel pueda decir con qué texto salió cada envío.
 */
export const FLOW_TEMPLATE_CUSTOM = "custom";
