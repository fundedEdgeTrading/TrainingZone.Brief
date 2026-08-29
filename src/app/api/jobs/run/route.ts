import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { runLeadOwnerAlertRule } from "@/lib/leads-queries";
import { runFewSessionsScheduledRule, runLowPackBalanceRule } from "@/lib/trainer-alerts";
import { runStallDetectionRule } from "@/lib/stall-detection";
import { runConsecutiveNoShowsRule } from "@/lib/no-show-alerts";
import { runPeriodicCheckinRule } from "@/lib/checkin-schedule";
import { runScheduledCancellationsRule } from "@/lib/subscription-jobs";
import { runFeedbackCycleRule } from "@/lib/feedback-capture";
import { runAssessmentDueRule } from "@/lib/assessment-jobs";
import { runBirthdayRule } from "@/lib/birthday-jobs";
import { runRetentionAlertRule } from "@/lib/retention";
import { reportJobFailures } from "@/lib/job-failure-report";

/**
 * Disparador único para todas las reglas temporales del CRM (F10/F13/F14/F15) y
 * del motor de retención (G.3): 24h sin responsable, pocas sesiones EP
 * programadas, bono bajo, caída de frecuencia, estancamiento, check-ins
 * periódicos de objetivos/valoración de entrenadores, valoraciones vencidas,
 * faltas seguidas sin avisar y felicitaciones de cumpleaños. Sin worker en este
 * stack (Next.js), se invoca desde un cron externo (.github/workflows/jobs-cron.yml,
 * render.yaml u otro) contra esta route handler, protegida por un secreto compartido.
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
    noShowStreakAlerts: 0,
    retentionAlerts: 0,
    stallAlerts: 0,
    checkins: 0,
    scheduledCancellations: 0,
    feedbackCyclePrompts: 0,
    assessmentsDue: 0,
    birthdayGreetings: 0,
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
    // RB-RES-009: red de seguridad de la alerta por faltas seguidas, que
    // normalmente salta en el momento de marcar la falta (agenda).
    summary.noShowStreakAlerts += await run(org.id, "noShowStreakAlerts", () => runConsecutiveNoShowsRule(org.id));
    // Antes que `stallAlerts`: el estancamiento usa la alerta de retención como
    // señal `attendanceDropping`, así que la quiere recalculada de esta pasada y
    // no de la anterior.
    summary.retentionAlerts += await run(org.id, "retentionAlerts", () => runRetentionAlertRule(org.id));
    summary.stallAlerts += await run(org.id, "stallAlerts", () => runStallDetectionRule(org.id));
    summary.checkins += await run(org.id, "checkins", () => runPeriodicCheckinRule(org.id));
    summary.scheduledCancellations += await run(org.id, "scheduledCancellations", () => runScheduledCancellationsRule(org.id));
    summary.feedbackCyclePrompts += await run(org.id, "feedbackCyclePrompts", () => runFeedbackCycleRule(org.id));
    summary.assessmentsDue += await run(org.id, "assessmentsDue", () => runAssessmentDueRule(org.id));
    summary.birthdayGreetings += await run(org.id, "birthdayGreetings", () => runBirthdayRule(org.id));
  }

  // El array de fallos no puede quedarse solo en la respuesta del cron: se
  // convierte en tarea para la dirección de la organización afectada.
  await reportJobFailures(failures);

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
