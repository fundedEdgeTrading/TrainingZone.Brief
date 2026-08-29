import { test, expect } from "@playwright/test";
import { prisma } from "@/lib/prisma";
import { loginAs } from "./helpers";
import { createBookingMember, deleteBookingMembers, type Fixture } from "./fixtures/booking-members";

const toast = (page: import("@playwright/test").Page) => page.locator("[role=status], [role=alert]");

/**
 * Reserva y cancelación de una plaza de grupo reducido HECHAS DESDE EL ROSTER
 * por el staff: el cliente que llama por teléfono o se planta en el mostrador.
 * Lo que se comprueba de punta a punta es que esa reserva es una reserva de
 * verdad —descuenta el bono del socio y se lo devuelve al cancelar—, y no un
 * apunte suelto en el roster.
 *
 * La regla de negocio en sí (bono, aforo, carrera por la plaza liberada) la
 * cubre `src/lib/agenda-booking.test.ts`; aquí se cubre el camino de la
 * pantalla, que es lo que ese test no ve.
 */
test.describe("F11 — Reserva de plaza desde la agenda", () => {
  let socio: Fixture;
  let sessionId: string;
  let day: Date;

  test.beforeAll(async () => {
    socio = await createBookingMember({ tag: "staffbooking", service: "GROUP" });

    const trainer = await prisma.user.findFirstOrThrow({ where: { email: "entrenador@trainingzone.es" } });
    day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() + 1);
    if (day.getDay() === 0) day.setDate(day.getDate() + 1); // el centro no abre en domingo

    const session = await prisma.classSession.create({
      data: {
        orgId: trainer.orgId,
        centerId: trainer.centerId!,
        name: `Grupo staff booking ${Date.now()}`,
        classType: "Grupo reducido",
        date: day,
        startTime: "12:00",
        endTime: "13:00",
        capacity: 4,
        trainerId: trainer.id,
      },
    });
    sessionId = session.id;
  });

  test.afterAll(async () => {
    await prisma.booking.deleteMany({ where: { sessionId } });
    await prisma.classSession.deleteMany({ where: { id: sessionId } });
    await deleteBookingMembers([socio]);
  });

  test("recepción reserva la plaza de un socio y al cancelarla le devuelve la sesión", async ({ page }) => {
    const balance = async () =>
      (await prisma.subscription.findFirstOrThrow({ where: { memberId: socio.memberId, status: "ACTIVE" } }))
        .sessionsRemaining;
    const before = await balance();

    await loginAs(page, "recepcion.lajota@trainingzone.es");
    const d = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    await page.goto(`/agenda/session/${sessionId}?d=${d}`);

    await page.locator('button[aria-haspopup="listbox"]').first().click();
    await page.getByPlaceholder("Buscar...").fill(socio.fullName);
    await page.getByRole("button", { name: socio.fullName, exact: false }).first().click();
    await page.getByRole("button", { name: "Reservar plaza" }).click();
    await expect(toast(page).getByText(/Plaza reservada/)).toBeVisible({ timeout: 15_000 });

    // El socio aparece en el roster y su bono ha pagado la plaza.
    await expect(page.getByRole("link", { name: socio.fullName })).toBeVisible({ timeout: 15_000 });
    const booking = await prisma.booking.findFirstOrThrow({ where: { sessionId, memberId: socio.memberId } });
    expect(booking.status).toBe("BOOKED");
    expect(booking.subscriptionId).not.toBeNull();
    expect(await balance()).toBe((before ?? 0) - 1);

    // Y el reverso: cancelar desde el mismo roster le devuelve la sesión.
    await page.getByRole("button", { name: `Cancelar la reserva de ${socio.fullName}` }).click();
    await expect(toast(page).getByText(/Reserva de .* cancelada/)).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(async () => (await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status, {
        timeout: 15_000,
      })
      .toBe("CANCELLED");
    expect(await balance()).toBe(before);
  });
});
