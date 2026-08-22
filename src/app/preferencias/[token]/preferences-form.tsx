"use client";

import { useState } from "react";
import { Button, ButtonSpinner } from "@/components/ui/button";
import {
  MEMBER_EMAIL_KIND_HELP,
  MEMBER_EMAIL_KIND_LABEL,
  preferenceValue,
  type MemberEmailKind,
  type MemberEmailPreferences,
} from "@/lib/email-preferences";
import { saveEmailPreferences, unsubscribeFromAllEmails } from "../actions";

const KINDS: MemberEmailKind[] = ["vacancy", "assessment", "birthday", "marketing"];

export default function PreferencesForm({
  token,
  preferences,
}: {
  token: string;
  preferences: MemberEmailPreferences;
}) {
  const [values, setValues] = useState<Record<MemberEmailKind, boolean>>(() =>
    KINDS.reduce(
      (acc, kind) => ({ ...acc, [kind]: preferenceValue(kind, preferences) }),
      {} as Record<MemberEmailKind, boolean>
    )
  );
  const [optedOut, setOptedOut] = useState(Boolean(preferences.emailOptOutAt));
  const [saving, setSaving] = useState(false);
  const [unsubscribing, setUnsubscribing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(next: Record<MemberEmailKind, boolean>) {
    setSaving(true);
    setError(null);
    setSaved(false);
    const result = await saveEmailPreferences(token, next);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    // Marcar cualquier casilla levanta la baja global (ver `updateMemberEmailPreferences`).
    setOptedOut(!Object.values(next).some(Boolean));
    setSaved(true);
  }

  async function unsubscribeAll() {
    setUnsubscribing(true);
    setError(null);
    setSaved(false);
    const result = await unsubscribeFromAllEmails(token);
    setUnsubscribing(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setValues(KINDS.reduce((acc, kind) => ({ ...acc, [kind]: false }), {} as Record<MemberEmailKind, boolean>));
    setOptedOut(true);
    setSaved(true);
  }

  return (
    <div className="space-y-5">
      {optedOut && (
        <p className="text-sm text-brand-text-2 bg-tz-sand border border-brand-border rounded-control p-4">
          Estás dado de baja: no te llegará ningún correo prescindible. Marca lo que quieras volver a recibir y guarda.
        </p>
      )}

      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          await save(values);
        }}
      >
        {KINDS.map((kind) => (
          <label
            key={kind}
            className="flex gap-3 items-start border border-brand-border rounded-control p-4 cursor-pointer hover:border-brand-ink transition-colors"
          >
            <input
              type="checkbox"
              className="w-4 h-4 mt-0.5 shrink-0 accent-tz-black"
              checked={values[kind]}
              onChange={(e) => {
                setSaved(false);
                setValues({ ...values, [kind]: e.target.checked });
              }}
            />
            <span>
              <span className="block text-sm font-semibold text-brand-text">{MEMBER_EMAIL_KIND_LABEL[kind]}</span>
              <span className="block text-xs text-brand-muted mt-0.5">{MEMBER_EMAIL_KIND_HELP[kind]}</span>
            </span>
          </label>
        ))}

        {error && <p className="text-sm text-critical bg-critical-bg rounded-control px-3 py-2">{error}</p>}
        {saved && !error && (
          <p className="text-sm text-brand-text-2 bg-tz-sand border border-brand-border rounded-control px-3 py-2">
            Guardado. Se aplica a partir de ahora mismo.
          </p>
        )}

        <Button type="submit" size="lg" disabled={saving || unsubscribing} className="w-full">
          {saving && <ButtonSpinner />}
          {saving ? "Guardando..." : "Guardar mis preferencias"}
        </Button>
      </form>

      {!optedOut && (
        <button
          type="button"
          onClick={unsubscribeAll}
          disabled={saving || unsubscribing}
          className="w-full text-xs text-brand-muted underline disabled:opacity-50"
        >
          {unsubscribing ? "Dándote de baja..." : "Darme de baja de todos los correos prescindibles"}
        </button>
      )}
    </div>
  );
}
