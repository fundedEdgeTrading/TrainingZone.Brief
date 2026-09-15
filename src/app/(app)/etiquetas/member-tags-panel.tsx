"use client";

import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import type { MemberTagView, TagTone } from "@/lib/tags";
import { assignMemberTagAction, removeMemberTagAction } from "./member-tag-actions";

export type ManualTagOption = { id: string; label: string; tone: TagTone };

/**
 * Las etiquetas del socio en su ficha.
 *
 * La automática se pinta igual que la manual —para quien mira, una etiqueta es
 * una etiqueta— pero NO trae aspa: quitarla a mano no serviría de nada, porque
 * volvería en la siguiente pasada del cron y parecería un fallo. En su lugar
 * dice, al pasar el ratón, quién la puso y por qué regla.
 */
export function MemberTagsPanel({
  memberId,
  tags,
  options,
  canEdit,
}: {
  memberId: string;
  tags: MemberTagView[];
  options: ManualTagOption[];
  canEdit: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const toast = useToast();

  const taken = new Set(tags.map((t) => t.id));
  const available = options.filter((o) => !taken.has(o.id));

  function add(tagDefinitionId: string) {
    startTransition(async () => {
      const result = await assignMemberTagAction(memberId, tagDefinitionId);
      if (result.ok) {
        toast.success("Etiqueta puesta.");
        setAdding(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  function remove(tagDefinitionId: string) {
    startTransition(async () => {
      const result = await removeMemberTagAction(memberId, tagDefinitionId);
      if (result.ok) toast.success("Etiqueta quitada.");
      else toast.error(result.error);
    });
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap" data-testid="member-tags">
      {tags.length === 0 && <span className="text-[12.5px] text-brand-muted">Sin etiquetas</span>}

      {tags.map((tag) => (
        <span key={tag.id} className="inline-flex items-center">
          <Badge
            tone={tag.tone}
            dot={false}
            className={tag.kind === "MANUAL" && canEdit ? "pr-1.5" : undefined}
          >
            <span
              title={
                tag.kind === "AUTOMATIC"
                  ? `La pone el sistema (regla «${tag.ruleKey ?? tag.key}»). No se puede quitar a mano: volvería en la siguiente pasada.`
                  : `La puso ${tag.assignedByName ?? "el equipo"}.`
              }
            >
              {tag.label}
            </span>
            {tag.kind === "MANUAL" && canEdit && (
              <button
                type="button"
                disabled={pending}
                onClick={() => remove(tag.id)}
                aria-label={`Quitar etiqueta ${tag.label}`}
                className="ml-1 leading-none opacity-60 hover:opacity-100 transition-opacity"
              >
                ×
              </button>
            )}
          </Badge>
        </span>
      ))}

      {canEdit && available.length > 0 && !adding && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="text-[11px] font-bold uppercase tracking-[0.04em] rounded-pill px-2.5 py-1 border border-dashed border-brand-border text-brand-muted hover:text-brand-text-2 hover:border-brand-ink transition-colors"
        >
          + Etiqueta
        </button>
      )}

      {canEdit && adding && (
        <span className="inline-flex items-center gap-1.5 flex-wrap">
          {available.map((o) => (
            <button key={o.id} type="button" disabled={pending} onClick={() => add(o.id)}>
              <Badge tone={o.tone} dot={false} className="opacity-70 hover:opacity-100 transition-opacity">
                + {o.label}
              </Badge>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="text-xs text-faint hover:text-brand-text-2"
          >
            Cancelar
          </button>
        </span>
      )}
    </div>
  );
}
