"use client";

import { useRef, useTransition, type ReactNode } from "react";
import { useToast } from "./toast";

type ActionResult = { ok: true } | { ok: false; error: string };

export function ActionForm({
  action,
  children,
  className,
  successMessage,
  resetOnSuccess = true,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  children: ReactNode;
  className?: string;
  successMessage: string;
  resetOnSuccess?: boolean;
}) {
  const [, startTransition] = useTransition();
  const toast = useToast();
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
