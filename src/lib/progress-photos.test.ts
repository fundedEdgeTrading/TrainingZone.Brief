import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

import { ColumnCryptoError, decryptColumn, encryptColumn, isEncrypted, readKey } from "./column-crypto";
import {
  deleteProgressPhoto,
  isInlineDataUrl,
  isPhotoRef,
  parseDataUrl,
  photoRefsOf,
  putProgressPhoto,
  readLegacyEnvelope,
  readProgressPhoto,
  type PhotoBlobStore,
  type PhotoDeps,
  resolveProgressPhotoUrl,
  signPhotoUrl,
  verifyPhotoToken,
  PHOTO_LINK_TTL_MINUTES,
} from "./progress-photos";

// PNG de 1×1 en base64: suficiente para el contrato, no hace falta una foto.
const PNG_1PX =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const KEY = Buffer.from("dev-only-key-do-not-use-in-prod!").toString("base64");

const OWNER = { orgId: "org-1", memberId: "member-1" };

/** Almacén en memoria: el contrato de Postgres sin base de datos. */
function memoryStore(): PhotoBlobStore & { blobs: Map<string, { envelope: string; owner: typeof OWNER }> } {
  const blobs = new Map<string, { envelope: string; owner: typeof OWNER }>();
  return {
    blobs,
    async put(id, envelope, owner) {
      blobs.set(id, { envelope, owner: { orgId: owner.orgId, memberId: owner.memberId } });
    },
    async get(id) {
      return blobs.get(id)?.envelope ?? null;
    },
    async delete(id) {
      return blobs.delete(id);
    },
  };
}

function depsWithStore() {
  const store = memoryStore();
  const deps: PhotoDeps = { env: { ...process.env, PROGRESS_PHOTO_KEY: KEY }, store };
  return { store, deps };
}

function envWithKey(): NodeJS.ProcessEnv {
  return { ...process.env, PROGRESS_PHOTO_KEY: KEY, PROGRESS_PHOTO_DIR: "" };
}

/**
 * E10-20, escenario principal: la columna no guarda la foto. Antes vivía como
 * `data:image/jpeg;base64,...` en una columna de texto, así que un `pg_dump`
 * la entregaba legible.
 */
test("lo que se guarda en la columna es una referencia, no la foto", async () => {
  const { deps } = depsWithStore();
  const stored = await putProgressPhoto(PNG_1PX, OWNER, deps);
  assert.ok(stored);
  assert.equal(isPhotoRef(stored.ref), true);
  assert.equal(isInlineDataUrl(stored.ref), false);
  assert.equal(stored.ref.includes("base64"), false);
});

/** Escenario "cifrado": lo que llega al almacén (una fila de Postgres) no es legible. */
test("lo guardado está cifrado: no contiene los bytes ni el tipo de la imagen", async () => {
  const { store, deps } = depsWithStore();
  const stored = await putProgressPhoto(PNG_1PX, OWNER, deps);
  assert.ok(stored);

  assert.equal(store.blobs.size, 1);
  const [saved] = [...store.blobs.values()];
  assert.equal(isEncrypted(saved.envelope), true);
  // La firma PNG no aparece en claro en ninguna parte.
  assert.equal(saved.envelope.includes("iVBORw0KGgo"), false);
  assert.equal(saved.envelope.includes("image/png"), false);
  // Y va atada al socio: borrar al socio se la lleva (FK en cascada).
  assert.deepEqual(saved.owner, OWNER);
});

test("lo guardado se recupera byte a byte", async () => {
  const { deps } = depsWithStore();
  const stored = await putProgressPhoto(PNG_1PX, OWNER, deps);
  assert.ok(stored);
  const loaded = await readProgressPhoto(stored.ref, deps);
  assert.ok(loaded);
  assert.equal(loaded.mime, "image/png");
  assert.equal(loaded.data.toString("base64"), PNG_1PX.split(",")[1]);
});

/** Escenario "acceso": firmado y caducado, y atado a este socio. */
test("el enlace caduca y no vale para otro socio", () => {
  const env = envWithKey();
  const now = Date.UTC(2026, 8, 6, 10, 0, 0);
  const ref = "photo:v1:11111111-2222-3333-4444-555555555555";
  const url = signPhotoUrl(ref, "member-1", now, env);
  assert.ok(url);

  const token = decodeURIComponent(new URL(url, "https://x.test").searchParams.get("t")!);
  const photoId = ref.slice("photo:v1:".length);

  assert.equal(verifyPhotoToken(photoId, "member-1", token, now, env), true);
  // Otro socio: la firma incluye el socio, así que no cuela.
  assert.equal(verifyPhotoToken(photoId, "member-2", token, now, env), false);
  // Otro objeto: tampoco.
  assert.equal(verifyPhotoToken("99999999-2222-3333-4444-555555555555", "member-1", token, now, env), false);
  // Caducado.
  const later = now + (PHOTO_LINK_TTL_MINUTES + 1) * 60_000;
  assert.equal(verifyPhotoToken(photoId, "member-1", token, later, env), false);
});

test("un token inventado no pasa", () => {
  const env = envWithKey();
  const now = Date.now();
  const id = "11111111-2222-3333-4444-555555555555";
  assert.equal(verifyPhotoToken(id, "m1", `${now + 60_000}.aaaa`, now, env), false);
  assert.equal(verifyPhotoToken(id, "m1", "no-es-un-token", now, env), false);
  assert.equal(verifyPhotoToken(id, "m1", "", now, env), false);
});

