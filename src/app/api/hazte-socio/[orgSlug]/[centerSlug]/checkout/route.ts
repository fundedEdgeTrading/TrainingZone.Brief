import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getPublicMembershipContext } from "@/lib/public-membership-queries";
import { createMemberCheckout, createProspectMemberCheckout } from "@/lib/member-billing";

/**
 * Checkout público anónimo de socio (D1/Plano 2, landing `/hazte-socio`). Mismo patrón que
 * `/api/checkout` (alta de organizaciones, Plano 1): route handler público en vez de server
 * action, para redirigir de forma nativa a la URL externa de Stripe (303, funciona sin JS).
 *
 * Email ya socio de esta organización → renovación/segundo bono sobre esa ficha
 * (RB-ALTA-003). Email nuevo → prospecto: el Member nace en el webhook tras el pago.
 */
const checkoutSchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().optional(),
  planId: z.string().trim().min(1),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ orgSlug: string; centerSlug: string }> }) {
  const { orgSlug, centerSlug } = await params;

  const form = await req.formData().catch(() => null);
  const parsed = checkoutSchema.safeParse({
    firstName: form?.get("firstName"),
    lastName: form?.get("lastName"),
    email: form?.get("email"),
    phone: form?.get("phone") || undefined,
    planId: form?.get("planId"),
  });
  if (!parsed.success) {
    return redirectBack(req, orgSlug, centerSlug, "Completa nombre, apellidos, email y elige un plan.");
  }

  const ctx = await getPublicMembershipContext(orgSlug, centerSlug);
  if (!ctx) return NextResponse.json({ ok: false, error: "Centro no encontrado." }, { status: 404 });

  if (!ctx.stripeReady) {
    return redirectBack(req, orgSlug, centerSlug, "Este centro aún no tiene el cobro online activado — contacta directamente con ellos.");
  }

  const plan = ctx.plans.find((p) => p.id === parsed.data.planId);
  if (!plan) return redirectBack(req, orgSlug, centerSlug, "Selecciona un plan válido.");

  const { firstName, lastName, email, phone } = parsed.data;

  // RB-ALTA-003: un pago con un email que ya es socio de esta organización
  // actualiza su ficha (renovación/segundo bono), no crea una segunda.
  const existingMember = await prisma.member.findFirst({ where: { orgId: ctx.organization.id, email }, select: { id: true } });

  const result = existingMember
    ? await createMemberCheckout({
        orgId: ctx.organization.id,
        memberId: existingMember.id,
        planId: plan.id,
        centerId: ctx.center.id,
        origin: "landing",
      })
    : await createProspectMemberCheckout({
        orgId: ctx.organization.id,
        centerId: ctx.center.id,
        planId: plan.id,
        firstName,
        lastName,
        email,
        phone,
      });

  if (!result.ok) return redirectBack(req, orgSlug, centerSlug, result.error);

  return NextResponse.redirect(result.url, { status: 303 });
}

function redirectBack(req: NextRequest, orgSlug: string, centerSlug: string, motivo: string) {
  const url = new URL(`/hazte-socio/${orgSlug}/${centerSlug}`, req.nextUrl.origin);
  url.searchParams.set("checkout", "error");
  url.searchParams.set("motivo", motivo);
  return NextResponse.redirect(url, { status: 303 });
}
