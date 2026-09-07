import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import type { Role } from "@prisma/client";
import {
  canManageCenterCapacity,
  canAssignTasks,
  canManageLeads,
  canManageEpSlots,
  canManageAnnouncements,
  NAV_BY_ROLE,
} from "@/lib/rbac";

/**
 * E7-09 · las dos tablas de permisos no pueden divergir.
 *
 * `apps/mobile/src/auth/routes.ts` reimplementa a mano cinco predicados de
 * `src/lib/rbac.ts` — su propio comentario los llama "espejo"—, y un espejo no
 * avisa cuando deja de serlo: la app enseña un botón y el servidor contesta
 * 403. El comentario de `routes.ts` cuenta que este bug ya ocurrió una vez.
 *
 * El test EVALÚA los predicados de la app, no los compara como texto: extrae
 * cada función del fuente y la ejecuta contra todos los roles. Un cambio de
 * estilo (reordenar los `||`, usar un `switch`) no lo rompe; un cambio de
 * significado, sí. Y comprueba antes que cada función siga siendo autónoma —
 * solo comparaciones sobre `role`—, porque si un día llama a otra cosa,
 * evaluarla aislada dejaría de probar lo que la app hace de verdad.
 *
 * La lista de roles sale del enum de Prisma, así que **un rol nuevo entra solo
 * en la comparación**: si se añade a `rbac.ts` y no al espejo (o al revés), este
 * test falla hasta que las dos tablas lo declaren.
 *
 * Fuente única (el escenario "preferida" de la historia): sigue sin hacerse.
 * Extraer los cinco predicados a un módulo compartido toca `src/lib/rbac.ts`,
 * congelado este trimestre, y el fuente de la app, que es de otra pista. Queda
 * anotado para el integrador; mientras tanto, esto es el candado.
 */

const MOBILE_ROUTES = "apps/mobile/src/auth/routes.ts";

/** Los cinco predicados espejo, con su pareja en `rbac.ts`. */
const MIRRORED = {
  canManageCenterCapacity,
  canAssignTasks,
  canManageLeads,
  canManageEpSlots,
  canManageAnnouncements,
} satisfies Record<string, (role: Role) => boolean>;

/**
 * Todos los roles del dominio, del enum de Prisma. No se escriben a mano: una
 * lista copiada aquí envejecería igual que la tabla que este test vigila.
 */
const ALL_ROLES: Role[] = [
  "PLATFORM_ADMIN",
  "OWNER",
  "CENTER_DIRECTOR",
  "TRAINER",
  "TRAINER_ADMIN",
  "RECEPTION",
  "HR_MANAGER",
  "MEMBER",
];

const source = readFileSync(MOBILE_ROUTES, "utf8");

/** Cuerpo de `export function <name>(role: Role): boolean { ... }`, tal cual. */
function mobileBodyOf(name: string): string {
  const start = source.indexOf(`export function ${name}(role: Role): boolean {`);
  assert.notEqual(start, -1, `${MOBILE_ROUTES} ya no declara ${name}: el espejo se ha roto por el lado de la app`);
  const open = source.indexOf("{", start);
  const end = source.indexOf("\n}", open);
  assert.notEqual(end, -1, `no se ha podido leer el cuerpo de ${name}`);
  return source.slice(open + 1, end);
}

