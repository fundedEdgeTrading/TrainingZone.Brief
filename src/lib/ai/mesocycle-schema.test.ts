import { test } from "node:test";
import assert from "node:assert/strict";

import { MesocyclePlanSchema } from "./mesocycle-schema";
import { EP_PROFILES } from "./ep-profile";

/**
 * `profile` es el campo que decide con qué metodología (`methodology.ts`) se
 * genera y se refina el plan: si el modelo devolviera un valor fuera de los
 * 6 perfiles de Training Zone, `mesocycle-generator.ts` no sabría qué
 * sistema usar en el siguiente refinado. Este test sujeta que Zod lo exige.
 */

const BASE = {
  title: "Título",
  objective: "Objetivo",
  safetyCriteria: [],
  weeklyLayout: ["Lun TZ"],
  milestones: [{ week: 1, milestone: "hito" }],
  phases: [
    {
      name: "Fase 1",
      weekFrom: 1,
      weekTo: 4,
      notes: null,
      days: [
        {
          label: "A",
          venue: "TZ",
          focus: "Fuerza",
          warmup: ["Movilidad torácica"],
          blocks: [
            {
              name: "Fuerza",
              durationMin: 30,
              exercises: [
                {
                  name: "Sentadilla goblet",
                  sets: 3,
                  reps: "8-10",
                  load: null,
                  description: "...",
                  rationale: "...",
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

test("MesocyclePlanSchema acepta cada uno de los 6 perfiles Training Zone", () => {
  for (const profile of EP_PROFILES) {
    const result = MesocyclePlanSchema.safeParse({ ...BASE, profile });
    assert.equal(result.success, true, `perfil ${profile} debería ser válido`);
  }
});

test("MesocyclePlanSchema rechaza un perfil que no es uno de los 6", () => {
  const result = MesocyclePlanSchema.safeParse({ ...BASE, profile: "OTRO_INVENTADO" });
  assert.equal(result.success, false);
});

test("MesocyclePlanSchema rechaza un plan sin perfil", () => {
  const result = MesocyclePlanSchema.safeParse(BASE);
  assert.equal(result.success, false);
});
