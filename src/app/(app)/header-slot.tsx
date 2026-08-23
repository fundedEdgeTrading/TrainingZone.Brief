"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Hueco del header para los controles y el subtítulo de la pantalla activa.
 *
 * El header lo pinta el layout y la pantalla vive dentro de `main`: sin esto,
 * un control que pertenece a una vista concreta (el selector de ciudad del mapa
 * de barrios) tendría que subir hasta el layout como prop y quedarse ahí para
 * siempre, con un `pathname === "/..."` decidiendo si se enseña. Igual el
 * subtítulo: el del layout describe la sesión ("Dirección · Toda la
 * organización") y una pantalla con estado propio (ciudad activa, nº de
 * centros) necesita poder contarlo ahí arriba.
 *
 * Se resuelve con una tiendecilla de módulo y `useSyncExternalStore`, no con un
 * contexto de React. Un proveedor tendría que envolver al header Y a `children`
 * —es decir, al layout entero—, y meter el árbol de todas las páginas dentro de
 * otro componente cliente cambia cómo se sirve: el contenido de la página pasa
 * a viajar como un hueco del stream y llega más tarde que el resto. Aquí solo
 * el header se suscribe; el resto del layout no se entera.
 */
let actionsEl: HTMLElement | null = null;
let screenSubtitle: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Ancla: la pinta el header, en el sitio donde aterrizan los controles de pantalla. */
export function HeaderActionsTarget({ className }: { className?: string }) {
  return (
    <div
      className={className}
      ref={(node) => {
        actionsEl = node;
        emit();
      }}
    />
  );
}

/** Controles de una pantalla, renderizados dentro del header. */
export function HeaderActions({ children }: { children: ReactNode }) {
  // En el primer render el ancla todavía no existe (el ref se resuelve al
  // montar): no se pinta nada, así que el HTML del servidor y el del cliente
  // coinciden y no hay desajuste de hidratación.
  const el = useSyncExternalStore(
    subscribe,
    () => actionsEl,
    () => null
  );
  return el ? createPortal(children, el) : null;
}

/** Subtítulo propio de la pantalla; al desmontarse vuelve el de la sesión. */
export function useHeaderSubtitle(subtitle: string) {
  useEffect(() => {
    screenSubtitle = subtitle;
    emit();
    return () => {
      screenSubtitle = null;
      emit();
    };
  }, [subtitle]);
}

/** Lo lee el header: si hay subtítulo de pantalla, manda sobre el de la sesión. */
export function useHeaderSubtitleOverride(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => screenSubtitle,
    () => null
  );
}
