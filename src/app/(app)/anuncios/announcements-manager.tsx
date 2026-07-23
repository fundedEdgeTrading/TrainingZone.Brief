"use client";

import { useState, useRef, useTransition } from "react";
import { Drawer, DrawerFooter } from "@/components/ui/drawer";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Button, ButtonSpinner } from "@/components/ui/button";
import { ImageDropzone } from "@/components/ui/dropzone";
import { useToast } from "@/components/ui/toast";
import {
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  toggleAnnouncementActive,
} from "./actions";

export type AnnouncementRow = {
  id: string;
  title: string;
  body: string | null;
  imageUrl: string | null;
  category: string;
  audience: string;
  tags: string[];
  pinned: boolean;
  active: boolean;
  centerId: string | null;
  centerName: string | null;
  createdByName: string | null;
  viewCount: number;
  startsAt: string | null; // ISO
  endsAt: string | null; // ISO
  createdAt: string; // ISO
};

type CenterOption = { id: string; name: string };

const CATEGORY_LABEL: Record<string, string> = { NEWS: "Novedad", EVENT: "Evento", PROMO: "Promoción", ALERT: "Aviso" };
const CATEGORY_TONE: Record<string, string> = {
  NEWS: "bg-brand-subtle text-brand-text",
  EVENT: "bg-[#e9f2ff] text-[#1c4e80]",
  PROMO: "bg-[#fff2e0] text-[#8a5a12]",
  ALERT: "bg-[#fdecea] text-critical",
};
const AUDIENCE_LABEL: Record<string, string> = { ALL: "Todos", MEMBERS: "Socios activos" };

