import type { Metadata } from "next";
import { headers } from "next/headers";
import { Poppins } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "next-auth/react";
import { auth } from "@/auth";
import { isThemedPath, themeAttribute, themeForUser } from "@/lib/theme";
import { ToastProvider } from "@/components/ui/toast";
import { CelebrateProvider } from "@/components/ui/celebrate";
import { BRAND, publicOrigin } from "@/lib/site";
import { analyticsConfig, googleSiteVerification } from "@/lib/analytics";
import { Analytics } from "@/components/analytics";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

/**
 * E9-03 · La marca y el origen salen de `@/lib/site`, no de literales aquí.
 *
 * `metadataBase` es lo que resuelve las rutas relativas de OpenGraph: sin él,
 * una `openGraph.images` relativa se emite mal y el enlace compartido sale como
 * texto plano — y en venta B2B a dueños de gimnasio la recomendación ocurre por
 * mensajería.
 *
 * La imagen por defecto la genera `opengraph-image.tsx`; Next la enlaza sola y
 * hereda a todas las rutas que no declaren la suya.
 */
export const metadata: Metadata = {
  metadataBase: new URL(publicOrigin()),
  title: {
    default: BRAND.title,
    template: BRAND.titleTemplate,
  },
  description: BRAND.description,
  applicationName: BRAND.name,
  openGraph: {
    type: "website",
    siteName: BRAND.name,
    locale: BRAND.locale,
    title: BRAND.title,
    description: BRAND.description,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: BRAND.title,
    description: BRAND.description,
  },
  // E9-09 · Search Console. La verificación buena es la de DNS —cubre el
  // dominio entero y no se pierde al redesplegar—; esta meta es la segunda vía,
  // la que sobrevive a un cambio de proveedor de DNS.
  verification: { google: googleSiteVerification() },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [session, headerList] = await Promise.all([auth(), headers()]);

  // El tema se resuelve aquí, en el primer HTML del servidor: si se aplicara
  // desde el cliente habría un fotograma en claro antes de repintar. Las
  // pantallas públicas no lo llevan (no hay sesión de la que leerlo) y por eso
  // hace falta saber la ruta, que el proxy deja en `x-pathname`.
  const themed = session?.user?.id && isThemedPath(headerList.get("x-pathname"));
  const theme = themed ? await themeForUser(session.user.id) : "LIGHT";

  return (
    <html
      lang="es"
      data-theme={themeAttribute(theme)}
      className={`h-full antialiased ${poppins.variable}`}
    >
      <body className="min-h-full flex flex-col bg-brand-bg text-brand-text">
        <SessionProvider session={session}>
          <ToastProvider>
            <CelebrateProvider>{children}</CelebrateProvider>
          </ToastProvider>
          {/* E9-09 · Analítica sin cookies (no arrastra banner) y los tres
              eventos de conversión, escuchados en un solo sitio. */}
          <Analytics config={analyticsConfig()} />
        </SessionProvider>
      </body>
    </html>
  );
}
