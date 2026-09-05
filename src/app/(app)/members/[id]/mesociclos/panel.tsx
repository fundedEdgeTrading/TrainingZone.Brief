"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { BrandLoader, MESOCYCLE_STEPS, usePacedLoader } from "@/components/ui/brand-loader";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { EP_PROFILES, EP_PROFILE_LABEL, DEFAULT_PROFILE, type EpProfile } from "@/lib/ai/ep-profile";
import { generateMesocycleAction } from "./actions";

/**
 * Duración esperada de la generación completa (medida: 60-120 s). Solo reparte
 * los pasos por la barra: el nivel se para al 92 % de cada tramo y no se mueve
 * de ahí hasta que el paso siguiente entra, así que pasarse de optimista no
 * inventa progreso, únicamente deja la frase quieta un rato más.
 */
const EXPECTED_MS = 95_000;

export const MESOCYCLE_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Borrador",
  APPROVED: "Aprobado",
  ARCHIVED: "Archivado",
};

export const MESOCYCLE_STATUS_TONE: Record<string, BadgeTone> = {
  DRAFT: "warning",
  APPROVED: "good",
  ARCHIVED: "neutral",
};

export type MesocycleSummary = {
  id: string;
  title: string;
  status: string;
  profile: EpProfile;
  createdAt: Date;
  approvedAt: Date | null;
};

export function MesocyclePanel({
  memberId,
  mesocycles,
  aiConfigured,
}: {
  memberId: string;
  mesocycles: MesocycleSummary[];
  aiConfigured: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [profile, setProfile] = useState<EpProfile>(DEFAULT_PROFILE);
  const [level, setLevel] = useState("");
  const [weeks, setWeeks] = useState("8");
  const [availability, setAvailability] = useState("");
  // El velo no cuelga de `pending`: la transición termina en cuanto la acción
  // resuelve, y entonces el nivel completo y el check no llegarían a verse.
  const loader = usePacedLoader(MESOCYCLE_STEPS, EXPECTED_MS);

  function generate() {
    loader.start();

    startTransition(async () => {
      const result = await generateMesocycleAction(memberId, {
        profile,
        level,
        weeks: Number(weeks),
        availability,
      });

      if (!result.ok) {
        // El error lo cuenta el toast, como en el resto de la app: el loader no
        // tiene estado de error propio.
        loader.abort();
        toast.error(result.error);
        return;
      }

      loader.finish(() => {
        toast.success("Borrador generado. Revísalo antes de aprobarlo.");
        router.push(`/members/${memberId}/mesociclos/${result.mesocycleId}`);
      });
    });
  }

  return (
    <div className="space-y-6">
      <section className="border border-brand-border rounded-card p-4 space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Generar mesociclo</h3>
          <p className="text-xs text-brand-muted mt-1">
            La IA recibe edad, sexo, objetivos, marcas y —solo con consentimiento de tratamiento por IA— los
            criterios clínicos del screening. Nunca nombre, DNI, teléfono ni email. El plan nace en borrador y
            no vale hasta que lo apruebes.
          </p>
        </div>

        <Field label="Grupo Training Zone" hint="Decide la metodología con la que programa la IA.">
          <Select value={profile} onChange={(e) => setProfile(e.target.value as EpProfile)}>
            {EP_PROFILES.map((p) => (
              <option key={p} value={p}>
                {EP_PROFILE_LABEL[p]}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nivel de partida" hint="Déjalo vacío para tomarlo de la valoración inicial.">
            <Input value={level} onChange={(e) => setLevel(e.target.value)} placeholder="Sin entrenar desde la lesión" />
          </Field>
          <Field label="Semanas" hint="De 4 a 12.">
            <Input type="number" min={4} max={12} value={weeks} onChange={(e) => setWeeks(e.target.value)} />
          </Field>
        </div>

        <Field label="Disponibilidad" hint="Un día por línea, con el sitio donde entrena: «Lunes TZ», «Martes Gym»...">
          <Textarea rows={4} value={availability} onChange={(e) => setAvailability(e.target.value)} />
        </Field>

        {!aiConfigured && (
          <p className="text-xs text-critical">
            La generación con IA no está configurada en este entorno (falta ANTHROPIC_API_KEY).
          </p>
        )}

        <Button disabled={pending || loader.loading || !aiConfigured} onClick={generate}>
          {pending || loader.loading ? "Generando..." : "Generar borrador"}
        </Button>
      </section>

      {loader.loading && <BrandLoader steps={MESOCYCLE_STEPS} step={loader.step} done={loader.done} />}

      {mesocycles.length === 0 ? (
        <p className="text-sm text-brand-muted">Este socio todavía no tiene mesociclos.</p>
      ) : (
        <ul className="space-y-2">
          {mesocycles.map((m) => (
            <li key={m.id}>
              <Link
                href={`/members/${memberId}/mesociclos/${m.id}`}
                className="flex items-center justify-between gap-3 border border-brand-border rounded-lg p-3 text-sm hover:border-brand-ink transition-colors duration-200"
              >
                <span>
                  <span className="font-semibold">{m.title}</span>
                  <span className="text-xs text-brand-muted block">
                    {EP_PROFILE_LABEL[m.profile]} · {m.createdAt.toLocaleDateString("es-ES")}
                    {m.approvedAt && ` · aprobado el ${m.approvedAt.toLocaleDateString("es-ES")}`}
                  </span>
                </span>
                <Badge tone={MESOCYCLE_STATUS_TONE[m.status]}>{MESOCYCLE_STATUS_LABEL[m.status]}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
