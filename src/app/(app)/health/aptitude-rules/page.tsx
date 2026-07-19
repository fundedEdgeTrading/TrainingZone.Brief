import { requireRole } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { createAptitudeRule } from "./actions";
import { PageHeader } from "@/components/ui/page-header";
import { Field, Input, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { TableShell, THead, Th, TRow, Td } from "@/components/ui/table";
import DeleteButton from "./delete-button";

const LIGHT_DOT: Record<string, string> = { RED: "bg-critical", AMBER: "bg-warning", GREEN: "bg-good" };
const LIGHT_LABEL: Record<string, string> = { RED: "Evitar", AMBER: "Adaptar", GREEN: "Libre" };

export default async function AptitudeRulesPage() {
  const session = await requireRole(["OWNER"]);

  const rules = await prisma.aptitudeRule.findMany({
    where: { orgId: session.user.orgId },
    include: { editedBy: { select: { name: true } } },
    orderBy: [{ injuryZone: "asc" }, { light: "desc" }],
  });

  return (
    <div className="tz-page space-y-4">
      <PageHeader description="Reglas deterministas mantenidas por Sergio, no por un modelo de IA (G.2). Cada zona de lesión se traduce en un bloque de trabajo con semáforo y adaptación. El entrenador ve el resultado en el Session Brief; la IA (fuera de esta entrega) solo redactaría, nunca decidiría el color." />

      <form
        action={createAptitudeRule}
        className="bg-brand-card border border-brand-border rounded-card p-4 shadow-card grid grid-cols-1 md:grid-cols-5 gap-3 items-end"
      >
        <Field label="Zona">
          <Input name="injuryZone" placeholder="p.ej. hombro derecho" required />
        </Field>
        <Field label="Bloque">
          <Input name="blockArea" placeholder="p.ej. Empuje vertical" required />
        </Field>
        <Field label="Semáforo">
          <Select name="light">
            <option value="RED">Evitar</option>
            <option value="AMBER">Adaptar</option>
            <option value="GREEN">Libre</option>
          </Select>
        </Field>
        <Field label="Adaptación">
          <Input name="adaptation" placeholder="opcional" />
        </Field>
        <Button type="submit">Añadir regla</Button>
      </form>

      <TableShell>
        <THead>
          <Th>Zona</Th>
          <Th>Bloque</Th>
          <Th>Semáforo</Th>
          <Th>Adaptación</Th>
          <Th>Editado por</Th>
          <Th />
        </THead>
        <tbody>
          {rules.map((r) => (
            <TRow key={r.id}>
              <Td className="font-medium text-text-2">{r.injuryZone}</Td>
              <Td>{r.blockArea}</Td>
              <Td>
                <span className="inline-flex items-center gap-1.5">
                  <span className={`w-2.5 h-2.5 rounded-full ${LIGHT_DOT[r.light]}`} />
                  {LIGHT_LABEL[r.light]}
                </span>
              </Td>
              <Td className="text-muted">{r.adaptation ?? "—"}</Td>
              <Td className="text-faint text-xs">
                {r.editedBy?.name} · {r.updatedAt.toLocaleDateString("es-ES")}
              </Td>
              <Td>
                <DeleteButton id={r.id} />
              </Td>
            </TRow>
          ))}
        </tbody>
      </TableShell>
    </div>
  );
}
