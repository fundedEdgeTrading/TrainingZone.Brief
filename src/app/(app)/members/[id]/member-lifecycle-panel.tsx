"use client";

import { useRef, useState, useTransition } from "react";

import { Button, ButtonSpinner } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { MEMBER_KIND_LABEL, type MemberKind } from "@/lib/member-kinds";
import type { ReasonOption } from "@/lib/member-lifecycle";

import { cancelMemberAction, freezeMemberAction, reactivateMemberAction } from "./actions";

/**
 * E14-15 · Los cuatro tipos de persona, en la ficha.
 *
 * Lo que hay debajo de las acciones de cada bono cubre al socio que tiene bono.
 * Este panel es para los otros dos casos, que son los que la campaña de
 * septiembre necesita y hasta ahora no tenían sitio:
 *
 *   · el socio SIN bono vivo —el que se quedó sin renovar— al que hay que
 *     congelar o dar de baja con su motivo, y
 *   · el EXCLIENTE que vuelve, que es literalmente el objetivo del ejercicio.
 *
 * Los dos motivos son obligatorios y salen de los catálogos de la organización:
 * sin motivo el servidor rechaza la transición, así que el desplegable no tiene
 * opción vacía que valga.
 */

const TONE: Record<MemberKind, BadgeTone> = {
  CLIENTE: "good",
  CONGELADO: "warning",
  SUSPENDIDO: "critical",
  EXCLIENTE: "neutral",
  EN_CAPTACION: "prospect",
};

export function MemberLifecyclePanel({
  memberId,
  kind,
  freezeReasons,
  cancelReasons,
  frozenReasonLabel,
  cancelReasonLabel,
  resumeOn,
  cancelledAt,
}: {
  memberId: string;
  kind: MemberKind;
  freezeReasons: ReasonOption[];
  cancelReasons: ReasonOption[];
  /** Motivo registrado de la congelación en curso, si la hay. */
  frozenReasonLabel: string | null;
  /** Motivo registrado de la baja, si la hay. */
  cancelReasonLabel: string | null;
  /** Fecha de vuelta prevista: sale de `Subscription.pauseUntil`, no de `Member`. */
  resumeOn: string | null;
  cancelledAt: string | null;
}) {
  const [open, setOpen] = useState<"none" | "freeze" | "cancel">("none");
  const freezeRef = useRef<HTMLFormElement>(null);
  const cancelRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const canFreeze = kind === "CLIENTE" || kind === "SUSPENDIDO";
  const canCancel = kind !== "EXCLIENTE";
  const canReactivate = kind !== "CLIENTE" && kind !== "EN_CAPTACION";

  function reactivate() {
    startTransition(async () => {
      const result = await reactivateMemberAction(memberId);
      if (result.ok) toast.success("El socio vuelve a ser cliente.");
      else toast.error(result.error);
    });
  }

  return (
    <div className="border border-brand-border rounded-xl p-4 flex flex-col gap-3.5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-brand-muted">Tipo de persona</span>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge tone={TONE[kind]}>{MEMBER_KIND_LABEL[kind]}</Badge>
            {kind === "CONGELADO" && (
              <span className="text-[12.5px] text-brand-muted">
                {frozenReasonLabel ?? "sin motivo registrado"}
                {resumeOn ? ` · vuelve el ${resumeOn}` : " · sin fecha de vuelta"}
              </span>
            )}
            {kind === "EXCLIENTE" && (
              <span className="text-[12.5px] text-brand-muted">
                {cancelReasonLabel ?? "sin motivo registrado"}
                {cancelledAt ? ` · desde el ${cancelledAt}` : ""}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canReactivate && (
            <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={reactivate}>
              {pending && <ButtonSpinner />}
              Volver a cliente
            </Button>
          )}
          {canFreeze && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setOpen(open === "freeze" ? "none" : "freeze")}
            >
              Congelar
            </Button>
          )}
          {canCancel && (
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={() => setOpen(open === "cancel" ? "none" : "cancel")}
            >
              Dar de baja
            </Button>
          )}
        </div>
      </div>

      {open === "freeze" && (
        <form
          ref={freezeRef}
          action={(fd) =>
            startTransition(async () => {
              const result = await freezeMemberAction(fd);
              if (result.ok) {
                toast.success("Socio congelado.");
                freezeRef.current?.reset();
                setOpen("none");
              } else toast.error(result.error);
            })
          }
          className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end border-t border-brand-border pt-3.5"
        >
          <input type="hidden" name="memberId" value={memberId} />
          <Field label="Vuelve el (opcional)" hint="Se guarda en el bono, no en la ficha">
            <Input name="resumeOn" type="date" />
          </Field>
          <Field
            label="Motivo"
            className="sm:col-span-2"
            hint={freezeReasons.length === 0 ? "Dirección todavía no ha configurado motivos de congelación." : undefined}
          >
            <Select name="freezeReasonId" required defaultValue="" disabled={freezeReasons.length === 0}>
              <option value="" disabled>
                Elige un motivo…
              </option>
              {freezeReasons.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="sm:col-span-3 flex justify-end">
            <Button type="submit" variant="secondary" size="sm" disabled={pending || freezeReasons.length === 0}>
              {pending && <ButtonSpinner />}
              Congelar socio
            </Button>
          </div>
        </form>
      )}

      {open === "cancel" && (
        <form
          ref={cancelRef}
          action={(fd) =>
            startTransition(async () => {
              const result = await cancelMemberAction(fd);
              if (result.ok) {
                toast.success("Socio dado de baja.");
                cancelRef.current?.reset();
                setOpen("none");
              } else toast.error(result.error);
            })
          }
          className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end border-t border-brand-border pt-3.5"
        >
          <input type="hidden" name="memberId" value={memberId} />
          <Field
            label="Motivo de baja"
            className="sm:col-span-2"
            hint={
              cancelReasons.length === 0
                ? "Dirección todavía no ha configurado motivos de baja."
                : "Sin motivo no hay campaña de reactivación que valga."
            }
          >
            <Select name="cancelReasonId" required defaultValue="" disabled={cancelReasons.length === 0}>
              <option value="" disabled>
                Elige un motivo…
              </option>
              {cancelReasons.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="sm:col-span-3 flex justify-end">
            <Button type="submit" variant="danger" size="sm" disabled={pending || cancelReasons.length === 0}>
              {pending && <ButtonSpinner />}
              Dar de baja
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
