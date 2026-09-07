import { test, expect } from "@playwright/test";
import { prisma } from "@/lib/prisma";
import { mobileLogin, bearer, jsonOf, API_PREFIX } from "./fixtures/mobile-api";

/**
 * E7-06 · E2 — `GET /staff` no enseña personal de otro centro.
 *
 * El segundo bloqueante de la historia, y una fuga de LECTURA pura: las
 * escrituras de plantilla ya estaban acotadas (`findStaffInScope`), pero el
 * listado de la app no. Verificado antes del arreglo: dirección de La Jota
 * recibía 28 personas —las 8 de Santander incluidas— con nombre, email, rol e
 * imputaciones. La web nunca se lo enseñó; el espejo móvil, sí.
 *
 * La comprobación es doble a propósito:
 *
 *  1. Que no venga NADIE de Santander (lo que se filtraba).
 *  2. Que sí venga su propia gente (o el test pasaría también con el endpoint
 *     roto devolviendo la lista vacía, que es la forma barata de fingir que se
 *     arregló una fuga).
 *
 * Y se contrasta con dirección de ORGANIZACIÓN, que sí manda en toda la
 * organización: lo que separa a los dos roles es la imputación, no el rol a
 * secas, así que sin este contraste el test no distinguiría un ámbito bien
 * calculado de uno que recorta a todo el mundo.
 */

const LA_JOTA_DIRECTOR = "direccion.lajota@trainingzone.es";
const SANTANDER_DIRECTOR = "director1.santander@trainingzone.es";
const ORG_DIRECTOR = "direccion@trainingzone.es";
const LA_JOTA_TRAINER = "entrenador@trainingzone.es";

type StaffList = {
  canManage: boolean;
  centers: { id: string; name: string }[];
  staff: {
    id: string;
    name: string;
    email: string;
    role: string;
    allocations: { centerId: string; centerName: string; pct: number; isPrimary: boolean }[];
  }[];
};

type Centers = { laJotaId: string; santanderId: string; santanderStaffIds: string[]; laJotaStaffIds: string[] };
let centers: Centers;

