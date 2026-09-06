import { openingHoursRows, type OpeningHours } from "@/lib/opening-hours";
import CenterMiniMap from "./center-mini-map-loader";

export type CenterNap = {
  name: string;
  address: string | null;
  phone: string | null;
  city: string | null;
  postalCode: string | null;
  neighborhood: string | null;
  description: string | null;
  lat: number | null;
  lng: number | null;
  hours: OpeningHours | null;
};

/**
 * E9-05 · Dónde está el centro, cuándo abre y qué hace.
 *
 * Es lo que casa la página con una intención local ("gimnasio en Delicias") y
 * lo que Google cruza con la ficha de Google Business Profile. El NAP tiene que
 * coincidir carácter a carácter con esa ficha: se recuerda en la pantalla de
 * puesta en marcha, donde se edita.
 *
 * El mapa se monta solo cuando entra en pantalla (`center-mini-map-loader`): es
 * la parte de abajo de una página de conversión y no puede costar Leaflet antes
 * de que el visitante haya podido pulsar nada.
 */
export function CenterNapBlock({ center }: { center: CenterNap }) {
  const hours = openingHoursRows(center.hours);
  const locality = [center.postalCode, center.city].filter(Boolean).join(" ");
  const located = center.lat !== null && center.lng !== null;

  if (!center.address && !center.phone && !center.description && hours.length === 0 && !located) return null;

  return (
    <section className="mt-8 pt-6 border-t border-brand-border" aria-labelledby="donde-estamos">
      <h2 id="donde-estamos" className="font-display font-bold text-sm uppercase tracking-[.03em] text-brand-text">
        Dónde estamos
      </h2>

      {center.description && (
        <p className="text-sm text-brand-text-2 mt-3 leading-relaxed">{center.description}</p>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="space-y-2.5">
          {center.address && (
            <address className="not-italic text-[13px] text-brand-text-2 leading-relaxed">
              <span className="block font-semibold text-brand-text">{center.name}</span>
              <span className="block">{center.address}</span>
              {locality && <span className="block">{locality}</span>}
              {center.neighborhood && <span className="block text-brand-muted">Barrio de {center.neighborhood}</span>}
            </address>
          )}
          {center.phone && (
            <p className="text-[13px]">
              <a href={`tel:${center.phone.replace(/\s+/g, "")}`} className="font-semibold text-brand-text underline">
                {center.phone}
              </a>
            </p>
          )}

          {hours.length > 0 && (
            <table className="text-[12.5px] text-brand-text-2 mt-1">
              <caption className="sr-only">Horario de apertura de {center.name}</caption>
              <tbody>
                {hours.map((row) => (
                  <tr key={row.day}>
                    <th scope="row" className="text-left font-medium pr-4 py-0.5 text-brand-muted">
                      {row.label}
                    </th>
                    <td className="py-0.5 tz-nums">{row.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {located && (
          <div className="rounded-control border border-brand-border overflow-hidden h-[220px] relative bg-tz-sand">
            <CenterMiniMap lat={center.lat as number} lng={center.lng as number} label={center.name} />
          </div>
        )}
      </div>
    </section>
  );
}
