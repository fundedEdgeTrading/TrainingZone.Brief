import "dotenv/config";
import type { StoredFileKind } from "@prisma/client";

import { resolveImageInput, saveStoredFile } from "@/lib/file-store";
import { prisma } from "@/lib/prisma";
import {
  isInlineDataUrl,
  isPhotoRef,
  isPhotoStoreConfigured,
  putProgressPhoto,
  readLegacyEnvelope,
  refId,
  type PhotoColumns,
} from "@/lib/progress-photos";
import { rm } from "fs/promises";
import path from "path";

/**
 * Backfill: todas las imágenes a `StoredFile` (Postgres).
 *
 *  1. Las que viven como `data:` URL DENTRO de su columna (logos, productos,
 *     anuncios, fotos de perfil de socio y de equipo): se guardan como fichero y
 *     la columna pasa a `/api/files/<id>`.
 *  2. Las fotos de evolución que siguen como `data:` URL: se cifran y se
 *     guardan (necesita `PROGRESS_PHOTO_KEY`).
 *  3. Las fotos de evolución que están en el disco de antes
 *     (`PROGRESS_PHOTO_DIR`): el sobre cifrado se copia tal cual a Postgres
 *     con el mismo id —la referencia de la columna no cambia— y se borra del disco.
 *
 * Los SVG (`data:image/svg+xml`) NO se migran y no cuentan como pendientes:
 * un SVG es un documento que puede llevar script, y servirlo desde nuestro
 * dominio sería un XSS. Se quedan en su columna como hasta ahora (son los
 * marcadores del seed de demo, o algo subido antes de este cambio) y se
 * resumen al final para que alguien los sustituya por un PNG/JPEG.
 *
 * `npm run files:migrate`. Idempotente: lo ya migrado no empieza por `data:` ni
 * está en disco, así que una segunda pasada no lo toca. Va fila a fila a
 * propósito: son megas por fila y un lote grande se come la memoria.
 *
 * Cuando termine sin pendientes en producción, el disco de Render y
 * `PROGRESS_PHOTO_DIR` se pueden retirar (render.yaml, env-check).
 */

type Column = {
  label: string;
  kind: StoredFileKind;
  /** Filas con un `data:` URL en la columna: id, organización y valor. */
  pending: () => Promise<{ id: string; orgId: string; value: string; memberId?: string }[]>;
  write: (id: string, url: string) => Promise<unknown>;
};

const DATA = { startsWith: "data:" } as const;

const COLUMNS: Column[] = [
  {
    label: "Organization.logoUrl",
    kind: "ORG_LOGO",
    pending: async () =>
      (await prisma.organization.findMany({ where: { logoUrl: DATA }, select: { id: true, logoUrl: true } })).map(
        (r) => ({ id: r.id, orgId: r.id, value: r.logoUrl! }),
      ),
    write: (id, url) => prisma.organization.update({ where: { id }, data: { logoUrl: url } }),
  },
  {
    label: "Center.logoUrl",
    kind: "CENTER_LOGO",
    pending: async () =>
      (await prisma.center.findMany({ where: { logoUrl: DATA }, select: { id: true, orgId: true, logoUrl: true } })).map(
        (r) => ({ id: r.id, orgId: r.orgId, value: r.logoUrl! }),
      ),
    write: (id, url) => prisma.center.update({ where: { id }, data: { logoUrl: url } }),
  },
  {
    label: "MembershipPlan.imageUrl",
    kind: "PRODUCT_IMAGE",
    pending: async () =>
      (
        await prisma.membershipPlan.findMany({ where: { imageUrl: DATA }, select: { id: true, orgId: true, imageUrl: true } })
      ).map((r) => ({ id: r.id, orgId: r.orgId, value: r.imageUrl! })),
    write: (id, url) => prisma.membershipPlan.update({ where: { id }, data: { imageUrl: url } }),
  },
  {
    label: "Announcement.imageUrl",
    kind: "ANNOUNCEMENT_IMAGE",
    pending: async () =>
      (
        await prisma.announcement.findMany({ where: { imageUrl: DATA }, select: { id: true, orgId: true, imageUrl: true } })
      ).map((r) => ({ id: r.id, orgId: r.orgId, value: r.imageUrl! })),
    write: (id, url) => prisma.announcement.update({ where: { id }, data: { imageUrl: url } }),
  },
  {
    label: "Member.photoUrl",
    kind: "MEMBER_PHOTO",
    pending: async () =>
      (await prisma.member.findMany({ where: { photoUrl: DATA }, select: { id: true, orgId: true, photoUrl: true } })).map(
        (r) => ({ id: r.id, orgId: r.orgId, value: r.photoUrl!, memberId: r.id }),
      ),
    write: (id, url) => prisma.member.update({ where: { id }, data: { photoUrl: url } }),
  },
  {
    label: "User.image",
    kind: "STAFF_PHOTO",
    pending: async () =>
      (await prisma.user.findMany({ where: { image: DATA }, select: { id: true, orgId: true, image: true } })).map((r) => ({
        id: r.id,
        orgId: r.orgId,
        value: r.image!,
      })),
    write: (id, url) => prisma.user.update({ where: { id }, data: { image: url } }),
  },
];

