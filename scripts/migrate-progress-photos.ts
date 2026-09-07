import "dotenv/config";
import { prisma } from "@/lib/prisma";
import {
  isInlineDataUrl,
  isPhotoStoreConfigured,
  putProgressPhoto,
  type PhotoColumns,
} from "@/lib/progress-photos";

/**
 * E10-20 · Backfill: saca de la base de datos las fotos que hoy viven dentro.
 *
 * Escenario "migración": las fotos existentes se migran y las columnas de texto
 * quedan vacías —vacías de foto: lo que queda es la referencia al fichero
 * cifrado, que es lo único que la columna debe contener.
 *
 * Se ejecuta con `npm run migrate:fotos`. Es idempotente: una entrada ya
 * migrada lleva referencia y no `data:`, así que una segunda pasada no la toca.
 * Va de una en una y no en lote a propósito: son megas por fila, y un lote
 * grande se come la memoria del proceso.
 */
async function main() {
  if (!isPhotoStoreConfigured()) {
    console.error(
      "[E10-20] PROGRESS_PHOTO_KEY no está configurada. Sin clave no hay dónde guardar las fotos cifradas.\n" +
        "Genera una con: openssl rand -base64 32",
    );
    process.exitCode = 1;
    return;
  }

  const pending = await prisma.memberProgressEntry.findMany({
    where: {
      OR: [
        { photoFrontUrl: { startsWith: "data:" } },
        { photoSideUrl: { startsWith: "data:" } },
        { photoBackUrl: { startsWith: "data:" } },
      ],
    },
    select: { id: true },
  });

  console.info(`[E10-20] Entradas con foto dentro de la base de datos: ${pending.length}`);

  let migrated = 0;
  let failed = 0;
  for (const { id } of pending) {
    const entry = await prisma.memberProgressEntry.findUnique({
      where: { id },
      select: { id: true, photoFrontUrl: true, photoSideUrl: true, photoBackUrl: true },
    });
    if (!entry) continue;

    const data: Partial<PhotoColumns> = {};
    let ok = true;
    for (const field of ["photoFrontUrl", "photoSideUrl", "photoBackUrl"] as const) {
      const value = entry[field];
      if (!isInlineDataUrl(value)) continue;
      const stored = await putProgressPhoto(value);
      if (!stored) {
        console.error(`[E10-20] ${entry.id} · ${field}: no es una imagen válida, se deja como está.`);
        ok = false;
        continue;
      }
      data[field] = stored.ref;
    }

    if (Object.keys(data).length === 0) {
      if (!ok) failed++;
      continue;
    }

    await prisma.memberProgressEntry.update({ where: { id: entry.id }, data });
    migrated++;
    if (!ok) failed++;
  }

  const left = await prisma.memberProgressEntry.count({
    where: {
      OR: [
        { photoFrontUrl: { startsWith: "data:" } },
        { photoSideUrl: { startsWith: "data:" } },
        { photoBackUrl: { startsWith: "data:" } },
      ],
    },
  });

  console.info(`[E10-20] Migradas: ${migrated}. Con algún problema: ${failed}. Quedan dentro de la base: ${left}.`);
  if (left > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error("[E10-20] La migración falló:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