function toDateInput(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export default function AnnouncementsManager({
  announcements,
  centers,
}: {
  announcements: AnnouncementRow[];
  centers: CenterOption[];
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AnnouncementRow | null>(null);
  const [imageUrl, setImageUrl] = useState<string>("");
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const toast = useToast();

  function openCreate() {
    setEditing(null);
    setImageUrl("");
    setOpen(true);
  }

  function openEdit(a: AnnouncementRow) {
    setEditing(a);
    setImageUrl(a.imageUrl ?? "");
    setOpen(true);
  }

  function submit(fd: FormData) {
    fd.set("imageUrl", imageUrl);
    startTransition(async () => {
      const result = editing ? await updateAnnouncement(editing.id, fd) : await createAnnouncement(fd);
      if (result.ok) {
        toast.success(editing ? "Anuncio actualizado." : "Anuncio publicado.");
        setOpen(false);
        formRef.current?.reset();
      } else {
        toast.error(result.error);
      }
    });
  }

  function onToggle(a: AnnouncementRow) {
    startTransition(async () => {
      const result = await toggleAnnouncementActive(a.id, !a.active);
      if (!result.ok) toast.error(result.error);
      else toast.success(a.active ? "Anuncio desactivado." : "Anuncio activado.");
    });
  }

  function onDelete(a: AnnouncementRow) {
    if (!confirm(`¿Eliminar el anuncio "${a.title}"?`)) return;
    startTransition(async () => {
      const result = await deleteAnnouncement(a.id);
      if (!result.ok) toast.error(result.error);
      else toast.success("Anuncio eliminado.");
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button type="button" onClick={openCreate}>
          + Nuevo anuncio
        </Button>
      </div>

      {announcements.length === 0 ? (
        <div className="bg-brand-card border border-brand-border rounded-card p-8 text-center text-sm text-brand-muted">
          Todavía no has publicado ningún anuncio. Crea el primero para que tus socios lo vean al entrar en su portal.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {announcements.map((a) => (
            <div
              key={a.id}
              className={`bg-brand-card border rounded-card overflow-hidden shadow-card ${
                a.active ? "border-brand-border" : "border-dashed border-brand-border opacity-70"
              }`}
            >
              {a.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.imageUrl} alt="" className="w-full h-32 object-cover" />
              )}
              <div className="p-4 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[11px] font-bold uppercase tracking-[0.06em] rounded-full px-2 py-0.5 ${CATEGORY_TONE[a.category] ?? ""}`}>
                    {CATEGORY_LABEL[a.category] ?? a.category}
                  </span>
                  {a.pinned && (
                    <span className="text-[11px] font-bold uppercase tracking-[0.06em] rounded-full px-2 py-0.5 bg-tz-black text-white">
                      Destacado
                    </span>
                  )}
                  {!a.active && (
                    <span className="text-[11px] font-bold uppercase tracking-[0.06em] rounded-full px-2 py-0.5 bg-brand-subtle text-brand-muted">
                      Inactivo
                    </span>
                  )}
                </div>
                <div className="font-bold text-brand-text">{a.title}</div>
                {a.body && <p className="text-[13px] text-brand-muted line-clamp-3">{a.body}</p>}
                <div className="text-xs text-faint flex flex-wrap gap-x-3 gap-y-1 pt-1">
                  <span>{a.centerName ? `Centro: ${a.centerName}` : "Global (toda la empresa)"}</span>
                  <span>Audiencia: {AUDIENCE_LABEL[a.audience] ?? a.audience}</span>
                  <span>{a.viewCount} vistas</span>
                  {(a.startsAt || a.endsAt) && (
                    <span>
                      Vigencia: {a.startsAt ? toDateInput(a.startsAt) : "—"} → {a.endsAt ? toDateInput(a.endsAt) : "sin fin"}
                    </span>
                  )}
                </div>
                {a.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {a.tags.map((t) => (
                      <span key={t} className="text-[11px] rounded-full px-2 py-0.5 bg-brand-subtle text-brand-muted">
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 pt-2">
                  <Button type="button" variant="ghost" onClick={() => openEdit(a)} disabled={pending}>
                    Editar
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => onToggle(a)} disabled={pending}>
                    {a.active ? "Desactivar" : "Activar"}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => onDelete(a)} disabled={pending}>
                    Eliminar
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        kicker="Dashboard del socio"
        title={editing ? "Editar anuncio" : "Nuevo anuncio"}
      >
        <form ref={formRef} action={submit} className="flex flex-col gap-4 p-6 sm:p-7">
          <Field label="Título">
            <Input name="title" defaultValue={editing?.title ?? ""} placeholder="p.ej. Quedada del club de running" required />
          </Field>
          <Field label="Texto" hint="Texto informativo del anuncio (opcional si añades una imagen).">
            <Textarea name="body" defaultValue={editing?.body ?? ""} placeholder="Este sábado quedada + desayuno. ¡Apúntate en recepción!" />
          </Field>
          <ImageDropzone
            name="imageUrl"
            label="Imagen / banner"
            hint="Opcional. JPG o PNG, máx. 2MB."
            shape="rect"
            sizeClassName="w-full h-32"
            defaultValue={editing?.imageUrl ?? null}
            onChange={setImageUrl}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Categoría">
              <Select name="category" defaultValue={editing?.category ?? "NEWS"}>
                <option value="NEWS">Novedad</option>
                <option value="EVENT">Evento</option>
                <option value="PROMO">Promoción</option>
                <option value="ALERT">Aviso</option>
              </Select>
            </Field>
            <Field label="Audiencia">
              <Select name="audience" defaultValue={editing?.audience ?? "ALL"}>
                <option value="ALL">Todos los socios</option>
                <option value="MEMBERS">Solo socios activos</option>
              </Select>
            </Field>
          </div>
          <Field label="Alcance">
            <Select name="centerId" defaultValue={editing?.centerId ?? ""}>
              <option value="">Global (toda la empresa)</option>
              {centers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Etiquetas" hint="Separadas por comas. p.ej. running, evento">
            <Input name="tags" defaultValue={editing?.tags.join(", ") ?? ""} placeholder="running, evento" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Desde" hint="Vacío = desde ya.">
              <Input type="date" name="startsAt" defaultValue={toDateInput(editing?.startsAt ?? null)} />
            </Field>
            <Field label="Hasta" hint="Vacío = sin expiración.">
              <Input type="date" name="endsAt" defaultValue={toDateInput(editing?.endsAt ?? null)} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-brand-text">
            <input type="checkbox" name="pinned" defaultChecked={editing?.pinned ?? false} className="w-4 h-4" />
            Destacar (se muestra primero en el portal)
          </label>
        </form>
        <DrawerFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending} onClick={() => formRef.current?.requestSubmit()}>
            {pending && <ButtonSpinner />}
            {editing ? "Guardar cambios" : "Publicar anuncio"}
          </Button>
        </DrawerFooter>
      </Drawer>
    </div>
  );
}
