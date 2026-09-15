/**
 * E5-15 · Borrado de cuenta desde la app.
 *
 * Lo que se prueba aquí no es la maqueta: es que la pantalla NO invente el
 * texto. Todo lo que el socio lee sobre qué se borra y qué se conserva llega
 * del servidor, y la pantalla lo pinta tal cual. Si alguien "optimiza" la
 * llamada metiendo una copia en el bundle, estos tests se enteran.
 */
import type { AccountDeletionResponse } from "@/api/types";
import { renderWithProviders, fireEvent, screen, waitFor } from "@/test/render";
import { lastRequest, reply, replyError } from "@/test/server";

import DeleteAccountScreen from "@/app/borrar-cuenta";

jest.mock("expo-router", () => ({ router: { push: jest.fn(), back: jest.fn(), canGoBack: () => false, replace: jest.fn() } }));

function deletionResponse(overrides: Partial<AccountDeletionResponse> = {}): AccountDeletionResponse {
  return {
    disclosure: {
      effects: [
        {
          key: "payments",
          label: "Cobros emitidos",
          action: "DISSOCIATE",
          count: 12,
          detail:
            "Se conservan los 12 cobros con su número de recibo, importe, fecha y método, y se les retira el vínculo con la persona.",
          legalBasis: "art. 30 CCom y art. 66 LGT; destruirlos sería el art. 200 LGT",
        },
        {
          key: "healthRecords",
          label: "Datos de salud",
          action: "ANONYMIZE",
          count: null,
          detail: "Tus lesiones y condiciones de salud dejan de estar ligadas a tu persona.",
          legalBasis: "art. 1964 CC, con el plazo que tenga configurado el centro",
        },
      ],
      retention: { billingDays: 2190, healthDays: 1825, pendingLegalReview: true },
      healthCountsVisible: false,
    },
    request: null,
    deadlineText: "Tu centro tiene un mes para atenderla (art. 12.3 RGPD).",
    publicUrl: "https://ejemplo.test/borrar-cuenta",
    ...overrides,
  };
}

describe("Borrar mi cuenta · el texto viene del servidor", () => {
  it("pinta bloque a bloque lo que el servidor dice que pasa con cada dato", async () => {
    reply("GET /portal/account-deletion", deletionResponse());

    renderWithProviders(<DeleteAccountScreen />);

    expect(await screen.findByText("Cobros emitidos")).toBeOnTheScreen();
    expect(screen.getByText(/Se conservan los 12 cobros/)).toBeOnTheScreen();
    // Escenario 4: el rótulo del cobro dice que se conserva, nunca que se borra.
    expect(screen.getAllByText("Se conserva sin tu nombre").length).toBeGreaterThan(0);
    expect(screen.getByText(/art\. 30 CCom/)).toBeOnTheScreen();
  });

  it("los plazos y su marca de pendiente salen del servidor, no del bundle", async () => {
    reply("GET /portal/account-deletion", deletionResponse());

    renderWithProviders(<DeleteAccountScreen />);

    expect(await screen.findByText(/2190 días/)).toBeOnTheScreen();
    expect(screen.getByText(/⟦PENDIENTE: validación jurídica de los plazos/)).toBeOnTheScreen();
  });

  it("no enumera los registros de salud del socio", async () => {
    reply("GET /portal/account-deletion", deletionResponse());

    renderWithProviders(<DeleteAccountScreen />);

    expect(await screen.findByText("Datos de salud")).toBeOnTheScreen();
    // El recuento llega a `null` desde el servidor (`health-access.ts` devuelve
    // `null` para el rol MEMBER) y la pantalla no lo suple con nada.
    expect(screen.queryByText(/registros de salud: \d+/)).not.toBeOnTheScreen();
  });
});

