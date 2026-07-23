-- BI-3: sustituye la referencia geográfica por provincia (2 dígitos de CP) por
-- una referencia por CP completo (barrio/zona). Se conserva la estructura de
-- la tabla (code/name/lat/lng) — solo cambian el nombre y el significado de
-- las filas; el contenido se repuebla íntegramente desde el seed.
ALTER TABLE "PostalProvince" RENAME TO "PostalCodeArea";
ALTER TABLE "PostalCodeArea" RENAME CONSTRAINT "PostalProvince_pkey" TO "PostalCodeArea_pkey";
