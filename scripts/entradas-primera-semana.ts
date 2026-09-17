import "dotenv/config";

import { prisma } from "@/lib/prisma";
import { DEFAULT_TIMEZONE } from "@/lib/date-utils";
import { matchesAllConditions, type FlowConditionShape, type FlowMemberFacts } from "@/lib/flows/conditions";
import { candidatesForTrigger } from "@/lib/flows/triggers";
import { FLOW_SEEDS } from "@/lib/flows/seeds";

/**
 * ¿A CUÁNTA GENTE LE ESCRIBIRÍA CADA FLUJO LA PRIMERA SEMANA?
 *
 *   npx tsx scripts/entradas-primera-semana.ts [slug-de-la-organizacion]
 *
 * Es la pregunta con la que se cierra el encargo de E3, y no es retórica: un
 * flujo por el que entran más de VEINTE socios la primera semana o está mal
 * acotado o hay que escalonar la salida. Esa decisión es de negocio, no de
 * ingeniería, y este script es lo que se la pone delante.
 *
 * SOLO LEE. No escribe ni una fila: pregunta a los MISMOS disparadores del motor
 * (`candidatesForTrigger`) y evalúa las MISMAS condiciones (`matchesAllConditions`)
 * con las semillas de verdad. Si este número y el que salga en producción se
 * separaran, sería porque alguien duplicó una regla.
 *
 * ---------------------------------------------------------------------------
 * QUÉ CUENTA COMO «LA PRIMERA SEMANA», y por qué no es lo mismo que el día a día
 * ---------------------------------------------------------------------------
 * Lo que se mide es el ARRANQUE EN FRÍO: los flujos se encienden hoy sobre la
 * base de socios tal y como está. Los disparadores de suceso (alta, recibo
 * fallido, formulario respondido) miran una ventana de siete días hacia atrás,
 * así que el primer día recogen toda esa semana de golpe; los de ESTADO
 * (ausencia, bono bajo) recogen a TODO EL QUE CUMPLA LA CONDICIÓN HOY, lleve así
 * dos semanas o dos años. Ese segundo grupo es donde aparecen los números
 * grandes, y es exactamente el que hay que escalonar.
 *
 * DOS COSAS QUE ESTE NÚMERO NO DICE, y conviene tenerlas delante:
 *  · Son ENTRADAS, no correos. El tope de un correo por socio y semana entre
 *    todos los flujos actúa DESPUÉS: quien entre en dos flujos a la vez recibe
 *    uno y el otro se aplaza. La columna «cuántos entran en más de uno» lo dice.
 *  · No descuenta a quien no ha dado su consentimiento de marketing. Esos entran
 *    en el flujo —se les puede abrir una tarea— pero no reciben correo. Va
 *    aparte, abajo.
 */

type Fila = {
  nombre: string;
  orden: number;
  porCentro: Map<string, number>;
  total: number;
  sinConsentimiento: number;
  socios: Set<string>;
};

