import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { revalidateSessionViews } from "@/lib/revalidate-sessions";
import { cancelBookingForMember } from "@/lib/portal-queries";
import { requireMember } from "../../../../_lib/require-member";
import { apiOk, apiError } from "../../../../_lib/response";

export async function POST(req: NextRequest, { params }: { params: Promise<{ bookingId: string }> }) {
  const auth = await requireMember(req);
  if (!auth.ok) return auth.response;

  const { bookingId } = await params;
  const result = await cancelBookingForMember(auth.member.id, bookingId);
  if (!result.ok) return apiError(result.error, 400);

  revalidatePath("/portal/agenda");
  revalidatePath("/portal");
  revalidateSessionViews();

  return apiOk({ cancelled: true });
}
