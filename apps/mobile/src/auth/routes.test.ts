/**
 * E13-01 (D-M4): la app se recorta a MEMBER y TRAINER/TRAINER_ADMIN.
 */
import { homeRouteFor, homeTabFor, isAppSupportedRole, isTrainerRole, needsMembership, TABS_BY_ROLE, tabsFor } from "@/auth/routes";
import { meResponse } from "@/test/fixtures";
import type { Role } from "@/api/types";

const ALL_ROLES: Role[] = [
  "MEMBER",
  "TRAINER",
  "TRAINER_ADMIN",
  "OWNER",
  "CENTER_DIRECTOR",
  "PLATFORM_ADMIN",
  "RECEPTION",
  "HR_MANAGER",
];
const UNSUPPORTED: Role[] = ["OWNER", "CENTER_DIRECTOR", "PLATFORM_ADMIN", "RECEPTION", "HR_MANAGER"];

describe("isAppSupportedRole", () => {
  it("solo MEMBER y TRAINER/TRAINER_ADMIN tienen la app", () => {
    expect(isAppSupportedRole("MEMBER")).toBe(true);
    expect(isAppSupportedRole("TRAINER")).toBe(true);
    expect(isAppSupportedRole("TRAINER_ADMIN")).toBe(true);
  });

  it("los otros cinco roles del dominio no tienen la app", () => {
    for (const role of UNSUPPORTED) {
      expect(isAppSupportedRole(role)).toBe(false);
    }
  });
});

describe("TABS_BY_ROLE", () => {
  it("solo declara pestañas para MEMBER y TRAINER/TRAINER_ADMIN", () => {
    expect(Object.keys(TABS_BY_ROLE).sort()).toEqual(["MEMBER", "TRAINER", "TRAINER_ADMIN"].sort());
  });

  it("un rol sin pestañas declaradas cae al menos en «Más»", () => {
    expect(tabsFor("OWNER")).toEqual(["mas"]);
    expect(homeTabFor("OWNER")).toBe("/mas");
  });
});

describe("E5-14 (D-M3): sin bono vivo, la app no redirige al catálogo", () => {
  it("needsMembership es cierto solo para un socio sin bono activo", () => {
    expect(needsMembership(meResponse({ role: "MEMBER", member: { id: "m1", firstName: "Ana", centerName: "TZ", hasActiveMembership: false } }))).toBe(true);
    expect(needsMembership(meResponse({ role: "MEMBER", member: { id: "m1", firstName: "Ana", centerName: "TZ", hasActiveMembership: true } }))).toBe(false);
    expect(needsMembership(meResponse({ role: "TRAINER", member: null }))).toBe(false);
  });

  it("homeRouteFor manda a las tabs del rol, nunca al catálogo, aunque no haya bono vivo", () => {
    const user = meResponse({ role: "MEMBER", member: { id: "m1", firstName: "Ana", centerName: "TZ", hasActiveMembership: false } });
    expect(homeRouteFor(user)).toBe(homeTabFor("MEMBER"));
    expect(homeRouteFor(user)).not.toBe("/onboarding/planes");
  });
});

describe("E7-03 · T11: tabsFor, homeTabFor y homeRouteFor por rol", () => {
  it.each(ALL_ROLES)("%s siempre resuelve al menos una pestaña y una ruta de aterrizaje", (role) => {
    const tabs = tabsFor(role);
    expect(tabs.length).toBeGreaterThan(0);
    expect(homeTabFor(role)).toBeTruthy();
    expect(homeRouteFor(meResponse({ role, member: null }))).toBeTruthy();
  });

  it("solo MEMBER y TRAINER/TRAINER_ADMIN aterrizan fuera de «mas»", () => {
    for (const role of ALL_ROLES) {
      const first = tabsFor(role)[0];
      if (isAppSupportedRole(role)) expect(first).not.toBe("mas");
      else expect(first).toBe("mas");
    }
  });
});

describe("E7-03 · T12: paridad de permisos con el recorte de E13-01", () => {
  it("isAppSupportedRole coincide exactamente con isTrainerRole + MEMBER", () => {
    for (const role of ALL_ROLES) {
      expect(isAppSupportedRole(role)).toBe(role === "MEMBER" || isTrainerRole(role));
    }
  });

  it("TABS_BY_ROLE no declara ninguna fila para un rol no soportado", () => {
    for (const role of UNSUPPORTED) {
      expect(TABS_BY_ROLE[role]).toBeUndefined();
    }
  });
});