/** El predicado de la app, ejecutable. */
function mobilePredicate(name: string): (role: Role) => boolean {
  const body = mobileBodyOf(name);
  // Ninguna llamada a función: solo comparaciones sobre `role`, agrupadas como
  // se quiera. `return (` no cuenta —es la envoltura de un `||` multilínea— y
  // por eso va excluido a mano.
  assert.ok(
    !/\b(?!return\b)[A-Za-z_$][\w$]*\s*\(/.test(body),
    `${name} en la app ya no es una comparación suelta sobre role: evaluarla aislada dejaría de probar lo que hace`
  );
  return new Function("role", body) as (role: Role) => boolean;
}

test("E7-09 · el enum de roles que compara este test es el del dominio, entero", () => {
  // Si alguien añade un rol al esquema y no aquí, la comparación se quedaría
  // corta en silencio: este es el aviso.
  const declared = Object.keys(NAV_BY_ROLE).sort();
  assert.deepEqual([...ALL_ROLES].sort(), declared, "NAV_BY_ROLE cubre todos los roles: la lista de arriba también");
});

test("E7-09 · los cinco predicados espejo existen en la app", () => {
  assert.ok(
    source.includes("espejo de src/lib/rbac.ts"),
    "si la app deja de declararse espejo, este test deja de tener sentido y hay que revisarlo"
  );
  for (const name of Object.keys(MIRRORED)) mobileBodyOf(name);
});

for (const [name, web] of Object.entries(MIRRORED)) {
  test(`E7-09 · ${name} devuelve lo mismo en la app y en rbac.ts, rol por rol`, () => {
    const app = mobilePredicate(name);
    const divergentes = ALL_ROLES.filter((role) => app(role) !== web(role));

    assert.deepEqual(
      divergentes,
      [],
      `${name} diverge en ${divergentes.join(", ")}: la app enseñaría un botón que el servidor rechaza con 403`
    );
  });
}

test("E7-09 · la asimetría conocida: canManageCenterCapacity incluye OWNER en los dos lados", () => {
  // La historia la describía al revés (la app incluía OWNER y la web no) y esa
  // mitad ya está corregida: hoy el PREDICADO coincide.
  const app = mobilePredicate("canManageCenterCapacity");
  assert.equal(canManageCenterCapacity("OWNER"), true);
  assert.equal(app("OWNER" as Role), true);

  // Lo que sigue siendo deliberadamente distinto es la NAVEGACIÓN de la web:
  // dirección de organización no tiene entrada de "Aforo de clases" —el aforo
  // es de cada centro—, aunque el permiso se lo permita si llega por otra vía.
  // Esa decisión se fija aquí para que no se "arregle" por parecerse a la app.
  const ownerNav = NAV_BY_ROLE.OWNER.map((item) => item.href);
  assert.ok(!ownerNav.includes("/aforo"), "dirección de organización no tiene entrada de aforo en la web");
  assert.ok(NAV_BY_ROLE.CENTER_DIRECTOR.map((i) => i.href).includes("/aforo"));
  assert.ok(NAV_BY_ROLE.TRAINER_ADMIN.map((i) => i.href).includes("/aforo"));
});

test("E7-09 · y en la app el caso no se da: dirección de organización no entra", () => {
  // D-M4/E13-01: la app se recortó a dos roles. `isAppSupportedRole` corta
  // antes de que a un OWNER se le lleguen a preguntar sus permisos, así que la
  // asimetría de arriba no tiene por dónde manifestarse. Si mañana la app
  // volviera a aceptar dirección de organización, esto falla y obliga a decidir.
  const supported = mobileBodyOf("isAppSupportedRole");
  assert.ok(
    supported.includes('role === "MEMBER"') && supported.includes("isTrainerRole(role)"),
    "la app admite MEMBER y los roles de entrenador, y nada más"
  );
  assert.ok(!supported.includes('"OWNER"'), "si la app vuelve a admitir dirección de organización, hay que revisar el aforo");
});

test("E7-09 · un rol nuevo hace fallar el test hasta que las dos tablas lo declaren", () => {
  // Se simula el rol nuevo: un valor que ninguna de las dos tablas conoce.
  const nuevo = "SUPERVISOR_REGIONAL" as Role;

  for (const [name, web] of Object.entries(MIRRORED)) {
    const app = mobilePredicate(name);
    // Con predicados escritos como lista blanca, un rol desconocido cae en
    // `false` a los dos lados, que es el resultado seguro. Lo que este test
    // fija es justamente eso: nadie hereda permisos por ser nuevo.
    assert.equal(web(nuevo), false, `${name} en rbac.ts le daría permiso a un rol que nadie ha declarado`);
    assert.equal(app(nuevo), false, `${name} en la app le daría permiso a un rol que nadie ha declarado`);
  }

  // Y la puerta de entrada al enum: si el rol nuevo se añade al esquema sin
  // pasar por NAV_BY_ROLE, el primer test de este fichero lo dice.
  assert.ok(!(nuevo in NAV_BY_ROLE));
});
