import type { NextRequest } from "next/server";
import { getOrganization, getCentersWithCounts, getStaffWithMemberships } from "@/lib/org-queries";
import { ROLE_LABEL } from "@/lib/rbac";
import { requireApiRole } from "../../_lib/api-session";
import { apiOk } from "../../_lib/response";

// Vista de solo lectura de src/app/(app)/organization/page.tsx: centros y
// personal de la organización, pensada para consultar desde el móvil.
export async function GET(req: NextRequest) {
  const auth = await requireApiRole(req, ["OWNER", "PLATFORM_ADMIN", "HR_MANAGER"]);
  if (!auth.ok) return auth.response;
  const { claims } = auth;

  const [organization, centers, staff] = await Promise.all([
    getOrganization(claims.orgId),
    getCentersWithCounts(claims.orgId),
    getStaffWithMemberships(claims.orgId),
  ]);

  return apiOk({
    organization: organization ? { id: organization.id, name: organization.name, logoUrl: organization.logoUrl } : null,
    centers: centers.map((c) => ({
      id: c.id,
      name: c.name,
      timezone: c.timezone,
      membersCount: c._count.members,
      staffCount: c._count.staffMemberships,
    })),
    staff: staff.map((s) => ({
      id: s.id,
      name: s.name,
      email: s.email,
      role: s.role,
      roleLabel: ROLE_LABEL[s.role],
      centerNames: s.centerMemberships.map((m) => m.center.name),
      invitationPending: Boolean(s.invitation && !s.invitation.usedAt),
    })),
  });
}
