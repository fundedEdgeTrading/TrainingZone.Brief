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