async function staffOf(centerId: string) {
  const users = await prisma.user.findMany({
    where: {
      role: { not: "MEMBER" },
      deactivatedAt: null,
      OR: [{ centerId }, { centerMemberships: { some: { centerId } } }],
    },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

test.beforeAll(async () => {
  const laJota = await prisma.center.findFirstOrThrow({ where: { name: { contains: "La Jota" } }, select: { id: true } });
  const santander = await prisma.center.findFirstOrThrow({
    where: { name: { contains: "Santander" } },
    select: { id: true },
  });
  centers = {
    laJotaId: laJota.id,
    santanderId: santander.id,
    santanderStaffIds: await staffOf(santander.id),
    laJotaStaffIds: await staffOf(laJota.id),
  };
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

/** Quien esté imputado a los DOS centros (Álex Quijano lo está a propósito en
 *  el seed) no es una fuga: se le ve por su imputación a La Jota. */
function foreignOnly(ids: string[]) {
  return ids.filter((id) => !centers.laJotaStaffIds.includes(id));
}

test.describe("E7-06 · E2 — la plantilla móvil se queda en el centro", () => {
  test("dirección de La Jota no recibe a nadie de Santander", async ({ request }) => {
    const director = await mobileLogin(request, LA_JOTA_DIRECTOR);
    const res = await request.get(`${API_PREFIX}/staff`, { headers: bearer(director) });
    expect(res.status()).toBe(200);

    const body = await jsonOf<StaffList>(res);
    expect(body.ok).toBe(true);
    if (!body.ok) return;

    const received = body.data.staff.map((s) => s.id);
    const leaked = foreignOnly(centers.santanderStaffIds).filter((id) => received.includes(id));
    expect(leaked, "el listado de la app traía la plantilla de Santander con email, rol e imputaciones").toEqual([]);

    // Y no está vacío: la fuga no se tapa devolviendo nada.
    expect(received.length).toBeGreaterThan(0);
    expect(
      received.some((id) => centers.laJotaStaffIds.includes(id)),
      "su propia gente sí tiene que venir"
    ).toBe(true);
  });

  test("ninguna imputación devuelta apunta a un centro ajeno", async ({ request }) => {
    // La fila de plantilla trae `allocations`: un ámbito que filtra la lista
    // pero devuelve las imputaciones enteras seguiría contando en qué centros
    // trabaja cada cual.
    const director = await mobileLogin(request, LA_JOTA_DIRECTOR);
    const body = await jsonOf<StaffList>(await request.get(`${API_PREFIX}/staff`, { headers: bearer(director) }));
    expect(body.ok).toBe(true);
    if (!body.ok) return;

    const centerIds = body.data.centers.map((c) => c.id);
    expect(centerIds, "el selector de centros tampoco ofrece más de lo que gestiona").not.toContain(
      centers.santanderId
    );
    expect(centerIds).toContain(centers.laJotaId);
  });

  test("dirección de Santander ve la suya y no la de La Jota: el filtro es la imputación, no una lista fija", async ({
    request,
  }) => {
    const director = await mobileLogin(request, SANTANDER_DIRECTOR);
    const body = await jsonOf<StaffList>(await request.get(`${API_PREFIX}/staff`, { headers: bearer(director) }));
    expect(body.ok).toBe(true);
    if (!body.ok) return;

    const received = body.data.staff.map((s) => s.id);
    const ownOnly = centers.santanderStaffIds.filter((id) => !centers.laJotaStaffIds.includes(id));
    expect(ownOnly.every((id) => received.includes(id))).toBe(true);

    const foreignLaJota = centers.laJotaStaffIds.filter((id) => !centers.santanderStaffIds.includes(id));
    expect(foreignLaJota.filter((id) => received.includes(id))).toEqual([]);
  });

  test("dirección de organización sí ve los dos centros", async ({ request }) => {
    const owner = await mobileLogin(request, ORG_DIRECTOR);
    const body = await jsonOf<StaffList>(await request.get(`${API_PREFIX}/staff`, { headers: bearer(owner) }));
    expect(body.ok).toBe(true);
    if (!body.ok) return;

    const received = body.data.staff.map((s) => s.id);
    expect(foreignOnly(centers.santanderStaffIds).every((id) => received.includes(id))).toBe(true);
    expect(centers.laJotaStaffIds.every((id) => received.includes(id))).toBe(true);
    expect(body.data.centers.map((c) => c.id)).toEqual(
      expect.arrayContaining([centers.laJotaId, centers.santanderId])
    );
  });

  test("un entrenador no tiene listado de plantilla, y sin token tampoco", async ({ request }) => {
    const trainer = await mobileLogin(request, LA_JOTA_TRAINER);
    const forbidden = await request.get(`${API_PREFIX}/staff`, { headers: bearer(trainer) });
    expect(forbidden.status()).toBe(403);

    const anonymous = await request.get(`${API_PREFIX}/staff`);
    expect(anonymous.status()).toBe(401);
  });

  test("tampoco se edita ni se da de baja por id a alguien de Santander", async ({ request }) => {
    // La ficha no tiene GET (`/staff/[id]` solo expone PATCH y DELETE): lo que
    // hay que cerrar por id es la ESCRITURA, y un id ajeno llega igual de bien
    // aunque el listado ya no lo enseñe.
    const director = await mobileLogin(request, LA_JOTA_DIRECTOR);
    const [foreignId] = foreignOnly(centers.santanderStaffIds);
    expect(foreignId, "el seed tiene que traer plantilla propia de Santander").toBeTruthy();

    const before = await prisma.user.findUniqueOrThrow({
      where: { id: foreignId },
      select: { name: true, deactivatedAt: true },
    });

    const patched = await request.patch(`${API_PREFIX}/staff/${foreignId}`, {
      headers: bearer(director),
      data: { name: "AUDIT-HIJACKED" },
    });
    expect(patched.status()).toBe(404);

    const deleted = await request.delete(`${API_PREFIX}/staff/${foreignId}`, { headers: bearer(director) });
    expect(deleted.status()).toBe(404);

    const after = await prisma.user.findUniqueOrThrow({
      where: { id: foreignId },
      select: { name: true, deactivatedAt: true },
    });
    expect(after, "un 404 que igualmente escribe la fila sigue siendo la fuga").toEqual(before);
  });
});
