import { strict as assert } from "node:assert";
import { test } from "node:test";

import { FLOW_GOAL_DEFINITION, FLOW_GOAL_KINDS, FLOW_GOAL_LABEL } from "@/lib/flows/catalog";
import { hasFlowGoalResolver } from "@/lib/flows/panel";
import { FLOW_GOAL_RESOLVERS, primeraDespuesDe } from "@/lib/flows/seeds/goals";
import { FLOW_SEEDS } from "@/lib/flows/seeds";

/**
 * E14-36 · QUE EL ÚLTIMO PASO DEL EMBUDO SE SEPA MEDIR.
 *
 * El panel de E2 pinta «falta definir cómo se mide» cuando un flujo declara
 * objetivo y nadie ha registrado su resolutor. Eso está bien como salvavidas
 * —un cero y un «no se sabe» no son lo mismo— pero si sale en pantalla es que
 * esta pista no ha hecho su trabajo. Esto lo comprueba en cada cambio.
 */

test("E14-36 · los cinco objetivos del catálogo tienen resolutor", () => {
  for (const kind of FLOW_GOAL_KINDS) {
    assert.ok(FLOW_GOAL_RESOLVERS[kind], `«${FLOW_GOAL_LABEL[kind]}» no tiene quien lo mida`);
    assert.ok(FLOW_GOAL_DEFINITION[kind], `«${FLOW_GOAL_LABEL[kind]}» no tiene definición que pintar en pantalla`);
  }
});

test("E14-36 · importar las semillas deja los resolutores registrados en el motor", () => {
  // El registro de E2 empieza VACÍO a propósito. Si esto se rompe, el panel
  // vuelve a decir «falta definir cómo se mide» en los ocho flujos a la vez y
  // nadie sabría por qué: lo que se habría roto es un `import`.
  for (const kind of FLOW_GOAL_KINDS) {
    assert.equal(hasFlowGoalResolver(kind), true, `«${FLOW_GOAL_LABEL[kind]}» no se ha registrado al importar`);
  }
  assert.equal(hasFlowGoalResolver(null), false, "un flujo sin objetivo no tiene nada que medir");
});

test("E14-36 · ningún flujo de salida se queda con el objetivo sin medir", () => {
  for (const seed of FLOW_SEEDS) {
    assert.equal(
      hasFlowGoalResolver(seed.goalKind),
      true,
      `«${seed.name}» declara un objetivo que nadie sabe medir: el panel pintaría un hueco`
    );
  }
});

test("E14-36 · el objetivo es POSTERIOR al correo, en estricto", () => {
  const correo = new Date("2026-09-10T09:00:00Z");

  // Simultáneo no cuenta: un suceso que ocurre en el mismo instante que el
  // envío no lo ha causado el envío.
  assert.equal(primeraDespuesDe([correo], correo), null);

  // Anterior tampoco. Es el fallo que inflaría todos los embudos: apuntarse
  // como éxito lo que ya había pasado antes de escribir.
  assert.equal(primeraDespuesDe([new Date("2026-09-09T23:59:59Z")], correo), null);

  const despues = new Date("2026-09-10T09:00:01Z");
  assert.equal(primeraDespuesDe([despues], correo)?.toISOString(), despues.toISOString());
});

test("E14-36 · si el socio cumple varias veces, cuenta la PRIMERA", () => {
  // «Volvió a entrenar» se cumple el día que volvió, no el último día que vino.
  // Con la última, el embudo diría que el correo tardó un mes en funcionar.
  const correo = new Date("2026-09-01T10:00:00Z");
  const primera = new Date("2026-09-03T18:00:00Z");
  const fechas = [new Date("2026-09-20T18:00:00Z"), primera, new Date("2026-09-11T18:00:00Z")];
  assert.equal(primeraDespuesDe(fechas, correo)?.toISOString(), primera.toISOString());
});

test("E14-36 · sin sucesos no hay objetivo cumplido, y eso no es un error", () => {
  const correo = new Date("2026-09-01T10:00:00Z");
  assert.equal(primeraDespuesDe(undefined, correo), null);
  assert.equal(primeraDespuesDe([], correo), null);
});
