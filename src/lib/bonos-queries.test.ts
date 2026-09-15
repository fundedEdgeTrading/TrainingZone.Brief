import test from "node:test";
import assert from "node:assert/strict";

import {
  EXPIRY_HORIZON_DAYS,
  LOW_SESSIONS_THRESHOLD,
  packsRunningOut,
  RUNNING_OUT_LIMIT,
  summarisePacksByCenter,
  totalPacks,
  type PackLedgerEntry,
  type PackSubscription,
} from "@/lib/bonos-queries";

/**
 * E14-08 · La agregación de bonos es aritmética pura y se prueba sin base de
 * datos: el escenario «pruebas» de la historia lo pide así, y es lo que permite
 * cubrir el caso que motivó todo esto —el bono ajustado a mano— sin sembrar
 * nada.
 */

const NOW = new Date("2026-09-15T12:00:00.000Z");
const CENTERS = [
  { id: "c1", name: "Delicias" },
  { id: "c2", name: "Actur" },
];

let seq = 0;
function pack(over: Partial<PackSubscription> = {}): PackSubscription {
  seq++;
  return {
    id: over.id ?? `s${seq}`,
    centerId: "c1",
    sessionsRemaining: 10,
    status: "ACTIVE",
    endDate: null,
    member: { id: `m${seq}`, firstName: "Ana", lastName: `Socia ${seq}` },
    planName: "Bono 12 sesiones",
    ...over,
  };
}

function entry(subscriptionId: string, delta: number, reason: PackLedgerEntry["reason"]): PackLedgerEntry {
  return { subscriptionId, delta, reason };
}

function inDays(days: number): Date {
  return new Date(NOW.getTime() + days * 86_400_000);
}

function rowFor(rows: ReturnType<typeof summarisePacksByCenter>, centerId: string) {
  const row = rows.find((r) => r.centerId === centerId);
  assert.ok(row, `falta la fila del centro ${centerId}`);
  return row;
}

// ---------------------------------------------------------------------------
// La fuente es el libro, no la resta
// ---------------------------------------------------------------------------

test("E14-08 · las canjeadas salen del libro y no de sessionsIncluded - sessionsRemaining", () => {
  // El caso de RB-RES-006: bono de 4, agotado, + 2 sesiones de regalo de
  // recepción. La resta ingenua sobre lo contratado diría «0 canjeadas»; el
  // libro dice las cuatro que se gastaron de verdad.
  const sub = pack({ id: "ajustado", sessionsRemaining: 2 });
  const entries = [
    entry("ajustado", 4, "PURCHASE"),
    entry("ajustado", -1, "BOOKING"),
    entry("ajustado", -1, "BOOKING"),
    entry("ajustado", -1, "BOOKING"),
    entry("ajustado", -1, "BOOKING"),
    entry("ajustado", 2, "MANUAL_ADJUSTMENT"),
  ];

  const row = rowFor(summarisePacksByCenter([sub], entries, CENTERS, NOW), "c1");
  assert.equal(row.redeemed, 4, "las cuatro sesiones gastadas están en el libro");
  assert.equal(row.adjusted, 2, "el ajuste a mano se ve, y aparte");
  assert.equal(row.remaining, 2);
});

test("E14-08 · el alta del bono no es consumo", () => {
  const row = rowFor(
    summarisePacksByCenter([pack({ id: "a" })], [entry("a", 12, "PURCHASE")], CENTERS, NOW),
    "c1",
  );
  assert.equal(row.redeemed, 0);
  assert.equal(row.refunded, 0, "PURCHASE es positivo pero no es una devolución");
});

test("E14-08 · el saldo de apertura del histórico previo no inventa movimiento", () => {
  // `backfillOpeningEntries` escribe un CORRECTION con el saldo del bono el día
  // de la migración. Contarlo como flujo del periodo inflaría ese mes entero.
  const row = rowFor(
    summarisePacksByCenter([pack({ id: "a" })], [entry("a", 9, "CORRECTION")], CENTERS, NOW),
    "c1",
  );
  assert.equal(row.redeemed, 0);
  assert.equal(row.refunded, 0);
  assert.equal(row.adjusted, 0);
});

test("E14-08 · una sesión caducada nunca se cuenta como canjeada", () => {
  const entries = [entry("a", -1, "BOOKING"), entry("a", -3, "EXPIRY")];
  const row = rowFor(summarisePacksByCenter([pack({ id: "a" })], entries, CENTERS, NOW), "c1");
  assert.equal(row.redeemed, 1, "solo la reservada");
  assert.equal(row.expiredSessions, 3, "las caducadas tienen cifra propia");
});

