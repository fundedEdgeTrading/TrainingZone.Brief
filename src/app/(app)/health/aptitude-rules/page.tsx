import { requireRole } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { createAptitudeRule } from "./actions";
import DeleteButton from "./delete-button";

const LIGHT_EMOJI: Record<string, string> = { RED: "🔴", AMBER: "🟡", GREEN: "🟢" };

export default async function AptitudeRulesPage() {
  const session = await requireRole(["OWNER"]);

  const rules = await prisma.aptitudeRule.findMany({
    where: { orgId: session.user.orgId },
    include: { editedBy: { select: { name: true } } },
    orderBy: [{ injuryZone: "asc" }, { light: "desc" }],
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-tz-black">Semáforo de Aptitud — Reglas</h1>
        <p className="text-sm text-muted max-w-2xl">
          Reglas deterministas mantenidas por Sergio, no por un modelo de IA (G.2).
          Cada zona de lesión se traduce en un bloque de trabajo con semáforo y
          adaptación. El entrenador ve el resultado en el Session Brief; la IA
          (fuera de esta entrega) solo redactaría, nunca decidiría el color.
        </p>
      </div>

      <form action={createAptitudeRule} className="bg-white border border-tz-linen rounded-xl p-4 grid grid-cols-1 md:grid-cols-5 gap-2">
        <input name="injuryZone" placeholder="Zona (p.ej. hombro derecho)" required className="rounded-lg border border-tz-linen px-3 py-2 text-sm" />
        <input name="blockArea" placeholder="Bloque (p.ej. Empuje vertical)" required className="rounded-lg border border-tz-linen px-3 py-2 text-sm" />
        <select name="light" className="rounded-lg border border-tz-linen px-3 py-2 text-sm">
          <option value="RED">🔴 Evitar</option>
          <option value="AMBER">🟡 Adaptar</option>
          <option value="GREEN">🟢 Libre</option>
        </select>
        <input name="adaptation" placeholder="Adaptación sugerida (opcional)" className="rounded-lg border border-tz-linen px-3 py-2 text-sm md:col-span-1" />
        <button className="rounded-lg bg-tz-black text-white px-4 py-2 text-sm font-medium hover:bg-brand-ink-soft">
          Añadir regla
        </button>
      </form>

      <div className="bg-white border border-tz-linen rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-tz-bone text-muted text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Zona</th>
              <th className="text-left px-4 py-2">Bloque</th>
              <th className="text-left px-4 py-2">Semáforo</th>
              <th className="text-left px-4 py-2">Adaptación</th>
              <th className="text-left px-4 py-2">Editado por</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id} className="border-t border-tz-sand">
                <td className="px-4 py-2 font-medium text-text-2">{r.injuryZone}</td>
                <td className="px-4 py-2">{r.blockArea}</td>
                <td className="px-4 py-2">{LIGHT_EMOJI[r.light]}</td>
                <td className="px-4 py-2 text-muted">{r.adaptation ?? "—"}</td>
                <td className="px-4 py-2 text-faint text-xs">
                  {r.editedBy?.name} · {r.updatedAt.toLocaleDateString("es-ES")}
                </td>
                <td className="px-4 py-2">
                  <DeleteButton id={r.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
