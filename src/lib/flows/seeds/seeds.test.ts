import { strict as assert } from "node:assert";
import { test } from "node:test";

import { FLOW_SEED_TEMPLATES } from "@/lib/emails/flow-templates";
import { isPublicPath } from "@/lib/public-paths";
import { AUTOMATIC_TAG_KEYS } from "@/lib/tags";
import { FLOW_GOAL_DEFINITION, FLOW_GOAL_LABEL, isEmailAction } from "@/lib/flows/catalog";
import { WEEKLY_EMAIL_CAP_DAYS } from "@/lib/flows/safety";
import { validateFlow } from "@/lib/flows/validate";

import { BIENVENIDA_SEED } from "@/lib/flows/seeds/bienvenida";
import { AUSENCIA_SEED } from "@/lib/flows/seeds/ausencia";
import { IMPAGO_SEED } from "@/lib/flows/seeds/impago";
import { REACTIVACION_SEED } from "@/lib/flows/seeds/reactivacion";
import { REFERRAL_90_DAYS_SEED } from "@/lib/flows/seeds/referral-90-days";
import { FLOW_SEEDS, FLOW_SEEDS_PRIORITARIAS, flowSeedBySeedKey } from "@/lib/flows/seeds";
import { flowSeedKey, toFlowDraft } from "@/lib/flows/seeds/types";

/**
 * E14-35 · LAS SEMILLAS, PROBADAS SIN BASE DE DATOS.
 *
 * Todo lo que se comprueba aquí es lógica pura: la definición de cada flujo, su
 * paso por el validador del motor y las reglas que un flujo de salida no puede
 * romper. Nada de esto necesita Postgres, y por eso se puede ejecutar en cada
 * cambio en vez de una vez al día.
 *
 * Lo que se prueba contra la base —que la siembra escribe, que el tope frena el
 * segundo correo y que la tarea del bono se crea— está en `e2e/flujos.spec.ts`.
 */

const CENTRO = "centro-de-prueba";

test("E14-35 · las siete semillas pasan el MISMO validador que el editor", () => {
  // Es la prueba que evita la clase entera de fallo con la que empezó esta
  // pista: la semilla de referidos de R1 medía las esperas en horas y
  // configuraba TENURE con `minMonths`, y ninguna de las dos cosas existe en el
  // motor. Un flujo así se sembraría y no haría nada.
  for (const seed of FLOW_SEEDS) {
    const result = validateFlow(toFlowDraft(seed, CENTRO));
    assert.equal(result.ok, true, `«${seed.name}» no pasa el validador: ${result.ok ? "" : result.issues[0]?.message}`);
  }
});

test("E14-35 · están los siete flujos del encargo, y los tres primeros son los del corte de alcance", () => {
  assert.equal(FLOW_SEEDS.length, 8, "siete flujos, pero la rama por producto son dos semillas: ocho en total");

  // El corte de alcance del encargo: «si hay que recortar, se entregan los tres
  // primeros». El orden tiene que estar en el dato, no en la cabeza de nadie.
  const ordenes = FLOW_SEEDS_PRIORITARIAS.map((s) => s.order);
  assert.deepEqual([...new Set(ordenes)].sort(), [1, 2, 3]);
  assert.equal(
    FLOW_SEEDS_PRIORITARIAS.length,
    4,
    "bienvenida, las dos ramas por producto y ausencia"
  );

  // Ningún hueco en la numeración: los siete están.
  assert.deepEqual([...new Set(FLOW_SEEDS.map((s) => s.order))].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7]);
});

test("E14-35 · las claves de semilla son únicas y llevan el centro dentro al escribirse", () => {
  const claves = FLOW_SEEDS.map((s) => s.seedKey);
  assert.equal(new Set(claves).size, claves.length, "dos semillas con la misma clave se pisarían al sembrar");

  // `@@unique([orgId, seedKey])` es por ORGANIZACIÓN y un flujo es de un CENTRO:
  // sin el sufijo, sembrar en el segundo centro chocaría con el del primero.
  const enJota = flowSeedKey(BIENVENIDA_SEED.seedKey, "centro-jota");
  const enCarmen = flowSeedKey(BIENVENIDA_SEED.seedKey, "centro-carmen");
  assert.notEqual(enJota, enCarmen);
  assert.equal(flowSeedBySeedKey(enJota)?.seedKey, BIENVENIDA_SEED.seedKey);
  assert.equal(flowSeedBySeedKey(BIENVENIDA_SEED.seedKey)?.seedKey, BIENVENIDA_SEED.seedKey);
  assert.equal(flowSeedBySeedKey("una-que-no-existe"), null);
});

