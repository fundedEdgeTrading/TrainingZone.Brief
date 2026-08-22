import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { runLeadOwnerAlertRule } from "@/lib/leads-queries";
import { runFewSessionsScheduledRule, runLowPackBalanceRule } from "@/lib/trainer-alerts";
import { runStallDetectionRule } from "@/lib/stall-detection";
import { runPeriodicCheckinRule } from "@/lib/checkin-schedule";
import { runScheduledCancellationsRule } from "@/lib/subscription-jobs";
import { runFeedbackCycleRule } from "@/lib/feedback-capture";

/**
 * Disparador único para todas las reglas temporales del CRM (F10/F13/F14/F15):
 * 24h sin responsable, pocas sesiones EP programadas, bono bajo, estancamiento,
 * check-ins periódicos de objetivos/valoración de entrenadores. Sin worker en
 * este stack (Next.js), se invoca desde un cron externo (Vercel Cron u otro)
 * contra esta route handler, protegida por un secreto compartido.
 */
export async function GET(req: NextRequest) {
  // Falla cerrado: sin secreto configurado el endpoint no se atiende. Antes se
  // abría a cualquiera (`if (secret && ...)`), que es una superficie de ataque
  // gratuita en cuanto la variable falta en un despliegue.
  const secret = process.env.JOBS_CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "jobs deshabilitados: falta JOBS_CRON_SECRET" }, { status: 503 });
  }
  const provided = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret");
  if (!provided || !safeEqual(provided, secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const orgs = await prisma.organization.findMany({ select: { id: true } });
  const summary = {
    leadOwnerAlerts: 0,
    fewSessionsAlerts: 0,
    lowPackAlerts: 0,
    stallAlerts: 0,
    checkins: 0,
    // Ofertas aparcadas (F2): la clave se mantiene a 0 para no cambiar la forma
    // de la respuesta que consume el cron externo.
    offerSuggestions: 0,
    scheduledCancellations: 0,
    feedbackCyclePrompts: 0,
  };


  // Cada regla se aísla: antes las ocho corrían sueltas dentro del bucle, así
  // que una sola organización con datos que hicieran fallar una regla tumbaba
  // el handler entero y TODAS las organizaciones siguientes se quedaban sin
  // procesar, en silencio y hasta la próxima pasada del cron.
  const failures: { orgId: string; rule: string; error: string }[] = [];
  const run = async (orgId: string, rule: string, fn: () => Promise<number>) => {
    try {
      return await fn();
    } catch (error) {
      failures.push({ orgId, rule, error: error instanceof Error ? error.message : String(error) });
      console.error(`[jobs] ${rule} falló en la organización ${orgId}:`, error);
      return 0;
    }
  };

  for (const org of orgs) {
    summary.leadOwnerAlerts += await run(org.id, "leadOwnerAlerts", () => runLeadOwnerAlertRule(org.id));
    summary.fewSessionsAlerts += await run(org.id, "fewSessionsAlerts", () => runFewSessionsScheduledRule(org.id));
    summary.lowPackAlerts += await run(org.id, "lowPackAlerts", () => runLowPackBalanceRule(org.id));
    summary.stallAlerts += await run(org.id, "stallAlerts", () => runStallDetectionRule(org.id));
    summary.checkins += await run(org.id, "checkins", () => runPeriodicCheckinRule(org.id));
    // Sugerencias de oferta desactivadas mientras el módulo de Ofertas está
    // aparcado (docs/MODULOS_APARCADOS.md). Para reactivarlas: volver a llamar a
    // `generateOfferSuggestions(org.id)` de @/lib/offers-queries aquí.
    summary.scheduledCancellations += await run(org.id, "scheduledCancellations", () => runScheduledCancellationsRule(org.id));
    summary.feedbackCyclePrompts += await run(org.id, "feedbackCyclePrompts", () => runFeedbackCycleRule(org.id));
  }

  // 207 cuando algo falló: el cron sigue considerándose ejecutado (no tiene
  // sentido reintentar las reglas que sí pasaron) pero el fallo queda visible
  // en la respuesta en vez de perderse en los logs.
  return NextResponse.json(
    { ok: failures.length === 0, ranAt: new Date().toISOString(), summary, failures },
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
