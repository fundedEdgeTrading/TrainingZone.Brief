import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";
import { runFlowQueue, type FlowRunReport } from "@/lib/flows";

/**
 * E2 · La pasada de la COLA DE FLUJOS, con su propio disparador.
 *
 * ┌─ POR QUÉ ESTO EXISTE, y no basta con `/api/jobs/run` ────────────────────┐
 * │ El cron general corre UNA vez al día, a las 05:00 UTC — las 06:00 o las   │
 * │ 07:00 en Madrid según la época del año. Las dos horas caen DENTRO de la   │
 * │ ventana de silencio (22:00-8:00), así que el motor hace exactamente lo    │
 * │ que debe: no manda y reprograma a las 8:00. Y al día siguiente vuelve a   │
 * │ pasar antes de las 8:00 y vuelve a reprogramar. Con una sola pasada       │
 * │ diaria a esa hora, la cola NO SE VACÍA NUNCA: ni un correo saldría, y el  │
 * │ módulo parecería roto sin que ninguna regla estuviera mal.                │
 * │                                                                          │
 * │ La ventana de silencio no se toca —es una de las seis reglas— y la        │
 * │ cadencia del cron general tampoco: sus reglas (cumpleaños, preaviso SEPA, │
 * │ conservación) están pensadas para una pasada diaria y son de otras        │
 * │ pistas. Lo que hace falta es que ALGUIEN llame al motor DENTRO de la      │
 * │ ventana, y eso es este endpoint más                                       │
 * │ `.github/workflows/flujos-cron.yml`, que lo llama varias veces al día     │
 * │ entre las 8:00 y las 22:00 del centro.                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Comparte secreto con `/api/jobs/run` a propósito: es el mismo cron y el
 * mismo operador, y un segundo secreto sería una segunda cosa que se olvida
 * de rotar. Falla cerrado si no está configurado.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.JOBS_CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "jobs deshabilitados: falta JOBS_CRON_SECRET" }, { status: 503 });
  }
  const provided = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret");
  if (!provided || !safeEqual(provided, secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const orgs = await prisma.organization.findMany({ select: { id: true } });
  const reports: FlowRunReport[] = [];
  const failures: { orgId: string; error: string }[] = [];

  // Cada organización se aísla: una con datos que hagan fallar el motor no
  // puede dejar sin correo a las demás, en silencio y hasta mañana.
  for (const org of orgs) {
    try {
      reports.push(await runFlowQueue(org.id));
    } catch (error) {
      failures.push({ orgId: org.id, error: error instanceof Error ? error.message : String(error) });
      console.error(`[flujos] la cola falló en la organización ${org.id}:`, error);
    }
  }

  const summary = reports.reduce(
    (acc, r) => ({
      enrolled: acc.enrolled + r.enrolled,
      stepsRun: acc.stepsRun + r.stepsRun,
      emailsSent: acc.emailsSent + r.emailsSent,
      testEmailsSent: acc.testEmailsSent + r.testEmailsSent,
      completed: acc.completed + r.completed,
    }),
    { enrolled: 0, stepsRun: 0, emailsSent: 0, testEmailsSent: 0, completed: 0 }
  );

  // 207 cuando algo falló, igual que el cron general: la pasada se considera
  // hecha —no tiene sentido reintentar las organizaciones que sí pasaron— pero
  // el fallo queda visible en la respuesta en vez de perderse en los logs.
  return NextResponse.json(
    { ok: failures.length === 0, ranAt: new Date().toISOString(), summary, reports, failures },
    { status: failures.length === 0 ? 200 : 207 }
  );
}

/** Comparación en tiempo constante: un `!==` filtra el secreto carácter a carácter. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
