import crypto from "crypto";
import { test, expect, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Alta pago-primero sin depender de la red: se firma el evento con el mismo
 * secreto que verifica el webhook. No cubre la llamada a la API de Stripe para
 * crear la sesión de checkout — eso necesita credenciales reales.
 */
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

function checkoutCompleted(sessionId: string, email: string, planCode: string, name: string) {
  return {
    id: `evt_${sessionId}`,
    type: "checkout.session.completed",
    data: {
      object: {
        id: sessionId,
        object: "checkout.session",
        customer: `cus_${sessionId}`,
        subscription: `sub_${sessionId}`,
        metadata: { planCode },
        customer_details: { email, name, tax_ids: [{ type: "es_cif", value: "B99999999" }] },
      },
    },
  };
}

async function postSigned(request: APIRequestContext, body: unknown) {
  const payload = JSON.stringify(body);
  const ts = Math.floor(Date.now() / 1000);
  const signature = crypto.createHmac("sha256", WEBHOOK_SECRET!).update(`${ts}.${payload}`).digest("hex");
  return request.post("/api/stripe/webhook", {
    headers: { "content-type": "application/json", "stripe-signature": `t=${ts},v1=${signature}` },
    data: payload,
  });
}

/** Nombre fiscal de las organizaciones que crea este spec, para poder limpiarlas. */
const E2E_ORG_NAME = "GIMNASIO E2E SL";

test.describe("F3 — Alta pago-primero", () => {
  test.skip(!WEBHOOK_SECRET, "Requiere STRIPE_WEBHOOK_SECRET en el entorno.");

  // Este spec crea organizaciones reales (es lo que valida). Se borran al acabar
  // para no dejar residuos en la base de datos de demo.
  test.afterAll(async () => {
    if (!process.env.DATABASE_URL) {
      console.warn("[alta-comercial] sin DATABASE_URL: no se limpian las organizaciones de prueba.");
      return;
    }
    const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
    try {
      const orgs = await prisma.organization.findMany({
        where: { name: E2E_ORG_NAME },
        select: { id: true },
      });
      for (const org of orgs) {
        await prisma.invitation.deleteMany({ where: { orgId: org.id } });
        const users = await prisma.user.findMany({ where: { orgId: org.id }, select: { identityId: true } });
        await prisma.user.deleteMany({ where: { orgId: org.id } });
        await prisma.identity.deleteMany({ where: { id: { in: users.map((u) => u.identityId) } } });
        await prisma.organization.delete({ where: { id: org.id } });
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  test("un pago confirmado crea la organización y su enlace de activación, y el reenvío no la duplica", async ({
    request,
    page,
  }) => {
    const sessionId = `cs_e2e_${Date.now()}`;
    const email = `e2e-${Date.now()}@gimnasio-e2e.es`;

    const first = await postSigned(request, checkoutCompleted(sessionId, email, "avanzado_ano", E2E_ORG_NAME));
    expect(first.ok()).toBeTruthy();

    // RB-ALTA-002: la vuelta de Stripe dice a qué email ha ido el enlace.
    await page.goto(`/activar?session_id=${sessionId}`);
    await expect(page.getByRole("heading", { name: "Tu plataforma está lista" })).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();
    await expect(page.getByRole("button", { name: /Reenviarme el enlace/ })).toBeVisible();

    // RB-ALTA-001: reenviar el mismo evento no crea una segunda organización.
    const replay = await postSigned(request, checkoutCompleted(sessionId, email, "avanzado_ano", E2E_ORG_NAME));
    expect(replay.ok()).toBeTruthy();
    await page.reload();
    await expect(page.getByText(email)).toHaveCount(1);
  });

  test("una firma inválida se rechaza", async ({ request }) => {
    const res = await request.post("/api/stripe/webhook", {
      headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=falsificada" },
      data: JSON.stringify(checkoutCompleted("cs_e2e_bad", "x@y.es", "avanzado_ano", "X")),
    });
    expect(res.status()).toBe(400);
  });

  test("una referencia de pago desconocida no miente: dice que sigue confirmando", async ({ page }) => {
    await page.goto("/activar?session_id=cs_e2e_inexistente");
    await expect(page.getByRole("heading", { name: "Estamos confirmando tu pago" })).toBeVisible();
  });

  test("el login envía a la página de planes, no a un registro que ya no existe", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: /Ver planes/ }).click();
    await expect(page).toHaveURL(/\/planes/);
  });
});
