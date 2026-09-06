import type { RetentionCategory } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * E10-08 · Plazos de conservación: CONFIGURACIÓN, no código.
 *
 * Ojo con el nombre: `lib/retention.ts` es el motor de RETENCIÓN DE SOCIOS
 * (caída de asistencia, G.3). Esto de aquí es la conservación de datos del
 * RGPD, que no tiene nada que ver. Se separan a propósito para que nadie mezcle
 * una alerta comercial con una obligación legal.
 *
 * La tabla de partida vive aquí como VALOR POR DEFECTO. Lo que manda en
 * ejecución es `RetentionPolicy`, una fila por organización y categoría, que el
 * despacho puede cambiar desde datos sin tocar código (decisión D-C3). El suelo
 * legal viaja con la fila y una restricción de base de datos impide relajarlo:
 * un centro puede conservar MÁS tiempo del mínimo, nunca menos.
 *
 * La tabla razonada, con la norma citada por fila, está en
 * `docs/legal/03-PLAZOS-CONSERVACION.md`. Si el despacho cambia una cifra allí,
 * lo que se actualiza es la fila de `RetentionPolicy`, no este fichero.
 */

export type RetentionDefault = {
  label: string;
  /** Plazo de partida, en días desde el hecho que arranca el cómputo. */
  retentionDays: number;
  /** Suelo legal, en días. Por debajo de aquí no se puede configurar. */
  minimumLegalDays: number;
  /** Desde qué hecho se cuenta. Es la mitad que más se olvida. */
  countedFrom: string;
  /** Norma que sostiene el plazo. Propuesta de partida, no dictamen. */
  norm: string;
};

const YEAR = 365;

export const RETENTION_DEFAULTS: Record<RetentionCategory, RetentionDefault> = {
  CONTRACT_BILLING: {
    label: "Contrato y cobros",
    retentionDays: 6 * YEAR,
    minimumLegalDays: 4 * YEAR,
    countedFrom: "el fin de la relación con el socio",
    norm: "art. 30 CCom (6 años) sobre el suelo del art. 66 LGT (4 años de prescripción tributaria)",
  },
  HEALTH_DATA: {
    label: "Datos de salud",
    retentionDays: 5 * YEAR,
    minimumLegalDays: 0,
    countedFrom: "el fin de la relación con el socio",
    norm: "art. 1964 CC (prescripción de la acción personal, 5 años)",
  },
  PROGRESS_PHOTOS: {
    label: "Fotos de evolución",
    retentionDays: 0,
    minimumLegalDays: 0,
    countedFrom: "la baja del socio",
    norm: "sin obligación de conservación: se borran a la baja (principio de minimización, art. 5.1.c RGPD)",
  },
  AUDIT_LOG: {
    label: "Traza de auditoría",
    retentionDays: 3 * YEAR,
    minimumLegalDays: 2 * YEAR,
    countedFrom: "la fecha del apunte",
    norm: "medida de responsabilidad proactiva (art. 5.2 RGPD); 2-3 años es la práctica del sector",
  },
  UNCONVERTED_LEAD: {
    label: "Leads que no cerraron",
    retentionDays: 12 * 30,
    minimumLegalDays: 0,
    countedFrom: "el último contacto",
    norm: "consentimiento del interesado, sin plazo legal: 12 meses (art. 5.1.e RGPD)",
  },
  EXPIRED_INVITATION: {
    label: "Invitaciones caducadas",
    retentionDays: 30,
    minimumLegalDays: 0,
    countedFrom: "su caducidad",
    norm: "sin finalidad una vez caducada (art. 5.1.e RGPD)",
  },
  REVOKED_REFRESH_TOKEN: {
    label: "Tokens de refresco revocados",
    retentionDays: 30,
    minimumLegalDays: 0,
    countedFrom: "su revocación",
    norm: "se conservan un mes por si hay que investigar un acceso; después sobran",
  },
  PENDING_PAYMENT_ORG: {
    label: "Altas de organización sin pagar",
    retentionDays: 30,
    minimumLegalDays: 0,
    countedFrom: "el alta en PENDING_PAYMENT",
    norm: "TTL ya anunciado en el esquema (`Organization.platformStatusSince`)",
  },
};

