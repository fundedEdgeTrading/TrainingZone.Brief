import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";

/**
 * Estrategia de autenticación de esta entrega:
 *
 * - Login "demo" (Credentials): activo, con los usuarios sembrados por el
 *   seed (uno por rol). Es lo que se usa para navegar la plataforma ahora.
 * - Microsoft Entra ID (Azure AD): el proveedor está declarado y listo para
 *   producción, pero solo se registra si existen las variables de entorno
 *   AUTH_MICROSOFT_ENTRA_ID_ID/SECRET/ISSUER — que requieren un App
 *   Registration real en un tenant de Azure que esta sesión no puede crear.
 *   Cuando el cliente tenga su tenant, basta con rellenar esas variables:
 *   no hace falta tocar código.
 * - Google: igual que Microsoft, declarado y listo pero desactivado hasta que
 *   existan AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET (credenciales OAuth de Google
 *   Cloud). Con esas dos vacías, el botón de Google no se muestra.
 */

const providers: NextAuthConfig["providers"] = [
  Credentials({
    id: "demo",
    name: "Usuario demo",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Contraseña", type: "password" },
    },
    async authorize(credentials) {
      const email = credentials?.email as string | undefined;
      const password = credentials?.password as string | undefined;
      if (!email || !password) return null;

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) return null;

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) return null;

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        role: user.role,
        orgId: user.orgId,
        centerId: user.centerId,
      };
    },
  }),
];

const hasMicrosoftEntraConfig =
  !!process.env.AUTH_MICROSOFT_ENTRA_ID_ID &&
  !!process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET &&
  !!process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER;

if (hasMicrosoftEntraConfig) {
  providers.push(
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
    })
  );
}

const hasGoogleConfig =
  !!process.env.AUTH_GOOGLE_ID && !!process.env.AUTH_GOOGLE_SECRET;

if (hasGoogleConfig) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    })
  );
}

export const authConfig = {
  providers,
  // Necesario fuera de Vercel (self-hosted / detrás de un proxy inverso):
  // Auth.js valida el header Host contra AUTH_URL en producción por defecto
  // y lo rechaza si no se marca explícitamente como confiable.
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as { role: Role }).role;
        token.orgId = (user as { orgId: string }).orgId;
        token.centerId = (user as { centerId: string | null }).centerId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string;
        session.user.role = token.role as Role;
        session.user.orgId = token.orgId as string;
        session.user.centerId = token.centerId as string | null;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;

export const microsoftEntraIdEnabled = hasMicrosoftEntraConfig;
export const googleEnabled = hasGoogleConfig;
