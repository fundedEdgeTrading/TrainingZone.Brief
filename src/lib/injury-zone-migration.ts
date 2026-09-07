import { prisma } from "@/lib/prisma";
import type { InjuryZone } from "@prisma/client";
import { mapLegacyZone } from "@/lib/injury-zones";

/**
 * Migración de las zonas de texto libre al catálogo cerrado (E3-02).
 *
 * Tres reglas, que son las que pide la historia:
 *
 *  1. se normaliza con un MAPEO DECLARADO (`mapLegacyZone`), no adivinando;
 *  2. lo que no se puede mapear **no se descarta ni se toca**: se queda con su
 *     texto original y `zoneCode` a null, que es la marca de "pendiente de
 *     revisión manual" (`listZonesPendingReview`), y además queda nombrado fila
 *     a fila en el `AuditLog`;
 *  3. el informe dice cuántas quedaron sin mapear.
 *
 * El texto original NUNCA se borra: `HealthRecord.zone` y `AptitudeRule.injuryZone`
 * siguen ahí como el dato que alguien escribió. Eso hace la migración repetible
 * (idempotente) y revisable a posteriori.
 */

export type ZoneMigrationEntity = "HealthRecord" | "AptitudeRule";

export type UnmappedRow = { id: string; entity: ZoneMigrationEntity; text: string };

export type ZoneMigrationReport = {
  orgId: string;
  dryRun: boolean;
  healthRecords: { candidates: number; mapped: number; unmapped: number };
  aptitudeRules: { candidates: number; mapped: number; unmapped: number };
  byZone: Partial<Record<InjuryZone, number>>;
  /** Las filas que quedan para que una persona decida. Nunca se descarta ninguna. */
  pendingReview: UnmappedRow[];
};

export function totalUnmapped(report: ZoneMigrationReport): number {
  return report.healthRecords.unmapped + report.aptitudeRules.unmapped;
}

/** Una línea por bloque, para volcar en consola o adjuntar al ticket de migración. */
export function formatZoneMigrationReport(report: ZoneMigrationReport): string {
  const { healthRecords: hr, aptitudeRules: ar } = report;
  const zones = Object.entries(report.byZone)
    .sort((a, b) => b[1] - a[1])
    .map(([zone, count]) => `${zone}=${count}`)
    .join(" ");
  return [
    `[E3-02] org ${report.orgId}${report.dryRun ? " (simulación)" : ""}`,
    `  HealthRecord : ${hr.mapped}/${hr.candidates} normalizados · ${hr.unmapped} SIN MAPEAR`,
    `  AptitudeRule : ${ar.mapped}/${ar.candidates} normalizados · ${ar.unmapped} SIN MAPEAR`,
    `  zonas        : ${zones || "—"}`,
    ...report.pendingReview.map((r) => `  · revisión manual · ${r.entity} ${r.id} · "${r.text}"`),
  ].join("\n");
}

/**
 * Normaliza una organización. Idempotente: las filas que ya tienen `zoneCode`
 * no se vuelven a tocar, así que se puede ejecutar tantas veces como haga falta
 * mientras se completa el mapeo declarado.
 */
export async function migrateInjuryZonesForOrg({
  orgId,
  dryRun = false,
  actorUserId = null,
}: {
  orgId: string;
  dryRun?: boolean;
  actorUserId?: string | null;
}): Promise<ZoneMigrationReport> {
  const report: ZoneMigrationReport = {
    orgId,
    dryRun,
    healthRecords: { candidates: 0, mapped: 0, unmapped: 0 },
    aptitudeRules: { candidates: 0, mapped: 0, unmapped: 0 },
    byZone: {},
    pendingReview: [],
  };

  const count = (zone: InjuryZone) => {
    report.byZone[zone] = (report.byZone[zone] ?? 0) + 1;
  };

  const records = await prisma.healthRecord.findMany({
    where: {
      zoneCode: null,
      zone: { not: null },
      OR: [{ member: { orgId } }, { lead: { orgId } }],
    },
    select: { id: true, zone: true },
  });
  report.healthRecords.candidates = records.length;

  for (const record of records) {
    const mapping = mapLegacyZone(record.zone);
    if (!mapping) {
      report.healthRecords.unmapped += 1;
      report.pendingReview.push({ id: record.id, entity: "HealthRecord", text: record.zone ?? "" });
      continue;
    }
    report.healthRecords.mapped += 1;
    count(mapping.zone);
    if (!dryRun) {
      await prisma.healthRecord.update({
        where: { id: record.id },
        data: { zoneCode: mapping.zone, side: mapping.side },
      });
    }
  }

  const rules = await prisma.aptitudeRule.findMany({
    where: { orgId, zoneCode: null },
    select: { id: true, injuryZone: true },
  });
  report.aptitudeRules.candidates = rules.length;

  for (const rule of rules) {
    const mapping = mapLegacyZone(rule.injuryZone);
    if (!mapping) {
      report.aptitudeRules.unmapped += 1;
      report.pendingReview.push({ id: rule.id, entity: "AptitudeRule", text: rule.injuryZone });
      continue;
    }
    report.aptitudeRules.mapped += 1;
    count(mapping.zone);
    if (!dryRun) {
      await prisma.aptitudeRule.update({
        where: { id: rule.id },
        data: { zoneCode: mapping.zone, side: mapping.side },
      });
    }
  }

  if (!dryRun) {
    // La traza de la migración entra por donde entra todo lo demás: una fila
    // append-only por organización, con el recuento y con las filas que quedan
    // pendientes NOMBRADAS. Sin esto, "quedaron 3 sin mapear" no sirve de nada:
    // hay que poder ir a buscarlas.
    await prisma.auditLog.create({
      data: {
        orgId,
        actorUserId,
        action: "HEALTH_INJURY_ZONE_MIGRATED",
        entityType: "Organization",
        entityId: orgId,
        metadata: {
          healthRecords: report.healthRecords,
          aptitudeRules: report.aptitudeRules,
          byZone: report.byZone,
          pendingReview: report.pendingReview,
        },
      },
    });
  }

  return report;
}

export async function migrateInjuryZones({
  dryRun = false,
  actorUserId = null,
}: { dryRun?: boolean; actorUserId?: string | null } = {}): Promise<ZoneMigrationReport[]> {
  const orgs = await prisma.organization.findMany({ select: { id: true } });
  const reports: ZoneMigrationReport[] = [];
  for (const org of orgs) {
    reports.push(await migrateInjuryZonesForOrg({ orgId: org.id, dryRun, actorUserId }));
  }
  return reports;
}

/**
 * Lo que quedó para una persona: registros con zona escrita a mano que el mapeo
 * declarado no supo traducir. Se marcan por ausencia de `zoneCode`, no por un
 * valor de relleno — un `OTRA` puesto por la migración sería indistinguible de
 * un `OTRA` elegido a conciencia por un entrenador.
 */
export async function listZonesPendingReview(orgId: string): Promise<UnmappedRow[]> {
  const [records, rules] = await Promise.all([
    prisma.healthRecord.findMany({
      where: { zoneCode: null, zone: { not: null }, OR: [{ member: { orgId } }, { lead: { orgId } }] },
      select: { id: true, zone: true },
    }),
    prisma.aptitudeRule.findMany({ where: { orgId, zoneCode: null }, select: { id: true, injuryZone: true } }),
  ]);

  return [
    ...records.map((r): UnmappedRow => ({ id: r.id, entity: "HealthRecord", text: r.zone ?? "" })),
    ...rules.map((r): UnmappedRow => ({ id: r.id, entity: "AptitudeRule", text: r.injuryZone })),
  ];
}
