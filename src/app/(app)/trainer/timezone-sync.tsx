"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const COOKIE_NAME = "tz";

/**
 * El panel calcula "sesión en curso / próxima" con la hora del navegador del
 * entrenador, no la del servidor. Si la zona detectada difiere de la que ya
 * conoce el servidor (cookie ausente o desfasada), la guarda y refresca para
 * que el siguiente render use la hora correcta.
 */
export function TimezoneSync({ current }: { current: string }) {
  const router = useRouter();

  useEffect(() => {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (detected && detected !== current) {
      document.cookie = `${COOKIE_NAME}=${detected}; path=/; max-age=31536000; samesite=lax`;
      router.refresh();
    }
  }, [current, router]);

  return null;
}
