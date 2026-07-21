"use client";

import { useRef, useState, useTransition } from "react";
import { createProgressEntry, importTanitaText } from "./actions";
import { ImageDropzone } from "@/components/ui/dropzone";
import { Button, ButtonSpinner } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

const NUM_INPUT = "w-full rounded-control border border-brand-border px-3.5 py-2.5 text-sm focus:border-brand-ink focus:outline-none";
const NUM_LABEL = "block text-[11px] font-bold uppercase tracking-[0.08em] text-brand-muted mb-1.5";

function NumField({ name, label, step = "0.1" }: { name: string; label: string; step?: string }) {
  return (
    <div>
      <label className={NUM_LABEL}>{label}</label>
      <input name={name} type="number" step={step} className={NUM_INPUT} />
    </div>
  );
}

export function AddProgressEntryForm({ memberId }: { memberId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const toast = useToast();

  if (!open) {
    return (
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[13px] text-muted max-w-md">
          Peso, composición corporal (bioimpedancia) y fotos de evolución. Las métricas requieren consentimiento
          de datos de salud; las fotos, consentimiento de uso de imágenes. Visibles solo para el socio y su
          entrenador asignado.
        </p>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          + Nuevo registro
        </Button>
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      action={(fd) =>
        startTransition(async () => {
          const result = await createProgressEntry(fd);
          if (result.ok) {
            formRef.current?.reset();
            setOpen(false);
            toast.success("Registro de evolución guardado.");
          } else {
            toast.error(result.error);
          }
        })
      }
      className="border border-tz-linen rounded-xl p-5 flex flex-col gap-4"
    >
      <input type="hidden" name="memberId" value={memberId} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <NumField name="weightKg" label="Peso (kg)" />
        <NumField name="bodyFatPct" label="% graso" />
        <NumField name="waistCm" label="Cintura (cm)" step="0.5" />
      </div>

      <div>
        <div className="font-display font-bold text-[11px] tracking-[.16em] uppercase text-brand-muted mb-2">
          Composición corporal (bioimpedancia, opcional)
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <NumField name="muscleMassKg" label="Masa muscular (kg)" />
          <NumField name="fatMassKg" label="Masa grasa (kg)" />
          <NumField name="fatFreeMassKg" label="Masa magra (kg)" />
          <NumField name="boneMassKg" label="Masa ósea (kg)" />
          <NumField name="bodyWaterPct" label="Agua corporal (%)" />
          <NumField name="visceralFatRating" label="Grasa visceral" step="1" />
          <NumField name="bmrKcal" label="BMR (kcal)" step="1" />
          <NumField name="metabolicAge" label="Edad metabólica" step="1" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <ImageDropzone name="photoFrontUrl" label="Frente" shape="rounded" sizeClassName="w-full h-[180px]" />
        <ImageDropzone name="photoSideUrl" label="Perfil" shape="rounded" sizeClassName="w-full h-[180px]" />
        <ImageDropzone name="photoBackUrl" label="Espalda" shape="rounded" sizeClassName="w-full h-[180px]" />
      </div>
      <div className="flex justify-end gap-2.5">
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <ButtonSpinner />}
          {pending ? "Guardando..." : "Guardar registro"}
        </Button>
      </div>
    </form>
  );
}

// CC5 — la app My Tanita no exporta CSV, solo comparte un texto. El entrenador lo pega aquí tal
// cual y src/lib/tanita-parse.ts lo interpreta en el servidor (docs/COMPOSICION_CORPORAL_
// IMPLEMENTACION.md).
export function TanitaPasteImportForm({ memberId }: { memberId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const toast = useToast();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[13px] font-semibold text-brand-ink underline underline-offset-2 hover:opacity-80 transition-opacity"
      >
        Importar desde My Tanita (pegar texto)
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={(fd) =>
        startTransition(async () => {
          const result = await importTanitaText(fd);
          if (result.ok) {
            formRef.current?.reset();
            setOpen(false);
            toast.success("Medición Tanita importada.");
          } else {
            toast.error(result.error);
          }
        })
      }
      className="border border-tz-linen rounded-xl p-5 flex flex-col gap-3"
    >
      <input type="hidden" name="memberId" value={memberId} />
      <label className={NUM_LABEL}>Texto compartido por la app My Tanita</label>
      <textarea
        name="rawText"
        required
        rows={8}
        placeholder={"Acabo de realizar una medición en TANITA...\n* Peso: 68,55 kg\n* Grasa corporal: 14,9 %\n..."}
        className="w-full rounded-control border border-brand-border px-3.5 py-2.5 text-sm font-mono focus:border-brand-ink focus:outline-none"
      />
      <p className="text-xs text-brand-muted">
        Pega el texto completo tal cual lo comparte la app (botón &ldquo;Compartir&rdquo; en My Tanita). Se
        reconocen peso, IMC, % graso, masa muscular, calidad muscular, masa ósea, grasa visceral, TMB, edad
        metabólica, agua corporal y el desglose por tronco/brazos/piernas.
      </p>
      <div className="flex justify-end gap-2.5">
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <ButtonSpinner />}
          {pending ? "Importando..." : "Importar medición"}
        </Button>
      </div>
    </form>
  );
}

