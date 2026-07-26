import { NextResponse } from "next/server";

// Envoltura uniforme (docs/APP_MOVIL_NATIVA_PLAN.md §4.7), coherente con el
// patrón *ActionResult ya usado en los Server Actions del CRM.
export function apiOk<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data }, { status });
}

export function apiError(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}
