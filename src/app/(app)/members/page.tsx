import Link from "next/link";
import { requireRole } from "@/lib/guard";
import { listMembers } from "@/lib/members-queries";
import { MEMBER_STATE_COLOR, MEMBER_STATE_LABEL } from "@/lib/chart-colors";
import type { MemberState } from "@prisma/client";

const STATES: MemberState[] = ["ACTIVE", "DELINQUENT", "FROZEN", "TRIAL", "PROSPECT", "CANCELLED"];

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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-tz-black">Socios</h1>
          <p className="text-sm text-muted">{members.length} resultados</p>
        </div>
      </div>

      <form className="flex flex-wrap gap-2 bg-white border border-tz-linen rounded-xl p-3">
        <input
          type="text"
          name="q"
          defaultValue={params.q}
          placeholder="Buscar por nombre o email..."
          className="flex-1 min-w-[200px] rounded-lg border border-tz-linen px-3 py-2 text-sm"
        />
        <select
          name="state"
          defaultValue={params.state}
          className="rounded-lg border border-tz-linen px-3 py-2 text-sm"
        >
          <option value="">Todos los estados</option>
          {STATES.map((s) => (
            <option key={s} value={s}>
              {MEMBER_STATE_LABEL[s]}
            </option>
          ))}
        </select>
        <button className="rounded-lg bg-tz-black text-tz-bone px-4 py-2 text-sm font-medium hover:bg-brand-ink-soft">
          Filtrar
        </button>
      </form>

      <div className="bg-white border border-tz-linen rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-tz-bone text-muted text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Socio</th>
              <th className="text-left px-4 py-3">Centro</th>
              <th className="text-left px-4 py-3">Estado</th>
              <th className="text-left px-4 py-3">Plan actual</th>
              <th className="text-left px-4 py-3">Alta</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-t border-tz-sand hover:bg-tz-bone">
                <td className="px-4 py-3">
                  <Link href={`/members/${m.id}`} className="font-medium text-tz-black hover:underline">
                    {m.firstName} {m.lastName}
                  </Link>
                  <div className="text-xs text-faint">{m.email}</div>
                </td>
                <td className="px-4 py-3 text-text-2">{m.primaryCenter.name}</td>
                <td className="px-4 py-3">
                  <span
                    className="inline-block rounded-full px-2 py-0.5 text-xs font-medium text-white"
                    style={{ backgroundColor: MEMBER_STATE_COLOR[m.state] }}
                  >
                    {MEMBER_STATE_LABEL[m.state]}
                  </span>
                </td>
                <td className="px-4 py-3 text-text-2">{m.subscriptions[0]?.plan.name ?? "—"}</td>
                <td className="px-4 py-3 text-muted">
                  {m.joinedAt.toLocaleDateString("es-ES")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
