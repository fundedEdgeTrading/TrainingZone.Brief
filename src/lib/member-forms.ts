/**
 * M5 · El formulario que rellena el cliente, mandado a quien todavía no tiene
 * cuenta en el portal (E14-18, E14-19, E14-20).
 *
 * **Esto no es un formulario nuevo.** El cuestionario ya existía entero:
 * `Assessment.answers` es Json, `Assessment.memberPartAt` es literalmente
 * «cuándo el socio rellenó SU parte», `AssessmentCustomQuestion` /
 * `AssessmentQuestionToggle` permiten que cada centro añada y apague preguntas
 * sin desplegar, y los consentimientos tienen sus campos en `Member` con fecha y
 * versión. Lo que faltaba era el ENVÍO: un enlace, con token, para alguien que
 * todavía no puede iniciar sesión. Por eso este módulo escribe donde ya se
 * escribía y no crea ninguna tabla paralela de respuestas.
 *
 * Tres cosas que se deciden aquí y no en la pantalla:
 *
 * 1. **El token no habla.** Es aleatorio y opaco (mismo patrón que
 *    `invitations.ts`): no lleva dentro quién es el socio, no viaja ningún id
 *    de socio ni de valoración en la URL, y no hay un solo dato de salud en un
 *    enlace que acaba en el historial del navegador. La página que lo sirve va
 *    con `noindex`/`no-referrer` (`tokenPageMetadata`).
 *
 * 2. **Un solo uso, y repetible.** `Invitation` no valía —su `memberId` es
 *    `@unique`, una invitación por socio en toda su vida— y el formulario se
 *    manda al alta, a los seis meses y en la revisión anual. Cada envío revoca
 *    el anterior del mismo hito: si recepción reenvía el enlace porque el
 *    primero se perdió, solo uno queda vivo.
 *
 * 3. **Lo que llega no es un dato verificado.** No cierra la valoración, no
 *    propaga nada al Semáforo de Aptitud y no toca `HealthRecord`: deja tarea al
 *    entrenador para repasarlo con el socio delante, que es como funciona hoy
 *    (F3 §4.2).
 */

import crypto from "crypto";
import type { AssessmentKind, Prisma, Sex } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { absoluteUrl, publicOrigin } from "@/lib/site";
import { sendMail } from "@/lib/mailer";
import { renderMemberFormInviteEmail } from "@/lib/emails/templates";
import { createNotificationOnce } from "@/lib/notifications";
import {
  CONSENT_VERSION,
  LEAD_CONSENT_VERSION,
  type ConsentKind,
} from "@/lib/consent";
import {
  ADULT_AGE,
  evaluateAgeAdmission,
  type AgePolicy,
} from "@/lib/minors";
import { getAssessmentConfig, getAssessmentMilestones } from "@/lib/assessments/queries";
import { milestoneKeyOf, type AssessmentMilestoneDef } from "@/lib/assessments/config";
import { writeMemberPart } from "@/lib/assessments/member-part";
import { memberPartSchemaFor, type MemberPartAnswers } from "@/lib/assessments/schemas";

// ---------------------------------------------------------------------------
// Token y enlace
// ---------------------------------------------------------------------------

/**
 * Catorce días, no siete como una invitación de cuenta.
 *
 * Una invitación se contesta el mismo día —es la contraseña con la que se
 * entra—; este formulario se manda con la primera cita por delante, y una
 * semana deja fuera al que lo recibe un viernes y viene el lunes de la semana
 * siguiente. Caduca igualmente: un enlace que abre un formulario de salud no
 * puede vivir para siempre en una bandeja de entrada.
 */
export const MEMBER_FORM_TTL_DAYS = 14;

export const MEMBER_FORM_PUBLIC_PATH = "/formulario";

