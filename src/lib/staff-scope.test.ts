import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import type { Role } from "@prisma/client";
import { staffScopeWhere } from "./staff-queries";
import { canEditStaff, canDeleteStaff, canManageStaff } from "./rbac";

/**
 * La frontera del CRUD de plantilla (RB-RRHH-014). Lo que se fija aquí no es
 * cómo se dibuja la tabla —eso se puede rehacer— sino a quién alcanza cada rol:
 * el `where` de `staffScopeWhere` es lo único que impide que dirección de
 * centro edite o dé de baja a alguien de otro centro, y lo aplican por igual el
 * listado, la edición y la baja (`findStaffInScope`).
 */

const CENTERS = ["c-lajota", "c-puertacarmen"];

test("dirección de organización, soporte y RRHH ven la plantilla entera", () => {
  for (const role of ["OWNER", "PLATFORM_ADMIN", "HR_MANAGER"] as Role[]) {
    assert.deepEqual(staffScopeWhere(role, []), {}, role);
    assert.equal(canManageStaff(role), true, role);
  }
});

test("dirección de centro queda acotada a sus centros", () => {
  const where = staffScopeWhere("CENTER_DIRECTOR", CENTERS);
  assert.deepEqual(where.OR, [
    { centerId: { in: CENTERS } },
    { centerMemberships: { some: { centerId: { in: CENTERS } } } },
  ]);
});

// El caso que rompe si el filtro se relaja: sin él, una dirección de centro
// podía dar de baja a la dirección de la organización, a RRHH o al soporte de
// plataforma — que no son "de su centro" y mandan por encima de ella.
test("dirección de centro no alcanza a los roles de ámbito organización", () => {
  const where = staffScopeWhere("CENTER_DIRECTOR", CENTERS);
  assert.deepEqual(where.role, { notIn: ["OWNER", "PLATFORM_ADMIN", "HR_MANAGER"] });
});

// El filtro trae su propio `role`, así que quien lo use tiene que componerlo
// bajo `AND` en vez de esparcirlo: fusionado pisa al `role: { not: "MEMBER" }`
// de la consulta y la plantilla se llena de socios.
test("el filtro de ámbito lleva su propia condición de rol", () => {
  assert.ok("role" in staffScopeWhere("CENTER_DIRECTOR", CENTERS));
  assert.ok(!("role" in staffScopeWhere("OWNER", CENTERS)));
});

test("sin centros a su cargo, dirección de centro no alcanza a nadie", () => {
  const where = staffScopeWhere("CENTER_DIRECTOR", []);
  // Un `in: []` no casa con ninguna fila: el ámbito vacío no se convierte en
  // "toda la organización", que es el fallo clásico de este tipo de filtros.
  assert.deepEqual(where.OR, [
    { centerId: { in: [] } },
    { centerMemberships: { some: { centerId: { in: [] } } } },
  ]);
});

test("editar plantilla es de dirección y RRHH; darla de baja, solo de dirección", () => {
  assert.deepEqual(
    (["OWNER", "PLATFORM_ADMIN", "HR_MANAGER", "CENTER_DIRECTOR"] as Role[]).map(canEditStaff),
    [true, true, true, true]
  );
  // RRHH da de alta e imputa, pero no saca a nadie del equipo.
  assert.equal(canDeleteStaff("HR_MANAGER"), false);
  assert.equal(canDeleteStaff("CENTER_DIRECTOR"), true);
  assert.equal(canDeleteStaff("OWNER"), true);
});

test("nadie por debajo de dirección toca la plantilla", () => {
  for (const role of ["TRAINER", "TRAINER_ADMIN", "RECEPTION", "MEMBER"] as Role[]) {
    assert.equal(canEditStaff(role), false, role);
    assert.equal(canDeleteStaff(role), false, role);
  }
});