test("E14-35 · ningún flujo necesita saltarse el tope semanal", () => {
  // «Un flujo que necesite saltarse el tope semanal está mal diseñado: cámbialo
  // o dilo». Esto lo comprueba en vez de confiar en que nadie lo rompa: dos
  // correos del MISMO flujo a menos de siete días se frenarían el uno al otro, y
  // el segundo llegaría tarde y desordenado sin que nadie lo viera en pantalla.
  for (const seed of FLOW_SEEDS) {
    const tronco = seed.steps.filter((s) => s.branch === "MAIN").sort((a, b) => a.position - b.position);

    let diasDesdeEntrada = 0;
    let ultimoCorreo: number | null = null;
    for (const step of tronco) {
      diasDesdeEntrada += step.waitDays;
      if (!isEmailAction(step.actionType)) continue;
      if (ultimoCorreo !== null) {
        const hueco = diasDesdeEntrada - ultimoCorreo;
        assert.ok(
          hueco >= WEEKLY_EMAIL_CAP_DAYS,
          `«${seed.name}» manda dos correos con ${hueco} días de diferencia: el tope semanal frenaría el segundo.`
        );
      }
      ultimoCorreo = diasDesdeEntrada;
    }
  }
});

test("E14-35 · todo correo lleva asunto, cuerpo y su plantilla registrada", () => {
  const clavesConocidas = new Set<string>(Object.values(FLOW_SEED_TEMPLATES).map((t) => t.key));

  for (const seed of FLOW_SEEDS) {
    for (const step of seed.steps) {
      if (!isEmailAction(step.actionType)) continue;
      const config = step.actionConfig;

      assert.ok(String(config.subject ?? "").length > 10, `«${seed.name}» tiene un asunto vacío o de relleno`);
      assert.ok(String(config.bodyText ?? "").length > 80, `«${seed.name}» tiene un cuerpo demasiado corto`);
      // `FlowEmailLog.templateKey` es lo que permite al panel decir con qué
      // texto salió cada envío. Sin clave, todos los envíos son «custom».
      assert.ok(
        clavesConocidas.has(String(config.templateKey ?? "")),
        `«${seed.name}» manda con una plantilla que no está en FLOW_SEED_TEMPLATES`
      );
    }
  }
});

