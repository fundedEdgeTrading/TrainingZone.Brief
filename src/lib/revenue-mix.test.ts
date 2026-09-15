import test from "node:test";
import assert from "node:assert/strict";

import {
  NEW_SUBSCRIPTION_GRACE_DAYS,
  classifyPayment,
  classifyPayments,
  lostMonthlyFeeCents,
  type ClassifiablePayment,
} from "./revenue-mix";

/**
 * E14-17 · «La clasificación alta/renovación/baja es aritmética pura: pruébala
 * sin base de datos, con los casos raros dentro». Aquí están los tres casos
 * raros que pide la historia —dos suscripciones a la vez del mismo socio, socio
 * que se va y vuelve, socio importado sin histórico de cobros— y el reparto de
 * la cuarta categoría, que es la que cambia la lectura de negocio.
 */

const day = (iso: string) => new Date(`${iso}T10:00:00Z`);
const pay = (id: string, subscriptionId: string | null, iso: string, euros: number): ClassifiablePayment => ({
  id,
  subscriptionId,
  date: day(iso),
  amountCents: euros * 100,
});

test("el primer cobro de una suscripción nueva es un ALTA", () => {
  assert.equal(
    classifyPayment(pay("p1", "s1", "2026-09-03", 60), {
      earlierPaymentsOfSubscription: 0,
      subscriptionStartDate: day("2026-09-01"),
    }),
    "ALTA",
  );
});

test("los siguientes cobros de la misma suscripción son RENOVACIÓN", () => {
  assert.equal(
    classifyPayment(pay("p2", "s1", "2026-10-03", 60), {
      earlierPaymentsOfSubscription: 1,
      subscriptionStartDate: day("2026-09-01"),
    }),
    "RENOVACION",
  );
});

test("un cobro sin suscripción es la CUARTA categoría, no un hueco", () => {
  assert.equal(
    classifyPayment(pay("p3", null, "2026-09-10", 15), {
      earlierPaymentsOfSubscription: 0,
      subscriptionStartDate: null,
    }),
    "SIN_SUSCRIPCION",
  );
});

test("el adeudo SEPA que liquida días después del alta sigue siendo ALTA", () => {
  // Un adeudo tarda días en confirmarse y una cuota contratada a mitad de mes
  // puede facturarse el 1 siguiente: dentro de la gracia, sigue siendo alta.
  assert.equal(
    classifyPayment(pay("p4", "s2", "2026-10-01", 60), {
      earlierPaymentsOfSubscription: 0,
      subscriptionStartDate: day("2026-09-14"),
    }),
    "ALTA",
  );
});

test("socio importado sin histórico: su primer recibo NO infla las altas", () => {
  // La suscripción trae su startDate real de la otra plataforma (hace dos años)
  // y no tiene ni un cobro registrado aquí. Contarla como alta metería en la
  // captación de septiembre a quien lleva pagando desde 2024.
  assert.equal(
    classifyPayment(pay("p5", "s3", "2026-09-05", 55), {
      earlierPaymentsOfSubscription: 0,
      subscriptionStartDate: day("2024-03-01"),
    }),
    "RENOVACION",
  );
});

test("el corte de la gracia está donde dice la constante", () => {
  const start = day("2026-01-01");
  const justIn = new Date(start.getTime() + NEW_SUBSCRIPTION_GRACE_DAYS * 86_400_000);
  const justOut = new Date(justIn.getTime() + 1);
  const ctx = { earlierPaymentsOfSubscription: 0, subscriptionStartDate: start };
  assert.equal(classifyPayment({ id: "a", subscriptionId: "s", date: justIn, amountCents: 100 }, ctx), "ALTA");
  assert.equal(
    classifyPayment({ id: "b", subscriptionId: "s", date: justOut, amountCents: 100 }, ctx),
    "RENOVACION",
  );
});

test("suscripción sin fecha de arranque conocida: se trata como nueva", () => {
  assert.equal(
    classifyPayment(pay("p6", "s9", "2026-09-05", 55), {
      earlierPaymentsOfSubscription: 0,
      subscriptionStartDate: null,
    }),
    "ALTA",
  );
});

test("dos suscripciones a la vez del mismo socio: dos altas el mismo mes", () => {
  // EP y grupos conviven (RB-AGENDA-003). Clasificar por SOCIO daría una alta y
  // una renovación inventada; clasificar por SUSCRIPCIÓN da las dos altas que
  // de verdad ha habido.
  const ep = pay("p-ep", "sub-ep", "2026-09-02", 200);
  const grupos = pay("p-gr", "sub-gr", "2026-09-02", 60);
  const out = classifyPayments([ep, grupos], {
    allPayments: [ep, grupos],
    subscriptionStart: new Map([
      ["sub-ep", day("2026-09-01")],
      ["sub-gr", day("2026-09-01")],
    ]),
  });
  assert.equal(out.get("p-ep"), "ALTA");
  assert.equal(out.get("p-gr"), "ALTA");
});

