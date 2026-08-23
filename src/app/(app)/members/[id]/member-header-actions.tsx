"use client";

import { Button } from "@/components/ui/button";
import { useSectionNav } from "./section-rail";

/**
 * Acciones de la cabecera del socio. Ninguna abre nada por su cuenta: llevan a
 * la sección donde ya vive esa interacción y le piden el foco (el drawer de
 * datos y el composer de la bitácora siguen siendo los de siempre).
 */
export function EditMemberDataButton() {
  const nav = useSectionNav();
  return (
    <Button type="button" variant="secondary" onClick={() => nav.go("socio", "edit")}>
      Editar datos
    </Button>
  );
}

export function NewNoteButton() {
  const nav = useSectionNav();
  return (
    <Button type="button" onClick={() => nav.go("actividad", "note")}>
      Nueva nota
    </Button>
  );
}
