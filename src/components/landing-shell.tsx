import Link from "next/link";
import AptaLogo from "@/components/apta-logo";

/**
 * E9-11 · Armazón común de las páginas de captación.
 *
 * Cabecera, migas y pie idénticos a los de `/planes`, para que una página nueva
 * no cueste maquetar nada y —más importante— para que todas queden **enlazadas
 * entre sí**. El problema de `/hazte-socio` era precisamente ese: existía y no
 * se llegaba a ella desde ningún sitio.
 *
 * Todo lo que hay aquí es HTML de servidor: estas páginas son estáticas y no
 * cargan un solo kilobyte de JavaScript propio.
 */
export function LandingShell({
  breadcrumb,
  children,
}: {
  breadcrumb: { href: string; label: string }[];
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-tz-bone">
      <header className="flex items-center justify-between px-6 py-5 sm:px-10">
        <Link href="/planes" aria-label="Apta">
          <AptaLogo variant="dark" className="text-3xl" />
        </Link>
        <Link href="/login" className="text-[13px] font-bold text-tz-black underline">
          Iniciar sesión
        </Link>
      </header>

      <main className="px-4 pb-16 sm:px-8">
        <div className="max-w-3xl mx-auto">
          <nav aria-label="Migas de pan" className="text-[12px] text-muted mb-6">
            <ol className="flex flex-wrap items-center gap-1.5">
              {breadcrumb.map((crumb, i) => (
                <li key={crumb.href} className="flex items-center gap-1.5">
                  {i > 0 && <span aria-hidden="true">/</span>}
                  {i === breadcrumb.length - 1 ? (
                    <span aria-current="page" className="text-brand-text-2">
                      {crumb.label}
                    </span>
                  ) : (
                    <Link href={crumb.href} className="underline">
                      {crumb.label}
                    </Link>
                  )}
                </li>
              ))}
            </ol>
          </nav>

          {children}
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}

/**
 * Pie con los enlaces a todas las páginas de captación y al índice de centros.
 *
 * Es lo que resuelve la orfandad: sin un enlace interno, una página en el
 * sitemap es una página que Google visita una vez y considera secundaria para
 * siempre.
 */
export function LandingFooter() {
  return (
    <footer className="border-t border-tz-linen px-6 py-8 sm:px-10">
      <div className="max-w-5xl mx-auto flex flex-wrap gap-x-6 gap-y-2 text-[12.5px] text-muted">
        <Link href="/planes" className="underline">
          Planes y precios
        </Link>
        <Link href="/funcionalidades" className="underline">
          Funcionalidades
        </Link>
        <Link href="/centros" className="underline">
          Centros
        </Link>
        <Link href="/app" className="underline">
          La app
        </Link>
        <Link href="/privacidad" className="underline">
          Privacidad
        </Link>
      </div>
    </footer>
  );
}

/** Título + entradilla, con el mismo tamaño y el mismo ritmo en todas. */
export function LandingHero({ h1, intro }: { h1: string; intro: string }) {
  return (
    <>
      <h1 className="font-display font-extrabold text-3xl sm:text-4xl uppercase leading-[1.08] tracking-[-.01em] text-tz-black">
        {h1}
      </h1>
      <p className="text-[15px] text-brand-text-2 mt-4 leading-relaxed">{intro}</p>
    </>
  );
}

/** Cierre común: el mismo botón, para que ninguna página sea un callejón sin salida. */
export function LandingCta({ label = "Ver planes y precios" }: { label?: string }) {
  return (
    <div className="mt-10 rounded-card border border-tz-linen bg-white p-6 text-center">
      <p className="text-sm text-brand-text-2 mb-4">
        Todo el núcleo de gestión está en cualquier plan. Los superiores añaden la capa que convierte tus datos en
        decisiones.
      </p>
      <Link
        href="/planes#planes"
        className="inline-flex items-center rounded-control bg-tz-black text-tz-bone font-semibold text-[15px] px-7 py-3.5 no-underline transition-colors duration-200 hover:bg-brand-ink-soft"
      >
        {label}
      </Link>
    </div>
  );
}