/**
 * El plazo efectivo NUNCA baja del suelo legal, aunque la fila de la base de
 * datos diga otra cosa. La restricción `CHECK` ya lo impide al escribir, pero
 * el motor no se fía de que la restricción exista en todos los entornos:
 * relajar un plazo por una fila mal metida es destruir documentación.
 */
export function effectiveRetentionDays(
  category: RetentionCategory,
  configured: { retentionDays: number; minimumLegalDays: number } | null,
): number {
  const fallback = RETENTION_DEFAULTS[category];
  if (!configured) return fallback.retentionDays;
  const floor = Math.max(configured.minimumLegalDays, fallback.minimumLegalDays);
  return Math.max(configured.retentionDays, floor);
}

type Db = typeof prisma;

/** Plazos vigentes de una organización, con los de partida como respaldo. */
export async function getRetentionDays(
  orgId: string,
  db: Db = prisma,
): Promise<Record<RetentionCategory, number>> {
  const rows = await db.retentionPolicy.findMany({
    where: { orgId },
    select: { category: true, retentionDays: true, minimumLegalDays: true },
  });
  const byCategory = new Map(rows.map((r) => [r.category, r]));

  const out = {} as Record<RetentionCategory, number>;
  for (const category of Object.keys(RETENTION_DEFAULTS) as RetentionCategory[]) {
    out[category] = effectiveRetentionDays(category, byCategory.get(category) ?? null);
  }
  return out;
}

const DAY_MS = 86_400_000;

/** ¿Ha vencido ya el plazo contado desde `since`? `null` = el cómputo no ha arrancado. */
export function retentionElapsed(since: Date | null, days: number, now: Date): boolean {
  if (!since) return false;
  return now.getTime() - since.getTime() >= days * DAY_MS;
}

/** La fecha a partir de la cual una fila con este plazo ya se puede tratar. */
export function retentionCutoff(days: number, now: Date): Date {
  return new Date(now.getTime() - days * DAY_MS);
}

// ---------------------------------------------------------------------------
// E10-08 · Motor: la parte que borra y anonimiza
// ---------------------------------------------------------------------------
//
// `api/jobs/run` ejecutaba once reglas y NINGUNA de retención. No se purgaba
// nada: invitaciones caducadas (con su `@@index([expiresAt])` sin usar), tokens
// de refresco revocados, `AuditLog` creciendo sin fin con nombre y email en los
// metadatos, datos de ex-socios (`Member.cancelledAt` no disparaba nada: un
// socio de baja en 2019 conservaba íntegras lesiones, fotos y bioimpedancia) y
// organizaciones en `PENDING_PAYMENT` cuyo TTL el esquema ANUNCIABA sin
// implementar.
//
// Idempotencia: no hay columna donde marcar "ya anonimizado" —el esquema está
// congelado— así que el marcador es el propio `AuditLog`, que además es la
// prueba de que la operación se hizo y cuándo. Es el mismo patrón que la
// felicitación de cumpleaños.

export type RetentionRunReport = {
  rule: string;
  category: RetentionCategory;
  affected: number;
  /** Presente cuando la regla no pudo ejecutarse, con el motivo en claro. */
  skipped?: string;
};

const RETENTION_MARK_ENTITY = "DataRetention";

/** Marca de que a este sujeto ya se le aplicó esta regla. */
function markKey(category: RetentionCategory, subjectId: string): string {
  return `${category}:${subjectId}`;
}

async function alreadyApplied(db: Db, category: RetentionCategory, subjectId: string): Promise<boolean> {
  const found = await db.auditLog.findFirst({
    where: { entityType: RETENTION_MARK_ENTITY, entityId: markKey(category, subjectId) },
    select: { id: true },
  });
  return found != null;
}

async function mark(
  db: Db,
  orgId: string,
  category: RetentionCategory,
  subjectId: string,
  metadata: Record<string, unknown>,
) {
  await db.auditLog.create({
    data: {
      orgId,
      action: "DATA_RETENTION_APPLIED",
      entityType: RETENTION_MARK_ENTITY,
      entityId: markKey(category, subjectId),
      memberId: metadata.memberId as string | undefined,
      metadata: { category, ...metadata },
    },
  });
}

/**
 * Motor de conservación de una organización. Devuelve el detalle por regla —el
 * escenario "traza" pide saber cuántas filas afectó y a cuál— y deja constancia
 * de la pasada completa en `AuditLog`.
 */
