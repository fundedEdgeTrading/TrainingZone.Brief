import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROLE_LABEL, NAV_BY_ROLE } from "@/lib/rbac";

/**
 * E8-18 · diccionario único de rótulos y matriz única de permisos.
 *
 * `rbac.ts` está congelado este trimestre, y web y app móvil son dos
 * toolchains separados que no pueden compartir un módulo TS en tiempo de
 * build. Sin poder fusionarlos en un único fichero, este test hace de
 * "módulo único" de facto: extrae el `ROLE_LABEL` de la app (una copia
 * deliberadamente paralela, `apps/mobile/src/app/(tabs)/perfil.tsx`) y lo
 * compara literalmente contra el de `rbac.ts` para que no puedan volver a
 * divergir en silencio (antes decían "Dirección"/"Administración" en la app
 * y "Dirección de organización"/"Admin plataforma" en la web para el mismo
 * rol).
 */

function extractMobileRoleLabel(): Record<string, string> {
  const source = readFileSync(join("apps", "mobile", "src", "app", "(tabs)", "perfil.tsx"), "utf8");
  const block = source.slice(source.indexOf("const ROLE_LABEL"), source.indexOf("};", source.indexOf("const ROLE_LABEL")));
  const entries: Record<string, string> = {};
  for (const m of block.matchAll(/(\w+):\s*"([^"]+)"/g)) entries[m[1]] = m[2];
  return entries;
}

test("E8-18 · ROLE_LABEL de la app móvil es idéntico, rol a rol, al de rbac.ts", () => {
  const mobile = extractMobileRoleLabel();
  for (const [role, label] of Object.entries(ROLE_LABEL)) {
    assert.equal(mobile[role], label, `el rol ${role} dice "${mobile[role]}" en la app y "${label}" en rbac.ts`);
  }
});

test("E8-18 · la sección \"Organización\" se llama igual en la app que en la web", () => {
  const layout = readFileSync(join("apps", "mobile", "src", "app", "(tabs)", "_layout.tsx"), "utf8");
  assert.match(layout, /organizacion:\s*\{\s*label:\s*"Organización"/);
  // La propia web ya usa "Organización" para /organization en todos los roles.
  for (const items of Object.values(NAV_BY_ROLE)) {
    for (const item of items) {
      if (item.href === "/organization") assert.equal(item.label, "Organización");
    }
  }
});

test("E8-18 · paridad de capacidades: lo que ve TRAINER en la web tiene su pestaña en la app", () => {
  const trainerHrefs = new Set(NAV_BY_ROLE.TRAINER.map((i) => i.href));
  assert.ok(trainerHrefs.has("/trainer"));
  assert.ok(trainerHrefs.has("/agenda"));
  assert.ok(trainerHrefs.has("/tareas"));
  assert.ok(trainerHrefs.has("/brief"));
  assert.ok(trainerHrefs.has("/members"));
  assert.ok(trainerHrefs.has("/leads"));

  const layout = readFileSync(join("apps", "mobile", "src", "app", "(tabs)", "_layout.tsx"), "utf8");
  // Mi panel, Agenda (staff), Tareas, Brief, Socios, Leads: las seis
  // capacidades de TRAINER, cada una con su propia pestaña en la app.
  for (const tabKey of ["panel", "staff-agenda", "tareas", "brief", "mis-socios", "leads"]) {
    assert.match(layout, new RegExp(`"?${tabKey}"?:\\s*\\{`), `falta la pestaña "${tabKey}" en la app`);
  }
});

test("E8-18 · paridad de capacidades: lo que ve MEMBER en la web tiene su pestaña en la app", () => {
  const memberHrefs = new Set(NAV_BY_ROLE.MEMBER.map((i) => i.href));
  assert.ok(memberHrefs.has("/portal"));
  assert.ok(memberHrefs.has("/portal/agenda"));
  assert.ok(memberHrefs.has("/portal/evolucion"));
  assert.ok(memberHrefs.has("/portal/membresia"));

  const layout = readFileSync(join("apps", "mobile", "src", "app", "(tabs)", "_layout.tsx"), "utf8");
  // Mi actividad, Reservar clase, Mi evolución, Mi membresía (bonos/consumo).
  for (const tabKey of ["index", "agenda", "evolucion", "bonos"]) {
    assert.match(layout, new RegExp(`"?${tabKey}"?:\\s*\\{`), `falta la pestaña "${tabKey}" en la app`);
  }
});

test("E8-18 · los iconos compartidos con la app usan la misma geometría de trazo", () => {
  const navIcons = readFileSync(join("src", "components", "nav-icons.tsx"), "utf8");
  const mobileIcon = readFileSync(join("apps", "mobile", "src", "components", "Icon.tsx"), "utf8");

  // Agenda/calendar, Cobros/wallet, Organización/building, Actividad/activity:
  // los cuatro `d` de trazo se copian literalmente de la app (mejor
  // construidos, según la propia historia) al icono web equivalente.
  const sharedPaths = [
    "M4 6.5h16v14H4z",
    "M3.5 7.5h14A2.5 2.5 0 0 1 20 10v8.5H6a2.5 2.5 0 0 1-2.5-2.5z",
    "M5 21V4.5h14V21",
    "M3 12h4l2.5-7 4 14 2.5-7H21",
  ];
  for (const d of sharedPaths) {
    assert.ok(navIcons.includes(d), `falta en nav-icons.tsx: ${d}`);
    assert.ok(mobileIcon.includes(d), `falta en Icon.tsx: ${d}`);
  }
});