test("socio que se va y vuelve: la vuelta es un ALTA, no una renovación de la antigua", () => {
  const vieja1 = pay("v1", "sub-vieja", "2025-01-02", 60);
  const vieja2 = pay("v2", "sub-vieja", "2025-02-02", 60);
  const vuelta = pay("n1", "sub-nueva", "2026-09-02", 60);
  const out = classifyPayments([vuelta], {
    allPayments: [vieja1, vieja2, vuelta],
    subscriptionStart: new Map([
      ["sub-vieja", day("2025-01-01")],
      ["sub-nueva", day("2026-09-01")],
    ]),
  });
  assert.equal(out.get("n1"), "ALTA");
});

test("la renovación de enero no se convierte en alta por mirar solo la ventana", () => {
  const alta = pay("a1", "s1", "2025-11-02", 60);
  const enero = pay("a3", "s1", "2026-01-02", 60);
  const out = classifyPayments([enero], {
    allPayments: [alta, pay("a2", "s1", "2025-12-02", 60), enero],
    subscriptionStart: new Map([["s1", day("2025-11-01")]]),
  });
  assert.equal(out.get("a3"), "RENOVACION");
});

test("dos recibos de la misma suscripción el mismo día: solo uno es el primero", () => {
  const a = pay("aaa", "s1", "2026-09-02", 60);
  const b = pay("bbb", "s1", "2026-09-02", 60);
  const out = classifyPayments([a, b], {
    allPayments: [a, b],
    subscriptionStart: new Map([["s1", day("2026-09-01")]]),
  });
  assert.deepEqual([out.get("aaa"), out.get("bbb")], ["ALTA", "RENOVACION"]);
});

test("las tres líneas de caja suman el total de la ventana", () => {
  const rows = [
    pay("x1", "s1", "2026-09-02", 60),
    pay("x2", "s1", "2026-10-02", 60),
    pay("x3", null, "2026-09-04", 15),
  ];
  const out = classifyPayments(rows, {
    allPayments: rows,
    subscriptionStart: new Map([["s1", day("2026-09-01")]]),
  });
  const total = rows.reduce((s, p) => s + p.amountCents, 0);
  const byConcept = rows.reduce(
    (acc, p) => {
      acc[out.get(p.id)!] = (acc[out.get(p.id)!] ?? 0) + p.amountCents;
      return acc;
    },
    {} as Record<string, number>,
  );
  assert.equal(Object.values(byConcept).reduce((a, b) => a + b, 0), total);
});

// ---------------------------------------------------------------------------
// La baja: ingreso perdido, no caja
// ---------------------------------------------------------------------------

const cancelledAt = day("2026-09-20");

test("la cuota perdida es la de las suscripciones RECURRENTES vivas el día de la baja", () => {
  const lost = lostMonthlyFeeCents(
    [
      { priceCents: 6000, recurring: true, startDate: day("2025-01-01"), endDate: null },
      { priceCents: 20000, recurring: false, startDate: day("2026-08-01"), endDate: null },
    ],
    cancelledAt,
  );
  assert.equal(lost, 6000);
});

test("un socio de solo bonos no se lleva cuota mensual ninguna", () => {
  const lost = lostMonthlyFeeCents(
    [{ priceCents: 24000, recurring: false, startDate: day("2026-08-01"), endDate: null }],
    cancelledAt,
  );
  assert.equal(lost, 0);
});

test("dos cuotas recurrentes a la vez se pierden las dos", () => {
  const lost = lostMonthlyFeeCents(
    [
      { priceCents: 6000, recurring: true, startDate: day("2025-01-01"), endDate: null },
      { priceCents: 3500, recurring: true, startDate: day("2026-02-01"), endDate: null },
    ],
    cancelledAt,
  );
  assert.equal(lost, 9500);
});

test("una cuota que ya había caducado antes de la baja no se pierde otra vez", () => {
  const lost = lostMonthlyFeeCents(
    [{ priceCents: 6000, recurring: true, startDate: day("2024-01-01"), endDate: day("2026-06-30") }],
    cancelledAt,
  );
  assert.equal(lost, 0);
});

test("una suscripción contratada DESPUÉS de la baja no cuenta", () => {
  // El socio se va y vuelve: la suscripción de la vuelta no es lo que se perdió
  // en septiembre.
  const lost = lostMonthlyFeeCents(
    [{ priceCents: 6000, recurring: true, startDate: day("2026-11-01"), endDate: null }],
    cancelledAt,
  );
  assert.equal(lost, 0);
});
