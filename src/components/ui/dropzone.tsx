"use client";

import { useId, useRef, useState } from "react";
import clsx from "clsx";
import { useToast } from "./toast";

const MAX_BYTES = 2 * 1024 * 1024; // 2MB — suficiente para preview, evita hinchar la fila en BD.

type Shape = "circle" | "rounded" | "rect";

const SHAPE_CLASS: Record<Shape, string> = {
  circle: "rounded-full",
  rounded: "rounded-xl",
  rect: "rounded-xl",
};

/**
 * Zona de subida de imagen sin backend de almacenamiento: lee el archivo como
 * data URL en el cliente y lo deja en un <input type="hidden"> con `name`,
 * listo para viajar dentro del FormData del formulario que lo envuelve.
 */
export function ImageDropzone({
  name,
  label,
  hint,
  shape = "rounded",
  defaultValue,
  sizeClassName = "w-24 h-24",
  onChange,
}: {
  name: string;
  label?: string;
  hint?: string;
  shape?: Shape;
  defaultValue?: string | null;
  sizeClassName?: string;
  onChange?: (dataUrl: string) => void;
}) {
  const inputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(defaultValue ?? null);
  const [dragOver, setDragOver] = useState(false);
  const toast = useToast();

  function handleFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Selecciona un archivo de imagen.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("La imagen pesa demasiado (máx. 2MB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setPreview(dataUrl);
      onChange?.(dataUrl);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-[11px] font-bold uppercase tracking-[0.08em] text-brand-muted">
          {label}
        </label>
      )}
      <input type="hidden" name={name} value={preview ?? ""} />
      <button
        type="button"
        id={inputId}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFile(e.dataTransfer.files?.[0]);
        }}
        className={clsx(
          "relative shrink-0 overflow-hidden border-2 border-dashed flex items-center justify-center text-center transition-colors duration-150 cursor-pointer bg-tz-bone",
          SHAPE_CLASS[shape],
          sizeClassName,
          dragOver ? "border-brand-ink bg-tz-sand/60" : "border-brand-border hover:border-brand-border-hover"
        )}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- preview de imagen subida por el usuario (data URL)
          <img src={preview} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-[11px] font-semibold text-brand-muted px-2">Foto</span>
        )}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      {hint && <p className="text-xs text-brand-muted max-w-xs">{hint}</p>}
    </div>
  );
}
