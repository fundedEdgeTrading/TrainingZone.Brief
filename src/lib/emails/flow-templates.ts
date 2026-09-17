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

/* ========================================================================= *
 * E3 · LOS TEXTOS DE LOS FLUJOS DE SALIDA
 * ========================================================================= *
 *
 * Aquí viven los textos y NADA MÁS. La maqueta es la de arriba —una sola, para
 * que el pie de baja no se pueda olvidar en seis sitios— y las semillas
 * (`src/lib/flows/seeds/`) se limitan a referenciar la clave: el motor lee
 * `FlowStep.actionConfig`, así que al sembrar se copia de aquí el asunto, el
 * cuerpo y el botón.
 *
 * ---------------------------------------------------------------------------
 * CÓMO ESTÁN ESCRITOS, y por qué así
 * ---------------------------------------------------------------------------
 * Castellano de centro de entrenamiento, no de agencia. Sin «potencia tu
 * bienestar», sin exclamaciones de más y sin prometer nada que el centro no
 * pueda cumplir. Hablan de tú, dicen lo que pasa y para qué sirve, y cuando no
 * hay nada que pedir lo dicen también.
 *
 * ---------------------------------------------------------------------------
 * LO QUE UN TEXTO DE FLUJO **NO PUEDE** DECIR HOY · esto es un límite del motor
 * ---------------------------------------------------------------------------
 * El único dato del socio que la plantilla interpola es SU NOMBRE, que lo pone
 * `renderFlowEmail` en el encabezado. `FlowStep.actionConfig.bodyText` es texto
 * FIJO y `ctaPath` es una ruta FIJA: el motor no sustituye nada dentro.
 *
 * Consecuencia, dicha aquí y no descubierta depurando: ningún texto puede
 * llevar el horario del centro, el importe de la recompensa de referidos, los
 * días de gracia del impago ni un enlace firmado por socio. Por eso estos
 * textos NO dan ninguna de esas cifras y mandan al sitio donde el dato está de
 * verdad y al día (el portal del socio). NO SE INVENTA UN DATO QUE EL CENTRO NO
 * HA RELLENADO: se deja el hueco a la vista, y los huecos están declarados como
 * dato en cada semilla (`FlowSeed.gaps`), no escondidos en un comentario.
 */

/** Una plantilla de flujo: lo que se copia a `FlowStep.actionConfig` al sembrar. */
export type FlowSeedTemplate = {
  /** Va a `FlowEmailLog.templateKey`: es cómo el panel sabe con qué texto salió cada envío. */
  key: string;
  /** Cómo se llama este correo para quien mira el panel. */
  label: string;
  subject: string;
  /** Texto llano. Párrafos separados por una línea en blanco (`paragraphsFrom`). */
  bodyText: string;
  ctaLabel?: string;
  /**
   * Ruta interna FIJA. El motor la envuelve con el token de clic
   * (`click-tokens.ts`) para poder medir el clic sin píxel de traza.
   *
   * `{orgSlug}` y `{centerSlug}` los resuelve `seedFlows` AL SEMBRAR, no al
   * enviar: son del centro del flujo, no del socio, así que la ruta que se
   * guarda en la base de datos ya va entera y el motor sigue sin interpolar nada.
   */
  ctaPath?: string;
};

