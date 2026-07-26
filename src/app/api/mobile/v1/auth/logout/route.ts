import type { NextRequest } from "next/server";
import { z } from "zod";
import { revokeRefreshToken } from "@/lib/mobile-auth";
import { apiOk, apiError } from "../../_lib/response";

const bodySchema = z.object({ refreshToken: z.string().min(1) });

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("refreshToken es obligatorio.", 400);

  await revokeRefreshToken(parsed.data.refreshToken);
  return apiOk({ loggedOut: true });
}
