"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/guard";
import {
  STANDARD_MILESTONES,
  isTogglableQuestion,
  milestoneKeyForMonths,
  slugifyQuestionKey,
} from "@/lib/assessments/config";
import { getAssessmentMilestones } from "@/lib/assessments/queries";
import type { AssessmentQuestionScope, AssessmentQuestionType } from "@prisma/client";

/**
 * Configuración de valoraciones de una organización (F-VAL). Es estructura del
 * negocio, como los productos o los centros, así que la mantiene dirección.
 */
const CONFIG_ROLES = ["OWNER"] as const;

export type AssessmentConfigActionResult = { ok: true } | { ok: false; error: string };

const PATH = "/organization/valoraciones";

/** Tope alto pero finito: un hito a 600 meses es un dedo, no una intención. */
const MAX_MONTHS = 120;

function parseMonths(raw: FormDataEntryValue | null): number | null {
  const months = Number(String(raw ?? "").trim());
  if (!Number.isInteger(months) || months < 1 || months > MAX_MONTHS) return null;
  return months;
}

/**
 * Cambia el vencimiento (y opcionalmente el nombre) de un hito. Vale tanto para
 * los estándar —la fila nace en el momento en que el centro se aparta del
 * catálogo— como para los que él mismo añadió.
 */
export async function updateMilestoneAction(formData: FormData): Promise<AssessmentConfigActionResult> {
  const session = await requireRole([...CONFIG_ROLES]);

  const key = String(formData.get("key") ?? "").trim();
  if (!key) return { ok: false, error: "Falta el hito que se quiere cambiar." };

  const standard = STANDARD_MILESTONES.find((m) => m.key === key);
  const existing = await prisma.assessmentMilestone.findUnique({
    where: { orgId_key: { orgId: session.user.orgId, key } },
    select: { id: true, label: true },
  });
  if (!standard && !existing) return { ok: false, error: "Ese hito ya no existe." };

  const months = parseMonths(formData.get("months"));
  if (months === null && !(standard && standard.months === 0)) {
    return { ok: false, error: `Indica los meses del hito (entre 1 y ${MAX_MONTHS}).` };
  }
  const label = String(formData.get("label") ?? "").trim() || existing?.label || standard?.label || key;

  // La valoración inicial vence el día del alta por definición: si se pudiera
  // mover, el socio entraría por la puerta sin PAR-Q firmado y sin screening.
  const effectiveMonths = standard?.key === "INITIAL" ? 0 : months!;

  // Se comprueba contra la escalera YA resuelta, no contra el catálogo: si el
  // centro movió M9 a los 10 meses, el hueco de los 9 está libre.
  const milestones = await getAssessmentMilestones(session.user.orgId);
  if (milestones.some((m) => m.key !== key && m.months === effectiveMonths)) {
    return { ok: false, error: "Ya hay un hito a esos meses." };
  }

  await prisma.assessmentMilestone.upsert({
    where: { orgId_key: { orgId: session.user.orgId, key } },
    create: { orgId: session.user.orgId, key, label, months: effectiveMonths },
    update: { label, months: effectiveMonths },
  });

  revalidatePath(PATH);
  return { ok: true };
}

/**
 * Añade un hito propio: el caso de un centro que quiere revisar a los 18 meses.
 * Esta historia solo cubre añadir — los estándar no se borran ni se reordenan.
 */
export async function addMilestoneAction(formData: FormData): Promise<AssessmentConfigActionResult> {
  const session = await requireRole([...CONFIG_ROLES]);

  const months = parseMonths(formData.get("months"));
  if (months === null) return { ok: false, error: `Indica los meses del hito (entre 1 y ${MAX_MONTHS}).` };

  const label = String(formData.get("label") ?? "").trim() || `Revisión · ${months} meses`;
  const key = milestoneKeyForMonths(months);

  const milestones = await getAssessmentMilestones(session.user.orgId);
  if (milestones.some((m) => m.months === months || m.key === key)) {
    return { ok: false, error: "Ya hay un hito a esos meses." };
  }

  await prisma.assessmentMilestone.create({ data: { orgId: session.user.orgId, key, label, months } });

  revalidatePath(PATH);
  return { ok: true };
}