test("E14-08 · las devoluciones salen de CANCELLATION y NO_SHOW_REFUND", () => {
  const entries = [
    entry("a", -1, "BOOKING"),
    entry("a", -1, "BOOKING"),
    entry("a", 1, "CANCELLATION"),
    entry("a", 1, "NO_SHOW_REFUND"),
  ];
  const row = rowFor(summarisePacksByCenter([pack({ id: "a" })], entries, CENTERS, NOW), "c1");
  assert.equal(row.redeemed, 2);
  assert.equal(row.refunded, 2);
});

// ---------------------------------------------------------------------------
// Ilimitados
// ---------------------------------------------------------------------------

test("E14-08 · el bono ilimitado se cuenta aparte y no suma como cero", () => {
  const subs = [
    pack({ id: "lim", sessionsRemaining: 5 }),
    pack({ id: "ilim", sessionsRemaining: null }),
  ];
  const entries = [entry("lim", -1, "BOOKING"), entry("ilim", -1, "BOOKING"), entry("ilim", -1, "BOOKING")];

  const row = rowFor(summarisePacksByCenter(subs, entries, CENTERS, NOW), "c1");
  assert.equal(row.remaining, 5, "el ilimitado no aporta 0 al saldo: no aporta nada");
  assert.equal(row.packs, 1);
  assert.equal(row.unlimitedPacks, 1, "se cuenta como bono ilimitado, no como bono de cero sesiones");
  assert.equal(row.redeemed, 1, "el consumo del ilimitado no infla el del stock por unidades");
  assert.equal(row.unlimitedRedeemed, 2);
});

test("E14-08 · un ilimitado nunca entra en la lista de bonos a punto de acabarse", () => {
  const { rows, total } = packsRunningOut(
    [pack({ id: "ilim", sessionsRemaining: null, endDate: inDays(3) })],
    CENTERS,
    NOW,
  );
  assert.deepEqual(rows, []);
  assert.equal(total, 0);
});

// ---------------------------------------------------------------------------
// Caducidad
// ---------------------------------------------------------------------------

test("E14-08 · caducan en los próximos 30 días, y los ya caducados sin consumir", () => {
  const subs = [
    pack({ id: "pronto", sessionsRemaining: 4, endDate: inDays(10) }),
    pack({ id: "justo", sessionsRemaining: 1, endDate: inDays(EXPIRY_HORIZON_DAYS) }),
    pack({ id: "lejos", sessionsRemaining: 8, endDate: inDays(EXPIRY_HORIZON_DAYS + 1) }),
    pack({ id: "vencido", sessionsRemaining: 3, endDate: inDays(-2) }),
    // Vencido pero sin saldo: no se ha perdido nada, no es noticia.
    pack({ id: "vencido-gastado", sessionsRemaining: 0, endDate: inDays(-2) }),
  ];

  const row = rowFor(summarisePacksByCenter(subs, [], CENTERS, NOW), "c1");
  assert.equal(row.expiringSoonPacks, 2, "el que cae justo en el día 30 entra");
  assert.equal(row.expiringSoonSessions, 5);
  assert.equal(row.expiredUnusedPacks, 1);
  assert.equal(row.expiredUnusedSessions, 3);
});

test("E14-08 · un bono sin fecha de fin no caduca", () => {
  const row = rowFor(summarisePacksByCenter([pack({ endDate: null })], [], CENTERS, NOW), "c1");
  assert.equal(row.expiringSoonPacks, 0);
  assert.equal(row.expiredUnusedPacks, 0);
});

test("E14-08 · el saldo que se va con una baja no se cuenta como caducado", () => {
  const subs = [pack({ id: "baja", sessionsRemaining: 6, status: "CANCELLED", endDate: inDays(-5) })];
  const row = rowFor(summarisePacksByCenter(subs, [], CENTERS, NOW), "c1");
  assert.equal(row.expiredUnusedSessions, 0, "una baja es otro problema, y lo mide el desglose de ingresos");
  assert.equal(row.remaining, 0, "y su saldo tampoco es stock vivo");
});

// ---------------------------------------------------------------------------
// Estados y ámbito
// ---------------------------------------------------------------------------

test("E14-08 · solo el saldo realmente gastable cuenta como restante", () => {
  const subs = [
    pack({ id: "activo", sessionsRemaining: 5 }),
    pack({ id: "sepa", sessionsRemaining: 10, status: "PENDING_CONFIRMATION" }),
    pack({ id: "pausa", sessionsRemaining: 10, status: "PAUSED" }),
    pack({ id: "impago", sessionsRemaining: 10, status: "FROZEN" }),
  ];
  const row = rowFor(summarisePacksByCenter(subs, [], CENTERS, NOW), "c1");
  assert.equal(row.remaining, 5, "el motor de reservas solo deja gastar los ACTIVE");
  assert.equal(row.packs, 1);
});