export function generateMemberFormToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function memberFormExpiry(now: Date = new Date()) {
  return new Date(now.getTime() + MEMBER_FORM_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export function memberFormUrlFor(token: string) {
  return `${publicOrigin()}${MEMBER_FORM_PUBLIC_PATH}/${token}`;
}

// ---------------------------------------------------------------------------
// Estado del formulario en la ficha (E14-20) y la pregunta que necesita E3
// ---------------------------------------------------------------------------

/**
 * Los cinco estados que se ven en la ficha. `ABIERTO` no estaba en la historia
 * —pide «enviado, pendiente o relleno»— pero sale gratis de `openedAt` y es la
 * diferencia entre «no le ha llegado» y «lo abrió y lo dejó a medias», que es
 * lo que decide si la siguiente llamada es para reenviar o para acompañar.
 */
export type MemberFormState = "NO_ENVIADO" | "ENVIADO" | "ABIERTO" | "RELLENO" | "CADUCADO";

export type MemberFormStatus = {
  state: MemberFormState;
  inviteId: string | null;
  sentAt: Date | null;
  openedAt: Date | null;
  completedAt: Date | null;
  expiresAt: Date | null;
  assessmentId: string | null;
};

const NO_FORM: MemberFormStatus = {
  state: "NO_ENVIADO",
  inviteId: null,
  sentAt: null,
  openedAt: null,
  completedAt: null,
  expiresAt: null,
  assessmentId: null,
};

/** Lo mínimo de un envío para poder decir en qué estado está. */
export type MemberFormInviteState = {
  id: string;
  sentAt: Date;
  openedAt: Date | null;
  completedAt: Date | null;
  expiresAt: Date;
  revokedAt: Date | null;
  assessmentId: string | null;
};

/**
 * Estado de un envío concreto. Función pura: es la que se prueba sin base de
 * datos y la única que decide qué significa cada marca de tiempo.
 */
export function memberFormStateOf(invite: MemberFormInviteState, now: Date = new Date()): MemberFormState {
  // Relleno gana a todo lo demás: que el enlace caducara DESPUÉS de contestar
  // no deshace lo contestado.
  if (invite.completedAt) return "RELLENO";
  if (invite.revokedAt) return "CADUCADO";
  if (invite.expiresAt <= now) return "CADUCADO";
  return invite.openedAt ? "ABIERTO" : "ENVIADO";
}

export function memberFormStatusOf(
  invite: MemberFormInviteState | null,
  now: Date = new Date()
): MemberFormStatus {
  if (!invite) return NO_FORM;
  return {
    state: memberFormStateOf(invite, now),
    inviteId: invite.id,
    sentAt: invite.sentAt,
    openedAt: invite.openedAt,
    completedAt: invite.completedAt,
    expiresAt: invite.expiresAt,
    assessmentId: invite.assessmentId,
  };
}

const INVITE_STATE_SELECT = {
  id: true,
  sentAt: true,
  openedAt: true,
  completedAt: true,
  expiresAt: true,
  revokedAt: true,
  assessmentId: true,
} as const;

/** A quién se le manda: a un socio o a alguien que todavía es un lead. */
export type MemberFormTarget = { kind: "member"; memberId: string } | { kind: "lead"; leadId: string };

function targetWhere(target: MemberFormTarget): Prisma.MemberFormInviteWhereInput {
  return target.kind === "member" ? { memberId: target.memberId } : { leadId: target.leadId };
}

/**
 * Último envío a esta persona, con su estado. Es lo que pinta la ficha: el
 * histórico completo no le interesa a nadie, lo que se pregunta es «¿tiene uno
 * vivo, lo rellenó, o hay que mandarlo?».
 */
export async function getMemberFormStatus(
  orgId: string,
  target: MemberFormTarget,
  now: Date = new Date()
): Promise<MemberFormStatus> {
  // El más reciente RELLENO manda sobre un envío posterior sin contestar solo
  // si es el último; si recepción mandó la revisión de los seis meses, lo que
  // interesa es esa, no la inicial que se contestó en marzo.
  const invite = await prisma.memberFormInvite.findFirst({
    where: { orgId, ...targetWhere(target) },
    orderBy: { sentAt: "desc" },
    select: INVITE_STATE_SELECT,
  });
  return memberFormStatusOf(invite, now);
}

/**
 * **La pregunta del flujo 1 de E3**: «¿lo rellenó?», a los dos días.
 *
 * Vive aquí y no como consulta suelta en el motor de flujos a propósito: si E3
 * la reinventara, tendría que volver a decidir qué cuenta como relleno (un
 * envío revocado, uno caducado, uno anterior), y esa decisión ya está tomada en
 * `memberFormStateOf`.
 *
 * `since` acota a los envíos posteriores a una fecha —normalmente el alta del
 * socio— para que un formulario contestado hace dos años no dé por respondida
 * la bienvenida de esta semana.
 */
export async function hasFilledMemberForm(
  orgId: string,
  target: MemberFormTarget,
  opts: { since?: Date } = {}
): Promise<boolean> {
  const count = await prisma.memberFormInvite.count({
    where: {
      orgId,
      ...targetWhere(target),
      completedAt: opts.since ? { gte: opts.since } : { not: null },
    },
  });
  return count > 0;
}

/**
 * Envíos que llevan `days` días sin contestar y siguen vivos. Es la otra mitad
 * de la pregunta de E3: a quién hay que levantarle la tarea al entrenador.
 */
export async function listUnfilledMemberFormInvites(params: {
  orgId: string;
  days: number;
  centerIds?: string[];
  now?: Date;
}) {
  const now = params.now ?? new Date();
  const sentBefore = new Date(now.getTime() - params.days * 24 * 60 * 60 * 1000);
  return prisma.memberFormInvite.findMany({
    where: {
      orgId: params.orgId,
      ...(params.centerIds ? { centerId: { in: params.centerIds } } : {}),
      completedAt: null,
      revokedAt: null,
      expiresAt: { gt: now },
      sentAt: { lte: sentBefore },
    },
    orderBy: { sentAt: "asc" },
    select: {
      ...INVITE_STATE_SELECT,
      centerId: true,
      memberId: true,
      leadId: true,
      kind: true,
      milestoneKey: true,
    },
  });
}

// ---------------------------------------------------------------------------
// Envío (E14-18)
// ---------------------------------------------------------------------------

export type SendMemberFormResult =
  | { ok: true; inviteId: string; url: string; expiresAt: Date; emailed: boolean }
  | { ok: false; error: string };

type TargetRow = {
  centerId: string;
  firstName: string;
  email: string | null;
  centerName: string;
  centerAddress: string | null;
};

async function loadTarget(orgId: string, target: MemberFormTarget): Promise<TargetRow | null> {
  if (target.kind === "member") {
    const member = await prisma.member.findFirst({
      where: { id: target.memberId, orgId },
      select: {
        firstName: true,
        email: true,
        primaryCenterId: true,
        primaryCenter: { select: { name: true, address: true } },
      },
    });
    if (!member) return null;
    return {
      centerId: member.primaryCenterId,
      firstName: member.firstName,
      email: member.email?.trim() || null,
      centerName: member.primaryCenter.name,
      centerAddress: member.primaryCenter.address,
    };
  }
  const lead = await prisma.lead.findFirst({
    where: { id: target.leadId, orgId },
    select: { firstName: true, email: true, centerId: true, center: { select: { name: true, address: true } } },
  });
  if (!lead) return null;
  return {
    centerId: lead.centerId,
    firstName: lead.firstName,
    email: lead.email?.trim() || null,
    centerName: lead.center.name,
    centerAddress: lead.center.address,
  };
}

/**
 * Manda el formulario. Devuelve además la URL para poder copiarla: el correo
 * puede rebotar o caer en spam, y recepción tiene al cliente delante.
 *
 * El ámbito de centro NO se comprueba aquí sino en quien llama (la acción de
 * servidor, con la sesión delante): este módulo no conoce al actor, y meterle
 * una comprobación a medias sería peor que no tenerla.
 */
export async function sendMemberForm(params: {
  orgId: string;
  target: MemberFormTarget;
  /** Hito que se le pide. Por defecto la inicial, que es el caso del alta. */
  milestoneKey?: string;
  sentByUserId: string | null;
  now?: Date;
}): Promise<SendMemberFormResult> {
  const now = params.now ?? new Date();
  const target = await loadTarget(params.orgId, params.target);
  if (!target) return { ok: false, error: "No se ha encontrado a esa persona." };
  if (!target.email) {
    return { ok: false, error: "No hay email al que mandarlo. Añádelo en la ficha y vuelve a intentarlo." };
  }

  const milestones = await getAssessmentMilestones(params.orgId);
  const milestoneKey = params.milestoneKey ?? "INITIAL";
  const milestone = milestones.find((m) => m.key === milestoneKey);
  if (!milestone) return { ok: false, error: "Ese hito ya no existe en la configuración del centro." };
  // Un lead todavía no tiene valoraciones: el único hito que se le puede pedir
  // es la inicial, y aun así lo que rellena aterriza en su ficha de lead.
  if (params.target.kind === "lead" && milestone.key !== "INITIAL") {
    return { ok: false, error: "A un lead solo se le puede mandar el formulario de alta." };
  }

  if (params.target.kind === "member") {
    const blocked = await completedAssessmentFor(params.orgId, params.target.memberId, milestone);
    if (blocked) return { ok: false, error: "Ese hito ya tiene una valoración cerrada por el entrenador." };
  }

  const org = await prisma.organization.findUnique({
    where: { id: params.orgId },
    select: { name: true, logoUrl: true },
  });

  const token = generateMemberFormToken();
  const expiresAt = memberFormExpiry(now);

  const invite = await prisma.$transaction(async (tx) => {
    // Un enlace vivo por persona y hito: reenviar caduca el anterior en vez de
    // dejar dos puertas abiertas al mismo formulario.
    await tx.memberFormInvite.updateMany({
      where: {
        orgId: params.orgId,
        ...targetWhere(params.target),
        kind: milestone.kind,
        milestoneKey: milestone.standard ? null : milestone.key,
        completedAt: null,
        revokedAt: null,
      },
      data: { revokedAt: now },
    });

    return tx.memberFormInvite.create({
      data: {
        orgId: params.orgId,
        centerId: target.centerId,
        ...(params.target.kind === "member"
          ? { memberId: params.target.memberId }
          : { leadId: params.target.leadId }),
        kind: milestone.kind,
        milestoneKey: milestone.standard ? null : milestone.key,
        token,
        expiresAt,
        sentAt: now,
        sentByUserId: params.sentByUserId,
      },
      select: { id: true },
    });
  });

  const brandName = org?.name ?? target.centerName;
  // Fire-and-forget, como el resto de transaccionales: un proveedor de correo
  // lento no puede dejar colgada la pantalla de recepción con el cliente
  // delante. El enlace se devuelve igualmente para poder copiarlo.
  void sendMail({
    to: target.email,
    fromName: brandName,
    subject: `${milestone.label} · ${brandName}`,
    html: renderMemberFormInviteEmail({
      firstName: target.firstName,
      brandName,
      brandLogoUrl: absoluteUrl(org?.logoUrl || "/brand/tz-logo-white.png"),
      formLabel: milestone.label,
      formUrl: memberFormUrlFor(token),
      expiresAt,
      centerName: target.centerName,
      postalAddress: target.centerAddress ?? undefined,
    }),
  });

  return { ok: true, inviteId: invite.id, url: memberFormUrlFor(token), expiresAt, emailed: true };
}

/** ¿Hay ya una valoración CERRADA de este hito? Entonces no hay nada que pedir. */
async function completedAssessmentFor(orgId: string, memberId: string, milestone: AssessmentMilestoneDef) {
  const rows = await prisma.assessment.findMany({
    where: { orgId, memberId },
    select: { id: true, kind: true, milestoneKey: true, completedAt: true, memberPartAt: true },
  });
  return rows.find((a) => milestoneKeyOf(a) === milestone.key && a.completedAt) ?? null;
}

// ---------------------------------------------------------------------------
// Apertura del enlace (E14-19)
// ---------------------------------------------------------------------------

export type MemberFormInvalidReason = "notfound" | "used" | "expired" | "revoked";

export const MEMBER_FORM_INVALID_MESSAGE: Record<MemberFormInvalidReason, string> = {
  notfound: "Este enlace no es válido.",
  used: "Este formulario ya está relleno. Gracias — lo tenemos en tu ficha.",
  expired: `Este enlace ha caducado (duran ${MEMBER_FORM_TTL_DAYS} días). Pide en el centro que te lo reenvíen.`,
  revoked: "Este enlace ya no sirve: se ha enviado uno nuevo. Busca el último correo del centro.",
};

/**
 * Qué consentimientos hay que pedir en ESTE formulario.
 *
 * El de salud se pide siempre: es la base del art. 9.2.a de lo que se contesta
 * aquí, y volver a pedirlo no cuesta nada mientras que darlo por hecho sí. Los
 * tres accesorios solo se enseñan si no constan ya: un formulario que los pinta
 * sin marcar cuando el socio ya dijo que sí parece estar retirándoselos, y este
 * formulario **nunca retira un consentimiento** — para eso está `/preferencias`
 * y el panel de la ficha (E12-12).
 */
export type MemberFormConsentAsk = { kind: ConsentKind; required: boolean };

export type MemberFormContext = {
  token: string;
  orgName: string;
  orgLogoUrl: string | null;
  centerName: string;
  firstName: string;
  /** `INITIAL` o una revisión: decide qué preguntas se hacen. */
  kind: AssessmentKind;
  formLabel: string;
  expiresAt: Date;
  targetKind: MemberFormTarget["kind"];
  /** Preguntas apagadas por el centro y preguntas propias (F-VAL). */
  disabledQuestions: string[];
  customQuestions: { key: string; label: string; type: string; required: boolean }[];
  /** Ya la tenemos en la ficha: no se vuelve a pedir. */
  birthDate: string | null;
  agePolicy: AgePolicy;
  consents: MemberFormConsentAsk[];
};

export type ResolveMemberFormResult =
  | { ok: true; context: MemberFormContext }
  | { ok: false; reason: MemberFormInvalidReason };

/**
 * Contexto de la página pública. Devuelve **el nombre de pila y nada más** de
 * quien lo rellena: ni apellidos, ni email, ni un solo dato de salud. Quien
 * intercepte el enlace ve un formulario en blanco con un «hola, Marta», que es
 * exactamente lo que ve quien pasa por delante de un mostrador.
 */
export async function resolveMemberFormInvite(token: string): Promise<ResolveMemberFormResult> {
  const invite = await prisma.memberFormInvite.findUnique({
    where: { token },
    select: {
      id: true,
      orgId: true,
      kind: true,
      milestoneKey: true,
      expiresAt: true,
      completedAt: true,
      revokedAt: true,
      memberId: true,
      leadId: true,
      center: { select: { name: true } },
      organization: { select: { name: true, logoUrl: true, allowsMinors: true, minimumAgeYears: true } },
      member: {
        select: {
          firstName: true,
          birthDate: true,
          consentHealth: true,
          consentImages: true,
          consentMarketing: true,
          consentAI: true,
        },
      },
      lead: { select: { firstName: true, birthDate: true } },
    },
  });

  if (!invite) return { ok: false, reason: "notfound" };
  if (invite.completedAt) return { ok: false, reason: "used" };
  if (invite.revokedAt) return { ok: false, reason: "revoked" };
  if (invite.expiresAt <= new Date()) return { ok: false, reason: "expired" };

  const person = invite.member ?? invite.lead;
  if (!person) return { ok: false, reason: "notfound" };

  const [milestones, config] = await Promise.all([
    getAssessmentMilestones(invite.orgId),
    getAssessmentConfig(invite.orgId),
  ]);
  const key = invite.milestoneKey ?? invite.kind;
  const milestone = milestones.find((m) => m.key === key);

  // Solo la primera vez: `openedAt` responde «le llegó y lo abrió», no «lo
  // volvió a mirar». Sin `await` no vale —la página se renderiza en el
  // servidor— pero tampoco puede tumbar la página si falla.
  await prisma.memberFormInvite
    .updateMany({ where: { id: invite.id, openedAt: null }, data: { openedAt: new Date() } })
    .catch(() => undefined);

  return {
    ok: true,
    context: {
      token,
      orgName: invite.organization.name,
      orgLogoUrl: invite.organization.logoUrl,
      centerName: invite.center.name,
      firstName: person.firstName,
      kind: invite.kind,
      formLabel: milestone?.label ?? "Formulario de alta",
      expiresAt: invite.expiresAt,
      targetKind: invite.memberId ? "member" : "lead",
      disabledQuestions: config.disabledQuestions,
      customQuestions: config.customQuestions
        .filter((q) => q.active && (q.scope === "ALL" || q.scope === (invite.kind === "INITIAL" ? "INITIAL" : "REVIEW")))
        .map((q) => ({ key: q.key, label: q.label, type: q.type, required: q.required })),
      birthDate: person.birthDate ? person.birthDate.toISOString().slice(0, 10) : null,
      agePolicy: {
        allowsMinors: invite.organization.allowsMinors,
        minimumAgeYears: invite.organization.minimumAgeYears,
      },
      consents: consentsToAsk(invite.member),
    },
  };
}

function consentsToAsk(
  member: { consentHealth: boolean; consentImages: boolean; consentMarketing: boolean; consentAI: boolean } | null
): MemberFormConsentAsk[] {
  const asks: MemberFormConsentAsk[] = [{ kind: "health", required: true }];
  // Un lead no tiene fila de `Member` donde mirar qué firmó: se le preguntan
  // los tres, y lo que conteste queda en `AuditLog` hasta que el alta los
  // traslade a su ficha.
  if (!member || !member.consentImages) asks.push({ kind: "images", required: false });
  if (!member || !member.consentAI) asks.push({ kind: "ai", required: false });
  if (!member || !member.consentMarketing) asks.push({ kind: "marketing", required: false });
  return asks;
}

// ---------------------------------------------------------------------------
// Entrega (E14-19 y E14-20)
// ---------------------------------------------------------------------------

/** Lo que el tutor declara cuando quien rellena es menor (E10-12, art. 7.2 LOPDGDD). */
export type GuardianDeclaration = {
  name: string;
  email: string;
  phone: string;
  idDocument: string;
  /** Casilla explícita: «declaro ser el tutor legal y consentir en su nombre». */
  declared: boolean;
};

export type MemberFormSubmission = {
  token: string;
  answers: unknown;
  /** `yyyy-mm-dd`. Obligatoria si no constaba ya en la ficha (E10-12). */
  birthDate?: string | null;
  sex?: Sex | null;
  /**
   * Profesión (`Member.occupation` / `Lead.occupation`). Es parte de la
   * valoración inicial —condiciona horarios, sedentarismo y cargas— pero no
   * vive en `answers`: ya tiene columna en la ficha, que es donde se lee.
   */
  occupation?: string | null;
  consents: Partial<Record<ConsentKind, boolean>>;
  guardian?: GuardianDeclaration | null;
  now?: Date;
};

export type SubmitMemberFormResult = { ok: true } | { ok: false; error: string };

const HEALTH_CONSENT_REQUIRED =
  "Para poder tratar lo que cuentas aquí necesitamos tu consentimiento expreso de datos de salud. " +
  "Si prefieres no darlo, no pasa nada: lo vemos en el centro con tu entrenador delante.";

export async function submitMemberForm(input: MemberFormSubmission): Promise<SubmitMemberFormResult> {
  const now = input.now ?? new Date();

  const invite = await prisma.memberFormInvite.findUnique({
    where: { token: input.token },
    select: {
      id: true,
      orgId: true,
      centerId: true,
      kind: true,
      milestoneKey: true,
      expiresAt: true,
      completedAt: true,
      revokedAt: true,
      sentByUserId: true,
      memberId: true,
      leadId: true,
      organization: { select: { allowsMinors: true, minimumAgeYears: true } },
      member: {
        select: { id: true, firstName: true, lastName: true, birthDate: true, consentHealth: true, occupation: true },
      },
      lead: { select: { id: true, firstName: true, lastName: true, birthDate: true, goals: true, occupation: true } },
    },
  });

  if (!invite) return { ok: false, error: MEMBER_FORM_INVALID_MESSAGE.notfound };
  if (invite.completedAt) return { ok: false, error: MEMBER_FORM_INVALID_MESSAGE.used };
  if (invite.revokedAt) return { ok: false, error: MEMBER_FORM_INVALID_MESSAGE.revoked };
  if (invite.expiresAt <= now) return { ok: false, error: MEMBER_FORM_INVALID_MESSAGE.expired };

  // E10-01/E10-03 · el consentimiento de salud es del art. 9.2.a: explícito,
  // separado y nunca premarcado. Sin él no se guarda NADA de lo contestado —
  // todo el cuestionario (peso, dolor, ejercicios que no tolera) es dato del
  // art. 9, y quedarse con «solo la parte inofensiva» sería tratar igualmente
  // lo que no se ha consentido.
  if (!input.consents.health) return { ok: false, error: HEALTH_CONSENT_REQUIRED };

  const declaredBirthDate = parseIsoDate(input.birthDate);
  const existingBirthDate = invite.member?.birthDate ?? invite.lead?.birthDate ?? null;
  const birthDate = declaredBirthDate ?? existingBirthDate;

  // E10-12 · el control de edad es el mismo que el del alta en recepción y el
  // del formulario público: una sola función pura (`minors.ts`), nunca una
  // copia «espejo».
  const admission = evaluateAgeAdmission({
    birthDate,
    policy: {
      allowsMinors: invite.organization.allowsMinors,
      minimumAgeYears: invite.organization.minimumAgeYears,
    },
    guardian: guardianFor(input.guardian, now),
    now,
  });

  if (!admission.ok) {
    // Un menor admitido cuyo tutor todavía no ha declarado nada no es un
    // error: es el paso siguiente del formulario, y la pantalla ya lo pinta.
    return { ok: false, error: admission.message };
  }

  // Un lead no tiene dónde guardar de forma verificable el consentimiento del
  // tutor (`Member.guardian*` no existe en `Lead`), así que un menor no
  // completa este formulario por internet: se hace en el centro, con el tutor
  // delante. Mismo criterio que el formulario público de captación, donde
  // tampoco se capta dato de salud de un menor.
  if (admission.minor && invite.leadId) {
    return {
      ok: false,
      error:
        `Como ${invite.lead?.firstName ?? "quien rellena esto"} es menor de ${ADULT_AGE} años, esta parte se ` +
        "completa en el centro con su madre, padre o tutor delante. Llámanos y lo vemos allí.",
    };
  }

  const target: InviteRow = {
    id: invite.id,
    orgId: invite.orgId,
    centerId: invite.centerId,
    kind: invite.kind,
    milestoneKey: invite.milestoneKey,
    sentByUserId: invite.sentByUserId,
  };

  if (invite.memberId && invite.member) {
    const config = await getAssessmentConfig(invite.orgId);
    return submitForMember({
      invite: target,
      member: invite.member,
      input,
      birthDate,
      minor: admission.minor,
      config,
      now,
    });
  }
  if (invite.leadId && invite.lead) {
    return submitForLead({
      invite: target,
      leadId: invite.leadId,
      leadOccupation: invite.lead.occupation,
      input,
      birthDate,
      now,
    });
  }
  return { ok: false, error: MEMBER_FORM_INVALID_MESSAGE.notfound };
}

function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  // Medianoche UTC, como `Lead.birthDate` y `Member.birthDate`: `minors.ts` lee
  // la fecha con getters UTC y mezclando convenciones se pierde un año.
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function guardianFor(guardian: GuardianDeclaration | null | undefined, now: Date) {
  if (!guardian || !guardian.declared) return null;
  return {
    name: guardian.name,
    email: guardian.email,
    idDocument: guardian.idDocument,
    consentAt: now,
    // El justificante del art. 7.2 es la traza de ESTE formulario: un enlace de
    // un solo uso, mandado por el centro a la dirección que tiene en ficha, con
    // la declaración expresa del tutor y su documento de identificación. Se
    // escribe en claro para que quien audite no tenga que reconstruirlo.
    evidence: `Declaración del tutor en formulario a distancia · ${now.toISOString()}`,
  };
}

// ---------------------------------------------------------------------------

type InviteRow = {
  id: string;
  orgId: string;
  centerId: string;
  kind: AssessmentKind;
  milestoneKey: string | null;
  sentByUserId: string | null;
};

type SubmitContext = {
  invite: InviteRow;
  input: MemberFormSubmission;
  birthDate: Date | null;
  now: Date;
};

async function submitForMember(
  ctx: SubmitContext & {
    member: {
      id: string;
      firstName: string;
      lastName: string;
      birthDate: Date | null;
      consentHealth: boolean;
      occupation: string | null;
    };
    minor: boolean;
    config: Awaited<ReturnType<typeof getAssessmentConfig>>;
  }
): Promise<SubmitMemberFormResult> {
  const { invite, member, input, now } = ctx;

  const parsed = memberPartSchemaFor(invite.kind, ctx.config).safeParse(input.answers);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: first?.message ?? "Revisa las respuestas del formulario." };
  }
  const answers = parsed.data as MemberPartAnswers;

  const milestones = await getAssessmentMilestones(invite.orgId);
  const milestone = milestones.find((m) => m.key === (invite.milestoneKey ?? invite.kind));
  if (!milestone) return { ok: false, error: "Este formulario ya no corresponde a ningún hito del centro." };

  const assessments = await prisma.assessment.findMany({
    where: { orgId: invite.orgId, memberId: member.id },
    select: { id: true, kind: true, milestoneKey: true, completedAt: true, memberPartAt: true, dueDate: true },
  });
  const sameMilestone = assessments.filter((a) => milestoneKeyOf(a) === milestone.key);

  if (sameMilestone.some((a) => a.completedAt)) {
    // El entrenador la cerró entre el envío y la respuesta. No se pisa lo que
    // firmó con el socio delante: el enlace se apaga y se explica por qué.
    await prisma.memberFormInvite.update({ where: { id: invite.id }, data: { revokedAt: now } });
    return {
      ok: false,
      error: "Tu entrenador ya cerró esta valoración contigo. No hace falta que la rellenes otra vez.",
    };
  }

  const pending = sameMilestone.find((a) => !a.completedAt);

  await prisma.$transaction(async (tx) => {
    const assessmentId =
      pending?.id ??
      (
        await tx.assessment.create({
          data: {
            orgId: invite.orgId,
            memberId: member.id,
            kind: milestone.kind,
            milestoneKey: milestone.standard ? null : milestone.key,
            dueDate: now,
            answers: {},
          },
          select: { id: true },
        })
      ).id;

    await writeMemberPart(tx, { assessmentId, memberId: member.id, answers, now });

    await tx.member.update({
      where: { id: member.id },
      data: {
        // Solo lo que faltaba: un formulario no pisa lo que ya hay en la ficha.
        ...(member.birthDate == null && ctx.birthDate ? { birthDate: ctx.birthDate } : {}),
        ...occupationPatch(member.occupation, input.occupation),
        ...consentPatch(input.consents, now),
        // La versión del texto que la persona tenía delante al aceptar. Es lo
        // que decide si algún día hay que volver a pedírselo (`needsReconsent`).
        consentVersion: CONSENT_VERSION,
        ...(ctx.minor && input.guardian?.declared
          ? {
              guardianName: input.guardian.name.trim(),
              guardianEmail: input.guardian.email.trim() || null,
              guardianPhone: input.guardian.phone.trim() || null,
              guardianIdDocument: input.guardian.idDocument.trim(),
              guardianConsentAt: now,
              guardianEvidence: guardianFor(input.guardian, now)!.evidence,
            }
          : {}),
      },
    });

    await tx.memberFormInvite.update({
      where: { id: invite.id },
      data: { completedAt: now, assessmentId },
    });

    // Art. 7.1: hay que poder demostrar qué se preguntó, qué se contestó y con
    // qué texto. Consta también el «no», que es lo que evita volver a
    // preguntar por defecto.
    await tx.auditLog.create({
      data: {
        orgId: invite.orgId,
        actorUserId: null, // lo firma la propia persona, no un usuario de la app
        action: "MEMBER_FORM_CONSENTS_RECORDED",
        entityType: "MemberFormInvite",
        entityId: invite.id,
        memberId: member.id,
        metadata: {
          consentVersion: CONSENT_VERSION,
          health: input.consents.health === true,
          images: input.consents.images === true,
          ai: input.consents.ai === true,
          marketing: input.consents.marketing === true,
          guardianConsent: ctx.minor ? input.guardian?.declared === true : null,
        },
      },
    });
  });

  await leaveReviewTask({
    orgId: invite.orgId,
    centerId: invite.centerId,
    sentByUserId: invite.sentByUserId,
    inviteId: invite.id,
    title: `Repasar el formulario de ${member.firstName} ${member.lastName}`.trim(),
    body:
      `${member.firstName} ha rellenado «${milestone.label}» desde casa. Lo contestado NO es un dato verificado: ` +
      "repásalo con el socio delante antes de cerrar la valoración (F3 §4.2). El screening, el PAR-Q y las marcas siguen siendo tuyos.",
    entityId: member.id,
    entityType: "Member",
  });

  return { ok: true };
}

