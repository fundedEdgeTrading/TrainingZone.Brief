import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { runLeadOwnerAlertRule } from "@/lib/leads-queries";
import { runFewSessionsScheduledRule, runLowPackBalanceRule } from "@/lib/trainer-alerts";
import { runStallDetectionRule } from "@/lib/stall-detection";
import { runPeriodicCheckinRule } from "@/lib/checkin-schedule";
import { generateOfferSuggestions } from "@/lib/offers-queries";

/**
 * Disparador único para todas las reglas temporales del CRM (F10/F13/F14/F15):
 * 24h sin responsable, pocas sesiones EP programadas, bono bajo, estancamiento,
 * check-ins periódicos de objetivos/valoración de entrenadores. Sin worker en
 * este stack (Next.js), se invoca desde un cron externo (Vercel Cron u otro)
 * contra esta route handler, protegida por un secreto compartido.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.JOBS_CRON_SECRET;
  const provided = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret");
  if (secret && provided !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const orgs = await prisma.organization.findMany({ select: { id: true } });
  const summary = { leadOwnerAlerts: 0, fewSessionsAlerts: 0, lowPackAlerts: 0, stallAlerts: 0, checkins: 0, offerSuggestions: 0 };

  for (const org of orgs) {
    summary.leadOwnerAlerts += await runLeadOwnerAlertRule(org.id);
    summary.fewSessionsAlerts += await runFewSessionsScheduledRule(org.id);
    summary.lowPackAlerts += await runLowPackBalanceRule(org.id);
    summary.stallAlerts += await runStallDetectionRule(org.id);
    summary.checkins += await runPeriodicCheckinRule(org.id);
    summary.offerSuggestions += await generateOfferSuggestions(org.id);
  }

  return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), summary });
}
