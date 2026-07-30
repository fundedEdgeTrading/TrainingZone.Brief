import type { Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string; // id de la MEMBRESÍA activa (User.id), no de la identidad
      identityId: string; // credencial: estable al conmutar de organización
      role: Role;
      orgId: string;
      centerId: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    identityId: string;
    role: Role;
    orgId: string;
    centerId: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    identityId: string;
    role: Role;
    orgId: string;
    centerId: string | null;
  }
}
