/**
 * E13-01 (D-M4): a quien inicia sesión con un rol que la app ya no lleva se le
 * explica, con el enlace a la web, dónde está su trabajo — nunca una rejilla
 * vacía.
 */
import { Linking } from "react-native";
import { fireEvent } from "@testing-library/react-native";

import { UnsupportedRoleScreen } from "@/components/UnsupportedRoleScreen";
import { renderWithProviders, screen } from "@/test/render";

describe("UnsupportedRoleScreen", () => {
  it("explica que el trabajo se hace desde la web y ofrece el enlace", () => {
    const spy = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined as never);

    renderWithProviders(<UnsupportedRoleScreen role="PLATFORM_ADMIN" />);

    expect(screen.getByText("Tu trabajo se hace desde la web")).toBeOnTheScreen();
    fireEvent.press(screen.getByText("Abrir el portal web"));
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
