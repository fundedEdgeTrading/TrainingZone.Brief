"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { trainerColor, initials } from "./agenda-utils";
import { saveSessionAction, deleteSessionAction } from "./session-actions";
import { useToast } from "@/components/ui/toast";
import { TrainerTooltip } from "./trainer-tooltip";

export type DialogState = {
  mode: "create" | "edit";
  id: string | null;
  title: string;
  dateISO: string;
  startHHMM: string;
  endHHMM: string;
  type: "personal" | "reduced";
  trainerId: string;
  memberId: string | null;
  memberQuery: string;
  isTrial: boolean;
  recurrence: "NONE" | "WEEKLY" | "WEEKDAYS";
  recEnd: "forever" | "until";
  recUntil: string;
};

type Trainer = { id: string; name: string };
type Member = { id: string; firstName: string; lastName: string };

const SEG_BASE = "px-3.5 py-[9px] rounded-control text-[13px] font-semibold cursor-pointer transition-colors";
const SEG_ACTIVE = "border border-tz-black bg-tz-bone text-brand-text";
const SEG_INACTIVE = "border border-brand-border bg-white text-text-2";

export default function SessionDialog({
  dlg,
  setDlg,
  onClose,
  centerId,
  trainers,
  members,
  currentUserId,
  isDirection,
  onDone,
}: {
  dlg: DialogState;
  setDlg: React.Dispatch<React.SetStateAction<DialogState | null>>;
  onClose: () => void;
  centerId: string;
  trainers: Trainer[];
  members: Member[];
  currentUserId: string;
  isDirection: boolean;
  onDone: () => void;
}) {
  const [showMembers, setShowMembers] = useState(false);
  const [saving, startSaveTransition] = useTransition();
  const [deleting, startDeleteTransition] = useTransition();
  const pending = saving || deleting;
  const toast = useToast();

  const initialQuery = useMemo(() => {
    if (dlg.memberQuery) return dlg.memberQuery;
    if (dlg.memberId) {
      const m = members.find((x) => x.id === dlg.memberId);
      if (m) return `${m.firstName} ${m.lastName}`;
    }
    return "";
  }, [dlg.memberId, dlg.memberQuery, members]);
  const [memberQuery, setMemberQuery] = useState(initialQuery);

  function patch(p: Partial<DialogState>) {
    setDlg((d) => (d ? { ...d, ...p } : d));
  }

  const memberResults = useMemo(() => {
    if (!showMembers) return [];
    const q = memberQuery.trim().toLowerCase();
    return members
      .filter((m) => `${m.firstName} ${m.lastName}`.toLowerCase().includes(q))
      .slice(0, 6);
  }, [showMembers, memberQuery, members]);

  function handleSave() {
    const fd = new FormData();
    if (dlg.id) fd.set("id", dlg.id);
    fd.set("centerId", centerId);
    fd.set("title", dlg.title);
    fd.set("type", dlg.type);
    fd.set("trainerId", dlg.trainerId);
    fd.set("date", dlg.dateISO);
    fd.set("startTime", dlg.startHHMM);
    fd.set("endTime", dlg.endHHMM);
    if (dlg.memberId) fd.set("memberId", dlg.memberId);
    if (dlg.isTrial) fd.set("isTrial", "on");
    fd.set("recurrence", dlg.recurrence);
    if (dlg.recurrence !== "NONE" && dlg.recEnd === "until") fd.set("recUntil", dlg.recUntil);

    startSaveTransition(async () => {
      const res = await saveSessionAction(fd);
      if (res.ok) {
        toast.success(dlg.mode === "edit" ? "Sesión actualizada" : "Sesión creada");
        onDone();
      } else {
        toast.error(res.error);
      }
    });
  }

  function handleDelete() {
    if (!dlg.id) return;
    const fd = new FormData();
    fd.set("id", dlg.id);
    fd.set("centerId", centerId);
    startDeleteTransition(async () => {
      const res = await deleteSessionAction(fd);
      if (res.ok) {
        toast.success("Sesión eliminada");
        onDone();
      } else {
        toast.error(res.error);
      }
    });
  }

  const inputCls =
    "border border-brand-border rounded-control px-[11px] py-[9px] text-sm text-brand-text outline-none focus:border-tz-black";

  return (
    <div
      onMouseDown={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center p-5"
      style={{ background: "rgba(29,29,28,.45)" }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="w-[480px] max-w-full max-h-[90vh] overflow-y-auto bg-white rounded-2xl tz-fade-up"
        style={{ boxShadow: "var(--shadow-pop)" }}
      >
        <div className="flex justify-between items-center pt-4.5 px-4 pl-6">
          <span className="text-[11px] font-bold uppercase tracking-[.16em] text-muted">
            {dlg.mode === "edit" ? "Editar sesión" : "Nueva sesión"}
          </span>
          <button
            onClick={onClose}
            className="w-[34px] h-[34px] rounded-full border border-brand-border bg-white text-text-2 text-lg hover:bg-tz-bone"
          >
            ×
          </button>
        </div>

        <div className="px-6 pb-6 pt-1.5">
          <input
            value={dlg.title}
            onChange={(e) => patch({ title: e.target.value })}
            placeholder="Añadir título"
            className="w-full border-0 border-b-2 border-brand-border py-1.5 text-[22px] font-semibold text-brand-text outline-none focus:border-tz-black mb-5.5 mb-[22px]"
          />

          <div className="flex flex-col gap-[18px]">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[.08em] text-muted mb-1.5">Tipo de entrenamiento</div>
              <div className="flex gap-2">
                <button className={`${SEG_BASE} ${dlg.type === "personal" ? SEG_ACTIVE : SEG_INACTIVE}`} onClick={() => patch({ type: "personal" })}>
                  Entrenamiento personal
                </button>
                <button
                  className={`${SEG_BASE} ${dlg.type === "reduced" ? SEG_ACTIVE : SEG_INACTIVE}`}
                  onClick={() => {
                    patch({ type: "reduced", title: "Grupo", memberId: null });
                    setMemberQuery("");
                    setShowMembers(false);
                  }}
                >
                  Grupo reducido
                </button>
              </div>
            </div>

            <div>
              <div className="text-[11px] font-bold uppercase tracking-[.08em] text-muted mb-1.5">Fecha y hora</div>
              <div className="flex items-center gap-2 flex-wrap">
                <input type="date" value={dlg.dateISO} onChange={(e) => patch({ dateISO: e.target.value })} className={inputCls} />
                <input type="time" value={dlg.startHHMM} onChange={(e) => patch({ startHHMM: e.target.value })} className={inputCls} />
                <span className="text-muted">–</span>
                <input type="time" value={dlg.endHHMM} onChange={(e) => patch({ endHHMM: e.target.value })} className={inputCls} />
              </div>
            </div>

            <div className="relative">
              <div className="text-[11px] font-bold uppercase tracking-[.08em] text-muted mb-1.5">Socio</div>
              <input
                value={dlg.type === "reduced" ? "" : memberQuery}
                onChange={(e) => {
                  setMemberQuery(e.target.value);
                  setShowMembers(true);
                  patch({ memberId: null });
                }}
                onFocus={() => setShowMembers(true)}
                placeholder={dlg.type === "reduced" ? "No aplica a grupo reducido" : "Buscar socio…"}
                autoComplete="off"
                disabled={dlg.type === "reduced"}
                className={`w-full ${inputCls} disabled:cursor-not-allowed disabled:bg-tz-bone disabled:text-muted`}
              />
              {showMembers && dlg.type !== "reduced" && (
                <div
                  className="absolute left-0 right-0 top-full z-[5] mt-1 bg-white border border-brand-border rounded-xl max-h-[210px] overflow-y-auto"
                  style={{ boxShadow: "var(--shadow-pop)" }}
                >
                  {memberResults.map((m) => (
                    <div
                      key={m.id}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        const name = `${m.firstName} ${m.lastName}`;
                        setMemberQuery(name);
                        setShowMembers(false);
                        patch({ memberId: m.id, title: dlg.type === "reduced" ? dlg.title : name });
                      }}
                      className="px-3.5 py-[9px] text-sm text-brand-text cursor-pointer flex items-center gap-2.5 hover:bg-tz-bone"
                    >
                      <span className="w-[26px] h-[26px] rounded-full bg-tz-sand text-text-2 text-[11px] font-semibold flex items-center justify-center shrink-0">
                        {initials(`${m.firstName} ${m.lastName}`)}
                      </span>
                      {m.firstName} {m.lastName}
                    </div>
                  ))}
                  {memberResults.length === 0 && <div className="px-3.5 py-2.5 text-[13px] text-muted">Sin resultados</div>}
                </div>
              )}
            </div>

            <label onClick={() => patch({ isTrial: !dlg.isTrial })} className="flex items-center gap-2.5 cursor-pointer select-none">
              <span
                className="w-[18px] h-[18px] rounded-[5px] shrink-0 flex items-center justify-center text-white text-xs"
                style={{ border: `2px solid ${dlg.isTrial ? "var(--color-tz-black)" : "var(--color-muted)"}`, background: dlg.isTrial ? "var(--color-tz-black)" : "transparent" }}
              >
                {dlg.isTrial ? "✓" : ""}
              </span>
              <span className="text-sm text-brand-text">
                Prueba nuevo cliente <span className="text-muted text-xs">· se muestra en el título</span>
              </span>
            </label>

            <div>
              <div className="text-[11px] font-bold uppercase tracking-[.08em] text-muted mb-1.5">Entrenador</div>
              <div className="flex gap-3 items-center flex-wrap">
                {trainers.map((t) => {
                  const color = trainerColor(t.id);
                  const sel = dlg.trainerId === t.id;
                  return (
                    <TrainerTooltip key={t.id} name={t.name} color={color} className="shrink-0">
                      <button
                        onClick={() => patch({ trainerId: t.id })}
                        className="w-7 h-7 rounded-full text-white text-sm shrink-0"
                        style={{ background: color, boxShadow: sel ? `0 0 0 2px #fff, 0 0 0 4px ${color}` : "none" }}
                      >
                        {sel ? "✓" : ""}
                      </button>
                    </TrainerTooltip>
                  );
                })}
                {trainers.length === 0 && <p className="text-xs text-muted">Sin entrenadores.</p>}
              </div>
            </div>

            <div>
              <div className="text-[11px] font-bold uppercase tracking-[.08em] text-muted mb-1.5">Se repite</div>
              <select
                value={dlg.recurrence}
                onChange={(e) => patch({ recurrence: e.target.value as DialogState["recurrence"] })}
                className={`w-full cursor-pointer ${inputCls}`}
              >
                <option value="NONE">No se repite</option>
                <option value="WEEKLY">Cada semana</option>
                <option value="WEEKDAYS">Todos los días laborables (L–V)</option>
              </select>
              {dlg.recurrence !== "NONE" && (
                <div className="mt-2.5 flex flex-col gap-2">
                  <div className="text-[13px] text-text-2">Termina</div>
                  <div className="flex gap-2 items-center flex-wrap">
                    <button className={`${SEG_BASE} ${dlg.recEnd === "forever" ? SEG_ACTIVE : SEG_INACTIVE}`} onClick={() => patch({ recEnd: "forever" })}>
                      Para siempre
                    </button>
                    <button className={`${SEG_BASE} ${dlg.recEnd === "until" ? SEG_ACTIVE : SEG_INACTIVE}`} onClick={() => patch({ recEnd: "until" })}>
                      Hasta la fecha
                    </button>
                    {dlg.recEnd === "until" && (
                      <input type="date" value={dlg.recUntil} onChange={(e) => patch({ recUntil: e.target.value })} className={inputCls} />
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {dlg.mode === "edit" && dlg.id && (isDirection || dlg.trainerId === currentUserId) && (
            <Link
              href={`/brief/${dlg.id}`}
              className="mt-5 flex items-center justify-center gap-2 w-full h-[42px] rounded-control border border-brand-border bg-white text-sm font-semibold text-brand-text hover:bg-tz-bone hover:border-brand-border-hover transition-colors"
            >
              Ver debrief de la sesión →
            </Link>
          )}

          <div className="flex justify-between items-center mt-6">
            {dlg.mode === "edit" ? (
              <button onClick={handleDelete} disabled={pending} className="text-critical text-sm font-semibold hover:underline px-1 py-2">
                {deleting ? "Eliminando…" : "Eliminar"}
              </button>
            ) : (
              <div />
            )}
            <button
              onClick={handleSave}
              disabled={pending}
              className="h-[42px] px-6 rounded-control bg-tz-black text-tz-bone text-sm font-semibold hover:bg-brand-ink-soft disabled:opacity-60"
              style={{ boxShadow: "var(--shadow-card)" }}
            >
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