const PHOTO_FIELDS = ["photoFrontUrl", "photoSideUrl", "photoBackUrl"] as const;

let svgLeftInline = 0;

function isInlineSvg(value: string): boolean {
  return /^data:image\/svg\+xml[;,]/i.test(value);
}

async function migrateColumns(): Promise<number> {
  let left = 0;
  for (const column of COLUMNS) {
    const rows = await column.pending();
    let moved = 0;
    for (const row of rows) {
      if (isInlineSvg(row.value)) {
        svgLeftInline++;
        continue;
      }
      // Una a una: cada fila puede llevar megas dentro.
      const stored = await resolveImageInput(row.value, {
        orgId: row.orgId,
        kind: column.kind,
        memberId: row.memberId ?? null,
      });
      if (!stored.ok || !stored.value) {
        console.error(`[files] ${column.label} ${row.id}: no es una imagen admitida (JPEG/PNG/WebP ≤ 2 MB); se deja como está.`);
        left++;
        continue;
      }
      await column.write(row.id, stored.value);
      moved++;
    }
    console.info(`[files] ${column.label}: ${moved} de ${rows.length} movidas a StoredFile.`);
  }
  return left;
}

async function migrateInlineProgressPhotos(): Promise<number> {
  const where = { OR: PHOTO_FIELDS.map((field) => ({ [field]: DATA })) };
  const pending = await prisma.memberProgressEntry.findMany({ where, select: { id: true } });
  if (pending.length === 0) return 0;
  if (!isPhotoStoreConfigured()) {
    console.error("[files] PROGRESS_PHOTO_KEY no está configurada: las fotos de evolución no se pueden cifrar.");
    return pending.length;
  }

  let left = 0;
  for (const { id } of pending) {
    const entry = await prisma.memberProgressEntry.findUnique({
      where: { id },
      select: {
        id: true,
        photoFrontUrl: true,
        photoSideUrl: true,
        photoBackUrl: true,
        member: { select: { id: true, orgId: true } },
      },
    });
    if (!entry) continue;
    const data: Partial<PhotoColumns> = {};
    for (const field of PHOTO_FIELDS) {
      const value = entry[field];
      if (!isInlineDataUrl(value)) continue;
      if (isInlineSvg(value)) {
        svgLeftInline++;
        continue;
      }
      const stored = await putProgressPhoto(value, { orgId: entry.member.orgId, memberId: entry.member.id });
      if (!stored) {
        console.error(`[files] MemberProgressEntry ${entry.id} · ${field}: no es una imagen válida, se deja como está.`);
        left++;
        continue;
      }
      data[field] = stored.ref;
    }
    if (Object.keys(data).length > 0) await prisma.memberProgressEntry.update({ where: { id: entry.id }, data });
  }
  console.info(`[files] Fotos de evolución dentro de la base: ${pending.length} entradas revisadas.`);
  return left;
}

async function migrateDiskProgressPhotos(): Promise<number> {
  const refs = await prisma.memberProgressEntry.findMany({
    where: { OR: PHOTO_FIELDS.map((field) => ({ [field]: { startsWith: "photo:v1:" } })) },
    select: { id: true, photoFrontUrl: true, photoSideUrl: true, photoBackUrl: true, member: { select: { id: true, orgId: true } } },
  });

  let moved = 0;
  let left = 0;
  for (const entry of refs) {
    for (const field of PHOTO_FIELDS) {
      const ref = entry[field];
      if (!isPhotoRef(ref)) continue;
      const id = refId(ref);
      if (await prisma.storedFile.findUnique({ where: { id }, select: { id: true } })) continue;

      const envelope = await readLegacyEnvelope(id);
      if (!envelope) {
        console.error(`[files] MemberProgressEntry ${entry.id} · ${field}: la foto no está ni en Postgres ni en disco.`);
        left++;
        continue;
      }
      // El sobre se copia cifrado, sin abrirlo: no hace falta la clave y la
      // referencia de la columna sigue siendo la misma.
      await saveStoredFile({
        id,
        orgId: entry.member.orgId,
        memberId: entry.member.id,
        kind: "PROGRESS_PHOTO",
        mime: "application/octet-stream",
        encrypted: true,
        data: Buffer.from(envelope, "utf8"),
      });
      const dir = process.env.PROGRESS_PHOTO_DIR || path.join(process.cwd(), ".data", "progress-photos");
      await rm(path.join(dir, `${id}.enc`), { force: true });
      moved++;
    }
  }
  console.info(`[files] Fotos de evolución del disco movidas a Postgres: ${moved}.`);
  return left;
}

async function main() {
  const left = (await migrateColumns()) + (await migrateInlineProgressPhotos()) + (await migrateDiskProgressPhotos());
  if (svgLeftInline > 0) {
    console.warn(`[files] SVG que se quedan dentro de su columna (no se sirven desde /api/files): ${svgLeftInline}.`);
  }
  console.info(`[files] Pendientes que necesitan revisión a mano: ${left}.`);
  if (left > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error("[files] La migración falló:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
