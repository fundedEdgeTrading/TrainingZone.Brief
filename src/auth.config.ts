import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import Google from "next-auth/providers/google";
import { authenticate, membershipIn, type Membership } from "@/lib/identity";
import { clientIpFrom, throttledAccessAttempt } from "@/lib/login-throttle";
import type { Role } from "@prisma/client";

/**
 * Estrategia de autenticación de esta entrega:
 *
 * - Email y contraseña (Credentials): activo. Es el login real de cada
 *   identidad; en local y en la demo lo usan también los usuarios sembrados
 *   por el seed (uno por rol). El `id` técnico sigue siendo "demo" porque
 *   forma parte de la URL de callback y del `signIn` del formulario; el
 *   rótulo visible ya no lo dice (PROD-07).
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
    name: "Email y contraseña",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Contraseña", type: "password" },
      // RB-ID-002: con varias membresías el cliente indica en cuál entrar. Se
      // valida contra las membresías reales de la identidad: nunca se confía
      // del valor recibido.
      orgId: { label: "Organización", type: "text" },
    },
    // E1-10: `request` se usa para la IP del cliente. El formulario pasa antes
    // por `resolveLoginTargets`, pero esta es la ruta que Auth.js expone
    // (`/api/auth/callback/credentials`) y se puede llamar directamente: si el
    // freno viviera solo en la server action, bastaría con saltársela.
    async authorize(credentials, request) {
      const email = credentials?.email as string | undefined;
      const password = credentials?.password as string | undefined;
      const orgId = (credentials?.orgId as string | undefined) || undefined;
      if (!email || !password) return null;

      type Authorized = { identityId: string; membership: Membership | null };

      const outcome = await throttledAccessAttempt<Authorized>(
        { purpose: "LOGIN", email, ip: clientIpFrom(new Headers(request?.headers)) },
        async () => {
          const result = await authenticate(email, password);
          if (!result.ok) return { granted: false };

          // Sin elección explícita solo se resuelve el caso inequívoco: una sola
          // membresía. Con varias no se adivina — el login pide elegir.
          //
          // Las credenciales SÍ eran buenas, así que el intento se concede y el
          // contador se limpia: quien acierta la contraseña no está probando
          // contraseñas, por mucho que le falte decir en qué organización entra.
          const chosen = orgId
            ? result.memberships.find((m) => m.orgId === orgId)
            : result.memberships.length === 1
              ? result.memberships[0]
              : null;
          return { granted: true, value: { identityId: result.identityId, membership: chosen ?? null } };
        }
      );

      // Credenciales malas y intento bloqueado devuelven lo mismo, que es lo que
      // Auth.js traduce a un error de login indistinguible.
      if (!outcome.ok) return null;
      const { identityId, membership: chosen } = outcome.value;
      if (!chosen) return null;

      return {
        id: chosen.userId,
        name: chosen.name,
        email,
        image: chosen.image,
        role: chosen.role,
        orgId: chosen.orgId,
        centerId: chosen.centerId,
        identityId,
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
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.role = (user as { role: Role }).role;
        token.orgId = (user as { orgId: string }).orgId;
        token.centerId = (user as { centerId: string | null }).centerId;
        token.identityId = (user as { identityId: string }).identityId;
      }

      // RB-ID-004: cambio de organización. La membresía se verifica en servidor
      // contra la identidad del token antes de reescribirlo — el cliente solo
      // propone un orgId, no lo impone.
      const requestedOrgId = (session as { orgId?: unknown } | null)?.orgId;
      if (trigger === "update" && typeof requestedOrgId === "string" && token.identityId) {
        const membership = await membershipIn(token.identityId, requestedOrgId);
        if (membership) {
          token.sub = membership.userId;
          token.orgId = membership.orgId;
          token.role = membership.role;
          token.centerId = membership.centerId;
          token.name = membership.name;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string;
        session.user.role = token.role as Role;
        session.user.orgId = token.orgId as string;
        session.user.centerId = token.centerId as string | null;
        session.user.identityId = token.identityId as string;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;

export const microsoftEntraIdEnabled = hasMicrosoftEntraConfig;
export const googleEnabled = hasGoogleConfig;
