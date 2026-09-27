-- Imágenes subidas en Postgres (StoredFile).
--
-- Logos de organización y de centro, imágenes de producto y de anuncio, fotos
-- de perfil de socio y de equipo, y fotos de evolución (cifradas). Hasta aquí
-- las primeras iban como `data:` URL dentro de su columna de texto, los logos
-- solo admitían una URL pegada a mano y las fotos de evolución vivían en un
-- disco de Render. Las columnas `*Url` no cambian: pasan a guardar
-- `/api/files/<id>` (o `photo:v1:<id>`).
--
-- Solo aditiva. Los datos antiguos los mueve `npm run files:migrate`.

-- CreateEnum
CREATE TYPE "StoredFileKind" AS ENUM ('ORG_LOGO', 'CENTER_LOGO', 'PRODUCT_IMAGE', 'ANNOUNCEMENT_IMAGE', 'MEMBER_PHOTO', 'STAFF_PHOTO', 'PROGRESS_PHOTO');

-- CreateTable
CREATE TABLE "StoredFile" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "kind" "StoredFileKind" NOT NULL,
    "memberId" TEXT,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "encrypted" BOOLEAN NOT NULL DEFAULT false,
    "data" BYTEA NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StoredFile_orgId_kind_idx" ON "StoredFile"("orgId", "kind");

-- CreateIndex
CREATE INDEX "StoredFile_memberId_idx" ON "StoredFile"("memberId");

-- AddForeignKey
ALTER TABLE "StoredFile" ADD CONSTRAINT "StoredFile_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoredFile" ADD CONSTRAINT "StoredFile_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Las imágenes ya vienen comprimidas (JPEG/PNG/WebP, y el sobre cifrado no
-- comprime): EXTERNAL guarda fuera de línea sin intentar comprimir otra vez.
ALTER TABLE "StoredFile" ALTER COLUMN "data" SET STORAGE EXTERNAL;

-- Tope en la propia base, por si algún camino se salta la validación de
-- `src/lib/file-store.ts` (2 MB de imagen; el sobre cifrado ocupa ~1,8×).
ALTER TABLE "StoredFile" ADD CONSTRAINT "StoredFile_size_check" CHECK ("size" > 0 AND octet_length("data") <= 6 * 1024 * 1024);
