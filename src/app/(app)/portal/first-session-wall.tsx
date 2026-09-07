"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { Button, ButtonSpinner } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { ESSENTIAL_PROFILE_FIELDS, type EssentialProfileField } from "@/lib/member-first-session";
import { completeEssentialProfileAction } from "./first-session-actions";

/**
 * F-ALTA: el muro de la primera sesión del socio.
 *
 * E5-08 lo redujo a lo que el servicio necesita de verdad para entrenar con
 * seguridad: edad, contacto de emergencia y una declaración de salud mínima.
 * Antes pedía siete campos de perfil y además la valoración inicial entera,
 * con el código postal ahí solo para alimentar el mapa de calor por barrios
 * del cuadro de mando — bloquear la reserva para eso era el problema. El
 * resto del perfil (CP, domicilio, teléfono) se pide después desde
 * `/portal/perfil`, sin bloquear; la valoración inicial se pospone con
 * `PendingAssessmentGate` (que sí tiene salida) en vez de vivir aquí.
 *
 * Sigue sin salir a un portal navegable por debajo (un modal superpuesto
 * dejaría el resto de la app accesible con el tabulador), pero ya no depende
 * solo de "cerrar sesión": quien no puede rellenarlo ahora mismo puede pedir
 * ayuda a su centro directamente desde aquí.
 */

function Shell({
  eyebrow,
  title,
  intro,
  orgLogoUrl,
  orgName,
  centerPhone,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  orgLogoUrl: string;
  orgName: string;
  /** E5-08: la salida que no es cerrar sesión — hablar con el centro. */
  centerPhone?: string | null;
  children: React.ReactNode;
}) {
  return (
    // Cubre la pantalla entera, cabecera y menú incluidos. El layout de la app
    // envuelve también al portal, así que sin `fixed` el muro salía como un
    // panel oscuro encajado entre el menú lateral y el bono del socio: seguía
    // bloqueando —todas las rutas del socio cuelgan de /portal y vuelven a
    // pintarlo— pero no se leía como un muro, sino como una pantalla rota.
    <div className="fixed inset-0 z-[100] bg-tz-black overflow-y-auto flex items-start justify-center px-4 py-10">
      <div className="fixed inset-0 pointer-events-none" aria-hidden="true">
        <div className="tz-aurora-blob tz-aurora-a" />
        <div className="tz-aurora-blob tz-aurora-b" />
      </div>
      <div className="relative z-10 w-full max-w-[560px] my-auto tz-fade-up">
        <div className="text-center mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element -- logo dinámico por organización */}
          <img src={orgLogoUrl} alt={orgName} className="h-[34px] w-auto object-contain inline-block" />
        </div>

        <div className="bg-white border border-tz-linen rounded-card shadow-pop p-9">
          <div className="font-display font-bold text-[11px] tracking-[.16em] uppercase text-muted">{eyebrow}</div>
          <h2 className="font-display font-extrabold text-2xl uppercase tracking-[-.01em] mt-1.5">{title}</h2>
          <p className="text-sm text-muted mt-2 mb-5">{intro}</p>
          {children}
        </div>

        {/* E5-08: la salida que no es cerrar sesión. Si algo bloquea (no tiene a
            quién poner de contacto de emergencia ahora mismo, por ejemplo), el
            centro puede resolverlo por él sin dejarlo encerrado. */}
        <p className="text-center text-xs text-muted mt-4.5">
          {centerPhone ? (
            <>
              ¿Algo no encaja?{" "}
              <a href={`tel:${centerPhone}`} className="text-faint underline">
                Llama a tu centro
              </a>{" "}
              ·{" "}
            </>
          ) : null}
          <button type="button" onClick={() => signOut({ callbackUrl: "/login" })} className="text-faint underline">
            Cerrar sesión
          </button>
        </p>
      </div>
    </div>
  );
}

function EssentialProfileStep({
  missing,
  needsHealthDeclaration,
  orgLogoUrl,
  orgName,
  centerPhone,
}: {
  missing: EssentialProfileField[];
  needsHealthDeclaration: boolean;
  orgLogoUrl: string;
  orgName: string;
  centerPhone?: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fields = ESSENTIAL_PROFILE_FIELDS.filter((f) => missing.includes(f.key));

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await completeEssentialProfileAction(new FormData(e.currentTarget));
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <Shell
      eyebrow="Antes de tu primera sesión"
      title="Nos faltan un par de datos"
      intro="Solo lo justo para entrenar contigo con seguridad. El resto (dirección, código postal…) te lo pedimos luego, sin prisa, desde tu perfil."
      orgLogoUrl={orgLogoUrl}
      orgName={orgName}
      centerPhone={centerPhone}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
        {fields.map((f) => (
          <Field key={f.key} label={f.label} hint={f.why}>
            {/* `Field` pinta su <label> sin `htmlFor`, así que sin esto el lector
                de pantalla anuncia una caja de texto sin nombre — y este muro no
                se puede saltar. */}
            {f.key === "birthDate" ? (
              <Input aria-label={f.label} name={f.key} type="date" required max={new Date().toISOString().slice(0, 10)} />
            ) : (
              <Input aria-label={f.label} name={f.key} required placeholder="Nombre y teléfono" />
            )}
          </Field>
        ))}

        {needsHealthDeclaration && (
          <Field
            label="¿Alguna lesión, patología o medicación que debamos conocer?"
            hint='Si no tienes ninguna, escribe "Ninguna". Solo lo ve tu entrenador y queda protegido como dato de salud (Art. 9 RGPD).'
          >
            <Textarea aria-label="Declaración de salud" name="healthDeclaration" required rows={3} />
          </Field>
        )}

        {error && <p className="text-sm text-critical bg-critical-bg rounded-control px-3 py-2">{error}</p>}

        <Button type="submit" size="lg" disabled={pending} className="mt-1.5">
          {pending && <ButtonSpinner />}
          {pending ? "Guardando..." : "Continuar →"}
        </Button>
      </form>
    </Shell>
  );
}

export function FirstSessionWall({
  missing,
  needsHealthDeclaration,
  orgLogoUrl,
  orgName,
  centerPhone,
}: {
  missing: EssentialProfileField[];
  needsHealthDeclaration: boolean;
  orgLogoUrl: string;
  orgName: string;
  centerPhone?: string | null;
}) {
  return (
    <EssentialProfileStep
      missing={missing}
      needsHealthDeclaration={needsHealthDeclaration}
      orgLogoUrl={orgLogoUrl}
      orgName={orgName}
      centerPhone={centerPhone}
    />
  );
}