export async function runDataRetention(
  orgId: string,
  now: Date = new Date(),
  db: Db = prisma,
): Promise<RetentionRunReport[]> {
  const days = await getRetentionDays(orgId, db);
  const reports: RetentionRunReport[] = [];

  // --- Invitaciones caducadas (el índice `expiresAt` por fin sirve de algo) ---
  const invitations = await db.invitation.deleteMany({
    where: { orgId, usedAt: null, expiresAt: { lt: retentionCutoff(days.EXPIRED_INVITATION, now) } },
  });
  reports.push({ rule: "invitacionesCaducadas", category: "EXPIRED_INVITATION", affected: invitations.count });

  // --- Tokens de refresco revocados ---
  const tokens = await db.mobileRefreshToken.deleteMany({
    where: {
      user: { orgId },
      revokedAt: { not: null, lt: retentionCutoff(days.REVOKED_REFRESH_TOKEN, now) },
    },
  });
  reports.push({ rule: "tokensRevocados", category: "REVOKED_REFRESH_TOKEN", affected: tokens.count });

  // --- Leads que no cerraron ---
  // Solo los archivados como no cerrados y sin socio detrás: un lead en
  // seguimiento sigue teniendo finalidad, por antiguo que sea.
  const staleLeads = await db.lead.findMany({
    where: {
      orgId,
      status: "NO_CERRADO",
      convertedMemberId: null,
      contactedAt: { lt: retentionCutoff(days.UNCONVERTED_LEAD, now) },
    },
    select: { id: true },
  });
  if (staleLeads.length > 0) {
    const ids = staleLeads.map((l) => l.id);
    // Los `HealthRecord` de un lead cuelgan de él y no de un socio: si no se
    // borran aquí quedan huérfanos, que es peor que conservarlos.
    await db.healthRecord.deleteMany({ where: { leadId: { in: ids } } });
    await db.leadNote.deleteMany({ where: { leadId: { in: ids } } });
    await db.lead.deleteMany({ where: { id: { in: ids } } });
  }
  reports.push({ rule: "leadsNoConvertidos", category: "UNCONVERTED_LEAD", affected: staleLeads.length });

  // --- Ex-socios: fotos de evolución, borrado a la baja ---
  const photoCutoff = retentionCutoff(days.PROGRESS_PHOTOS, now);
  const forPhotoPurge = await db.member.findMany({
    where: { orgId, cancelledAt: { not: null, lte: photoCutoff } },
    select: { id: true },
  });
  let photosPurged = 0;
  for (const member of forPhotoPurge) {
    if (await alreadyApplied(db, "PROGRESS_PHOTOS", member.id)) continue;
    const cleared = await db.memberProgressEntry.updateMany({
      where: { memberId: member.id },
      data: { photoFrontUrl: null, photoSideUrl: null, photoBackUrl: null },
    });
    await db.member.update({ where: { id: member.id }, data: { photoUrl: null } });
    await mark(db, orgId, "PROGRESS_PHOTOS", member.id, { memberId: member.id, entries: cleared.count });
    photosPurged++;
  }
  reports.push({ rule: "fotosDeExSocios", category: "PROGRESS_PHOTOS", affected: photosPurged });

  // --- Ex-socios: datos clínicos, anonimizados al cumplirse el plazo ---
  const healthCutoff = retentionCutoff(days.HEALTH_DATA, now);
  const forHealthPurge = await db.member.findMany({
    where: { orgId, cancelledAt: { not: null, lte: healthCutoff } },
    select: { id: true },
  });
  let healthAnonymized = 0;
  for (const member of forHealthPurge) {
    if (await alreadyApplied(db, "HEALTH_DATA", member.id)) continue;
    // Se DESLIGA, no se borra: el registro deja de ser recuperable desde
    // ninguna ficha, y lo que queda ya no identifica a nadie.
    const detached = await db.healthRecord.updateMany({
      where: { memberId: member.id },
      data: { memberId: null, reportedByUserId: null },
    });
    const entries = await db.memberProgressEntry.deleteMany({ where: { memberId: member.id } });
    await mark(db, orgId, "HEALTH_DATA", member.id, {
      memberId: member.id,
      healthRecords: detached.count,
      progressEntries: entries.count,
    });
    healthAnonymized++;
  }
  reports.push({ rule: "saludDeExSocios", category: "HEALTH_DATA", affected: healthAnonymized });

  // --- Ex-socios: identidad, al cumplirse el plazo contable ---
  // Los cobros se conservan (art. 30 CCom / art. 66 LGT); lo que se retira es
  // el nombre de quien los hizo. Ahí termina el ciclo de vida del dato.
  const billingCutoff = retentionCutoff(days.CONTRACT_BILLING, now);
  const forIdentityPurge = await db.member.findMany({
    where: { orgId, cancelledAt: { not: null, lte: billingCutoff } },
    select: { id: true },
  });
  let identitiesAnonymized = 0;
  for (const member of forIdentityPurge) {
    if (await alreadyApplied(db, "CONTRACT_BILLING", member.id)) continue;
    await db.member.update({
      where: { id: member.id },
      data: {
        firstName: "Socio",
        lastName: "anonimizado",
        email: `anonimizado-${member.id}@no-contactar.invalid`,
        phone: null,
        address: null,
        addressLine2: null,
        city: null,
        province: null,
        country: null,
        postalCode: null,
        birthDate: null,
        emergencyContact: null,
        notes: null,
        guardianName: null,
        guardianEmail: null,
        guardianPhone: null,
        guardianIdDocument: null,
        guardianEvidence: null,
        externalId: null,
        externalRef: null,
        mywellnessAccount: null,
      },
    });
    await mark(db, orgId, "CONTRACT_BILLING", member.id, { memberId: member.id });
    identitiesAnonymized++;
  }
  reports.push({ rule: "identidadDeExSocios", category: "CONTRACT_BILLING", affected: identitiesAnonymized });

  // --- Traza de la pasada completa ---
  await db.auditLog.create({
    data: {
      orgId,
      action: "DATA_RETENTION_RUN",
      entityType: RETENTION_MARK_ENTITY,
      entityId: `run:${now.toISOString()}`,
      metadata: { days, reports: reports.map((r) => ({ rule: r.rule, affected: r.affected, skipped: r.skipped })) },
    },
  });

  return reports;
}

