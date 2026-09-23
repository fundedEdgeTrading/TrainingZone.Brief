import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkHealth } from "@/lib/health-check";

/**
 * PROD-06 · Comprobación de salud para Render (`healthCheckPath`) y para el
 * monitor de disponibilidad. Pública (ver `lib/public-paths.ts`): quien la
 * llama no tiene sesión.
 *
 * Contrato: 200 `{ ok: true, db: "up" }` tras un `SELECT 1` que responde en
 * menos de 2 s; si falla o expira, 503 `{ ok: false, db: "down" }`. Sin
 * secretos, versiones ni mensajes de error (ver `lib/health-check.ts`).
 */

// Siempre en la petición: un health check servido desde caché diría "up" con
// la base de datos caída.
export const dynamic = "force-dynamic";

export async function GET() {
  const { status, body } = await checkHealth(() => prisma.$queryRaw`SELECT 1`);
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
