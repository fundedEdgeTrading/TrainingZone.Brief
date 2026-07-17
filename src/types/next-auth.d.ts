import type { Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      orgId: string;
      centerId: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
    orgId: string;
    centerId: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: Role;
    orgId: string;
    centerId: string | null;
  }
}
