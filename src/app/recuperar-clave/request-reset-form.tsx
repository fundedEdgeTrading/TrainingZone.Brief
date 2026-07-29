"use client";

import { useState } from "react";
import { Field, Input } from "@/components/ui/field";
import { Button, ButtonSpinner } from "@/components/ui/button";
import { requestPasswordReset } from "./actions";

export default function RequestResetForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (sent) {
    // RB-ID-005: mismo mensaje exista o no la cuenta.
    return (
      <p className="text-sm text-brand-muted bg-tz-sand border border-brand-border rounded-control p-4">
        Si hay una cuenta con ese email, te hemos enviado un enlace para restablecer la contraseña.
        Revisa tu bandeja de entrada (y la carpeta de spam).
      </p>
    );
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        const result = await requestPasswordReset(email);
        setLoading(false);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setSent(true);
      }}
      className="space-y-3"
    >
      <Field label="Email">
        <Input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@email.com"
        />
      </Field>
      {error && <p className="text-sm text-critical bg-critical-bg rounded-control px-3 py-2">{error}</p>}
      <Button type="submit" size="lg" disabled={loading} className="w-full">
        {loading && <ButtonSpinner />}
        {loading ? "Enviando..." : "Enviarme el enlace"}
      </Button>
    </form>
  );
}
