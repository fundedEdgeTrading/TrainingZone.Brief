import test from "node:test";
import assert from "node:assert/strict";
import type { Role } from "@prisma/client";
import { checkStaffRole, STAFF_ROLES } from "./staff-roles";

/**
 * QA-ALTA-01 · La política de roles de la plantilla. Antes del arreglo
 * `PLATFORM_ADMIN` estaba en `STAFF_ROLES` y la guarda solo pedía
 * `canManageOrg`, que un OWNER cumple: se ascendía a soporte de Apta.
 */

const actor = (role: Role, isPlatformOperator = false) => ({ role, isPlatformOperator });

test("QA-ALTA-01 · PLATFORM_ADMIN no es un rol de plantilla", () => {
  assert.equal(STAFF_ROLES.includes("PLATFORM_ADMIN"), false);
});

test("QA-ALTA-01 · un OWNER no puede dar PLATFORM_ADMIN (ni a otro ni a sí mismo)", () => {
  const result = checkStaffRole(actor("OWNER"), "PLATFORM_ADMIN");
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.status, 403);
});

test("QA-ALTA-01 · RRHH tampoco puede dar PLATFORM_ADMIN", () => {
  assert.equal(checkStaffRole(actor("HR_MANAGER"), "PLATFORM_ADMIN").ok, false);
});

test("QA-ALTA-01 · un PLATFORM_ADMIN que no es de la organización de plataforma no puede darlo", () => {
  // Es exactamente el que se fabricó un OWNER con el fallo: no debe poder
  // seguir repartiéndolo.
  assert.equal(checkStaffRole(actor("PLATFORM_ADMIN", false), "PLATFORM_ADMIN").ok, false);
});

test("QA-ALTA-01 · soporte de Apta de verdad sí puede dar PLATFORM_ADMIN", () => {
  assert.deepEqual(checkStaffRole(actor("PLATFORM_ADMIN", true), "PLATFORM_ADMIN"), { ok: true, role: "PLATFORM_ADMIN" });
});

test("OWNER sigue sin poder darlo RRHH, y un OWNER sí", () => {
  assert.equal(checkStaffRole(actor("HR_MANAGER"), "OWNER").ok, false);
  assert.deepEqual(checkStaffRole(actor("OWNER"), "OWNER"), { ok: true, role: "OWNER" });
});

test("roles de centro para quien gestiona plantilla, y un rol inventado se rechaza con 400", () => {
  assert.deepEqual(checkStaffRole(actor("HR_MANAGER"), "TRAINER"), { ok: true, role: "TRAINER" });
  const bogus = checkStaffRole(actor("OWNER"), "MEMBER");
  assert.equal(!bogus.ok && bogus.status, 400);
});
