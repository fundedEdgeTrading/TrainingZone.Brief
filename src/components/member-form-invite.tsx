"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonSpinner } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { MemberFormState } from "@/lib/member-forms";
import { sendLeadFormAction, sendMemberFormAction } from "@/app/(app)/form-invite-actions";

/**
 * M5 · «Enviar formulario» y el estado visible en la ficha (E14-18, E14-20).
 *
 * Un solo componente para la ficha del socio y la del lead: es el mismo botón,
 * el mismo estado y el mismo rótulo. Copiarlo «como espejo» para el lead sería
 * exactamente el duplicado que este trimestre no se quiere repetir.
 */

const STATE_LABEL: Record<MemberFormState, string> = {
  NO_ENVIADO: "Sin enviar",
  ENVIADO: "Enviado",
  ABIERTO: "Abierto, sin terminar",
  RELLENO: "Relleno",
  CADUCADO: "Caducado",
};

const STATE_TONE: Record<MemberFormState, "neutral" | "warning" | "good" | "critical"> = {
  NO_ENVIADO: "neutral",
  ENVIADO: "warning",
  ABIERTO: "warning",
  RELLENO: "good",
  CADUCADO: "critical",
};

export type MemberFormInviteView = {
  state: MemberFormState;
  /** Ya formateadas en el servidor, con la zona horaria del centro. */
  sentAtLabel: string | null;
  completedAtLabel: string | null;
  expiresAtLabel: string | null;
};

export function MemberFormInvitePanel({
  target,
  status,
}: {
  target: { kind: "member"; memberId: string } | { kind: "lead"; leadId: string };
  status: MemberFormInviteView;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  // El correo puede rebotar o caer en spam y recepción tiene al cliente
  // delante: el enlace se enseña para poder dictarlo o copiarlo.
  const [url, setUrl] = useState<string | null>(null);

  function send() {
    startTransition(async () => {
      const result =
        target.kind === "member"
          ? await sendMemberFormAction(target.memberId)
          : await sendLeadFormAction(target.leadId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setUrl(result.url);
      toast.success("Formulario enviado por correo.");
      router.refresh();
    });
  }

  const detail =
    status.state === "RELLENO"
      ? `Relleno el ${status.completedAtLabel}`
      : status.state === "NO_ENVIADO"
        ? "Todavía no se le ha mandado."
        : status.state === "CADUCADO"
          ? `Enviado el ${status.sentAtLabel}, ya no se puede abrir.`
          : `Enviado el ${status.sentAtLabel} · válido hasta el ${status.expiresAtLabel}`;

  return (
    <div className="rounded-xl border border-brand-border bg-brand-bg p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-brand-text">Formulario de alta</p>
          <p className="text-xs text-brand-muted mt-0.5">{detail}</p>
        </div>
        <Badge tone={STATE_TONE[status.state]}>{STATE_LABEL[status.state]}</Badge>
      </div>

      {status.state !== "RELLENO" && (
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="secondary" disabled={pending} onClick={send}>
            {pending && <ButtonSpinner />}
            {status.state === "NO_ENVIADO" ? "Enviar formulario" : "Reenviar formulario"}
          </Button>
          <span className="text-[11px] text-brand-faint">
            Le llega un enlace de un solo uso. Lo que conteste cae en su ficha, sin teclear nada.
          </span>
        </div>
      )}

      {url && (
        <p className="text-[11px] text-brand-faint break-all border-t border-brand-border pt-2">
          Enlace enviado: <span className="font-mono text-brand-text-2">{url}</span>
        </p>
      )}
    </div>
  );
}
