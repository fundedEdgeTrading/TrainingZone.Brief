"use client";

import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
// Del módulo PURO: `referrals.ts` lleva `prisma` dentro y esto es cliente.
import { REFERRAL_STATE_LABEL, type ReferralState } from "@/lib/referral-program";
import { ensureReferralCodeAction } from "./actions";

const STATE_TONE: Record<ReferralState, "neutral" | "trial" | "good"> = {
  INVITADO: "neutral",
  VALORACION_HECHA: "trial",
  ALTA: "good",
  DESCARTADO: "neutral",
};

/**
 * El enlace del socio en su ficha (E14-30), con lo que ha traído.
 *
 * El código se genera A DEMANDA, cuando alguien pulsa: sembrarlo de golpe para
 * los 300 socios de un centro llenaría la tabla de enlaces que nadie ha pedido
 * y que nadie va a compartir.
 *
 * El enlace que se copia es el MISMO que usará la app nativa: `/r/<código>` es
 * una sola ruta pública y no hay una versión "de la web" y otra "del móvil".
 */
export function MemberReferralPanel({
  memberId,
  origin,
  initialCode,
  revoked,
  canGenerate,
  referred,
}: {
  memberId: string;
  origin: string;
  initialCode: string | null;
  revoked: boolean;
  canGenerate: boolean;
  referred: { leadId: string; name: string; state: ReferralState; viaLink: boolean }[];
}) {
  const [code, setCode] = useState(initialCode);
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const link = code ? `${origin}/r/${code}` : null;

  function generate() {
    startTransition(async () => {
      const result = await ensureReferralCodeAction(memberId);
      if (result.ok) {
        setCode(result.code.code);
        toast.success("Enlace creado. Ya se puede compartir.");
      } else {
        toast.error(result.error);
      }
    });
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Enlace copiado.");
    } catch {
      // Sin permiso de portapapeles (o sin HTTPS): el enlace está a la vista y
      // se puede seleccionar a mano. Mejor decirlo que fallar en silencio.
      toast.info("Copia el enlace a mano: tu navegador no ha dejado usar el portapapeles.");
    }
  }

  return (
    <div className="rounded-card border border-brand-border bg-white p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-display font-extrabold text-sm uppercase tracking-[-.01em] text-brand-text">
            Enlace para traer a un amigo
          </h3>
          <p className="text-xs text-brand-muted mt-0.5 max-w-lg">
            Quien entre por aquí cae en Leads con canal «Referido» y sigue el embudo normal. La recompensa se libera al
            alta como tarea a administración: no se descuenta nada solo.
          </p>
        </div>
        {!code && canGenerate && (
          <Button size="sm" variant="secondary" onClick={generate} disabled={pending}>
            Crear enlace
          </Button>
        )}
      </div>

      {revoked && (
        <p className="text-xs text-warning-text">
          El enlace está caducado porque el socio está de baja. Si vuelve, recupera el mismo código.
        </p>
      )}

      {link && !revoked && (
        <div className="flex items-center gap-2 flex-wrap">
          <code className="rounded-control border border-brand-border bg-tz-bone px-3 py-2 text-xs text-brand-text break-all">
            {link}
          </code>
          <button onClick={copy} className="text-xs font-semibold text-brand-text-2 hover:opacity-80">
            Copiar
          </button>
        </div>
      )}

      {!code && !canGenerate && <p className="text-xs text-faint">Todavía no tiene enlace.</p>}

      {referred.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-brand-muted">
            Ha traído a {referred.length}
          </div>
          {referred.map((r) => (
            <div key={r.leadId} className="flex items-center gap-2 text-sm">
              <span className="text-brand-text">{r.name}</span>
              <Badge tone={STATE_TONE[r.state]} dot={false}>
                {REFERRAL_STATE_LABEL[r.state]}
              </Badge>
              {!r.viaLink && <span className="text-[11px] text-faint">apuntado a mano</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
