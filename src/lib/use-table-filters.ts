"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { parseFilterValues } from "@/lib/filter-params";

/** Valores elegidos por eje. Dentro de un eje se combinan con OR. */
export type FilterSelection = Record<string, string[]>;

/** Retardo de la búsqueda: escribir en la URL en cada tecla dispara una query. */
const SEARCH_DEBOUNCE_MS = 220;

/**
 * Filtros de tabla con la URL como fuente de verdad: un filtro es compartible y
 * sobrevive al refresco. Se escribe con `router.replace(..., { scroll: false })`
 * dentro de `startTransition` — no `push`: filtrar no debe llenar el historial,
 * y sin `scroll: false` cada cambio saltaría al principio de la página.
 *
 * Todos los ejes son multi-valor y viajan separados por coma
 * (`?state=ACTIVE,TRIAL&centerId=abc`). Entre ejes se combinan con AND.
 *
 * Cualquier cambio resetea la paginación de servidor (`page`); la de cliente la
 * resetea `DataTable` al cambiar la referencia de `rows`.
 */
export function useTableFilters(axes: string[], searchName = "q") {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const axesKey = axes.join("|");
  const values = useMemo(() => {
    const out: FilterSelection = {};
    for (const name of axesKey.split("|").filter(Boolean)) {
      out[name] = parseFilterValues(searchParams.get(name));
    }
    return out;
  }, [searchParams, axesKey]);

  const urlQuery = searchParams.get(searchName) ?? "";

  const write = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const next = new URLSearchParams(searchParams.toString());
      mutate(next);
      next.delete("page");
      const qs = next.toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [router, pathname, searchParams],
  );

  // La búsqueda se escribe con retardo, así que su valor vive también en local.
  // `lastWritten` distingue "lo he cambiado yo" de "ha cambiado la URL por
  // fuera" (limpiar filtros, atrás del navegador, enlace compartido).
  const [draftQuery, setDraftQuery] = useState(urlQuery);
  const lastWritten = useRef(urlQuery);
  useEffect(() => {
    if (urlQuery !== lastWritten.current) {
      lastWritten.current = urlQuery;
      setDraftQuery(urlQuery);
    }
  }, [urlQuery]);

  useEffect(() => {
    if (draftQuery === lastWritten.current) return;
    const timer = setTimeout(() => {
      lastWritten.current = draftQuery;
      write((params) => {
        if (draftQuery.trim()) params.set(searchName, draftQuery.trim());
        else params.delete(searchName);
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draftQuery, searchName, write]);

  const toggle = useCallback(
    (axis: string, value: string) => {
      const current = parseFilterValues(searchParams.get(axis));
      const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
      write((params) => {
        if (next.length) params.set(axis, next.join(","));
        else params.delete(axis);
      });
    },
    [searchParams, write],
  );

  /** Ejes de selección única (p. ej. el orden de un listado). */
  const setAxis = useCallback(
    (axis: string, value: string | null) => {
      write((params) => {
        if (value) params.set(axis, value);
        else params.delete(axis);
      });
    },
    [write],
  );

  /**
   * Varios ejes en una sola escritura. Dos llamadas seguidas a `setAxis` en el
   * mismo tick partirían de la misma URL y la segunda pisaría a la primera: un
   * rango de fechas («desde» y «hasta») tiene que viajar junto.
   */
  const setValues = useCallback(
    (patch: Record<string, string | null>) => {
      write((params) => {
        for (const [axis, value] of Object.entries(patch)) {
          if (value) params.set(axis, value);
          else params.delete(axis);
        }
      });
    },
    [write],
  );

  const clearAxis = useCallback(
    (axis: string) => {
      write((params) => params.delete(axis));
    },
    [write],
  );

  const clearAll = useCallback(() => {
    lastWritten.current = "";
    setDraftQuery("");
    write((params) => {
      for (const name of axesKey.split("|").filter(Boolean)) params.delete(name);
      params.delete(searchName);
    });
  }, [write, axesKey, searchName]);

  const activeCount = Object.values(values).reduce((n, list) => n + list.length, 0) + (urlQuery ? 1 : 0);

  /**
   * Cambia con cada filtro aplicado. Se usa como `key` del barrido dorado para
   * relanzar su animación (misma técnica que `sortRun` en `DataTable`), y sirve
   * igual desde la barra que desde la cabecera de una columna: no hay contador
   * que compartir entre componentes.
   */
  const filterKey = useMemo(
    () =>
      [urlQuery, ...axesKey.split("|").filter(Boolean).map((n) => `${n}=${(values[n] ?? []).join(",")}`)].join("&"),
    [urlQuery, axesKey, values],
  );

  return {
    values,
    query: draftQuery,
    setQuery: setDraftQuery,
    toggle,
    setAxis,
    setValues,
    clearAxis,
    clearAll,
    activeCount,
    hasFilters: activeCount > 0,
    isPending,
    filterKey,
  };
}
