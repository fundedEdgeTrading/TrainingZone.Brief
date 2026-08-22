"use client";

import { useRef, useTransition, type ReactNode } from "react";
import { useToast } from "./toast";
import { useCelebrate } from "./celebrate";

type ActionResult = { ok: true } | { ok: false; error: string };

export function ActionForm({
  action,
  children,
  className,
  successMessage,
  resetOnSuccess = true,
  celebrateOnSuccess = false,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  children: ReactNode;
  className?: string;
  successMessage: string;
  resetOnSuccess?: boolean;
  /**
   * Solo para hitos: al terminar bien, lanza la celebración además del aviso.
   * Se reserva a los cuatro momentos acordados — si celebra todo, no celebra
   * nada.
   */
  celebrateOnSuccess?: boolean;
}) {
  const [, startTransition] = useTransition();
  const toast = useToast();
  const celebrate = useCelebrate();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      className={className}
      action={(fd) => {
        startTransition(async () => {
          const result = await action(fd);
          if (result.ok) {
            toast.success(successMessage);
            if (celebrateOnSuccess) {
              const r = formRef.current?.getBoundingClientRect();
              celebrate(r ? { x: r.left + r.width / 2, y: r.top + r.height / 3 } : undefined);
            }
            if (resetOnSuccess) formRef.current?.reset();
          } else {
            toast.error(result.error);
          }
        });
      }}
    >
      {children}
    </form>
  );
}
