"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { requestAccountDeletionAction } from "../actions";

/**
 * E5-15 · Confirmación con contraseña.
 *
 * No es un `ActionForm` como el resto del perfil a propósito: los demás
 * formularios de esta pantalla guardan un ajuste reversible, y este arranca un
 * plazo legal. Necesita una casilla explícita —"he leído qué se conserva"— y
 * necesita refrescar la página al terminar, porque lo que sustituye al
 * formulario es el estado de la solicitud.
 */
export function DeletionRequestForm({ canUsePassword }: { canUsePassword: boolean }) {
  const [password, setPassword] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [pending, setPending] = useState(false);
  const toast = useToast();
  const router = useRouter();

  if (!canUsePassword) {
    return (
      <div className="rounded-control border border-brand-border bg-tz-bone p-4">
        <p className="text-[13px] text-brand-text-2 leading-relaxed">
          Tu cuenta no tiene contraseña propia todavía, así que no podemos confirmar que eres tú por esta vía. Fija una
          desde{" "}
          <Link href="/recuperar-clave" className="underline font-semibold">
            ¿Has olvidado tu contraseña?
          </Link>{" "}
          y vuelve aquí. También puedes pedirlo directamente en tu centro.
        </p>
      </div>
    );
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    try {
      const result = await requestAccountDeletionAction(password);
      if (result.ok) {
        toast.success("Solicitud registrada. Te hemos enviado el acuse por correo.");
        setPassword("");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={understood}
          onChange={(e) => setUnderstood(e.target.checked)}
          className="mt-1 size-4 accent-brand-ink"
        />
        <span className="text-[13px] text-brand-text-2 leading-relaxed">
          He leído qué se borra y qué se conserva, y entiendo que los cobros que ya se me emitieron no se borran: se
          conservan sin mi nombre, porque el centro está obligado a conservarlos.
        </span>
      </label>

      <Field label="Tu contraseña" hint="Para confirmar que eres tú quien lo pide.">
        <Input
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </Field>

      <button
        type="submit"
        disabled={!understood || password.length === 0 || pending}
        className="self-start bg-critical text-white rounded-[11px] px-6 py-3 font-display font-extrabold text-sm uppercase tracking-[.03em] transition-transform duration-150 hover:-translate-y-0.5 active:scale-[.98] disabled:opacity-40 disabled:hover:translate-y-0 disabled:cursor-not-allowed"
      >
        {pending ? "Enviando…" : "Pedir el borrado de mi cuenta"}
      </button>
    </form>
  );
}