/**
 * Firma que espera `/api/jobs/run`: cuántas filas tocó la pasada. El detalle
 * por regla queda en `AuditLog`, que es donde hay que ir a buscarlo cuando
 * alguien pregunte qué se purgó y con qué plazo.
 */
export async function runDataRetentionRule(orgId: string, now: Date = new Date()): Promise<number> {
  const reports = await runDataRetention(orgId, now);
  return reports.reduce((sum, r) => sum + r.affected, 0);
}

// ---------------------------------------------------------------------------
// Reglas que NO son de una organización
// ---------------------------------------------------------------------------

/**
 * Purga del `AuditLog`.
 *
 * E10-14 dejó la tabla append-only con dos capas: un trigger que corta el
 * UPDATE venga de quien venga, y un `REVOKE UPDATE, DELETE` sobre el rol de la
 * aplicación. El DELETE se dejó fuera del trigger **a propósito**, para que
 * esta purga pueda borrar — pero con un rol DISTINTO, el único que conserva el
 * privilegio.
 *
 * Por eso no se usa el cliente de Prisma de la aplicación: se abre una conexión
 * propia con `DATA_RETENTION_DATABASE_URL`. Sin esa variable la regla NO se
 * ejecuta y lo dice; fallar en silencio aquí dejaría el log creciendo sin fin
 * mientras el resumen del cron dice que todo fue bien.
 */
