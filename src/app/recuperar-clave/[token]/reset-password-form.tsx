"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field, Input } from "@/components/ui/field";
import { Button, ButtonSpinner } from "@/components/ui/button";
import { completePasswordReset } from "../actions";

export default function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-brand-muted bg-tz-sand border border-brand-border rounded-control p-4">
          Contraseña actualizada. Ya puedes iniciar sesión.
        </p>
        <Button size="lg" className="w-full" onClick={() => router.push("/login")}>
          Iniciar sesión
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (password !== repeat) {
          setError("Las dos contraseñas no coinciden.");
          return;
        }
        setLoading(true);
        setError(null);
        const result = await completePasswordReset(token, password);
        setLoading(false);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setDone(true);
      }}
      className="space-y-3"
    >
      <Field label="Nueva contraseña">
        <Input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mínimo 8 caracteres"
        />
      </Field>
      <Field label="Repite la contraseña">
        <Input
          type="password"
          required
          minLength={8}
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
          placeholder="••••••••"
        />
      </Field>
      {error && <p className="text-sm text-critical bg-critical-bg rounded-control px-3 py-2">{error}</p>}
      <Button type="submit" size="lg" disabled={loading} className="w-full">
        {loading && <ButtonSpinner />}
        {loading ? "Guardando..." : "Guardar contraseña"}
      </Button>
    </form>
  );
}