/** Escenario "borrado": borrar la entrada borra también la foto. */
test("borrar la referencia borra la foto del almacén", async () => {
  const { store, deps } = depsWithStore();
  const stored = await putProgressPhoto(PNG_1PX, OWNER, deps);
  assert.ok(stored);
  assert.equal(store.blobs.size, 1);

  assert.equal(await deleteProgressPhoto(stored.ref, deps), true);
  assert.equal(store.blobs.size, 0);
});

/**
 * Un id con `../` dentro convertiría el respaldo en disco en una lectura
 * arbitraria de ficheros. Se valida como UUID ANTES de tocar ningún almacén.
 */
test("una referencia con recorrido de directorios no llega a ningún almacén", async () => {
  const { store, deps } = depsWithStore();
  let touched = false;
  const spy: PhotoBlobStore = {
    put: store.put,
    get: async (id) => ((touched = true), store.get(id)),
    delete: async (id) => ((touched = true), store.delete(id)),
  };
  assert.equal(await readProgressPhoto("photo:v1:../../etc/passwd", { ...deps, store: spy }), null);
  assert.equal(await deleteProgressPhoto("photo:v1:../../etc/passwd", { ...deps, store: spy }), false);
  assert.equal(touched, false);
});

/**
 * Las fotos guardadas en el disco de Render antes de pasar a Postgres se
 * siguen leyendo y borrando mientras `npm run files:migrate` no las mueve.
 */
test("una foto que sigue en el disco antiguo se lee y se borra", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "tz-photos-"));
  const env = { ...process.env, PROGRESS_PHOTO_KEY: KEY, PROGRESS_PHOTO_DIR: dir };
  // Se escribe como lo hacía la versión en disco: el sobre en `<id>.enc`.
  const { store, deps } = depsWithStore();
  const stored = await putProgressPhoto(PNG_1PX, OWNER, { ...deps, env });
  assert.ok(stored);
  const id = stored.ref.slice("photo:v1:".length);
  await writeFile(path.join(dir, `${id}.enc`), store.blobs.get(id)!.envelope, "utf8");

  // Sin fila en Postgres, `postgresPhotoStore` cae a `readLegacyEnvelope`;
  // aquí se prueba ese respaldo sin base de datos.
  const legacyOnly: PhotoBlobStore = {
    put: async () => undefined,
    get: (photoId) => readLegacyEnvelope(photoId, env),
    delete: store.delete,
  };
  const loaded = await readProgressPhoto(stored.ref, { env, store: legacyOnly });
  assert.ok(loaded);
  assert.equal(loaded.mime, "image/png");
  assert.equal((await readdir(dir)).length, 1);
});

test("solo se aceptan imágenes, y no cualquier data URL", () => {
  assert.equal(parseDataUrl("data:text/html;base64,PHNjcmlwdD4="), null);
  // Declarar `image/png` no basta: manda la firma de los bytes.
  assert.equal(parseDataUrl("data:image/png;base64,PHNjcmlwdD4="), null);
  assert.equal(parseDataUrl("https://example.test/foto.jpg"), null);
  assert.equal(parseDataUrl("data:image/png;base64,"), null);
  assert.ok(parseDataUrl(PNG_1PX));
});

/** Migración: mientras corre el backfill conviven referencia y `data:` heredado. */
test("un data URL heredado se sigue pintando hasta que la migración lo mueva", () => {
  const env = envWithKey();
  assert.equal(resolveProgressPhotoUrl(PNG_1PX, "m1", Date.now(), env), PNG_1PX);
  assert.equal(resolveProgressPhotoUrl(null, "m1", Date.now(), env), null);
  const signed = resolveProgressPhotoUrl("photo:v1:11111111-2222-3333-4444-555555555555", "m1", Date.now(), env);
  assert.match(signed ?? "", /^\/api\/progress-photos\//);
});

test("photoRefsOf recoge solo las referencias, no los data URL", () => {
  const refs = photoRefsOf({
    photoFrontUrl: "photo:v1:11111111-2222-3333-4444-555555555555",
    photoSideUrl: PNG_1PX,
    photoBackUrl: null,
  });
  assert.deepEqual(refs, ["photo:v1:11111111-2222-3333-4444-555555555555"]);
});

// ---------- Primitiva ADR-005 ----------

test("un valor cifrado y manipulado no descifra: falla, no devuelve basura", () => {
  const key = readKey("K", { ...process.env, K: KEY })!;
  const value = encryptColumn("lumbalgia crónica", key);
  assert.equal(decryptColumn(value, key).toString("utf8"), "lumbalgia crónica");

  const parts = value.split(":");
  const tampered = [...parts.slice(0, 4), Buffer.from("otra cosa").toString("base64url")].join(":");
  assert.throws(() => decryptColumn(tampered, key), ColumnCryptoError);
});

test("dos cifrados del mismo texto no son iguales: el IV es distinto cada vez", () => {
  const key = readKey("K", { ...process.env, K: KEY })!;
  assert.notEqual(encryptColumn("hola", key), encryptColumn("hola", key));
});

test("una clave del tamaño equivocado se rechaza al leerla, con la receta", () => {
  assert.throws(() => readKey("K", { ...process.env, K: "Y29ydGE=" }), /openssl rand -base64 32/);
  assert.equal(readKey("K", { ...process.env, K: undefined }), null);
});
