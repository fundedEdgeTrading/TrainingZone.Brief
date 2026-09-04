import { useEffect, useState } from "react";

/**
 * Valor con retardo, para los buscadores.
 *
 * Sin esto, cada tecla cambia la clave de la consulta y dispara una petición:
 * escribir «Marta» lanzaba cinco, y como cada clave nueva arranca sin datos la
 * lista entera se caía al esqueleto entre letra y letra. El campo sigue
 * respondiendo al instante —lo que se retrasa es la consulta, no lo que se ve
 * escrito—.
 */
export function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