async function main() {
  const slug = process.argv[2];
  const org = slug
    ? await prisma.organization.findUnique({ where: { slug }, select: { id: true, name: true } })
    : await masGrande();
  if (!org) {
    console.error(`No hay ninguna organización con el slug «${slug}».`);
    process.exitCode = 1;
    return;
  }

  const centros = await prisma.center.findMany({
    where: { orgId: org.id },
    select: { id: true, name: true, timezone: true },
    orderBy: { name: "asc" },
  });
  const now = new Date();

  const socios = await prisma.member.count({ where: { orgId: org.id } });
  const sinConsentir = await prisma.member.count({
    where: { orgId: org.id, OR: [{ consentMarketing: false }, { emailOptOutAt: { not: null } }] },
  });

  console.log(`\n${org.name} · ${socios} socios · ${centros.length} centros`);
  console.log(`${sinConsentir} sin consentimiento de marketing o dados de baja: entran en el flujo pero no reciben correo.\n`);

  const filas: Fila[] = [];
  const vecesPorSocio = new Map<string, number>();

  for (const seed of FLOW_SEEDS) {
    const fila: Fila = {
      nombre: seed.name,
      orden: seed.order,
      porCentro: new Map(),
      total: 0,
      sinConsentimiento: 0,
      socios: new Set(),
    };

    for (const centro of centros) {
      const candidatos = await candidatesForTrigger({
        orgId: org.id,
        centerId: centro.id,
        triggerType: seed.trigger.type,
        triggerConfig: seed.trigger.config,
        now,
        timeZone: centro.timezone || DEFAULT_TIMEZONE,
      });
      if (candidatos.length === 0) continue;

      const facts = await fotogramas(org.id, candidatos);
      // Solo las condiciones DE ENTRADA (las que no cuelgan de un paso): son las
      // únicas que deciden quién entra. Las de paso se evalúan el día del envío
      // y recortan más adelante — contarlas aquí daría un número más bajo del
      // que de verdad entra en el flujo.
      const conditions = seed.conditions
        .filter((c) => c.stepIndex === null || c.stepIndex === undefined)
        .map((c): FlowConditionShape => ({ type: c.type, config: c.config, negated: c.negated ?? false }));

      let entran = 0;
      for (const memberId of candidatos) {
        const frame = facts.get(memberId);
        if (!frame || !matchesAllConditions(conditions, frame, now)) continue;
        entran++;
        fila.socios.add(memberId);
        vecesPorSocio.set(memberId, (vecesPorSocio.get(memberId) ?? 0) + 1);
      }
      if (entran > 0) fila.porCentro.set(centro.name, entran);
      fila.total += entran;
    }

    if (fila.socios.size > 0) {
      fila.sinConsentimiento = await prisma.member.count({
        where: {
          id: { in: [...fila.socios] },
          OR: [{ consentMarketing: false }, { emailOptOutAt: { not: null } }],
        },
      });
    }
    filas.push(fila);
  }

  imprime(filas);

  const enVarios = [...vecesPorSocio.values()].filter((n) => n > 1).length;
  console.log(
    `\nSocios que entrarían en MÁS DE UN flujo la primera semana: ${enVarios}. A esos les llega UNO y el resto se ` +
      `aplaza —el tope es de un correo por socio y semana entre todos los flujos—, así que no se pierde ninguno: llegan más tarde.`
  );
}

function imprime(filas: Fila[]) {
  console.log("FLUJO                                          ENTRAN   SIN CONSENT.  DESGLOSE POR CENTRO");
  console.log("─".repeat(110));
  for (const fila of filas) {
    const desglose = [...fila.porCentro.entries()].map(([n, c]) => `${n}: ${c}`).join(" · ") || "—";
    const aviso = fila.total > 20 ? "  ← MÁS DE VEINTE" : "";
    console.log(
      `${fila.nombre.padEnd(46)} ${String(fila.total).padStart(4)}   ${String(fila.sinConsentimiento).padStart(10)}  ${desglose}${aviso}`
    );
  }
  console.log("─".repeat(110));
  console.log(
    "Más de veinte en un flujo = o está mal acotado o hay que escalonar la salida. Eso lo decide negocio."
  );
}

/** La organización con más socios, no «la primera»: la demo trae varias vacías. */
async function masGrande() {
  const [conMas] = await prisma.member.groupBy({
    by: ["orgId"],
    _count: { _all: true },
    orderBy: { _count: { orgId: "desc" } },
    take: 1,
  });
  if (!conMas) return null;
  return prisma.organization.findUnique({ where: { id: conMas.orgId }, select: { id: true, name: true } });
}

/** El fotograma de cada socio, de una vez, igual que hace el motor. */
async function fotogramas(orgId: string, memberIds: string[]): Promise<Map<string, FlowMemberFacts>> {
  const rows = await prisma.member.findMany({
    where: { id: { in: memberIds }, orgId },
    select: {
      id: true,
      primaryCenterId: true,
      state: true,
      joinedAt: true,
      subscriptions: { where: { status: "ACTIVE" }, select: { plan: { select: { type: true } } } },
      tags: { where: { tagDefinition: { active: true } }, select: { tagDefinition: { select: { key: true } } } },
    },
  });
  return new Map(
    rows.map((m) => [
      m.id,
      {
        memberId: m.id,
        centerId: m.primaryCenterId,
        state: m.state,
        joinedAt: m.joinedAt,
        planTypes: [...new Set(m.subscriptions.map((s) => s.plan.type))],
        tagKeys: m.tags.map((t) => t.tagDefinition.key),
        // Ninguna semilla condiciona por entrenador; si alguna lo hiciera, aquí
        // habría que cargarlo y el número saldría más bajo, nunca más alto.
        trainerUserIds: [],
      },
    ])
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