test("E14-35 · los textos no inventan ningún dato que el motor no pueda interpolar", () => {
  // El motor solo interpola el NOMBRE del socio, y lo hace la plantilla. Un
  // texto con `{algo}` dentro llegaría al socio con las llaves puestas, y un
  // texto que dé una cifra del centro (importe de la recompensa, días de gracia,
  // horario) estaría mintiendo en cuanto ese centro tuviera otra.
  const prohibido = /\{\{|\}\}|\{[a-zA-Z]/;
  for (const seed of FLOW_SEEDS) {
    for (const step of seed.steps) {
      const cuerpo = String(step.actionConfig.bodyText ?? "");
      const asunto = String(step.actionConfig.subject ?? "");
      assert.ok(!prohibido.test(cuerpo), `«${seed.name}» deja un hueco sin sustituir en el cuerpo`);
      assert.ok(!prohibido.test(asunto), `«${seed.name}» deja un hueco sin sustituir en el asunto`);
    }
  }

  // La excepción, y es la única: `{membershipPath}` en la RUTA del botón, que
  // resuelve `seedFlows` al sembrar con los slugs del centro. No es un dato del
  // socio: es el mismo para todos los que entren en ese flujo.
  const boton = String(REACTIVACION_SEED.steps[0].actionConfig.ctaPath ?? "");
  assert.equal(boton, "{membershipPath}");
});

test("E14-35 · el excliente no acaba nunca en la tarifa de Apta (RB-MARCA-001)", () => {
  // El socio no compró Apta, compró su gimnasio. `/planes` es la tarifa que
  // Apta le cobra al gimnasio: mandar ahí a un excliente es enseñarle la
  // factura de su centro.
  for (const seed of FLOW_SEEDS) {
    for (const step of seed.steps) {
      const ruta = String(step.actionConfig.ctaPath ?? "");
      assert.notEqual(ruta, "/planes", `«${seed.name}» manda al socio a la tarifa de Apta`);
      assert.ok(!ruta.startsWith("/planes/"), `«${seed.name}» manda al socio a la tarifa de Apta`);
    }
  }
});

test("E14-35 · las condiciones de etiqueta usan claves del catálogo de E1, no rótulos", () => {
  // El contrato con E1: la condición guarda la CLAVE, así que renombrar una
  // etiqueta en /etiquetas no puede dejar el flujo apuntando a nada.
  const claves = FLOW_SEEDS.flatMap((s) =>
    s.conditions.filter((c) => c.type === "TAG").map((c) => String(c.config.tagKey ?? ""))
  );
  assert.ok(claves.length > 0, "la rama por producto segmenta por etiqueta: tiene que haber alguna");
  for (const clave of claves) {
    assert.ok(
      (AUTOMATIC_TAG_KEYS as readonly string[]).includes(clave),
      `«${clave}» no es una etiqueta automática del catálogo de E1`
    );
  }
});

test("E14-36 · cada flujo declara su objetivo, y el objetivo viene explicado", () => {
  for (const seed of FLOW_SEEDS) {
    assert.ok(FLOW_GOAL_LABEL[seed.goalKind], `«${seed.name}» declara un objetivo que no existe`);
    assert.ok(FLOW_GOAL_DEFINITION[seed.goalKind], `«${seed.name}» tiene un objetivo sin definición`);
    // «Un embudo cuyo último paso nadie sabe medir es un embudo decorativo»: el
    // porqué se lee en la pantalla del panel, así que tiene que existir.
    assert.ok(
      seed.goalRationale.length > 60,
      `«${seed.name}» no explica por qué ese objetivo, y eso se pinta en el panel`
    );
  }
});

test("E14-36 · los objetivos son los que pide el encargo, flujo a flujo", () => {
  // Escrito uno a uno y no calculado: si alguien cambia el objetivo de un flujo,
  // que sea una decisión y no un efecto colateral.
  assert.equal(BIENVENIDA_SEED.goalKind, "FORM_COMPLETED", "la bienvenida existe para que la ficha deje de estar vacía");
  assert.equal(AUSENCIA_SEED.goalKind, "TRAINED_AGAIN", "la ausencia existe para que el socio vuelva");
  assert.equal(IMPAGO_SEED.goalKind, "PAYMENT_RECOVERED", "el impago existe para que el recibo entre");
  assert.equal(REACTIVACION_SEED.goalKind, "RENEWED", "un excliente no puede reservar: volver es contratar");
  assert.equal(REFERRAL_90_DAYS_SEED.goalKind, "REFERRAL_SENT", "lo dejó decidido R1");
});

test("E14-35 · los huecos están declarados como dato y dicen a quién pedírselos", () => {
  // Un hueco declarado a medias es peor que no declararlo: se lee como resuelto.
  // Esto exige que cada uno diga QUÉ falta, A QUÉ afecta, DE QUIÉN es el
  // fichero, QUÉ pasa mientras tanto y cuáles son las salidas.
  const conHuecos = FLOW_SEEDS.filter((s) => s.gaps.length > 0);
  assert.ok(conHuecos.length > 0, "hay huecos conocidos: si esto queda a cero es que alguien los ha borrado");

  for (const seed of FLOW_SEEDS) {
    for (const gap of seed.gaps) {
      assert.ok(gap.falta.length > 20, `${seed.name}: un hueco sin explicar qué falta`);
      assert.ok(gap.afecta.length > 5, `${seed.name}: un hueco sin decir a qué afecta`);
      assert.ok(gap.duenio.length > 20, `${seed.name}: un hueco sin decir a quién hay que pedírselo`);
      assert.ok(gap.mientrasTanto.length > 20, `${seed.name}: un hueco sin decir qué hace el flujo mientras tanto`);
      assert.ok(gap.salidas.length >= 2, `${seed.name}: un hueco con menos de dos salidas no es una decisión`);
    }
  }
});

test("E14-35 · la campaña anual de septiembre está declarada como NO entregada", () => {
  // Es la mitad del flujo 6 que no se entrega, y la razón —no hay disparador de
  // fecha fija— tiene que estar en el dato para que no se dé por hecha.
  const hueco = REACTIVACION_SEED.gaps.find((g) => g.kind === "disparador");
  assert.ok(hueco, "sin este hueco declarado, la campaña de septiembre parece entregada y no lo está");
  assert.match(hueco.mientrasTanto, /a mano/i);
});

test("E14-35 · la semilla de R1 habla ya el idioma del motor", () => {
  // Los dos detalles de vocabulario que avisó E2: días y no horas, y TENURE con
  // `months` + `direction` y no `minMonths`.
  const paso = REFERRAL_90_DAYS_SEED.steps[0];
  assert.equal(paso.waitDays, 90);
  assert.ok(!("waitHours" in paso), "la espera del motor es waitDays, en días");

  const tenure = REFERRAL_90_DAYS_SEED.conditions.find((c) => c.type === "TENURE");
  assert.ok(tenure);
  assert.equal(tenure.config.months, 3);
  assert.equal(tenure.config.direction, "min");
  assert.ok(!("minMonths" in tenure.config), "`minMonths` no lo lee nadie: la condición se cumpliría siempre");
});

test("E14-35 · la bienvenida manda el formulario de M5 y no monta otro", () => {
  const paso0 = BIENVENIDA_SEED.steps[0];
  assert.equal(paso0.actionType, "SEND_FORM");
  assert.equal(paso0.actionConfig.milestoneKey, "INITIAL");

  // Y el paso del día 30 espera 28 días, no 30: la espera se cuenta desde el
  // paso anterior, que corrió el día 2. Es el error que no se ve en pantalla.
  const total = BIENVENIDA_SEED.steps.reduce((dias, s) => dias + s.waitDays, 0);
  assert.equal(total, 30, "el correo de revisión tiene que caer el día 30 del alta");
});

test("E14-35 · el impago cambia de estado por member-lifecycle y no por un update suelto", () => {
  const cambio = IMPAGO_SEED.steps.find((s) => s.actionType === "CHANGE_STATE");
  assert.ok(cambio, "el día 7 pasa a suspendido");
  assert.equal(cambio.actionConfig.state, "DELINQUENT");

  // Y cae en el día 7 del encargo, sumando las esperas de los pasos anteriores.
  const dias = IMPAGO_SEED.steps
    .slice(0, IMPAGO_SEED.steps.indexOf(cambio) + 1)
    .reduce((total, s) => total + s.waitDays, 0);
  assert.equal(dias, 7);
});

test("E14-35 · la ausencia avisa al director en la tercera semana", () => {
  const aviso = AUSENCIA_SEED.steps.find((s) => s.actionType === "NOTIFY_DIRECTOR");
  assert.ok(aviso);
  // El disparador entra a los 14 días y el aviso espera 7 más: tres semanas.
  assert.equal(AUSENCIA_SEED.trigger.config.days, 14);
  const desdeLaEntrada = AUSENCIA_SEED.steps
    .slice(0, AUSENCIA_SEED.steps.indexOf(aviso) + 1)
    .reduce((total, s) => total + s.waitDays, 0);
  assert.equal(14 + desdeLaEntrada, 21);
});

test("E14-25 · el cron de la cola de flujos no rebota a /login", () => {
  // Llegó con su propio workflow (`flujos-cron.yml`) y sin entrada en
  // PUBLIC_PATHS, así que el proxy lo rebotaba a la pantalla de inicio de
  // sesión: el cron recibía un 307 y LA COLA NO SE VACIABA NUNCA, sin que nada
  // se pusiera rojo. Lo encontró el e2e de esta pista al intentar mover el
  // motor por donde lo mueve producción.
  assert.equal(isPublicPath("/api/flujos/cron"), true, "el proxy lo rebotaría a /login y la cola no saldría nunca");

  // Y sigue sin abrir la pantalla del módulo, que es de dirección y va con
  // sesión: lo público es el endpoint del cron, no `/flujos`.
  assert.equal(isPublicPath("/flujos"), false);
});

test("E14-35 · el filtro de antigüedad del flujo 7 cuelga DEL PASO, no de la entrada", () => {
  // En el motor de E2 una condición sin paso se evalúa AL INSCRIBIR. El flujo 7
  // se dispara con el alta, así que en ese momento la antigüedad del socio es
  // CERO: como condición de entrada, «al menos 3 meses» no se cumple nunca y al
  // flujo NO ENTRARÍA NADIE. No falla, no avisa y no manda: el peor de los
  // fallos posibles. Colgada del paso se evalúa el día 90, que es lo que pedía
  // el encargo. Lo destapó el recuento de entradas de la primera semana.
  const tenure = REFERRAL_90_DAYS_SEED.conditions.find((c) => c.type === "TENURE");
  assert.ok(tenure);
  assert.equal(tenure.stepIndex, 0, "como condición de entrada no entraría nadie jamás");

  // Y la regla general: ninguna condición de ENTRADA puede depender de algo que
  // el disparador acaba de hacer imposible.
  for (const seed of FLOW_SEEDS) {
    if (seed.trigger.type !== "MEMBER_JOINED") continue;
    for (const cond of seed.conditions) {
      const deEntrada = cond.stepIndex === null || cond.stepIndex === undefined;
      const exigeAntiguedad = cond.type === "TENURE" && String(cond.config.direction ?? "min") === "min";
      assert.ok(
        !(deEntrada && exigeAntiguedad),
        `«${seed.name}» dispara con el alta y exige antigüedad al entrar: no entraría nadie nunca`
      );
    }
  }
});
