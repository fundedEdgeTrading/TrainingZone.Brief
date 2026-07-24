"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import type { LeadCloseType, LeadStatus } from "@prisma/client";
import { updateLeadStageAction, claimLeadAction } from "./actions";
import type { LeadRow } from "@/lib/leads-queries";

type Column = { status: LeadStatus; label: string; tone: BadgeTone; dot: string };

const CLOSE_TYPE_LABEL: Record<LeadCloseType, string> = { EMBUDO: "Embudo", DIRECTO: "Directo", ONLINE: "Online" };
const CLOSE_TYPE_TONE: Record<LeadCloseType, BadgeTone> = { EMBUDO: "neutral", DIRECTO: "trial", ONLINE: "gold" };

// Solo los 3 estados no terminales se mueven por arrastre. Cerrar (CERRADO) y
// archivar (NO_CERRADO) exigen datos obligatorios (email/plan, motivo) que el
// formulario del detalle valida — así que arrastrar a esas columnas abre el detalle
// en lugar de forzar el cierre sin esos datos.
const DRAGGABLE_TARGETS = new Set<LeadStatus>(["SIN_CONTACTAR", "SEGUIMIENTO", "CON_FECHA_VALORACION"]);

function ageLabel(contactedAt: Date) {
  const days = Math.floor((Date.now() - new Date(contactedAt).getTime()) / (24 * 60 * 60 * 1000));
  return days <= 0 ? "hoy" : `${days} día${days === 1 ? "" : "s"}`;
}

export function LeadsBoard({ columns, leadsByStatus, canClaim }: { columns: Column[]; leadsByStatus: Record<string, LeadRow[]>; canClaim: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<LeadStatus | null>(null);

  function handleDrop(status: LeadStatus) {
    setDragOver(null);
    const leadId = draggingId;
    setDraggingId(null);
    if (!leadId) return;
    if (!DRAGGABLE_TARGETS.has(status)) {
      router.push(`/leads/${leadId}`);
      return;
    }
    startTransition(async () => {
      const result = await updateLeadStageAction(leadId, status as "SIN_CONTACTAR" | "SEGUIMIENTO" | "CON_FECHA_VALORACION");
      if (result.ok) router.refresh();
      else toast.error(result.error);
    });
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4 items-start">
      {columns.map((col) => {
        const items = leadsByStatus[col.status] ?? [];
        const isOver = dragOver === col.status;
        return (
          <div
            key={col.status}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(col.status);
            }}
            onDragLeave={() => setDragOver((s) => (s === col.status ? null : s))}
            onDrop={(e) => {
              e.preventDefault();
              handleDrop(col.status);
            }}
            className={`rounded-card shadow-card overflow-hidden border transition-colors duration-150 ${
              isOver ? "bg-[#faf8f3]" : "bg-brand-card"
            }`}
            style={{ borderColor: isOver ? col.dot : "var(--color-brand-border)" }}
          >
            <div className="px-3.5 py-3 border-b border-brand-border flex items-center gap-2">
              <span className="w-2 h-2 rounded-[2px] shrink-0" style={{ background: col.dot }} />
              <span className="flex-1 font-display font-bold text-[11px] uppercase tracking-[.09em] text-brand-text-2">{col.label}</span>
              <Badge tone="neutral" dot={false}>
                {items.length}
              </Badge>
            </div>
            <div className="p-2.5 space-y-2 max-h-[64vh] overflow-y-auto">
              {items.map((lead) => (
                <div
                  key={lead.id}
                  draggable
                  onDragStart={() => setDraggingId(lead.id)}
                  onDragEnd={() => setDraggingId(null)}
                  className={`rounded-control border border-brand-border bg-white p-2.5 cursor-grab active:cursor-grabbing hover:shadow-hover hover:border-brand-border-hover transition-[box-shadow,border-color,opacity] duration-200 ${
                    draggingId === lead.id ? "opacity-40" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/leads/${lead.id}`} className="font-semibold text-sm text-brand-text hover:underline">
                      {lead.firstName} {lead.lastName}
                    </Link>
                    {lead.status === "CERRADO" && lead.closeType && (
                      <Badge tone={CLOSE_TYPE_TONE[lead.closeType]} dot={false} className="shrink-0">
                        {CLOSE_TYPE_LABEL[lead.closeType]}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-brand-muted mt-0.5">{lead.center.name}</p>
                  <p className="text-xs text-faint mt-0.5">
                    {lead.channel} · {lead.phone}
                  </p>
                  <p className="text-xs text-brand-text-2 mt-1.5 line-clamp-2">{lead.goals}</p>
                  {lead.status === "NO_CERRADO" && lead.noCloseReason && (
                    <p className="text-[11px] font-semibold text-critical mt-1.5">Motivo: {lead.noCloseReason}</p>
                  )}
                  <div className="mt-2 pt-2 border-t border-tz-sand flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs text-brand-text-2 min-w-0">
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: lead.owner ? "var(--color-good)" : "var(--color-warning)" }}
                      />
                      <span className="truncate">
                        {lead.owner?.name ?? (lead.status === "CERRADO" && lead.closeType === "ONLINE" ? "Autoservicio" : "Sin responsable")}
                      </span>
                    </span>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] text-faint tz-nums">{ageLabel(lead.contactedAt)}</span>
                      {!lead.owner && canClaim && lead.status !== "CERRADO" && lead.status !== "NO_CERRADO" && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            startTransition(async () => {
                              const result = await claimLeadAction(lead.id);
                              if (result.ok) {
                                toast.success("Lead reclamado");
                                router.refresh();
                              } else toast.error(result.error);
                            });
                          }}
                          className="px-2 py-1 rounded-lg text-[11px] font-semibold border border-brand-border bg-white text-brand-text-2 hover:border-brand-ink transition-colors duration-150"
                        >
                          Reclamar
                        </button>
                      )}
                    </span>
                  </div>
                </div>
              ))}
              {items.length === 0 && <p className="text-xs text-faint text-center py-4">Vacío</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
