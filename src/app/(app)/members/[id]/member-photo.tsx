"use client";

import { useRef, useState, useTransition } from "react";
import { updateMemberPhoto } from "./actions";
import { useToast } from "@/components/ui/toast";

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

  function handleFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Selecciona un archivo de imagen.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("La imagen pesa demasiado (máx. 2MB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setPreview(dataUrl);
      startTransition(async () => {
        const fd = new FormData();
        fd.set("memberId", memberId);
        fd.set("photoUrl", dataUrl);
        const result = await updateMemberPhoto(fd);
        if (result.ok) toast.success("Foto de perfil actualizada.");
        else toast.error(result.error);
      });
    };
    reader.readAsDataURL(file);
  }

  return (
    <button
      type="button"
      onClick={() => fileRef.current?.click()}
      disabled={pending}
      title="Cambiar foto"
      className="relative w-14 h-14 rounded-full bg-tz-sand text-brand-text-2 font-display font-extrabold text-lg flex items-center justify-center shrink-0 overflow-hidden group"
    >
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element -- foto subida por el usuario (data URL)
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
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </button>
  );
}
