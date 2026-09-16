"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
// Del módulo PURO, no de `referral-rewards.ts`: esto es cliente, y ese otro
// lleva `prisma` dentro (el build de Next lo corta en seco, y hace bien).
import { validateProgramInput, type ProgramConfigView } from "@/lib/referral-program";
import { saveProgramAction } from "./actions";

/**
 * El programa de UN centro (E14-32, "configurable por centro").
 *
 * Dos caras, porque a doble cara funciona mejor: lo que se lleva quien trae y,
 * si el centro quiere, algo para quien entra. Las dos son importe fijo a
 * descontar del siguiente recibo **o** sesiones sueltas, nunca las dos a la
 * vez — guardar un importe colgado de un programa de sesiones es exactamente
 * cómo se acaba pagando dos veces la misma recompensa.
 *
 * La validación es la misma función que usa el servidor (`validateProgramInput`):
 * aquí solo se adelanta el mensaje mientras se teclea.
 */
export function ProgramForm({ config, centerName }: { config: ProgramConfigView; centerName: string }) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const [active, setActive] = useState(config.active);
  const [referrerKind, setReferrerKind] = useState(config.referrerKind);
  const [referrerAmount, setReferrerAmount] = useState(
    config.referrerAmountCents !== null ? String(config.referrerAmountCents / 100) : ""
  );
  const [referrerSessions, setReferrerSessions] = useState(
    config.referrerSessions !== null ? String(config.referrerSessions) : ""
  );
  const [twoSided, setTwoSided] = useState(config.referredKind !== null);
  const [referredKind, setReferredKind] = useState(config.referredKind ?? "FIXED_AMOUNT");
  const [referredAmount, setReferredAmount] = useState(
    config.referredAmountCents !== null ? String(config.referredAmountCents / 100) : ""
  );
  const [referredSessions, setReferredSessions] = useState(
    config.referredSessions !== null ? String(config.referredSessions) : ""
  );
  const [cooldown, setCooldown] = useState(String(config.exMemberCooldownDays));

  const cents = (euros: string) => {
    const value = Number(euros.replace(",", "."));
    return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : null;
  };
  const whole = (n: string) => {
    const value = Number(n);
    return Number.isInteger(value) && value > 0 ? value : null;
  };

  const draft = {
    active,
    referrerKind,
    referrerAmountCents: cents(referrerAmount),
    referrerSessions: whole(referrerSessions),
    referredKind: twoSided ? referredKind : null,
    referredAmountCents: cents(referredAmount),
    referredSessions: whole(referredSessions),
    exMemberCooldownDays: Number(cooldown),
  };
  const check = validateProgramInput(draft);

  function save() {
    startTransition(async () => {
      const result = await saveProgramAction(config.centerId, draft);
      if (result.ok) toast.success("Programa guardado.");
      else toast.error(result.error);
    });
  }

  return (
    <div className="rounded-card border border-brand-border bg-white p-5 space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h3 className="font-display font-extrabold text-sm uppercase tracking-[-.01em] text-brand-text">
            {centerName}
          </h3>
          <p className="text-xs text-brand-muted mt-0.5">
            Lo que paga este centro por cada alta que entra por un enlace de un socio.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-brand-text-2 cursor-pointer">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="w-[18px] h-[18px] accent-tz-black cursor-pointer"
          />
          Programa activo
        </label>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Quien trae se lleva">
          <Select value={referrerKind} onChange={(e) => setReferrerKind(e.target.value as typeof referrerKind)}>
            <option value="FIXED_AMOUNT">Importe fijo (descuento del próximo recibo)</option>
            <option value="FREE_SESSIONS">Sesiones sueltas</option>
          </Select>
        </Field>
        {referrerKind === "FIXED_AMOUNT" ? (
          <Field label="Importe (€)">
            <Input
              value={referrerAmount}
              inputMode="decimal"
              placeholder="20"
              onChange={(e) => setReferrerAmount(e.target.value)}
            />
          </Field>
        ) : (
          <Field label="Sesiones">
            <Input
              value={referrerSessions}
              inputMode="numeric"
              placeholder="2"
              onChange={(e) => setReferrerSessions(e.target.value)}
            />
          </Field>
        )}
      </div>

      <label className="flex items-center gap-2 text-xs font-semibold text-brand-text-2 cursor-pointer">
        <input
          type="checkbox"
          checked={twoSided}
          onChange={(e) => setTwoSided(e.target.checked)}
          className="w-[18px] h-[18px] accent-tz-black cursor-pointer"
        />
        Y algo para quien entra
      </label>

      {twoSided && (
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Quien entra se lleva">
            <Select value={referredKind} onChange={(e) => setReferredKind(e.target.value as typeof referredKind)}>
              <option value="FIXED_AMOUNT">Importe fijo (descuento del alta)</option>
              <option value="FREE_SESSIONS">Sesiones sueltas</option>
            </Select>
          </Field>
          {referredKind === "FIXED_AMOUNT" ? (
            <Field label="Importe (€)">
              <Input
                value={referredAmount}
                inputMode="decimal"
                placeholder="20"
                onChange={(e) => setReferredAmount(e.target.value)}
              />
            </Field>
          ) : (
            <Field label="Sesiones">
              <Input
                value={referredSessions}
                inputMode="numeric"
                placeholder="1"
                onChange={(e) => setReferredSessions(e.target.value)}
              />
            </Field>
          )}
        </div>
      )}

      <Field
        label="Un excliente no cuenta hasta pasados (días)"
        hint="Antifraude: quien se fue hace poco y vuelve no es un alta nueva. Si no consta su fecha de baja —pasa con los socios importados— la recompensa va a revisión humana, no se descarta."
      >
        <Input value={cooldown} inputMode="numeric" onChange={(e) => setCooldown(e.target.value)} className="max-w-32" />
      </Field>

      {!check.ok && <p className="text-xs text-critical">{check.error}</p>}

      <Button onClick={save} disabled={pending || !check.ok} size="sm">
        Guardar
      </Button>
    </div>
  );
}
