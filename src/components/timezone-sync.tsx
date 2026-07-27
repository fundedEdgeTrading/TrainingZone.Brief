"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const COOKIE_NAME = "tz";

/**
 * La app calcula "sesión en curso", "faltan X minutos" o el día de hoy con la
 * hora del usuario, no la del servidor (que corre en UTC). Este componente
 * guarda la zona detectada por el navegador en una cookie y refresca para que
 * el siguiente render del servidor use la hora correcta.
 *
 * Va en el layout de la app —no en una sola página— porque el desfase afecta
 * igual al panel del entrenador, al portal del socio, a la agenda y al fichaje.
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
