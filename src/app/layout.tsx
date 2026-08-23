import type { Metadata } from "next";
import { headers } from "next/headers";
import { Poppins } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "next-auth/react";
import { auth } from "@/auth";
import { isThemedPath, themeAttribute, themeForUser } from "@/lib/theme";
import { ToastProvider } from "@/components/ui/toast";
import { CelebrateProvider } from "@/components/ui/celebrate";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TRAINING ZONE",
  description: "Plataforma de gestión para centros de entrenamiento",
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
        </SessionProvider>
      </body>
    </html>
  );
}