/**
 * Un lead todavía no tiene ficha de socio, así que no tiene `Assessment` donde
 * caer: `Assessment.memberId` es obligatorio y el esquema está congelado. Lo
 * que sí tiene es su propia ficha, y ahí es donde aterriza lo que ha contestado
 * —objetivos, experiencia previa, fecha de nacimiento y sexo— más la prueba de
 * los consentimientos.
 *
 * Lo que NO se hace es volcar el cuestionario entero en una nota de la bitácora:
 * el peso, el dolor y las molestias son dato del art. 9, y la bitácora la lee
 * recepción sin pasar por `health-access.ts`. Por eso el formulario de un lead
 * no pregunta las constantes: se preguntan cuando hay ficha de socio donde
 * guardarlas con el trato que les corresponde.
 */
async function submitForLead(
  ctx: SubmitContext & { leadId: string; leadOccupation: string | null }
): Promise<SubmitMemberFormResult> {
  const { invite, input, now, leadId } = ctx;

  const answers = leadAnswersOf(input.answers);
  if (!answers.objetivoPrincipal) {
    return { ok: false, error: "Falta responder «Objetivo principal»." };
  }

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { firstName: true, lastName: true, goals: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.lead.update({
      where: { id: leadId },
      data: {
        goals: mergeLeadGoals(lead?.goals ?? "", answers.goalParts),
        hasTrainedBefore: answers.hasTrainedBefore,
        ...(answers.hasTrainedNote ? { hasTrainedNote: answers.hasTrainedNote } : {}),
        ...(ctx.birthDate ? { birthDate: ctx.birthDate } : {}),
        ...(input.sex ? { sex: input.sex } : {}),
        ...occupationPatch(ctx.leadOccupation, input.occupation),
      },
    });

    await tx.memberFormInvite.update({ where: { id: invite.id }, data: { completedAt: now } });

    // Mismo `action` que usa la captación pública (`leads-queries.ts`): el alta
    // del socio lee de ahí el consentimiento comercial, y dos nombres distintos
    // para el mismo hecho serían dos sitios donde buscarlo.
    await tx.auditLog.create({
      data: {
        orgId: invite.orgId,
        actorUserId: null,
        action: "LEAD_MARKETING_CONSENT_RECORDED",
        entityType: "Lead",
        entityId: leadId,
        metadata: { granted: input.consents.marketing === true, consentVersion: LEAD_CONSENT_VERSION },
      },
    });
    await tx.auditLog.create({
      data: {
        orgId: invite.orgId,
        actorUserId: null,
        action: "LEAD_FORM_CONSENTS_RECORDED",
        entityType: "MemberFormInvite",
        entityId: invite.id,
        metadata: {
          leadId,
          consentVersion: LEAD_CONSENT_VERSION,
          health: input.consents.health === true,
          images: input.consents.images === true,
          ai: input.consents.ai === true,
        },
      },
    });
  });

  await leaveReviewTask({
    orgId: invite.orgId,
    centerId: invite.centerId,
    sentByUserId: invite.sentByUserId,
    inviteId: invite.id,
    title: `Repasar el formulario de ${lead?.firstName ?? ""} ${lead?.lastName ?? ""}`.trim(),
    body:
      "Ha rellenado el formulario de alta desde casa: objetivos y experiencia previa están ya en su ficha. " +
      "Lo contestado no es un dato verificado — repásalo en la valoración presencial.",
    entityId: leadId,
    entityType: "Lead",
  });

  return { ok: true };
}

