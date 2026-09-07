import { prisma } from "@/lib/prisma";
import { getRetentionDays, retentionElapsed } from "@/lib/data-retention";

/**
 * E10-09 · Qué ocurre exactamente cuando se suprime un socio.
 *
 * El hallazgo original (§7 CN-05) tenía dos mitades igual de malas:
 * `actions.ts:426` ejecutaba `payment.deleteMany` —destrucción de justificantes
 * dentro del plazo de prescripción fiscal, art. 200 LGT— y el diálogo que veía
 * dirección afirmaba que *"los datos de salud y los pagos emitidos se conservan
 * anonimizados por obligación legal"*, que era simplemente falso.
 *
 * La forma de que un texto no pueda volver a mentir no es reescribirlo: es que
 * el texto y la ejecución salgan del mismo sitio. `buildSuppressionPlan`
 * devuelve, campo por campo, qué se hace con cada bloque de datos; el diálogo
 * lo PINTA y el borrado lo EJECUTA. Cambiar uno sin el otro deja de ser posible.
 */

export type SuppressionAction = "DISSOCIATE" | "DELETE" | "ANONYMIZE";

export type SuppressionEffect = {
  /** Bloque de datos, en el vocabulario de quien mira la pantalla. */
  key:
    | "payments"
    | "healthRecords"
    | "progressEntries"
    | "bookings"
    | "notes"
    | "identity"
    | "portalAccount"
    | "auditLog";
  label: string;
  action: SuppressionAction;
  /** Cuántas filas afecta. `null` cuando no es una cuenta (la identidad). */
  count: number | null;
  /** Qué ocurre exactamente. Es lo que lee dirección antes de confirmar. */
  detail: string;
  /** Por qué. Vacío cuando no hay norma detrás, solo minimización. */
  legalBasis?: string;
};

export type SuppressionPlan = {
  memberId: string;
  effects: SuppressionEffect[];
};

export type SuppressionCounts = {
  payments: number;
  healthRecords: number;
  progressEntries: number;
  bookings: number;
  notes: number;
  auditLogEntries: number;
  hasPortalAccount: boolean;
};

/**
 * Núcleo puro, sin base de datos, para poder probarlo: dadas las cuentas y si
 * el plazo de salud ya venció, ¿qué le pasa a cada bloque?
 */
export function buildSuppressionPlan(input: {
  memberId: string;
  counts: SuppressionCounts;
  /** ¿Venció ya el plazo de conservación de salud desde el fin de la relación? */
  healthRetentionElapsed: boolean;
  /** Plazo de salud vigente en la organización, en días, para poder decirlo. */
  healthRetentionDays: number;
}): SuppressionPlan {
  const { counts } = input;
  const effects: SuppressionEffect[] = [];

  // Los cobros NO se borran: se les retira el vínculo con la persona y siguen
  // contando en la contabilidad del periodo. Borrarlos es destruir
  // justificantes dentro del plazo de prescripción.
  effects.push({
    key: "payments",
    label: "Cobros emitidos",
    action: "DISSOCIATE",
    count: counts.payments,
    detail:
      counts.payments === 0
        ? "No hay cobros que conservar."
        : `Se conservan los ${counts.payments} cobros con su número de recibo, importe, fecha y método, y se les retira el vínculo con la persona: pasan a la ficha contable «Socios suprimidos». Siguen contando en la contabilidad del periodo.`,
    legalBasis: "art. 30 CCom y art. 66 LGT; destruirlos sería el art. 200 LGT",
  });

  // Salud: la tabla de plazos manda (E10-08). Vencido el plazo se borra; dentro
  // del plazo se DESLIGA de la persona, que es lo único que permite conservar
  // el dato sin conservar a quién pertenece.
  effects.push({
    key: "healthRecords",
    label: "Datos de salud",
    action: input.healthRetentionElapsed ? "DELETE" : "ANONYMIZE",
    count: counts.healthRecords,
    detail:
      counts.healthRecords === 0
        ? "No hay registros de salud."
        : input.healthRetentionElapsed
          ? `Se borran los ${counts.healthRecords} registros: el plazo de conservación de ${input.healthRetentionDays} días ya ha vencido.`
          : `Se conservan los ${counts.healthRecords} registros desligados de la persona hasta cumplir los ${input.healthRetentionDays} días desde el fin de la relación; después se borran solos.`,
    legalBasis: "art. 1964 CC, con el plazo que tenga configurado el centro",
  });

  effects.push({
    key: "progressEntries",
    label: "Fotos y medidas de evolución",
    action: "DELETE",
    count: counts.progressEntries,
    detail:
      counts.progressEntries === 0
        ? "No hay registros de evolución."
        : `Se borran los ${counts.progressEntries} registros, fotos incluidas. No hay obligación de conservarlos.`,
  });

  effects.push({
    key: "bookings",
    label: "Historial de asistencia",
    action: "DELETE",
    count: counts.bookings,
    detail:
      counts.bookings === 0
        ? "No hay reservas registradas."
        : `Se borran las ${counts.bookings} reservas y las notas de sesión asociadas.`,
  });

  effects.push({
    key: "notes",
    label: "Bitácora, objetivos y valoraciones",
    action: "DELETE",
    count: counts.notes,
    detail:
      counts.notes === 0
        ? "No hay bitácora ni objetivos registrados."
        : `Se borran las ${counts.notes} anotaciones internas, junto con objetivos, autovaloraciones, mesociclos y conversaciones.`,
  });

  effects.push({
    key: "identity",
    label: "Datos de contacto",
    action: "DELETE",
    count: null,
    detail: "Se borran nombre, apellidos, email, teléfono, dirección y fecha de nacimiento.",
  });

  if (counts.hasPortalAccount) {
    effects.push({
      key: "portalAccount",
      label: "Acceso al portal",
      action: "DELETE",
      count: null,
      detail: "Se borra la cuenta del portal para que no quede un acceso huérfano.",
    });
  }

  // El log es append-only por construcción (E10-14): la supresión NO lo toca,
  // le añade una fila. Decirlo importa: es la diferencia entre "queda registro"
  // y "se reescribe el registro".
  effects.push({
    key: "auditLog",
    label: "Traza de auditoría",
    action: "ANONYMIZE",
    count: counts.auditLogEntries,
    detail:
      "La traza no se reescribe: se le añade el apunte de la supresión con tu usuario, el socio y el alcance. Las filas anteriores pierden el actor por integridad referencial, no por una edición.",
    legalBasis: "art. 5.2 RGPD (responsabilidad proactiva)",
  });

  return { memberId: input.memberId, effects };
}

