import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { PlanType } from "@prisma/client";
import { OrgLogo } from "@/components/org-logo";
import { Field, Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { getCachedPublicMembershipContext } from "@/lib/public-membership-queries";
import { GENERIC_CENTER_METADATA, centerMembershipMetadata } from "@/lib/public-center-seo";
import { isRecurring } from "@/lib/member-billing";
import { planServiceKind } from "@/lib/members-queries";
import { asOpeningHours } from "@/lib/opening-hours";
import { CONVERSIONS, CONVERSION_ATTRIBUTE } from "@/lib/analytics";
import { JsonLd } from "@/components/json-ld";
import { centerJsonLd } from "@/lib/json-ld";
import { absoluteUrl } from "@/lib/site";
import { membershipPath } from "@/lib/public-center-seo";
import MemberBillingLinkForm from "./member-billing-link-form";
import { CenterNapBlock } from "./center-nap";
import { CheckoutNotice } from "./checkout-notice";
import { SERVICE_LABEL } from "@/lib/service-labels";

/**
 * E9-14 · La ficha se sirve con sus consultas cacheadas durante diez minutos.
 *
 * Antes eran dos consultas secuenciales más el catálogo más la comprobación de
 * Stripe **en cada visita**, para una página que cambia cuando el gimnasio edita
 * su ficha, es decir casi nunca. La caché vive en la capa de datos
 * (`getCachedPublicMembershipContext`, con `unstable_cache` y etiqueta por
 * centro), no en la ruta, y la invalidación no espera a los diez minutos:
 * editar el centro o su catálogo llama a `updateTag` (ver
 * `organization/actions.ts`).
 *
 * Aquí NO se declara `revalidate`, y es deliberado: el layout raíz lee `auth()`
 * y `headers()`, así que pedir renderizado incremental hace que Next intente
 * prerrenderizar y la petición muera con `DYNAMIC_SERVER_USAGE` —un 500 en la
 * página de alta, no una página lenta—. Cachear la consulta da la mejora que
 * buscaba la historia sin pelearse con el layout.
 *
 * `/planes` tampoco entra: conserva su `force-dynamic`, justificado porque sus
 * precios se resuelven del entorno en cada petición.
 */

/**
 * E9-04 · Título, descripción, OpenGraph y canónica PROPIOS de este centro.
 *
 * El `metadata` estático anterior daba a cien centros cien URLs con el mismo
 * título y el mismo cuerpo salvo el `<h1>`: Google las agrupa y elige una sola
 * canónica; las demás desaparecen.
 *
 * El contexto va cacheado por petición (`cache()` en la query), así que esto no
 * duplica ninguna consulta con las del render.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgSlug: string; centerSlug: string }>;
}): Promise<Metadata> {
  const { orgSlug, centerSlug } = await params;
  const ctx = await getCachedPublicMembershipContext(orgSlug, centerSlug);
  // Centro sin datos: se degrada al título genérico en vez de romper. La página
  // devolverá su 404 por su cuenta.
  if (!ctx) return GENERIC_CENTER_METADATA;

  return centerMembershipMetadata({
    orgName: ctx.organization.name,
    orgSlug,
    centerName: ctx.center.name,
    centerSlug,
    city: ctx.center.city,
    neighborhood: ctx.center.neighborhood,
    description: ctx.center.description,
    publicPage: ctx.center.publicPage,
  });
}

function euros(cents: number) {
  return (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

function planPeriodLabel(plan: { type: PlanType; sessionsIncluded: number | null }) {
  if (isRecurring(plan.type)) return "Cuota mensual";
  return plan.sessionsIncluded ? `Bono de ${plan.sessionsIncluded} sesiones` : "Bono";
}

export default async function PublicMembershipPage({
  params,
}: {
  params: Promise<{ orgSlug: string; centerSlug: string }>;
}) {
  const { orgSlug, centerSlug } = await params;
  const ctx = await getCachedPublicMembershipContext(orgSlug, centerSlug);
  if (!ctx) notFound();

  const checkoutAction = `/api/hazte-socio/${orgSlug}/${centerSlug}/checkout`;

  return (
    <div className="min-h-dvh bg-tz-bone flex items-center justify-center p-4 sm:p-8">
      {/* E9-07 · `SportsActivityLocation`, y SOLO si el centro tiene dirección y
          coordenadas: un marcado incompleto no gana ningún resultado
          enriquecido y sí puede costar una advertencia por datos estructurados
          inválidos. `centerJsonLd` devuelve null y aquí no se pinta nada. */}
      <JsonLd
        node={centerJsonLd({
          name: ctx.center.name,
          url: absoluteUrl(membershipPath(orgSlug, centerSlug)),
          description: ctx.center.description,
          address: ctx.center.address,
          city: ctx.center.city,
          postalCode: ctx.center.postalCode,
          phone: ctx.center.phone,
          lat: ctx.center.lat,
          lng: ctx.center.lng,
          openingHours: asOpeningHours(ctx.center.openingHours),
          offers: ctx.plans.map((plan) => ({ name: plan.name, priceCents: plan.priceCents })),
        })}
      />
      <div className="w-full max-w-2xl bg-white border border-brand-border rounded-card shadow-pop p-6 sm:p-9">
        <div className="flex flex-col items-center text-center mb-6">
          {/* E9-12 · Con la caja declarada siempre: el logo iba justo encima
              del h1 y sin dimensiones recolocaba la página entera al cargar. */}
          <OrgLogo url={ctx.organization.logoUrl} alt={ctx.organization.name} className="mb-3" />
          <h1 className="font-display font-extrabold text-2xl uppercase tracking-[-.01em] text-brand-text">
            Hazte socio de {ctx.center.name}
          </h1>
          <p className="text-sm text-brand-text-2 mt-1">Elige tu plan y paga online — tu acceso queda listo en minutos.</p>
        </div>

        {/* El aviso de checkout fallido se lee en el cliente: leer
            `searchParams` aquí obligaría a renderizar en cada visita y tiraría
            la caché por un caso que casi nunca ocurre. */}
        <Suspense fallback={null}>
          <CheckoutNotice />
        </Suspense>

        {!ctx.stripeReady ? (
          <div className="rounded-control border border-brand-border bg-tz-bone px-4 py-4 text-sm text-brand-text-2">
            Este centro aún no tiene el cobro online activado — contacta directamente con ellos para hacerte socio.
          </div>
        ) : ctx.plans.length === 0 ? (
          <div className="rounded-control border border-brand-border bg-tz-bone px-4 py-4 text-sm text-brand-text-2">
            Este centro no tiene planes disponibles ahora mismo.
          </div>
        ) : (
          <form
            method="POST"
            action={checkoutAction}
            className="space-y-6"
            {...{ [CONVERSION_ATTRIBUTE]: CONVERSIONS.centerCheckout }}
          >
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nombre">
                  <Input name="firstName" required placeholder="Tu nombre" />
                </Field>
                <Field label="Apellidos">
                  <Input name="lastName" required placeholder="Tus apellidos" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Email" hint="Aquí recibirás tu acceso al portal de socio">
                  <Input name="email" type="email" required placeholder="tu@email.com" />
                </Field>
                <Field label="Teléfono">
                  <Input name="phone" required placeholder="600 000 000" />
                </Field>
              </div>
            </div>

            <div className="space-y-3">
              {ctx.plans.map((plan) => {
                const kind = planServiceKind(plan.type);
                return (
                  <div
                    key={plan.id}
                    className="flex items-center justify-between gap-4 rounded-control border border-brand-border p-4"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-display font-bold text-sm text-brand-text truncate">{plan.name}</span>
                        {kind && (
                          <span className="inline-flex items-center rounded-pill bg-tz-bone px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.04em] text-brand-muted">
                            {SERVICE_LABEL[kind]}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-brand-muted mt-1">{planPeriodLabel(plan)}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-display font-extrabold text-lg text-brand-text">{euros(plan.priceCents)}</span>
                      <Button type="submit" name="planId" value={plan.id}>
                        Contratar
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </form>
        )}

        <div className="mt-8 pt-6 border-t border-brand-border">
          <h2 className="font-display font-bold text-sm uppercase tracking-[.03em] text-brand-text">
            ¿Ya eres socio?
          </h2>
          <p className="text-xs text-brand-muted mt-1 mb-3">
            Gestiona tu suscripción — cambia tu método de pago o cancela tu cuota sin contraseña.
          </p>
          <MemberBillingLinkForm orgSlug={orgSlug} centerSlug={centerSlug} />
        </div>

        {/* E9-05 · Dirección, teléfono, horario y mapa: sin esto la página no
            casa con ninguna intención local ("gimnasio en Delicias"), que es
            justamente la búsqueda que trae socios a un centro de barrio. */}
        <CenterNapBlock
          center={{
            name: ctx.center.name,
            address: ctx.center.address,
            phone: ctx.center.phone,
            city: ctx.center.city,
            postalCode: ctx.center.postalCode,
            neighborhood: ctx.center.neighborhood,
            description: ctx.center.description,
            lat: ctx.center.lat,
            lng: ctx.center.lng,
            hours: asOpeningHours(ctx.center.openingHours),
          }}
        />
      </div>
    </div>
  );
}
