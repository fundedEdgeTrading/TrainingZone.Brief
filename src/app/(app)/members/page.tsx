import Link from "next/link";
import { requireRole } from "@/lib/guard";
import { listMembers } from "@/lib/members-queries";
import { MEMBER_STATE_LABEL, MEMBER_STATE_TONE } from "@/lib/chart-colors";
import type { MemberState } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { TableShell, THead, Th, TRow, Td } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

const STATES: MemberState[] = ["ACTIVE", "DELINQUENT", "FROZEN", "TRIAL", "PROSPECT", "CANCELLED"];

function initials(first: string, last: string) {
  return ((first[0] ?? "") + (last[0] ?? "")).toUpperCase();
}

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; state?: string }>;
}) {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "RECEPTION"]);
  const params = await searchParams;
  const members = await listMembers(session.user.orgId, {
    q: params.q,
    state: (params.state as MemberState) || undefined,
  });

  return (
    <div className="tz-page space-y-4">
      <PageHeader description={`${members.length} resultados`} />

      <form className="flex flex-wrap gap-2 bg-brand-card border border-brand-border rounded-card p-3 shadow-card">
        <Input
          type="text"
          name="q"
          defaultValue={params.q}
          placeholder="Buscar por nombre o email..."
          className="flex-1 min-w-[200px]"
        />
        <Select name="state" defaultValue={params.state} className="w-auto">
          <option value="">Todos los estados</option>
          {STATES.map((s) => (
            <option key={s} value={s}>
              {MEMBER_STATE_LABEL[s]}
            </option>
          ))}
        </Select>
        <Button type="submit">Filtrar</Button>
      </form>

      {members.length === 0 ? (
        <TableShell>
          <tbody>
            <tr>
              <td colSpan={5}>
                <EmptyState title="Sin resultados" description="No hay socios que coincidan con estos filtros." />
              </td>
            </tr>
          </tbody>
        </TableShell>
      ) : (
        <TableShell>
          <THead>
            <Th>Socio</Th>
            <Th>Centro</Th>
            <Th>Estado</Th>
            <Th>Plan actual</Th>
            <Th>Alta</Th>
          </THead>
          <tbody>
            {members.map((m, i) => (
              <TRow key={m.id} className="group" style={i < 6 ? { animation: `tzFadeUp .4s ${(i * 0.03).toFixed(2)}s both` } : undefined}>
                <Td>
                  <Link href={`/members/${m.id}`} className="flex items-center gap-3">
                    <span className="w-9 h-9 rounded-full bg-tz-sand text-brand-text-2 font-display font-bold text-xs flex items-center justify-center shrink-0">
                      {initials(m.firstName, m.lastName)}
                    </span>
                    <span>
                      <span className="font-semibold text-brand-text group-hover:underline">
                        {m.firstName} {m.lastName}
                      </span>
                      <span className="block text-xs text-faint">{m.email}</span>
                    </span>
                  </Link>
                </Td>
                <Td className="text-brand-text-2">{m.primaryCenter.name}</Td>
                <Td>
                  <Badge tone={MEMBER_STATE_TONE[m.state]}>{MEMBER_STATE_LABEL[m.state]}</Badge>
                </Td>
                <Td className="text-brand-text-2">{m.subscriptions[0]?.plan.name ?? "—"}</Td>
                <Td className="text-brand-muted tz-nums">{m.joinedAt.toLocaleDateString("es-ES")}</Td>
              </TRow>
            ))}
          </tbody>
        </TableShell>
      )}
    </div>
  );
}