/**
 * El mismo plan, con las cuentas reales. Lo usan la vista previa del diálogo y
 * la propia supresión, que es lo que garantiza que ambos digan lo mismo.
 */
export async function getSuppressionPlan(memberId: string, orgId: string, now: Date = new Date()) {
  const member = await prisma.member.findFirst({
    where: { id: memberId, orgId },
    select: { id: true, userId: true, joinedAt: true, cancelledAt: true },
  });
  if (!member) return null;

  const [payments, healthRecords, progressEntries, bookings, memberNotes, goals, auditLogEntries, days] =
    await Promise.all([
      prisma.payment.count({ where: { memberId } }),
      prisma.healthRecord.count({ where: { memberId } }),
      prisma.memberProgressEntry.count({ where: { memberId } }),
      prisma.booking.count({ where: { memberId } }),
      prisma.memberNote.count({ where: { memberId } }),
      prisma.clientGoal.count({ where: { memberId, isTemplate: false } }),
      prisma.auditLog.count({ where: { memberId } }),
      getRetentionDays(orgId),
    ]);

  const healthRetentionDays = days.HEALTH_DATA;
  return buildSuppressionPlan({
    memberId,
    counts: {
      payments,
      healthRecords,
      progressEntries,
      bookings,
      notes: memberNotes + goals,
      auditLogEntries,
      hasPortalAccount: member.userId != null,
    },
    // El cómputo arranca al terminar la relación. Sin `cancelledAt` la relación
    // sigue viva y el plazo no ha empezado: nunca ha vencido.
    healthRetentionElapsed: retentionElapsed(member.cancelledAt, healthRetentionDays, now),
    healthRetentionDays,
  });
}

/** Cómo se llama la ficha contable a la que van a parar los cobros disociados. */
export const SUPPRESSED_MEMBER_FIRST_NAME = "Socios";
export const SUPPRESSED_MEMBER_LAST_NAME = "suprimidos";
export const SUPPRESSED_MEMBER_EMAIL = "socios-suprimidos@no-contactar.invalid";

/**
 * Ficha contable de destino de los cobros disociados, una por organización.
 *
 * `Payment.memberId` es obligatorio (el esquema está congelado este trimestre),
 * así que "retirar el vínculo con la persona" se hace apuntando el cobro a una
 * ficha que no identifica a nadie, en vez de dejarlo colgando. Es una sola fila
 * por organización, en estado `CANCELLED` para que no entre en ningún recuento
 * de socios activos ni en el motor de retención.
 */
export async function ensureSuppressedMemberBucket(
  tx: Pick<typeof prisma, "member">,
  orgId: string,
  primaryCenterId: string,
): Promise<string> {
  const existing = await tx.member.findFirst({
    where: { orgId, email: SUPPRESSED_MEMBER_EMAIL },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await tx.member.create({
    data: {
      orgId,
      primaryCenterId,
      firstName: SUPPRESSED_MEMBER_FIRST_NAME,
      lastName: SUPPRESSED_MEMBER_LAST_NAME,
      email: SUPPRESSED_MEMBER_EMAIL,
      state: "CANCELLED",
      consentContract: false,
      consentHealth: false,
    },
    select: { id: true },
  });
  return created.id;
}