/**
 * Enciende o apaga una pregunta del cuestionario estándar. Guardar solo las
 * apagadas es lo que hace que una organización sin configuración se comporte
 * como siempre: no hay filas que sembrar ni que mantener al día cuando el
 * catálogo crece.
 */
export async function setQuestionEnabledAction(
  questionKey: string,
  enabled: boolean
): Promise<AssessmentConfigActionResult> {
  const session = await requireRole([...CONFIG_ROLES]);

  if (!isTogglableQuestion(questionKey)) {
    return { ok: false, error: "Esa pregunta sostiene otro módulo y no se puede quitar." };
  }

  if (enabled) {
    await prisma.assessmentQuestionToggle.deleteMany({ where: { orgId: session.user.orgId, questionKey } });
  } else {
    await prisma.assessmentQuestionToggle.upsert({
      where: { orgId_questionKey: { orgId: session.user.orgId, questionKey } },
      create: { orgId: session.user.orgId, questionKey },
      update: {},
    });
  }

  revalidatePath(PATH);
  return { ok: true };
}

const QUESTION_TYPES: AssessmentQuestionType[] = ["TEXT", "NUMBER", "SCALE_1_5"];
const QUESTION_SCOPES: AssessmentQuestionScope[] = ["ALL", "INITIAL", "REVIEW"];

/** Alta de una pregunta propia del centro: enunciado y tipo de respuesta. */
export async function createCustomQuestionAction(formData: FormData): Promise<AssessmentConfigActionResult> {
  const session = await requireRole([...CONFIG_ROLES]);

  const label = String(formData.get("label") ?? "").trim();
  if (label.length < 3) return { ok: false, error: "Escribe la pregunta." };
  if (label.length > 200) return { ok: false, error: "La pregunta es demasiado larga." };

  const type = String(formData.get("type") ?? "") as AssessmentQuestionType;
  if (!QUESTION_TYPES.includes(type)) return { ok: false, error: "Elige un tipo de respuesta." };

  const scope = String(formData.get("scope") ?? "ALL") as AssessmentQuestionScope;
  if (!QUESTION_SCOPES.includes(scope)) return { ok: false, error: "Elige a qué valoraciones se hace." };

  const required = formData.get("required") === "on";

  // La clave se calcula una sola vez y no vuelve a moverse: es el nombre bajo el
  // que quedan escritas las respuestas. Si ya existe, se desempata con un
  // sufijo en vez de pisar las respuestas de la pregunta anterior.
  const base = slugifyQuestionKey(label);
  const taken = new Set(
    (
      await prisma.assessmentCustomQuestion.findMany({
        where: { orgId: session.user.orgId, key: { startsWith: base } },
        select: { key: true },
      })
    ).map((q) => q.key)
  );
  let key = base;
  for (let i = 2; taken.has(key); i++) key = `${base}_${i}`;

  const last = await prisma.assessmentCustomQuestion.findFirst({
    where: { orgId: session.user.orgId },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  await prisma.assessmentCustomQuestion.create({
    data: {
      orgId: session.user.orgId,
      key,
      label,
      type,
      scope,
      required,
      position: (last?.position ?? 0) + 1,
    },
  });

  revalidatePath(PATH);
  return { ok: true };
}

/**
 * Retira (o vuelve a poner) una pregunta propia. No se borra: lo ya contestado
 * sigue siendo parte de las valoraciones de aquellos días y se sigue viendo en
 * la ficha.
 */
export async function setCustomQuestionActiveAction(
  id: string,
  active: boolean
): Promise<AssessmentConfigActionResult> {
  const session = await requireRole([...CONFIG_ROLES]);

  await prisma.assessmentCustomQuestion.updateMany({
    where: { id, orgId: session.user.orgId },
    data: { active },
  });

  revalidatePath(PATH);
  return { ok: true };
}
