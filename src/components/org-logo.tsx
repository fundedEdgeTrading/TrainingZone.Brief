import Image from "next/image";

import AptaLogo from "@/components/apta-logo";
import { LOGO_BOX, classifyLogo } from "@/lib/logo-image";

/**
 * E9-12 · El logo de la organización en una página pública.
 *
 * Siempre con la caja declarada, venga de donde venga: eso es lo que quita el
 * salto de maquetación justo encima del `<h1>`. Y con `next/image` cuando el
 * origen está autorizado, para que un PNG de 3 MB subido por el gimnasio no
 * hunda el LCP de su propia página.
 *
 * Sin logo se cae al de Apta, que es un componente y no una imagen: cero bytes
 * y cero riesgo de salto.
 */
export function OrgLogo({ url, alt, className }: { url: string | null; alt: string; className?: string }) {
  const box = `h-9 w-auto object-contain ${className ?? ""}`.trim();

  if (!url) return <AptaLogo variant="dark" className={`text-2xl ${className ?? ""}`.trim()} />;

  const kind = classifyLogo(url);

  if (kind === "foreign") {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- host no declarado en images.remotePatterns: se sirve sin optimizar, pero con la caja puesta
      <img
        src={url}
        alt={alt}
        width={LOGO_BOX.width}
        height={LOGO_BOX.height}
        className={box}
        loading="eager"
        decoding="async"
      />
    );
  }

  return (
    <Image
      src={url}
      alt={alt}
      width={LOGO_BOX.width}
      height={LOGO_BOX.height}
      className={box}
      // Está por encima del pliegue, encima del h1: no se difiere.
      priority
      unoptimized={false}
    />
  );
}
