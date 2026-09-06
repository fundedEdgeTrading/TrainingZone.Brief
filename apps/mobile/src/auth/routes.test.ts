/**
 * E13-01 (D-M4): la app se recorta a MEMBER y TRAINER/TRAINER_ADMIN.
 */
import { homeTabFor, isAppSupportedRole, TABS_BY_ROLE, tabsFor } from "@/auth/routes";
import type { Role } from "@/api/types";

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
