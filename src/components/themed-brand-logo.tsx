import type { BrandLogo } from "@/lib/brand-logo";

/**
 * Logo de marca que respeta el tema (`resolveBrandLogo`).
 *
 * Se pintan las dos versiones y manda el CSS (`.tz-logo-light` / `.tz-logo-dark`
 * en globals.css): resolverlo en el servidor obligaría a leer `User.theme` en
 * cada layout, y hacerlo en el cliente dejaría un fotograma con el logo
 * equivocado. Sin versión oscura, en oscuro va el mismo logo sobre una pastilla
 * clara (`.tz-logo-plate`).
 */
export function ThemedBrandLogo({ logo, alt, className }: { logo: BrandLogo; alt: string; className?: string }) {
  /* eslint-disable @next/next/no-img-element -- logo por organización/centro (`/api/files/<id>` o URL propia), no un asset estático */
  if (!logo.darkOnPlate && logo.dark === logo.light) {
    return <img src={logo.light} alt={alt} className={`block ${className ?? ""}`} />;
  }
  return (
    <>
      <img src={logo.light} alt={alt} className={`tz-logo-light block ${className ?? ""}`} />
      {logo.darkOnPlate ? (
        <span className="tz-logo-dark tz-logo-plate" aria-hidden="true">
          <img src={logo.dark} alt="" className={`block ${className ?? ""}`} />
        </span>
      ) : (
        <img src={logo.dark} alt="" aria-hidden="true" className={`tz-logo-dark block ${className ?? ""}`} />
      )}
    </>
  );
  /* eslint-enable @next/next/no-img-element */
}
