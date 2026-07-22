"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/guard";
import { canImportMembers } from "@/lib/rbac";
import { parseMembersCsv, type ParsedMemberData } from "@/lib/member-import";

export type ImportSummary = {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; messages: string[] }[];
};

export type ImportMembersResult =
  | { ok: true; summary: ImportSummary }
  | { ok: false; error: string };

const MAX_ROWS = 5000;

// Campos que la importación escribe sobre un socio existente. Se omiten
// firstName/lastName/email al actualizar solo si el CSV los trae vacíos (no es
// el caso: son obligatorios), y externalRef nunca se toca en update (es la clave).
function commonData(d: ParsedMemberData) {
  return {
    phone: d.phone,
    birthDate: d.birthDate,
    sex: d.sex,
    address: d.address,
    addressLine2: d.addressLine2,
    city: d.city,
    province: d.province,
    postalCode: d.postalCode,
    country: d.country,
    lastAccessAt: d.lastAccessAt,
    lastInteractionAt: d.lastInteractionAt,
    accountCreatedAt: d.accountCreatedAt,
    state: d.state,
    churnRisk: d.churnRisk,
    primaryAspiration: d.primaryAspiration,
    secondaryAspiration: d.secondaryAspiration,
    mywellnessAccount: d.mywellnessAccount,
    externalId: d.externalId,
  };
}

export async function importMembersCsv(formData: FormData): Promise<ImportMembersResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR"]);
  if (!canImportMembers(session.user.role)) {
    return { ok: false, error: "Solo la dirección puede importar socios." };
  }
  const orgId = session.user.orgId;

  const centerId = String(formData.get("centerId") ?? "");
  if (!centerId) return { ok: false, error: "Selecciona el centro de destino de la importación." };
  const center = await prisma.center.findFirst({ where: { id: centerId, orgId }, select: { id: true } });
  if (!center) return { ok: false, error: "No se ha encontrado ese centro." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Adjunta un archivo CSV." };
  }

  let text: string;
  try {
    text = await file.text();
  } catch {
    return { ok: false, error: "No se ha podido leer el archivo." };
  }

  const { rows, fatalError } = parseMembersCsv(text);
  if (fatalError) return { ok: false, error: fatalError };
  if (rows.length === 0) return { ok: false, error: "El CSV no contiene filas de socios." };
  if (rows.length > MAX_ROWS) {
    return { ok: false, error: `El CSV supera el máximo de ${MAX_ROWS} filas por importación.` };
  }

  const summary: ImportSummary = {
    total: rows.length,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  for (const row of rows) {
    if (row.errors.length) {
      summary.skipped++;
      summary.errors.push({ row: row.rowNumber, messages: row.errors });
      continue;
    }

    const d = row.data;
    try {
      // Localiza al socio existente por la clave estable del origen y, en su
      // defecto, por email dentro de la organización — para no duplicar.
      const existing = await prisma.member.findFirst({
        where: {
          orgId,
          OR: [
            ...(d.externalRef ? [{ externalRef: d.externalRef }] : []),
            ...(d.email ? [{ email: d.email }] : []),
          ],
        },
        select: { id: true },
      });

      if (existing) {
        await prisma.member.update({
          where: { id: existing.id },
          data: {
            firstName: d.firstName,
            lastName: d.lastName,
            ...(d.email ? { email: d.email } : {}),
            ...(d.joinedAt ? { joinedAt: d.joinedAt } : {}),
            ...(d.externalRef ? { externalRef: d.externalRef } : {}),
            externalSource: "mywellness",
            ...commonData(d),
          },
        });
        summary.updated++;
      } else {
        await prisma.member.create({
          data: {
            orgId,
            primaryCenterId: center.id,
            firstName: d.firstName,
            lastName: d.lastName,
            email: d.email ?? "",
            ...(d.joinedAt ? { joinedAt: d.joinedAt } : {}),
            externalRef: d.externalRef,
            externalSource: "mywellness",
            ...commonData(d),
          },
        });
        summary.created++;
      }
    } catch (e) {
      summary.skipped++;
      const msg =
        e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002"
          ? "Conflicto de duplicado (email o identificador ya existente)."
          : "Error al guardar la fila.";
      summary.errors.push({ row: row.rowNumber, messages: [msg] });
    }
  }

  revalidatePath("/members");
  return { ok: true, summary };
}