/**
 * Lo que un lead contesta y tiene columna donde caer. El resto del cuestionario
 * no se le pregunta (ver la nota de `submitForLead`).
 */
function leadAnswersOf(raw: unknown) {
  const value = (raw ?? {}) as Record<string, unknown>;
  const perfil = (value.perfil ?? {}) as Record<string, unknown>;
  const experiencia = (value.experiencia ?? {}) as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  const objetivoPrincipal = text(perfil.objetivoPrincipal).slice(0, 200);
  const partes = [
    objetivoPrincipal,
    text(perfil.objetivoSecundario),
    text(perfil.motivacionReal) && `Por qué ahora: ${text(perfil.motivacionReal)}`,
    text(perfil.queLeHariaAbandonar) && `Qué le haría abandonar: ${text(perfil.queLeHariaAbandonar)}`,
  ].filter(Boolean);

  return {
    objetivoPrincipal,
    goalParts: partes,
    hasTrainedBefore: experiencia.haEntrenadoAntes === true,
    hasTrainedNote: text(experiencia.ejerciciosNoTolera).slice(0, 500) || null,
  };
}

/**
 * QA-ALTA-21: el formulario COMPLETA los objetivos del lead, no los sustituye.
 * Lo que recepción o la captación pública ya apuntaron ("Ponerme en forma") es
 * tan dato del lead como lo que contesta ahora; antes se machacaba entero. Se
 * añade cada parte que no constara ya (sin distinguir mayúsculas), en orden.
 */
