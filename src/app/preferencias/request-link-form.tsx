"use client";

import { useState } from "react";
import { Field, Input } from "@/components/ui/field";
import { Button, ButtonSpinner } from "@/components/ui/button";
import { requestEmailPreferencesLink } from "./actions";

/**
 * Pide por email el enlace de preferencias/baja. Lo usan tanto /preferencias
 * como /baja: el enlace que llega abre la misma pantalla, donde está también
 * el botón de baja total.
 */
export default function RequestLinkForm({ ctaLabel = "Enviarme el enlace" }: { ctaLabel?: string }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (sent) {
    // RB-ID-005: mismo mensaje exista o no la ficha con ese email.
    return (
      <p className="text-sm text-brand-text-2 bg-tz-sand border border-brand-border rounded-control p-4">
        Si ese email está en nuestra base, te hemos enviado un enlace para gestionar tus preferencias de correo.
        Revisa tu bandeja de entrada (y la carpeta de spam).
      </p>
    );
  }

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        const result = await requestEmailPreferencesLink(email);
        setLoading(false);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setSent(true);
      }}
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
        {loading ? "Enviando..." : ctaLabel}
      </Button>
    </form>
  );
}