test("E14-08 · cada centro suma lo suyo y un centro sin bonos sale con sus ceros", () => {
  const subs = [
    pack({ id: "a", centerId: "c1", sessionsRemaining: 4 }),
    pack({ id: "b", centerId: "c2", sessionsRemaining: 7 }),
  ];
  const entries = [entry("a", -2, "BOOKING"), entry("b", -1, "BOOKING")];
  const rows = summarisePacksByCenter(subs, entries, CENTERS, NOW);

  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.centerName), ["Actur", "Delicias"], "orden alfabético estable");
  assert.equal(rowFor(rows, "c1").redeemed, 2);
  assert.equal(rowFor(rows, "c2").redeemed, 1);

  const soloUno = summarisePacksByCenter(subs, entries, [CENTERS[0]], NOW);
  assert.equal(soloUno.length, 1);
  assert.equal(soloUno[0].redeemed, 2, "el bono del centro fuera de ámbito no entra en ninguna cifra");
});

test("E14-08 · un asiento de un bono que no está en el ámbito no cuenta", () => {
  const row = rowFor(
    summarisePacksByCenter([pack({ id: "a" })], [entry("desconocido", -9, "BOOKING")], CENTERS, NOW),
    "c1",
  );
  assert.equal(row.redeemed, 0);
});

// ---------------------------------------------------------------------------
// La lista accionable
// ---------------------------------------------------------------------------

test("E14-08 · la lista entra por saldo bajo, por caducidad próxima o por caducado", () => {
  const subs = [
    pack({ id: "sano", sessionsRemaining: 9, endDate: inDays(200) }),
    pack({ id: "poco", sessionsRemaining: LOW_SESSIONS_THRESHOLD }),
    pack({ id: "caduca", sessionsRemaining: 8, endDate: inDays(5) }),
    pack({ id: "caducado", sessionsRemaining: 3, endDate: inDays(-1) }),
  ];

  const { rows } = packsRunningOut(subs, CENTERS, NOW);
  assert.deepEqual(
    rows.map((r) => [r.subscriptionId, r.reason]),
    [
      ["caducado", "caducado"],
      ["caduca", "caduca"],
      ["poco", "saldo"],
    ],
    "primero lo perdido, luego lo que caduca antes, y el saldo bajo al final",
  );
  assert.equal(rows.find((r) => r.subscriptionId === "caducado")?.daysToExpiry, -1);
});

test("E14-08 · un bono agotado no es un bono acabándose: ya se acabó", () => {
  const { rows } = packsRunningOut([pack({ id: "cero", sessionsRemaining: 0 })], CENTERS, NOW);
  assert.deepEqual(rows, [], "sin saldo no hay nada que vender contra ese bono");
});

test("E14-08 · la lista respeta el tope y el desempate por saldo", () => {
  const subs = [
    pack({ id: "x", sessionsRemaining: 2 }),
    pack({ id: "y", sessionsRemaining: 1 }),
    pack({ id: "z", sessionsRemaining: 2 }),
  ];
  const { rows, total } = packsRunningOut(subs, CENTERS, NOW, 2);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].subscriptionId, "y", "el que menos saldo tiene, primero");
  assert.equal(total, 3, "el total va aparte del recorte: «y 1 más» cambia la decisión");
});

// ---------------------------------------------------------------------------
// Totales
// ---------------------------------------------------------------------------

test("E14-08 · el total de la organización es la suma de sus centros", () => {
  const subs = [
    pack({ id: "a", centerId: "c1", sessionsRemaining: 4, endDate: inDays(3) }),
    pack({ id: "b", centerId: "c2", sessionsRemaining: 7, endDate: inDays(-3) }),
    pack({ id: "c", centerId: "c2", sessionsRemaining: null }),
  ];
  const entries = [entry("a", -2, "BOOKING"), entry("b", -1, "BOOKING"), entry("c", -5, "BOOKING")];

  const total = totalPacks(summarisePacksByCenter(subs, entries, CENTERS, NOW));
  assert.equal(total.redeemed, 3);
  assert.equal(total.unlimitedRedeemed, 5);
  assert.equal(total.remaining, 11);
  assert.equal(total.unlimitedPacks, 1);
  assert.equal(total.expiringSoonSessions, 4);
  assert.equal(total.expiredUnusedSessions, 7);
});

test("E14-08 · sin centros visibles no hay cifras que enseñar", () => {
  const rows = summarisePacksByCenter([pack()], [], [], NOW);
  assert.deepEqual(rows, []);
  const total = totalPacks(rows);
  assert.equal(total.remaining, 0);
  assert.equal(total.redeemed, 0);
});

test("E14-08 · la lista se recorta por defecto: la card vive encima del listado de socios", () => {
  const subs = Array.from({ length: RUNNING_OUT_LIMIT + 4 }, (_, i) =>
    pack({ id: `p${i}`, sessionsRemaining: 1 }),
  );
  const { rows, total } = packsRunningOut(subs, CENTERS, NOW);
  assert.equal(rows.length, RUNNING_OUT_LIMIT);
  assert.equal(total, RUNNING_OUT_LIMIT + 4);
});