export function mergeLeadGoals(existing: string, parts: string[]): string {
  const current = existing.trim();
  const known = current.toLowerCase();
  const missing = parts.filter((part) => part && !known.includes(part.toLowerCase()));
  return [current, ...missing].filter(Boolean).join(" · ").slice(0, 2000);
}

/** La profesión declarada, solo si la ficha no tenía: como el resto, no pisa lo que ya hay. */
function occupationPatch(current: string | null, declared: string | null | undefined) {
  const value = declared?.trim().slice(0, 120);
  return !current?.trim() && value ? { occupation: value } : {};
}

/** Los cuatro consentimientos de `Member`, y solo los que se han otorgado. */
function consentPatch(consents: Partial<Record<ConsentKind, boolean>>, now: Date) {
  const patch: Record<string, unknown> = {};
  // Un «no» aquí NO retira lo que ya constaba: retirar un consentimiento es un
  // acto propio, con su pantalla (`/preferencias`, E12-12), no el efecto
  // colateral de dejar una casilla sin marcar en un formulario de alta.
  if (consents.health) {
    patch.consentHealth = true;
    patch.consentHealthAt = now;
  }
  if (consents.images) {
    patch.consentImages = true;
    patch.consentImagesAt = now;
  }
  if (consents.ai) {
    patch.consentAI = true;
    patch.consentAIAt = now;
  }
  if (consents.marketing) {
    patch.consentMarketing = true;
    patch.consentMarketingAt = now;
  }
  return patch;
}

