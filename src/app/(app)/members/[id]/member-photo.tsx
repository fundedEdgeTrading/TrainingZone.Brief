"use client";

import { useRef, useState, useTransition } from "react";
import { updateMemberPhoto } from "./actions";
import { useToast } from "@/components/ui/toast";
import { resizeImageFile } from "@/lib/image-resize";

export function EditableMemberPhoto({
  memberId,
  photoUrl,
  initials,
}: {
  memberId: string;
  photoUrl: string | null;
  initials: string;
}) {
  const [preview, setPreview] = useState(photoUrl);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  async function handleFile(file: File | undefined) {
    if (!file) return;
    // Reescalada en el navegador (sin EXIF) y guardada en Postgres por la acción.
    const result = await resizeImageFile(file, { maxDimension: 600 });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    const previous = preview;
    setPreview(result.dataUrl);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("memberId", memberId);
      fd.set("photoUrl", result.dataUrl);
      const saved = await updateMemberPhoto(fd);
      if (saved.ok) {
        toast.success("Foto de perfil actualizada.");
      } else {
        setPreview(previous);
        toast.error(saved.error);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={() => fileRef.current?.click()}
      disabled={pending}
      title="Cambiar foto"
      aria-label="Cambiar foto de perfil"
      // El mismo `viewTransitionName` que el avatar de la fila en la lista: el
      // navegador reconoce que es el mismo objeto y lo lleva de un sitio a otro
      // en vez de hacerlo desaparecer y aparecer.
      style={{ viewTransitionName: `member-avatar-${memberId}` }}
      className="relative w-[76px] h-[76px] rounded-full bg-tz-sand border border-brand-border text-brand-text-2 font-display font-extrabold text-[22px] flex items-center justify-center shrink-0 overflow-hidden group"
    >
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element -- foto subida por el usuario (`/api/files/<id>` o data URL recién elegida)
        <img src={preview} alt="" className="w-full h-full object-cover" />
      ) : (
        initials
      )}
      <span className="absolute inset-0 bg-tz-black/0 group-hover:bg-tz-black/40 transition-colors duration-150 flex items-center justify-center text-[10px] font-bold text-transparent group-hover:text-white uppercase tracking-wide">
        Editar
      </span>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
    </button>
  );
}
