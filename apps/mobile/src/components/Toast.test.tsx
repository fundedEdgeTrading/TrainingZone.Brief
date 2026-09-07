/**
 * E8-07: el toast anuncia a lectores de pantalla (accessibilityLiveRegion +
 * announceForAccessibility) y los mensajes críticos no se autoocultan.
 */
import { AccessibilityInfo, Button } from "react-native";

import { ToastProvider, useToast } from "@/components/Toast";
import { fireEvent, renderWithProviders, screen } from "@/test/render";

function Trigger() {
  const toast = useToast();
  return (
    <>
      <Button title="ok" onPress={() => toast.show("Reserva confirmada.", "good")} />
      <Button title="fail" onPress={() => toast.show("No se pudo guardar.", "critical")} />
    </>
  );
}

describe("Toast", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("anuncia el mensaje con announceForAccessibility y accessibilityLiveRegion", () => {
    const announceSpy = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    renderWithProviders(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );

    fireEvent.press(screen.getByText("ok"));

    expect(announceSpy).toHaveBeenCalledWith("Reserva confirmada.");
    expect(screen.getByTestId("toast").props.accessibilityLiveRegion).toBe("polite");
  });

  it("un aviso crítico no se autooculta con el tiempo", () => {
    renderWithProviders(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );

    fireEvent.press(screen.getByText("fail"));
    expect(screen.getByText("No se pudo guardar.")).toBeOnTheScreen();

    jest.advanceTimersByTime(10_000);

    expect(screen.getByText("No se pudo guardar.")).toBeOnTheScreen();
  });

  it("un aviso crítico se puede cerrar a mano", () => {
    renderWithProviders(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );

    fireEvent.press(screen.getByText("fail"));
    fireEvent.press(screen.getByLabelText("Cerrar aviso"));

    expect(screen.queryByText("No se pudo guardar.")).not.toBeOnTheScreen();
  });
});