/**
 * «Deja tarea al entrenador para revisarlo con el socio delante» (E14-20).
 *
 * El destinatario es quien mandó el formulario: es quien lo pidió y quien sabe
 * por qué. Si ese usuario ya no está (baja, cambio de centro), cae en dirección
 * del centro, que es el mismo reparto que usan las alertas de lead sin
 * responsable — no hay entrenador fijo por socio desde F9, así que no existe un
 * «su entrenador» a quien dirigirla.
 */
async function leaveReviewTask(params: {
  orgId: string;
  centerId: string;
  sentByUserId: string | null;
  inviteId: string;
  title: string;
  body: string;
  entityType: string;
  entityId: string;
}) {
  const sender = params.sentByUserId
    ? await prisma.user.findFirst({
        where: { id: params.sentByUserId, orgId: params.orgId, deactivatedAt: null },
        select: { id: true },
      })
    : null;

  const recipients = sender
    ? [sender.id]
    : (
        await prisma.user.findMany({
          where: {
            orgId: params.orgId,
            deactivatedAt: null,
            OR: [{ role: "OWNER" }, { role: "CENTER_DIRECTOR", centerId: params.centerId }],
          },
          select: { id: true },
        })
      ).map((u) => u.id);

  for (const recipientUserId of recipients) {
    await createNotificationOnce({
      orgId: params.orgId,
      recipientUserId,
      kind: "TASK",
      title: params.title,
      body: params.body,
      entityType: params.entityType,
      entityId: params.entityId,
      category: "Valoraciones",
      priority: "MEDIA",
    });
  }
}