type Entry = {
  id: string;
  date: Date;
  weightKg: number | null;
  bodyFatPct: number | null;
  photoFrontUrl: string | null;
};

function metrics(e?: Entry) {
  if (!e) return "—";
  const parts = [];
  if (e.weightKg != null) parts.push(`${e.weightKg} kg`);
  if (e.bodyFatPct != null) parts.push(`${e.bodyFatPct} %`);
  return parts.length ? parts.join(" · ") : "—";
}

export function ProgressComparator({ entries }: { entries: Entry[] }) {
  const withPhoto = entries.filter((e) => e.photoFrontUrl);
  const [pct, setPct] = useState(50);

  if (withPhoto.length < 2) return null;

  const after = withPhoto[0]; // más reciente (orden desc)
  const before = withPhoto[withPhoto.length - 1]; // más antiguo

  return (
    <div className="border border-tz-linen rounded-xl p-5">
      <div className="font-display font-bold text-[11px] tracking-[.16em] uppercase text-brand-muted mb-1">
        Comparador antes / después
      </div>
      <p className="text-[13px] text-muted mb-3.5">Desliza para comparar la foto de frente más antigua con la más reciente.</p>
      <div className="relative h-[380px] max-w-[520px] mx-auto rounded-xl overflow-hidden bg-tz-sand">
        <div className="absolute inset-0">
          {/* eslint-disable-next-line @next/next/no-img-element -- foto de evolución subida por el usuario */}
          <img src={before.photoFrontUrl!} alt="Antes" className="w-full h-full object-cover" />
        </div>
        <div className="absolute inset-0 pointer-events-none" style={{ clipPath: `inset(0 0 0 ${pct}%)` }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- foto de evolución subida por el usuario */}
          <img src={after.photoFrontUrl!} alt="Después" className="w-full h-full object-cover" />
        </div>
        <div
          className="absolute top-0 bottom-0 w-[3px] bg-tz-bone pointer-events-none"
          style={{ left: `${pct}%`, boxShadow: "0 0 0 1px rgba(29,29,28,.25)" }}
        />
        <span className="absolute top-3 left-3 rounded-pill bg-tz-black/75 text-tz-bone px-3 py-1 text-[11px] font-bold uppercase tracking-[0.06em] pointer-events-none">
          Antes
        </span>
        <span className="absolute top-3 right-3 rounded-pill bg-tz-black/75 text-tz-bone px-3 py-1 text-[11px] font-bold uppercase tracking-[0.06em] pointer-events-none">
          Después
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={pct}
        onChange={(e) => setPct(Number(e.target.value))}
        aria-label="Posición del comparador"
        className="w-full max-w-[520px] block mx-auto mt-3.5 accent-tz-black"
      />
      <div className="flex justify-between max-w-[520px] mx-auto mt-1.5 text-xs text-muted tz-nums">
        <span>{metrics(before)}</span>
        <span>{metrics(after)}</span>
      </div>
    </div>
  );
}
