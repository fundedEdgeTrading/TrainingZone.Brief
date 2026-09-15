"use server";

import type { Sex } from "@prisma/client";
import { submitMemberForm, type GuardianDeclaration } from "@/lib/member-forms";

/**
 * Entrega del formulario público. No hay sesión que comprobar: la autorización
 * ES el token, y toda la validación —esquema del cuestionario, control de edad,
 * consentimientos— vive en `member-forms.ts`, que es lo que también prueban los
 * tests. Aquí solo se cruza la frontera cliente/servidor.
 */
export async function submitMemberFormAction(input: {
  token: string;
  answers: unknown;
  birthDate?: string | null;
  sex?: Sex | null;
  consents: { health?: boolean; images?: boolean; ai?: boolean; marketing?: boolean };
  guardian?: GuardianDeclaration | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  return submitMemberForm({
    token: input.token,
    answers: input.answers,
    birthDate: input.birthDate ?? null,
    sex: input.sex ?? null,
    consents: input.consents,
    guardian: input.guardian ?? null,
  });
}
