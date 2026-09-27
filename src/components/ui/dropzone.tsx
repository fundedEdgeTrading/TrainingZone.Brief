"use client";

import { useEffect, useId, useRef, useState } from "react";
import clsx from "clsx";
import { useToast } from "./toast";
import { resizeImageFile } from "@/lib/image-resize";

type Shape = "circle" | "rounded" | "rect";

const SHAPE_CLASS: Record<Shape, string> = {
  circle: "rounded-full",
  rounded: "rounded-xl",
  rect: "rounded-xl",
};

/**
 * Zona de subida de imagen. Reescala el archivo en el navegador
 * (`resizeImageFile`: lado mayor `maxDimension`, sin EXIF) y lo deja como data
 * URL en un <input type="hidden"> con `name`, listo para viajar dentro del
 * FormData del formulario que lo envuelve. El servidor lo guarda en Postgres
 * (`resolveImageInput`, src/lib/file-store.ts) y la columna recibe
 * `/api/files/<id>`; si la imagen no se toca, se reenvía esa misma URL y el
 * servidor la deja como está.
 */
export function ImageDropzone({
  name,
  label,
  hint,
  shape = "rounded",
  defaultValue,
  sizeClassName = "w-24 h-24",
  maxDimension = 1600,
  fit = "cover",
  removable = false,
  emptyLabel = "Foto",
  tone,
  onChange,
}: {
  name: string;
  label?: string;
  hint?: string;
  shape?: Shape;
  defaultValue?: string | null;
  sizeClassName?: string;
  /** Lado mayor tras reescalar. Logos y avatares no necesitan más de 600-800. */
  maxDimension?: number;
  /** `contain` para logos: se ven enteros, sin recortar. */
  fit?: "cover" | "contain";
  /** Muestra "Quitar" para dejar el campo vacío (p. ej. volver al logo por defecto). */
  removable?: boolean;
  emptyLabel?: string;
  /**
   * Fondo FIJO de la vista previa, para logos: `light` para el logo normal y
   * `dark` para su versión de fondos oscuros, cada uno sobre el fondo en el que
   * se va a usar. Es un color fijo, no un token: con el token, en tema oscuro
   * el logo negro quedaba invisible en su propia vista previa. Sin `tone`, el
   * fondo sigue al tema (fotos).
   */
  tone?: "light" | "dark";
  onChange?: (dataUrl: string) => void;
}) {
  const inputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const hiddenRef = useRef<HTMLInputElement>(null);
  const guardRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(defaultValue ?? null);
  const [dragOver, setDragOver] = useState(false);
  const [processing, setProcessing] = useState(false);
  const toast = useToast();

  // `preview` es estado de React, así que no se entera de dos cosas que sí
  // afectan al resto del formulario:
  //   1. Un formulario reutilizado sin desmontarse (el drawer solo se oculta)
  //      que pasa un `defaultValue` nuevo al editar otro registro.
  //   2. form.reset() tras guardar, que sí limpia los inputs normales.
  // Sin esto, la vista previa —y el hidden input que viaja en el FormData— se
  // quedaban con la imagen del registro anterior y se reenviaba en el siguiente.
  const [lastDefault, setLastDefault] = useState(defaultValue ?? null);
  if (lastDefault !== (defaultValue ?? null)) {
    setLastDefault(defaultValue ?? null);
    setPreview(defaultValue ?? null);
  }

  useEffect(() => {
    const form = hiddenRef.current?.form;
    if (!form) return;
    const onReset = () => setPreview(defaultValue ?? null);
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, [defaultValue]);

  // Mientras se reescala, el formulario NO se puede enviar: el campo oculto
  // aún lleva la imagen anterior, y guardar en ese instante perdía la nueva
  // sin avisar. Un input con `setCustomValidity` hace que el propio navegador
  // bloquee el envío, sin depender de cómo gestione el submit cada formulario.
  useEffect(() => {
    guardRef.current?.setCustomValidity(processing ? "Espera a que termine de prepararse la imagen." : "");
  }, [processing]);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setProcessing(true);
    const result = await resizeImageFile(file, { maxDimension });
    setProcessing(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setPreview(result.dataUrl);
    onChange?.(result.dataUrl);
  }

  function clear() {
    setPreview(null);
    onChange?.("");
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-[11px] font-bold uppercase tracking-[0.08em] text-brand-muted">
          {label}
        </label>
      )}
      <input ref={hiddenRef} type="hidden" name={name} value={preview ?? ""} />
      <input ref={guardRef} tabIndex={-1} aria-hidden="true" className="sr-only" defaultValue="" />
      <button
        type="button"
        id={inputId}
        onClick={() => fileRef.current?.click()}
        disabled={processing}
        aria-busy={processing}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void handleFile(e.dataTransfer.files?.[0]);
        }}
        className={clsx(
          "relative shrink-0 overflow-hidden border-2 border-dashed flex items-center justify-center text-center transition-colors duration-150 cursor-pointer bg-tz-bone",
          SHAPE_CLASS[shape],
          sizeClassName,
          tone === "dark" && "!bg-[#201f1c]",
          tone === "light" && "!bg-[#f4f0e8]",
          dragOver ? "border-brand-ink bg-tz-sand/60" : "border-brand-border hover:border-brand-border-hover"
        )}
      >
        {processing ? (
          <span className={clsx("text-[11px] font-semibold px-2", tone === "dark" ? "text-[#b8b2a4]" : tone === "light" ? "text-[#8a8574]" : "text-brand-muted")}>
            Preparando…
          </span>
        ) : preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- vista previa: data URL recién elegida o `/api/files/<id>`
          <img src={preview} alt="" className={clsx("w-full h-full", fit === "contain" ? "object-contain p-2" : "object-cover")} />
        ) : (
          <span className={clsx("text-[11px] font-semibold px-2", tone === "dark" ? "text-[#b8b2a4]" : tone === "light" ? "text-[#8a8574]" : "text-brand-muted")}>
            {emptyLabel}
          </span>
        )}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
      {removable && preview && !processing && (
        <button
          type="button"
          onClick={clear}
          className="self-start text-xs font-semibold text-brand-muted underline underline-offset-2 hover:text-brand-ink"
        >
          Quitar
        </button>
      )}
      {hint && <p className="text-xs text-brand-muted max-w-xs">{hint}</p>}
    </div>
  );
}