export const FLOW_SEED_TEMPLATES = {
  /* ---------------------------------------------------------------- 1 · BIENVENIDA */
  bienvenidaDia0: {
    key: "bienvenida-dia-0",
    label: "Bienvenida · día 0",
    subject: "Ya estás dentro: empezamos por aquí",
    bodyText: `Ya eres de casa, y nos alegra tenerte.

Antes de tu primera sesión necesitamos conocerte un poco: si arrastras alguna lesión, cómo estás ahora y qué quieres conseguir. Te llega en otro correo el formulario de alta: son cinco minutos y es lo que nos permite plantear tu entrenamiento en vez de improvisarlo el primer día.

Si prefieres contárnoslo en persona, dínoslo y lo rellenamos contigo en recepción. Lo que no queremos es empezar a ciegas.`,
    ctaLabel: "Entrar en mi portal",
    ctaPath: "/portal",
  },

  bienvenidaDia30: {
    key: "bienvenida-dia-30",
    label: "Bienvenida · día 30, revisión de objetivos",
    subject: "Un mes entrenando: ¿vamos por donde querías?",
    bodyText: `Hoy hace un mes que empezaste. Es buen momento para parar treinta segundos y mirar atrás: qué te está costando, qué ha cambiado y si el objetivo que te marcaste el primer día sigue siendo el mismo.

Si quieres que lo revisemos con calma, díselo a tu entrenador en la próxima sesión y sacamos diez minutos al final. Y si has cambiado de objetivo, mejor todavía: se ajusta la programación y listo.

Lo único que no queremos es que entrenes otro mes por inercia.`,
    ctaLabel: "Ver mi evolución",
    ctaPath: "/portal/evolucion",
  },

  /* -------------------------------------------------------- 2 · RAMA POR PRODUCTO */
  grupoReducido: {
    key: "producto-grupo-reducido",
    label: "Rama por producto · grupo reducido",
    subject: "Tus grupos reducidos: horarios y cómo funciona la sala",
    bodyText: `Entrenas en grupo reducido, así que van tres cosas prácticas y ya está.

Los horarios y las plazas que quedan los tienes en tu portal, al día. Desde ahí reservas y cancelas tú, sin tener que escribir a nadie.

La sala funciona mejor si llegas cinco minutos antes: se calienta en grupo y se empieza a la hora. Y si un día no vas a poder venir, cancela en cuanto lo sepas — esa plaza la está esperando alguien de la lista.

Lo demás te lo cuenta tu entrenador el primer día.`,
    ctaLabel: "Ver horarios y reservar",
    ctaPath: "/portal/agenda",
  },

  entrenamientoPersonal: {
    key: "producto-entrenamiento-personal",
    label: "Rama por producto · entrenamiento personal",
    subject: "Tu entrenamiento personal: cómo sacarle partido",
    bodyText: `Entrenas en personal, así que tu sesión es tuya: se planifica para ti y se ajusta cada semana según cómo vayas respondiendo.

Dos cosas marcan la diferencia. La primera, avisar cuanto antes si no vas a poder venir: tu hora es tuya y moverla con tiempo es fácil; con dos horas de margen, no.

La segunda, contarle a tu entrenador lo que pasa fuera de la sala. Si duermes mal, si vienes de una semana de viajes o si te molesta algo, la sesión se adapta — pero solo si lo sabe.

Tus sesiones y tus horas las tienes en el portal.`,
    ctaLabel: "Ver mis sesiones",
    ctaPath: "/portal/agenda",
  },

  /* ------------------------------------------------------------------ 3 · AUSENCIA */
  ausencia: {
    key: "ausencia-2-semanas",
    label: "Ausencia · 2 semanas sin venir",
    subject: "Hace un par de semanas que no te vemos",
    bodyText: `Llevas dos semanas sin pasarte y queríamos saber si va todo bien.

Si te has lesionado, si el horario ha dejado de encajarte o si simplemente se te ha ido de las manos, se arregla: hay más franjas de las que parece y cambiar de hora no cuesta nada.

Volver después de un parón cuesta más el primer día que los treinta siguientes. Coge una sesión esta semana, aunque sea suave, y el resto va solo.

Y si prefieres que te llamemos, contesta a este correo y te llamamos.`,
    ctaLabel: "Reservar mi vuelta",
    ctaPath: "/portal/agenda",
  },

  /* ------------------------------------------------------------ 4 · BONO ACABÁNDOSE */
  bonoAcabandose: {
    key: "bono-acabandose",
    label: "Bono acabándose · quedan 2 sesiones",
    subject: "Te quedan dos sesiones del bono",
    bodyText: `Un aviso sin prisa: te quedan dos sesiones del bono.

Te lo decimos ahora y no el día que se agote, para que no te quedes sin poder reservar a mitad de semana.

Si quieres seguir igual, el bono se renueva desde tu portal en un minuto. Y si te has quedado corto o largo, coméntaselo a tu entrenador: hay bonos de distinto tamaño y no tiene sentido pagar por sesiones que luego no usas.`,
    ctaLabel: "Renovar mi bono",
    ctaPath: "/portal/membresia",
  },

  /* -------------------------------------------------------------------- 5 · IMPAGO */
  impagoDia1: {
    key: "impago-dia-1",
    label: "Impago · día 1, enlace de pago",
    subject: "No nos ha entrado tu recibo",
    bodyText: `Tu último recibo no ha entrado. Casi siempre es una tarjeta caducada o un descubierto puntual, así que no te agobies: por un día no pasa nada.

Puedes ponerlo al día desde tu portal, en «Membresía»: ahí tienes el recibo pendiente y el botón para pagarlo. Si prefieres cambiar el método de pago o pagar en recepción, también vale — dínoslo y lo arreglamos.

Lo único que te pedimos es que no lo dejes correr. Pasado el periodo de gracia de tu centro el acceso se suspende solo, y eso no lo decide nadie del equipo.`,
    ctaLabel: "Ponerme al día",
    ctaPath: "/portal/membresia",
  },

  /* --------------------------------------------------------------- 6 · REACTIVACIÓN */
  reactivacionDia30: {
    key: "reactivacion-dia-30",
    label: "Reactivación · 30 días desde la baja",
    subject: "Un mes fuera: ¿lo dejamos aquí?",
    bodyText: `Hace un mes que te diste de baja y no te hemos escrito hasta hoy a propósito: un mes es el tiempo justo para saber si echas de menos entrenar o si de verdad te venía mal.

Si es lo segundo, perfecto, y gracias por el tiempo que estuviste con nosotros.

Si es lo primero, la puerta está donde la dejaste. Cuéntanos qué fue lo que no te encajó —el horario, el precio, la distancia— y miramos si hay una forma de que sí. No hace falta que contestes a nada: si un día te apetece volver a pasarte, pásate.`,
    ctaLabel: "Ver cómo volver",
    ctaPath: "{membershipPath}",
  },

  /* ------------------------------------------------------ 7 · REFERIDOS (la de R1) */
  referidos90Dias: {
    key: "referidos-90-dias",
    label: "Referidos · 90 días desde el alta",
    subject: "¿Conoces a alguien que lleve tiempo diciendo que tiene que empezar?",
    bodyText: `Llevas tres meses entrenando aquí y, por lo que nos cuentas, la cosa va bien. Así que va una petición, sin ningún compromiso.

Si conoces a alguien que lleve tiempo diciendo que tiene que empezar, pásale tu enlace de recomendación: lo tienes en recepción y en tu ficha, y tu centro tiene puesto qué se lleva cada uno.

Y si ahora mismo no se te ocurre nadie, no pasa absolutamente nada. Seguimos igual el lunes.`,
    ctaLabel: "Entrar en mi portal",
    ctaPath: "/portal",
  },
} as const satisfies Record<string, FlowSeedTemplate>;

export type FlowSeedTemplateName = keyof typeof FLOW_SEED_TEMPLATES;

/** Rótulo de cada plantilla por su clave, para el panel por flujo. */
export const FLOW_TEMPLATE_LABEL: Record<string, string> = {
  [FLOW_TEMPLATE_CUSTOM]: "Texto escrito a mano en el editor",
  ...Object.fromEntries(Object.values(FLOW_SEED_TEMPLATES).map((t) => [t.key, t.label])),
};
