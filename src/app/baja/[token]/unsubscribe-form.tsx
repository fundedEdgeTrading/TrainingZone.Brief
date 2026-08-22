"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, ButtonSpinner } from "@/components/ui/button";
import { unsubscribeFromAllEmails } from "@/app/preferencias/actions";

export default function UnsubscribeForm({ token }: { token: string }) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (done) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-brand-text-2 bg-tz-sand border border-brand-border rounded-control p-4">
          Hecho. No volveremos a enviarte correos prescindibles. Si algún día cambias de idea, puedes volver a
          activarlos desde tus preferencias.
        </p>
        <Link
          href={`/preferencias/${token}`}
          className="block text-center font-semibold bg-white border border-brand-border text-brand-text rounded-control px-6 py-3 text-sm no-underline"
        >
          Ver mis preferencias
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-critical bg-critical-bg rounded-control px-3 py-2">{error}</p>}
      <Button
        type="button"
        size="lg"
        className="w-full"
        disabled={loading}
        onClick={async () => {
          setLoading(true);
          setError(null);
          const result = await unsubscribeFromAllEmails(token);
          setLoading(false);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setDone(true);
        }}
      >
        {loading && <ButtonSpinner />}
        {loading ? "Dándote de baja..." : "Confirmar mi baja"}
      </Button>
    </div>
  );
}
