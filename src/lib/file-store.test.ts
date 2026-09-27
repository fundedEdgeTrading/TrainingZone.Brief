import test from "node:test";
import assert from "node:assert/strict";

import {
  deleteStoredImage,
  discardReplacedImage,
  fileAccess,
  isExternalImageUrl,
  isStoredFileUrl,
  parseImageDataUrl,
  resolveImageInput,
  storedFileIdFromUrl,
  storedFileUrl,
  type FileViewer,
  type StoredFileMeta,
} from "./file-store";
import { sniffImageMime } from "./image-bytes";
import { dataUrlBytes, fitWithin } from "./image-resize";
import { stripeProductImages } from "./stripe-catalog";

const PNG_1PX =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const JPEG_HEAD = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const WEBP_HEAD = Buffer.from("RIFF\x00\x00\x00\x00WEBPVP8 ", "latin1");
const ID = "11111111-2222-3333-4444-555555555555";

/** `prisma.storedFile` de mentira: lo justo para `resolveImageInput` y los borrados. */
function fakeDb(existing: { id: string; orgId: string; kind: string }[] = []) {
  const created: { orgId: string; kind: string; memberId: string | null; mime: string; size: number }[] = [];
  const deleted: { id: string; orgId: string }[] = [];
  const db = {
    storedFile: {
      create: async ({ data }: { data: { orgId: string; kind: string; memberId: string | null; mime: string; size: number } }) => {
        created.push(data);
        return { id: `aaaaaaaa-0000-0000-0000-00000000000${created.length}` };
      },
      findFirst: async ({ where }: { where: { id: string; orgId: string; kind: string } }) =>
        existing.find((f) => f.id === where.id && f.orgId === where.orgId && f.kind === where.kind) ?? null,
      deleteMany: async ({ where }: { where: { id: string; orgId: string } }) => {
        deleted.push(where);
        return { count: existing.some((f) => f.id === where.id && f.orgId === where.orgId) ? 1 : 0 };
      },
    },
  };
  return { db: db as never, created, deleted };
}

// ---------- Bytes ----------

test("el tipo sale de la firma de los bytes, no de lo que declare el data URL", () => {
  assert.equal(sniffImageMime(Buffer.from(PNG_1PX.split(",")[1], "base64")), "image/png");
  assert.equal(sniffImageMime(JPEG_HEAD), "image/jpeg");
  assert.equal(sniffImageMime(WEBP_HEAD), "image/webp");
  assert.equal(sniffImageMime(Buffer.from("<svg onload=alert(1)>")), null);
  assert.equal(sniffImageMime(Buffer.from("<html><script>")), null);
});

test("un HTML disfrazado de PNG, un SVG o un data URL vacío no se aceptan", () => {
  const html = Buffer.from("<script>alert(1)</script>").toString("base64");
  assert.equal(parseImageDataUrl(`data:image/png;base64,${html}`), null);
  assert.equal(parseImageDataUrl(`data:image/svg+xml;base64,${html}`), null);
  assert.equal(parseImageDataUrl("data:image/png;base64,"), null);
  assert.equal(parseImageDataUrl("https://example.test/logo.png"), null);
  assert.deepEqual(parseImageDataUrl(PNG_1PX)?.mime, "image/png");
});

test("una imagen por encima del tope se rechaza", () => {
  const big = Buffer.concat([JPEG_HEAD, Buffer.alloc(3 * 1024 * 1024)]);
  assert.equal(parseImageDataUrl(`data:image/jpeg;base64,${big.toString("base64")}`), null);
  assert.ok(parseImageDataUrl(`data:image/jpeg;base64,${big.toString("base64")}`, 4 * 1024 * 1024));
});

// ---------- URLs ----------

