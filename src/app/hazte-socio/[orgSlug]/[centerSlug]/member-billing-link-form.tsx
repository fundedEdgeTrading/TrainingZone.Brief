"use client";

import { useState } from "react";
import { Field, Input } from "@/components/ui/field";
import { Button, ButtonSpinner } from "@/components/ui/button";
import { requestMemberBillingLink } from "./actions";

export default function MemberBillingLinkForm({ orgSlug, centerSlug }: { orgSlug: string; centerSlug: string }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (sent) {
    // RB-ID-005: mismo mensaje exista o no la cuenta.
    return (
      <p className="text-sm text-brand-muted bg-tz-bone border border-brand-border rounded-control p-4">
        Si hay una cuenta con ese email, te hemos enviado un enlace para gestionar tu suscripción. Revisa tu bandeja
        de entrada (y la carpeta de spam).
      </p>
    );
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        const formData = new FormData();
        formData.set("email", email);
        const result = await requestMemberBillingLink(orgSlug, centerSlug, formData);
        setLoading(false);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setSent(true);
      }}
      className="flex flex-col sm:flex-row items-start sm:items-end gap-3"
    >
      <Field label="Email" className="flex-1 w-full">
        <Input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@email.com"
        />
      </Field>
      <Button type="submit" variant="secondary" disabled={loading} className="w-full sm:w-auto">
        {loading && <ButtonSpinner />}
        {loading ? "Enviando..." : "Enviarme el enlace"}
      </Button>
      {error && <p className="text-sm text-critical bg-critical-bg rounded-control px-3 py-2 w-full">{error}</p>}
    </form>
  );
}
