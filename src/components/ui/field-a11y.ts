/**
 * Cálculo puro de la a11y de `Field` (E8-02).
 *
 * Vive fuera de `field.tsx` porque el runner de unitarias es `tsx --test` sobre
 * `src/**\/*.test.ts`: no monta React ni DOM. Sacando aquí la parte que decide
 * *qué* ids se generan y *cómo* se encadenan, la regla queda probada aunque el
 * render no lo esté.
 */

/** Elementos a los que tiene sentido apuntar con `htmlFor` e inyectar un `id`. */
export const LABELABLE_TAGS = ["input", "select", "textarea", "button", "meter", "output", "progress"] as const;

export type FieldA11y = {
  /** Id que va al control y al `htmlFor` de la etiqueta. */
  controlId: string;
  /** Id del `<p>` de error, solo si hay error. */
  errorId?: string;
  /** Id del `<p>` de ayuda, solo si se pinta (no hay error y sí hint). */
  hintId?: string;
  /** Id de la propia etiqueta: se usa en el camino `role="group"`. */
  labelId: string;
  /** `aria-invalid` para el control; `undefined` cuando no hay error. */
  invalid?: true;
};

/**
 * Deriva los ids de un `Field` a partir del id base de `useId()`.
 *
 * Error y ayuda son excluyentes en el render (el error tapa al hint), así que
 * `hintId` solo existe cuando el hint es lo que realmente se pinta: apuntar con
 * `aria-describedby` a un nodo que no está en el DOM deja al lector de pantalla
 * sin anunciar nada.
 */
export function fieldA11y(baseId: string, opts: { error?: string; hint?: string } = {}): FieldA11y {
  const hasError = Boolean(opts.error);
  const showsHint = !hasError && Boolean(opts.hint);
  return {
    controlId: `${baseId}-control`,
    labelId: `${baseId}-label`,
    errorId: hasError ? `${baseId}-error` : undefined,
    hintId: showsHint ? `${baseId}-hint` : undefined,
    invalid: hasError ? true : undefined,
  };
}

/**
 * Encadena ids en un `aria-describedby` sin perder los que el call-site ya
 * había puesto a mano y sin repetirlos. Devuelve `undefined` cuando no queda
 * ninguno, para no emitir un atributo vacío.
 */
export function mergeDescribedBy(...parts: (string | undefined | null | false)[]): string | undefined {
  const ids: string[] = [];
  for (const part of parts) {
    if (!part) continue;
    for (const id of String(part).split(/\s+/)) {
      if (id && !ids.includes(id)) ids.push(id);
    }
  }
  return ids.length > 0 ? ids.join(" ") : undefined;
}