test("solo `/api/files/<uuid>` es un fichero nuestro", () => {
  assert.equal(storedFileUrl(ID), `/api/files/${ID}`);
  assert.equal(storedFileIdFromUrl(`/api/files/${ID}`), ID);
  assert.equal(isStoredFileUrl(`/api/files/${ID}`), true);
  assert.equal(isStoredFileUrl("/api/files/../../etc/passwd"), false);
  assert.equal(isStoredFileUrl("/brand/tz-logo-black.png"), false);
});

test("URL externa: https o ruta propia; `//host` es otro host", () => {
  assert.equal(isExternalImageUrl("https://cdn.example.test/logo.png"), true);
  assert.equal(isExternalImageUrl("/brand/tz-logo-black.png"), true);
  assert.equal(isExternalImageUrl("//evil.test/x.png"), false);
  assert.equal(isExternalImageUrl("javascript:alert(1)"), false);
});

// ---------- Del formulario a la columna ----------

test("un data URL se guarda en StoredFile y la columna recibe su URL", async () => {
  const { db, created } = fakeDb();
  const result = await resolveImageInput(PNG_1PX, { orgId: "org-1", kind: "PRODUCT_IMAGE" }, db);
  assert.equal(result.ok, true);
  assert.ok(result.ok && isStoredFileUrl(result.value));
  assert.equal(created.length, 1);
  assert.equal(created[0].orgId, "org-1");
  assert.equal(created[0].mime, "image/png");
});

test("vacío quita la imagen; lo mismo que ya había no se toca", async () => {
  const { db, created } = fakeDb();
  assert.deepEqual(await resolveImageInput("", { orgId: "o", kind: "ORG_LOGO" }, db), { ok: true, value: null });
  assert.deepEqual(await resolveImageInput(null, { orgId: "o", kind: "ORG_LOGO" }, db), { ok: true, value: null });
  const current = `/api/files/${ID}`;
  assert.deepEqual(
    await resolveImageInput(current, { orgId: "o", kind: "ORG_LOGO", previous: current }, db),
    { ok: true, value: current },
  );
  assert.equal(created.length, 0);
});

test("no se puede apuntar a la imagen de otra organización adivinando su id", async () => {
  const { db } = fakeDb([{ id: ID, orgId: "org-2", kind: "ORG_LOGO" }]);
  const result = await resolveImageInput(`/api/files/${ID}`, { orgId: "org-1", kind: "ORG_LOGO" }, db);
  assert.equal(result.ok, false);
});

test("las fotos de personas solo se suben: no admiten una URL externa", async () => {
  const { db } = fakeDb();
  const external = "https://example.test/cara.jpg";
  assert.equal((await resolveImageInput(external, { orgId: "o", kind: "MEMBER_PHOTO" }, db)).ok, false);
  assert.equal((await resolveImageInput(external, { orgId: "o", kind: "STAFF_PHOTO" }, db)).ok, false);
  assert.deepEqual(await resolveImageInput(external, { orgId: "o", kind: "ORG_LOGO" }, db), { ok: true, value: external });
});

test("una imagen inválida se rechaza sin guardar nada", async () => {
  const { db, created } = fakeDb();
  const result = await resolveImageInput("data:image/png;base64,PHNjcmlwdD4=", { orgId: "o", kind: "ORG_LOGO" }, db);
  assert.equal(result.ok, false);
  assert.equal(created.length, 0);
});

test("al reemplazar se borra la anterior, acotada a la organización", async () => {
  const { db, deleted } = fakeDb([{ id: ID, orgId: "org-1", kind: "ORG_LOGO" }]);
  await discardReplacedImage(`/api/files/${ID}`, "/api/files/aaaaaaaa-0000-0000-0000-000000000001", "org-1", db);
  assert.deepEqual(deleted, [{ id: ID, orgId: "org-1" }]);

  // Sin cambio, o si la anterior no era un fichero nuestro, no se borra nada.
  const other = fakeDb();
  await discardReplacedImage(`/api/files/${ID}`, `/api/files/${ID}`, "org-1", other.db);
  await discardReplacedImage("/brand/logo.png", null, "org-1", other.db);
  assert.equal(await deleteStoredImage("https://x.test/a.png", "org-1", other.db), false);
  assert.equal(other.deleted.length, 0);
});

