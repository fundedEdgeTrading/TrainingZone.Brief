import { Field, Input, Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ActionForm } from "@/components/ui/action-form";
import { asOpeningHours, formatOpeningHours } from "@/lib/opening-hours";
import { leadFormPath, membershipPath } from "@/lib/public-center-seo";
import { updateCenterPublicProfile } from "./actions";
import { CopyLink } from "@/components/copy-link";

/** Lo que la tarjeta necesita del centro. Se queda en lo publicable, sin `_count` ni relaciones. */
export type CenterPublicData = {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  phone: string | null;
  city: string | null;
  postalCode: string | null;
  neighborhood: string | null;
  description: string | null;
  openingHours: unknown;
  publicPage: boolean;
  lat: number | null;
  lng: number | null;
};

/**
 * E9-05 + E9-15 · Ficha pública del centro, dentro de su tarjeta en
 * Organización → Centros.
 *
 * Dos cosas que no existían en ninguna pantalla:
 *
 *  · El NAP editable. Los campos estaban en el esquema desde la migración y no
 *    había forma de escribirlos.
 *  · **Las URLs públicas.** `grep -rn "hazte-socio\|lead-form"` fuera de sus
 *    carpetas solo devolvía el allowlist del proxy: la puesta en marcha tiene
 *    siete pasos y ninguno enseñaba la URL. El embudo comercial entero solo era
 *    alcanzable si el gimnasio construía la dirección a mano.
 */
export function CenterPublicCard({ center, orgSlug }: { center: CenterPublicData; orgSlug: string }) {
  const membership = membershipPath(orgSlug, center.slug);
  const leadForm = leadFormPath(orgSlug, center.slug);

  return (
    <details className="mt-3 group">
      <summary className="flex items-center justify-between gap-2 cursor-pointer list-none marker:hidden [&::-webkit-details-marker]:hidden text-[12px] font-semibold text-brand-text-2">
        <span>Página pública y enlaces</span>
        <span className="flex items-center gap-2 shrink-0">
          <span
            className={`inline-flex items-center rounded-pill px-2 py-0.5 text-[10px] font-bold uppercase tracking-[.06em] ${
              center.publicPage ? "bg-good-bg text-good" : "bg-tz-sand text-brand-muted"
            }`}
          >
            {center.publicPage ? "Publicada" : "Sin publicar"}
          </span>
          <span aria-hidden="true" className="text-faint transition-transform duration-200 group-open:rotate-45">
            +
          </span>
        </span>
      </summary>

      <div className="mt-3 space-y-3">
        <div className="rounded-control border border-brand-border bg-tz-bone p-3 space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-[.08em] text-brand-muted">Tus enlaces públicos</p>
          <CopyLink label="Alta de socios" path={membership} />
          <CopyLink label="Formulario de leads (para embeber)" path={leadForm} />
          <p className="text-[11px] text-brand-muted leading-relaxed">
            {center.publicPage
              ? "La página de alta está publicada: aparece en el sitemap y puede indexarse. Desmarca «Publicar» para retirarla."
              : "La página funciona con el enlace directo, pero NO se publica en el sitemap ni se indexa hasta que marques «Publicar»."}
          </p>
          <p className="text-[11px] text-brand-muted leading-relaxed">
            <b className="text-brand-text-2">Reclama tu ficha de Google Business Profile</b> y copia ahí exactamente el
            mismo nombre, dirección y teléfono que pongas aquí: Google casa las dos por coincidencia carácter a carácter,
            y una coma de diferencia le basta para tratarlas como dos negocios distintos.
          </p>
        </div>

        <ActionForm
          action={updateCenterPublicProfile}
          successMessage="Ficha pública actualizada."
          resetOnSuccess={false}
          className="space-y-3"
        >
          <input type="hidden" name="centerId" value={center.id} />

          <Field label="Dirección">
            <Input name="address" defaultValue={center.address ?? ""} placeholder="Av. de Cataluña 42" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Ciudad">
              <Input name="city" defaultValue={center.city ?? ""} placeholder="Zaragoza" />
            </Field>
            <Field label="Código postal">
              <Input name="postalCode" defaultValue={center.postalCode ?? ""} placeholder="50014" inputMode="numeric" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Barrio">
              <Input name="neighborhood" defaultValue={center.neighborhood ?? ""} placeholder="La Jota" />
            </Field>
            <Field label="Teléfono">
              <Input name="phone" defaultValue={center.phone ?? ""} placeholder="976 000 000" inputMode="tel" />
            </Field>
          </div>

          <Field
            label="Descripción"
            hint="El párrafo propio del centro. Es lo que evita que tu página sea una copia de las demás."
          >
            <Textarea
              name="description"
              rows={3}
              defaultValue={center.description ?? ""}
              placeholder="Qué se entrena aquí, para quién y qué lo diferencia."
            />
          </Field>

          <Field label="Horario" hint="Una línea por día: «Lunes: 07:00-14:00, 16:00-22:00». «Domingo: cerrado» también vale.">
            <Textarea
              name="openingHours"
              rows={4}
              defaultValue={formatOpeningHours(asOpeningHours(center.openingHours))}
              placeholder={"Lunes: 07:00-22:00\nSábado: 09:00-14:00\nDomingo: cerrado"}
            />
          </Field>

          {/* E11-03 · Hasta aquí las coordenadas solo se tecleaban en el alta y
              no había pantalla para corregirlas: un signo mal puesto dejaba el
              centro en otro continente, en el mapa y para siempre. */}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Latitud" hint="Para el mapa">
              <Input name="lat" defaultValue={center.lat ?? ""} placeholder="41.6685" inputMode="decimal" />
            </Field>
            <Field label="Longitud" hint="Para el mapa">
              <Input name="lng" defaultValue={center.lng ?? ""} placeholder="-0.8815" inputMode="decimal" />
            </Field>
          </div>

          <label className="flex items-start gap-2.5 rounded-control border border-brand-border p-3 cursor-pointer">
            <input
              type="checkbox"
              name="publicPage"
              defaultChecked={center.publicPage}
              className="mt-0.5 h-4 w-4 shrink-0 accent-tz-black"
            />
            <span className="text-[12px] text-brand-text-2 leading-relaxed">
              <b className="text-brand-text">Publicar la página de este centro</b>
              <br />
              Entra en el sitemap y puede aparecer en Google. Hacen falta al menos la dirección y la descripción.
            </span>
          </label>

          <Button type="submit" variant="secondary" size="sm">
            Guardar ficha pública
          </Button>
        </ActionForm>
      </div>
    </details>
  );
}
