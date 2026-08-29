"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { openAssessmentAction } from "./actions";

/**
 * Apertura manual de un hito. El cron del aniversario (F4) abre los suyos solo;
 * esto es para la valoración inicial y para adelantar una revisión.
 */
export function OpenAssessmentButton({
  memberId,
  milestoneKey,
  label,
  variant = "secondary",
}: {
  memberId: string;
  /** Clave del hito en la configuración del centro: "INITIAL", "M6", "M18"… */
  milestoneKey: string;
  label: string;
  variant?: "primary" | "secondary";
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant={variant}
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await openAssessmentAction(memberId, milestoneKey);
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          router.push(`/members/${memberId}/valoraciones/${result.assessmentId}`);
        })
      }
    >
      {label}
    </Button>
  );
}