// ---------- Quién puede pedir qué ----------

const staff = (role: FileViewer["role"], orgId = "org-1"): FileViewer => ({ id: "u1", role, orgId, centerId: null });
const file = (kind: StoredFileMeta["kind"], extra: Partial<StoredFileMeta> = {}): StoredFileMeta => ({
  id: ID,
  orgId: "org-1",
  kind,
  memberId: null,
  encrypted: false,
  ...extra,
});
const NO = { isOwnMember: false, memberInScope: false };

test("logos, productos y anuncios son públicos: salen en fichas, emails y Stripe", () => {
  for (const kind of ["ORG_LOGO", "CENTER_LOGO", "PRODUCT_IMAGE", "ANNOUNCEMENT_IMAGE"] as const) {
    assert.equal(fileAccess(file(kind), null, NO), "public", kind);
  }
});

test("las fotos de evolución nunca salen por /api/files, ni para quien puede verlas", () => {
  assert.equal(fileAccess(file("PROGRESS_PHOTO", { encrypted: true }), staff("OWNER"), { isOwnMember: true, memberInScope: true }), "deny");
  assert.equal(fileAccess(file("MEMBER_PHOTO", { encrypted: true }), staff("OWNER"), { isOwnMember: true, memberInScope: true }), "deny");
});

test("foto de socio: el propio socio o el equipo con ese socio en su ámbito", () => {
  const photo = file("MEMBER_PHOTO", { memberId: "m1" });
  assert.equal(fileAccess(photo, null, NO), "deny");
  assert.equal(fileAccess(photo, staff("MEMBER"), { isOwnMember: true, memberInScope: false }), "private");
  // Otro socio de la misma organización, no.
  assert.equal(fileAccess(photo, staff("MEMBER"), { isOwnMember: false, memberInScope: true }), "deny");
  assert.equal(fileAccess(photo, staff("RECEPTION"), { isOwnMember: false, memberInScope: true }), "private");
  // Equipo de otro centro, no.
  assert.equal(fileAccess(photo, staff("TRAINER"), NO), "deny");
  // Otra organización, nunca.
  assert.equal(fileAccess(photo, staff("OWNER", "org-2"), { isOwnMember: false, memberInScope: true }), "deny");
});

test("foto del equipo: cualquiera con sesión en la organización", () => {
  const photo = file("STAFF_PHOTO");
  assert.equal(fileAccess(photo, null, NO), "deny");
  assert.equal(fileAccess(photo, staff("MEMBER"), NO), "private");
  assert.equal(fileAccess(photo, staff("TRAINER", "org-2"), NO), "deny");
});

// ---------- Stripe y reescalado ----------

test("Stripe recibe la imagen subida con URL absoluta, y nunca un data URL", () => {
  assert.deepEqual(stripeProductImages(null), []);
  assert.deepEqual(stripeProductImages(PNG_1PX), []);
  assert.deepEqual(stripeProductImages("https://cdn.test/a.jpg"), ["https://cdn.test/a.jpg"]);
  const [absolute] = stripeProductImages(`/api/files/${ID}`);
  assert.match(absolute, new RegExp(`^https?://[^/]+/api/files/${ID}$`));
});

test("el reescalado nunca amplía y conserva la proporción", () => {
  assert.deepEqual(fitWithin(4000, 3000, 1600), { width: 1600, height: 1200 });
  assert.deepEqual(fitWithin(3000, 4000, 1600), { width: 1200, height: 1600 });
  assert.deepEqual(fitWithin(300, 200, 1600), { width: 300, height: 200 });
  assert.equal(dataUrlBytes(PNG_1PX), Buffer.from(PNG_1PX.split(",")[1], "base64").length);
});
