import crypto from "crypto";
import bcrypt from "bcryptjs";
import { Prisma, type Identity, type Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Único módulo del sistema que maneja contraseñas (RB-ID-001..005). Nadie más
 * importa `bcrypt`: así el coste de hash, la política de longitud y el
 * tratamiento de credenciales inutilizables viven en un solo sitio.
 */
const BCRYPT_ROUNDS = 10;

export const MIN_PASSWORD_LENGTH = 8;

/**
 * Hash de descarte con el que comparar cuando el email no existe, para que el
 * login tarde lo mismo exista o no. Es un bcrypt válido de coste
 * `BCRYPT_ROUNDS` que ninguna contraseña real produce.
 */
const DUMMY_PASSWORD_HASH = "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

export type Membership = {
  userId: string;
  orgId: string;
  orgName: string;
  orgLogoUrl: string | null;
  role: Role;
  centerId: string | null;
  name: string;
  image: string | null;
};

type Tx = Prisma.TransactionClient;

const MEMBERSHIP_SELECT = {
  id: true,
  orgId: true,
  role: true,
  centerId: true,
  name: true,
  image: true,
  organization: { select: { name: true, logoUrl: true } },
} satisfies Prisma.UserSelect;

type MembershipRow = Prisma.UserGetPayload<{ select: typeof MEMBERSHIP_SELECT }>;

function toMembership(row: MembershipRow): Membership {
  return {
    userId: row.id,
    orgId: row.orgId,
    orgName: row.organization.name,
    orgLogoUrl: row.organization.logoUrl,
    role: row.role,
    centerId: row.centerId,
    name: row.name,
    image: row.image,
  };
}

export function hashPassword(plain: string) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

/**
 * Contraseña aleatoria e inutilizable: deja la credencial "creada pero
 * bloqueada" hasta que la persona canjea su invitación. Se usa al invitar a
 * alguien que todavía no tiene identidad en Apta.
 */
export function unusablePasswordHash() {
  return bcrypt.hash(crypto.randomBytes(24).toString("hex"), BCRYPT_ROUNDS);
}

/**
 * RB-ID-002/005: credenciales válidas → membresías de esa identidad. El fallo
 * es deliberadamente opaco (`{ ok: false }` sin motivo) para no convertir el
 * login en un oráculo que revele qué emails existen.
 */
export async function authenticate(
  email: string,
  password: string
): Promise<{ ok: true; identityId: string; memberships: Membership[] } | { ok: false }> {
  const identity = await prisma.identity.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true, passwordHash: true },
  });

  // Con un `return` seco cuando el email no existe, la respuesta llegaba sin
  // pagar el coste de bcrypt: la diferencia de tiempo (~100 ms) convertía el
  // login en el oráculo de emails que este módulo dice evitar. Comparar
  // siempre, contra un hash de descarte si hace falta, iguala ambos caminos.
  const valid = await bcrypt.compare(password, identity?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!identity || !valid) return { ok: false };

  const memberships = await membershipsFor(identity.id);
  if (memberships.length === 0) return { ok: false };

  return { ok: true, identityId: identity.id, memberships };
}

export async function membershipsFor(identityId: string): Promise<Membership[]> {
  const rows = await prisma.user.findMany({
    where: { identityId },
    select: MEMBERSHIP_SELECT,
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toMembership);
}

/** RB-ID-004: guarda del conmutador de organización — se verifica en servidor, nunca se confía del cliente. */
export async function membershipIn(identityId: string, orgId: string): Promise<Membership | null> {
  const row = await prisma.user.findFirst({
    where: { identityId, orgId },
    select: MEMBERSHIP_SELECT,
  });
  return row ? toMembership(row) : null;
}

/**
 * RB-ID-003: crea la identidad o devuelve la existente. Invitar a un email que
 * ya está en Apta no falla ni pide contraseña nueva: se le añade una membresía.
 * Usar siempre dentro de la transacción que crea el `User`.
 */
export async function ensureIdentity(
  tx: Tx,
  params: { email: string; passwordHash?: string }
): Promise<Identity> {
  const email = params.email.trim().toLowerCase();
  const existing = await tx.identity.findUnique({ where: { email } });
  if (existing) return existing;

  return tx.identity.create({
    data: { email, passwordHash: params.passwordHash ?? (await unusablePasswordHash()) },
  });
}

export async function setPassword(identityId: string, plain: string): Promise<void> {
  await prisma.identity.update({
    where: { id: identityId },
    data: { passwordHash: await hashPassword(plain), passwordSetAt: new Date() },
  });
}

/**
 * RB-ID-003: ¿hay que pedirle una contraseña a esta identidad al canjear una
 * invitación? No, si ya la fijó en su día (p. ej. es socia de otro gimnasio de
 * Apta): en ese caso el canje solo recoge lo que falte (consentimientos).
 */
export async function needsPassword(identityId: string): Promise<boolean> {
  const identity = await prisma.identity.findUnique({
    where: { id: identityId },
    select: { passwordSetAt: true },
  });
  return !identity?.passwordSetAt;
}
