import test from "node:test";
import assert from "node:assert/strict";
import { bonoUsage, getSessionBalances } from "./session-balance";

// Lo que el socio ve en "Reservar clase" son tres cifras a la vez: las que le
// quedan, las gastadas y el total del bono. Si no cuadran entre sí (el caso de
// la captura: "13 disponibles" encima de "0 gastadas de 12 del bono") el socio
// no sabe cuántas sesiones tiene de verdad. Estos tests fijan esa cuadratura,
// que es la regla, no el detalle de cómo se calcula cada cifra.

const sub = (type: string, sessionsIncluded: number | null, sessionsRemaining: number | null, status = "ACTIVE") => ({
  status,
  sessionsRemaining,
  plan: { type, sessionsIncluded },
});

test("bonoUsage: bono consumido a medias reparte gastadas y restantes sobre lo contratado", () => {
  assert.deepEqual(bonoUsage(12, 5), { total: 12, used: 7, remaining: 5 });
  assert.deepEqual(bonoUsage(12, 12), { total: 12, used: 0, remaining: 12 });
  assert.deepEqual(bonoUsage(12, 0), { total: 12, used: 12, remaining: 0 });
});

test("bonoUsage: con saldo por encima de lo contratado el total sube, no se queda corto", () => {
  // Recepción puede sumar sesiones a mano (RB-RES-006). Antes el total seguía
  // siendo 12 y salía "0 gastadas de 12" junto a 13 disponibles.
  assert.deepEqual(bonoUsage(12, 13), { total: 13, used: 0, remaining: 13 });
});

test("bonoUsage: un bono con saldo pero sin sesiones contratadas cuenta su propio saldo", () => {
  assert.deepEqual(bonoUsage(null, 3), { total: 3, used: 0, remaining: 3 });
  assert.deepEqual(bonoUsage(undefined, 0), { total: 0, used: 0, remaining: 0 });
});

test("bonoUsage: el bono ilimitado no tiene nada que repartir", () => {
  assert.equal(bonoUsage(null, null), null);
  assert.equal(bonoUsage(12, null), null);
});

test("getSessionBalances: gastadas + disponibles cuadran con el total en cada modalidad", () => {
  // El caso de la captura: dos bonos de EP (uno de ellos con saldo de más) y
  // uno de grupos al que le habían añadido sesiones.
  const balances = getSessionBalances([
    sub("PERSONAL_TRAINING", 12, 6),
    sub("PERSONAL_TRAINING", 4, 7),
    sub("SESSION_PACK", 12, 13),
  ]);

  const ep = balances.find((b) => b.serviceKind === "EP")!;
  assert.deepEqual({ remaining: ep.remaining, used: ep.used, total: ep.total }, { remaining: 13, used: 6, total: 19 });

  const group = balances.find((b) => b.serviceKind === "GROUP")!;
  assert.deepEqual(
    { remaining: group.remaining, used: group.used, total: group.total },
    { remaining: 13, used: 0, total: 13 }
  );

  for (const b of balances) {
    assert.equal(b.used! + b.remaining!, b.total, `${b.serviceKind}: gastadas + disponibles debe dar el total`);
  }
});

test("getSessionBalances: un bono sin sesiones contratadas también suma al total", () => {
  const [balance] = getSessionBalances([sub("SESSION_PACK", 8, 2), sub("MONTHLY", null, 3)]);
  assert.deepEqual(
    { remaining: balance.remaining, used: balance.used, total: balance.total },
    { remaining: 5, used: 6, total: 11 }
  );
});

test("getSessionBalances: un bono ilimitado deja la modalidad sin cifras que contar", () => {
  const [balance] = getSessionBalances([sub("MONTHLY", null, null), sub("SESSION_PACK", 8, 3)]);
  assert.deepEqual(balance, { serviceKind: "GROUP", remaining: null, unlimited: true, used: null, total: null });
});

test("getSessionBalances: solo cuentan los bonos activos", () => {
  const balances = getSessionBalances([
    sub("SESSION_PACK", 12, 4),
    sub("SESSION_PACK", 12, 12, "FROZEN"),
    sub("PERSONAL_TRAINING", 8, 8, "CANCELLED"),
  ]);
  assert.equal(balances.length, 1);
  assert.deepEqual(
    { remaining: balances[0].remaining, used: balances[0].used, total: balances[0].total },
    { remaining: 4, used: 8, total: 12 }
  );
});
