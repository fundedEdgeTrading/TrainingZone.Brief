import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { generateMemberBillingToken, generateMemberDunningToken } from "@/lib/email-verification";
import { openBillingPortal, retryPendingInvoice } from "./actions";

/**
 * HU-ST-19 · Pantalla de recuperación para el socio.
 *
 * Esta pantalla se abre **sin sesión**, solo con el token que viajó en el email
 * de impago. El riesgo que cubren estos tests no es el cobro —eso es Stripe—
 * sino la puerta: que el token sea la ÚNICA credencial, que nada del formulario
 * identifique a nadie, y que un enlace caducado o inventado no llegue a tocar
 * la cuenta de un socio.
 *
 * El reintento real contra Stripe no se puede ensayar sin una cuenta conectada
 * (el CI corre a propósito sin `STRIPE_SECRET_KEY`), así que lo que se prueba
 * aquí es que la acción degrada con un motivo entendible en vez de reventar —
 * que es lo que vería el socio si su gimnasio no tuviera Stripe conectado.
 */

const SUFFIX = "e2e-recovery-test";

async function createMember(tag: string) {
  const slug = `${SUFFIX}-${tag}`;
  const org = await prisma.organization.create({ data: { name: `Recovery ${tag}`, slug } });
  const center = await prisma.center.create({
    data: { orgId: org.id, name: `Centro ${tag}`, slug: `${slug}-centro` },
  });
  const member = await prisma.member.create({
    data: {
      orgId: org.id,
      primaryCenterId: center.id,
      firstName: "Socio",
      lastName: `Recovery ${tag}`,
      email: `${slug}@example.com`,
    },
  });
  return { orgId: org.id, memberId: member.id };
}

async function cleanup() {
  const orgs = await prisma.organization.findMany({
    where: { slug: { startsWith: SUFFIX } },
    select: { id: true },
  });
  for (const org of orgs) {
    await prisma.member.deleteMany({ where: { orgId: org.id } });
    await prisma.center.deleteMany({ where: { orgId: org.id } });
    await prisma.organization.delete({ where: { id: org.id } });
  }
}

function formWith(token: string) {
  const fd = new FormData();
  fd.set("token", token);
  return fd;
}

before(cleanup);
after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test("un token inventado no toca la cuenta de nadie", async () => {
  const pagar = await retryPendingInvoice(formWith("esto-no-es-un-token"));
  assert.equal(pagar.ok, false);

  const portal = await openBillingPortal(formWith("esto-no-es-un-token"));
  assert.equal(portal.ok, false);
});

test("un token sin socio detrás tampoco", async () => {
  // Token bien firmado pero de un socio que ya no existe: la firma no basta,
  // hace falta que la ficha siga ahí.
  const huerfano = generateMemberDunningToken("member_que_no_existe");
  const result = await retryPendingInvoice(formWith(huerfano));
  assert.equal(result.ok, false);
});

test("los dos propósitos de token aterrizan en la misma pantalla", async () => {
  const { memberId } = await createMember("dos-tokens");

  // El de impago (email de cobro fallido) y el de autoservicio (el socio lo pide
  // desde su portal) tienen TTL distinto y propósito distinto, pero los dos
  // valen aquí: si uno de los dos no valiera, la mitad de los socios que pulsan
  // el botón del email se encontrarían un "enlace no válido".
  for (const token of [generateMemberDunningToken(memberId), generateMemberBillingToken(memberId)]) {
    const result = await retryPendingInvoice(formWith(token));
    // Sin Stripe conectado no hay factura que reintentar; lo que importa es que
    // el motivo es de negocio y no "token inválido".
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.error : "", /factura pendiente|Stripe/i);
  }
});

test("el socio sin cliente de Stripe recibe una explicación, no un error técnico", async () => {
  const { memberId } = await createMember("sin-stripe");
  const result = await openBillingPortal(formWith(generateMemberDunningToken(memberId)));

  assert.equal(result.ok, false);
  assert.match(
    result.ok === false ? result.error : "",
    /método de pago|centro/i,
    "al socio no se le enseña que falta STRIPE_SECRET_KEY"
  );
});