describe("Borrar mi cuenta · confirmación con contraseña", () => {
  it("no deja pedirlo sin marcar que se ha leído y sin contraseña", async () => {
    reply("GET /portal/account-deletion", deletionResponse());

    renderWithProviders(<DeleteAccountScreen />);

    const button = await screen.findByText("Pedir el borrado de mi cuenta");
    fireEvent.press(button);

    // Ni una sola petición: el botón está deshabilitado hasta que las dos
    // condiciones se cumplen.
    expect(lastRequest("POST /portal/account-deletion")).toBeUndefined();
  });

  it("manda la contraseña y refresca el estado al confirmar", async () => {
    reply("GET /portal/account-deletion", deletionResponse());
    reply("POST /portal/account-deletion", {
      request: {
        id: "req-1",
        status: "PENDING",
        source: "MOBILE_APP",
        requestedAt: "2026-09-15T08:00:00.000Z",
        dueAt: "2026-10-15T08:00:00.000Z",
        resolvedAt: null,
        resolutionNotes: null,
      },
      alreadyOpen: false,
    });
    reply(
      "GET /portal/account-deletion",
      deletionResponse({
        request: {
          id: "req-1",
          status: "PENDING",
          source: "MOBILE_APP",
          requestedAt: "2026-09-15T08:00:00.000Z",
          dueAt: "2026-10-15T08:00:00.000Z",
          resolvedAt: null,
          resolutionNotes: null,
        },
      }),
    );

    renderWithProviders(<DeleteAccountScreen />);

    fireEvent.press(await screen.findByLabelText("He leído qué se borra y qué se conserva"));
    fireEvent.changeText(screen.getByPlaceholderText("Para confirmar que eres tú"), "mi-contrasena");
    fireEvent.press(screen.getByText("Pedir el borrado de mi cuenta"));

    await waitFor(() => expect(lastRequest("POST /portal/account-deletion")?.body).toEqual({ password: "mi-contrasena" }));
    // Escenario 3: al volver, lo que ve es su plazo, no el formulario otra vez.
    expect(await screen.findByText("Tu solicitud está en curso")).toBeOnTheScreen();
    expect(screen.getByText(/15 de octubre de 2026/)).toBeOnTheScreen();
  });

  it("una contraseña incorrecta se dice en el campo, sin borrar lo que ya leyó", async () => {
    reply("GET /portal/account-deletion", deletionResponse());
    replyError("POST /portal/account-deletion", "La contraseña no es correcta.", 401);

    renderWithProviders(<DeleteAccountScreen />);

    fireEvent.press(await screen.findByLabelText("He leído qué se borra y qué se conserva"));
    fireEvent.changeText(screen.getByPlaceholderText("Para confirmar que eres tú"), "la-que-no-es");
    fireEvent.press(screen.getByText("Pedir el borrado de mi cuenta"));

    // Dos veces: bajo el campo (queda) y en el aviso efímero (se va).
    expect(await screen.findAllByText("La contraseña no es correcta.")).toHaveLength(2);
    expect(screen.getByText("Cobros emitidos")).toBeOnTheScreen();
  });
});

describe("Borrar mi cuenta · solicitud ya en curso", () => {
  it("enseña la fecha límite y no vuelve a ofrecer el formulario", async () => {
    reply(
      "GET /portal/account-deletion",
      deletionResponse({
        request: {
          id: "req-1",
          status: "PENDING",
          source: "WEB_PORTAL",
          requestedAt: "2026-09-01T08:00:00.000Z",
          dueAt: "2026-10-01T08:00:00.000Z",
          resolvedAt: null,
          resolutionNotes: null,
        },
      }),
    );

    renderWithProviders(<DeleteAccountScreen />);

    expect(await screen.findByText("Tu solicitud está en curso")).toBeOnTheScreen();
    // Escenario 2: pedida desde la web, se ve igual en la app. Una sola fila.
    expect(screen.getByText(/desde el portal web/)).toBeOnTheScreen();
    expect(screen.queryByText("Pedir el borrado de mi cuenta")).not.toBeOnTheScreen();
  });

  it("una solicitud resuelta enseña qué se hizo", async () => {
    reply(
      "GET /portal/account-deletion",
      deletionResponse({
        request: {
          id: "req-1",
          status: "COMPLETED",
          source: "MOBILE_APP",
          requestedAt: "2026-08-01T08:00:00.000Z",
          dueAt: "2026-09-01T08:00:00.000Z",
          resolvedAt: "2026-08-12T08:00:00.000Z",
          resolutionNotes: "Datos borrados; los cobros se disocian por conservación obligatoria.",
        },
      }),
    );

    renderWithProviders(<DeleteAccountScreen />);

    expect(await screen.findByText("Tu solicitud está resuelta")).toBeOnTheScreen();
    expect(screen.getByText(/los cobros se disocian/)).toBeOnTheScreen();
  });
});