export async function purgeAuditLog(
  orgId: string,
  now: Date = new Date(),
  db: Db = prisma,
): Promise<RetentionRunReport> {
  const url = process.env.DATA_RETENTION_DATABASE_URL;
  if (!url) {
    return {
      rule: "auditLog",
      category: "AUDIT_LOG",
      affected: 0,
      skipped:
        "DATA_RETENTION_DATABASE_URL no está definida. El AuditLog es append-only para el rol de la aplicación " +
        "(E10-14): la purga necesita el rol de mantenimiento, que es el único que conserva el DELETE.",
    };
  }

  const days = await getRetentionDays(orgId, db);
  const cutoff = retentionCutoff(days.AUDIT_LOG, now);

  const { Client } = await import("pg");
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const result = await client.query('DELETE FROM "AuditLog" WHERE "orgId" = $1 AND "createdAt" < $2', [
      orgId,
      cutoff,
    ]);
    const affected = result.rowCount ?? 0;
    if (affected > 0) {
      // La constancia de la purga se escribe con el cliente de la aplicación:
      // es una fila nueva, que es lo único que la app puede hacer sobre el log.
      await db.auditLog.create({
        data: {
          orgId,
          action: "AUDIT_LOG_PURGED",
          entityType: RETENTION_MARK_ENTITY,
          entityId: `audit:${cutoff.toISOString().slice(0, 10)}`,
          metadata: { retentionDays: days.AUDIT_LOG, cutoff: cutoff.toISOString(), rows: affected },
        },
      });
    }
    return { rule: "auditLog", category: "AUDIT_LOG", affected };
  } finally {
    await client.end();
  }
}

/**
 * Organizaciones que se registraron y nunca pagaron. El esquema ya ANUNCIABA el
 * TTL (`Organization.platformStatusSince`, "base del TTL de purga") y nadie lo
 * había implementado.
 *
 * Se borra lo que el alta crea —organización, su director y su invitación— y
 * NADA más: si a esa organización le ha entrado un socio, un centro o un cobro,
 * ya no es un alta abandonada, es un cliente con un problema de facturación. En
 * ese caso se anota y se deja en paz.
 *
 * Va por la conexión de mantenimiento y no por la de la aplicación porque
 * `AuditLog` tiene FK a `Organization` sin cascada: borrar la organización
 * exige borrar antes sus apuntes, y eso el rol de la aplicación no puede
 * hacerlo (E10-14). Todo en una única transacción SQL: a medias dejaría una
 * organización sin director.
 */
export async function purgePendingPaymentOrganizations(
  now: Date = new Date(),
  db: Db = prisma,
): Promise<RetentionRunReport> {
  const url = process.env.DATA_RETENTION_DATABASE_URL;
  if (!url) {
    return {
      rule: "organizacionesSinPagar",
      category: "PENDING_PAYMENT_ORG",
      affected: 0,
      skipped:
        "DATA_RETENTION_DATABASE_URL no está definida. Borrar una organización arrastra sus apuntes de AuditLog, " +
        "y eso solo lo puede hacer el rol de mantenimiento (E10-14).",
    };
  }

  const ttlDays = RETENTION_DEFAULTS.PENDING_PAYMENT_ORG.retentionDays;
  const cutoff = retentionCutoff(ttlDays, now);

  const candidates = await db.organization.findMany({
    where: { platformStatus: "PENDING_PAYMENT", platformStatusSince: { lt: cutoff } },
    select: {
      id: true,
      _count: { select: { members: true, centers: true, payments: true } },
    },
  });

  const abandoned: string[] = [];
  for (const org of candidates) {
    if (org._count.members > 0 || org._count.centers > 0 || org._count.payments > 0) {
      await db.auditLog.create({
        data: {
          orgId: org.id,
          action: "DATA_RETENTION_SKIPPED",
          entityType: RETENTION_MARK_ENTITY,
          entityId: markKey("PENDING_PAYMENT_ORG", org.id),
          metadata: { reason: "la organización tiene datos: no es un alta abandonada", counts: org._count },
        },
      });
      continue;
    }
    abandoned.push(org.id);
  }
  if (abandoned.length === 0) {
    return { rule: "organizacionesSinPagar", category: "PENDING_PAYMENT_ORG", affected: 0 };
  }

  const { Client } = await import("pg");
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query('DELETE FROM "Invitation" WHERE "orgId" = ANY($1::text[])', [abandoned]);
    await client.query('DELETE FROM "CenterMembership" WHERE "orgId" = ANY($1::text[])', [abandoned]);
    await client.query('DELETE FROM "AuditLog" WHERE "orgId" = ANY($1::text[])', [abandoned]);
    await client.query('DELETE FROM "User" WHERE "orgId" = ANY($1::text[])', [abandoned]);
    await client.query('DELETE FROM "Organization" WHERE "id" = ANY($1::text[])', [abandoned]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }

  return { rule: "organizacionesSinPagar", category: "PENDING_PAYMENT_ORG", affected: abandoned.length };
}
