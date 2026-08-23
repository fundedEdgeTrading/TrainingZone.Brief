"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { ThemePreference } from "@prisma/client";

import { Card } from "@/components/kpi-card";
import { useToast } from "@/components/ui/toast";

import { updateMyThemeAction } from "./actions";

/** Cuánto se queda a la vista el chip "Guardado en tu cuenta". */
const SAVED_CHIP_MS = 2800;

/**
 * Los colores de las miniaturas son literales a propósito: cada ficha dibuja
 * SU tema, no el que esté puesto. La miniatura oscura tiene que verse oscura
 * mientras se está en claro — si usara tokens, las dos se verían iguales.
 */
const PREVIEW = {
  LIGHT: {
    frame: "#d8ccb8",
    bg: "#f4f0e8",
    sidebar: "#e7dfd2",
    sidebarBorder: "#d8ccb8",
    header: "#ffffff",
    headerBorder: "#d8ccb8",
    line: "#ffffff",
    lineBorder: "#e7dfd2",
    navActive: "#1d1d1c",
    navIdle: "#c7bfad",
  },
  DARK: {
    frame: "#35342e",
    bg: "#1c1b19",
    sidebar: "#201f1c",
    sidebarBorder: "#33322c",
    header: "#24231f",
    headerBorder: "#35342e",
    line: "#24231f",
    lineBorder: "#35342e",
    navActive: "#f0ece3",
    navIdle: "#4a4840",
  },
} satisfies Record<ThemePreference, Record<string, string>>;

const COPY: Record<ThemePreference, { name: string; caption: string }> = {
  LIGHT: { name: "Claro", caption: "Hueso y negro de marca. El de siempre." },
  DARK: { name: "Oscuro", caption: "Carbón cálido. Mismo contraste, menos brillo." },
};

function CheckIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function ThemePreview({ theme }: { theme: ThemePreference }) {
  const c = PREVIEW[theme];
  return (
    <div
      className="flex h-[74px] rounded-[9px] overflow-hidden border"
      style={{ borderColor: c.frame, background: c.bg }}
      aria-hidden="true"
    >
      <div
        className="w-[34px] shrink-0 flex flex-col gap-[5px] px-[5px] py-[7px] border-r"
        style={{ background: c.sidebar, borderColor: c.sidebarBorder }}
      >
        <span className="h-[5px] rounded-[2px]" style={{ background: c.navActive }} />
        <span className="h-[5px] rounded-[2px]" style={{ background: c.navIdle }} />
        <span className="h-[5px] rounded-[2px]" style={{ background: c.navIdle }} />
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        <div
          className="h-4 border-b"
          style={{ background: c.header, borderColor: c.headerBorder }}
        />
        <div className="flex-1 flex flex-col gap-[5px] p-[7px]">
          <span
            className="h-[15px] rounded-[3px] border"
            style={{ background: c.line, borderColor: c.lineBorder }}
          />
          <span
            className="h-[15px] rounded-[3px] border"
            style={{ background: c.line, borderColor: c.lineBorder }}
          />
        </div>
      </div>
    </div>
  );
}

function ThemeTile({
  theme,
  selected,
  disabled,
  onSelect,
}: {
  theme: ThemePreference;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const { name, caption } = COPY[theme];
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
      className={`p-3.5 rounded-[14px] border-2 text-left transition-[border-color,background-color,box-shadow] duration-200 disabled:cursor-not-allowed ${
        selected
          ? "border-brand-ink bg-tz-bone ring-[3px] ring-tz-black/10"
          : "border-brand-border bg-transparent hover:border-brand-border-hover"
      }`}
    >
      <ThemePreview theme={theme} />
      <div className="flex items-center justify-between gap-2 mt-[11px]">
        <span className="text-sm font-bold text-brand-text">{name}</span>
        <span
          className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
            selected
              ? "bg-brand-ink text-tz-bone"
              : "border-[1.5px] border-brand-border text-transparent"
          }`}
          aria-hidden="true"
        >
          <CheckIcon />
        </span>
      </div>
      <p className="text-xs text-brand-muted mt-1 leading-snug">{caption}</p>
    </button>
  );
}

/**
 * Tarjeta "Apariencia" del perfil. Sin botón de guardar y sin diálogo: el
 * patrón es el de `EmailPreferenceToggle`, efecto inmediato.
 *
 * El cambio es optimista sobre `document.documentElement` para que el tema
 * responda en el mismo fotograma del clic; el HTML definitivo lo sigue
 * escribiendo el servidor (la acción revalida el layout). Si la acción falla se
 * revierte el atributo y se avisa.
 */
export function ThemeCard({ theme }: { theme: ThemePreference }) {
  const [current, setCurrent] = useState<ThemePreference>(theme);
  const [serverTheme, setServerTheme] = useState<ThemePreference>(theme);
  const [justSaved, setJustSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useToast();

  useEffect(() => {
    return () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, []);

  // El servidor manda: si el layout se revalida con otro valor (otra pestaña,
  // otro dispositivo), la tarjeta se pone al día. Ajuste en render y no en un
  // efecto — es el patrón de React para reaccionar al cambio de una prop, y
  // evita el fotograma intermedio con el valor viejo.
  if (theme !== serverTheme) {
    setServerTheme(theme);
    setCurrent(theme);
  }

  function apply(next: ThemePreference) {
    document.documentElement.dataset.theme = next === "DARK" ? "dark" : "light";
  }

  function select(next: ThemePreference) {
    if (next === current || pending) return;

    const previous = current;
    setCurrent(next);
    apply(next);

    startTransition(async () => {
      const result = await updateMyThemeAction(next);
      if (result.ok) {
        setJustSaved(true);
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setJustSaved(false), SAVED_CHIP_MS);
      } else {
        setCurrent(previous);
        apply(previous);
        toast.error("No se pudo guardar el tema.");
      }
    });
  }

  return (
    <Card
      title="Apariencia"
      meta="Nuevo"
      action={
        justSaved ? (
          <span
            role="status"
            className="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-good bg-good-bg rounded-full px-2.5 py-1"
          >
            <CheckIcon />
            Guardado en tu cuenta
          </span>
        ) : undefined
      }
    >
      <p className="text-[13px] text-brand-muted -mt-3 mb-4 leading-relaxed">
        Elige cómo quieres ver Training Zone. El tema se aplica a toda la aplicación y se guarda en tu
        cuenta: la próxima vez que entres, desde cualquier dispositivo, se abrirá así.
      </p>

      <div className="grid grid-cols-2 gap-3.5">
        <ThemeTile
          theme="LIGHT"
          selected={current === "LIGHT"}
          disabled={pending}
          onSelect={() => select("LIGHT")}
        />
        <ThemeTile
          theme="DARK"
          selected={current === "DARK"}
          disabled={pending}
          onSelect={() => select("DARK")}
        />
      </div>

      <div className="flex items-start gap-2.5 border-t border-tz-sand pt-3.5 mt-4">
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-brand-faint)"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 mt-px"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5M12 7.6v.6" />
        </svg>
        <p className="text-xs text-brand-faint leading-relaxed">
          Se guarda al instante en tu perfil, no en este navegador. Los correos y los documentos que
          descargues siguen en claro.
        </p>
      </div>
    </Card>
  );
}
